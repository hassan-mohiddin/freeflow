import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
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
import { freeflowRun, type FreeflowRunOptions, type HostCommandRunResult } from "../tools/run.js";
import { createVault, readOutputText } from "../vault/vault.js";
import type { CommandParserMetadata, CommandRoutedResult, ExecutionStatus, PreserveMode, RouterThresholds } from "../config/types.js";

export interface RunCommandBenchmarksOptions {
  iterations?: number;
  generatedAt?: string;
  externalComparators?: readonly CommandBenchmarkExternalComparator[];
}

export interface CommandBenchmarkExternalComparator {
  name: string;
  mode: string;
  run(fixture: CommandBenchmarkFixtureInput): Promise<CommandBenchmarkExternalObservation>;
}

export interface CommandBenchmarkFixtureInput {
  id: string;
  title: string;
  command: string;
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combined: string;
  requiredFacts: string[];
}

export interface CommandBenchmarkExternalObservation {
  routedText: string;
  routedBytes?: number;
  rawBytes?: number;
  parser?: CommandParserMetadata;
  latencyMs?: number;
  notes?: string[];
}

export interface CommandBenchmarkReport {
  generatedAt: string;
  iterations: number;
  summary: CommandBenchmarkSummary;
  fixtures: CommandBenchmarkFixtureResult[];
  skippedExternalTools: CommandSkippedExternalTool[];
}

export interface CommandBenchmarkSummary {
  fixtures: number;
  modeResults: number;
  improved: CommandModeSummary;
  nativeBaseline: CommandModeSummary;
  failedCommandFactsPreserved: boolean;
}

