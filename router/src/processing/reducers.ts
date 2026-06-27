export interface ProcessingReducerInput {
  text: string;
}

export interface ProcessingReducerFact {
  name: string;
  value: string | number | boolean;
}

export interface ProcessingReducerCandidate {
  name: string;
  version: string;
  confidence: number;
  reason: string;
}

export interface ProcessingReducerResult {
  name: string;
  version: string;
  confidence: number;
  reason: string;
  facts: ProcessingReducerFact[];
  visibleText: string;
  details: AccessLogReducerDetails | TestOutputReducerDetails | BuildOutputReducerDetails | DiagnosticsReducerDetails;
}

export type ProcessingReducerSelection =
  | {
      status: "selected";
      candidates: ProcessingReducerCandidate[];
      selected: ProcessingReducerCandidate;
      result: ProcessingReducerResult;
      reason: string;
    }
  | {
      status: "not_selected";
      candidates: ProcessingReducerCandidate[];
      reason: string;
    };

export interface AccessLogReducerDetails {
  kind: "access-log";
  requestCount: number;
  statusCounts: Record<string, number>;
  errorCount: number;
  errorRatePercent: number;
  averageLatencyMs: number;
  slowThresholdMs: number;
  slowRequestCount: number;
  slowExamples: AccessLogSlowExample[];
  ignoredLineCount: number;
}

export interface TestOutputReducerDetails {
  kind: "test-output";
  testFiles: TestOutputCounts;
  tests: TestOutputCounts;
  failedFiles: string[];
  failedTests: string[];
}

export interface TestOutputCounts {
  failed?: number;
  passed?: number;
  skipped?: number;
  total?: number;
}

export interface BuildOutputReducerDetails {
  kind: "build-output";
  finalStatus?: string;
  errorCount: number;
  warningCount: number;
  compiledCount: number;
  errorFiles: string[];
  warningFiles: string[];
  firstErrors: BuildIssueSummary[];
  firstWarnings: BuildIssueSummary[];
}

export interface BuildIssueSummary {
  file: string;
  message: string;
  line?: number;
  column?: number;
}

export interface DiagnosticsReducerDetails {
  kind: "diagnostics";
  total: number;
  errorCount: number;
  warningCount: number;
  fileCount: number;
  topFiles: Array<{ file: string; count: number }>;
  topCodes: Array<{ code: string; count: number }>;
  firstDiagnostics: DiagnosticSummary[];
}

export interface DiagnosticSummary {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  code?: string;
  message: string;
}

export interface AccessLogSlowExample {
  method: string;
  path: string;
  status: number;
  latencyMs: number;
}

interface AccessLogEntry {
  method: string;
  path: string;
  status: number;
  latencyMs: number;
}

const TEST_OUTPUT_REDUCER = {
  name: "test-output",
  version: "1",
};

const BUILD_OUTPUT_REDUCER = {
  name: "build-output",
  version: "1",
};

const DIAGNOSTICS_REDUCER = {
  name: "diagnostics",
  version: "1",
};

const ACCESS_LOG_REDUCER = {
  name: "access-log",
  version: "1",
};

