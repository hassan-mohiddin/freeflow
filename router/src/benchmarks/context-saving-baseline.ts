import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  approximateTokens,
  defaultJsonRunReportPath,
  escapeMarkdownTableCell as escapeTable,
  formatPercent,
  parseBenchmarkCliArgs,
  reductionPercent,
  writeBenchmarkReportPair,
} from "./benchmark-harness.js";
import { freeflowDerive } from "../tools/derive.js";
import { freeflowRetrieve } from "../tools/retrieve.js";
import { freeflowRun, type HostCommandRunResult } from "../tools/run.js";

export interface RunContextSavingBaselineOptions {
  generatedAt?: string;
}

export interface ContextSavingBaselineReport {
  generatedAt: string;
  summary: ContextSavingBaselineSummary;
  observations: ContextSavingBaselineObservation[];
  guardrails: ContextSavingGuardrail[];
  notes: string[];
}

export interface ContextSavingBaselineSummary {
  fixtures: number;
  factsPreserved: number;
  recoveryAvailable: number;
  totalRawBytes: number;
  totalModelVisibleBytes: number;
  totalDetailsPayloadBytes: number;
  totalRawTokensApprox: number;
  totalModelVisibleTokensApprox: number;
  totalDetailsPayloadTokensApprox: number;
  weightedModelVisibleReductionPercent: number;
}

export interface ContextSavingBaselineObservation {
  id: string;
  title: string;
  tool: "freeflow_run" | "freeflow_retrieve" | "freeflow_derive";
  action: string;
  rawBytes: number;
  modelVisibleBytes: number;
  detailsPayloadBytes: number;
  rawTokensApprox: number;
  modelVisibleTokensApprox: number;
  detailsPayloadTokensApprox: number;
  modelVisibleReductionPercent: number;
  factsPreserved: boolean;
  recoveryAvailable: boolean;
  recoveryHint: string;
  status: string;
  outputId?: string;
  evidenceLocations: string[];
  notes: string[];
}

export interface ContextSavingGuardrail {
  path: string;
  behaviors: string[];
}

interface TempResource {
  path: string;
  cleanup: () => Promise<void>;
}

interface ObservationInput {
  id: string;
  title: string;
  tool: ContextSavingBaselineObservation["tool"];
  action: string;
  rawBytes: number;
  result: unknown;
  requiredFacts: string[];
  notes?: string[];
}

const REPO_DOC_TEXT = `# Output Router Architecture

Freeflow captures raw command stdout and stderr outside model context.

Exact recovery uses outputId handles and line ranges so future agents can retrieve source evidence.

Parser decisions stay structured in details.result while model-visible text can become compact.

Batch intermediates should be stored without flooding the model context.
`;

const COMMAND_STDOUT = [
  "FAIL packages/auth/auth.test.ts",
  "  ● refresh token keeps AUTH_TOKEN scoped",
  "    Expected AUTH_TOKEN to be redacted before logging",
  "PASS packages/router/run.test.ts",
  "PASS packages/router/retrieve.test.ts",
  "Tests:       1 failed, 24 passed, 25 total",
  "Snapshots:   0 total",
  "Time:        4.21 s",
  "Ran all test suites.",
].join("\n");

const COMMAND_STDERR = [
  "Error: ROUTER_BENCH_FAILED",
  "    at refreshToken (packages/auth/auth.ts:42:11)",
  "    at main (packages/auth/auth.test.ts:8:3)",
].join("\n");

