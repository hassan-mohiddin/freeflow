import { createHash } from "node:crypto";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import {
  approximateTokens,
  defaultJsonRunReportPath,
  escapeMarkdownTableCell as escapeTable,
  formatPercent,
  latencySummary,
  normalizeIterations,
  parseBenchmarkCliArgs,
  reductionPercent,
  writeBenchmarkReportPair,
} from "./benchmark-harness.js";
import {
  commandOutputFingerprints,
  createVault,
  findExactDuplicateCommandOutput,
  readOutputText,
  storeCommandOutput,
  storeMetadataOutput,
  type VaultHandle,
} from "./vault.js";
import type { CommandOutputRecord, ExecutionStatus, MetadataOutputRecord, OutputFingerprints, SessionIndexEntry } from "./types.js";

export interface StoragePolicyBenchmarkOptions {
  iterations?: number;
  generatedAt?: string;
}

export interface StoragePolicyBenchmarkReport {
  generatedAt: string;
  iterations: number;
  summary: StoragePolicyBenchmarkSummary;
  fixtures: StoragePolicyFixtureDefinition[];
  policies: StoragePolicyResult[];
}

export interface StoragePolicyBenchmarkSummary {
  fixtures: number;
  policies: number;
  safeCandidateIds: string[];
  disqualifiedCandidateIds: string[];
  defaultUnchanged: true;
}

export interface StoragePolicyResult {
  policyId: StoragePolicyId;
  label: string;
  description: string;
  totals: StoragePolicyTotals;
  safety: StoragePolicySafety;
  fixtures: StoragePolicyFixtureResult[];
  notes: string[];
}

export interface StoragePolicyTotals {
  rawCombinedBytes: number;
  rawCombinedTokensApprox: number;
  exactStoredCombinedBytes: number;
  exactStoredTokensApprox: number;
  storageBytes: number;
  indexBytes: number;
  metadataOnlyRecords: number;
  exactRecords: number;
  duplicateMetadataRecords: number;
  storageReductionPercent: number;
  tokenSurfaceReductionPercent: number;
  privacySurfacePercent: number;
  latencyMs: { p50: number; p95: number };
}

export interface StoragePolicySafety {
  exactnessSensitiveFixtures: number;
  exactnessSensitiveRecoverable: number;
  exactnessSensitiveRecoveryPassed: boolean;
  metadataOnlyRecoveryLabeled: boolean;
  repeatedOutputsDeduped: boolean;
}

export interface StoragePolicyFixtureResult {
  fixtureId: string;
  iteration: number;
  outputId: string;
  recordKind: "command" | "metadata";
  persistence: string;
  recoverability: string;
  rawCombinedBytes: number;
  exactStoredCombinedBytes: number;
  latencyMs: number;
  exactRecovery: "passed" | "failed" | "not-exact";
  usefulRecovery: "exact" | "metadata-only" | "duplicate-ref" | "none";
  duplicateOf?: string;
  exactnessSensitive: boolean;
  notes: string[];
}

interface StoragePolicyFixtureDefinition {
  id: string;
  title: string;
  command: string;
  stdout: string;
  stderr: string;
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  exactnessSensitive: boolean;
  repeatedGroup?: string;
}

type StoragePolicyId = "store-everything" | "threshold-exact" | "metadata-small-exact-large-hybrid" | "duplicate-output-dedupe" | "hybrid-dedupe";
type StorageDecision = "exact" | "metadata" | "duplicate-metadata";

interface StoragePolicyDefinition {
  id: StoragePolicyId;
  label: string;
  description: string;
  decide(input: StoragePolicyDecisionInput): StorageDecision;
}

interface StoragePolicyDecisionInput {
  fixture: StoragePolicyFixtureDefinition;
  combined: string;
  rawCombinedBytes: number;
  duplicate?: SessionIndexEntry;
}

interface StoredObservation {
  record: CommandOutputRecord | MetadataOutputRecord;
  decision: StorageDecision;
  latencyMs: number;
  rawCombinedBytes: number;
  exactStoredCombinedBytes: number;
  duplicateOf?: string;
}