const MIN_ACCESS_LOG_LINES = 5;
const MIN_ACCESS_LOG_CONFIDENCE = 0.8;
const SLOW_REQUEST_THRESHOLD_MS = 1_000;
const ACCESS_LOG_LINE = /^(\S+)\s+\S+\s+\S+\s+\[[^\]]+\]\s+"([A-Z]+)\s+([^"\s]+)\s+HTTP\/[^"\s]+"\s+(\d{3})\s+(?:\d+|-)\s+(\d+)ms\s*$/;

export function selectProcessingReducer(input: ProcessingReducerInput): ProcessingReducerSelection {
  const testOutput = reduceTestOutput(input.text);
  const buildOutput = reduceBuildOutput(input.text);
  const diagnostics = reduceDiagnosticsOutput(input.text);
  const accessLog = reduceAccessLog(input.text);
  const candidates = [testOutput.candidate, buildOutput.candidate, diagnostics.candidate, accessLog.candidate];
  const selected = [testOutput, buildOutput, diagnostics, accessLog].find((reduced) => reduced.result !== undefined);
  if (selected?.result) {
    return {
      status: "selected",
      candidates,
      selected: selected.candidate,
      result: selected.result,
      reason: selected.candidate.reason,
    };
  }

  return {
    status: "not_selected",
    candidates,
    reason: "No high-confidence built-in reducer matched the loaded source.",
  };
}

export function reduceTestOutput(text: string): { candidate: ProcessingReducerCandidate; result?: ProcessingReducerResult } {
  const lines = text.split(/\r?\n/);
  const testFiles = findTestCounts(lines, "Test Files");
  const tests = findTestCounts(lines, "Tests");
  const failedFiles = uniqueStrings(lines.map(parseFailedTestFile).filter((file): file is string => file !== undefined));
  const failedTests = lines.map(parseFailedTestName).filter((name): name is string => name !== undefined).slice(0, 8);
  const confidence = testOutputConfidence({ testFiles, tests, failedFiles, failedTests, text });
  const candidate: ProcessingReducerCandidate = {
    ...TEST_OUTPUT_REDUCER,
    confidence,
    reason: `Detected test summary counts=${testFiles || tests ? "yes" : "no"}, failedFiles=${failedFiles.length}, failedTests=${failedTests.length}.`,
  };

  if (confidence < 0.8 || (testFiles === undefined && tests === undefined)) {
    return { candidate };
  }

  const details: TestOutputReducerDetails = {
    kind: "test-output",
    testFiles: testFiles ?? {},
    tests: tests ?? {},
    failedFiles,
    failedTests,
  };
  return {
    candidate,
    result: {
      ...TEST_OUTPUT_REDUCER,
      confidence,
      reason: candidate.reason,
      facts: testOutputFacts(details),
      visibleText: renderTestOutputSummary(details),
      details,
    },
  };
}

function findTestCounts(lines: readonly string[], label: "Test Files" | "Tests"): TestOutputCounts | undefined {
  const pattern = label === "Test Files" ? /^\s*Test Files:?\s+(.+)$/i : /^\s*Tests:?\s+(.+)$/i;
  for (const line of lines) {
    const match = pattern.exec(line);
    if (!match) {
      continue;
    }
    const counts = parseTestCounts(match[1] ?? "");
    if (Object.keys(counts).length > 0) {
      return counts;
    }
  }
  return undefined;
}

function parseTestCounts(summary: string): TestOutputCounts {
  const counts: TestOutputCounts = {};
  const failed = /(\d+)\s+failed\b/i.exec(summary);
  const passed = /(\d+)\s+passed\b/i.exec(summary);
  const skipped = /(\d+)\s+(?:skipped|todo)\b/i.exec(summary);
  const parenthesizedTotal = /\((\d+)\)/.exec(summary);
  const total = parenthesizedTotal ?? /(\d+)\s+total\b/i.exec(summary);
  if (failed) {
    counts.failed = Number(failed[1]);
  }
  if (passed) {
    counts.passed = Number(passed[1]);
  }
  if (skipped) {
    counts.skipped = Number(skipped[1]);
  }
  if (total) {
    counts.total = Number(total[1]);
  }
  return counts;
}

function parseFailedTestFile(line: string): string | undefined {
  const vitest = /^\s*✗\s+([^\s]+\.(?:test|spec)\.[cm]?[jt]sx?)(?:\s|\(|$)/.exec(line);
  if (vitest) {
    return vitest[1];
  }
  const jest = /^\s*FAIL\s+([^\s]+\.(?:test|spec)\.[cm]?[jt]sx?)(?:\s|$)/.exec(line);
  return jest?.[1];
}

function parseFailedTestName(line: string): string | undefined {
  const match = /^\s*✗\s+(.+?)(?:\s+\d+ms)?\s*$/.exec(line);
  if (!match) {
    return undefined;
  }
  const name = match[1]?.trim();
  if (!name || /\.(?:test|spec)\.[cm]?[jt]sx?(?:\s|\(|$)/.test(name)) {
    return undefined;
  }
  return name;
}

function testOutputConfidence(input: {
  testFiles: TestOutputCounts | undefined;
  tests: TestOutputCounts | undefined;
  failedFiles: readonly string[];
  failedTests: readonly string[];
  text: string;
}): number {
  let confidence = 0;
  if (input.tests !== undefined) {
    confidence += 0.45;
  }
  if (input.testFiles !== undefined) {
    confidence += 0.35;
  }
  if (input.failedFiles.length > 0 || input.failedTests.length > 0) {
    confidence += 0.15;
  }
  if (/\b(?:vitest|jest|mocha|pytest|Test Files|Test Suites)\b/i.test(input.text)) {
    confidence += 0.1;
  }
  return Math.min(1, roundConfidence(confidence));
}

function testOutputFacts(details: TestOutputReducerDetails): ProcessingReducerFact[] {
  const facts: ProcessingReducerFact[] = [];
  const tests = countsSummary(details.tests);
  if (tests) {
    facts.push({ name: "tests", value: tests });
  }
  if (details.failedFiles.length > 0) {
    facts.push({ name: "failedFiles", value: details.failedFiles.slice(0, 8).join(", ") });
  }
  return facts;
}

function renderTestOutputSummary(details: TestOutputReducerDetails): string {
  const lines = ["test-output summary"];
  const tests = countsSummary(details.tests);
  const testFiles = countsSummary(details.testFiles);
  if (tests) {
    lines.push(`tests: ${tests}`);
  }
  if (testFiles) {
    lines.push(`testFiles: ${testFiles}`);
  }
  if (details.failedFiles.length > 0) {
    lines.push(`failedFiles: ${details.failedFiles.slice(0, 8).join(", ")}`);
  }
  if (details.failedTests.length > 0) {
    lines.push("failed tests:");
    details.failedTests.slice(0, 8).forEach((name) => lines.push(`- ${name}`));
  }
  return lines.join("\n");
}

function countsSummary(counts: TestOutputCounts): string {
  const parts: string[] = [];
  if (counts.failed !== undefined) {
    parts.push(`${counts.failed} failed`);
  }
  if (counts.passed !== undefined) {
    parts.push(`${counts.passed} passed`);
  }
  if (counts.skipped !== undefined) {
    parts.push(`${counts.skipped} skipped`);
  }
  if (counts.total !== undefined) {
    parts.push(`(${counts.total})`);
  }
  return parts.join(", ");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function reduceBuildOutput(text: string): { candidate: ProcessingReducerCandidate; result?: ProcessingReducerResult } {
  const lines = text.split(/\r?\n/);
  const finalStatus = lines.map((line) => stripAnsi(line).trim()).find((line) => /\bBuild completed with\b/i.test(line));
  const errors = lines.map(parseBuildError).filter((issue): issue is BuildIssueSummary => issue !== undefined);
  const warnings = lines.map(parseBuildWarning).filter((issue): issue is BuildIssueSummary => issue !== undefined);
  const compiledCount = lines.filter((line) => /^\s*✓\s+Compiled\s+/.test(stripAnsi(line))).length;
  const finalCounts = parseBuildFinalCounts(finalStatus);
  const errorCount = finalCounts.errors ?? errors.length;
  const warningCount = finalCounts.warnings ?? warnings.length;
  const confidence = buildOutputConfidence({ text, finalStatus, errors, warnings, compiledCount });
  const candidate: ProcessingReducerCandidate = {
    ...BUILD_OUTPUT_REDUCER,
    confidence,
    reason: `Detected build output finalStatus=${finalStatus ? "yes" : "no"}, errors=${errorCount}, warnings=${warningCount}.`,
  };

  if (confidence < 0.8 || (errorCount === 0 && warningCount === 0 && !finalStatus)) {
    return { candidate };
  }

  const details: BuildOutputReducerDetails = {
    kind: "build-output",
    errorCount,
    warningCount,
    compiledCount,
    errorFiles: uniqueStrings(errors.map((issue) => issue.file)),
    warningFiles: uniqueStrings(warnings.map((issue) => issue.file)),
    firstErrors: errors.slice(0, 5),
    firstWarnings: warnings.slice(0, 5),
    ...(finalStatus !== undefined ? { finalStatus } : {}),
  };
  return {
    candidate,
    result: {
      ...BUILD_OUTPUT_REDUCER,
      confidence,
      reason: candidate.reason,
      facts: buildOutputFacts(details),
      visibleText: renderBuildOutputSummary(details),
      details,
    },
  };
}

function parseBuildError(rawLine: string): BuildIssueSummary | undefined {
  const line = stripAnsi(rawLine);
  const match = /^\s*ERROR in\s+(.+?)(?:\((\d+),(\d+)\))?:\s*(.+?)\s*$/.exec(line);
  if (!match) {
    return undefined;
  }
  const issue: BuildIssueSummary = {
    file: match[1] ?? "unknown",
    message: match[4] ?? "",
  };
  if (match[2] !== undefined) {
    issue.line = Number(match[2]);
  }
  if (match[3] !== undefined) {
    issue.column = Number(match[3]);
  }
  return issue;
}

function parseBuildWarning(rawLine: string): BuildIssueSummary | undefined {
  const line = stripAnsi(rawLine);
  const match = /^\s*(?:⚠\s+)?Warning:\s+(.+?)\s+-\s+(.+?)\s*$/.exec(line);
  if (!match) {
    return undefined;
  }
  return {
    file: match[1] ?? "unknown",
    message: match[2] ?? "",
  };
}

function parseBuildFinalCounts(finalStatus: string | undefined): { errors?: number; warnings?: number } {
  if (!finalStatus) {
    return {};
  }
  const errors = /(\d+)\s+errors?\b/i.exec(finalStatus);
  const warnings = /(\d+)\s+warnings?\b/i.exec(finalStatus);
  return {
    ...(errors !== null ? { errors: Number(errors[1]) } : {}),
    ...(warnings !== null ? { warnings: Number(warnings[1]) } : {}),
  };
}

function buildOutputConfidence(input: {
  text: string;
  finalStatus: string | undefined;
  errors: readonly BuildIssueSummary[];
  warnings: readonly BuildIssueSummary[];
  compiledCount: number;
}): number {
  let confidence = 0;
  if (input.finalStatus !== undefined) {
    confidence += 0.55;
  }
  if (input.errors.length > 0 || input.warnings.length > 0) {
    confidence += 0.25;
  }
  if (input.compiledCount > 0) {
    confidence += 0.1;
  }
  if (/\b(?:Creating an optimized production build|Route \(app\)|First Load JS|next\.js|webpack|compiled)\b/i.test(input.text)) {
    confidence += 0.15;
  }
  return Math.min(1, roundConfidence(confidence));
}

function buildOutputFacts(details: BuildOutputReducerDetails): ProcessingReducerFact[] {
  const facts: ProcessingReducerFact[] = [
    { name: "build", value: `${details.errorCount} errors, ${details.warningCount} warnings` },
  ];
  const files = uniqueStrings([...details.errorFiles, ...details.warningFiles].map(basename));
  if (files.length > 0) {
    facts.push({ name: "files", value: files.slice(0, 6).join(", ") });
  }
  return facts;
}

function renderBuildOutputSummary(details: BuildOutputReducerDetails): string {
  const lines = [
    "build summary",
    `build: ${details.errorCount} errors, ${details.warningCount} warnings`,
  ];
  const files = uniqueStrings([...details.errorFiles, ...details.warningFiles].map(basename));
  if (files.length > 0) {
    lines.push(`files: ${files.slice(0, 6).join(", ")}`);
  }
  if (details.finalStatus) {
    lines.push(`final: ${details.finalStatus}`);
  }
  return lines.join("\n");
}

export function reduceDiagnosticsOutput(text: string): { candidate: ProcessingReducerCandidate; result?: ProcessingReducerResult } {
  const diagnostics = parseDiagnostics(text);
  const confidence = diagnosticsConfidence(diagnostics, text);
  const candidate: ProcessingReducerCandidate = {
    ...DIAGNOSTICS_REDUCER,
    confidence,
    reason: `Detected ${diagnostics.length} TypeScript/lint diagnostic line(s).`,
  };

  if (confidence < 0.8 || diagnostics.length === 0) {
    return { candidate };
  }

  const details = summarizeDiagnostics(diagnostics);
  return {
    candidate,
    result: {
      ...DIAGNOSTICS_REDUCER,
      confidence,
      reason: candidate.reason,
      facts: diagnosticsFacts(details),
      visibleText: renderDiagnosticsSummary(details),
      details,
    },
  };
}

function parseDiagnostics(text: string): DiagnosticSummary[] {
  const diagnostics: DiagnosticSummary[] = [];
  let currentLintFile: string | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripAnsi(rawLine);
    const ts = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/.exec(line);
    if (ts) {
      diagnostics.push({
        file: ts[1] ?? "unknown",
        line: Number(ts[2]),
        column: Number(ts[3]),
        severity: (ts[4] ?? "error") as "error" | "warning",
        code: ts[5] ?? "TS????",
        message: ts[6] ?? "",
      });
      continue;
    }

    const compactLint = /^(.+?\.[cm]?[jt]sx?):(\d+):(\d+):\s+(error|warning)\s+(.+?)(?:\s+([@A-Za-z0-9_/-]+))?\s*$/.exec(line);
    if (compactLint) {
      diagnostics.push({
        file: compactLint[1] ?? "unknown",
        line: Number(compactLint[2]),
        column: Number(compactLint[3]),
        severity: (compactLint[4] ?? "error") as "error" | "warning",
        ...(compactLint[6] !== undefined ? { code: compactLint[6] } : {}),
        message: compactLint[5] ?? "",
      });
      continue;
    }

    const lintFile = /^\s*([^\s].+\.[cm]?[jt]sx?)\s*$/.exec(line);
    if (lintFile) {
      currentLintFile = lintFile[1];
      continue;
    }

    const stylishLint = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([@A-Za-z0-9_/-]+)\s*$/.exec(line);
    if (stylishLint && currentLintFile) {
      diagnostics.push({
        file: currentLintFile,
        line: Number(stylishLint[1]),
        column: Number(stylishLint[2]),
        severity: (stylishLint[3] ?? "error") as "error" | "warning",
        message: stylishLint[4] ?? "",
        ...(stylishLint[5] !== undefined ? { code: stylishLint[5] } : {}),
      });
    }
  }
  return diagnostics;
}

function diagnosticsConfidence(diagnostics: readonly DiagnosticSummary[], text: string): number {
  const hasTsCodes = diagnostics.some((diagnostic) => diagnostic.code?.startsWith("TS"));
  const hasLintRules = diagnostics.some((diagnostic) => diagnostic.code !== undefined && !diagnostic.code.startsWith("TS"));
  const hasDiagnosticSummary = /\b(?:error TS\d+|problems?\s+\(|eslint|\d+\s+errors?)\b/i.test(text);
  if (diagnostics.length >= 3 && hasTsCodes) {
    return 1;
  }
  if (diagnostics.length >= 2 && hasLintRules) {
    return 0.95;
  }
  if (diagnostics.length >= 2 && hasDiagnosticSummary) {
    return 0.85;
  }
  if (diagnostics.length === 1 && (hasTsCodes || hasLintRules) && hasDiagnosticSummary) {
    return 0.75;
  }
  return roundConfidence(Math.min(0.7, diagnostics.length * 0.2));
}

function summarizeDiagnostics(diagnostics: readonly DiagnosticSummary[]): DiagnosticsReducerDetails {
  const fileCounts = new Map<string, number>();
  const codeCounts = new Map<string, number>();
  let errorCount = 0;
  let warningCount = 0;
  for (const diagnostic of diagnostics) {
    fileCounts.set(diagnostic.file, (fileCounts.get(diagnostic.file) ?? 0) + 1);
    if (diagnostic.code) {
      codeCounts.set(diagnostic.code, (codeCounts.get(diagnostic.code) ?? 0) + 1);
    }
    if (diagnostic.severity === "warning") {
      warningCount += 1;
    } else {
      errorCount += 1;
    }
  }
  return {
    kind: "diagnostics",
    total: diagnostics.length,
    errorCount,
    warningCount,
    fileCount: fileCounts.size,
    topFiles: topCounts(fileCounts, "file").map(({ key, count }) => ({ file: key, count })),
    topCodes: topCounts(codeCounts, "code").map(({ key, count }) => ({ code: key, count })),
    firstDiagnostics: diagnostics.slice(0, 5).map((diagnostic) => ({ ...diagnostic })),
  };
}

function diagnosticsFacts(details: DiagnosticsReducerDetails): ProcessingReducerFact[] {
  const facts: ProcessingReducerFact[] = [
    { name: "diagnostics", value: details.warningCount > 0 ? `${details.total} total` : `${details.total} errors` },
    { name: "files", value: details.fileCount },
  ];
  if (details.warningCount > 0) {
    facts.push({ name: "errors", value: details.errorCount });
    facts.push({ name: "warnings", value: details.warningCount });
  }
  if (details.topFiles.length > 0) {
    facts.push({ name: "topFiles", value: details.topFiles.slice(0, 3).map(({ file, count }) => `${basename(file)}:${count}`).join(", ") });
  }
  if (details.topCodes.length > 0) {
    facts.push({ name: "topCodes", value: details.topCodes.slice(0, 3).map(({ code, count }) => `${code}:${count}`).join(", ") });
  }
  return facts;
}

function renderDiagnosticsSummary(details: DiagnosticsReducerDetails): string {
  const lines = [
    "diagnostics summary",
    `diagnostics: ${details.total}`,
    `files: ${details.fileCount}`,
    `errors: ${details.errorCount}`,
  ];
  if (details.warningCount > 0) {
    lines.push(`warnings: ${details.warningCount}`);
  }
  if (details.topFiles.length > 0) {
    lines.push(`topFiles: ${details.topFiles.map(({ file, count }) => `${file}:${count}`).join(", ")}`);
  }
  if (details.topCodes.length > 0) {
    lines.push(`topCodes: ${details.topCodes.map(({ code, count }) => `${code}:${count}`).join(", ")}`);
  }
  return lines.join("\n");
}

function topCounts(map: ReadonlyMap<string, number>, tieBreaker: "file" | "code"): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }
      return tieBreaker === "file" ? leftKey.localeCompare(rightKey) : leftKey.localeCompare(rightKey, undefined, { numeric: true });
    })
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }));
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function reduceAccessLog(text: string): { candidate: ProcessingReducerCandidate; result?: ProcessingReducerResult } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const entries: AccessLogEntry[] = [];
  for (const line of lines) {
    const parsed = parseAccessLogLine(line);
    if (parsed) {
      entries.push(parsed);
    }
  }

  const parseRatio = lines.length === 0 ? 0 : entries.length / lines.length;
  const confidence = confidenceForAccessLog(lines.length, parseRatio);
  const candidate: ProcessingReducerCandidate = {
    ...ACCESS_LOG_REDUCER,
    confidence,
    reason: `Parsed ${entries.length}/${lines.length} non-empty line(s) as access log entries.`,
  };

  if (entries.length < MIN_ACCESS_LOG_LINES || confidence < MIN_ACCESS_LOG_CONFIDENCE) {
    return { candidate };
  }

  const details = summarizeAccessLog(entries, lines.length - entries.length);
  return {
    candidate,
    result: {
      ...ACCESS_LOG_REDUCER,
      confidence,
      reason: candidate.reason,
      facts: accessLogFacts(details),
      visibleText: renderAccessLogSummary(details),
      details,
    },
  };
}

