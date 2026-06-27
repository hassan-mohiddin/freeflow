import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import {
  approximateTokens,
  averagePercent as average,
  defaultJsonRunReportPath,
  escapeMarkdownTableCell as escapeTable,
  formatPercent,
  latencySummary,
  medianPercent as median,
  normalizeIterations,
  parseBenchmarkCliArgs,
  reductionPercent,
  writeBenchmarkReportPair,
} from "./benchmark-harness.js";
import { freeflowRetrieve } from "../tools/retrieve.js";
import { createVault, storeCommandOutput } from "../vault/vault.js";
import type { EvidencePacket, RetrievalRoutedResult } from "../config/types.js";

export interface RunRouterBenchmarksOptions {
  iterations?: number;
  generatedAt?: string;
}

export interface RouterBenchmarkReport {
  generatedAt: string;
  iterations: number;
  summary: RouterBenchmarkSummary;
  fixtures: RouterBenchmarkFixtureResult[];
  skippedExternalTools: SkippedExternalTool[];
}

export interface RouterBenchmarkSummary {
  fixtures: number;
  modeResults: number;
  improved: ModeSummary;
  nativeBaseline: ModeSummary;
  freeflowBaseline: ModeSummary;
  generatedFalsePositiveCount: number;
  sandboxFailureFixed: boolean;
}

export interface ModeSummary {
  passed: number;
  failed: number;
  skipped: number;
  pathCorrect: number;
  spanCorrect: number;
  excerptComplete: number;
  generatedFalsePositiveCount: number;
  totalRawBytes: number;
  totalRoutedBytes: number;
  totalRawTokensApprox: number;
  totalRoutedTokensApprox: number;
  weightedByteReductionPercent: number;
  weightedTokenReductionPercent: number;
  averageByteReductionPercent: number;
  medianByteReductionPercent: number;
  averageTokenReductionPercent: number;
  medianTokenReductionPercent: number;
}

export interface RouterBenchmarkFixtureResult {
  id: string;
  title: string;
  kind: BenchmarkKind;
  expected: BenchmarkExpected;
  results: RouterBenchmarkModeResult[];
}

export interface RouterBenchmarkModeResult {
  mode: BenchmarkMode;
  toolPathUsed: string;
  skipped: boolean;
  skipReason?: string;
  rawBytes: number;
  rawTokensApprox: number;
  routedBytes: number;
  routedTokensApprox: number;
  byteReductionPercent: number;
  tokenReductionPercent: number;
  latencyMs: {
    p50: number;
    p95: number;
  };
  actualPath?: string;
  actualLines?: string;
  correctness: CorrectnessResult;
  recovery: RecoveryResult;
  notes: string[];
}

export interface BenchmarkExpected {
  path?: string;
  pathIncludes?: string;
  lines?: string;
  requiredExcerpt?: string[];
}

export interface CorrectnessResult {
  passed: boolean;
  pathCorrect: boolean;
  spanCorrect: boolean;
  excerptComplete: boolean;
  generatedFalsePositive: boolean;
}

export interface RecoveryResult {
  status: "passed" | "failed" | "not-applicable" | "skipped";
  detail: string;
}

export interface SkippedExternalTool {
  name: string;
  reason: string;
}

type BenchmarkKind = "repo-query" | "repo-expand" | "vault-query";
type BenchmarkMode = "native-baseline-proxy" | "pre-hardening-freeflow-proxy" | "improved-freeflow-router";

type FixtureRun = () => Promise<BenchmarkObservation>;
type RecoveryVerifier = (result: RetrievalRoutedResult) => Promise<RecoveryResult>;

interface BenchmarkFixture {
  id: string;
  title: string;
  kind: BenchmarkKind;
  expected: BenchmarkExpected;
  modes: Record<BenchmarkMode, FixtureRun>;
  cleanup: () => Promise<void>;
}

interface BenchmarkObservation {
  toolPathUsed: string;
  rawBytes: number;
  routedBytes: number;
  actualPath?: string;
  actualLines?: string;
  excerpt: string;
  recovery: RecoveryResult;
  notes?: string[];
  skipped?: boolean;
  skipReason?: string;
}

interface TextFile {
  path: string;
  text: string;
  lines: string[];
}

interface LineHit {
  file: TextFile;
  lineIndex: number;
  score: number;
}

interface TempResource {
  path: string;
  cleanup: () => Promise<void>;
}

const DEFAULT_ITERATIONS = 3;
const DEFAULT_CONTEXT_LINES = 2;
const LEGACY_SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".next", ".nuxt", "coverage", "target"]);
const GENERATED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "target",
  "graphify-out",
  ".cache",
  ".tmp",
  "tmp",
  "temp",
  "logs",
]);
const EXTERNAL_TOOL_SKIPS: SkippedExternalTool[] = [
  { name: "Graphify", reason: "Optional external comparator is not required for CI-friendly router benchmarks." },
  { name: "Claude Context", reason: "Optional semantic/hybrid search comparator is skipped unless configured separately." },
  { name: "RTK", reason: "Command-output comparator belongs to the later command benchmark track." },
  { name: "Squeez", reason: "Session-efficiency comparator belongs to the later command/session benchmark track." },
];