const GUARDED_FIXTURES: ContextSavingGuardrail[] = [
  {
    path: "router/tests/run.test.js",
    behaviors: [
      "freeflowRun parser/recovery behavior",
      "duplicate output compaction",
      "exact failure and verification evidence preservation",
    ],
  },
  {
    path: "router/tests/retrieve.test.js",
    behaviors: [
      "exact repo path/range retrieval",
      "exact vault line retrieval",
      "vault-wide query/locate",
      "repo/vault expand and explain behavior",
    ],
  },
  {
    path: "router/tests/derive.test.js",
    behaviors: [
      "deterministic derive operations",
      "derived-output lineage and exact recovery",
      "structured failures for invalid operations and missing sources",
    ],
  },
  {
    path: "router/tests/pi-extension.test.js",
    behaviors: [
      "public Pi tool schemas",
      "content/details result contract",
      "compact and expanded TUI renderers",
    ],
  },
  {
    path: "router/tests/pi-extension-derive.test.js",
    behaviors: [
      "script derive disabled-by-default behavior",
      "adapter-unavailable behavior",
      "proof-backed adapter execution path",
    ],
  },
  {
    path: "router/tests/regression-fixtures.test.js",
    behaviors: [
      "generated decoy avoidance",
      "huge-line bounded evidence",
      "exact phrase and source-prior retrieval regressions",
    ],
  },
  {
    path: "router/tests/vault-index.test.js",
    behaviors: [
      "command/native/observed/derived vault record indexing",
      "metadata-only indexing without raw recovery claims",
      "retention and degraded-index behavior",
    ],
  },
];

export async function runContextSavingBaseline(
  options: RunContextSavingBaselineOptions = {},
): Promise<ContextSavingBaselineReport> {
  const root = await createTempDir("freeflow-context-saving-baseline-");
  const repoRoot = join(root.path, "repo");
  const vaultRoot = join(root.path, "vault");
  const sessionId = "context-saving-baseline";

  try {
    await mkdir(join(repoRoot, "plugin-docs"), { recursive: true });
    await writeFile(join(repoRoot, "plugin-docs/output-router.md"), REPO_DOC_TEXT, "utf8");

    const commandRawBytes = byteLength(`${COMMAND_STDOUT}\n${COMMAND_STDERR}\n`);
    const runResult = await freeflowRun(
      {
        command: "npm test -- --runInBand",
        sessionId,
        vaultRoot,
        preserve: "important",
        goal: "baseline model-visible output size",
      },
      {
        async run(): Promise<HostCommandRunResult> {
          return {
            stdout: `${COMMAND_STDOUT}\n`,
            stderr: `${COMMAND_STDERR}\n`,
            combined: `STDOUT:\n${COMMAND_STDOUT}\n\nSTDERR:\n${COMMAND_STDERR}\n`,
            executionStatus: "failed",
            exitCode: 1,
            durationMs: 4210,
          };
        },
      },
    );

    const outputId = typeof runResult.outputId === "string" ? runResult.outputId : "";
    const observations: ContextSavingBaselineObservation[] = [];
    observations.push(
      makeObservation({
        id: "run-failed-test-output",
        title: "freeflow_run failed test output",
        tool: "freeflow_run",
        action: "run",
        rawBytes: commandRawBytes,
        result: runResult,
        requiredFacts: ["ROUTER_BENCH_FAILED", "failed", "ffout_"],
        notes: ["Current Pi model-visible text is the full pretty-printed routed result JSON."],
      }),
    );

    const repoQueryResult = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root: repoRoot },
      query: "Exact recovery outputId line ranges parser decisions",
      topK: 1,
      preserve: "important",
    });
    observations.push(
      makeObservation({
        id: "retrieve-repo-query",
        title: "freeflow_retrieve repo query",
        tool: "freeflow_retrieve",
        action: "query repo",
        rawBytes: byteLength(REPO_DOC_TEXT),
        result: repoQueryResult,
        requiredFacts: ["outputId", "line ranges", "details.result"],
      }),
    );

    const repoExactResult = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root: repoRoot, path: "plugin-docs/output-router.md" },
      lineRange: { start: 3, end: 5 },
      preserve: "full",
    });
    observations.push(
      makeObservation({
        id: "retrieve-repo-exact-range",
        title: "freeflow_retrieve exact repo range",
        tool: "freeflow_retrieve",
        action: "retrieve repo range",
        rawBytes: byteLength(REPO_DOC_TEXT),
        result: repoExactResult,
        requiredFacts: ["stdout", "stderr", "line ranges"],
        notes: ["This guards the existing public advanced path/range recovery behavior."],
      }),
    );

    if (outputId) {
      const vaultQueryResult = await freeflowRetrieve({
        action: "query",
        source: { kind: "vault", root: vaultRoot, sessionId, outputId, stream: "combined" },
        query: "ROUTER_BENCH_FAILED",
        topK: 1,
        preserve: "important",
      });
      observations.push(
        makeObservation({
          id: "retrieve-vault-query",
          title: "freeflow_retrieve vault query",
          tool: "freeflow_retrieve",
          action: "query vault",
          rawBytes: commandRawBytes,
          result: vaultQueryResult,
          requiredFacts: ["ROUTER_BENCH_FAILED", outputId],
        }),
      );

      const deriveResult = await freeflowDerive({
        source: { kind: "vault", outputId, stream: "combined" },
        operation: { kind: "regexFilter", pattern: "AUTH_TOKEN|ROUTER_BENCH_FAILED|Tests:", maxMatches: 10 },
        sessionId,
        vaultRoot,
        preserve: "important",
      });
      observations.push(
        makeObservation({
          id: "derive-regex-filter",
          title: "freeflow_derive regexFilter",
          tool: "freeflow_derive",
          action: "regexFilter vault",
          rawBytes: commandRawBytes,
          result: deriveResult,
          requiredFacts: ["AUTH_TOKEN", "ROUTER_BENCH_FAILED", "regexFilter"],
        }),
      );
    }

    return {
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      summary: summarizeObservations(observations),
      observations,
      guardrails: GUARDED_FIXTURES,
      notes: [
        "This is a Slice 0 baseline for current Freeflow-owned tools before compact-output redesign.",
        "Model-visible bytes use the current Pi routedToolText shape: JSON.stringify(result, null, 2).",
        "Details payload bytes use the current Pi details shape: { result } with the same structured result.",
        "Negative reduction means the current routed JSON is larger than the raw fixture bytes; this is expected baseline evidence for compact-output work.",
      ],
    };
  } finally {
    await root.cleanup();
  }
}