function parseAccessLogLine(line: string): AccessLogEntry | undefined {
  const match = ACCESS_LOG_LINE.exec(line);
  if (!match) {
    return undefined;
  }
  const method = match[2];
  const path = match[3];
  const status = Number(match[4]);
  const latencyMs = Number(match[5]);
  if (!method || !path || !Number.isInteger(status) || !Number.isInteger(latencyMs)) {
    return undefined;
  }
  return { method, path, status, latencyMs };
}

function confidenceForAccessLog(lineCount: number, parseRatio: number): number {
  if (lineCount < MIN_ACCESS_LOG_LINES) {
    return roundConfidence(parseRatio * 0.5);
  }
  return roundConfidence(parseRatio);
}

function summarizeAccessLog(entries: readonly AccessLogEntry[], ignoredLineCount: number): AccessLogReducerDetails {
  const statusCounts: Record<string, number> = {};
  let errorCount = 0;
  let latencyTotal = 0;
  const slowExamples: AccessLogSlowExample[] = [];

  for (const entry of entries) {
    const status = String(entry.status);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (entry.status >= 400) {
      errorCount += 1;
    }
    latencyTotal += entry.latencyMs;
    if (entry.latencyMs >= SLOW_REQUEST_THRESHOLD_MS && slowExamples.length < 5) {
      slowExamples.push({ method: entry.method, path: entry.path, status: entry.status, latencyMs: entry.latencyMs });
    }
  }

  const requestCount = entries.length;
  const slowRequestCount = entries.filter((entry) => entry.latencyMs >= SLOW_REQUEST_THRESHOLD_MS).length;
  return {
    kind: "access-log",
    requestCount,
    statusCounts: sortStatusCounts(statusCounts),
    errorCount,
    errorRatePercent: roundPercent((errorCount / requestCount) * 100),
    averageLatencyMs: Math.round(latencyTotal / requestCount),
    slowThresholdMs: SLOW_REQUEST_THRESHOLD_MS,
    slowRequestCount,
    slowExamples,
    ignoredLineCount,
  };
}