export async function runRouterBenchmarks(options: RunRouterBenchmarksOptions = {}): Promise<RouterBenchmarkReport> {
  const iterations = normalizeIterations(options.iterations, DEFAULT_ITERATIONS);
  const fixtures = await createBenchmarkFixtures();

  try {
    const fixtureResults: RouterBenchmarkFixtureResult[] = [];
    for (const fixture of fixtures) {
      const results: RouterBenchmarkModeResult[] = [];
      for (const mode of benchmarkModes()) {
        results.push(await runFixtureMode(fixture, mode, iterations));
      }
      fixtureResults.push({
        id: fixture.id,
        title: fixture.title,
        kind: fixture.kind,
        expected: fixture.expected,
        results,
      });
    }

    return {
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      iterations,
      summary: summarizeReport(fixtureResults),
      fixtures: fixtureResults,
      skippedExternalTools: EXTERNAL_TOOL_SKIPS,
    };
  } finally {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  }
}

export function renderRouterBenchmarkReport(report: RouterBenchmarkReport): string {
  const date = report.generatedAt.slice(0, 10);
  const lines = [
    "# Output Router Benchmark Report - Iteration 1",
    "",
    `Date: ${date}`,
    "",
    "## Scope",
    "",
    "Deterministic, CI-friendly tool benchmark for Freeflow Router retrieval behavior. The runner compares a native text-search proxy, a pre-hardening Freeflow-style proxy, and the improved Freeflow Router implementation. Optional external comparators are recorded as skipped rather than failed.",
    "",
    "Reduction percentages compare routed/context bytes and approximate tokens against the raw source or direct output for that mode. Negative reduction means structured routing overhead is larger than the tiny raw output; native exact-search proxies can still be smaller than the router for simple lookups.",
    "",
    "## Baseline Caveat",
    "",
    "The pre-hardening Freeflow mode is a deterministic proxy for the old line-scoring behavior, not a checkout of an older runtime. It is useful for stable regression pressure, not historical performance archaeology.",
    "",
    "## Command",
    "",
    "```sh",
    "npm run bench:router",
    "```",
    "",
    "The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.",
    "",
    "## Summary",
    "",
    `- Iterations per mode: ${report.iterations}`,
    `- Fixtures: ${report.summary.fixtures}`,
    `- Improved Freeflow Router gated pass: ${report.summary.improved.passed}/${report.summary.fixtures}`,
    `- Native baseline proxy pass: ${report.summary.nativeBaseline.passed}/${report.summary.fixtures}`,
    `- Pre-hardening Freeflow proxy pass: ${report.summary.freeflowBaseline.passed}/${report.summary.fixtures}`,
    `- Generated false positives observed: ${report.summary.generatedFalsePositiveCount}/${report.summary.modeResults} mode results`,
    `- Improved generated false positives: ${report.summary.improved.generatedFalsePositiveCount}/${report.summary.fixtures}`,
    `- Improved weighted byte/token reduction: ${formatPercent(report.summary.improved.weightedByteReductionPercent)} / ${formatPercent(report.summary.improved.weightedTokenReductionPercent)} (${report.summary.improved.totalRawBytes}/${report.summary.improved.totalRawTokensApprox} raw to ${report.summary.improved.totalRoutedBytes}/${report.summary.improved.totalRoutedTokensApprox} routed)`,
    `- Improved average byte/token reduction: ${formatPercent(report.summary.improved.averageByteReductionPercent)} / ${formatPercent(report.summary.improved.averageTokenReductionPercent)}`,
    `- Improved median byte/token reduction: ${formatPercent(report.summary.improved.medianByteReductionPercent)} / ${formatPercent(report.summary.improved.medianTokenReductionPercent)}`,
    `- Improved path/span/excerpt checks: ${report.summary.improved.pathCorrect}/${report.summary.fixtures} path, ${report.summary.improved.spanCorrect}/${report.summary.fixtures} span, ${report.summary.improved.excerptComplete}/${report.summary.fixtures} excerpt`,
    `- Sandbox failure fixed: ${report.summary.sandboxFailureFixed ? "yes" : "no"}`,
    "",
    "## Results",
    "",
    "| fixture | mode | correctness | checks | path | lines | raw bytes/tokens | routed bytes/tokens | byte/token reduction | latency p50/p95 ms | recovery | notes |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
  ];

  for (const fixture of report.fixtures) {
    for (const result of fixture.results) {
      const correctness = result.skipped ? "skipped" : result.correctness.passed ? "pass" : "fail";
      const recovery = result.recovery.status;
      const notes = result.notes.length ? result.notes.join("; ") : result.skipReason ?? "";
      const checks = formatCorrectnessChecks(result.correctness);
      lines.push(
        `| ${escapeTable(fixture.id)} | ${escapeTable(result.mode)} | ${correctness} | ${escapeTable(checks)} | ${escapeTable(result.actualPath ?? "-")} | ${escapeTable(
          result.actualLines ?? "-",
        )} | ${result.rawBytes}/${result.rawTokensApprox} | ${result.routedBytes}/${result.routedTokensApprox} | ${formatPercent(
          result.byteReductionPercent,
        )}/${formatPercent(result.tokenReductionPercent)} | ${result.latencyMs.p50.toFixed(2)}/${result.latencyMs.p95.toFixed(2)} | ${escapeTable(
          recovery,
        )} | ${escapeTable(notes)} |`,
      );
    }
  }

  lines.push(
    "",
    "## Not Yet Measured",
    "",
    "- recall@3 / alternate candidates: not measured in this first deterministic runner.",
    "- explanation quality: not measured beyond route reason capture.",
    "- command-output parser benchmarks: deferred to the command benchmark track.",
    "",
    "## Skipped External Comparators",
    "",
  );
  for (const tool of report.skippedExternalTools) {
    lines.push(`- ${tool.name}: ${tool.reason}`);
  }

  lines.push(
    "",
    "## Regression Status",
    "",
    report.summary.improved.failed === 0
      ? "Improved Freeflow Router passed all gated benchmark fixtures."
      : `Improved Freeflow Router failed ${report.summary.improved.failed} gated benchmark fixture(s).`,
    "",
    "The generated-artifact decoy benchmark preserves the original Sandbox Permissions false-positive shape and records it as fixed when the improved router selects the docs target instead of `graphify-out/graph.html`.",
    "",
  );

  return `${lines.join("\n")}`;
}

