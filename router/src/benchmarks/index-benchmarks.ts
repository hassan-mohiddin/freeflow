import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
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
import { freeflowRetrieve } from "../tools/retrieve.js";
import {
  buildOrLoadExperimentalRepoIndex,
  queryExperimentalRepoIndex,
  type ExperimentalIndexLoadMode,
  type ExperimentalIndexCandidate,
} from "../experiments/local-index.js";

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
  ftsCandidate: FtsCandidateStatus;
  scanner: IndexModeSummary;
  index: IndexModeSummary;
  fts: IndexModeSummary;
  hybrid: IndexModeSummary;
  generatedFalsePositiveCount: number;
  coldBuildMs: LatencySummary;
  warmQueryMs: LatencySummary;
  staleRefreshMs: LatencySummary;
}

export interface FtsCandidateStatus {
  available: boolean;
  engine: "none" | "fts5-bm25-trigram";
  reason: string;
}

export interface IndexModeSummary {
  passed: number;
  failed: number;
  skipped: number;
  pathCorrect: number;
  spanCorrect: number;
  excerptComplete: number;
  recallAtK: number;
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
  skipped: boolean;
  skipReason?: string;
  rawBytes: number;
  contextBytes: number;
  contextReductionPercent: number;
  latencyMs: LatencySummary;
  buildMs?: number;
  queryMs?: number;
  indexMode?: ExperimentalIndexLoadMode;
  actualPath?: string;
  actualLines?: string;
  candidatePaths: string[];
  excerpt: string;
  correctness: IndexCorrectnessResult;
  notes: string[];
}

export interface IndexCorrectnessResult {
  passed: boolean;
  pathCorrect: boolean;
  spanCorrect: boolean;
  excerptComplete: boolean;
  recallAtK: boolean;
  generatedFalsePositive: boolean;
}