export function renderContextSavingBaselineReport(report: ContextSavingBaselineReport): string {
  const date = report.generatedAt.slice(0, 10);
  const lines = [
    "# Freeflow Context-Saving Native Tools Baseline Report - Slice 0",
    "",
    `Date: ${date}`,
    "",
    "## Scope",
    "",
    "Baseline current model-visible output sizes for representative `freeflow_run`, `freeflow_retrieve`, and `freeflow_derive` results before the compact-output redesign.",
    "",
    "The baseline intentionally measures current Pi tool text as pretty-printed routed result JSON. Later slices should reduce model-visible bytes while keeping details and exact recovery available.",
    "",
    "## Summary",
    "",
    `- Fixtures measured: ${report.summary.fixtures}`,
    `- Facts preserved: ${report.summary.factsPreserved}/${report.summary.fixtures}`,
    `- Recovery available: ${report.summary.recoveryAvailable}/${report.summary.fixtures}`,
    `- Raw bytes: ${report.summary.totalRawBytes}`,
    `- Model-visible bytes: ${report.summary.totalModelVisibleBytes}`,
    `- Details payload bytes: ${report.summary.totalDetailsPayloadBytes}`,
    `- Approx raw tokens: ${report.summary.totalRawTokensApprox}`,
    `- Approx model-visible tokens: ${report.summary.totalModelVisibleTokensApprox}`,
    `- Weighted model-visible reduction vs raw: ${formatPercent(report.summary.weightedModelVisibleReductionPercent)}`,
    "",
    "## Measurements",
    "",
    "| Fixture | Tool | Action | Raw bytes | Model-visible bytes | Details bytes | Reduction vs raw | Facts | Recovery | Status |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |",
  ];

  for (const observation of report.observations) {
    lines.push(
      `| ${escapeTable(observation.id)} | ${observation.tool} | ${escapeTable(observation.action)} | ${observation.rawBytes} | ${observation.modelVisibleBytes} | ${observation.detailsPayloadBytes} | ${formatPercent(observation.modelVisibleReductionPercent)} | ${observation.factsPreserved ? "yes" : "no"} | ${observation.recoveryAvailable ? "yes" : "no"} | ${escapeTable(observation.status)} |`,
    );
  }

  lines.push("", "## Recovery And Evidence Handles", "");
  for (const observation of report.observations) {
    lines.push(`### ${observation.id}`);
    if (observation.outputId) {
      lines.push(`- outputId: \`${observation.outputId}\``);
    }
    lines.push(`- recovery: ${observation.recoveryHint || "none"}`);
    if (observation.evidenceLocations.length > 0) {
      lines.push(`- evidence: ${observation.evidenceLocations.map((item) => `\`${item}\``).join(", ")}`);
    }
    for (const note of observation.notes) {
      lines.push(`- note: ${note}`);
    }
    lines.push("");
  }

  lines.push("## Guardrail Inventory", "");
  lines.push("Existing tests/fixtures that must remain stable during the redesign:", "");
  for (const guardrail of report.guardrails) {
    lines.push(`- \`${guardrail.path}\``);
    for (const behavior of guardrail.behaviors) {
      lines.push(`  - ${behavior}`);
    }
  }

  lines.push("", "## Notes", "");
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function writeContextSavingBaselineReport(
  report: ContextSavingBaselineReport,
  markdownReportPath: string,
  options: { jsonReportPath?: string | false } = {},
): Promise<{ markdown: string; json?: string }> {
  return writeBenchmarkReportPair({
    report,
    markdownReportPath,
    jsonReportPath: options.jsonReportPath,
    renderMarkdown: renderContextSavingBaselineReport,
  });
}