export async function writeRouterBenchmarkReport(report: RouterBenchmarkReport, reportPath: string): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderRouterBenchmarkReport(report), "utf8");
}

export async function writeRouterBenchmarkJsonReport(report: RouterBenchmarkReport, reportPath: string): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export interface WriteRouterBenchmarkReportsOptions {
  jsonReportPath?: string | false;
}

export async function writeRouterBenchmarkReports(
  report: RouterBenchmarkReport,
  markdownReportPath: string,
  options: WriteRouterBenchmarkReportsOptions = {},
): Promise<{ markdown: string; json?: string }> {
  return writeBenchmarkReportPair({
    report,
    markdownReportPath,
    jsonReportPath: options.jsonReportPath,
    renderMarkdown: renderRouterBenchmarkReport,
  });
}

async function runFixtureMode(
  fixture: BenchmarkFixture,
  mode: BenchmarkMode,
  iterations: number,
): Promise<RouterBenchmarkModeResult> {
  const latencies: number[] = [];
  let observation: BenchmarkObservation | null = null;

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    observation = await fixture.modes[mode]();
    latencies.push(performance.now() - startedAt);
  }

  if (!observation) {
    observation = skippedObservation("benchmark runner", "No observation was produced.");
  }

  const correctness = scoreCorrectness(fixture.expected, observation);
  const rawTokensApprox = approximateTokens(observation.rawBytes);
  const routedTokensApprox = approximateTokens(observation.routedBytes);
  return {
    mode,
    toolPathUsed: observation.toolPathUsed,
    skipped: observation.skipped ?? false,
    ...(observation.skipReason ? { skipReason: observation.skipReason } : {}),
    rawBytes: observation.rawBytes,
    rawTokensApprox,
    routedBytes: observation.routedBytes,
    routedTokensApprox,
    byteReductionPercent: reductionPercent(observation.rawBytes, observation.routedBytes),
    tokenReductionPercent: reductionPercent(rawTokensApprox, routedTokensApprox),
    latencyMs: latencySummary(latencies),
    ...(observation.actualPath ? { actualPath: observation.actualPath } : {}),
    ...(observation.actualLines ? { actualLines: observation.actualLines } : {}),
    correctness,
    recovery: observation.recovery,
    notes: observation.notes ?? [],
  };
}

function summarizeReport(fixtures: RouterBenchmarkFixtureResult[]): RouterBenchmarkSummary {
  const nativeBaseline = summarizeMode(fixtures, "native-baseline-proxy");
  const freeflowBaseline = summarizeMode(fixtures, "pre-hardening-freeflow-proxy");
  const improved = summarizeMode(fixtures, "improved-freeflow-router");
  const generatedFalsePositiveCount = fixtures
    .flatMap((fixture) => fixture.results)
    .filter((result) => result.correctness.generatedFalsePositive).length;
  const sandboxFixture = fixtures.find((fixture) => fixture.id === "generated-artifact-decoy");
  const sandboxImproved = sandboxFixture?.results.find((result) => result.mode === "improved-freeflow-router");

  return {
    fixtures: fixtures.length,
    modeResults: fixtures.reduce((count, fixture) => count + fixture.results.length, 0),
    improved,
    nativeBaseline,
    freeflowBaseline,
    generatedFalsePositiveCount,
    sandboxFailureFixed: Boolean(sandboxImproved?.correctness.passed && !sandboxImproved.correctness.generatedFalsePositive),
  };
}