type IndexBenchmarkMode = "scanner-default" | "index-cold" | "index-warm" | "index-stale-refresh" | "fts5-bm25-trigram" | "hybrid-warm";

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
  skipped?: boolean;
  skipReason?: string;
  rawBytes: number;
  contextBytes: number;
  actualPath?: string;
  actualLines?: string;
  candidatePaths?: string[];
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
const BENCHMARK_TOP_K = 3;
const FTS_CONTEXT_LINES = 2;
const require = createRequire(import.meta.url);
let cachedFtsCandidateStatus: FtsCandidateStatus | undefined;

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
    "Repo Search Backend Benchmark for `freeflow_retrieve`. The scanner remains the product default; this benchmark compares scanner-only retrieval, the no-dependency local lexical index, a conservative hybrid scanner+index path, and records whether an FTS5/BM25/trigram candidate is available.",
    "",
    "The index cache is keyed by repo root and stores outside the repo by default. No external service, vector DB, or native dependency is required for the local lexical index.",
    "",
    "## Command",
    "",
    "```sh",
    "npm run bench:router:index",
    "```",
    "",
    "The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.",
    "",
    "## Summary",
    "",
    `- Fixtures: ${report.summary.fixtures}`,
    `- Scanner remains default: ${report.summary.scannerDefault ? "yes" : "no"}`,
    `- Index adopted by default: ${report.summary.indexAdopted ? "yes" : "no"}`,
    `- Scanner pass: ${report.summary.scanner.passed}/${report.summary.fixtures} (recall@${BENCHMARK_TOP_K}: ${report.summary.scanner.recallAtK}/${report.summary.fixtures})`,
    `- Index warm pass: ${report.summary.index.passed}/${report.summary.fixtures} (recall@${BENCHMARK_TOP_K}: ${report.summary.index.recallAtK}/${report.summary.fixtures})`,
    `- FTS5/BM25/trigram pass: ${report.summary.fts.passed}/${report.summary.fixtures} (skipped: ${report.summary.fts.skipped}; recall@${BENCHMARK_TOP_K}: ${report.summary.fts.recallAtK}/${report.summary.fixtures})`,
    `- Hybrid warm pass: ${report.summary.hybrid.passed}/${report.summary.fixtures} (recall@${BENCHMARK_TOP_K}: ${report.summary.hybrid.recallAtK}/${report.summary.fixtures})`,
    `- FTS5/BM25/trigram candidate: ${report.summary.ftsCandidate.available ? "available" : "unavailable"} — ${report.summary.ftsCandidate.reason}`,
    `- Generated false positives: ${report.summary.generatedFalsePositiveCount}/${report.summary.modeResults}`,
    `- Cold build p50/p95: ${report.summary.coldBuildMs.p50.toFixed(2)}/${report.summary.coldBuildMs.p95.toFixed(2)} ms`,
    `- Warm query p50/p95: ${report.summary.warmQueryMs.p50.toFixed(2)}/${report.summary.warmQueryMs.p95.toFixed(2)} ms`,
    `- Stale refresh p50/p95: ${report.summary.staleRefreshMs.p50.toFixed(2)}/${report.summary.staleRefreshMs.p95.toFixed(2)} ms`,
    `- Index warm context reduction: ${formatPercent(report.summary.index.weightedContextReductionPercent)} (${report.summary.index.totalRawBytes} raw bytes to ${report.summary.index.totalContextBytes} context bytes)`,
    "",
    "## Results",
    "",
    "| fixture | mode | correctness | checks | path | lines | candidates | raw/context bytes | context reduction | latency p50/p95 ms | build/query ms | index mode | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
  ];

  for (const fixture of report.fixtures) {
    for (const result of fixture.results) {
      const correctness = result.skipped ? "skipped" : result.correctness.passed ? "pass" : "fail";
      const checks = formatCorrectnessChecks(result.correctness);
      const buildQuery = `${(result.buildMs ?? 0).toFixed(2)}/${(result.queryMs ?? 0).toFixed(2)}`;
      const notes = result.notes.length ? result.notes.join("; ") : "";
      lines.push(
        `| ${escapeTable(fixture.id)} | ${escapeTable(result.mode)} | ${correctness} | ${escapeTable(checks)} | ${escapeTable(result.actualPath ?? "-")} | ${escapeTable(result.actualLines ?? "-")} | ${escapeTable(result.candidatePaths.join(", ") || "-")} | ${result.rawBytes}/${result.contextBytes} | ${formatPercent(result.contextReductionPercent)} | ${result.latencyMs.p50.toFixed(2)}/${result.latencyMs.p95.toFixed(2)} | ${buildQuery} | ${escapeTable(result.indexMode ?? "-")} | ${escapeTable(notes)} |`,
      );
    }
  }

  lines.push(
    "",
    "## Adoption Decision",
    "",
    "Index adopted by default: no. This slice only records benchmark evidence; scanner behavior remains the default until a later adoption checkpoint explicitly approves otherwise.",
    "",
    "## Regression Status",
    "",
    report.summary.index.failed === 0 && report.summary.fts.failed === 0 && report.summary.hybrid.failed === 0
      ? "Warm experimental index, FTS5/BM25/trigram, and hybrid modes passed all gated fixtures without generated-artifact false positives."
      : `Failures: warm index ${report.summary.index.failed}, FTS5/BM25/trigram ${report.summary.fts.failed}, hybrid ${report.summary.hybrid.failed}.`,
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
    observation = { toolPathUsed: mode, skipped: true, skipReason: "No observation was produced.", rawBytes: 0, contextBytes: 0, excerpt: "", notes: ["no observation"] };
  }

  const correctness = scoreCorrectness(fixtureExpectedForMode(fixture, mode), observation);
  const result: IndexBenchmarkModeResult = {
    mode,
    toolPathUsed: observation.toolPathUsed,
    skipped: observation.skipped ?? false,
    rawBytes: observation.rawBytes,
    contextBytes: observation.contextBytes,
    contextReductionPercent: reductionPercent(observation.rawBytes, observation.contextBytes),
    latencyMs: latencySummary(latencies),
    candidatePaths: observation.candidatePaths ?? [],
    excerpt: observation.excerpt,
    correctness,
    notes: observation.notes ?? [],
  };
  if (observation.skipReason) {
    result.skipReason = observation.skipReason;
  }
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

    const finalFiles = mode === "scanner-default" || mode === "index-cold" || mode === "index-warm" || mode === "fts5-bm25-trigram" || mode === "hybrid-warm"
      ? { ...fixture.files, ...(fixture.staleFiles && fixture.staleExpected ? fixture.staleFiles : {}) }
      : fixture.files;
    await writeFixtureFiles(root.path, finalFiles);

    if (mode === "scanner-default") {
      return await scannerObservation(root.path, fixture.staleQuery && fixture.staleExpected ? fixture.staleQuery : fixture.query);
    }

    if (mode === "fts5-bm25-trigram") {
      return await ftsObservation(root.path, fixture.staleQuery && fixture.staleExpected ? fixture.staleQuery : fixture.query);
    }

    if (mode === "hybrid-warm") {
      await buildOrLoadExperimentalRepoIndex({ root: root.path, cacheRoot: cacheRoot.path });
      return await hybridObservation(root.path, cacheRoot.path, fixture.staleQuery && fixture.staleExpected ? fixture.staleQuery : fixture.query);
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
  const result = await freeflowRetrieve({ action: "query", source: { kind: "repo", root }, query, preserve: "important", topK: BENCHMARK_TOP_K });
  const queryMs = performance.now() - queryStartedAt;
  const evidence = result.evidence?.[0];
  const candidatePaths = uniqueCandidatePaths(result.evidence?.map((packet) => packet.path));
  return {
    toolPathUsed: "scanner-default: freeflowRetrieve repo scanner",
    rawBytes,
    contextBytes: byteLength(JSON.stringify(result)),
    ...(evidence?.path !== undefined ? { actualPath: evidence.path } : {}),
    ...(evidence?.lines !== undefined ? { actualLines: evidence.lines } : {}),
    candidatePaths,
    excerpt: evidence?.excerpt ?? "",
    queryMs,
    notes: [result.routing.reason],
  };
}

