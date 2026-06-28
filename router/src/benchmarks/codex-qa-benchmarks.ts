import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import { freeflowSearch } from "../tools/search.js";
import type { EvidencePacket } from "../config/types.js";

export interface RunCodexQaBenchmarksOptions {
  iterations?: number;
  generatedAt?: string;
}

export interface CodexQaBenchmarkReport {
  generatedAt: string;
  iterations: number;
  summary: CodexQaBenchmarkSummary;
  fixtures: CodexQaBenchmarkFixtureResult[];
  skippedExternalTools: CodexQaSkippedExternalTool[];
}

export interface CodexQaBenchmarkSummary {
  fixtures: number;
  modeResults: number;
  improved: CodexQaModeSummary;
  nativeBaseline: CodexQaModeSummary;
  sandboxFailureFixed: boolean;
  generatedFalsePositiveCount: number;
}

export interface CodexQaModeSummary {
  passed: number;
  failed: number;
  skipped: number;
  answerCorrect: number;
  citationCorrect: number;
  evidenceCorrect: number;
  generatedFalsePositiveCount: number;
  totalRawBytes: number;
  totalContextBytes: number;
  totalRawTokensApprox: number;
  totalContextTokensApprox: number;
  weightedByteReductionPercent: number;
  weightedTokenReductionPercent: number;
}

export interface CodexQaBenchmarkFixtureResult {
  id: string;
  title: string;
  question: string;
  expected: CodexQaExpected;
  results: CodexQaModeResult[];
}

export interface CodexQaExpected {
  path: string;
  requiredEvidence: string[];
  requiredAnswer: string[];
  sourceCitationStatus: "skipped-unavailable" | "checked";
}

export interface CodexQaModeResult {
  mode: CodexQaBenchmarkMode;
  toolPathUsed: string;
  skipped: boolean;
  skipReason?: string;
  proxyCalls: number;
  rawBytes: number;
  rawTokensApprox: number;
  contextBytes: number;
  contextTokensApprox: number;
  byteReductionPercent: number;
  tokenReductionPercent: number;
  latencyMs: {
    p50: number;
    p95: number;
  };
  actualPath?: string;
  actualLines?: string;
  answer: string;
  evidenceExcerpt: string;
  correctness: CodexQaCorrectness;
  notes: string[];
}

export interface CodexQaCorrectness {
  passed: boolean;
  answerCorrect: boolean;
  citationCorrect: boolean;
  evidenceCorrect: boolean;
  generatedFalsePositive: boolean;
}

export interface CodexQaSkippedExternalTool {
  name: string;
  reason: string;
}

type CodexQaBenchmarkMode = "native-broad-search-proxy" | "improved-freeflow-router";

interface CodexQaFixture {
  id: string;
  title: string;
  question: string;
  query: string;
  expected: CodexQaExpected;
  root: string;
  cleanup: () => Promise<void>;
}

interface CodexQaObservation {
  toolPathUsed: string;
  proxyCalls: number;
  rawBytes: number;
  contextBytes: number;
  actualPath?: string;
  actualLines?: string;
  evidenceExcerpt: string;
  answer: string;
  notes: string[];
}

const SANDBOX_DOC_PATH = "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md";
const GENERATED_GRAPH_PATH = "graphify-out/graph.html";

const SANDBOX_QUESTION = "Find the Sandbox Permissions section, report file/lines, and explain UseDefault, RequireEscalated, and WithAdditionalPermissions.";
const SANDBOX_QUERY = "Sandbox Permissions SandboxPermissions UseDefault RequireEscalated WithAdditionalPermissions Plain-language meaning";

const SANDBOX_REQUIRED_EVIDENCE = [
  "SandboxPermissions is a per-command request shape",
  "UseDefault",
  "Run with the turn's normal sandbox",
  "RequireEscalated",
  "Request unsandboxed execution",
  "WithAdditionalPermissions",
  "Stay sandboxed but widen permissions for this one command",
];

const SANDBOX_REQUIRED_ANSWER = [
  "UseDefault: run with the turn's normal sandbox",
  "RequireEscalated: request unsandboxed execution",
  "WithAdditionalPermissions: stay sandboxed but widen permissions for this one command",
];