function makeObservation(input: ObservationInput): ContextSavingBaselineObservation {
  const modelVisibleText = currentPiModelVisibleText(input.result);
  const detailsPayloadText = JSON.stringify({ result: input.result }, null, 2);
  const modelVisibleBytes = byteLength(modelVisibleText);
  const detailsPayloadBytes = byteLength(detailsPayloadText);
  const evidenceLocations = resultEvidenceLocations(input.result);
  const recoveryHint = resultRecoveryHint(input.result);
  const outputId = resultOutputId(input.result);
  const observation: ContextSavingBaselineObservation = {
    id: input.id,
    title: input.title,
    tool: input.tool,
    action: input.action,
    rawBytes: input.rawBytes,
    modelVisibleBytes,
    detailsPayloadBytes,
    rawTokensApprox: approximateTokens(input.rawBytes),
    modelVisibleTokensApprox: approximateTokens(modelVisibleBytes),
    detailsPayloadTokensApprox: approximateTokens(detailsPayloadBytes),
    modelVisibleReductionPercent: reductionPercent(input.rawBytes, modelVisibleBytes),
    factsPreserved: input.requiredFacts.every((fact) => modelVisibleText.includes(fact) || detailsPayloadText.includes(fact)),
    recoveryAvailable: Boolean(recoveryHint || outputId || evidenceLocations.length > 0),
    recoveryHint,
    status: resultStatus(input.result),
    evidenceLocations,
    notes: input.notes ?? [],
  };
  if (outputId) {
    observation.outputId = outputId;
  }
  return observation;
}