function summarizeMode(fixtures: RouterBenchmarkFixtureResult[], mode: BenchmarkMode): ModeSummary {
  const modeResults = fixtures
    .map((fixture) => fixture.results.find((candidate) => candidate.mode === mode))
    .filter((result): result is RouterBenchmarkModeResult => Boolean(result));
  const measuredResults = modeResults.filter((result) => !result.skipped);
  const totalRawBytes = measuredResults.reduce((sum, result) => sum + result.rawBytes, 0);
  const totalRoutedBytes = measuredResults.reduce((sum, result) => sum + result.routedBytes, 0);
  const totalRawTokensApprox = measuredResults.reduce((sum, result) => sum + result.rawTokensApprox, 0);
  const totalRoutedTokensApprox = measuredResults.reduce((sum, result) => sum + result.routedTokensApprox, 0);

  return modeResults.reduce(
    (summary, result) => {
      if (result.skipped) {
        summary.skipped += 1;
      } else if (isGatedPass(result, mode)) {
        summary.passed += 1;
      } else {
        summary.failed += 1;
      }

      if (result.correctness.pathCorrect) {
        summary.pathCorrect += 1;
      }
      if (result.correctness.spanCorrect) {
        summary.spanCorrect += 1;
      }
      if (result.correctness.excerptComplete) {
        summary.excerptComplete += 1;
      }
      if (result.correctness.generatedFalsePositive) {
        summary.generatedFalsePositiveCount += 1;
      }

      return summary;
    },
    {
      passed: 0,
      failed: 0,
      skipped: 0,
      pathCorrect: 0,
      spanCorrect: 0,
      excerptComplete: 0,
      generatedFalsePositiveCount: 0,
      totalRawBytes,
      totalRoutedBytes,
      totalRawTokensApprox,
      totalRoutedTokensApprox,
      weightedByteReductionPercent: reductionPercent(totalRawBytes, totalRoutedBytes),
      weightedTokenReductionPercent: reductionPercent(totalRawTokensApprox, totalRoutedTokensApprox),
      averageByteReductionPercent: average(measuredResults.map((result) => result.byteReductionPercent)),
      medianByteReductionPercent: median(measuredResults.map((result) => result.byteReductionPercent)),
      averageTokenReductionPercent: average(measuredResults.map((result) => result.tokenReductionPercent)),
      medianTokenReductionPercent: median(measuredResults.map((result) => result.tokenReductionPercent)),
    },
  );
}

function isGatedPass(result: RouterBenchmarkModeResult, mode: BenchmarkMode): boolean {
  if (!result.correctness.passed) {
    return false;
  }

  if (mode !== "improved-freeflow-router") {
    return true;
  }

  return result.recovery.status === "passed" || result.recovery.status === "not-applicable";
}

async function createBenchmarkFixtures(): Promise<BenchmarkFixture[]> {
  const fixtures = await Promise.all([
    createExactCopiedTextFixture(),
    createMarkdownSectionFixture(),
    createGeneratedArtifactDecoyFixture(),
    createHugeSingleLineDecoyFixture(),
    createAmbiguousMultiFileFixture(),
    createVaultedOutputFixture(),
    createExpansionFixture(),
  ]);
  return fixtures;
}

async function createExactCopiedTextFixture(): Promise<BenchmarkFixture> {
  const repo = await createTempRepo({
    "target.md": [
      "# Target",
      "",
      "The output router vault preserves exact failure evidence for review.",
    ].join("\n"),
    "notes.md": "vault evidence evidence evidence without the exact sentence",
  });

  return repoQueryFixture(repo, {
    id: "exact-copied-text-block",
    title: "Exact copied text block",
    query: "output router vault preserves exact failure evidence",
    expected: {
      path: "target.md",
      lines: "3-3",
      requiredExcerpt: ["output router vault preserves exact failure evidence"],
    },
  });
}

async function createMarkdownSectionFixture(): Promise<BenchmarkFixture> {
  const repo = await createTempRepo({
    "target.md": [
      "# Target",
      "",
      "## Adaptive Compression",
      "",
      "Vault recovery remains exact for raw output.",
      "Parser confidence labels routed diagnostics.",
    ].join("\n"),
    "decoy.md": "adaptive adaptive adaptive adaptive adaptive",
  });

  return repoQueryFixture(repo, {
    id: "markdown-heading-nearby-body",
    title: "Markdown heading plus nearby body text",
    query: "adaptive compression vault recovery parser confidence",
    expected: {
      path: "target.md",
      lines: "3-6",
      requiredExcerpt: ["Adaptive Compression", "Vault recovery", "Parser confidence"],
    },
  });
}

async function createGeneratedArtifactDecoyFixture(): Promise<BenchmarkFixture> {
  const repo = await createTempRepo({
    "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md": [
      "# Pass 3",
      "",
      "### Sandbox Permissions",
      "",
      "`SandboxPermissions` is a per-command request shape.",
      "",
      "Plain-language meaning:",
      "",
      "UseDefault: run with the turn's normal sandbox.",
    ].join("\n"),
    "graphify-out/graph.html": [
      "<html><body>",
      `${"Sandbox Permissions SandboxPermissions Plain-language meaning ".repeat(5000)}GENERATED_GRAPH_DECOY_SENTINEL`,
      "</body></html>",
    ].join("\n"),
  });

  return repoQueryFixture(repo, {
    id: "generated-artifact-decoy",
    title: "Generated-artifact decoy",
    query: "Sandbox Permissions SandboxPermissions Plain-language meaning",
    expected: {
      path: "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md",
      lines: "3-7",
      requiredExcerpt: ["SandboxPermissions", "Plain-language meaning"],
    },
  });
}

async function createHugeSingleLineDecoyFixture(): Promise<BenchmarkFixture> {
  const repo = await createTempRepo({
    "docs/router.md": [
      "# Router",
      "",
      "HUGE_MARKER belongs in bounded target evidence, not generated logs.",
    ].join("\n"),
    "debug.log": `${"HUGE_MARKER generated log noise ".repeat(6000)}HUGE_LOG_TAIL`,
  });

  return repoQueryFixture(repo, {
    id: "huge-single-line-decoy",
    title: "Huge single-line generated/log decoy",
    query: "HUGE_MARKER bounded target evidence",
    expected: {
      path: "docs/router.md",
      lines: "3-3",
      requiredExcerpt: ["HUGE_MARKER belongs in bounded target evidence"],
    },
  });
}