export interface CommandModeSummary {
  passed: number;
  failed: number;
  skipped: number;
  exactFactsPreserved: number;
  recoveryPassed: number;
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

export interface CommandBenchmarkFixtureResult {
  id: string;
  title: string;
  kind: CommandBenchmarkKind;
  expected: CommandBenchmarkExpected;
  results: CommandBenchmarkModeResult[];
}

export interface CommandBenchmarkExpected {
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  requiredFacts: string[];
  failedFactsMustBeExact?: boolean;
}

export interface CommandBenchmarkModeResult {
  mode: CommandBenchmarkMode;
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
  executionStatus?: ExecutionStatus;
  exitCode?: number | null;
  outputId?: string;
  parser?: CommandParserMetadata;
  routedExcerpt: string;
  correctness: CommandCorrectnessResult;
  recovery: CommandBenchmarkRecoveryResult;
  notes: string[];
}

export interface CommandCorrectnessResult {
  passed: boolean;
  statusCorrect: boolean;
  exitCodeCorrect: boolean;
  exactFactsPreserved: boolean;
  failedFactsExact: boolean;
}

export interface CommandBenchmarkRecoveryResult {
  status: "passed" | "failed" | "not-applicable" | "skipped";
  detail: string;
}

export interface CommandSkippedExternalTool {
  name: string;
  reason: string;
}

type CommandBenchmarkKind =
  | "noisy-success"
  | "failed-stack"
  | "test-summary"
  | "diagnostics"
  | "git-output"
  | "repetitive-log"
  | "huge-json-table"
  | "repeated-output";
type BuiltInCommandBenchmarkMode = "native-baseline-proxy" | "improved-freeflow-run";
type CommandBenchmarkMode = BuiltInCommandBenchmarkMode | string;

type CommandFixtureRun = () => Promise<CommandBenchmarkObservation>;

interface CommandBenchmarkFixture {
  id: string;
  title: string;
  kind: CommandBenchmarkKind;
  expected: CommandBenchmarkExpected;
  modes: Record<string, CommandFixtureRun>;
}

interface CommandFixtureDefinition extends CommandBenchmarkFixtureInput {
  kind: CommandBenchmarkKind;
  failedFactsMustBeExact?: boolean;
  preserve?: PreserveMode;
  goal?: string;
  thresholds?: Partial<RouterThresholds>;
  durationMs?: number;
  repeatRuns?: number;
  notes?: string[];
}

interface CommandBenchmarkObservation {
  toolPathUsed: string;
  rawBytes: number;
  routedBytes: number;
  executionStatus?: ExecutionStatus;
  exitCode?: number | null;
  outputId?: string;
  parser?: CommandParserMetadata;
  routedExcerpt: string;
  recovery: CommandBenchmarkRecoveryResult;
  notes?: string[];
  skipped?: boolean;
  skipReason?: string;
}

interface TempResource {
  path: string;
  cleanup: () => Promise<void>;
}

const DEFAULT_ITERATIONS = 3;
const DEFAULT_SKIPPED_EXTERNAL_TOOLS: CommandSkippedExternalTool[] = [
  {
    name: "RTK",
    reason: "Optional command compressor comparator is skipped unless a caller supplies a configured comparator hook.",
  },
  {
    name: "Squeez",
    reason: "Optional session/output compressor comparator is skipped unless a caller supplies a configured comparator hook.",
  },
];

export async function runCommandBenchmarks(options: RunCommandBenchmarksOptions = {}): Promise<CommandBenchmarkReport> {
  const iterations = normalizeIterations(options.iterations, DEFAULT_ITERATIONS);
  const vaultRoot = await createTempDir("freeflow-router-command-benchmark-vault-");
  const externalComparators = options.externalComparators ?? [];
  const fixtures = createCommandBenchmarkFixtures(vaultRoot.path, externalComparators);

  try {
    const fixtureResults: CommandBenchmarkFixtureResult[] = [];
    for (const fixture of fixtures) {
      const results: CommandBenchmarkModeResult[] = [];
      for (const mode of commandBenchmarkModes(externalComparators)) {
        results.push(await runCommandFixtureMode(fixture, mode, iterations));
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
      summary: summarizeCommandReport(fixtureResults),
      fixtures: fixtureResults,
      skippedExternalTools: skippedExternalTools(externalComparators),
    };
  } finally {
    await vaultRoot.cleanup();
  }
}

export function renderCommandBenchmarkReport(report: CommandBenchmarkReport): string {
  const date = report.generatedAt.slice(0, 10);
  const lines = [
    "# Output Router Command Benchmark Report - Iteration 1",
    "",
    `Date: ${date}`,
    "",
    "## Scope",
    "",
    "Deterministic, CI-friendly command-output benchmark for `freeflow_run`. The runner compares native direct output against the improved Freeflow command router and records optional RTK/Squeez comparators as skipped unless a caller supplies configured comparator hooks.",
    "",
    "Reduction percentages compare routed/context bytes and approximate tokens against raw command output bytes for each fixture. Correctness is gated on execution status, exit code, exact key fact preservation, and Freeflow raw vault recovery.",
    "",
    "## Command",
    "",
    "```sh",
    "npm run bench:router:commands",
    "```",
    "",
    "The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.",
    "",
    "## Summary",
    "",
    `- Iterations per mode: ${report.iterations}`,
    `- Fixtures: ${report.summary.fixtures}`,
    `- Improved Freeflow run gated pass: ${report.summary.improved.passed}/${report.summary.fixtures}`,
    `- Native baseline proxy pass: ${report.summary.nativeBaseline.passed}/${report.summary.fixtures}`,
    `- Improved exact fact preservation: ${report.summary.improved.exactFactsPreserved}/${report.summary.fixtures}`,
    `- Improved recovery pass: ${report.summary.improved.recoveryPassed}/${report.summary.fixtures}`,
    `- Improved weighted byte/token reduction: ${formatPercent(report.summary.improved.weightedByteReductionPercent)} / ${formatPercent(report.summary.improved.weightedTokenReductionPercent)} (${report.summary.improved.totalRawBytes}/${report.summary.improved.totalRawTokensApprox} raw to ${report.summary.improved.totalRoutedBytes}/${report.summary.improved.totalRoutedTokensApprox} routed)`,
    `- Improved average byte/token reduction: ${formatPercent(report.summary.improved.averageByteReductionPercent)} / ${formatPercent(report.summary.improved.averageTokenReductionPercent)}`,
    `- Improved median byte/token reduction: ${formatPercent(report.summary.improved.medianByteReductionPercent)} / ${formatPercent(report.summary.improved.medianTokenReductionPercent)}`,
    `- Failed command facts preserved: ${report.summary.failedCommandFactsPreserved ? "yes" : "no"}`,
    "",
    "## Command Output Fixtures",
    "",
    "| fixture | mode | correctness | checks | status/code | parser | raw bytes/tokens | routed bytes/tokens | byte/token reduction | latency p50/p95 ms | recovery | outputId | notes |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |",
  ];

  for (const fixture of report.fixtures) {
    for (const result of fixture.results) {
      const correctness = result.skipped ? "skipped" : result.correctness.passed ? "pass" : "fail";
      const checks = formatCommandCorrectnessChecks(result.correctness);
      const status = result.executionStatus ? `${result.executionStatus}/${result.exitCode ?? "null"}` : "-";
      const parser = result.parser ? `${result.parser.name} ${result.parser.confidence.toFixed(2)} ${result.parser.fidelity}` : "-";
      const notes = result.notes.length ? result.notes.join("; ") : result.skipReason ?? "";
      lines.push(
        `| ${escapeTable(fixture.id)} | ${escapeTable(result.mode)} | ${correctness} | ${escapeTable(checks)} | ${escapeTable(status)} | ${escapeTable(parser)} | ${result.rawBytes}/${result.rawTokensApprox} | ${result.routedBytes}/${result.routedTokensApprox} | ${formatPercent(result.byteReductionPercent)}/${formatPercent(result.tokenReductionPercent)} | ${result.latencyMs.p50.toFixed(2)}/${result.latencyMs.p95.toFixed(2)} | ${escapeTable(result.recovery.status)} | ${escapeTable(result.outputId ?? "-")} | ${escapeTable(notes)} |`,
      );
    }
  }

  lines.push(
    "",
    "## Skipped Optional Command Compressors",
    "",
  );
  if (report.skippedExternalTools.length === 0) {
    lines.push("- None. All supplied optional comparator hooks ran.");
  } else {
    for (const tool of report.skippedExternalTools) {
      lines.push(`- ${tool.name}: ${tool.reason}`);
    }
  }

  lines.push(
    "",
    "## Regression Status",
    "",
    report.summary.improved.failed === 0
      ? "Improved Freeflow command routing passed all gated command-output benchmark fixtures."
      : `Improved Freeflow command routing failed ${report.summary.improved.failed} gated command-output benchmark fixture(s).`,
    "",
    `Failed command facts preserved: ${report.summary.failedCommandFactsPreserved ? "yes" : "no"}.`,
    "",
  );

  return lines.join("\n");
}

export async function writeCommandBenchmarkReport(report: CommandBenchmarkReport, reportPath: string): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderCommandBenchmarkReport(report), "utf8");
}

