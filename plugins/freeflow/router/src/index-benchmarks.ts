import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import {
  defaultJsonRunReportPath,
  escapeMarkdownTableCell as escapeTable,
  formatPercent,
  latencySummary,
  normalizeIterations,
  parseBenchmarkCliArgs,
  reductionPercent,
  writeBenchmarkReportPair,
} from "./benchmark-harness.js";
import { freeflowRetrieve } from "./retrieve.js";
import {
  buildOrLoadExperimentalRepoIndex,
  queryExperimentalRepoIndex,
  type ExperimentalIndexLoadMode,
  type ExperimentalIndexCandidate,
} from "./experimental-local-index.js";

export interface RunIndexBenchmarksOptions {
  iterations?: number;
  generatedAt?: string;
}

export interface IndexBenchmarkReport {
  generatedAt: string;
  iterations: number;
  summary: IndexBenchmarkSummary;
  fixtures: IndexBenchmarkFixtureResult[];
}

export interface IndexBenchmarkSummary {
  fixtures: number;
  modeResults: number;
  scannerDefault: boolean;
  indexAdopted: boolean;
  scanner: IndexModeSummary;
  index: IndexModeSummary;
  generatedFalsePositiveCount: number;
  coldBuildMs: LatencySummary;
  warmQueryMs: LatencySummary;
  staleRefreshMs: LatencySummary;
}

export interface IndexModeSummary {
  passed: number;
  failed: number;
  pathCorrect: number;
  spanCorrect: number;
  excerptComplete: number;
  totalRawBytes: number;
  totalContextBytes: number;
  weightedContextReductionPercent: number;
}

export interface LatencySummary {
  p50: number;
  p95: number;
}

export interface IndexBenchmarkFixtureResult {
  id: string;
  title: string;
  expected: IndexBenchmarkExpected;
  results: IndexBenchmarkModeResult[];
}

export interface IndexBenchmarkExpected {
  path: string;
  lines?: string;
  requiredExcerpt: string[];
}

export interface IndexBenchmarkModeResult {
  mode: IndexBenchmarkMode;
  toolPathUsed: string;
  rawBytes: number;
  contextBytes: number;
  contextReductionPercent: number;
  latencyMs: LatencySummary;
  buildMs?: number;
  queryMs?: number;
  indexMode?: ExperimentalIndexLoadMode;
  actualPath?: string;
  actualLines?: string;
  excerpt: string;
  correctness: IndexCorrectnessResult;
  notes: string[];
}

export interface IndexCorrectnessResult {
  passed: boolean;
  pathCorrect: boolean;
  spanCorrect: boolean;
  excerptComplete: boolean;
  generatedFalsePositive: boolean;
}

type IndexBenchmarkMode = "scanner-default" | "index-cold" | "index-warm" | "index-stale-refresh";

interface IndexFixtureDefinition {
  id: string;
  title: string;
  files: Record<string, string>;
  query: string;
  expected: IndexBenchmarkExpected;
  staleFiles?: Record<string, string>;
  staleQuery?: string;
  staleExpected?: IndexBenchmarkExpected;
}

interface IndexObservation {
  toolPathUsed: string;
  rawBytes: number;
  contextBytes: number;
  actualPath?: string;
  actualLines?: string;
  excerpt: string;
  buildMs?: number;
  queryMs?: number;
  indexMode?: ExperimentalIndexLoadMode;
  notes?: string[];
}

interface TempResource {
  path: string;
  cleanup: () => Promise<void>;
}

const DEFAULT_ITERATIONS = 3;

export async function runIndexBenchmarks(options: RunIndexBenchmarksOptions = {}): Promise<IndexBenchmarkReport> {
  const iterations = normalizeIterations(options.iterations, DEFAULT_ITERATIONS);
  const fixtures = indexFixtureDefinitions();
  const fixtureResults: IndexBenchmarkFixtureResult[] = [];

  for (const fixture of fixtures) {
    const results: IndexBenchmarkModeResult[] = [];
    for (const mode of indexBenchmarkModes()) {
      results.push(await runIndexFixtureMode(fixture, mode, iterations));
    }
    fixtureResults.push({ id: fixture.id, title: fixture.title, expected: fixtureExpectedForMode(fixture, "index-warm"), results });
  }

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    iterations,
    summary: summarizeIndexReport(fixtureResults),
    fixtures: fixtureResults,
  };
}