async function createAmbiguousMultiFileFixture(): Promise<BenchmarkFixture> {
  const repo = await createTempRepo({
    "target.md": [
      "# Target",
      "",
      "Adaptive compression keeps vault recovery exact while parser confidence labels routed diagnostics.",
    ].join("\n"),
    "decoy.md": "adaptive ".repeat(900),
    "near-miss.md": "compression vault recovery without parser confidence",
  });

  return repoQueryFixture(repo, {
    id: "ambiguous-multi-file-query",
    title: "Ambiguous multi-file query",
    query: "adaptive compression vault recovery parser confidence",
    expected: {
      path: "target.md",
      lines: "3-3",
      requiredExcerpt: ["Adaptive compression", "vault recovery", "parser confidence"],
    },
  });
}

async function createVaultedOutputFixture(): Promise<BenchmarkFixture> {
  const vaultRoot = await createTempDir("freeflow-router-benchmark-vault-");
  const vault = createVault({ root: vaultRoot.path });
  const sessionId = "benchmark-vault-session";
  const stderr = [
    "setup ok",
    "ASSERTION_FAILED payments badge missing accessible label",
    "stack: renderSettingsBadge at settings.test.ts:42",
  ].join("\n");
  const record = await storeCommandOutput(vault, {
    sessionId,
    command: "npm test -- settings",
    stdout: "",
    stderr,
    executionStatus: "failed",
    exitCode: 1,
    createdAt: "2026-06-16T00:00:00.000Z",
  });
  const expected: BenchmarkExpected = {
    pathIncludes: `${record.outputId}:stderr`,
    lines: "2-2",
    requiredExcerpt: ["ASSERTION_FAILED", "payments badge"],
  };

  return {
    id: "vaulted-output-query",
    title: "Vaulted output query",
    kind: "vault-query",
    expected,
    modes: {
      "native-baseline-proxy": async () => directTextSearchObservation({
        toolPathUsed: "native-baseline-proxy: direct command output text search",
        text: stderr,
        path: `${record.outputId}:stderr`,
        query: "ASSERTION_FAILED payments badge",
        recovery: { status: "not-applicable", detail: "Native direct output has no Freeflow vault recovery contract." },
      }),
      "pre-hardening-freeflow-proxy": async () => directTextSearchObservation({
        toolPathUsed: "pre-hardening-freeflow-proxy: simple vaulted line scanner",
        text: stderr,
        path: `${record.outputId}:stderr`,
        query: "ASSERTION_FAILED payments badge",
        recovery: { status: "failed", detail: "Baseline proxy does not expose structured recovery metadata." },
      }),
      "improved-freeflow-router": async () => improvedRetrieveObservation(
        await freeflowRetrieve({
          action: "query",
          source: { kind: "vault", root: vaultRoot.path, sessionId, outputId: record.outputId, stream: "stderr" },
          query: "ASSERTION_FAILED payments badge",
          preserve: "important",
        }),
        "improved-freeflow-router: freeflow_retrieve vault query",
        stderr,
        (result) => verifyVaultEvidenceRecovery(vaultRoot.path, sessionId, result),
      ),
    },
    cleanup: vaultRoot.cleanup,
  };
}

async function createExpansionFixture(): Promise<BenchmarkFixture> {
  const body = [
    "# Expansion Target",
    "",
    "EXPANSION_START router evidence begins here.",
    ...Array.from({ length: 20 }, (_, index) => `expansion context line ${index + 1}`),
    "EXPANSION_END router evidence is complete here.",
  ];
  const repo = await createTempRepo({
    "target.md": body.join("\n"),
    "decoy.md": "EXPANSION_START ".repeat(200),
  });
  const query = "EXPANSION_START router evidence";
  const expected: BenchmarkExpected = {
    path: "target.md",
    lines: "1-24",
    requiredExcerpt: ["EXPANSION_START", "EXPANSION_END"],
  };

  return {
    id: "expand-narrow-evidence",
    title: "Expansion from narrow evidence to complete block",
    kind: "repo-expand",
    expected,
    modes: {
      "native-baseline-proxy": async () => directFileObservation(repo.path, "target.md", {
        toolPathUsed: "native-baseline-proxy: direct whole-file read",
        recovery: { status: "not-applicable", detail: "Native read is exact direct output, not routed recovery." },
      }),
      "pre-hardening-freeflow-proxy": async () => repoBaselineObservation(repo.path, query, {
        toolPathUsed: "pre-hardening-freeflow-proxy: narrow lexical line window without expansion",
        skipDirs: LEGACY_SKIP_DIRS,
        recovery: { status: "failed", detail: "Baseline proxy does not expose structured expansion recovery." },
      }),
      "improved-freeflow-router": async () => {
        const queryResult = await freeflowRetrieve({
          action: "query",
          source: { kind: "repo", root: repo.path },
          query,
          preserve: "important",
        });
        const evidence = queryResult.evidence?.[0];
        if (!evidence) {
          return improvedRetrieveObservation(
            queryResult,
            "improved-freeflow-router: freeflow_retrieve query before expand",
            body.join("\n"),
            (result) => verifyRepoEvidenceRecovery(repo.path, result),
          );
        }
        return improvedRetrieveObservation(
          await freeflowRetrieve({
            action: "expand",
            source: { kind: "repo", root: repo.path },
            evidence,
            expansion: "lines_30",
            preserve: "important",
          }),
          "improved-freeflow-router: freeflow_retrieve expand lines_30",
          body.join("\n"),
          (result) => verifyRepoEvidenceRecovery(repo.path, result),
        );
      },
    },
    cleanup: repo.cleanup,
  };
}