export async function writeCommandBenchmarkJsonReport(report: CommandBenchmarkReport, reportPath: string): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export interface WriteCommandBenchmarkReportsOptions {
  jsonReportPath?: string | false;
}

export async function writeCommandBenchmarkReports(
  report: CommandBenchmarkReport,
  markdownReportPath: string,
  options: WriteCommandBenchmarkReportsOptions = {},
): Promise<{ markdown: string; json?: string }> {
  return writeBenchmarkReportPair({
    report,
    markdownReportPath,
    jsonReportPath: options.jsonReportPath,
    renderMarkdown: renderCommandBenchmarkReport,
  });
}

async function runCommandFixtureMode(
  fixture: CommandBenchmarkFixture,
  mode: CommandBenchmarkMode,
  iterations: number,
): Promise<CommandBenchmarkModeResult> {
  const latencies: number[] = [];
  const observations: CommandBenchmarkObservation[] = [];
  const run = fixture.modes[mode];

  if (!run) {
    observations.push(skippedObservation(`optional comparator ${mode}`, `No command benchmark mode registered for ${mode}.`));
  } else {
    for (let index = 0; index < iterations; index += 1) {
      const startedAt = performance.now();
      observations.push(await run());
      latencies.push(performance.now() - startedAt);
    }
  }

  const observation = selectCommandBenchmarkObservation(fixture, observations);

  const correctness = scoreCommandCorrectness(fixture.expected, observation);
  const rawTokensApprox = approximateTokens(observation.rawBytes);
  const routedTokensApprox = approximateTokens(observation.routedBytes);
  const result: CommandBenchmarkModeResult = {
    mode,
    toolPathUsed: observation.toolPathUsed,
    skipped: observation.skipped ?? false,
    rawBytes: observation.rawBytes,
    rawTokensApprox,
    routedBytes: observation.routedBytes,
    routedTokensApprox,
    byteReductionPercent: reductionPercent(observation.rawBytes, observation.routedBytes),
    tokenReductionPercent: reductionPercent(rawTokensApprox, routedTokensApprox),
    latencyMs: latencySummary(latencies),
    routedExcerpt: observation.routedExcerpt,
    correctness,
    recovery: observation.recovery,
    notes: observation.notes ?? [],
  };
  if (observation.skipReason) {
    result.skipReason = observation.skipReason;
  }
  if (observation.executionStatus !== undefined) {
    result.executionStatus = observation.executionStatus;
  }
  if (Object.prototype.hasOwnProperty.call(observation, "exitCode")) {
    result.exitCode = observation.exitCode ?? null;
  }
  if (observation.outputId) {
    result.outputId = observation.outputId;
  }
  if (observation.parser) {
    result.parser = observation.parser;
  }
  return result;
}

