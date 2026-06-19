import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export interface LatencySummary {
  p50: number;
  p95: number;
}

export interface BenchmarkCliDefaults {
  reportPath: string;
}

export interface ParsedBenchmarkCliArgs {
  iterations?: number;
  reportPath: string;
  jsonReportPath?: string | false;
}

export function normalizeIterations(value: unknown, defaultIterations = 3): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }

  if (Number.isFinite(defaultIterations) && defaultIterations > 0) {
    return Math.max(1, Math.floor(defaultIterations));
  }

  return 1;
}

export function approximateTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}

export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? 0;
}

export function latencySummary(values: readonly number[]): LatencySummary {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

export function averagePercent(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function medianPercent(values: readonly number[]): number {
  return roundPercent(percentile(values, 0.5));
}

export function reductionPercent(raw: number, routed: number): number {
  if (raw <= 0) {
    return 0;
  }
  return roundPercent(((raw - routed) / raw) * 100);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function defaultJsonRunReportPath(markdownReportPath: string): string {
  const markdownName = basename(markdownReportPath);
  const jsonName = markdownName.endsWith(".md") ? `${markdownName.slice(0, -".md".length)}.json` : `${markdownName}.json`;
  return resolve(process.cwd(), "plugins/freeflow/evals/runs/output-router", jsonName);
}

export function parseBenchmarkCliArgs(argv: readonly string[], defaults: BenchmarkCliDefaults): ParsedBenchmarkCliArgs {
  let iterations: number | undefined;
  let reportPath = defaults.reportPath;
  let jsonReportPath: string | false | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--iterations=")) {
      const value = Number(arg.slice("--iterations=".length));
      if (Number.isFinite(value) && value > 0) {
        iterations = value;
      }
    } else if (arg.startsWith("--report=")) {
      reportPath = resolve(process.cwd(), arg.slice("--report=".length));
    } else if (arg.startsWith("--json-report=")) {
      const value = arg.slice("--json-report=".length);
      jsonReportPath = value === "off" ? false : resolve(process.cwd(), value);
    }
  }

  const parsed = iterations === undefined ? { reportPath } : { iterations, reportPath };
  return jsonReportPath === undefined ? parsed : { ...parsed, jsonReportPath };
}

export async function writeBenchmarkReportPair<TReport>(options: {
  report: TReport;
  markdownReportPath: string;
  jsonReportPath?: string | false | undefined;
  renderMarkdown(report: TReport): string;
}): Promise<{ markdown: string; json?: string }> {
  await mkdir(dirname(options.markdownReportPath), { recursive: true });
  await writeFile(options.markdownReportPath, options.renderMarkdown(options.report), "utf8");

  if (options.jsonReportPath === false) {
    return { markdown: options.markdownReportPath };
  }

  if (options.jsonReportPath) {
    await mkdir(dirname(options.jsonReportPath), { recursive: true });
    await writeFile(options.jsonReportPath, `${JSON.stringify(options.report, null, 2)}\n`, "utf8");
    return { markdown: options.markdownReportPath, json: options.jsonReportPath };
  }

  return { markdown: options.markdownReportPath };
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}