function repoQueryFixture(
  repo: TempResource,
  options: { id: string; title: string; query: string; expected: BenchmarkExpected },
): BenchmarkFixture {
  return {
    id: options.id,
    title: options.title,
    kind: "repo-query",
    expected: options.expected,
    modes: {
      "native-baseline-proxy": async () => repoBaselineObservation(repo.path, options.query, {
        toolPathUsed: "native-baseline-proxy: recursive text scan (rg/read proxy)",
        skipDirs: new Set<string>(),
        recovery: { status: "not-applicable", detail: "Native proxy returns direct text without Freeflow recovery metadata." },
      }),
      "pre-hardening-freeflow-proxy": async () => repoBaselineObservation(repo.path, options.query, {
        toolPathUsed: "pre-hardening-freeflow-proxy: legacy line scorer",
        skipDirs: LEGACY_SKIP_DIRS,
        recovery: { status: "failed", detail: "Baseline proxy does not expose structured recovery metadata." },
      }),
      "improved-freeflow-router": async () => improvedRetrieveObservation(
        await freeflowRetrieve({
          action: "query",
          source: { kind: "repo", root: repo.path },
          query: options.query,
          preserve: "important",
        }),
        "improved-freeflow-router: freeflow_retrieve query",
        await readRepoBytes(repo.path),
        (result) => verifyRepoEvidenceRecovery(repo.path, result),
      ),
    },
    cleanup: repo.cleanup,
  };
}

async function repoBaselineObservation(
  root: string,
  query: string,
  options: { toolPathUsed: string; skipDirs: ReadonlySet<string>; recovery: RecoveryResult },
): Promise<BenchmarkObservation> {
  const files = await collectTextFiles(root, options.skipDirs);
  const hit = findBestLineHit(files, query);
  const rawBytes = byteLength(files.map((file) => file.text).join("\n"));
  if (!hit) {
    return {
      toolPathUsed: options.toolPathUsed,
      rawBytes,
      routedBytes: 0,
      excerpt: "",
      recovery: options.recovery,
      notes: ["no lexical hit"],
    };
  }

  const range = contextRange(hit.file.lines, hit.lineIndex);
  const excerpt = hit.file.lines.slice(range.start - 1, range.end).join("\n");
  return {
    toolPathUsed: options.toolPathUsed,
    rawBytes,
    routedBytes: byteLength(excerpt),
    actualPath: hit.file.path,
    actualLines: `${range.start}-${range.end}`,
    excerpt,
    recovery: options.recovery,
    notes: [`score=${hit.score.toFixed(2)}`],
  };
}

async function directFileObservation(
  root: string,
  path: string,
  options: { toolPathUsed: string; recovery: RecoveryResult },
): Promise<BenchmarkObservation> {
  const text = await readFile(resolve(root, path), "utf8");
  const lines = splitLines(text);
  return {
    toolPathUsed: options.toolPathUsed,
    rawBytes: byteLength(text),
    routedBytes: byteLength(text),
    actualPath: path,
    actualLines: `1-${lines.length}`,
    excerpt: text,
    recovery: options.recovery,
  };
}

async function directTextSearchObservation(options: {
  toolPathUsed: string;
  text: string;
  path: string;
  query: string;
  recovery: RecoveryResult;
}): Promise<BenchmarkObservation> {
  const file: TextFile = { path: options.path, text: options.text, lines: splitLines(options.text) };
  const hit = findBestLineHit([file], options.query);
  if (!hit) {
    return {
      toolPathUsed: options.toolPathUsed,
      rawBytes: byteLength(options.text),
      routedBytes: 0,
      excerpt: "",
      recovery: options.recovery,
      notes: ["no lexical hit"],
    };
  }

  const range = contextRange(file.lines, hit.lineIndex);
  const excerpt = file.lines.slice(range.start - 1, range.end).join("\n");
  return {
    toolPathUsed: options.toolPathUsed,
    rawBytes: byteLength(options.text),
    routedBytes: byteLength(excerpt),
    actualPath: options.path,
    actualLines: `${range.start}-${range.end}`,
    excerpt,
    recovery: options.recovery,
    notes: [`score=${hit.score.toFixed(2)}`],
  };
}