export function renderIndexBenchmarkReport(report: IndexBenchmarkReport): string {
  const date = report.generatedAt.slice(0, 10);
  const lines = [
    "# Output Router Index Benchmark Report - Iteration 1",
    "",
    `Date: ${date}`,
    "",
    "## Scope",
    "",
    "Optional Local Index Experiment for `freeflow_retrieve`. The scanner remains the product default; this benchmark measures an isolated no-dependency local index for cold build, warm query, stale refresh, accuracy, and bounded context bytes.",
    "",
    "The index cache is keyed by repo root and stores outside the repo by default. No external service, vector DB, or native dependency is required.",
    "",
    "## Command",
    "",
    "```sh",
    "npm run bench:router:index",
    "```",
    "",
    "The CLI writes machine-readable JSON under `plugins/freeflow/evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.",
    "",
    "## Summary",
    "",
    `- Fixtures: ${report.summary.fixtures}`,
    `- Scanner remains default: ${report.summary.scannerDefault ? "yes" : "no"}`,
    `- Index adopted by default: ${report.summary.indexAdopted ? "yes" : "no"}`,
    `- Scanner pass: ${report.summary.scanner.passed}/${report.summary.fixtures}`,
    `- Index warm pass: ${report.summary.index.passed}/${report.summary.fixtures}`,
    `- Generated false positives: ${report.summary.generatedFalsePositiveCount}/${report.summary.modeResults}`,
    `- Cold build p50/p95: ${report.summary.coldBuildMs.p50.toFixed(2)}/${report.summary.coldBuildMs.p95.toFixed(2)} ms`,
    `- Warm query p50/p95: ${report.summary.warmQueryMs.p50.toFixed(2)}/${report.summary.warmQueryMs.p95.toFixed(2)} ms`,
    `- Stale refresh p50/p95: ${report.summary.staleRefreshMs.p50.toFixed(2)}/${report.summary.staleRefreshMs.p95.toFixed(2)} ms`,
    `- Index warm context reduction: ${formatPercent(report.summary.index.weightedContextReductionPercent)} (${report.summary.index.totalRawBytes} raw bytes to ${report.summary.index.totalContextBytes} context bytes)`,
    "",
    "## Results",
    "",
    "| fixture | mode | correctness | checks | path | lines | raw/context bytes | context reduction | latency p50/p95 ms | build/query ms | index mode | notes |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
  ];

  for (const fixture of report.fixtures) {
    for (const result of fixture.results) {
      const correctness = result.correctness.passed ? "pass" : "fail";
      const checks = formatCorrectnessChecks(result.correctness);
      const buildQuery = `${(result.buildMs ?? 0).toFixed(2)}/${(result.queryMs ?? 0).toFixed(2)}`;
      const notes = result.notes.length ? result.notes.join("; ") : "";
      lines.push(
        `| ${escapeTable(fixture.id)} | ${escapeTable(result.mode)} | ${correctness} | ${escapeTable(checks)} | ${escapeTable(result.actualPath ?? "-")} | ${escapeTable(result.actualLines ?? "-")} | ${result.rawBytes}/${result.contextBytes} | ${formatPercent(result.contextReductionPercent)} | ${result.latencyMs.p50.toFixed(2)}/${result.latencyMs.p95.toFixed(2)} | ${buildQuery} | ${escapeTable(result.indexMode ?? "-")} | ${escapeTable(notes)} |`,
      );
    }
  }

  lines.push(
    "",
    "## Adoption Decision",
    "",
    "Index adopted by default: no. This slice only adds an experiment and benchmark evidence; scanner behavior remains the default until a later adoption checkpoint explicitly approves otherwise.",
    "",
    "## Regression Status",
    "",
    report.summary.index.failed === 0
      ? "Warm experimental index passed all gated fixtures without generated-artifact false positives."
      : `Warm experimental index failed ${report.summary.index.failed} fixture(s).`,
    "",
  );

  return lines.join("\n");
}

export async function writeIndexBenchmarkReport(report: IndexBenchmarkReport, reportPath: string): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderIndexBenchmarkReport(report), "utf8");
}

export async function writeIndexBenchmarkJsonReport(report: IndexBenchmarkReport, reportPath: string): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export interface WriteIndexBenchmarkReportsOptions {
  jsonReportPath?: string | false;
}

export async function writeIndexBenchmarkReports(
  report: IndexBenchmarkReport,
  markdownReportPath: string,
  options: WriteIndexBenchmarkReportsOptions = {},
): Promise<{ markdown: string; json?: string }> {
  return writeBenchmarkReportPair({
    report,
    markdownReportPath,
    jsonReportPath: options.jsonReportPath,
    renderMarkdown: renderIndexBenchmarkReport,
  });
}