async function indexObservation(root: string, cacheRoot: string, query: string, mode: IndexBenchmarkMode): Promise<IndexObservation> {
  const rawBytes = await repoRawBytes(root);
  const load = await buildOrLoadExperimentalRepoIndex({ root, cacheRoot });
  const queryStartedAt = performance.now();
  const candidates = queryExperimentalRepoIndex(load.index, query, { topK: BENCHMARK_TOP_K });
  const queryMs = performance.now() - queryStartedAt;
  const candidate = candidates[0];
  return {
    toolPathUsed: `${mode}: experimental local index`,
    rawBytes,
    contextBytes: byteLength(JSON.stringify(candidates)),
    ...(candidate?.path !== undefined ? { actualPath: candidate.path } : {}),
    ...(candidate?.lines !== undefined ? { actualLines: candidate.lines } : {}),
    candidatePaths: uniqueCandidatePaths(candidates.map((entry) => entry.path)),
    excerpt: candidate?.excerpt ?? "",
    buildMs: load.buildMs,
    queryMs,
    indexMode: load.mode,
    notes: candidate ? [candidate.reason, `cachePath=${load.cachePath}`, ...(load.refreshReason ? [`refresh=${load.refreshReason}`] : [])] : ["no index candidate"],
  };
}

async function ftsObservation(root: string, query: string): Promise<IndexObservation> {
  const rawBytes = await repoRawBytes(root);
  const ftsStatus = detectFtsCandidateStatus();
  if (!ftsStatus.available) {
    return {
      toolPathUsed: "fts5-bm25-trigram: unavailable optional candidate",
      skipped: true,
      skipReason: ftsStatus.reason,
      rawBytes,
      contextBytes: 0,
      candidatePaths: [],
      excerpt: "",
      notes: [ftsStatus.reason],
    };
  }

  const files = await readFtsTextFiles(root);
  const sqlite = loadSqliteModule();
  const startedAt = performance.now();
  const db = new sqlite.DatabaseSync(":memory:");
  try {
    db.exec("CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, body, tokenize='trigram')");
    const insert = db.prepare("INSERT INTO docs(path, body) VALUES (?, ?)");
    for (const file of files) {
      insert.run(file.path, file.text);
    }
    const matchQuery = ftsMatchQuery(query);
    const rows = matchQuery
      ? db.prepare("SELECT path, bm25(docs) AS rank FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?").all(matchQuery, BENCHMARK_TOP_K) as Array<{ path: string; rank: number }>
      : [];
    const queryMs = performance.now() - startedAt;
    const byPath = new Map(files.map((file) => [file.path, file]));
    const candidates = rows.flatMap((row) => {
      const file = byPath.get(row.path);
      if (!file) {
        return [];
      }
      const range = bestFtsLineRange(file, query);
      return [{
        path: file.path,
        lines: `${range.start}-${range.end}`,
        excerpt: file.lines.slice(range.start - 1, range.end).join("\n"),
        rank: row.rank,
        reason: `SQLite FTS5 trigram MATCH with bm25 rank ${row.rank.toFixed(6)}`,
      }];
    });
    const first = candidates[0];
    return {
      toolPathUsed: "fts5-bm25-trigram: node:sqlite FTS5 trigram virtual table",
      rawBytes,
      contextBytes: byteLength(JSON.stringify(candidates)),
      ...(first?.path !== undefined ? { actualPath: first.path } : {}),
      ...(first?.lines !== undefined ? { actualLines: first.lines } : {}),
      candidatePaths: uniqueCandidatePaths(candidates.map((candidate) => candidate.path)),
      excerpt: first?.excerpt ?? "",
      buildMs: queryMs,
      queryMs,
      notes: first ? [first.reason] : ["no FTS5 candidate"],
    };
  } finally {
    db.close();
  }
}