async function improvedRetrieveObservation(
  result: RetrievalRoutedResult,
  toolPathUsed: string,
  rawSource: string,
  verifyRecovery?: RecoveryVerifier,
): Promise<BenchmarkObservation> {
  const evidence = result.evidence?.[0];
  const excerpt = result.evidence?.map((packet) => packet.excerpt).join("\n") ?? "";
  const recoveryGuidancePresent = Boolean(
    result.recovery?.how && (result.recovery.outputId || result.recovery.evidenceId || result.evidence?.some((packet) => packet.expandable)),
  );
  const notes = [result.routing.reason];
  if (result.evidence && result.evidence.length > 1) {
    notes.push(`evidencePackets=${result.evidence.length}`);
  }

  let recovery: RecoveryResult = recoveryGuidancePresent
    ? { status: "passed", detail: result.recovery?.how ?? "Routed result exposes recovery guidance." }
    : { status: "failed", detail: "Routed result did not expose recovery guidance." };
  if (recoveryGuidancePresent && verifyRecovery) {
    recovery = await verifyRecovery(result);
    notes.push(`recovery=${recovery.status}: ${recovery.detail}`);
  }

  return {
    toolPathUsed,
    rawBytes: byteLength(rawSource),
    routedBytes: byteLength(JSON.stringify(result)),
    ...(evidence?.path ? { actualPath: evidence.path } : {}),
    ...(evidence?.lines ? { actualLines: evidence.lines } : {}),
    excerpt,
    recovery,
    notes,
  };
}

async function verifyRepoEvidenceRecovery(root: string, result: RetrievalRoutedResult): Promise<RecoveryResult> {
  const evidence = result.evidence?.[0];
  if (!evidence?.path || !evidence.lines) {
    return { status: "failed", detail: "No repo evidence path/lines available for recovery verification." };
  }

  const range = parseRange(evidence.lines);
  if (!range) {
    return { status: "failed", detail: `Unsupported repo evidence range ${evidence.lines}.` };
  }

  const recovered = await freeflowRetrieve({
    action: "retrieve",
    source: { kind: "repo", root, path: evidence.path },
    lineRange: range,
    preserve: "full",
  });
  return verifyRecoveredEvidence(recovered, evidence, `Verified repo retrieve ${evidence.path}:${evidence.lines}.`);
}

async function verifyVaultEvidenceRecovery(
  vaultRoot: string,
  sessionId: string,
  result: RetrievalRoutedResult,
): Promise<RecoveryResult> {
  const evidence = result.evidence?.[0];
  if (!evidence?.lines || evidence.source.kind !== "vault") {
    return { status: "failed", detail: "No vault evidence outputId/lines available for recovery verification." };
  }

  const range = parseRange(evidence.lines);
  if (!range) {
    return { status: "failed", detail: `Unsupported vault evidence range ${evidence.lines}.` };
  }

  const recovered = await freeflowRetrieve({
    action: "retrieve",
    source: {
      kind: "vault",
      root: vaultRoot,
      sessionId,
      outputId: evidence.source.outputId,
      stream: evidence.source.stream ?? "combined",
    },
    lineRange: range,
    preserve: "full",
  });
  return verifyRecoveredEvidence(
    recovered,
    evidence,
    `Verified vault retrieve ${evidence.source.outputId}:${evidence.source.stream ?? "combined"}:${evidence.lines}.`,
  );
}

function verifyRecoveredEvidence(
  recovered: RetrievalRoutedResult,
  originalEvidence: EvidencePacket,
  successDetail: string,
): RecoveryResult {
  const recoveredExcerpt = recovered.evidence?.map((packet) => packet.excerpt).join("\n") ?? "";
  const anchor = firstRecoveryAnchor(originalEvidence.excerpt);
  if (recovered.toolStatus !== "ok" || recovered.evidence?.length !== 1) {
    return { status: "failed", detail: "Recovery retrieve did not return one ok evidence packet." };
  }
  if (anchor && !recoveredExcerpt.includes(anchor)) {
    return { status: "failed", detail: "Recovery retrieve did not include the original evidence anchor." };
  }
  return { status: "passed", detail: successDetail };
}

function firstRecoveryAnchor(excerpt: string): string {
  return splitLines(excerpt)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.slice(0, 80) ?? "";
}

function scoreCorrectness(expected: BenchmarkExpected, observation: BenchmarkObservation): CorrectnessResult {
  if (observation.skipped) {
    return {
      passed: false,
      pathCorrect: false,
      spanCorrect: false,
      excerptComplete: false,
      generatedFalsePositive: false,
    };
  }

  const pathCorrect = expected.path
    ? observation.actualPath === expected.path
    : expected.pathIncludes
      ? Boolean(observation.actualPath?.includes(expected.pathIncludes))
      : true;
  const spanCorrect = expected.lines
    ? Boolean(observation.actualLines && rangesOverlap(expected.lines, observation.actualLines))
    : true;
  const excerptComplete = (expected.requiredExcerpt ?? []).every((snippet) =>
    observation.excerpt.toLowerCase().includes(snippet.toLowerCase()),
  );
  const generatedFalsePositive = observation.actualPath ? isGeneratedBenchmarkPath(observation.actualPath) : false;
  const passed = pathCorrect && spanCorrect && excerptComplete && !generatedFalsePositive;

  return {
    passed,
    pathCorrect,
    spanCorrect,
    excerptComplete,
    generatedFalsePositive,
  };
}

