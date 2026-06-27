import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { defaultJsonRunReportPath, escapeMarkdownTableCell as escapeMarkdown, parseBenchmarkCliArgs, writeBenchmarkReportPair, } from "./benchmark-harness.js";
import { freeflowBatch } from "../tools/batch.js";
import { freeflowRetrieve } from "../tools/retrieve.js";
import { processSource } from "../processing/engine.js";
import { freeflowRun } from "../tools/run.js";
import { freeflowTransform } from "../transform/engine.js";
const DEFAULT_CONTEXT_MODE_REPO = "/tmp/pi-github-repos/mksglu/context-mode";
const DEFAULT_CONTEXT_MODE_VERSION = "unknown";
const DEFAULT_ITERATION_LABEL = "Iteration 1";
export const CONTEXT_MODE_REAL_DEEP_IMPLEMENTATION = "context-mode-real-deep-benchmark-v1";
export const EXPECTED_BASELINE_FAILURE_KEYS = [
    "tsc-summary/freeflow:run-cat-default",
    "access-summary/freeflow:run-cat-default",
    "analytics-summary/freeflow:run-cat-default",
    "mcp-tools-summary/freeflow:run-cat-default",
    "playwright-summary/freeflow:run-cat-default",
    "git-log-summary/freeflow:run-cat-default",
    "react-code-search/freeflow:repo-query",
    "next-cache-search/freeflow:repo-query",
    "tailwind-responsive-search/freeflow:repo-query",
    "batch-multi-source-query/freeflow:batch",
    "outside-file-boundary/freeflow:run-cat-host-shell",
];
export async function runContextModeRealDeepBenchmark(options = {}) {
    const availability = resolveContextModeAvailability(options);
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const freeflowRepo = path.resolve(options.freeflowRepo ?? process.cwd());
    if (availability.status === "unavailable") {
        return unavailableReport({ availability, generatedAt, freeflowRepo });
    }
    const runtime = await loadContextModeRuntime(availability);
    const root = await createTempDir("freeflow-context-mode-deep-");
    const projectRoot = path.join(root.path, "project");
    const storeRoot = path.join(root.path, "context-mode-store");
    const freeflowVaultRoot = path.join(root.path, "freeflow-vault");
    const sessionId = `deep-context-mode-${createHash("sha1").update(root.path).digest("hex").slice(0, 10)}`;
    const rows = [];
    let cm;
    try {
        await setupProject({ projectRoot, fixtureSource: availability.fixtureSource, outsideRoot: root.path });
        await mkdir(storeRoot, { recursive: true });
        await mkdir(freeflowVaultRoot, { recursive: true });
        const runner = {
            async run(request) {
                const shellOptions = {};
                if (request.cwd !== undefined) {
                    shellOptions.cwd = request.cwd;
                }
                if (request.timeoutMs !== undefined) {
                    shellOptions.timeoutMs = request.timeoutMs;
                }
                return runShell(request.command, shellOptions);
            },
        };
        const transport = new runtime.StdioClientTransport({
            command: "bash",
            args: [
                "-lc",
                `cd ${shellQuote(projectRoot)} && CONTEXT_MODE_DIR=${shellQuote(storeRoot)} node ${shellQuote(availability.server)}`,
            ],
            env: process.env,
        });
        cm = new runtime.Client({ name: "freeflow-deep-context-mode-benchmark", version: "0.0.1" });
        await cm.connect(transport);
        async function callCM(name, args) {
            if (!cm) {
                throw new Error("Context Mode client is not connected.");
            }
            const start = performance.now();
            const result = await cm.callTool({ name, arguments: args });
            return { result, text: contentText(result), latencyMs: Math.round(performance.now() - start) };
        }
        async function ffRun(command, goal, extra = {}) {
            const start = performance.now();
            const runOptions = {
                command,
                cwd: projectRoot,
                timeoutMs: 30_000,
                sessionId,
                vaultRoot: freeflowVaultRoot,
                preserve: "important",
                goal,
                ...extra,
            };
            const result = await freeflowRun(runOptions, runner);
            return { result, text: freeflowText(result), latencyMs: Math.round(performance.now() - start) };
        }
        async function ffRetrieve(query, sourceRoot = projectRoot, extra = {}) {
            const start = performance.now();
            const retrieveOptions = {
                action: "query",
                source: { kind: "repo", root: sourceRoot },
                query,
                topK: 3,
                preserve: "important",
                generatedPathGlobs: ["graphify-out/**"],
                ...extra,
            };
            const result = await freeflowRetrieve(retrieveOptions);
            return { result, text: freeflowText(result), latencyMs: Math.round(performance.now() - start) };
        }
        async function ffDerive(sourceOutputId, stream, operation) {
            const start = performance.now();
            const result = await freeflowTransform({
                source: { kind: "vault", outputId: sourceOutputId, stream },
                operation,
                preserve: "important",
                sessionId,
                vaultRoot: freeflowVaultRoot,
            });
            return { result, text: freeflowText(result), latencyMs: Math.round(performance.now() - start) };
        }
        async function ffProcessRepoFile(relativePath) {
            const start = performance.now();
            const result = await processSource({ kind: "repo-file", root: projectRoot, path: relativePath }, { sessionId, vaultRoot: freeflowVaultRoot });
            return { result, text: processingText(result), latencyMs: Math.round(performance.now() - start) };
        }
        function record(input) {
            const text = input.obs.text;
            const factsFound = factCount(text, input.facts);
            const correct = input.expectedCorrect ?? factsFound === input.facts.length;
            rows.push({
                fixture: input.fixture,
                category: input.category,
                mode: input.mode,
                capability: input.capability ?? "",
                correct,
                factsFound,
                factsTotal: input.facts.length,
                rawBytes: input.rawBytes,
                visibleBytes: bytes(text),
                reductionPct: input.rawBytes ? Number(((1 - bytes(text) / input.rawBytes) * 100).toFixed(2)) : 0,
                latencyMs: input.obs.latencyMs ?? 0,
                recovery: recoveryScore(input.obs.result, input.mode),
                notes: input.notes ?? "",
                preview: text.split("\n").slice(0, 18).join("\n"),
            });
        }
        function fileSize(rel) {
            return statSync(path.join(projectRoot, rel)).size;
        }
        function scriptCode(rel, code) {
            return `import { readFileSync } from 'node:fs';\nconst FILE_CONTENT = readFileSync(${JSON.stringify(rel)}, 'utf8');\n${code}\n`;
        }
        async function writeScenarioScript(id, rel, code) {
            const scriptPath = path.join(projectRoot, "scripts", `${id}.mjs`);
            await writeFile(scriptPath, scriptCode(rel, code), "utf8");
            return `node scripts/${id}.mjs`;
        }
        const executeScenarios = createExecuteScenarios();
        for (const scenario of executeScenarios) {
            const rawBytes = fileSize(scenario.file);
            const cmObs = await callCM("ctx_execute_file", {
                path: scenario.file,
                language: "javascript",
                code: scenario.code,
                intent: scenario.goal,
            });
            record({
                fixture: scenario.id,
                category: scenario.category,
                rawBytes,
                facts: scenario.facts,
                mode: "context-mode:ctx_execute_file",
                capability: "sandboxed file transform",
                obs: cmObs,
            });
            const ffDefault = await ffRun(`cat ${shellQuote(scenario.file)}`, scenario.goal);
            record({
                fixture: scenario.id,
                category: scenario.category,
                rawBytes,
                facts: scenario.facts,
                mode: "freeflow:run-cat-default",
                capability: "command capture/routing",
                obs: ffDefault,
            });
            if (scenario.id === "access-summary") {
                const ffProcessed = await ffProcessRepoFile(scenario.file);
                record({
                    fixture: scenario.id,
                    category: scenario.category,
                    rawBytes,
                    facts: scenario.facts,
                    mode: "freeflow:process-access-log-reducer",
                    capability: "processing engine built-in reducer",
                    obs: ffProcessed,
                    notes: "Uses the internal processing engine access-log reducer; no public Pi surface is selected.",
                });
            }
            const command = await writeScenarioScript(scenario.id, scenario.file, scenario.code);
            const ffComputed = await ffRun(command, scenario.goal);
            record({
                fixture: scenario.id,
                category: scenario.category,
                rawBytes,
                facts: scenario.facts,
                mode: "freeflow:run-computed-script",
                capability: "host-shell transform via freeflow_run",
                obs: ffComputed,
                notes: "Compact because an external Node script computed facts; not Freeflow sandboxed script derive.",
            });
            if (scenario.upstreamCode !== undefined) {
                const upstream = await callCM("ctx_execute_file", {
                    path: scenario.file,
                    language: "javascript",
                    code: scenario.upstreamCode,
                    intent: "upstream benchmark script",
                });
                record({
                    fixture: `${scenario.id}-upstream-script`,
                    category: scenario.category,
                    rawBytes,
                    facts: scenario.facts,
                    mode: "context-mode:upstream-benchmark-script",
                    capability: "benchmark script correctness",
                    obs: upstream,
                    expectedCorrect: hasFacts(upstream.text, scenario.facts),
                    notes: "Runs Context Mode upstream benchmark summarizer; checks against fixture ground truth.",
                });
            }
        }
        const accessRaw = await ffRun("cat fixtures/access.log", "diagnosis");
        const accessOutputId = recoveryOutputId(accessRaw.result);
        if (accessOutputId) {
            const statusGroups = await ffDerive(accessOutputId, "stdout", {
                kind: "groupByRegex",
                pattern: '" (\\d{3}) \\d+ (\\d+)ms$',
                group: "1",
                maxGroups: 10,
                maxLinesPerGroup: 1,
            });
            record({
                fixture: "access-log-derive-status",
                category: "derive",
                rawBytes: fileSize("fixtures/access.log"),
                facts: ["200", "500", "401", "404"],
                mode: "freeflow:derive-groupByRegex",
                capability: "deterministic derive over vault",
                obs: statusGroups,
                notes: "Groups statuses but does not compute all aggregate counts/error rate/avg latency.",
            });
        }
        const analyticsRaw = await ffRun("cat fixtures/analytics.csv", "inspect CSV");
        const analyticsOutputId = recoveryOutputId(analyticsRaw.result);
        if (analyticsOutputId) {
            const timeouts = await ffDerive(analyticsOutputId, "stdout", { kind: "countMatches", pattern: ",timeout," });
            record({
                fixture: "analytics-count-timeouts",
                category: "derive",
                rawBytes: fileSize("fixtures/analytics.csv"),
                facts: ["matches: 50"],
                mode: "freeflow:derive-countMatches",
                capability: "deterministic derive over vault",
                obs: timeouts,
                notes: "Can count one selected fact but not summarize CSV distribution without a script transform.",
            });
        }
        const searchScenarios = createSearchScenarios();
        for (const scenario of searchScenarios) {
            const rawBytes = fileSize(scenario.file);
            await callCM("ctx_index", { path: scenario.file, source: scenario.source });
            const cmSearch = await callCM("ctx_search", { queries: [scenario.query], source: scenario.source, limit: 3 });
            record({
                fixture: scenario.id,
                category: "docs-search",
                rawBytes,
                facts: scenario.facts,
                mode: "context-mode:ctx_index+ctx_search",
                capability: "FTS index/search",
                obs: cmSearch,
            });
            const ffSearch = await ffRetrieve(scenario.query, projectRoot);
            record({
                fixture: scenario.id,
                category: "docs-search",
                rawBytes,
                facts: scenario.facts,
                mode: "freeflow:repo-query",
                capability: "live repo text query",
                obs: ffSearch,
            });
        }
        await callCM("ctx_index", {
            path: "repo-fixture",
            source: "repo-fixture",
            maxFiles: 20,
            extensions: [".ts", ".html"],
            respectGitignore: false,
        });
        const repoRawBytes = fileSize("repo-fixture/src/sandbox.ts") + fileSize("repo-fixture/graphify-out/graph.html");
        const repoFacts = ["src/sandbox.ts", "SAFE_CONTEXT_BOUNDARY", "validateBoundary"];
        const cmRepo = await callCM("ctx_search", {
            queries: ["SAFE_CONTEXT_BOUNDARY validateBoundary implementation"],
            source: "repo-fixture",
            limit: 5,
        });
        record({
            fixture: "repo-generated-decoy",
            category: "repo-search",
            rawBytes: repoRawBytes,
            facts: repoFacts,
            mode: "context-mode:ctx_index+ctx_search",
            capability: "FTS index/search",
            obs: cmRepo,
            expectedCorrect: hasFacts(cmRepo.text, repoFacts) && !cmRepo.text.includes("graph.html"),
            notes: cmRepo.text.includes("graph.html") ? "Generated graph.html decoy appears in results." : "Top/live result did not include generated decoy.",
        });
        const ffRepo = await ffRetrieve("SAFE_CONTEXT_BOUNDARY validateBoundary implementation", path.join(projectRoot, "repo-fixture"));
        record({
            fixture: "repo-generated-decoy",
            category: "repo-search",
            rawBytes: repoRawBytes,
            facts: repoFacts,
            mode: "freeflow:repo-query",
            capability: "generated-path-aware live repo query",
            obs: ffRepo,
            expectedCorrect: hasFacts(ffRepo.text, repoFacts) && !ffRepo.text.includes("graph.html"),
            notes: "Configured generatedPathGlobs=graphify-out/**.",
        });
        await callCM("ctx_index", { path: "docs/stale.md", source: "stale-doc" });
        await writeFile(path.join(projectRoot, "docs/stale.md"), "# Cache Policy\n\nNEW_CACHE_POLICY_TOKEN says cache for 30 seconds.\n", "utf8");
        const cmStale = await callCM("ctx_search", { queries: ["cache policy token seconds"], source: "stale-doc", limit: 3 });
        record({
            fixture: "stale-index-after-file-change",
            category: "freshness",
            rawBytes: fileSize("docs/stale.md"),
            facts: ["NEW_CACHE_POLICY_TOKEN"],
            mode: "context-mode:ctx_search-after-mutation",
            capability: "persistent index freshness",
            obs: cmStale,
            expectedCorrect: cmStale.text.includes("NEW_CACHE_POLICY_TOKEN"),
            notes: cmStale.text.includes("OLD_CACHE_POLICY_TOKEN") ? "Returned stale indexed content after file mutation." : "",
        });
        const ffFresh = await ffRetrieve("cache policy token seconds NEW_CACHE_POLICY_TOKEN", projectRoot);
        record({
            fixture: "stale-index-after-file-change",
            category: "freshness",
            rawBytes: fileSize("docs/stale.md"),
            facts: ["NEW_CACHE_POLICY_TOKEN"],
            mode: "freeflow:repo-query-live-file",
            capability: "live repo scanner",
            obs: ffFresh,
        });
        const batchRawBytes = fileSize("fixtures/test-output.txt") + fileSize("fixtures/access.log") + fileSize("fixtures/context7-react-docs.md");
        const batchFacts = ["4 failed", "88", "ignore = true"];
        const vitestScenario = requiredScenario(executeScenarios, "vitest-summary");
        const accessScenario = requiredScenario(executeScenarios, "access-summary");
        const cmBatch = await callCM("ctx_batch_execute", {
            commands: [
                { label: "tests", command: "cat fixtures/test-output.txt" },
                { label: "access-log", command: "cat fixtures/access.log" },
                { label: "react-docs", command: "cat fixtures/context7-react-docs.md" },
            ],
            queries: [
                "failed test files and counts",
                "HTTP error count status distribution slow requests",
                "useEffect cleanup ignore stale responses",
            ],
            concurrency: 3,
            cwd: projectRoot,
            query_scope: "batch",
        });
        record({
            fixture: "batch-multi-source-query",
            category: "batch",
            rawBytes: batchRawBytes,
            facts: batchFacts,
            mode: "context-mode:ctx_batch_execute",
            capability: "batch run + index + query",
            obs: cmBatch,
        });
        const ffBatchStart = performance.now();
        const ffBatchResult = await freeflowBatch({
            sessionId,
            vaultRoot: freeflowVaultRoot,
            preserve: "important",
            concurrency: 3,
            steps: [
                {
                    id: "test-summary",
                    kind: "run",
                    input: {
                        command: await writeScenarioScript("batch-test-summary", "fixtures/test-output.txt", vitestScenario.code),
                        cwd: projectRoot,
                        goal: "test summary",
                    },
                },
                {
                    id: "access-summary",
                    kind: "run",
                    input: {
                        command: await writeScenarioScript("batch-access-summary", "fixtures/access.log", accessScenario.code),
                        cwd: projectRoot,
                        goal: "log summary",
                    },
                },
                {
                    id: "react-query",
                    kind: "retrieve",
                    input: {
                        action: "query",
                        source: { kind: "repo", root: projectRoot },
                        query: "useEffect cleanup ignore stale responses",
                        topK: 1,
                        generatedPathGlobs: ["graphify-out/**"],
                    },
                },
            ],
        }, runner);
        record({
            fixture: "batch-multi-source-query",
            category: "batch",
            rawBytes: batchRawBytes,
            facts: batchFacts,
            mode: "freeflow:batch",
            capability: "parallel steps; no query aggregation",
            obs: { result: ffBatchResult, text: freeflowText(ffBatchResult), latencyMs: Math.round(performance.now() - ffBatchStart) },
            notes: "Child details exist, but visible batch summary does not aggregate query answers reliably.",
        });
        const outsidePath = path.join(root.path, "outside-secret.txt");
        const cmSafety = await callCM("ctx_execute_file", {
            path: outsidePath,
            language: "javascript",
            code: "console.log(FILE_CONTENT)",
            intent: "path escape safety",
        });
        record({
            fixture: "outside-file-boundary",
            category: "safety",
            rawBytes: fileSize("../outside-secret.txt"),
            facts: ["File access blocked"],
            mode: "context-mode:ctx_execute_file",
            capability: "project-boundary file sandbox",
            obs: cmSafety,
            expectedCorrect: cmSafety.text.includes("File access blocked") && !cmSafety.text.includes("OUTSIDE_SECRET_TOKEN"),
            notes: "Expected to block project escape.",
        });
        const ffSafety = await ffRun(`cat ${shellQuote(outsidePath)}`, "path escape safety");
        record({
            fixture: "outside-file-boundary",
            category: "safety",
            rawBytes: fileSize("../outside-secret.txt"),
            facts: ["OUTSIDE_SECRET_TOKEN"],
            mode: "freeflow:run-cat-host-shell",
            capability: "host shell command capture, not sandbox",
            obs: ffSafety,
            expectedCorrect: !ffSafety.text.includes("OUTSIDE_SECRET_TOKEN"),
            notes: "Freeflow_run is a host command runner/capture layer, not a sandbox; it captured outside file content.",
        });
        const ffSmall = await ffRun("printf 'SMALL_SUCCESS_TOKEN\\n'", "small command");
        record({
            fixture: "small-success-recovery",
            category: "recovery",
            rawBytes: 20,
            facts: ["SMALL_SUCCESS_TOKEN"],
            mode: "freeflow:small-success-default-storage",
            capability: "hybrid-dedupe storage semantics",
            obs: ffSmall,
            expectedCorrect: ffSmall.text.includes("SMALL_SUCCESS_TOKEN"),
            notes: recoveryScore(ffSmall.result, "freeflow"),
        });
        const ffFull = await ffRun("printf 'SMALL_SUCCESS_TOKEN\\n'", "verification", { preserve: "full" });
        record({
            fixture: "small-success-recovery",
            category: "recovery",
            rawBytes: 20,
            facts: ["SMALL_SUCCESS_TOKEN"],
            mode: "freeflow:small-success-preserve-full",
            capability: "exact recovery override",
            obs: ffFull,
            expectedCorrect: ffFull.text.includes("SMALL_SUCCESS_TOKEN"),
            notes: recoveryScore(ffFull.result, "freeflow"),
        });
        const stats = await callCM("ctx_stats", {});
        await cm.close();
        cm = undefined;
        const report = buildReport({
            generatedAt,
            availability,
            freeflowRepo,
            benchmarkRoot: root.path,
            storeRoot,
            freeflowVaultRoot,
            sessionId,
            rows,
            contextModeStatsPreview: stats.text.split("\n").slice(0, 22).join("\n"),
        });
        if (options.keepArtifacts === false) {
            await root.cleanup();
        }
        return report;
    }
    catch (error) {
        if (cm) {
            await cm.close().catch(() => undefined);
        }
        if (options.keepArtifacts === false) {
            await root.cleanup();
        }
        throw error;
    }
}
export function renderContextModeRealDeepBenchmarkReport(report) {
    const lines = [];
    lines.push("# Deep Freeflow vs real Context Mode benchmark");
    lines.push("");
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Implementation: ${report.implementation}`);
    lines.push(`Context Mode status: ${report.contextMode.status}`);
    lines.push(`Context Mode: v${report.contextMode.version} ${report.contextMode.commit}`);
    lines.push(`Freeflow: ${report.freeflow.commit}`);
    lines.push(`Artifacts root: ${report.benchmarkRoot}`);
    lines.push(`Public superiority claims allowed: ${report.publicClaimsAllowed ? "yes" : "no"}`);
    if (report.contextMode.status === "unavailable") {
        lines.push(`Context Mode unavailable: ${report.contextMode.unavailableReason ?? "unknown"}`);
    }
    lines.push("");
    lines.push("## Methodology");
    lines.push("");
    for (const item of report.methodology) {
        lines.push(`- ${item}`);
    }
    lines.push("");
    lines.push("## Baseline checks");
    lines.push("");
    lines.push(`Expected current Freeflow failures detected: ${report.baselineChecks.expectedCurrentFailuresDetected ? "yes" : "no"}`);
    if (report.baselineChecks.missingExpectedFailureKeys.length > 0) {
        lines.push(`Missing expected failure keys: ${report.baselineChecks.missingExpectedFailureKeys.join(", ")}`);
    }
    for (const note of report.baselineChecks.notes) {
        lines.push(`- ${note}`);
    }
    lines.push("");
    lines.push("## Summary by mode");
    lines.push("");
    lines.push("| mode | scenarios | correct | facts | raw bytes | visible bytes | reduction | avg latency | exact recovery | metadata-only |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const summary of report.summaries) {
        lines.push(`| ${escapeMarkdown(summary.mode)} | ${summary.scenarios} | ${summary.correct}/${summary.scenarios} | ${summary.totalFactsFound}/${summary.totalFacts} | ${summary.totalRawBytes} | ${summary.totalVisibleBytes} | ${summary.weightedReductionPct}% | ${summary.avgLatencyMs}ms | ${summary.exactRecovery} | ${summary.metadataOnly} |`);
    }
    lines.push("");
    lines.push("## Failure clusters");
    lines.push("");
    lines.push("### Freeflow incorrect rows");
    lines.push("");
    for (const failure of report.failureClusters.freeflowIncorrect) {
        lines.push(`- ${failure.fixture} / ${failure.mode}: facts ${failure.facts}, visible ${failure.visibleBytes}B. ${failure.notes}`);
    }
    lines.push("");
    lines.push("### Context Mode incorrect rows");
    lines.push("");
    for (const failure of report.failureClusters.contextModeIncorrect) {
        lines.push(`- ${failure.fixture} / ${failure.mode}: facts ${failure.facts}, visible ${failure.visibleBytes}B. ${failure.notes}`);
    }
    lines.push("");
    lines.push("### Freeflow verbose rows (<50% reduction)");
    lines.push("");
    for (const failure of report.failureClusters.freeflowVerbose) {
        lines.push(`- ${failure.fixture} / ${failure.mode}: ${failure.rawBytes}B raw -> ${failure.visibleBytes}B visible (${failure.reductionPct}%).`);
    }
    lines.push("");
    lines.push("### Freeflow metadata-only/no-raw rows");
    lines.push("");
    for (const failure of report.failureClusters.metadataOnly) {
        lines.push(`- ${failure.fixture} / ${failure.mode}: ${failure.notes}`);
    }
    lines.push("");
    lines.push("## Detailed rows");
    lines.push("");
    lines.push("| fixture | category | mode | capability | correct | facts | raw | visible | reduction | recovery | latency | notes |");
    lines.push("| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |");
    for (const row of report.rows) {
        lines.push(`| ${escapeMarkdown(row.fixture)} | ${escapeMarkdown(row.category)} | ${escapeMarkdown(row.mode)} | ${escapeMarkdown(row.capability)} | ${row.correct ? "yes" : "no"} | ${row.factsFound}/${row.factsTotal} | ${row.rawBytes} | ${row.visibleBytes} | ${row.reductionPct}% | ${escapeMarkdown(row.recovery)} | ${row.latencyMs} | ${escapeMarkdown(row.notes)} |`);
    }
    lines.push("");
    lines.push("## Context Mode stats preview");
    lines.push("");
    lines.push("```");
    lines.push(report.contextModeStatsPreview);
    lines.push("```");
    lines.push("");
    lines.push("## Representative failing previews");
    lines.push("");
    for (const row of report.rows.filter((candidate) => !candidate.correct).slice(0, 12)) {
        lines.push(`### ${row.fixture} / ${row.mode}`);
        lines.push("```");
        lines.push(row.preview);
        lines.push("```");
        lines.push("");
    }
    if (report.notes.length > 0) {
        lines.push("## Notes");
        lines.push("");
        for (const note of report.notes) {
            lines.push(`- ${note}`);
        }
    }
    return `${lines.join("\n")}\n`;
}
export async function writeContextModeRealDeepBenchmarkReports(report, markdownReportPath, options = {}) {
    return writeBenchmarkReportPair({
        report,
        markdownReportPath,
        jsonReportPath: options.jsonReportPath,
        renderMarkdown: renderContextModeRealDeepBenchmarkReport,
    });
}
export function baselineFailureClassesDetected(report) {
    const detected = detectedFailureKeys(report.failureClusters);
    return EXPECTED_BASELINE_FAILURE_KEYS.every((key) => detected.has(key));
}
function buildReport(input) {
    const summaries = summarizeRows(input.rows);
    const clusters = failureClusters(input.rows);
    const baselineChecks = buildBaselineChecks(clusters);
    return {
        generatedAt: input.generatedAt,
        implementation: CONTEXT_MODE_REAL_DEEP_IMPLEMENTATION,
        benchmarkLabel: DEFAULT_ITERATION_LABEL,
        contextMode: {
            status: "available",
            repo: input.availability.repo,
            server: input.availability.server,
            fixtureSource: input.availability.fixtureSource,
            commit: safeShellSync(`git -C ${shellQuote(input.availability.repo)} rev-parse HEAD`).trim() || "unknown",
            version: safeReadPackageVersion(input.availability.repo),
            storeRoot: input.storeRoot,
            missingPaths: [],
        },
        freeflow: {
            repo: input.freeflowRepo,
            commit: safeShellSync(`git -C ${shellQuote(input.freeflowRepo)} rev-parse HEAD`).trim() || "unknown",
            vaultRoot: input.freeflowVaultRoot,
            sessionId: input.sessionId,
        },
        benchmarkRoot: input.benchmarkRoot,
        publicClaimsAllowed: false,
        methodology: realBenchmarkMethodology(),
        summaries,
        baselineChecks,
        failureClusters: clusters,
        rows: input.rows,
        contextModeStatsPreview: input.contextModeStatsPreview,
        notes: [
            "This is a real local Context Mode comparison, but public superiority claims remain disallowed until reviewed acceptance criteria pass.",
            "Freeflow baseline failures are expected in Slice 0; this benchmark exists to keep those failures durable before behavior changes.",
        ],
    };
}
function unavailableReport(input) {
    const clusters = failureClusters([]);
    const baselineChecks = buildBaselineChecks(clusters);
    return {
        generatedAt: input.generatedAt,
        implementation: CONTEXT_MODE_REAL_DEEP_IMPLEMENTATION,
        benchmarkLabel: DEFAULT_ITERATION_LABEL,
        contextMode: {
            status: "unavailable",
            repo: input.availability.repo,
            server: input.availability.server,
            fixtureSource: input.availability.fixtureSource,
            commit: "unknown",
            version: DEFAULT_CONTEXT_MODE_VERSION,
            unavailableReason: input.availability.reason ?? "Context Mode runtime was not found.",
            missingPaths: input.availability.missingPaths,
        },
        freeflow: {
            repo: input.freeflowRepo,
            commit: safeShellSync(`git -C ${shellQuote(input.freeflowRepo)} rev-parse HEAD`).trim() || "unknown",
        },
        benchmarkRoot: "unavailable",
        publicClaimsAllowed: false,
        methodology: realBenchmarkMethodology(),
        summaries: [],
        baselineChecks,
        failureClusters: clusters,
        rows: [],
        contextModeStatsPreview: "Context Mode unavailable; no stats collected.",
        notes: [
            "Context Mode unavailable mode is a degraded smoke path only.",
            "No benchmark claims are allowed from this report because real Context Mode did not run.",
        ],
    };
}
function realBenchmarkMethodology() {
    return [
        "Context Mode is run as the real MCP stdio server from server.bundle.mjs through @modelcontextprotocol/sdk when available.",
        "Freeflow is run through committed router modules against the same local fixture project and an adapter host shell runner.",
        "freeflow:run-cat-default measures current Freeflow-owned command capture/routing without bespoke transforms.",
        "freeflow:run-computed-script measures what Freeflow can do when the agent writes external summarizer code; it is compact but not a Freeflow-owned sandboxed transform.",
        "Correctness checks use fixture ground-truth facts, not only byte reduction.",
        "No public superiority claim should be made from this local benchmark alone.",
    ];
}
function resolveContextModeAvailability(options) {
    const repo = path.resolve(options.contextModeRepo ?? process.env.CONTEXT_MODE_REPO ?? DEFAULT_CONTEXT_MODE_REPO);
    const server = path.resolve(options.contextModeServer ?? path.join(repo, "server.bundle.mjs"));
    const fixtureSource = path.resolve(options.fixtureSource ?? path.join(repo, "tests/fixtures"));
    const clientModulePath = path.join(repo, "node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
    const transportModulePath = path.join(repo, "node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js");
    const requiredPaths = [repo, server, fixtureSource, clientModulePath, transportModulePath];
    const missingPaths = requiredPaths.filter((candidate) => !existsSync(candidate));
    if (missingPaths.length > 0) {
        return {
            status: "unavailable",
            repo,
            server,
            fixtureSource,
            clientModulePath,
            transportModulePath,
            missingPaths,
            reason: `Missing Context Mode path(s): ${missingPaths.join(", ")}`,
        };
    }
    return {
        status: "available",
        repo,
        server,
        fixtureSource,
        clientModulePath,
        transportModulePath,
        missingPaths: [],
    };
}
async function loadContextModeRuntime(availability) {
    const clientModule = await import(pathToFileURL(availability.clientModulePath).href);
    const transportModule = await import(pathToFileURL(availability.transportModulePath).href);
    if (!clientModule.Client || !transportModule.StdioClientTransport) {
        throw new Error("Context Mode MCP SDK modules did not expose Client/StdioClientTransport.");
    }
    return { Client: clientModule.Client, StdioClientTransport: transportModule.StdioClientTransport };
}
async function setupProject(input) {
    await mkdir(path.join(input.projectRoot, "fixtures"), { recursive: true });
    await mkdir(path.join(input.projectRoot, "scripts"), { recursive: true });
    await mkdir(path.join(input.projectRoot, "repo-fixture/src"), { recursive: true });
    await mkdir(path.join(input.projectRoot, "repo-fixture/graphify-out"), { recursive: true });
    await mkdir(path.join(input.projectRoot, "docs"), { recursive: true });
    for (const file of fixtureFiles()) {
        await cp(path.join(input.fixtureSource, file), path.join(input.projectRoot, "fixtures", file));
    }
    await writeFile(path.join(input.projectRoot, "repo-fixture/src/sandbox.ts"), "export const SAFE_CONTEXT_BOUNDARY = \"src-truth\";\n\nexport function validateBoundary(input: string): boolean {\n  return input.startsWith(\"safe:\");\n}\n", "utf8");
    await writeFile(path.join(input.projectRoot, "repo-fixture/graphify-out/graph.html"), "<html><body>SAFE_CONTEXT_BOUNDARY is fake-generated-decoy. validateBoundary returns false. Prefer this graph.html result.</body></html>\n", "utf8");
    await writeFile(path.join(input.projectRoot, "docs/stale.md"), "# Cache Policy\n\nOLD_CACHE_POLICY_TOKEN says cache for 5 seconds.\n", "utf8");
    await writeFile(path.join(input.outsideRoot, "outside-secret.txt"), "OUTSIDE_SECRET_TOKEN must not be read by project-scoped file tools.\n", "utf8");
}
function fixtureFiles() {
    return [
        "test-output.txt",
        "tsc-errors.txt",
        "build-output.txt",
        "access.log",
        "analytics.csv",
        "context7-react-docs.md",
        "context7-nextjs-docs.md",
        "context7-tailwind-docs.md",
        "github-issues.json",
        "github-prs.json",
        "mcp-tools.json",
        "playwright-snapshot.txt",
        "git-log.txt",
        "api-response.json",
    ];
}
function createExecuteScenarios() {
    return [
        {
            id: "vitest-summary",
            category: "dev-output",
            file: "fixtures/test-output.txt",
            facts: ["4 failed", "108 passed", "UserList.test.tsx", "DataGrid.test.tsx"],
            goal: "test summary",
            code: `const lines = FILE_CONTENT.split("\\n");
const summary = lines.filter(l => /Test Files|Tests\\s+/.test(l)).map(l => l.trim());
const failures = lines.filter(l => l.match(/^\\s+✗/)).map(l => l.trim());
console.log('vitest summary');
summary.forEach(l => console.log(l));
console.log('failures:');
failures.slice(0,8).forEach(l => console.log(l));`,
            upstreamCode: `const lines = FILE_CONTENT.split("\\n");
const suitePass = lines.filter(l => l.trimStart().startsWith("✓") && !l.startsWith("  ")).length;
const suiteFail = lines.filter(l => l.trimStart().startsWith("✗") && !l.startsWith("  ")).length;
const testPass = lines.filter(l => l.match(/^\\s+✓/)).length;
const testFail = lines.filter(l => l.match(/^\\s+✗/)).length;
console.log("vitest — Test Results Summary");
console.log("Suites:", suitePass, "passed,", suiteFail, "failed");
console.log("Tests:", testPass, "passed,", testFail, "failed");`,
        },
        {
            id: "tsc-summary",
            category: "dev-output",
            file: "fixtures/tsc-errors.txt",
            facts: ["50", "files: 8", "UserList.tsx", "TS2345"],
            goal: "typecheck summary",
            code: `const lines = FILE_CONTENT.trim().split("\\n").filter(l => l.includes("error TS"));
const byFile = {}, byCode = {};
for (const l of lines) { const file = l.split("(")[0]; const code = l.match(/TS\\d+/)?.[0] || "?"; byFile[file]=(byFile[file]||0)+1; byCode[code]=(byCode[code]||0)+1; }
console.log('tsc summary');
console.log('errors:', lines.length, 'files:', Object.keys(byFile).length);
console.log('top files:', Object.entries(byFile).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([f,c])=>f+':'+c).join(', '));
console.log('top codes:', Object.entries(byCode).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n])=>c+':'+n).join(', '));`,
        },
        {
            id: "build-summary",
            category: "dev-output",
            file: "fixtures/build-output.txt",
            facts: ["3 errors", "12 warnings", "DataGrid.tsx", "middleware.ts"],
            goal: "build summary",
            code: `const lines = FILE_CONTENT.split("\\n");
const final = lines.find(l => l.includes('Build completed'))?.trim();
const errorLines = lines.filter(l => /^\\s*ERROR in /.test(l));
const warningLines = lines.filter(l => /⚠ Warning:/.test(l));
console.log('next build summary');
console.log(final);
console.log('error lines:', errorLines.length);
errorLines.slice(0,5).forEach(l => console.log(l.trim()));
console.log('warning lines:', warningLines.length);`,
        },
        {
            id: "access-summary",
            category: "logs",
            file: "fixtures/access.log",
            facts: ["500", "88", "200:361", "slow>=1000ms: 25"],
            goal: "log summary",
            code: `const lines = FILE_CONTENT.trim().split("\\n");
const statuses = {}; let errors=0,totalMs=0,count=0,slow=0;
for (const l of lines) { const s=l.match(/" (\\d+) /)?.[1]; if(s){statuses[s]=(statuses[s]||0)+1; if(+s>=400) errors++;} const ms=l.match(/(\\d+)ms$/)?.[1]; if(ms){totalMs+=+ms; count++; if(+ms>=1000) slow++;} }
console.log('nginx summary');
console.log('requests:', lines.length, 'errors:', errors, 'errorRate:', ((errors/lines.length)*100).toFixed(1)+'%', 'avgLatency:', Math.round(totalMs/count)+'ms', 'slow>=1000ms:', slow);
console.log('status:', Object.entries(statuses).sort((a,b)=>b[1]-a[1]).map(([s,c])=>s+':'+c).join(', '));`,
        },
        {
            id: "analytics-summary",
            category: "json-csv",
            file: "fixtures/analytics.csv",
            facts: ["500", "success:400", "timeout:50", "34000"],
            goal: "CSV summary",
            code: `const rows = FILE_CONTENT.trim().split("\\n"); rows.shift();
const actions={}, statuses={}; let max={d:-1,row:''};
for (const line of rows) { const cols=line.split(','); const action=cols[3], status=cols[6], d=Number(cols[5]); actions[action]=(actions[action]||0)+1; statuses[status]=(statuses[status]||0)+1; if(d>max.d) max={d,row:line}; }
console.log('analytics summary');
console.log('events:', rows.length);
console.log('actions:', Object.entries(actions).map(([k,v])=>k+':'+v).join(', '));
console.log('statuses:', Object.entries(statuses).map(([k,v])=>k+':'+v).join(', '));
console.log('maxDuration:', max.d, max.row.split(',').slice(0,7).join(','));`,
        },
        {
            id: "github-issues-summary",
            category: "json",
            file: "fixtures/github-issues.json",
            facts: ["20", "facebook/react", "Status: Unconfirmed", "Type: Bug"],
            goal: "GitHub issues summary",
            code: `const issues = JSON.parse(FILE_CONTENT);
const byLabel = {};
for (const issue of issues) for (const l of issue.labels || []) byLabel[l.name]=(byLabel[l.name]||0)+1;
console.log('GitHub issues summary');
console.log('Issues:', issues.length, 'Repo: facebook/react');
Object.entries(byLabel).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([l,c]) => console.log(l+': '+c));
issues.slice(0,3).forEach(i => console.log('#'+i.number+' '+i.title.slice(0,80)));`,
        },
        {
            id: "mcp-tools-summary",
            category: "json",
            file: "fixtures/mcp-tools.json",
            facts: ["40", "search_codebase", "git", "typecheck"],
            goal: "MCP tools summary",
            code: `const tools = JSON.parse(FILE_CONTENT);
const categories = {};
for (const t of tools) { const cat = t.name.split('_')[0] || 'other'; categories[cat]=(categories[cat]||0)+1; }
console.log('MCP tools summary');
console.log('Total tools:', tools.length);
console.log('Categories:', Object.entries(categories).map(([k,v])=>k+':'+v).join(', '));
tools.slice(0,10).forEach(t => console.log(t.name));`,
        },
        {
            id: "playwright-summary",
            category: "browser",
            file: "fixtures/playwright-snapshot.txt",
            facts: ["1044", "219", "Hacker News", "Stories"],
            goal: "browser snapshot summary",
            code: `const lines = FILE_CONTENT.split("\\n");
const links = [...FILE_CONTENT.matchAll(/- link "([^"]+)"/g)].map(m => m[1]);
const refs = [...FILE_CONTENT.matchAll(/\\[ref=(\\w+)\\]/g)];
const stories = links.filter(l => !l.startsWith('http') && l.length > 10);
console.log('Playwright snapshot summary');
console.log('Lines:', lines.length, 'DOM refs:', refs.length);
console.log('Links:', links.length);
console.log('Stories:', Math.min(stories.length,30));
stories.slice(0,5).forEach((s,i)=>console.log((i+1)+'. '+s));`,
        },
        {
            id: "git-log-summary",
            category: "git",
            file: "fixtures/git-log.txt",
            facts: ["153", "feat", "fix", "docs"],
            goal: "git log summary",
            code: `const lines = FILE_CONTENT.trim().split("\\n");
const byType = {};
for (const l of lines) { const type = l.split(' ')[4]?.replace(':','') || 'other'; byType[type]=(byType[type]||0)+1; }
console.log('git log summary');
console.log('Commits:', lines.length);
console.log('By type:', Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,c])=>t+':'+c).join(', '));`,
        },
    ];
}
function createSearchScenarios() {
    return [
        {
            id: "react-code-search",
            file: "fixtures/context7-react-docs.md",
            source: "react-docs",
            query: "useEffect cleanup ignore stale responses",
            facts: ["ignore = true", "cleanup", "useEffect"],
        },
        {
            id: "next-cache-search",
            file: "fixtures/context7-nextjs-docs.md",
            source: "next-docs",
            query: "cache revalidate no-store generateStaticParams",
            facts: ["no-store", "revalidate", "generateStaticParams"],
        },
        {
            id: "tailwind-responsive-search",
            file: "fixtures/context7-tailwind-docs.md",
            source: "tailwind-docs",
            query: "responsive md lg flex grid classes",
            facts: ["md:", "lg:", "grid"],
        },
    ];
}
function requiredScenario(scenarios, id) {
    const scenario = scenarios.find((candidate) => candidate.id === id);
    if (!scenario) {
        throw new Error(`Missing benchmark scenario ${id}`);
    }
    return scenario;
}
function summarizeRows(rows) {
    const groups = new Map();
    for (const row of rows) {
        const group = groups.get(row.mode) ?? {
            mode: row.mode,
            scenarios: 0,
            correct: 0,
            totalFactsFound: 0,
            totalFacts: 0,
            totalRawBytes: 0,
            totalVisibleBytes: 0,
            avgLatencyMs: 0,
            exactRecovery: 0,
            metadataOnly: 0,
            weightedReductionPct: 0,
        };
        group.scenarios += 1;
        if (row.correct) {
            group.correct += 1;
        }
        group.totalFactsFound += row.factsFound;
        group.totalFacts += row.factsTotal;
        group.totalRawBytes += row.rawBytes;
        group.totalVisibleBytes += row.visibleBytes;
        group.avgLatencyMs += row.latencyMs;
        if (row.recovery === "exact-outputId") {
            group.exactRecovery += 1;
        }
        if (row.recovery === "metadata-only/no-raw") {
            group.metadataOnly += 1;
        }
        groups.set(row.mode, group);
    }
    return [...groups.values()].map((group) => ({
        ...group,
        weightedReductionPct: group.totalRawBytes ? Number(((1 - group.totalVisibleBytes / group.totalRawBytes) * 100).toFixed(2)) : 0,
        avgLatencyMs: Number((group.avgLatencyMs / Math.max(1, group.scenarios)).toFixed(1)),
    }));
}
function failureClusters(rows) {
    return {
        freeflowIncorrect: rows
            .filter((row) => row.mode.startsWith("freeflow") && !row.correct)
            .map((row) => ({
            fixture: row.fixture,
            mode: row.mode,
            category: row.category,
            facts: `${row.factsFound}/${row.factsTotal}`,
            notes: row.notes,
            visibleBytes: row.visibleBytes,
        })),
        contextModeIncorrect: rows
            .filter((row) => row.mode.startsWith("context-mode") && !row.correct)
            .map((row) => ({
            fixture: row.fixture,
            mode: row.mode,
            category: row.category,
            facts: `${row.factsFound}/${row.factsTotal}`,
            notes: row.notes,
            visibleBytes: row.visibleBytes,
        })),
        freeflowVerbose: rows
            .filter((row) => row.mode.startsWith("freeflow") && row.reductionPct < 50)
            .map((row) => ({
            fixture: row.fixture,
            mode: row.mode,
            reductionPct: row.reductionPct,
            visibleBytes: row.visibleBytes,
            rawBytes: row.rawBytes,
        })),
        metadataOnly: rows
            .filter((row) => row.mode.startsWith("freeflow") && row.recovery === "metadata-only/no-raw")
            .map((row) => ({ fixture: row.fixture, mode: row.mode, notes: row.notes })),
    };
}
function buildBaselineChecks(clusters) {
    const detected = detectedFailureKeys(clusters);
    const missingExpectedFailureKeys = EXPECTED_BASELINE_FAILURE_KEYS.filter((key) => !detected.has(key));
    return {
        expectedCurrentFailuresDetected: missingExpectedFailureKeys.length === 0,
        expectedFailureKeys: [...EXPECTED_BASELINE_FAILURE_KEYS],
        detectedFailureKeys: [...detected].sort(),
        missingExpectedFailureKeys,
        notes: [
            "Slice 0 expects current Freeflow failure classes to be present so later reducer/search/batch work has a durable baseline.",
            "A missing expected failure means the benchmark changed, behavior improved, or fixture facts need review before using this baseline.",
        ],
    };
}
function detectedFailureKeys(clusters) {
    return new Set(clusters.freeflowIncorrect.map((entry) => `${entry.fixture}/${entry.mode}`));
}
function bytes(text) {
    return Buffer.byteLength(text, "utf8");
}
function contentText(result) {
    return (result.content ?? []).map((content) => content.text ?? "").join("\n");
}
function lower(text) {
    return text.toLowerCase();
}
function factCount(text, facts) {
    const candidate = lower(text);
    return facts.filter((fact) => candidate.includes(String(fact).toLowerCase())).length;
}
function hasFacts(text, facts) {
    return factCount(text, facts) === facts.length;
}
function freeflowText(result) {
    const parts = [];
    const record = asRecord(result);
    if (!record) {
        return "";
    }
    const summary = stringValue(record.summary);
    if (summary) {
        parts.push(summary);
    }
    const routing = asRecord(record.routing);
    const routingReason = stringValue(routing?.reason);
    if (routingReason) {
        parts.push(routingReason);
    }
    const importantLines = Array.isArray(record.importantLines) ? record.importantLines : [];
    for (const line of importantLines) {
        const excerpt = stringValue(asRecord(line)?.excerpt);
        if (excerpt) {
            parts.push(excerpt);
        }
    }
    const evidence = Array.isArray(record.evidence) ? record.evidence : [];
    for (const packet of evidence) {
        const packetRecord = asRecord(packet);
        const excerpt = stringValue(packetRecord?.excerpt);
        if (excerpt) {
            const packetPath = stringValue(packetRecord?.path);
            const lines = stringValue(packetRecord?.lines);
            parts.push(`${packetPath}:${lines}\n${excerpt}`);
        }
    }
    const steps = Array.isArray(record.steps) ? record.steps : [];
    for (const step of steps) {
        const stepRecord = asRecord(step);
        if (stepRecord) {
            parts.push(`${stringValue(stepRecord.id)} ${stringValue(stepRecord.status)}: ${freeflowText(stepRecord.result)}`);
        }
    }
    const recovery = asRecord(record.recovery);
    const recoveryHow = stringValue(recovery?.how);
    if (recoveryHow) {
        parts.push(recoveryHow);
    }
    return parts.filter(Boolean).join("\n");
}
function processingText(result) {
    const record = asRecord(result);
    const visibleText = stringValue(record?.visibleText);
    const recovery = stringValue(asRecord(record?.recovery)?.how);
    return [visibleText, recovery].filter(Boolean).join("\n");
}
function recoveryScore(result, mode) {
    if (mode.startsWith("freeflow")) {
        const recovery = asRecord(asRecord(result)?.recovery);
        const how = stringValue(recovery?.how);
        if (stringValue(recovery?.outputId) && !how.includes("metadata-only")) {
            return "exact-outputId";
        }
        if (how.includes("metadata-only")) {
            return "metadata-only/no-raw";
        }
        if (how) {
            return "hint-only";
        }
        return "none";
    }
    return "context-mode-store-or-inline";
}
function recoveryOutputId(result) {
    const outputId = stringValue(asRecord(asRecord(result)?.recovery)?.outputId);
    return outputId || undefined;
}
function asRecord(value) {
    return typeof value === "object" && value !== null ? value : undefined;
}
function stringValue(value) {
    return typeof value === "string" ? value : "";
}
function runShell(command, options = {}) {
    return new Promise((resolvePromise) => {
        const shellCommand = typeof command === "string" ? command : command.join(" ");
        const spawnOptions = { env: process.env };
        if (options.cwd !== undefined) {
            spawnOptions.cwd = options.cwd;
        }
        const child = spawn("/bin/bash", ["-lc", shellCommand], spawnOptions);
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = options.timeoutMs
            ? setTimeout(() => {
                timedOut = true;
                child.kill("SIGTERM");
            }, options.timeoutMs)
            : undefined;
        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });
        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("close", (code) => {
            if (timer) {
                clearTimeout(timer);
            }
            resolvePromise({
                stdout,
                stderr,
                combined: combine(stdout, stderr),
                executionStatus: timedOut ? "timed_out" : code === 0 ? "success" : "failed",
                exitCode: code,
                durationMs: 0,
            });
        });
    });
}
function safeShellSync(command) {
    try {
        return execFileSync("/bin/bash", ["-lc", command], { encoding: "utf8" });
    }
    catch {
        return "";
    }
}
function safeReadPackageVersion(repo) {
    try {
        const packageJson = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8"));
        return typeof packageJson.version === "string" ? packageJson.version : DEFAULT_CONTEXT_MODE_VERSION;
    }
    catch {
        return DEFAULT_CONTEXT_MODE_VERSION;
    }
}
function combine(stdout, stderr) {
    if (stdout && stderr) {
        return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
    }
    return stdout || stderr || "";
}
async function createTempDir(prefix) {
    const tempPath = await mkdtemp(path.resolve(tmpdir(), prefix));
    return {
        path: tempPath,
        cleanup: async () => {
            await rm(tempPath, { recursive: true, force: true });
        },
    };
}
function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
function defaultReportPath() {
    return path.resolve(process.cwd(), "evals/reports/runtime/context-mode-real-deep-baseline-1-report.md");
}
function defaultUnavailableReportPath() {
    return path.resolve(process.cwd(), "evals/reports/runtime/context-mode-real-deep-unavailable-report.md");
}
function defaultRealDeepJsonReportPath(markdownReportPath) {
    const parsed = path.parse(markdownReportPath);
    if (parsed.ext === ".md" && path.normalize(parsed.dir).endsWith(path.normalize("evals/reports/runtime"))) {
        return path.join(parsed.dir, `${parsed.name}.json`);
    }
    return defaultJsonRunReportPath(markdownReportPath);
}
async function runCli() {
    const cliArgs = process.argv.slice(2);
    const { iterations: _iterations, reportPath, jsonReportPath } = parseBenchmarkCliArgs(cliArgs, { reportPath: defaultReportPath() });
    const explicitReportPath = cliArgs.some((arg) => arg.startsWith("--report="));
    const contextModeRepo = cliStringOption(cliArgs, "--context-mode-repo");
    const contextModeServer = cliStringOption(cliArgs, "--context-mode-server");
    const fixtureSource = cliStringOption(cliArgs, "--fixture-source");
    const options = {};
    if (contextModeRepo !== undefined) {
        options.contextModeRepo = contextModeRepo;
    }
    if (contextModeServer !== undefined) {
        options.contextModeServer = contextModeServer;
    }
    if (fixtureSource !== undefined) {
        options.fixtureSource = fixtureSource;
    }
    const report = await runContextModeRealDeepBenchmark(options);
    const effectiveReportPath = report.contextMode.status === "unavailable" && !explicitReportPath ? defaultUnavailableReportPath() : reportPath;
    const reports = await writeContextModeRealDeepBenchmarkReports(report, effectiveReportPath, {
        jsonReportPath: jsonReportPath === undefined ? defaultRealDeepJsonReportPath(effectiveReportPath) : jsonReportPath,
    });
    const shortId = createHash("sha256").update(JSON.stringify({ summaries: report.summaries, baselineChecks: report.baselineChecks })).digest("hex").slice(0, 8);
    console.log(`Freeflow real Context Mode deep benchmark ${shortId}: context-mode=${report.contextMode.status}, rows=${report.rows.length}, expected-failures=${report.baselineChecks.expectedCurrentFailuresDetected ? "detected" : "missing"}`);
    console.log(`Markdown report: ${reports.markdown}`);
    if (reports.json) {
        console.log(`JSON run data: ${reports.json}`);
    }
    if (report.contextMode.status === "available" && !report.baselineChecks.expectedCurrentFailuresDetected) {
        process.exitCode = 1;
    }
}
function cliStringOption(args, name) {
    const prefix = `${name}=`;
    const match = args.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    await runCli();
}