async function hybridObservation(root: string, cacheRoot: string, query: string): Promise<IndexObservation> {
  const rawBytes = await repoRawBytes(root);
  const load = await buildOrLoadExperimentalRepoIndex({ root, cacheRoot });
  const indexStartedAt = performance.now();
  const indexCandidates = queryExperimentalRepoIndex(load.index, query, { topK: BENCHMARK_TOP_K });
  const indexQueryMs = performance.now() - indexStartedAt;
  const scannerStartedAt = performance.now();
  const scanner = await freeflowRetrieve({ action: "query", source: { kind: "repo", root }, query, preserve: "important", topK: BENCHMARK_TOP_K });
  const scannerQueryMs = performance.now() - scannerStartedAt;
  const scannerEvidence = scanner.evidence?.[0];
  const scannerPaths = uniqueCandidatePaths(scanner.evidence?.map((packet) => packet.path));
  const indexPaths = uniqueCandidatePaths(indexCandidates.map((candidate) => candidate.path));
  const hybridInput: HybridSelectionOptions = { scannerPaths, indexCandidates, indexPaths };
  if (scannerEvidence !== undefined) {
    hybridInput.scannerEvidence = scannerEvidence;
  }
  const selected = chooseHybridCandidate(hybridInput);
  const contextPayload = {
    selected: selected.payload,
    scannerCandidateCount: scannerPaths.length,
    indexCandidateCount: indexPaths.length,
    selection: selected.selection,
  };
  return {
    toolPathUsed: "hybrid-warm: scanner fallback with warm lexical-index candidates",
    rawBytes,
    contextBytes: byteLength(JSON.stringify(contextPayload)),
    ...(selected.path !== undefined ? { actualPath: selected.path } : {}),
    ...(selected.lines !== undefined ? { actualLines: selected.lines } : {}),
    candidatePaths: uniqueCandidatePaths([...scannerPaths, ...indexPaths]),
    excerpt: selected.excerpt,
    buildMs: load.buildMs,
    queryMs: indexQueryMs + scannerQueryMs,
    indexMode: load.mode,
    notes: [
      `selection=${selected.selection}`,
      `scannerQueryMs=${scannerQueryMs.toFixed(2)}`,
      `indexQueryMs=${indexQueryMs.toFixed(2)}`,
      ...(load.refreshReason ? [`refresh=${load.refreshReason}`] : []),
    ],
  };
}

interface HybridSelectionOptions {
  scannerEvidence?: { path?: string; lines?: string; excerpt?: string };
  scannerPaths: readonly string[];
  indexCandidates: readonly ExperimentalIndexCandidate[];
  indexPaths: readonly string[];
}

interface HybridSelection {
  selection: "scanner-index-agree" | "scanner-fallback" | "index-only" | "none";
  path?: string;
  lines?: string;
  excerpt: string;
  payload: Record<string, unknown>;
}