async function runIndexFixtureMode(
  fixture: IndexFixtureDefinition,
  mode: IndexBenchmarkMode,
  iterations: number,
): Promise<IndexBenchmarkModeResult> {
  const latencies: number[] = [];
  let observation: IndexObservation | null = null;

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    observation = await observeIndexFixture(fixture, mode);
    latencies.push(performance.now() - startedAt);
  }

  if (!observation) {
    observation = { toolPathUsed: mode, rawBytes: 0, contextBytes: 0, excerpt: "", notes: ["no observation"] };
  }

  const correctness = scoreCorrectness(fixtureExpectedForMode(fixture, mode), observation);
  const result: IndexBenchmarkModeResult = {
    mode,
    toolPathUsed: observation.toolPathUsed,
    rawBytes: observation.rawBytes,
    contextBytes: observation.contextBytes,
    contextReductionPercent: reductionPercent(observation.rawBytes, observation.contextBytes),
    latencyMs: latencySummary(latencies),
    excerpt: observation.excerpt,
    correctness,
    notes: observation.notes ?? [],
  };
  if (observation.buildMs !== undefined) {
    result.buildMs = observation.buildMs;
  }
  if (observation.queryMs !== undefined) {
    result.queryMs = observation.queryMs;
  }
  if (observation.indexMode !== undefined) {
    result.indexMode = observation.indexMode;
  }
  if (observation.actualPath !== undefined) {
    result.actualPath = observation.actualPath;
  }
  if (observation.actualLines !== undefined) {
    result.actualLines = observation.actualLines;
  }
  return result;
}

async function observeIndexFixture(fixture: IndexFixtureDefinition, mode: IndexBenchmarkMode): Promise<IndexObservation> {
  const root = await createTempDir("freeflow-router-index-benchmark-repo-");
  const cacheRoot = await createTempDir("freeflow-router-index-benchmark-cache-");
  try {
    if (mode === "index-stale-refresh") {
      await writeFixtureFiles(root.path, fixture.files);
      await buildOrLoadExperimentalRepoIndex({ root: root.path, cacheRoot: cacheRoot.path });
      await writeFixtureFiles(root.path, fixture.staleFiles ?? { "stale-marker.txt": "stale refresh marker" });
      return await indexObservation(root.path, cacheRoot.path, fixture.staleQuery ?? fixture.query, mode);
    }

    const finalFiles = mode === "scanner-default" || mode === "index-cold" || mode === "index-warm"
      ? { ...fixture.files, ...(fixture.staleFiles && fixture.staleExpected ? fixture.staleFiles : {}) }
      : fixture.files;
    await writeFixtureFiles(root.path, finalFiles);

    if (mode === "scanner-default") {
      return await scannerObservation(root.path, fixture.staleQuery && fixture.staleExpected ? fixture.staleQuery : fixture.query);
    }

    if (mode === "index-warm") {
      await buildOrLoadExperimentalRepoIndex({ root: root.path, cacheRoot: cacheRoot.path });
      return await indexObservation(root.path, cacheRoot.path, fixture.staleQuery && fixture.staleExpected ? fixture.staleQuery : fixture.query, mode);
    }

    return await indexObservation(root.path, cacheRoot.path, fixture.staleQuery && fixture.staleExpected ? fixture.staleQuery : fixture.query, mode);
  } finally {
    await Promise.all([root.cleanup(), cacheRoot.cleanup()]);
  }
}

async function scannerObservation(root: string, query: string): Promise<IndexObservation> {
  const rawBytes = await repoRawBytes(root);
  const queryStartedAt = performance.now();
  const result = await freeflowRetrieve({ action: "query", source: { kind: "repo", root }, query, preserve: "important" });
  const queryMs = performance.now() - queryStartedAt;
  const evidence = result.evidence?.[0];
  return {
    toolPathUsed: "scanner-default: freeflowRetrieve repo scanner",
    rawBytes,
    contextBytes: byteLength(JSON.stringify(result)),
    ...(evidence?.path !== undefined ? { actualPath: evidence.path } : {}),
    ...(evidence?.lines !== undefined ? { actualLines: evidence.lines } : {}),
    excerpt: evidence?.excerpt ?? "",
    queryMs,
    notes: [result.routing.reason],
  };
}