interface TempResource {
  path: string;
  cleanup: () => Promise<void>;
}

const DEFAULT_ITERATIONS = 2;
const LARGE_EXACT_THRESHOLD_BYTES = 8 * 1024;
const FIXTURES = createStoragePolicyFixtures();

const POLICIES: StoragePolicyDefinition[] = [
  {
    id: "store-everything",
    label: "Store everything exactly",
    description: "Current baseline: every command output is vaulted exactly, so recovery is maximally useful and storage/privacy surface is largest.",
    decide() {
      return "exact";
    },
  },
  {
    id: "threshold-exact",
    label: "Threshold exact storage",
    description: `Exact storage only when combined output is at least ${LARGE_EXACT_THRESHOLD_BYTES} bytes; smaller outputs are metadata-only. This intentionally tests whether a threshold alone would drop exact failure/verification recovery.`,
    decide(input) {
      return input.rawCombinedBytes >= LARGE_EXACT_THRESHOLD_BYTES ? "exact" : "metadata";
    },
  },
  {
    id: "metadata-small-exact-large-hybrid",
    label: "Metadata-small / exact-large hybrid",
    description: `Small non-sensitive outputs become metadata-only; exactness-sensitive or >= ${LARGE_EXACT_THRESHOLD_BYTES} byte outputs remain exactly recoverable.`,
    decide(input) {
      return input.fixture.exactnessSensitive || input.rawCombinedBytes >= LARGE_EXACT_THRESHOLD_BYTES ? "exact" : "metadata";
    },
  },
  {
    id: "duplicate-output-dedupe",
    label: "Duplicate output dedupe",
    description: "First occurrence is stored exactly; exact duplicates become metadata-only records that point at the prior exact output.",
    decide(input) {
      return input.duplicate ? "duplicate-metadata" : "exact";
    },
  },
  {
    id: "hybrid-dedupe",
    label: "Hybrid exactness + duplicate dedupe",
    description: `Exactness-sensitive or >= ${LARGE_EXACT_THRESHOLD_BYTES} byte outputs stay exactly recoverable; exact duplicates of those outputs become metadata pointers; small non-sensitive outputs are metadata-only.`,
    decide(input) {
      const shouldStoreExact = input.fixture.exactnessSensitive || input.rawCombinedBytes >= LARGE_EXACT_THRESHOLD_BYTES;
      if (!shouldStoreExact) {
        return "metadata";
      }
      return input.duplicate ? "duplicate-metadata" : "exact";
    },
  },
];

export async function runStoragePolicyBenchmarks(options: StoragePolicyBenchmarkOptions = {}): Promise<StoragePolicyBenchmarkReport> {
  const iterations = normalizeIterations(options.iterations, DEFAULT_ITERATIONS);
  const policies: StoragePolicyResult[] = [];

  for (const policy of POLICIES) {
    policies.push(await runPolicy(policy, iterations));
  }

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    iterations,
    summary: summarizeStoragePolicyReport(policies),
    fixtures: FIXTURES,
    policies,
  };
}