function chooseHybridCandidate(options: HybridSelectionOptions): HybridSelection {
  const scannerEvidence = options.scannerEvidence;
  if (scannerEvidence?.path) {
    const indexAgrees = options.indexPaths.includes(scannerEvidence.path);
    return {
      selection: indexAgrees ? "scanner-index-agree" : "scanner-fallback",
      path: scannerEvidence.path,
      ...(scannerEvidence.lines !== undefined ? { lines: scannerEvidence.lines } : {}),
      excerpt: scannerEvidence.excerpt ?? "",
      payload: {
        source: "scanner",
        path: scannerEvidence.path,
        ...(scannerEvidence.lines !== undefined ? { lines: scannerEvidence.lines } : {}),
        indexAgrees,
      },
    };
  }

  const indexCandidate = options.indexCandidates[0];
  if (indexCandidate) {
    return {
      selection: "index-only",
      path: indexCandidate.path,
      lines: indexCandidate.lines,
      excerpt: indexCandidate.excerpt,
      payload: {
        source: "index",
        path: indexCandidate.path,
        lines: indexCandidate.lines,
        score: indexCandidate.score,
      },
    };
  }

  return { selection: "none", excerpt: "", payload: { source: "none" } };
}

interface FtsTextFile {
  path: string;
  text: string;
  lines: string[];
}