function accessLogFacts(details: AccessLogReducerDetails): ProcessingReducerFact[] {
  return [
    { name: "requests", value: details.requestCount },
    { name: "errors", value: details.errorCount },
    { name: "errorRatePercent", value: details.errorRatePercent },
    { name: "averageLatencyMs", value: details.averageLatencyMs },
    { name: `slow>=${details.slowThresholdMs}ms`, value: details.slowRequestCount },
    ...Object.entries(details.statusCounts).map(([status, count]) => ({ name: `status.${status}`, value: count })),
  ];
}

function renderAccessLogSummary(details: AccessLogReducerDetails): string {
  const lines = [
    "access-log summary",
    `requests: ${details.requestCount}`,
    `errors: ${details.errorCount} (${details.errorRatePercent.toFixed(1)}%)`,
    `avgLatencyMs: ${details.averageLatencyMs}`,
    `slow>=${details.slowThresholdMs}ms: ${details.slowRequestCount}`,
    `status: ${Object.entries(details.statusCounts).map(([status, count]) => `${status}:${count}`).join(", ")}`,
  ];

  if (details.slowExamples.length > 0) {
    lines.push("slow examples:");
    for (const example of details.slowExamples) {
      lines.push(`- ${example.method} ${example.path} ${example.status} ${example.latencyMs}ms`);
    }
  }

  if (details.ignoredLineCount > 0) {
    lines.push(`ignoredLines: ${details.ignoredLineCount}`);
  }

  return lines.join("\n");
}

function sortStatusCounts(statusCounts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(statusCounts).sort(([left], [right]) => Number(left) - Number(right)));
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