export async function runCodexQaBenchmarks(options: RunCodexQaBenchmarksOptions = {}): Promise<CodexQaBenchmarkReport> {
  const iterations = normalizeIterations(options.iterations, 1);
  const fixture = await createSandboxPermissionsFixture();
  try {
    const results: CodexQaBenchmarkFixtureResult[] = [];
    const modeResults: CodexQaModeResult[] = [];
    for (const mode of ["native-broad-search-proxy", "improved-freeflow-router"] as const) {
      modeResults.push(await runModeIterations(fixture, mode, iterations));
    }

    results.push({
      id: fixture.id,
      title: fixture.title,
      question: fixture.question,
      expected: fixture.expected,
      results: modeResults,
    });

    return {
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      iterations,
      summary: summarizeCodexQaReport(results),
      fixtures: results,
      skippedExternalTools: skippedExternalTools(),
    };
  } finally {
    await fixture.cleanup();
  }
}

export async function writeCodexQaBenchmarkReports(
  report: CodexQaBenchmarkReport,
  markdownReportPath: string,
  options: { jsonReportPath?: string | false | undefined } = {},
): Promise<{ markdown: string; json?: string }> {
  return writeBenchmarkReportPair({
    report,
    markdownReportPath,
    jsonReportPath: options.jsonReportPath ?? defaultJsonRunReportPath(markdownReportPath),
    renderMarkdown: renderCodexQaBenchmarkReport,
  });
}

export function renderCodexQaBenchmarkReport(report: CodexQaBenchmarkReport): string {
  const lines: string[] = [
    "# Codex Structured Q&A Macro Benchmark Report - Iteration 1",
    "",
    `Date: ${report.generatedAt.slice(0, 10)}`,
    "",
    "## Scope",
    "",
    "Fast, deterministic Stage 1 macro benchmark for the Codex CLI agent-harness research corpus. The benchmark asks one structured Q&A question derived from the Sandbox Permissions pass and grades retrieval-backed answer quality, citation quality, evidence quality, context size, and latency.",
    "",
    "The fixture uses existing Freeflow research docs as oracle scaffolding and includes a generated `graphify-out` decoy to preserve the original broad-retrieval failure shape. Upstream Codex source citation comparison is marked skipped until a source snapshot is explicitly supplied.",
    "",
    "## Command",
    "",
    "```sh",
    "npm run bench:router:codex-qa",
    "```",
    "",
    "The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.",
    "",
    "## Summary",
    "",
    `- Iterations per mode: ${report.iterations}`,
    `- Fixtures: ${report.summary.fixtures}`,
    `- Improved Freeflow Router gated pass: ${report.summary.improved.passed}/${report.summary.fixtures}`,
    `- Native broad-search proxy pass: ${report.summary.nativeBaseline.passed}/${report.summary.fixtures}`,
    `- Sandbox failure fixed: ${report.summary.sandboxFailureFixed ? "yes" : "no"}`,
    `- Generated false positives observed: ${report.summary.generatedFalsePositiveCount}/${report.summary.modeResults} mode results`,
    `- Improved answer/citation/evidence: ${report.summary.improved.answerCorrect}/${report.summary.fixtures} answer, ${report.summary.improved.citationCorrect}/${report.summary.fixtures} citation, ${report.summary.improved.evidenceCorrect}/${report.summary.fixtures} evidence`,
    `- Improved weighted byte/token reduction: ${formatPercent(report.summary.improved.weightedByteReductionPercent)} / ${formatPercent(report.summary.improved.weightedTokenReductionPercent)} (${report.summary.improved.totalRawBytes}/${report.summary.improved.totalRawTokensApprox} raw to ${report.summary.improved.totalContextBytes}/${report.summary.improved.totalContextTokensApprox} context)`,
    "",
    "## Results",
    "",
    "| fixture | mode | correctness | checks | path | lines | raw bytes/tokens | context bytes/tokens | byte/token reduction | latency p50/p95 ms | proxy calls | answer | notes |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  ];

  for (const fixture of report.fixtures) {
    for (const result of fixture.results) {
      lines.push([
        fixture.id,
        result.mode,
        result.correctness.passed ? "pass" : "fail",
        `answer ${mark(result.correctness.answerCorrect)} citation ${mark(result.correctness.citationCorrect)} evidence ${mark(result.correctness.evidenceCorrect)} gen-fp ${mark(!result.correctness.generatedFalsePositive)}`,
        result.actualPath ?? "-",
        result.actualLines ?? "-",
        `${result.rawBytes}/${result.rawTokensApprox}`,
        `${result.contextBytes}/${result.contextTokensApprox}`,
        `${formatPercent(result.byteReductionPercent)}/${formatPercent(result.tokenReductionPercent)}`,
        `${result.latencyMs.p50.toFixed(2)}/${result.latencyMs.p95.toFixed(2)}`,
        String(result.proxyCalls),
        result.answer,
        result.notes.join("; "),
      ].map((cell) => escapeTable(String(cell))).join(" | ").replace(/^/, "|").replace(/$/, " |"));
    }
  }

  lines.push(
    "",
    "## Fixture Questions",
    "",
  );
  for (const fixture of report.fixtures) {
    lines.push(`- ${fixture.id}: ${fixture.question}`);
    lines.push(`  - expected doc: \`${fixture.expected.path}\``);
    lines.push(`  - upstream source citation comparison: ${fixture.expected.sourceCitationStatus}`);
  }

  lines.push(
    "",
    "## Skipped External Comparators",
    "",
  );
  for (const skipped of report.skippedExternalTools) {
    lines.push(`- ${skipped.name}: ${skipped.reason}`);
  }

  return `${lines.join("\n")}\n`;
}

async function runModeIterations(
  fixture: CodexQaFixture,
  mode: CodexQaBenchmarkMode,
  iterations: number,
): Promise<CodexQaModeResult> {
  const latencies: number[] = [];
  let firstObservation: CodexQaObservation | undefined;
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const observation = mode === "native-broad-search-proxy"
      ? await nativeBroadSearchObservation(fixture)
      : await improvedFreeflowObservation(fixture);
    latencies.push(performance.now() - startedAt);
    firstObservation ??= observation;
  }

  if (!firstObservation) {
    throw new Error("Codex Q&A benchmark produced no observation");
  }

  const correctness = gradeObservation(fixture, firstObservation);
  return {
    mode,
    toolPathUsed: firstObservation.toolPathUsed,
    skipped: false,
    proxyCalls: firstObservation.proxyCalls,
    rawBytes: firstObservation.rawBytes,
    rawTokensApprox: approximateTokens(firstObservation.rawBytes),
    contextBytes: firstObservation.contextBytes,
    contextTokensApprox: approximateTokens(firstObservation.contextBytes),
    byteReductionPercent: reductionPercent(firstObservation.rawBytes, firstObservation.contextBytes),
    tokenReductionPercent: reductionPercent(approximateTokens(firstObservation.rawBytes), approximateTokens(firstObservation.contextBytes)),
    latencyMs: latencySummary(latencies),
    ...(firstObservation.actualPath !== undefined ? { actualPath: firstObservation.actualPath } : {}),
    ...(firstObservation.actualLines !== undefined ? { actualLines: firstObservation.actualLines } : {}),
    answer: firstObservation.answer,
    evidenceExcerpt: firstObservation.evidenceExcerpt,
    correctness,
    notes: firstObservation.notes,
  };
}

