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
  details: AccessLogReducerDetails;
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

const ACCESS_LOG_REDUCER = {
  name: "access-log",
  version: "1",
};

const MIN_ACCESS_LOG_LINES = 5;
const MIN_ACCESS_LOG_CONFIDENCE = 0.8;
const SLOW_REQUEST_THRESHOLD_MS = 1_000;
const ACCESS_LOG_LINE = /^(\S+)\s+\S+\s+\S+\s+\[[^\]]+\]\s+"([A-Z]+)\s+([^"\s]+)\s+HTTP\/[^"\s]+"\s+(\d{3})\s+(?:\d+|-)\s+(\d+)ms\s*$/;

export function selectProcessingReducer(input: ProcessingReducerInput): ProcessingReducerSelection {
  const accessLog = reduceAccessLog(input.text);
  const candidates = [accessLog.candidate];
  if (accessLog.result) {
    return {
      status: "selected",
      candidates,
      selected: accessLog.candidate,
      result: accessLog.result,
      reason: accessLog.candidate.reason,
    };
  }

  return {
    status: "not_selected",
    candidates,
    reason: "No high-confidence built-in reducer matched the loaded source.",
  };
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