async function indexObservation(root: string, cacheRoot: string, query: string, mode: IndexBenchmarkMode): Promise<IndexObservation> {
  const rawBytes = await repoRawBytes(root);
  const load = await buildOrLoadExperimentalRepoIndex({ root, cacheRoot });
  const queryStartedAt = performance.now();
  const candidates = queryExperimentalRepoIndex(load.index, query, { topK: 1 });
  const queryMs = performance.now() - queryStartedAt;
  const candidate = candidates[0];
  return {
    toolPathUsed: `${mode}: experimental local index`,
    rawBytes,
    contextBytes: byteLength(JSON.stringify(candidates)),
    ...(candidate?.path !== undefined ? { actualPath: candidate.path } : {}),
    ...(candidate?.lines !== undefined ? { actualLines: candidate.lines } : {}),
    excerpt: candidate?.excerpt ?? "",
    buildMs: load.buildMs,
    queryMs,
    indexMode: load.mode,
    notes: candidate ? [candidate.reason, `cachePath=${load.cachePath}`, ...(load.refreshReason ? [`refresh=${load.refreshReason}`] : [])] : ["no index candidate"],
  };
}

function summarizeIndexReport(fixtures: IndexBenchmarkFixtureResult[]): IndexBenchmarkSummary {
  const scanner = summarizeMode(fixtures, "scanner-default");
  const index = summarizeMode(fixtures, "index-warm");
  const generatedFalsePositiveCount = fixtures
    .flatMap((fixture) => fixture.results)
    .filter((result) => result.correctness.generatedFalsePositive).length;
  const coldBuildMs = latencyFor(fixtures, "index-cold", "buildMs");
  const warmQueryMs = latencyFor(fixtures, "index-warm", "queryMs");
  const staleRefreshMs = latencyFor(fixtures, "index-stale-refresh", "buildMs");
  return {
    fixtures: fixtures.length,
    modeResults: fixtures.reduce((count, fixture) => count + fixture.results.length, 0),
    scannerDefault: true,
    indexAdopted: false,
    scanner,
    index,
    generatedFalsePositiveCount,
    coldBuildMs,
    warmQueryMs,
    staleRefreshMs,
  };
}

function summarizeMode(fixtures: IndexBenchmarkFixtureResult[], mode: IndexBenchmarkMode): IndexModeSummary {
  const results = fixtures
    .map((fixture) => fixture.results.find((result) => result.mode === mode))
    .filter((result): result is IndexBenchmarkModeResult => Boolean(result));
  const totalRawBytes = results.reduce((sum, result) => sum + result.rawBytes, 0);
  const totalContextBytes = results.reduce((sum, result) => sum + result.contextBytes, 0);
  return results.reduce(
    (summary, result) => {
      if (result.correctness.passed) {
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
      return summary;
    },
    {
      passed: 0,
      failed: 0,
      pathCorrect: 0,
      spanCorrect: 0,
      excerptComplete: 0,
      totalRawBytes,
      totalContextBytes,
      weightedContextReductionPercent: reductionPercent(totalRawBytes, totalContextBytes),
    },
  );
}

function latencyFor(
  fixtures: IndexBenchmarkFixtureResult[],
  mode: IndexBenchmarkMode,
  field: "buildMs" | "queryMs",
): LatencySummary {
  const values = fixtures
    .map((fixture) => fixture.results.find((result) => result.mode === mode)?.[field])
    .filter((value): value is number => typeof value === "number");
  return latencySummary(values);
}

function indexFixtureDefinitions(): IndexFixtureDefinition[] {
  return [
    {
      id: "index-exact-copied-text",
      title: "Exact copied text block",
      files: {
        "target.md": ["# Target", "", "ExperimentalIndex exact copied text source truth."].join("\n"),
        "decoy.md": "ExperimentalIndex ExperimentalIndex ExperimentalIndex without copied source truth",
      },
      query: "ExperimentalIndex exact copied text source truth",
      expected: {
        path: "target.md",
        lines: "1-3",
        requiredExcerpt: ["ExperimentalIndex exact copied text source truth"],
      },
    },
    {
      id: "index-generated-artifact-decoy",
      title: "Generated-artifact decoy",
      files: {
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
      },
      query: "Sandbox Permissions SandboxPermissions Plain-language meaning",
      expected: {
        path: "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md",
        lines: "3-7",
        requiredExcerpt: ["SandboxPermissions", "Plain-language meaning"],
      },
    },
    {
      id: "index-stale-refresh",
      title: "Changed-file stale refresh",
      files: {
        "target.md": ["# Target", "", "StaleIndexNeedle original source truth."].join("\n"),
      },
      query: "StaleIndexNeedle original source truth",
      expected: {
        path: "target.md",
        lines: "1-3",
        requiredExcerpt: ["StaleIndexNeedle original"],
      },
      staleFiles: {
        "target.md": ["# Target", "", "StaleIndexNeedle refreshed source truth."].join("\n"),
      },
      staleQuery: "StaleIndexNeedle refreshed source truth",
      staleExpected: {
        path: "target.md",
        lines: "1-3",
        requiredExcerpt: ["StaleIndexNeedle refreshed"],
      },
    },
  ];
}

function fixtureExpectedForMode(fixture: IndexFixtureDefinition, mode: IndexBenchmarkMode): IndexBenchmarkExpected {
  if ((mode === "index-stale-refresh" || fixture.staleQuery) && fixture.staleExpected) {
    return fixture.staleExpected;
  }
  return fixture.expected;
}

function scoreCorrectness(expected: IndexBenchmarkExpected, observation: IndexObservation): IndexCorrectnessResult {
  const pathCorrect = observation.actualPath === expected.path;
  const spanCorrect = expected.lines ? Boolean(observation.actualLines && rangesOverlap(expected.lines, observation.actualLines)) : true;
  const excerptComplete = expected.requiredExcerpt.every((snippet) => observation.excerpt.toLowerCase().includes(snippet.toLowerCase()));
  const generatedFalsePositive = observation.actualPath ? isGeneratedBenchmarkPath(observation.actualPath) : false;
  return {
    passed: pathCorrect && spanCorrect && excerptComplete && !generatedFalsePositive,
    pathCorrect,
    spanCorrect,
    excerptComplete,
    generatedFalsePositive,
  };
}

async function writeFixtureFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    const absolutePath = resolve(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, text, "utf8");
  }
}