async function improvedFreeflowObservation(fixture: CodexQaFixture): Promise<CodexQaObservation> {
  const queryResult = await freeflowSearch({
    action: "query",
    source: { kind: "repo", root: fixture.root },
    query: fixture.query,
    preserve: "important",
    topK: 1,
  });
  const seedEvidence = queryResult.evidence?.[0];
  const expandedResult = seedEvidence
    ? await freeflowSearch({
      action: "expand",
      source: { kind: "repo", root: fixture.root },
      evidence: seedEvidence,
      expansion: "lines_30",
      preserve: "important",
    })
    : undefined;
  const evidence = expandedResult?.evidence?.[0] ?? seedEvidence;
  const evidenceExcerpt = evidence?.excerpt ?? "";
  return {
    toolPathUsed: "freeflowSearch repo query + expand",
    proxyCalls: expandedResult ? 2 : 1,
    rawBytes: await repoRawBytes(fixture.root),
    contextBytes: byteLength(JSON.stringify(queryResult)) + byteLength(JSON.stringify(expandedResult ?? {})),
    ...(evidence?.path !== undefined ? { actualPath: evidence.path } : {}),
    ...(evidence?.lines !== undefined ? { actualLines: evidence.lines } : {}),
    evidenceExcerpt,
    answer: answerFromEvidence(evidence, evidenceExcerpt),
    notes: [queryResult.routing.reason, ...(expandedResult ? [expandedResult.routing.reason] : ["expand skipped: no seed evidence"])],
  };
}