function selectCommandBenchmarkObservation(
  fixture: CommandBenchmarkFixture,
  observations: readonly CommandBenchmarkObservation[],
): CommandBenchmarkObservation {
  const firstObservation = observations[0];
  if (firstObservation === undefined) {
    return skippedObservation("command benchmark runner", "No observation was produced.");
  }

  if (fixture.kind === "repeated-output") {
    return observations[observations.length - 1] ?? firstObservation;
  }

  return observations.find((observation) => observation.parser?.name !== "duplicate-output") ?? firstObservation;
}

function summarizeCommandReport(fixtures: CommandBenchmarkFixtureResult[]): CommandBenchmarkSummary {
  const improved = summarizeCommandMode(fixtures, "improved-freeflow-run");
  const nativeBaseline = summarizeCommandMode(fixtures, "native-baseline-proxy");
  const failedFixtures = fixtures.filter((fixture) => fixture.expected.executionStatus !== "success");
  const failedCommandFactsPreserved = failedFixtures.every((fixture) => {
    const improvedResult = fixture.results.find((result) => result.mode === "improved-freeflow-run");
    return Boolean(improvedResult?.correctness.failedFactsExact);
  });

  return {
    fixtures: fixtures.length,
    modeResults: fixtures.reduce((count, fixture) => count + fixture.results.length, 0),
    improved,
    nativeBaseline,
    failedCommandFactsPreserved,
  };
}