function summarizeObservations(observations: readonly ContextSavingBaselineObservation[]): ContextSavingBaselineSummary {
  const totalRawBytes = observations.reduce((sum, observation) => sum + observation.rawBytes, 0);
  const totalModelVisibleBytes = observations.reduce((sum, observation) => sum + observation.modelVisibleBytes, 0);
  const totalDetailsPayloadBytes = observations.reduce((sum, observation) => sum + observation.detailsPayloadBytes, 0);
  return {
    fixtures: observations.length,
    factsPreserved: observations.filter((observation) => observation.factsPreserved).length,
    recoveryAvailable: observations.filter((observation) => observation.recoveryAvailable).length,
    totalRawBytes,
    totalModelVisibleBytes,
    totalDetailsPayloadBytes,
    totalRawTokensApprox: approximateTokens(totalRawBytes),
    totalModelVisibleTokensApprox: approximateTokens(totalModelVisibleBytes),
    totalDetailsPayloadTokensApprox: approximateTokens(totalDetailsPayloadBytes),
    weightedModelVisibleReductionPercent: reductionPercent(totalRawBytes, totalModelVisibleBytes),
  };
}

function currentPiModelVisibleText(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function resultStatus(result: unknown): string {
  const value = asRecord(result);
  if (!value) {
    return "unknown";
  }
  const statuses = [
    stringAt(value, "toolStatus"),
    stringAt(asRecord(value.execution), "status"),
    stringAt(asRecord(value.routing), "status"),
  ].filter((status): status is string => Boolean(status));
  return statuses.join("/") || "unknown";
}

function resultOutputId(result: unknown): string {
  const value = asRecord(result);
  const outputId = stringAt(value, "outputId");
  if (outputId) {
    return outputId;
  }
  return stringAt(asRecord(value?.recovery), "outputId") ?? "";
}

function resultRecoveryHint(result: unknown): string {
  const value = asRecord(result);
  return stringAt(asRecord(value?.recovery), "how") ?? "";
}

function resultEvidenceLocations(result: unknown): string[] {
  const value = asRecord(result);
  const locations: string[] = [];
  const evidence = Array.isArray(value?.evidence) ? value.evidence : [];
  for (const packet of evidence) {
    const record = asRecord(packet);
    if (!record) {
      continue;
    }
    const path = stringAt(record, "path") ?? stringAt(asRecord(record.source), "path") ?? stringAt(asRecord(record.source), "outputId") ?? "evidence";
    const lines = stringAt(record, "lines");
    locations.push(lines ? `${path}:${lines}` : path);
  }

  const importantLines = Array.isArray(value?.importantLines) ? value.importantLines : [];
  for (const line of importantLines) {
    const record = asRecord(line);
    if (!record) {
      continue;
    }
    const stream = stringAt(record, "stream") ?? "stream";
    const linesValue = stringAt(record, "lines") ?? "?";
    locations.push(`${stream}:${linesValue}`);
  }

  return locations;
}

function stringAt(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
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

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function defaultReportPath(): string {
  return resolve(process.cwd(), "evals/reports/runtime/context-saving-native-tools-baseline-1-report.md");
}

async function runCli() {
  const { reportPath, jsonReportPath } = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: defaultReportPath() });
  const report = await runContextSavingBaseline();
  const reports = await writeContextSavingBaselineReport(report, reportPath, {
    jsonReportPath: jsonReportPath === undefined ? defaultJsonRunReportPath(reportPath) : jsonReportPath,
  });
  const shortId = createHash("sha256").update(JSON.stringify(report.summary)).digest("hex").slice(0, 8);
  console.log(
    `Freeflow context-saving baseline ${shortId}: ${report.summary.factsPreserved}/${report.summary.fixtures} facts preserved, ${report.summary.recoveryAvailable}/${report.summary.fixtures} recoverable`,
  );
  console.log(`Markdown report: ${reports.markdown}`);
  if (reports.json) {
    console.log(`JSON run data: ${reports.json}`);
  }
  if (report.summary.factsPreserved !== report.summary.fixtures || report.summary.recoveryAvailable !== report.summary.fixtures) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runCli();
}