interface SqliteModule {
  DatabaseSync: new (filename: string) => SqliteDatabase;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteStatement {
  run(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

function detectFtsCandidateStatus(): FtsCandidateStatus {
  if (cachedFtsCandidateStatus !== undefined) {
    return cachedFtsCandidateStatus;
  }

  let db: SqliteDatabase | undefined;
  try {
    const sqlite = loadSqliteModule();
    db = new sqlite.DatabaseSync(":memory:");
    db.exec("CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, body, tokenize='trigram')");
    db.exec("INSERT INTO docs(path, body) VALUES ('probe', 'freeflow fts probe')");
    const rows = db.prepare("SELECT path, bm25(docs) AS rank FROM docs WHERE docs MATCH ?").all("freeflow AND probe");
    cachedFtsCandidateStatus = rows.length > 0
      ? {
          available: true,
          engine: "fts5-bm25-trigram",
          reason: "Node node:sqlite is available and supports SQLite FTS5 trigram tokenization with bm25 ranking.",
        }
      : {
          available: false,
          engine: "none",
          reason: "SQLite FTS5 probe returned no rows for a known trigram query.",
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cachedFtsCandidateStatus = {
      available: false,
      engine: "none",
      reason: `SQLite FTS5/BM25/trigram candidate unavailable: ${message}`,
    };
  } finally {
    db?.close();
  }

  return cachedFtsCandidateStatus;
}

function loadSqliteModule(): SqliteModule {
  return require("node:sqlite") as SqliteModule;
}

async function readFtsTextFiles(root: string): Promise<FtsTextFile[]> {
  const files: FtsTextFile[] = [];
  await collectFtsTextFiles(root, root, files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectFtsTextFiles(root: string, currentPath: string, files: FtsTextFile[]): Promise<void> {
  const currentStat = await stat(currentPath);
  if (currentStat.isDirectory()) {
    const dirEntries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of dirEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      await collectFtsTextFiles(root, resolve(currentPath, entry.name), files);
    }
    return;
  }
  if (!currentStat.isFile()) {
    return;
  }

  const path = relative(root, currentPath).split(/[\\/]+/).join("/");
  if (isGeneratedBenchmarkPath(path)) {
    return;
  }

  try {
    const text = await readFile(currentPath, "utf8");
    if (!text.includes("\0")) {
      files.push({ path, text, lines: splitLines(text) });
    }
  } catch {
    // ignore non-text fixture files
  }
}

function ftsMatchQuery(query: string): string {
  return searchTokens(query).filter((token) => token.length >= 3).join(" AND ");
}

function bestFtsLineRange(file: FtsTextFile, query: string): { start: number; end: number } {
  const tokens = searchTokens(query);
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < file.lines.length; index += 1) {
    const normalizedLine = (file.lines[index] ?? "").toLowerCase();
    const score = tokens.reduce((sum, token) => sum + (normalizedLine.includes(token) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  const start = Math.max(1, bestIndex + 1 - FTS_CONTEXT_LINES);
  const end = Math.min(file.lines.length, bestIndex + 1 + FTS_CONTEXT_LINES);
  return { start, end };
}

function searchTokens(value: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of value.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

function summarizeIndexReport(fixtures: IndexBenchmarkFixtureResult[]): IndexBenchmarkSummary {
  const scanner = summarizeMode(fixtures, "scanner-default");
  const index = summarizeMode(fixtures, "index-warm");
  const fts = summarizeMode(fixtures, "fts5-bm25-trigram");
  const hybrid = summarizeMode(fixtures, "hybrid-warm");
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
    ftsCandidate: detectFtsCandidateStatus(),
    scanner,
    index,
    fts,
    hybrid,
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
      if (result.skipped) {
        summary.skipped += 1;
      } else if (result.correctness.passed) {
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
      if (result.correctness.recallAtK) {
        summary.recallAtK += 1;
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
      recallAtK: 0,
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
  if (observation.skipped) {
    return {
      passed: false,
      pathCorrect: false,
      spanCorrect: false,
      excerptComplete: false,
      recallAtK: false,
      generatedFalsePositive: false,
    };
  }

  const pathCorrect = observation.actualPath === expected.path;
  const spanCorrect = expected.lines ? Boolean(observation.actualLines && rangesOverlap(expected.lines, observation.actualLines)) : true;
  const excerptComplete = expected.requiredExcerpt.every((snippet) => observation.excerpt.toLowerCase().includes(snippet.toLowerCase()));
  const candidatePaths = observation.candidatePaths ?? [];
  const recallAtK = candidatePaths.length === 0 ? pathCorrect : candidatePaths.includes(expected.path);
  const generatedFalsePositive = observation.actualPath ? isGeneratedBenchmarkPath(observation.actualPath) : false;
  return {
    passed: pathCorrect && spanCorrect && excerptComplete && recallAtK && !generatedFalsePositive,
    pathCorrect,
    spanCorrect,
    excerptComplete,
    recallAtK,
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
  return ["scanner-default", "index-cold", "index-warm", "index-stale-refresh", "fts5-bm25-trigram", "hybrid-warm"];
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

function uniqueCandidatePaths(paths: readonly (string | undefined)[] | undefined): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const path of paths ?? []) {
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    unique.push(path);
  }
  return unique;
}

function isGeneratedBenchmarkPath(path: string): boolean {
  const segments = path.split(/[\\/]+/);
  if (segments.includes("graphify-out")) {
    return true;
  }
  const name = segments.at(-1)?.toLowerCase() ?? path.toLowerCase();
  return name.endsWith(".log") || name.endsWith(".map") || name.endsWith(".min.js") || name.endsWith(".min.css") || name.includes(".bundle.");
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function formatCorrectnessChecks(correctness: IndexCorrectnessResult): string {
  return [
    `path ${correctness.pathCorrect ? "✓" : "✗"}`,
    `span ${correctness.spanCorrect ? "✓" : "✗"}`,
    `excerpt ${correctness.excerptComplete ? "✓" : "✗"}`,
    `recall@${BENCHMARK_TOP_K} ${correctness.recallAtK ? "✓" : "✗"}`,
    `gen-fp ${correctness.generatedFalsePositive ? "✗" : "✓"}`,
  ].join(" ");
}

function defaultReportPath(): string {
  return resolve(process.cwd(), "evals/reports/runtime/output-router-index-benchmark-1-report.md");
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
  console.log(`Freeflow repo search backend benchmark ${shortId}: scanner ${report.summary.scanner.passed}/${report.summary.fixtures}, index ${report.summary.index.passed}/${report.summary.fixtures}, fts ${report.summary.fts.passed}/${report.summary.fixtures}, hybrid ${report.summary.hybrid.passed}/${report.summary.fixtures} pass`);
  console.log(`Markdown report: ${reports.markdown}`);
  if (reports.json) {
    console.log(`JSON run data: ${reports.json}`);
  }
  if (report.summary.scanner.failed > 0 || report.summary.index.failed > 0 || report.summary.fts.failed > 0 || report.summary.hybrid.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runCli();
}