async function nativeBroadSearchObservation(fixture: CodexQaFixture): Promise<CodexQaObservation> {
  const files = await readRepoTextFiles(fixture.root);
  const tokens = tokenize(fixture.query);
  const scored = files
    .map((file) => ({ ...file, score: scoreText(file.text, tokens) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || b.bytes - a.bytes || a.path.localeCompare(b.path));
  const selected = scored[0];
  const evidenceExcerpt = selected?.text ?? "";
  return {
    toolPathUsed: "native broad text-search proxy including generated artifacts",
    proxyCalls: 1,
    rawBytes: await repoRawBytes(fixture.root),
    contextBytes: byteLength(evidenceExcerpt),
    ...(selected?.path !== undefined ? { actualPath: selected.path } : {}),
    ...(selected ? { actualLines: `1-${selected.lineCount}` } : {}),
    evidenceExcerpt,
    answer: answerFromEvidence(selected ? { path: selected.path, lines: `1-${selected.lineCount}` } : undefined, evidenceExcerpt),
    notes: selected ? [`lexical score=${selected.score}`] : ["no native match"],
  };
}

function gradeObservation(fixture: CodexQaFixture, observation: CodexQaObservation): CodexQaCorrectness {
  const answerCorrect = fixture.expected.requiredAnswer.every((phrase) => includesNormalized(observation.answer, phrase));
  const citationCorrect = observation.actualPath === fixture.expected.path && typeof observation.actualLines === "string";
  const evidenceCorrect = fixture.expected.requiredEvidence.every((phrase) => includesNormalized(observation.evidenceExcerpt, phrase));
  const generatedFalsePositive = observation.actualPath?.startsWith("graphify-out/") ?? false;
  return {
    passed: answerCorrect && citationCorrect && evidenceCorrect && !generatedFalsePositive,
    answerCorrect,
    citationCorrect,
    evidenceCorrect,
    generatedFalsePositive,
  };
}

function summarizeCodexQaReport(fixtures: CodexQaBenchmarkFixtureResult[]): CodexQaBenchmarkSummary {
  const improved = summarizeMode(fixtures, "improved-freeflow-router");
  const nativeBaseline = summarizeMode(fixtures, "native-broad-search-proxy");
  const modeResults = fixtures.reduce((count, fixture) => count + fixture.results.length, 0);
  const generatedFalsePositiveCount = fixtures
    .flatMap((fixture) => fixture.results)
    .filter((result) => result.correctness.generatedFalsePositive).length;
  return {
    fixtures: fixtures.length,
    modeResults,
    improved,
    nativeBaseline,
    sandboxFailureFixed: improved.failed === 0 && nativeBaseline.generatedFalsePositiveCount > 0,
    generatedFalsePositiveCount,
  };
}

function summarizeMode(fixtures: CodexQaBenchmarkFixtureResult[], mode: CodexQaBenchmarkMode): CodexQaModeSummary {
  const results = fixtures
    .map((fixture) => fixture.results.find((result) => result.mode === mode))
    .filter((result): result is CodexQaModeResult => Boolean(result));
  const totalRawBytes = results.reduce((sum, result) => sum + result.rawBytes, 0);
  const totalContextBytes = results.reduce((sum, result) => sum + result.contextBytes, 0);
  const totalRawTokensApprox = results.reduce((sum, result) => sum + result.rawTokensApprox, 0);
  const totalContextTokensApprox = results.reduce((sum, result) => sum + result.contextTokensApprox, 0);
  return results.reduce(
    (summary, result) => {
      if (result.skipped) {
        summary.skipped += 1;
      } else if (result.correctness.passed) {
        summary.passed += 1;
      } else {
        summary.failed += 1;
      }
      if (result.correctness.answerCorrect) {
        summary.answerCorrect += 1;
      }
      if (result.correctness.citationCorrect) {
        summary.citationCorrect += 1;
      }
      if (result.correctness.evidenceCorrect) {
        summary.evidenceCorrect += 1;
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
      answerCorrect: 0,
      citationCorrect: 0,
      evidenceCorrect: 0,
      generatedFalsePositiveCount: 0,
      totalRawBytes,
      totalContextBytes,
      totalRawTokensApprox,
      totalContextTokensApprox,
      weightedByteReductionPercent: reductionPercent(totalRawBytes, totalContextBytes),
      weightedTokenReductionPercent: reductionPercent(totalRawTokensApprox, totalContextTokensApprox),
    },
  );
}

async function createSandboxPermissionsFixture(): Promise<CodexQaFixture> {
  const root = await mkdtemp(join(tmpdir(), "freeflow-codex-qa-fixture-"));
  await writeTextFile(join(root, SANDBOX_DOC_PATH), sandboxDocumentText());
  await writeTextFile(
    join(root, GENERATED_GRAPH_PATH),
    [
      "<html><body>",
      `${"Sandbox Permissions SandboxPermissions UseDefault RequireEscalated WithAdditionalPermissions Plain-language meaning ".repeat(5_000)}GENERATED_GRAPH_DECOY_SENTINEL`,
      "</body></html>",
    ].join("\n"),
  );

  return {
    id: "sandbox-permissions-structured-qa",
    title: "Sandbox Permissions structured Q&A",
    question: SANDBOX_QUESTION,
    query: SANDBOX_QUERY,
    expected: {
      path: SANDBOX_DOC_PATH,
      requiredEvidence: SANDBOX_REQUIRED_EVIDENCE,
      requiredAnswer: SANDBOX_REQUIRED_ANSWER,
      sourceCitationStatus: "skipped-unavailable",
    },
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function sandboxDocumentText(): string {
  return [
    "# Pass 3",
    "",
    "### Sandbox Permissions",
    "",
    "SandboxPermissions is a per-command request shape.",
    "",
    "Codex defines:",
    "",
    "```text",
    "UseDefault",
    "RequireEscalated",
    "WithAdditionalPermissions",
    "```",
    "",
    "Plain-language meaning:",
    "",
    "```text",
    "UseDefault:",
    "  Run with the turn's normal sandbox.",
    "",
    "RequireEscalated:",
    "  Request unsandboxed execution.",
    "",
    "WithAdditionalPermissions:",
    "  Stay sandboxed but widen permissions for this one command.",
    "```",
    "",
    "This is a strong pattern for local agents.",
  ].join("\n");
}

function answerFromEvidence(evidence: Pick<EvidencePacket, "path" | "lines"> | undefined, text: string): string {
  const citation = evidence?.path ? `${evidence.path}${evidence.lines ? `:${evidence.lines}` : ""}` : "unknown source";
  const facts: string[] = [];
  if (includesNormalized(text, "Run with the turn's normal sandbox")) {
    facts.push("UseDefault: run with the turn's normal sandbox");
  }
  if (includesNormalized(text, "Request unsandboxed execution")) {
    facts.push("RequireEscalated: request unsandboxed execution");
  }
  if (includesNormalized(text, "Stay sandboxed but widen permissions for this one command")) {
    facts.push("WithAdditionalPermissions: stay sandboxed but widen permissions for this one command");
  }
  if (facts.length === 0) {
    return `Sandbox Permissions evidence from ${citation} did not include enough plain-language definitions to answer.`;
  }
  return `Sandbox Permissions are documented at ${citation}. ${facts.join(". ")}.`;
}

async function readRepoTextFiles(root: string): Promise<Array<{ path: string; text: string; bytes: number; lineCount: number }>> {
  const files: Array<{ path: string; text: string; bytes: number; lineCount: number }> = [];
  await walk(root, async (absolutePath) => {
    const text = await readFile(absolutePath, "utf8");
    files.push({
      path: relative(root, absolutePath),
      text,
      bytes: byteLength(text),
      lineCount: text.length === 0 ? 1 : text.split("\n").length,
    });
  });
  return files;
}

async function repoRawBytes(root: string): Promise<number> {
  let total = 0;
  await walk(root, async (absolutePath) => {
    total += (await stat(absolutePath)).size;
  });
  return total;
}

async function walk(root: string, visit: (absolutePath: string) => Promise<void>): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, visit);
    } else if (entry.isFile()) {
      await visit(absolutePath);
    }
  }
}

async function writeTextFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

function scoreText(text: string, queryTokens: readonly string[]): number {
  const counts = tokenCounts(text);
  return queryTokens.reduce((score, token) => score + (counts.get(token) ?? 0), 0);
}

function tokenCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [];
}