async function createTempRepo(files: Record<string, string>): Promise<TempResource> {
  const root = await createTempDir("freeflow-router-benchmark-repo-");
  for (const [path, text] of Object.entries(files)) {
    const absolutePath = resolve(root.path, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, text, "utf8");
  }
  return root;
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

async function collectTextFiles(root: string, skipDirs: ReadonlySet<string>): Promise<TextFile[]> {
  const files: TextFile[] = [];
  await collectTextFilesInto(resolve(root), resolve(root), skipDirs, files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectTextFilesInto(root: string, currentPath: string, skipDirs: ReadonlySet<string>, files: TextFile[]) {
  const currentStat = await stat(currentPath);
  const name = currentPath.split(/[\\/]+/).at(-1) ?? currentPath;
  if (currentStat.isDirectory()) {
    if (currentPath !== root && skipDirs.has(name)) {
      return;
    }
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      await collectTextFilesInto(root, resolve(currentPath, entry.name), skipDirs, files);
    }
    return;
  }

  if (!currentStat.isFile()) {
    return;
  }

  const text = await readFile(currentPath, "utf8");
  if (text.includes("\0")) {
    return;
  }

  files.push({
    path: normalizeRelativePath(relative(root, currentPath)),
    text,
    lines: splitLines(text),
  });
}

function findBestLineHit(files: readonly TextFile[], query: string): LineHit | null {
  const tokens = tokenize(query);
  let best: LineHit | null = null;

  for (const file of files) {
    const pathScore = scoreText(file.path, tokens);
    file.lines.forEach((line, lineIndex) => {
      const lineScore = scoreText(line, tokens);
      const headingBonus = line.trimStart().startsWith("#") ? 2 : 0;
      const score = lineScore * 4 + pathScore + headingBonus;
      if (score <= 0) {
        return;
      }
      if (!best || score > best.score) {
        best = { file, lineIndex, score };
      }
    });
  }

  return best;
}

function contextRange(lines: readonly string[], lineIndex: number): { start: number; end: number } {
  return {
    start: Math.max(1, lineIndex + 1 - DEFAULT_CONTEXT_LINES),
    end: Math.min(lines.length, lineIndex + 1 + DEFAULT_CONTEXT_LINES),
  };
}

async function readRepoBytes(root: string): Promise<string> {
  const files = await collectTextFiles(root, new Set<string>());
  return files.map((file) => file.text).join("\n");
}

function rangesOverlap(left: string, right: string): boolean {
  const leftRange = parseRange(left);
  const rightRange = parseRange(right);
  if (!leftRange || !rightRange) {
    return false;
  }
  return leftRange.start <= rightRange.end && rightRange.start <= leftRange.end;
}

function parseRange(range: string): { start: number; end: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(range);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  return Number.isInteger(start) && Number.isInteger(end) ? { start, end } : null;
}

function isGeneratedBenchmarkPath(path: string): boolean {
  const segments = path.split(/[\\/]+/);
  if (segments.some((segment) => GENERATED_DIRS.has(segment))) {
    return true;
  }

  const name = segments.at(-1)?.toLowerCase() ?? path.toLowerCase();
  return name.endsWith(".log") || name.endsWith(".map") || name.endsWith(".min.js") || name.endsWith(".min.css") || name.includes(".bundle.");
}

function scoreText(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase();
  return tokens.reduce((score, token) => score + countOccurrences(lower, token), 0);
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let index = text.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function formatCorrectnessChecks(correctness: CorrectnessResult): string {
  return [
    `path ${correctness.pathCorrect ? "✓" : "✗"}`,
    `span ${correctness.spanCorrect ? "✓" : "✗"}`,
    `excerpt ${correctness.excerptComplete ? "✓" : "✗"}`,
    `gen-fp ${correctness.generatedFalsePositive ? "✗" : "✓"}`,
  ].join(" ");
}

function benchmarkModes(): BenchmarkMode[] {
  return ["native-baseline-proxy", "pre-hardening-freeflow-proxy", "improved-freeflow-router"];
}

function skippedObservation(toolPathUsed: string, reason: string): BenchmarkObservation {
  return {
    toolPathUsed,
    rawBytes: 0,
    routedBytes: 0,
    excerpt: "",
    recovery: { status: "skipped", detail: reason },
    skipped: true,
    skipReason: reason,
  };
}

function normalizeRelativePath(path: string): string {
  return path.split(/[/\\]+/).filter(Boolean).join("/");
}

function defaultReportPath(): string {
  return resolve(process.cwd(), "evals/reports/runtime/output-router-benchmark-1-report.md");
}

async function runCli() {
  const { iterations, reportPath, jsonReportPath } = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: defaultReportPath() });
  const options: RunRouterBenchmarksOptions = {};
  if (iterations !== undefined) {
    options.iterations = iterations;
  }
  const report = await runRouterBenchmarks(options);
  const reports = await writeRouterBenchmarkReports(report, reportPath, {
    jsonReportPath: jsonReportPath === undefined ? defaultJsonRunReportPath(reportPath) : jsonReportPath,
  });
  const shortId = createHash("sha256").update(JSON.stringify(report.summary)).digest("hex").slice(0, 8);
  console.log(`Freeflow router benchmark ${shortId}: improved ${report.summary.improved.passed}/${report.summary.fixtures} pass`);
  console.log(`Markdown report: ${reports.markdown}`);
  if (reports.json) {
    console.log(`JSON run data: ${reports.json}`);
  }
  if (report.summary.improved.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runCli();
}
