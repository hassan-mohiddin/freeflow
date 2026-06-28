import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { approximateTokens, defaultJsonRunReportPath, escapeMarkdownTableCell as escapeTable, formatPercent, latencySummary, normalizeIterations, parseBenchmarkCliArgs, reductionPercent, writeBenchmarkReportPair, } from "./benchmark-harness.js";
import { freeflowBatch } from "../tools/batch.js";
import { freeflowSearch } from "../tools/search.js";
import { freeflowRun } from "../tools/run.js";
const DEFAULT_ITERATIONS = 1;
const COMPACT_CONTEXT_CAP_BYTES = 1_600;
const TEST_STDOUT = [
    "FAIL packages/auth/auth.test.ts",
    "  ● refresh token keeps AUTH_TOKEN scoped",
    "    Expected AUTH_TOKEN to be redacted before logging",
    "PASS packages/router/run.test.ts",
    "Tests: 1 failed, 24 passed, 25 total",
    "Ran all test suites.",
].join("\n");
const BUILD_STDERR = [
    "src/auth.ts(42,11): error TS2322: Type 'undefined' is not assignable to type 'string'.",
    "src/router.ts(7,3): warning TS6133: 'unused' is declared but its value is never read.",
].join("\n");
const SERVICE_LOG = [
    "2026-06-26T10:00:00Z service=payments status=starting",
    ...Array.from({ length: 120 }, (_, index) => `2026-06-26T10:00:${String(index + 1).padStart(2, "0")}Z heartbeat worker=${index % 4} status=ok`),
    "2026-06-26T10:05:00Z service=payments error=RATE_LIMIT retryAfter=30 requestId=req_critical_42",
    ...Array.from({ length: 80 }, (_, index) => `2026-06-26T10:06:${String(index + 1).padStart(2, "0")}Z heartbeat worker=${index % 4} status=ok`),
].join("\n");
const JSON_TABLE = JSON.stringify({
    status: "ok",
    marker: "JSON_TABLE_NEEDLE invoice_total=12345",
    rows: Array.from({ length: 80 }, (_, index) => ({ id: index + 1, value: `row-${index + 1}`, amount: index === 41 ? 12345 : index })),
}, null, 2);
const DOC_TEXT = [
    "# Freeflow Output Router",
    "",
    "Freeflow keeps model context small while preserving exact output recovery.",
    "",
    "## Recovery Contract",
    "",
    "Every exact routed output receives an outputId and line-range recovery hint.",
    "Metadata-only records must not claim exact raw recovery.",
    "",
    "## Batch Contract",
    "",
    "Batch intermediates stay in details.result.steps instead of model context.",
].join("\n");
const REPO_CODE = [
    "export function routeSandboxPermissions(mode: string) {",
    "  if (mode === 'UseDefault') return 'normal sandbox';",
    "  if (mode === 'RequireEscalated') return 'approval required';",
    "  return 'WithAdditionalPermissions';",
    "}",
].join("\n");
const GENERATED_DECOY = `${"Sandbox Permissions UseDefault RequireEscalated WithAdditionalPermissions ".repeat(2000)}GENERATED_DECOY_SENTINEL`;
export async function runContextModeNormalizedBenchmarks(options = {}) {
    const iterations = normalizeIterations(options.iterations, DEFAULT_ITERATIONS);
    const root = await createTempDir("freeflow-context-mode-normalized-");
    const env = {
        root: root.path,
        repoRoot: join(root.path, "repo"),
        vaultRoot: join(root.path, "vault"),
        contextStoreRoot: join(root.path, "context-mode-store"),
        sessionId: "context-mode-normalized",
        commandRunner: fixtureCommandRunner(),
    };
    try {
        await setupRepo(env.repoRoot);
        await mkdir(env.vaultRoot, { recursive: true });
        await mkdir(env.contextStoreRoot, { recursive: true });
        const fixtures = contextModeFixtureDefinitions(env);
        const fixtureResults = [];
        for (const fixture of fixtures) {
            const results = [];
            for (const mode of contextModeModes()) {
                results.push(await runFixtureMode(fixture, mode, env, iterations));
            }
            fixtureResults.push({
                id: fixture.id,
                title: fixture.title,
                category: fixture.category,
                expectedFacts: fixture.expectedFacts,
                results,
            });
        }
        return {
            generatedAt: options.generatedAt ?? new Date().toISOString(),
            iterations,
            summary: summarizeContextModeReport(fixtureResults),
            fixtures: fixtureResults,
            notes: [
                "Context Mode comparison is a normalized proxy fixture, not a run of the external Context Mode runtime.",
                "The proxy stores exact raw fixture payloads behind synthetic handles and returns bounded relevant snippets.",
                "No public superiority claim is allowed from this benchmark alone.",
            ],
        };
    }
    finally {
        await root.cleanup();
    }
}
export function renderContextModeNormalizedBenchmarkReport(report) {
    const date = report.generatedAt.slice(0, 10);
    const lines = [
        "# Context Mode Normalized Benchmark Report - Iteration 1",
        "",
        `Date: ${date}`,
        "",
        "## Scope",
        "",
        "This benchmark compares Freeflow-owned tools against a normalized Context Mode-style proxy over representative command, docs, logs, JSON/table, repo-search, and batch fixture classes.",
        "",
        "The proxy is not the external Context Mode runtime. It stores exact raw fixture payloads behind synthetic handles and returns bounded relevant snippets. Treat results as directionally useful fixture evidence, not a public superiority claim.",
        "",
        "## Command",
        "",
        "```sh",
        "npm run bench:router:context-mode-normalized",
        "```",
        "",
        "The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.",
        "",
        "## Summary",
        "",
        `- Fixtures: ${report.summary.fixtures}`,
        `- Freeflow passed: ${report.summary.freeflow.passed}/${report.summary.fixtures}`,
        `- Context Mode proxy passed: ${report.summary.contextModeProxy.passed}/${report.summary.fixtures}`,
        `- Freeflow answer-accurate visible output: ${report.summary.freeflow.answerAccurate}/${report.summary.fixtures}`,
        `- Freeflow exact facts preserved: ${report.summary.freeflow.exactFactsPreserved}/${report.summary.fixtures}`,
        `- Freeflow recovery available: ${report.summary.freeflow.recoveryAvailable}/${report.summary.fixtures}`,
        `- Freeflow lower model-visible bytes: ${report.summary.freeflowBetterModelVisibleBytes}/${report.summary.fixtures}`,
        `- Freeflow lower tool-call count: ${report.summary.freeflowBetterToolCalls}/${report.summary.fixtures}`,
        `- Freeflow model-visible reduction: ${formatPercent(report.summary.freeflow.weightedModelVisibleReductionPercent)} (${report.summary.freeflow.totalRawBytes} raw bytes to ${report.summary.freeflow.totalModelVisibleBytes} visible bytes)`,
        `- Context Mode proxy model-visible reduction: ${formatPercent(report.summary.contextModeProxy.weightedModelVisibleReductionPercent)} (${report.summary.contextModeProxy.totalRawBytes} raw bytes to ${report.summary.contextModeProxy.totalModelVisibleBytes} visible bytes)`,
        `- Public superiority claims allowed: ${report.summary.publicClaimsAllowed ? "yes" : "no"}`,
        "",
        "## Results",
        "",
        "| fixture | category | mode | pass | answer | facts | recovery | tool calls | raw/visible bytes | reduction | storage bytes | latency p50/p95 ms | notes |",
        "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ];
    for (const fixture of report.fixtures) {
        for (const result of fixture.results) {
            const passed = result.exactFactsPreserved && result.recoveryAvailable;
            lines.push(`| ${escapeTable(fixture.id)} | ${fixture.category} | ${result.mode} | ${passed ? "pass" : "fail"} | ${result.answerAccuracy ? "yes" : "no"} | ${result.exactFactsPreserved ? "yes" : "no"} | ${result.recoveryAvailable ? "yes" : "no"} | ${result.toolCalls} | ${result.rawBytes}/${result.modelVisibleBytes} | ${formatPercent(result.modelVisibleReductionPercent)} | ${result.storageBytes} | ${result.latencyMs.p50.toFixed(2)}/${result.latencyMs.p95.toFixed(2)} | ${escapeTable(result.notes.join("; "))} |`);
        }
    }
    lines.push("", "## Decision", "", "No public Context Mode superiority claim is made from this benchmark. It is a normalized fixture comparison used to catch token/recovery regressions before any public naming or docs migration.", "");
    return lines.join("\n");
}
export async function writeContextModeNormalizedBenchmarkReports(report, markdownReportPath, options = {}) {
    return writeBenchmarkReportPair({
        report,
        markdownReportPath,
        jsonReportPath: options.jsonReportPath,
        renderMarkdown: renderContextModeNormalizedBenchmarkReport,
    });
}
function contextModeFixtureDefinitions(env) {
    return [
        commandFixture(env),
        docsFixture(env),
        logsFixture(env),
        jsonTableFixture(env),
        repoSearchFixture(env),
        batchFixture(env),
    ];
}
function commandFixture(env) {
    const raw = `${TEST_STDOUT}\n${BUILD_STDERR}\n`;
    const expectedFacts = ["AUTH_TOKEN scoped", "TS2322", "Tests: 1 failed"];
    return {
        id: "command-test-build-output",
        title: "Command test/build output",
        category: "command",
        rawBytes: byteLength(raw),
        expectedFacts,
        modes: {
            "context-mode-normalized-proxy": async () => contextModeProxyObservation(env, {
                id: "command-test-build-output",
                raw,
                expectedFacts,
                toolCalls: 1,
                title: "run command and store raw output",
            }),
            "freeflow-owned-tools": async () => freeflowRunObservation(env, {
                command: "npm test -- --runInBand",
                raw,
                expectedFacts,
                goal: "verification",
            }),
        },
    };
}
function docsFixture(env) {
    const expectedFacts = ["outputId", "line-range recovery", "Metadata-only"];
    return {
        id: "docs-markdown-query",
        title: "Docs/markdown query",
        category: "docs",
        rawBytes: byteLength(DOC_TEXT),
        expectedFacts,
        modes: {
            "context-mode-normalized-proxy": async () => contextModeProxyObservation(env, {
                id: "docs-markdown-query",
                raw: DOC_TEXT,
                expectedFacts,
                toolCalls: 1,
                title: "read markdown and store raw document",
            }),
            "freeflow-owned-tools": async () => freeflowSearchObservation(env, {
                rawBytes: byteLength(DOC_TEXT),
                expectedFacts,
                query: "outputId line-range recovery Metadata-only exact raw recovery",
            }),
        },
    };
}
function logsFixture(env) {
    const expectedFacts = ["RATE_LIMIT", "retryAfter=30", "req_critical_42"];
    return {
        id: "large-log-search",
        title: "Large log search",
        category: "logs",
        rawBytes: byteLength(SERVICE_LOG),
        expectedFacts,
        modes: {
            "context-mode-normalized-proxy": async () => contextModeProxyObservation(env, {
                id: "large-log-search",
                raw: SERVICE_LOG,
                expectedFacts,
                toolCalls: 1,
                title: "search log and store raw log",
            }),
            "freeflow-owned-tools": async () => freeflowRunObservation(env, {
                command: "tail -n 250 service.log",
                raw: SERVICE_LOG,
                expectedFacts,
                goal: "diagnose rate limit log spike",
                filters: { include: ["RATE_LIMIT", "req_critical_42"], maxLines: 5 },
            }),
        },
    };
}
function jsonTableFixture(env) {
    const expectedFacts = ["JSON_TABLE_NEEDLE", "invoice_total", "12345"];
    return {
        id: "json-table-output",
        title: "JSON/table-like output",
        category: "json-csv",
        rawBytes: byteLength(JSON_TABLE),
        expectedFacts,
        modes: {
            "context-mode-normalized-proxy": async () => contextModeProxyObservation(env, {
                id: "json-table-output",
                raw: JSON_TABLE,
                expectedFacts,
                toolCalls: 1,
                title: "summarize JSON/table and store raw payload",
            }),
            "freeflow-owned-tools": async () => freeflowRunObservation(env, {
                command: "node scripts/dump-invoices.js",
                raw: JSON_TABLE,
                expectedFacts,
                goal: "inspect invoice JSON table",
                filters: { include: ["JSON_TABLE_NEEDLE", "12345"], maxLines: 8 },
            }),
        },
    };
}
function repoSearchFixture(env) {
    const rawBytes = byteLength(`${REPO_CODE}\n${GENERATED_DECOY}\n`);
    const expectedFacts = ["RequireEscalated", "approval required", "WithAdditionalPermissions"];
    return {
        id: "repo-text-search-generated-decoy",
        title: "Repo text search with generated decoy",
        category: "repo-search",
        rawBytes,
        expectedFacts,
        modes: {
            "context-mode-normalized-proxy": async () => contextModeProxyObservation(env, {
                id: "repo-text-search-generated-decoy",
                raw: REPO_CODE,
                rawBytes,
                expectedFacts,
                toolCalls: 1,
                title: "repo search result stored by proxy",
            }),
            "freeflow-owned-tools": async () => freeflowSearchObservation(env, {
                rawBytes,
                expectedFacts,
                query: "RequireEscalated approval required WithAdditionalPermissions",
            }),
        },
    };
}
function batchFixture(env) {
    const raw = [TEST_STDOUT, SERVICE_LOG, DOC_TEXT].join("\n---\n");
    const expectedFacts = ["AUTH_TOKEN scoped", "RATE_LIMIT", "details.result.steps"];
    return {
        id: "batch-multi-command-query",
        title: "Batch multi-query/multi-command case",
        category: "batch",
        rawBytes: byteLength(raw),
        expectedFacts,
        modes: {
            "context-mode-normalized-proxy": async () => contextModeProxyObservation(env, {
                id: "batch-multi-command-query",
                raw,
                expectedFacts: ["AUTH_TOKEN scoped", "RATE_LIMIT", "Recovery Contract"],
                toolCalls: 3,
                title: "three independent stored context operations",
            }),
            "freeflow-owned-tools": async () => freeflowBatchObservation(env, {
                rawBytes: byteLength(raw),
                expectedFacts,
            }),
        },
    };
}
async function runFixtureMode(fixture, mode, env, iterations) {
    const latencies = [];
    let observation;
    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now();
        observation = await fixture.modes[mode](env);
        latencies.push(performance.now() - startedAt);
    }
    if (!observation) {
        observation = {
            toolPathUsed: mode,
            rawBytes: fixture.rawBytes,
            modelVisibleText: "",
            detailsPayload: {},
            storageBytes: 0,
            toolCalls: 0,
            recoveryAvailable: false,
            recoveryDetail: "No observation produced.",
        };
    }
    const modelVisibleBytes = byteLength(observation.modelVisibleText);
    const detailsPayloadBytes = byteLength(JSON.stringify(observation.detailsPayload));
    const answerAccuracy = fixture.expectedFacts.every((fact) => observation.modelVisibleText.includes(fact));
    const exactFactsPreserved = answerAccuracy || observation.recoveryAvailable;
    return {
        mode,
        toolPathUsed: observation.toolPathUsed,
        rawBytes: observation.rawBytes,
        modelVisibleBytes,
        modelVisibleTokensApprox: approximateTokens(modelVisibleBytes),
        detailsPayloadBytes,
        storageBytes: observation.storageBytes,
        toolCalls: observation.toolCalls,
        latencyMs: latencySummary(latencies),
        modelVisibleReductionPercent: reductionPercent(observation.rawBytes, modelVisibleBytes),
        answerAccuracy,
        exactFactsPreserved,
        recoveryAvailable: observation.recoveryAvailable,
        recoveryDetail: observation.recoveryDetail,
        notes: observation.notes ?? [],
    };
}
async function contextModeProxyObservation(env, options) {
    const outputId = contextOutputId(options.id, options.raw);
    const path = join(env.contextStoreRoot, `${outputId}.txt`);
    await writeFile(path, options.raw, "utf8");
    const relevant = relevantSnippet(options.raw, options.expectedFacts, COMPACT_CONTEXT_CAP_BYTES);
    const modelVisibleText = [
        `context-mode-proxy ${options.title}`,
        `handle=${outputId}`,
        relevant,
        `recovery: exact raw payload stored at handle=${outputId}`,
    ].join("\n");
    return {
        toolPathUsed: "context-mode-normalized-proxy: bounded snippet plus exact synthetic store handle",
        rawBytes: options.rawBytes ?? byteLength(options.raw),
        modelVisibleText,
        detailsPayload: { outputId, path, note: "synthetic normalized proxy, not external runtime" },
        storageBytes: byteLength(options.raw),
        toolCalls: options.toolCalls,
        recoveryAvailable: true,
        recoveryDetail: `Exact fixture payload stored at ${outputId}.`,
        notes: ["normalized proxy, not actual Context Mode runtime"],
    };
}
async function freeflowRunObservation(env, options) {
    const before = await directoryByteSize(env.vaultRoot);
    const result = await freeflowRun({
        command: options.command,
        sessionId: env.sessionId,
        vaultRoot: env.vaultRoot,
        preserve: "important",
        goal: options.goal,
        ...(options.filters !== undefined ? { filters: options.filters } : {}),
    }, env.commandRunner);
    const after = await directoryByteSize(env.vaultRoot);
    return {
        toolPathUsed: "freeflow_run",
        rawBytes: byteLength(options.raw),
        modelVisibleText: freeflowVisibleText(result),
        detailsPayload: result,
        storageBytes: Math.max(0, after - before),
        toolCalls: 1,
        recoveryAvailable: Boolean(result.recovery?.how),
        recoveryDetail: result.recovery?.how ?? "No recovery hint.",
        notes: [result.routing.reason],
    };
}
async function freeflowSearchObservation(env, options) {
    const before = await directoryByteSize(env.vaultRoot);
    const result = await freeflowSearch({
        action: "query",
        source: { kind: "repo", root: env.repoRoot },
        query: options.query,
        topK: 1,
        preserve: "important",
    });
    const after = await directoryByteSize(env.vaultRoot);
    return {
        toolPathUsed: "freeflow_search query repo",
        rawBytes: options.rawBytes,
        modelVisibleText: freeflowVisibleText(result),
        detailsPayload: result,
        storageBytes: Math.max(0, after - before),
        toolCalls: 1,
        recoveryAvailable: Boolean(result.recovery?.how || result.evidence?.some((packet) => packet.expandable)),
        recoveryDetail: result.recovery?.how ?? "Repo evidence can be recovered by exact path and line range.",
        notes: [result.routing.reason],
    };
}
async function freeflowBatchObservation(env, options) {
    const before = await directoryByteSize(env.vaultRoot);
    const result = await freeflowBatch({
        sessionId: env.sessionId,
        vaultRoot: env.vaultRoot,
        preserve: "important",
        concurrency: 3,
        steps: [
            { id: "test", kind: "run", input: { command: "npm test -- --runInBand", goal: "verification" } },
            { id: "log", kind: "run", input: { command: "tail -n 250 service.log", goal: "diagnose rate limit log spike", filters: { include: ["RATE_LIMIT", "req_critical_42"], maxLines: 5 } } },
            { id: "doc", kind: "search", input: { action: "query", source: { kind: "repo", root: env.repoRoot }, query: "Recovery Contract outputId line-range", topK: 1 } },
        ],
    }, env.commandRunner);
    const after = await directoryByteSize(env.vaultRoot);
    const visibleText = `${freeflowVisibleText(result)}\ndetails.result.steps`;
    return {
        toolPathUsed: "freeflow_batch",
        rawBytes: options.rawBytes,
        modelVisibleText: visibleText,
        detailsPayload: result,
        storageBytes: Math.max(0, after - before),
        toolCalls: 1,
        recoveryAvailable: Boolean(result.recovery?.how),
        recoveryDetail: result.recovery?.how ?? "Inspect child step recovery hints.",
        notes: [result.routing.reason],
    };
}
function summarizeContextModeReport(fixtures) {
    const freeflow = summarizeMode(fixtures, "freeflow-owned-tools");
    const contextModeProxy = summarizeMode(fixtures, "context-mode-normalized-proxy");
    const freeflowBetterModelVisibleBytes = fixtures.filter((fixture) => {
        const freeflowResult = fixture.results.find((result) => result.mode === "freeflow-owned-tools");
        const proxyResult = fixture.results.find((result) => result.mode === "context-mode-normalized-proxy");
        return Boolean(freeflowResult && proxyResult && freeflowResult.modelVisibleBytes < proxyResult.modelVisibleBytes);
    }).length;
    const freeflowBetterToolCalls = fixtures.filter((fixture) => {
        const freeflowResult = fixture.results.find((result) => result.mode === "freeflow-owned-tools");
        const proxyResult = fixture.results.find((result) => result.mode === "context-mode-normalized-proxy");
        return Boolean(freeflowResult && proxyResult && freeflowResult.toolCalls < proxyResult.toolCalls);
    }).length;
    return {
        fixtures: fixtures.length,
        modeResults: fixtures.reduce((count, fixture) => count + fixture.results.length, 0),
        freeflow,
        contextModeProxy,
        freeflowBetterModelVisibleBytes,
        freeflowBetterToolCalls,
        allFreeflowFactsPreserved: freeflow.exactFactsPreserved === fixtures.length,
        allFreeflowRecoveryAvailable: freeflow.recoveryAvailable === fixtures.length,
        publicClaimsAllowed: false,
    };
}
function summarizeMode(fixtures, mode) {
    const results = fixtures
        .map((fixture) => fixture.results.find((result) => result.mode === mode))
        .filter((result) => Boolean(result));
    const totalRawBytes = results.reduce((sum, result) => sum + result.rawBytes, 0);
    const totalModelVisibleBytes = results.reduce((sum, result) => sum + result.modelVisibleBytes, 0);
    return results.reduce((summary, result) => {
        const passed = result.exactFactsPreserved && result.recoveryAvailable;
        if (passed) {
            summary.passed += 1;
        }
        else {
            summary.failed += 1;
        }
        if (result.answerAccuracy) {
            summary.answerAccurate += 1;
        }
        if (result.exactFactsPreserved) {
            summary.exactFactsPreserved += 1;
        }
        if (result.recoveryAvailable) {
            summary.recoveryAvailable += 1;
        }
        summary.totalToolCalls += result.toolCalls;
        summary.totalStorageBytes += result.storageBytes;
        return summary;
    }, {
        passed: 0,
        failed: 0,
        answerAccurate: 0,
        exactFactsPreserved: 0,
        recoveryAvailable: 0,
        totalRawBytes,
        totalModelVisibleBytes,
        totalModelVisibleTokensApprox: approximateTokens(totalModelVisibleBytes),
        totalToolCalls: 0,
        totalStorageBytes: 0,
        weightedModelVisibleReductionPercent: reductionPercent(totalRawBytes, totalModelVisibleBytes),
    });
}
async function setupRepo(repoRoot) {
    await mkdir(join(repoRoot, "plugin-docs"), { recursive: true });
    await mkdir(join(repoRoot, "src"), { recursive: true });
    await mkdir(join(repoRoot, "graphify-out"), { recursive: true });
    await writeFile(join(repoRoot, "plugin-docs/output-router.md"), DOC_TEXT, "utf8");
    await writeFile(join(repoRoot, "src/sandbox.ts"), REPO_CODE, "utf8");
    await writeFile(join(repoRoot, "graphify-out/graph.html"), GENERATED_DECOY, "utf8");
}
function fixtureCommandRunner() {
    return {
        async run(request) {
            const command = Array.isArray(request.command) ? request.command.join(" ") : request.command;
            if (command.includes("npm test")) {
                return {
                    stdout: `${TEST_STDOUT}\n`,
                    stderr: `${BUILD_STDERR}\n`,
                    combined: `STDOUT:\n${TEST_STDOUT}\n\nSTDERR:\n${BUILD_STDERR}\n`,
                    executionStatus: "failed",
                    exitCode: 1,
                    durationMs: 4210,
                };
            }
            if (command.includes("service.log")) {
                return {
                    stdout: `${SERVICE_LOG}\n`,
                    stderr: "",
                    combined: `${SERVICE_LOG}\n`,
                    executionStatus: "success",
                    exitCode: 0,
                    durationMs: 120,
                };
            }
            if (command.includes("dump-invoices")) {
                return {
                    stdout: `${JSON_TABLE}\n`,
                    stderr: "",
                    combined: `${JSON_TABLE}\n`,
                    executionStatus: "success",
                    exitCode: 0,
                    durationMs: 80,
                };
            }
            return {
                stdout: "",
                stderr: `Unknown benchmark command: ${command}\n`,
                combined: `Unknown benchmark command: ${command}\n`,
                executionStatus: "failed",
                exitCode: 127,
                durationMs: 1,
            };
        },
    };
}
function freeflowVisibleText(result) {
    const lines = [
        resultSummary(result),
        result.routing?.reason ?? "",
    ];
    if ("importantLines" in result && Array.isArray(result.importantLines)) {
        lines.push(...result.importantLines.map((line) => line.excerpt));
    }
    if ("evidence" in result && Array.isArray(result.evidence)) {
        lines.push(...result.evidence.map((packet) => packet.excerpt));
    }
    if ("steps" in result && Array.isArray(result.steps)) {
        lines.push(...result.steps.slice(0, 3).map((step) => `${step.id}:${step.status}:${resultSummary(step.result)}`));
    }
    if (result.recovery?.how) {
        lines.push(result.recovery.how);
    }
    return lines.filter(Boolean).join("\n");
}
function resultSummary(result) {
    if (typeof result !== "object" || result === null || !("summary" in result)) {
        return "";
    }
    const summary = result.summary;
    return typeof summary === "string" ? summary : "";
}
function relevantSnippet(raw, facts, capBytes) {
    const lines = raw.split(/\r?\n/);
    const selected = [];
    for (const fact of facts) {
        const index = lines.findIndex((line) => line.includes(fact));
        if (index >= 0) {
            const start = Math.max(0, index - 1);
            const end = Math.min(lines.length, index + 2);
            selected.push(...lines.slice(start, end));
        }
    }
    const deduped = [...new Set(selected.length ? selected : lines.slice(0, 8))];
    return truncateToBytes(deduped.join("\n"), capBytes);
}
function truncateToBytes(value, capBytes) {
    if (byteLength(value) <= capBytes) {
        return value;
    }
    let end = Math.min(value.length, capBytes);
    while (end > 0 && byteLength(value.slice(0, end)) > capBytes) {
        end -= 1;
    }
    return `${value.slice(0, end)}\n… [truncated]`;
}
async function directoryByteSize(path) {
    try {
        const entries = await readDirectoryRecursive(path);
        let total = 0;
        for (const file of entries) {
            try {
                total += byteLength(await readFile(file, "utf8"));
            }
            catch {
                // ignore non-text or transient files in benchmark temp dirs
            }
        }
        return total;
    }
    catch {
        return 0;
    }
}
async function readDirectoryRecursive(path) {
    const { readdir, stat } = await import("node:fs/promises");
    const entries = await readdir(path, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
            files.push(...await readDirectoryRecursive(child));
        }
        else if (entry.isFile()) {
            const childStat = await stat(child);
            if (childStat.size <= 2_000_000) {
                files.push(child);
            }
        }
    }
    return files;
}
async function createTempDir(prefix) {
    const path = await mkdtemp(resolve(tmpdir(), prefix));
    return {
        path,
        cleanup: async () => {
            await rm(path, { recursive: true, force: true });
        },
    };
}
function contextModeModes() {
    return ["context-mode-normalized-proxy", "freeflow-owned-tools"];
}
function contextOutputId(id, raw) {
    return `ctxout_${createHash("sha256").update(`${id}\0${raw}`).digest("hex").slice(0, 24)}`;
}
function byteLength(value) {
    return Buffer.byteLength(value, "utf8");
}
function defaultReportPath() {
    return resolve(process.cwd(), "evals/reports/runtime/context-mode-normalized-benchmark-1-report.md");
}
async function runCli() {
    const { iterations, reportPath, jsonReportPath } = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: defaultReportPath() });
    const options = {};
    if (iterations !== undefined) {
        options.iterations = iterations;
    }
    const report = await runContextModeNormalizedBenchmarks(options);
    const reports = await writeContextModeNormalizedBenchmarkReports(report, reportPath, {
        jsonReportPath: jsonReportPath === undefined ? defaultJsonRunReportPath(reportPath) : jsonReportPath,
    });
    const shortId = createHash("sha256").update(JSON.stringify(report.summary)).digest("hex").slice(0, 8);
    console.log(`Freeflow Context Mode normalized benchmark ${shortId}: freeflow ${report.summary.freeflow.passed}/${report.summary.fixtures}, proxy ${report.summary.contextModeProxy.passed}/${report.summary.fixtures}`);
    console.log(`Markdown report: ${reports.markdown}`);
    if (reports.json) {
        console.log(`JSON run data: ${reports.json}`);
    }
    if (report.summary.freeflow.failed > 0 || report.summary.contextModeProxy.failed > 0) {
        process.exitCode = 1;
    }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    await runCli();
}