function includesNormalized(text: string, phrase: string): boolean {
  return normalizeText(text).includes(normalizeText(phrase));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}

function mark(value: boolean): string {
  return value ? "✓" : "✗";
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function skippedExternalTools(): CodexQaSkippedExternalTool[] {
  return [
    {
      name: "Graphify",
      reason: "Skipped unless a fresh graph for the benchmark fixture is explicitly supplied.",
    },
    {
      name: "Claude Context",
      reason: "Skipped unless an index is configured and fresh for the benchmark fixture.",
    },
  ];
}

function defaultReportPath(): string {
  return resolve(process.cwd(), "evals/reports/runtime/output-router-codex-qa-benchmark-1-report.md");
}

async function main(): Promise<void> {
  const { iterations, reportPath, jsonReportPath } = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: defaultReportPath() });
  const options: RunCodexQaBenchmarksOptions = {};
  if (iterations !== undefined) {
    options.iterations = iterations;
  }
  const report = await runCodexQaBenchmarks(options);
  const reports = await writeCodexQaBenchmarkReports(report, reportPath, { jsonReportPath });
  console.log(
    `Freeflow Codex Q&A benchmark: improved ${report.summary.improved.passed}/${report.summary.fixtures} pass; native ${report.summary.nativeBaseline.passed}/${report.summary.fixtures} pass`,
  );
  console.log(`Markdown report: ${reports.markdown}`);
  if (reports.json) {
    console.log(`JSON run data: ${reports.json}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