export function renderStoragePolicyBenchmarkReport(report: StoragePolicyBenchmarkReport): string {
  const date = report.generatedAt.slice(0, 10);
  const lines = [
    "# Storage Policy Benchmark Report - Iteration 1",
    "",
    `Date: ${date}`,
    "",
    "## Scope",
    "",
    "Benchmark-only experiment for Freeflow vault storage policies. This report does not change runtime defaults or repo config. It compares exact storage, threshold storage, hybrid metadata/exact storage, and duplicate-output dedupe using deterministic command-output fixtures.",
    "",
    "## Summary",
    "",
    `- Fixtures: ${report.summary.fixtures}`,
    `- Policies: ${report.summary.policies}`,
    `- Safe candidates for further evaluation: ${report.summary.safeCandidateIds.join(", ") || "none"}`,
    `- Disqualified by exact-recovery safety: ${report.summary.disqualifiedCandidateIds.join(", ") || "none"}`,
    `- Runtime default changed: ${report.summary.defaultUnchanged ? "no" : "yes"}`,
    "",
    "## Policy Results",
    "",
    "| Policy | Exact-sensitive recovery | Storage bytes | Index bytes | Exact stored bytes | Storage reduction | Token-surface reduction | Privacy surface | Metadata-only | Duplicate metadata | Latency p50/p95 | Notes |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const policy of report.policies) {
    lines.push([
      escapeTable(policy.label),
      `${policy.safety.exactnessSensitiveRecoverable}/${policy.safety.exactnessSensitiveFixtures}`,
      String(policy.totals.storageBytes),
      String(policy.totals.indexBytes),
      String(policy.totals.exactStoredCombinedBytes),
      formatPercent(policy.totals.storageReductionPercent),
      formatPercent(policy.totals.tokenSurfaceReductionPercent),
      formatPercent(policy.totals.privacySurfacePercent),
      String(policy.totals.metadataOnlyRecords),
      String(policy.totals.duplicateMetadataRecords),
      `${policy.totals.latencyMs.p50.toFixed(2)}/${policy.totals.latencyMs.p95.toFixed(2)}`,
      escapeTable(policy.notes.join(" ")),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("", "## Candidate Notes", "");
  for (const policy of report.policies) {
    lines.push(`### ${policy.label}`, "", policy.description, "");
    lines.push(`- Exactness-sensitive recovery: ${policy.safety.exactnessSensitiveRecoveryPassed ? "pass" : "fail"}`);
    lines.push(`- Metadata-only recovery labeled: ${policy.safety.metadataOnlyRecoveryLabeled ? "yes" : "no"}`);
    lines.push(`- Repeated outputs deduped: ${policy.safety.repeatedOutputsDeduped ? "yes" : "no"}`);
    lines.push("", "| Fixture | Iteration | Record | Recovery | Exact bytes | Notes |", "| --- | ---: | --- | --- | ---: | --- |");
    for (const fixture of policy.fixtures) {
      lines.push([
        escapeTable(fixture.fixtureId),
        String(fixture.iteration),
        `${fixture.recordKind}/${fixture.recoverability}`,
        fixture.usefulRecovery,
        String(fixture.exactStoredCombinedBytes),
        escapeTable(fixture.notes.join(" ")),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }

  lines.push(
    "## Decision Boundary",
    "",
    "This benchmark intentionally stops before changing defaults. Any storage default change still needs a product/safety decision because metadata-only storage changes exact recovery semantics and privacy surface.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

export async function writeStoragePolicyBenchmarkReports(
  report: StoragePolicyBenchmarkReport,
  markdownReportPath = defaultReportPath(),
  options: { jsonReportPath?: string | false } = {},
): Promise<{ markdown: string; json?: string }> {
  return writeBenchmarkReportPair({
    report,
    markdownReportPath,
    jsonReportPath: options.jsonReportPath,
    renderMarkdown: renderStoragePolicyBenchmarkReport,
  });
}

async function runPolicy(policy: StoragePolicyDefinition, iterations: number): Promise<StoragePolicyResult> {
  const temp = await createTempDir(`freeflow-storage-policy-${policy.id}-`);
  const vault = createVault({ root: temp.path });
  const sessionId = `storage-policy-${policy.id}`;
  const fixtureResults: StoragePolicyFixtureResult[] = [];

  try {
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      for (const fixture of FIXTURES) {
        fixtureResults.push(await runPolicyFixture({ policy, vault, sessionId, fixture, iteration }));
      }
    }

    const storageBytes = await directorySize(temp.path);
    const indexBytes = await directorySize(join(temp.path, "index"));
    return buildPolicyResult({ policy, fixtureResults, storageBytes, indexBytes });
  } finally {
    await temp.cleanup();
  }
}

async function runPolicyFixture(options: {
  policy: StoragePolicyDefinition;
  vault: VaultHandle;
  sessionId: string;
  fixture: StoragePolicyFixtureDefinition;
  iteration: number;
}): Promise<StoragePolicyFixtureResult> {
  const combined = combineOutputSections(options.fixture.stdout, options.fixture.stderr);
  const rawCombinedBytes = byteLength(combined);
  const fingerprints = commandOutputFingerprints({
    command: options.fixture.command,
    stdout: options.fixture.stdout,
    stderr: options.fixture.stderr,
    combined,
    executionStatus: options.fixture.executionStatus,
    exitCode: options.fixture.exitCode,
  });
  const duplicate = await findExactDuplicateCommandOutput(options.vault, {
    sessionId: options.sessionId,
    fingerprints,
  }).catch(() => undefined);
  const decisionInput: StoragePolicyDecisionInput = { fixture: options.fixture, combined, rawCombinedBytes };
  if (duplicate !== undefined) {
    decisionInput.duplicate = duplicate;
  }
  const decision = options.policy.decide(decisionInput);
  const storeOptions = { ...options, combined, rawCombinedBytes, fingerprints, decision };
  if (duplicate !== undefined) {
    Object.assign(storeOptions, { duplicate });
  }
  const observation = await storeWithPolicy(storeOptions);
  const recovery = await checkRecovery({ ...options, observation, combined });

  return {
    fixtureId: options.fixture.id,
    iteration: options.iteration,
    outputId: observation.record.outputId,
    recordKind: observation.record.kind,
    persistence: observation.record.persistence.status,
    recoverability: observation.record.persistence.recoverability,
    rawCombinedBytes,
    exactStoredCombinedBytes: observation.exactStoredCombinedBytes,
    latencyMs: observation.latencyMs,
    exactRecovery: recovery.exactRecovery,
    usefulRecovery: recovery.usefulRecovery,
    ...(observation.duplicateOf !== undefined ? { duplicateOf: observation.duplicateOf } : {}),
    exactnessSensitive: options.fixture.exactnessSensitive,
    notes: recovery.notes,
  };
}

async function storeWithPolicy(options: {
  policy: StoragePolicyDefinition;
  vault: VaultHandle;
  sessionId: string;
  fixture: StoragePolicyFixtureDefinition;
  iteration: number;
  combined: string;
  rawCombinedBytes: number;
  fingerprints: OutputFingerprints & { commandFingerprintSha256: string };
  duplicate?: SessionIndexEntry;
  decision: StorageDecision;
}): Promise<StoredObservation> {
  const startedAt = performance.now();
  if (options.decision === "exact") {
    const record = await storeCommandOutput(options.vault, {
      sessionId: options.sessionId,
      command: options.fixture.command,
      stdout: options.fixture.stdout,
      stderr: options.fixture.stderr,
      combined: options.combined,
      executionStatus: options.fixture.executionStatus,
      exitCode: options.fixture.exitCode,
      decisionIds: [decisionId("storage-policy", options.policy.id, options.fixture.id, String(options.iteration), "exact")],
      producer: { kind: "command", name: "storage-policy-experiment" },
    });
    return {
      record,
      decision: options.decision,
      latencyMs: performance.now() - startedAt,
      rawCombinedBytes: options.rawCombinedBytes,
      exactStoredCombinedBytes: options.rawCombinedBytes,
    };
  }

  const duplicateOf = options.decision === "duplicate-metadata" ? options.duplicate?.outputId : undefined;
  const record = await storeMetadataOutput(options.vault, {
    sessionId: options.sessionId,
    sourceKind: "other",
    rawLineCount: countLines(options.combined),
    rawByteCount: options.rawCombinedBytes,
    rawSha256: sha256Text(options.combined),
    decisionIds: [decisionId("storage-policy", options.policy.id, options.fixture.id, String(options.iteration), options.decision)],
    producer: { kind: "command", name: "storage-policy-experiment" },
    metadata: {
      policy: options.policy.id,
      command: options.fixture.command,
      executionStatus: options.fixture.executionStatus,
      exitCode: options.fixture.exitCode,
      exactnessSensitive: options.fixture.exactnessSensitive,
      ...(duplicateOf !== undefined ? { duplicateOf } : {}),
    },
  });
  return {
    record,
    decision: options.decision,
    latencyMs: performance.now() - startedAt,
    rawCombinedBytes: options.rawCombinedBytes,
    exactStoredCombinedBytes: 0,
    ...(duplicateOf !== undefined ? { duplicateOf } : {}),
  };
}

async function checkRecovery(options: {
  vault: VaultHandle;
  sessionId: string;
  fixture: StoragePolicyFixtureDefinition;
  observation: StoredObservation;
  combined: string;
}): Promise<{ exactRecovery: StoragePolicyFixtureResult["exactRecovery"]; usefulRecovery: StoragePolicyFixtureResult["usefulRecovery"]; notes: string[] }> {
  const notes: string[] = [];
  if (options.observation.record.kind === "command") {
    try {
      const recovered = await readOutputText(options.vault, options.sessionId, options.observation.record.outputId, "combined");
      const passed = recovered === options.combined;
      notes.push(passed ? "exact combined recovery passed" : "exact combined recovery mismatch");
      return { exactRecovery: passed ? "passed" : "failed", usefulRecovery: passed ? "exact" : "none", notes };
    } catch (error) {
      notes.push(`exact recovery failed: ${errorMessage(error)}`);
      return { exactRecovery: "failed", usefulRecovery: "none", notes };
    }
  }

  if (options.observation.duplicateOf !== undefined) {
    try {
      const recovered = await readOutputText(options.vault, options.sessionId, options.observation.duplicateOf, "combined");
      const passed = recovered === options.combined;
      notes.push(passed ? `metadata duplicate points to exact outputId=${options.observation.duplicateOf}` : `metadata duplicate pointer mismatch outputId=${options.observation.duplicateOf}`);
      return { exactRecovery: "not-exact", usefulRecovery: passed ? "duplicate-ref" : "none", notes };
    } catch (error) {
      notes.push(`duplicate reference recovery failed: ${errorMessage(error)}`);
      return { exactRecovery: "not-exact", usefulRecovery: "none", notes };
    }
  }

  notes.push("metadata-only record intentionally has no raw exact recovery");
  return { exactRecovery: "not-exact", usefulRecovery: "metadata-only", notes };
}

function buildPolicyResult(options: {
  policy: StoragePolicyDefinition;
  fixtureResults: StoragePolicyFixtureResult[];
  storageBytes: number;
  indexBytes: number;
}): StoragePolicyResult {
  const rawCombinedBytes = sum(options.fixtureResults.map((fixture) => fixture.rawCombinedBytes));
  const exactStoredCombinedBytes = sum(options.fixtureResults.map((fixture) => fixture.exactStoredCombinedBytes));
  const latency = latencySummary(options.fixtureResults.map((fixture) => fixture.latencyMs));
  const exactnessSensitiveFixtures = options.fixtureResults.filter((fixture) => fixture.exactnessSensitive).length;
  const exactnessSensitiveRecoverable = options.fixtureResults.filter((fixture) => fixture.exactnessSensitive && (fixture.usefulRecovery === "exact" || fixture.usefulRecovery === "duplicate-ref")).length;
  const metadataOnlyRecords = options.fixtureResults.filter((fixture) => fixture.recordKind === "metadata").length;
  const duplicateMetadataRecords = options.fixtureResults.filter((fixture) => fixture.usefulRecovery === "duplicate-ref").length;
  const repeatedOutputsDeduped = duplicateMetadataRecords > 0;
  const safety: StoragePolicySafety = {
    exactnessSensitiveFixtures,
    exactnessSensitiveRecoverable,
    exactnessSensitiveRecoveryPassed: exactnessSensitiveRecoverable === exactnessSensitiveFixtures,
    metadataOnlyRecoveryLabeled: options.fixtureResults.every((fixture) => fixture.recordKind !== "metadata" || fixture.recoverability === "metadata_only"),
    repeatedOutputsDeduped,
  };
  const notes: string[] = [];
  if (!safety.exactnessSensitiveRecoveryPassed) {
    notes.push("disqualified: exactness-sensitive failure/verification output would lose exact recovery");
  }
  if (options.policy.id === "threshold-exact" && !safety.exactnessSensitiveRecoveryPassed) {
    notes.push("threshold-only policy is unsafe without an exactness-sensitive override");
  }
  if (options.policy.id === "metadata-small-exact-large-hybrid" && safety.exactnessSensitiveRecoveryPassed) {
    notes.push("hybrid preserved exact recovery for sensitive fixtures while reducing exact raw storage");
  }
  if (options.policy.id === "duplicate-output-dedupe" && repeatedOutputsDeduped) {
    notes.push("duplicates kept metadata pointers to prior exact output");
  }
  if (options.policy.id === "hybrid-dedupe" && safety.exactnessSensitiveRecoveryPassed && repeatedOutputsDeduped) {
    notes.push("hybrid+dedupe preserved exact-sensitive recovery while metadata-only small output and duplicate pointers reduced exact raw storage");
  }

  return {
    policyId: options.policy.id,
    label: options.policy.label,
    description: options.policy.description,
    totals: {
      rawCombinedBytes,
      rawCombinedTokensApprox: approximateTokens(rawCombinedBytes),
      exactStoredCombinedBytes,
      exactStoredTokensApprox: approximateTokens(exactStoredCombinedBytes),
      storageBytes: options.storageBytes,
      indexBytes: options.indexBytes,
      metadataOnlyRecords,
      exactRecords: options.fixtureResults.length - metadataOnlyRecords,
      duplicateMetadataRecords,
      storageReductionPercent: reductionPercent(rawCombinedBytes, exactStoredCombinedBytes),
      tokenSurfaceReductionPercent: reductionPercent(approximateTokens(rawCombinedBytes), approximateTokens(exactStoredCombinedBytes)),
      privacySurfacePercent: rawCombinedBytes > 0 ? Math.round((exactStoredCombinedBytes / rawCombinedBytes) * 10_000) / 100 : 0,
      latencyMs: latency,
    },
    safety,
    fixtures: options.fixtureResults,
    notes,
  };
}

function summarizeStoragePolicyReport(policies: readonly StoragePolicyResult[]): StoragePolicyBenchmarkSummary {
  const safeCandidateIds = policies
    .filter((policy) => policy.safety.exactnessSensitiveRecoveryPassed && policy.safety.metadataOnlyRecoveryLabeled)
    .map((policy) => policy.policyId);
  const disqualifiedCandidateIds = policies
    .filter((policy) => !policy.safety.exactnessSensitiveRecoveryPassed || !policy.safety.metadataOnlyRecoveryLabeled)
    .map((policy) => policy.policyId);
  return {
    fixtures: FIXTURES.length,
    policies: policies.length,
    safeCandidateIds,
    disqualifiedCandidateIds,
    defaultUnchanged: true,
  };
}

function createStoragePolicyFixtures(): StoragePolicyFixtureDefinition[] {
  const largeLines = Array.from({ length: 300 }, (_, index) => `large log line ${String(index + 1).padStart(3, "0")} ${"x".repeat(80)}`).join("\n") + "\nLARGE_LOG_SENTINEL exact tail\n";
  return [
    {
      id: "small-success",
      title: "Small successful command output",
      command: "echo ok",
      stdout: "ok\n",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      exactnessSensitive: false,
    },
    {
      id: "small-failure",
      title: "Small failed command with exact diagnostic",
      command: "npm test",
      stdout: "Tests: 1 failed, 24 passed, 25 total\n",
      stderr: "AssertionError: STORAGE_POLICY_FAILURE_SENTINEL\n",
      executionStatus: "failed",
      exitCode: 1,
      exactnessSensitive: true,
    },
    {
      id: "verification-output",
      title: "Verification output with completion claim evidence",
      command: "npm run verify",
      stdout: "Verification passed: STORAGE_POLICY_VERIFY_SENTINEL\n",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      exactnessSensitive: true,
    },
    {
      id: "large-log",
      title: "Large noisy log output",
      command: "tail huge.log",
      stdout: largeLines,
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      exactnessSensitive: false,
    },
    {
      id: "large-log-repeat",
      title: "Large noisy log repeated output",
      command: "tail huge.log",
      stdout: largeLines,
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      exactnessSensitive: false,
      repeatedGroup: "large-log",
    },
    {
      id: "repeated-failure-a",
      title: "Repeated exactness-sensitive failure first occurrence",
      command: "npm test -- repeated",
      stdout: "Tests: 1 failed, 24 passed, 25 total\n",
      stderr: "AssertionError: REPEATED_STORAGE_POLICY_FAILURE_SENTINEL\n",
      executionStatus: "failed",
      exitCode: 1,
      exactnessSensitive: true,
      repeatedGroup: "failure",
    },
    {
      id: "repeated-failure-b",
      title: "Repeated exactness-sensitive failure second occurrence",
      command: "npm test -- repeated",
      stdout: "Tests: 1 failed, 24 passed, 25 total\n",
      stderr: "AssertionError: REPEATED_STORAGE_POLICY_FAILURE_SENTINEL\n",
      executionStatus: "failed",
      exitCode: 1,
      exactnessSensitive: true,
      repeatedGroup: "failure",
    },
    {
      id: "repeat-a",
      title: "Repeated output first occurrence",
      command: "fixture repeat",
      stdout: "REPEATED_STORAGE_POLICY_SENTINEL\n",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      exactnessSensitive: false,
      repeatedGroup: "repeat",
    },
    {
      id: "repeat-b",
      title: "Repeated output second occurrence",
      command: "fixture repeat",
      stdout: "REPEATED_STORAGE_POLICY_SENTINEL\n",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      exactnessSensitive: false,
      repeatedGroup: "repeat",
    },
  ];
}

async function directorySize(path: string): Promise<number> {
  try {
    const info = await stat(path);
    if (info.isFile()) {
      return info.size;
    }
    if (!info.isDirectory()) {
      return 0;
    }
  } catch {
    return 0;
  }
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    total += await directorySize(join(path, entry.name));
  }
  return total;
}

async function createTempDir(prefix: string): Promise<TempResource> {
  const path = await mkdtemp(resolve(tmpdir(), prefix));
  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

function combineOutputSections(stdout: string, stderr: string): string {
  if (stdout.length === 0) {
    return stderr;
  }
  if (stderr.length === 0) {
    return stdout;
  }
  return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return text.split("\n").length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decisionId(...parts: string[]): string {
  return `ffdec_${sha256Text(parts.join("\0")).slice(0, 16)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultReportPath(): string {
  return resolve(process.cwd(), "plugins/freeflow/evals/reports/runtime/storage-policy-benchmark-1-report.md");
}

async function runCli() {
  const { iterations, reportPath, jsonReportPath } = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: defaultReportPath() });
  const options: StoragePolicyBenchmarkOptions = {};
  if (iterations !== undefined) {
    options.iterations = iterations;
  }
  const report = await runStoragePolicyBenchmarks(options);
  const reports = await writeStoragePolicyBenchmarkReports(report, reportPath, {
    jsonReportPath: jsonReportPath === undefined ? defaultJsonRunReportPath(reportPath) : jsonReportPath,
  });
  const shortId = createHash("sha256").update(JSON.stringify(report.summary)).digest("hex").slice(0, 8);
  console.log(`Freeflow storage policy benchmark ${shortId}: safe candidates ${report.summary.safeCandidateIds.join(", ") || "none"}`);
  console.log(`Markdown report: ${reports.markdown}`);
  if (reports.json) {
    console.log(`JSON run data: ${reports.json}`);
  }
  if (report.summary.safeCandidateIds.length === 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runCli();
}