function summarizeCommandMode(fixtures: CommandBenchmarkFixtureResult[], mode: CommandBenchmarkMode): CommandModeSummary {
  const modeResults = fixtures
    .map((fixture) => fixture.results.find((candidate) => candidate.mode === mode))
    .filter((result): result is CommandBenchmarkModeResult => Boolean(result));
  const measuredResults = modeResults.filter((result) => !result.skipped);
  const totalRawBytes = measuredResults.reduce((sum, result) => sum + result.rawBytes, 0);
  const totalRoutedBytes = measuredResults.reduce((sum, result) => sum + result.routedBytes, 0);
  const totalRawTokensApprox = measuredResults.reduce((sum, result) => sum + result.rawTokensApprox, 0);
  const totalRoutedTokensApprox = measuredResults.reduce((sum, result) => sum + result.routedTokensApprox, 0);

  return modeResults.reduce(
    (summary, result) => {
      if (result.skipped) {
        summary.skipped += 1;
      } else if (isCommandGatedPass(result, mode)) {
        summary.passed += 1;
      } else {
        summary.failed += 1;
      }

      if (result.correctness.exactFactsPreserved) {
        summary.exactFactsPreserved += 1;
      }
      if (result.recovery.status === "passed") {
        summary.recoveryPassed += 1;
      }

      return summary;
    },
    {
      passed: 0,
      failed: 0,
      skipped: 0,
      exactFactsPreserved: 0,
      recoveryPassed: 0,
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

function isCommandGatedPass(result: CommandBenchmarkModeResult, mode: CommandBenchmarkMode): boolean {
  if (!result.correctness.passed) {
    return false;
  }
  if (mode !== "improved-freeflow-run") {
    return true;
  }
  return result.recovery.status === "passed";
}

function createCommandBenchmarkFixtures(
  vaultRoot: string,
  externalComparators: readonly CommandBenchmarkExternalComparator[],
): CommandBenchmarkFixture[] {
  return commandFixtureDefinitions().map((definition) => commandFixture(definition, vaultRoot, externalComparators));
}

function commandFixtureDefinitions(): CommandFixtureDefinition[] {
  const noisySuccess = [
    "NOISY_SUCCESS completed 1200 files with 0 errors",
    ...Array.from({ length: 80 }, (_, index) => `cache warm line ${index + 1}: unchanged`),
  ].join("\n");
  const failedStack = [
    "Error: ROUTER_BENCH_FAILED exact stack fact",
    "    at main (/repo/src/main.ts:7:11)",
    "    at async run (/repo/src/run.ts:2:3)",
  ].join("\n");
  const testSummary = [
    "FAIL tests/router.test.ts",
    "  ● preserves command output facts",
    "    Expected true to be false",
    "Tests: 1 failed, 3 passed, 4 total",
  ].join("\n");
  const diagnostics = [
    "src/router.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "src/other.ts(4,1): warning TS6133: 'unused' is declared but its value is never read.",
  ].join("\n");
  const gitOutput = [
    " M router/src/tools/run.ts",
    "?? router/src/benchmarks/command-benchmarks.ts",
    " router/src/tools/run.ts | 12 +++++++++---",
    " 1 file changed, 9 insertions(+), 3 deletions(-)",
  ].join("\n");
  const repetitiveLog = [
    "REPETITIVE_LOG completed after 3 retry cycles",
    ...Array.from({ length: 120 }, () => "retry heartbeat: waiting for worker"),
  ].join("\n");
  const hugeJson = `${JSON.stringify({ status: "ok", marker: "HUGE_JSON_TABLE preserved header fact", rows: 20_000 }).slice(0, -1)},"payload":"${"x".repeat(60_000)}"}`;
  const repeatedOutput = [
    "REPEATED_OUTPUT identical command output stays recoverable",
    ...Array.from({ length: 120 }, (_, index) => `repeated payload line ${index + 1}: unchanged`),
  ].join("\n");

  return [
    {
      id: "noisy-success",
      title: "Noisy successful command output",
      kind: "noisy-success",
      command: "npm run build",
      executionStatus: "success",
      exitCode: 0,
      stdout: noisySuccess,
      stderr: "",
      combined: noisySuccess,
      requiredFacts: ["NOISY_SUCCESS completed 1200 files with 0 errors"],
      thresholds: { largeOutputLines: 10, largeOutputBytes: 2_000 },
    },
    {
      id: "failed-stack-trace",
      title: "Failed command with stack trace",
      kind: "failed-stack",
      command: "node fail.js",
      executionStatus: "failed",
      exitCode: 1,
      stdout: "",
      stderr: failedStack,
      combined: failedStack,
      requiredFacts: ["Error: ROUTER_BENCH_FAILED exact stack fact", "at main"],
      failedFactsMustBeExact: true,
    },
    {
      id: "test-summary",
      title: "Test runner summary and failure facts",
      kind: "test-summary",
      command: "npm test",
      executionStatus: "failed",
      exitCode: 1,
      stdout: testSummary,
      stderr: "",
      combined: testSummary,
      requiredFacts: ["FAIL tests/router.test.ts", "Tests: 1 failed, 3 passed, 4 total"],
      failedFactsMustBeExact: true,
      goal: "verification",
    },
    {
      id: "diagnostics",
      title: "TypeScript/lint diagnostics",
      kind: "diagnostics",
      command: "npm run typecheck",
      executionStatus: "failed",
      exitCode: 2,
      stdout: diagnostics,
      stderr: "",
      combined: diagnostics,
      requiredFacts: ["src/router.ts(12,7): error TS2322", "src/other.ts(4,1): warning TS6133"],
      failedFactsMustBeExact: true,
    },
    {
      id: "git-output",
      title: "Git status and diffstat output",
      kind: "git-output",
      command: "git status --short && git diff --stat",
      executionStatus: "success",
      exitCode: 0,
      stdout: gitOutput,
      stderr: "",
      combined: gitOutput,
      requiredFacts: ["M router/src/tools/run.ts", "1 file changed"],
      thresholds: { largeOutputLines: 2, largeOutputBytes: 10_000 },
    },
    {
      id: "repetitive-log",
      title: "Repetitive log output",
      kind: "repetitive-log",
      command: "tail -f worker.log --snapshot",
      executionStatus: "success",
      exitCode: 0,
      stdout: repetitiveLog,
      stderr: "",
      combined: repetitiveLog,
      requiredFacts: ["REPETITIVE_LOG completed after 3 retry cycles"],
      thresholds: { largeOutputLines: 10, largeOutputBytes: 2_000 },
    },
    {
      id: "huge-json-table",
      title: "Huge JSON/table-like output",
      kind: "huge-json-table",
      command: "node scripts/dump-json.js",
      executionStatus: "success",
      exitCode: 0,
      stdout: hugeJson,
      stderr: "",
      combined: hugeJson,
      requiredFacts: ["HUGE_JSON_TABLE preserved header fact"],
      thresholds: { largeOutputLines: 1_000, largeOutputBytes: 10_000 },
    },
    {
      id: "repeated-command-output",
      title: "Repeated command output",
      kind: "repeated-output",
      command: "printf repeated-output",
      executionStatus: "success",
      exitCode: 0,
      stdout: repeatedOutput,
      stderr: "",
      combined: repeatedOutput,
      requiredFacts: ["REPEATED_OUTPUT identical command output stays recoverable"],
      repeatRuns: 2,
      thresholds: { largeOutputLines: 10, largeOutputBytes: 10_000 },
      notes: ["Exact duplicate detection returns a compact note; current metadata points to the prior exact raw output."],
    },
  ];
}

function commandFixture(
  definition: CommandFixtureDefinition,
  vaultRoot: string,
  externalComparators: readonly CommandBenchmarkExternalComparator[],
): CommandBenchmarkFixture {
  const expected: CommandBenchmarkExpected = {
    executionStatus: definition.executionStatus,
    exitCode: definition.exitCode,
    requiredFacts: definition.requiredFacts,
  };
  if (definition.failedFactsMustBeExact !== undefined) {
    expected.failedFactsMustBeExact = definition.failedFactsMustBeExact;
  }

  const modes: Record<string, CommandFixtureRun> = {
    "native-baseline-proxy": async () => nativeCommandObservation(definition),
    "improved-freeflow-run": async () => improvedCommandObservation(definition, vaultRoot),
  };

  for (const comparator of externalComparators) {
    modes[comparator.mode] = async () => externalComparatorObservation(definition, comparator);
  }

  return {
    id: definition.id,
    title: definition.title,
    kind: definition.kind,
    expected,
    modes,
  };
}

async function nativeCommandObservation(fixture: CommandFixtureDefinition): Promise<CommandBenchmarkObservation> {
  return {
    toolPathUsed: "native-baseline-proxy: direct command output",
    rawBytes: byteLength(fixture.combined),
    routedBytes: byteLength(fixture.combined),
    executionStatus: fixture.executionStatus,
    exitCode: fixture.exitCode,
    routedExcerpt: fixture.combined,
    recovery: { status: "not-applicable", detail: "Native direct output has no Freeflow vault recovery contract." },
    notes: fixture.notes ?? [],
  };
}

async function improvedCommandObservation(fixture: CommandFixtureDefinition, vaultRoot: string): Promise<CommandBenchmarkObservation> {
  const vault = createVault({ root: vaultRoot });
  const sessionId = `command-benchmark-${fixture.id}`;
  const outputIds: string[] = [];
  let result: CommandRoutedResult | null = null;
  const repeatRuns = Math.max(1, fixture.repeatRuns ?? 1);

  for (let runIndex = 0; runIndex < repeatRuns; runIndex += 1) {
    const runner = fixedCommandRunner(fixture);
    const runOptions: FreeflowRunOptions = {
      command: fixture.command,
      sessionId,
      vaultRoot: vault.root,
      preserve: fixture.preserve ?? "important",
    };
    if (fixture.goal !== undefined) {
      runOptions.goal = fixture.goal;
    }
    if (fixture.thresholds !== undefined) {
      runOptions.thresholds = fixture.thresholds;
    }
    result = await freeflowRun(runOptions, runner);
    outputIds.push(result.outputId);
  }

  if (!result) {
    return skippedObservation("improved-freeflow-run", "freeflowRun did not produce a result.");
  }

  const recovery = await verifyCommandRecovery(vault.root, sessionId, result.recovery?.outputId ?? result.outputId, fixture.combined, fixture.requiredFacts);
  const notes = [result.routing.reason, ...(fixture.notes ?? [])];
  if (outputIds.length > 1) {
    notes.push(`repeatedRuns=${outputIds.length}`);
    notes.push(`outputIds=${outputIds.join(",")}`);
  }
  notes.push(`recovery=${recovery.status}: ${recovery.detail}`);

  const observation: CommandBenchmarkObservation = {
    toolPathUsed: "improved-freeflow-run: freeflowRun synthetic fixture runner",
    rawBytes: byteLength(fixture.combined),
    routedBytes: byteLength(JSON.stringify(result)),
    executionStatus: result.execution.status,
    exitCode: result.execution.exitCode,
    outputId: result.outputId,
    routedExcerpt: routedText(result),
    recovery,
    notes,
  };
  if (result.parser) {
    observation.parser = result.parser;
  }
  return observation;
}

async function externalComparatorObservation(
  fixture: CommandFixtureDefinition,
  comparator: CommandBenchmarkExternalComparator,
): Promise<CommandBenchmarkObservation> {
  const startedAt = performance.now();
  const observation = await comparator.run({
    id: fixture.id,
    title: fixture.title,
    command: fixture.command,
    executionStatus: fixture.executionStatus,
    exitCode: fixture.exitCode,
    stdout: fixture.stdout,
    stderr: fixture.stderr,
    combined: fixture.combined,
    requiredFacts: fixture.requiredFacts,
  });
  const latencyMs = observation.latencyMs ?? performance.now() - startedAt;
  const notes = [`externalComparator=${comparator.name}`, `latencyMs=${latencyMs.toFixed(2)}`, ...(observation.notes ?? [])];
  const benchmarkObservation: CommandBenchmarkObservation = {
    toolPathUsed: `${comparator.name}: configured external command benchmark hook`,
    rawBytes: observation.rawBytes ?? byteLength(fixture.combined),
    routedBytes: observation.routedBytes ?? byteLength(observation.routedText),
    executionStatus: fixture.executionStatus,
    exitCode: fixture.exitCode,
    routedExcerpt: observation.routedText,
    recovery: { status: "not-applicable", detail: `${comparator.name} hook does not use Freeflow vault recovery.` },
    notes,
  };
  if (observation.parser) {
    benchmarkObservation.parser = observation.parser;
  }
  return benchmarkObservation;
}

function fixedCommandRunner(fixture: CommandFixtureDefinition) {
  return {
    async run(): Promise<HostCommandRunResult> {
      const result: HostCommandRunResult = {
        stdout: fixture.stdout,
        stderr: fixture.stderr,
        combined: fixture.combined,
        executionStatus: fixture.executionStatus,
        exitCode: fixture.exitCode,
      };
      if (fixture.durationMs !== undefined) {
        result.durationMs = fixture.durationMs;
      }
      return result;
    },
  };
}

async function verifyCommandRecovery(
  vaultRoot: string,
  sessionId: string,
  outputId: string,
  expectedCombined: string,
  requiredFacts: readonly string[],
): Promise<CommandBenchmarkRecoveryResult> {
  if (!outputId) {
    return { status: "failed", detail: "No Freeflow outputId was returned." };
  }

  try {
    const vault = createVault({ root: vaultRoot });
    const recovered = await readOutputText(vault, sessionId, outputId, "combined");
    if (recovered !== expectedCombined) {
      return { status: "failed", detail: "Recovered combined output did not match exact fixture output." };
    }
    const missingFact = requiredFacts.find((fact) => !recovered.includes(fact));
    if (missingFact) {
      return { status: "failed", detail: `Recovered output missed required fact: ${missingFact}` };
    }
    return { status: "passed", detail: `Verified exact combined output recovery for ${outputId}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", detail: `Recovery failed: ${message}` };
  }
}

function scoreCommandCorrectness(
  expected: CommandBenchmarkExpected,
  observation: CommandBenchmarkObservation,
): CommandCorrectnessResult {
  if (observation.skipped) {
    return {
      passed: false,
      statusCorrect: false,
      exitCodeCorrect: false,
      exactFactsPreserved: false,
      failedFactsExact: false,
    };
  }

  const statusCorrect = observation.executionStatus === expected.executionStatus;
  const exitCodeCorrect = observation.exitCode === expected.exitCode;
  const factsInRoutedExcerpt = expected.requiredFacts.every((fact) => observation.routedExcerpt.includes(fact));
  const duplicateFactsRecoverable = observation.parser?.name === "duplicate-output" && observation.recovery.status === "passed";
  const exactFactsPreserved = factsInRoutedExcerpt || duplicateFactsRecoverable;
  const failedFactsExact = expected.failedFactsMustBeExact ? exactFactsPreserved : true;
  return {
    passed: statusCorrect && exitCodeCorrect && exactFactsPreserved && failedFactsExact,
    statusCorrect,
    exitCodeCorrect,
    exactFactsPreserved,
    failedFactsExact,
  };
}

function routedText(result: CommandRoutedResult): string {
  return result.importantLines?.map((line) => line.excerpt).join("\n") ?? "";
}

function commandBenchmarkModes(externalComparators: readonly CommandBenchmarkExternalComparator[]): CommandBenchmarkMode[] {
  return ["native-baseline-proxy", "improved-freeflow-run", ...externalComparators.map((comparator) => comparator.mode)];
}

function skippedExternalTools(externalComparators: readonly CommandBenchmarkExternalComparator[]): CommandSkippedExternalTool[] {
  const configuredNames = new Set(externalComparators.map((comparator) => comparator.name.toLowerCase()));
  return DEFAULT_SKIPPED_EXTERNAL_TOOLS.filter((tool) => !configuredNames.has(tool.name.toLowerCase()));
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

function skippedObservation(toolPathUsed: string, reason: string): CommandBenchmarkObservation {
  return {
    toolPathUsed,
    rawBytes: 0,
    routedBytes: 0,
    routedExcerpt: "",
    recovery: { status: "skipped", detail: reason },
    skipped: true,
    skipReason: reason,
  };
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function formatCommandCorrectnessChecks(correctness: CommandCorrectnessResult): string {
  return [
    `status ${correctness.statusCorrect ? "✓" : "✗"}`,
    `exit ${correctness.exitCodeCorrect ? "✓" : "✗"}`,
    `facts ${correctness.exactFactsPreserved ? "✓" : "✗"}`,
    `failed-exact ${correctness.failedFactsExact ? "✓" : "✗"}`,
  ].join(" ");
}

function defaultReportPath(): string {
  return resolve(process.cwd(), "evals/reports/runtime/output-router-command-benchmark-1-report.md");
}

async function runCli() {
  const { iterations, reportPath, jsonReportPath } = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: defaultReportPath() });
  const options: RunCommandBenchmarksOptions = {};
  if (iterations !== undefined) {
    options.iterations = iterations;
  }
  const report = await runCommandBenchmarks(options);
  const reports = await writeCommandBenchmarkReports(report, reportPath, {
    jsonReportPath: jsonReportPath === undefined ? defaultJsonRunReportPath(reportPath) : jsonReportPath,
  });
  const shortId = createHash("sha256").update(JSON.stringify(report.summary)).digest("hex").slice(0, 8);
  console.log(`Freeflow command benchmark ${shortId}: improved ${report.summary.improved.passed}/${report.summary.fixtures} pass`);
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