async function repoRawBytes(root: string): Promise<number> {
  const entries: string[] = [];
  await collectRawText(root, root, entries);
  return byteLength(entries.join("\n"));
}

async function collectRawText(root: string, currentPath: string, entries: string[]): Promise<void> {
  const currentStat = await stat(currentPath);
  if (currentStat.isDirectory()) {
    const dirEntries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of dirEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      await collectRawText(root, resolve(currentPath, entry.name), entries);
    }
    return;
  }
  if (!currentStat.isFile()) {
    return;
  }
  try {
    const text = await readFile(currentPath, "utf8");
    if (!text.includes("\0")) {
      entries.push(text);
    }
  } catch {
    // ignore non-text fixture files
  }
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

function indexBenchmarkModes(): IndexBenchmarkMode[] {
  return ["scanner-default", "index-cold", "index-warm", "index-stale-refresh"];
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
  if (segments.includes("graphify-out")) {
    return true;
  }
  const name = segments.at(-1)?.toLowerCase() ?? path.toLowerCase();
  return name.endsWith(".log") || name.endsWith(".map") || name.endsWith(".min.js") || name.endsWith(".min.css") || name.includes(".bundle.");
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function formatCorrectnessChecks(correctness: IndexCorrectnessResult): string {
  return [
    `path ${correctness.pathCorrect ? "✓" : "✗"}`,
    `span ${correctness.spanCorrect ? "✓" : "✗"}`,
    `excerpt ${correctness.excerptComplete ? "✓" : "✗"}`,
    `gen-fp ${correctness.generatedFalsePositive ? "✗" : "✓"}`,
  ].join(" ");
}

function defaultReportPath(): string {
  return resolve(process.cwd(), "plugins/freeflow/evals/reports/runtime/output-router-index-benchmark-1-report.md");
}

async function runCli() {
  const { iterations, reportPath, jsonReportPath } = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: defaultReportPath() });
  const options: RunIndexBenchmarksOptions = {};
  if (iterations !== undefined) {
    options.iterations = iterations;
  }
  const report = await runIndexBenchmarks(options);
  const reports = await writeIndexBenchmarkReports(report, reportPath, {
    jsonReportPath: jsonReportPath === undefined ? defaultJsonRunReportPath(reportPath) : jsonReportPath,
  });
  const shortId = createHash("sha256").update(JSON.stringify(report.summary)).digest("hex").slice(0, 8);
  console.log(`Freeflow index benchmark ${shortId}: index ${report.summary.index.passed}/${report.summary.fixtures} pass`);
  console.log(`Markdown report: ${reports.markdown}`);
  if (reports.json) {
    console.log(`JSON run data: ${reports.json}`);
  }
  if (report.summary.index.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runCli();
}
