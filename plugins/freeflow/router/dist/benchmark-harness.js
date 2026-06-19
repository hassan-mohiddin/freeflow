import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
export function normalizeIterations(value, defaultIterations = 3) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.max(1, Math.floor(value));
    }
    if (Number.isFinite(defaultIterations) && defaultIterations > 0) {
        return Math.max(1, Math.floor(defaultIterations));
    }
    return 1;
}
export function approximateTokens(bytes) {
    return Math.ceil(bytes / 4);
}
export function percentile(values, quantile) {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
    return sorted[index] ?? 0;
}
export function latencySummary(values) {
    return {
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
    };
}
export function averagePercent(values) {
    if (values.length === 0) {
        return 0;
    }
    return roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
}
export function medianPercent(values) {
    return roundPercent(percentile(values, 0.5));
}
export function reductionPercent(raw, routed) {
    if (raw <= 0) {
        return 0;
    }
    return roundPercent(((raw - routed) / raw) * 100);
}
export function formatPercent(value) {
    return `${value.toFixed(2)}%`;
}
export function escapeMarkdownTableCell(value) {
    return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
export function defaultJsonRunReportPath(markdownReportPath) {
    const markdownName = basename(markdownReportPath);
    const jsonName = markdownName.endsWith(".md") ? `${markdownName.slice(0, -".md".length)}.json` : `${markdownName}.json`;
    return resolve(process.cwd(), "plugins/freeflow/evals/runs/output-router", jsonName);
}
export function parseBenchmarkCliArgs(argv, defaults) {
    let iterations;
    let reportPath = defaults.reportPath;
    let jsonReportPath;
    for (const arg of argv) {
        if (arg.startsWith("--iterations=")) {
            const value = Number(arg.slice("--iterations=".length));
            if (Number.isFinite(value) && value > 0) {
                iterations = value;
            }
        }
        else if (arg.startsWith("--report=")) {
            reportPath = resolve(process.cwd(), arg.slice("--report=".length));
        }
        else if (arg.startsWith("--json-report=")) {
            const value = arg.slice("--json-report=".length);
            jsonReportPath = value === "off" ? false : resolve(process.cwd(), value);
        }
    }
    const parsed = iterations === undefined ? { reportPath } : { iterations, reportPath };
    return jsonReportPath === undefined ? parsed : { ...parsed, jsonReportPath };
}
export async function writeBenchmarkReportPair(options) {
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
function roundPercent(value) {
    return Math.round(value * 100) / 100;
}
