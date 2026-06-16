import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { freeflowRetrieve } from "./retrieve.js";
import { createVault, storeCommandOutput } from "./vault.js";
const DEFAULT_ITERATIONS = 3;
const DEFAULT_CONTEXT_LINES = 2;
const LEGACY_SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".next", ".nuxt", "coverage", "target"]);
const GENERATED_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "coverage",
    "target",
    "graphify-out",
    ".cache",
    ".tmp",
    "tmp",
    "temp",
    "logs",
]);
const EXTERNAL_TOOL_SKIPS = [
    { name: "Graphify", reason: "Optional external comparator is not required for CI-friendly router benchmarks." },
    { name: "Claude Context", reason: "Optional semantic/hybrid search comparator is skipped unless configured separately." },
    { name: "RTK", reason: "Command-output comparator belongs to the later command benchmark track." },
    { name: "Squeez", reason: "Session-efficiency comparator belongs to the later command/session benchmark track." },
];
export async function runRouterBenchmarks(options = {}) {
    const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
    const fixtures = await createBenchmarkFixtures();
    try {
        const fixtureResults = [];
        for (const fixture of fixtures) {
            const results = [];
            for (const mode of benchmarkModes()) {
                results.push(await runFixtureMode(fixture, mode, iterations));
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
            summary: summarizeReport(fixtureResults),
            fixtures: fixtureResults,
            skippedExternalTools: EXTERNAL_TOOL_SKIPS,
        };
    }
    finally {
        await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
    }
}
export function renderRouterBenchmarkReport(report) {
    const date = report.generatedAt.slice(0, 10);
    const lines = [
        "# Output Router Benchmark Report - Iteration 1",
        "",
        `Date: ${date}`,
        "",
        "## Scope",
        "",
        "Deterministic, CI-friendly tool benchmark for Freeflow Router retrieval behavior. The runner compares a native text-search proxy, a pre-hardening Freeflow-style proxy, and the improved Freeflow Router implementation. Optional external comparators are recorded as skipped rather than failed.",
        "",
        "## Command",
        "",
        "```sh",
        "npm run bench:router",
        "```",
        "",
        "## Summary",
        "",
        `- Iterations per mode: ${report.iterations}`,
        `- Fixtures: ${report.summary.fixtures}`,
        `- Improved Freeflow Router gated pass: ${report.summary.improved.passed}/${report.summary.fixtures}`,
        `- Native baseline proxy pass: ${report.summary.nativeBaseline.passed}/${report.summary.fixtures}`,
        `- Pre-hardening Freeflow proxy pass: ${report.summary.freeflowBaseline.passed}/${report.summary.fixtures}`,
        `- Generated false positives observed: ${report.summary.generatedFalsePositiveCount}`,
        `- Sandbox failure fixed: ${report.summary.sandboxFailureFixed ? "yes" : "no"}`,
        "",
        "## Results",
        "",
        "| fixture | mode | correctness | path | lines | raw bytes/tokens | routed bytes/tokens | latency p50/p95 ms | recovery | notes |",
        "| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ];
    for (const fixture of report.fixtures) {
        for (const result of fixture.results) {
            const correctness = result.skipped ? "skipped" : result.correctness.passed ? "pass" : "fail";
            const recovery = result.recovery.status;
            const notes = result.notes.length ? result.notes.join("; ") : result.skipReason ?? "";
            lines.push(`| ${escapeTable(fixture.id)} | ${escapeTable(result.mode)} | ${correctness} | ${escapeTable(result.actualPath ?? "-")} | ${escapeTable(result.actualLines ?? "-")} | ${result.rawBytes}/${result.rawTokensApprox} | ${result.routedBytes}/${result.routedTokensApprox} | ${result.latencyMs.p50.toFixed(2)}/${result.latencyMs.p95.toFixed(2)} | ${escapeTable(recovery)} | ${escapeTable(notes)} |`);
        }
    }
    lines.push("", "## Skipped External Comparators", "");
    for (const tool of report.skippedExternalTools) {
        lines.push(`- ${tool.name}: ${tool.reason}`);
    }
    lines.push("", "## Regression Status", "", report.summary.improved.failed === 0
        ? "Improved Freeflow Router passed all gated benchmark fixtures."
        : `Improved Freeflow Router failed ${report.summary.improved.failed} gated benchmark fixture(s).`, "", "The generated-artifact decoy benchmark preserves the original Sandbox Permissions false-positive shape and records it as fixed when the improved router selects the docs target instead of `graphify-out/graph.html`.", "");
    return `${lines.join("\n")}`;
}
export async function writeRouterBenchmarkReport(report, reportPath) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, renderRouterBenchmarkReport(report), "utf8");
}
async function runFixtureMode(fixture, mode, iterations) {
    const latencies = [];
    let observation = null;
    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now();
        observation = await fixture.modes[mode]();
        latencies.push(performance.now() - startedAt);
    }
    if (!observation) {
        observation = skippedObservation("benchmark runner", "No observation was produced.");
    }
    const correctness = scoreCorrectness(fixture.expected, observation);
    return {
        mode,
        toolPathUsed: observation.toolPathUsed,
        skipped: observation.skipped ?? false,
        ...(observation.skipReason ? { skipReason: observation.skipReason } : {}),
        rawBytes: observation.rawBytes,
        rawTokensApprox: approximateTokens(observation.rawBytes),
        routedBytes: observation.routedBytes,
        routedTokensApprox: approximateTokens(observation.routedBytes),
        latencyMs: {
            p50: percentile(latencies, 0.5),
            p95: percentile(latencies, 0.95),
        },
        ...(observation.actualPath ? { actualPath: observation.actualPath } : {}),
        ...(observation.actualLines ? { actualLines: observation.actualLines } : {}),
        correctness,
        recovery: observation.recovery,
        notes: observation.notes ?? [],
    };
}
function summarizeReport(fixtures) {
    const nativeBaseline = summarizeMode(fixtures, "native-baseline-proxy");
    const freeflowBaseline = summarizeMode(fixtures, "pre-hardening-freeflow-proxy");
    const improved = summarizeMode(fixtures, "improved-freeflow-router");
    const generatedFalsePositiveCount = fixtures
        .flatMap((fixture) => fixture.results)
        .filter((result) => result.correctness.generatedFalsePositive).length;
    const sandboxFixture = fixtures.find((fixture) => fixture.id === "generated-artifact-decoy");
    const sandboxImproved = sandboxFixture?.results.find((result) => result.mode === "improved-freeflow-router");
    return {
        fixtures: fixtures.length,
        modeResults: fixtures.reduce((count, fixture) => count + fixture.results.length, 0),
        improved,
        nativeBaseline,
        freeflowBaseline,
        generatedFalsePositiveCount,
        sandboxFailureFixed: Boolean(sandboxImproved?.correctness.passed && !sandboxImproved.correctness.generatedFalsePositive),
    };
}
function summarizeMode(fixtures, mode) {
    return fixtures.reduce((summary, fixture) => {
        const result = fixture.results.find((candidate) => candidate.mode === mode);
        if (!result || result.skipped) {
            summary.skipped += 1;
        }
        else if (isGatedPass(result, mode)) {
            summary.passed += 1;
        }
        else {
            summary.failed += 1;
        }
        return summary;
    }, { passed: 0, failed: 0, skipped: 0 });
}
function isGatedPass(result, mode) {
    if (!result.correctness.passed) {
        return false;
    }
    if (mode !== "improved-freeflow-router") {
        return true;
    }
    return result.recovery.status === "passed" || result.recovery.status === "not-applicable";
}
async function createBenchmarkFixtures() {
    const fixtures = await Promise.all([
        createExactCopiedTextFixture(),
        createMarkdownSectionFixture(),
        createGeneratedArtifactDecoyFixture(),
        createHugeSingleLineDecoyFixture(),
        createAmbiguousMultiFileFixture(),
        createVaultedOutputFixture(),
        createExpansionFixture(),
    ]);
    return fixtures;
}
async function createExactCopiedTextFixture() {
    const repo = await createTempRepo({
        "target.md": [
            "# Target",
            "",
            "The output router vault preserves exact failure evidence for review.",
        ].join("\n"),
        "notes.md": "vault evidence evidence evidence without the exact sentence",
    });
    return repoQueryFixture(repo, {
        id: "exact-copied-text-block",
        title: "Exact copied text block",
        query: "output router vault preserves exact failure evidence",
        expected: {
            path: "target.md",
            lines: "3-3",
            requiredExcerpt: ["output router vault preserves exact failure evidence"],
        },
    });
}
async function createMarkdownSectionFixture() {
    const repo = await createTempRepo({
        "target.md": [
            "# Target",
            "",
            "## Adaptive Compression",
            "",
            "Vault recovery remains exact for raw output.",
            "Parser confidence labels routed diagnostics.",
        ].join("\n"),
        "decoy.md": "adaptive adaptive adaptive adaptive adaptive",
    });
    return repoQueryFixture(repo, {
        id: "markdown-heading-nearby-body",
        title: "Markdown heading plus nearby body text",
        query: "adaptive compression vault recovery parser confidence",
        expected: {
            path: "target.md",
            lines: "3-6",
            requiredExcerpt: ["Adaptive Compression", "Vault recovery", "Parser confidence"],
        },
    });
}
async function createGeneratedArtifactDecoyFixture() {
    const repo = await createTempRepo({
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
    });
    return repoQueryFixture(repo, {
        id: "generated-artifact-decoy",
        title: "Generated-artifact decoy",
        query: "Sandbox Permissions SandboxPermissions Plain-language meaning",
        expected: {
            path: "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md",
            lines: "3-7",
            requiredExcerpt: ["SandboxPermissions", "Plain-language meaning"],
        },
    });
}
async function createHugeSingleLineDecoyFixture() {
    const repo = await createTempRepo({
        "docs/router.md": [
            "# Router",
            "",
            "HUGE_MARKER belongs in bounded target evidence, not generated logs.",
        ].join("\n"),
        "debug.log": `${"HUGE_MARKER generated log noise ".repeat(6000)}HUGE_LOG_TAIL`,
    });
    return repoQueryFixture(repo, {
        id: "huge-single-line-decoy",
        title: "Huge single-line generated/log decoy",
        query: "HUGE_MARKER bounded target evidence",
        expected: {
            path: "docs/router.md",
            lines: "3-3",
            requiredExcerpt: ["HUGE_MARKER belongs in bounded target evidence"],
        },
    });
}
async function createAmbiguousMultiFileFixture() {
    const repo = await createTempRepo({
        "target.md": [
            "# Target",
            "",
            "Adaptive compression keeps vault recovery exact while parser confidence labels routed diagnostics.",
        ].join("\n"),
        "decoy.md": "adaptive ".repeat(900),
        "near-miss.md": "compression vault recovery without parser confidence",
    });
    return repoQueryFixture(repo, {
        id: "ambiguous-multi-file-query",
        title: "Ambiguous multi-file query",
        query: "adaptive compression vault recovery parser confidence",
        expected: {
            path: "target.md",
            lines: "3-3",
            requiredExcerpt: ["Adaptive compression", "vault recovery", "parser confidence"],
        },
    });
}
async function createVaultedOutputFixture() {
    const vaultRoot = await createTempDir("freeflow-router-benchmark-vault-");
    const vault = createVault({ root: vaultRoot.path });
    const sessionId = "benchmark-vault-session";
    const stderr = [
        "setup ok",
        "ASSERTION_FAILED payments badge missing accessible label",
        "stack: renderSettingsBadge at settings.test.ts:42",
    ].join("\n");
    const record = await storeCommandOutput(vault, {
        sessionId,
        command: "npm test -- settings",
        stdout: "",
        stderr,
        executionStatus: "failed",
        exitCode: 1,
        createdAt: "2026-06-16T00:00:00.000Z",
    });
    const expected = {
        pathIncludes: `${record.outputId}:stderr`,
        lines: "2-2",
        requiredExcerpt: ["ASSERTION_FAILED", "payments badge"],
    };
    return {
        id: "vaulted-output-query",
        title: "Vaulted output query",
        kind: "vault-query",
        expected,
        modes: {
            "native-baseline-proxy": async () => directTextSearchObservation({
                toolPathUsed: "native-baseline-proxy: direct command output text search",
                text: stderr,
                path: `${record.outputId}:stderr`,
                query: "ASSERTION_FAILED payments badge",
                recovery: { status: "not-applicable", detail: "Native direct output has no Freeflow vault recovery contract." },
            }),
            "pre-hardening-freeflow-proxy": async () => directTextSearchObservation({
                toolPathUsed: "pre-hardening-freeflow-proxy: simple vaulted line scanner",
                text: stderr,
                path: `${record.outputId}:stderr`,
                query: "ASSERTION_FAILED payments badge",
                recovery: { status: "failed", detail: "Baseline proxy does not expose structured recovery metadata." },
            }),
            "improved-freeflow-router": async () => improvedRetrieveObservation(await freeflowRetrieve({
                action: "query",
                source: { kind: "vault", root: vaultRoot.path, sessionId, outputId: record.outputId, stream: "stderr" },
                query: "ASSERTION_FAILED payments badge",
                preserve: "important",
            }), "improved-freeflow-router: freeflow_retrieve vault query", stderr),
        },
        cleanup: vaultRoot.cleanup,
    };
}
async function createExpansionFixture() {
    const body = [
        "# Expansion Target",
        "",
        "EXPANSION_START router evidence begins here.",
        ...Array.from({ length: 20 }, (_, index) => `expansion context line ${index + 1}`),
        "EXPANSION_END router evidence is complete here.",
    ];
    const repo = await createTempRepo({
        "target.md": body.join("\n"),
        "decoy.md": "EXPANSION_START ".repeat(200),
    });
    const query = "EXPANSION_START router evidence";
    const expected = {
        path: "target.md",
        lines: "1-24",
        requiredExcerpt: ["EXPANSION_START", "EXPANSION_END"],
    };
    return {
        id: "expand-narrow-evidence",
        title: "Expansion from narrow evidence to complete block",
        kind: "repo-expand",
        expected,
        modes: {
            "native-baseline-proxy": async () => directFileObservation(repo.path, "target.md", {
                toolPathUsed: "native-baseline-proxy: direct whole-file read",
                recovery: { status: "not-applicable", detail: "Native read is exact direct output, not routed recovery." },
            }),
            "pre-hardening-freeflow-proxy": async () => repoBaselineObservation(repo.path, query, {
                toolPathUsed: "pre-hardening-freeflow-proxy: narrow lexical line window without expansion",
                skipDirs: LEGACY_SKIP_DIRS,
                recovery: { status: "failed", detail: "Baseline proxy does not expose structured expansion recovery." },
            }),
            "improved-freeflow-router": async () => {
                const queryResult = await freeflowRetrieve({
                    action: "query",
                    source: { kind: "repo", root: repo.path },
                    query,
                    preserve: "important",
                });
                const evidence = queryResult.evidence?.[0];
                if (!evidence) {
                    return improvedRetrieveObservation(queryResult, "improved-freeflow-router: freeflow_retrieve query before expand", body.join("\n"));
                }
                return improvedRetrieveObservation(await freeflowRetrieve({
                    action: "expand",
                    source: { kind: "repo", root: repo.path },
                    evidence,
                    expansion: "lines_30",
                    preserve: "important",
                }), "improved-freeflow-router: freeflow_retrieve expand lines_30", body.join("\n"));
            },
        },
        cleanup: repo.cleanup,
    };
}
function repoQueryFixture(repo, options) {
    return {
        id: options.id,
        title: options.title,
        kind: "repo-query",
        expected: options.expected,
        modes: {
            "native-baseline-proxy": async () => repoBaselineObservation(repo.path, options.query, {
                toolPathUsed: "native-baseline-proxy: recursive text scan (rg/read proxy)",
                skipDirs: new Set(),
                recovery: { status: "not-applicable", detail: "Native proxy returns direct text without Freeflow recovery metadata." },
            }),
            "pre-hardening-freeflow-proxy": async () => repoBaselineObservation(repo.path, options.query, {
                toolPathUsed: "pre-hardening-freeflow-proxy: legacy line scorer",
                skipDirs: LEGACY_SKIP_DIRS,
                recovery: { status: "failed", detail: "Baseline proxy does not expose structured recovery metadata." },
            }),
            "improved-freeflow-router": async () => improvedRetrieveObservation(await freeflowRetrieve({
                action: "query",
                source: { kind: "repo", root: repo.path },
                query: options.query,
                preserve: "important",
            }), "improved-freeflow-router: freeflow_retrieve query", await readRepoBytes(repo.path)),
        },
        cleanup: repo.cleanup,
    };
}
async function repoBaselineObservation(root, query, options) {
    const files = await collectTextFiles(root, options.skipDirs);
    const hit = findBestLineHit(files, query);
    const rawBytes = byteLength(files.map((file) => file.text).join("\n"));
    if (!hit) {
        return {
            toolPathUsed: options.toolPathUsed,
            rawBytes,
            routedBytes: 0,
            excerpt: "",
            recovery: options.recovery,
            notes: ["no lexical hit"],
        };
    }
    const range = contextRange(hit.file.lines, hit.lineIndex);
    const excerpt = hit.file.lines.slice(range.start - 1, range.end).join("\n");
    return {
        toolPathUsed: options.toolPathUsed,
        rawBytes,
        routedBytes: byteLength(excerpt),
        actualPath: hit.file.path,
        actualLines: `${range.start}-${range.end}`,
        excerpt,
        recovery: options.recovery,
        notes: [`score=${hit.score.toFixed(2)}`],
    };
}
async function directFileObservation(root, path, options) {
    const text = await readFile(resolve(root, path), "utf8");
    const lines = splitLines(text);
    return {
        toolPathUsed: options.toolPathUsed,
        rawBytes: byteLength(text),
        routedBytes: byteLength(text),
        actualPath: path,
        actualLines: `1-${lines.length}`,
        excerpt: text,
        recovery: options.recovery,
    };
}
async function directTextSearchObservation(options) {
    const file = { path: options.path, text: options.text, lines: splitLines(options.text) };
    const hit = findBestLineHit([file], options.query);
    if (!hit) {
        return {
            toolPathUsed: options.toolPathUsed,
            rawBytes: byteLength(options.text),
            routedBytes: 0,
            excerpt: "",
            recovery: options.recovery,
            notes: ["no lexical hit"],
        };
    }
    const range = contextRange(file.lines, hit.lineIndex);
    const excerpt = file.lines.slice(range.start - 1, range.end).join("\n");
    return {
        toolPathUsed: options.toolPathUsed,
        rawBytes: byteLength(options.text),
        routedBytes: byteLength(excerpt),
        actualPath: options.path,
        actualLines: `${range.start}-${range.end}`,
        excerpt,
        recovery: options.recovery,
        notes: [`score=${hit.score.toFixed(2)}`],
    };
}
function improvedRetrieveObservation(result, toolPathUsed, rawSource) {
    const evidence = result.evidence?.[0];
    const excerpt = result.evidence?.map((packet) => packet.excerpt).join("\n") ?? "";
    const recoveryPassed = Boolean(result.recovery?.how && (result.recovery.outputId || result.recovery.evidenceId || result.evidence?.some((packet) => packet.expandable)));
    const notes = [result.routing.reason];
    if (result.evidence && result.evidence.length > 1) {
        notes.push(`evidencePackets=${result.evidence.length}`);
    }
    return {
        toolPathUsed,
        rawBytes: byteLength(rawSource),
        routedBytes: byteLength(JSON.stringify(result)),
        ...(evidence?.path ? { actualPath: evidence.path } : {}),
        ...(evidence?.lines ? { actualLines: evidence.lines } : {}),
        excerpt,
        recovery: recoveryPassed
            ? { status: "passed", detail: result.recovery?.how ?? "Routed result exposes recovery guidance." }
            : { status: "failed", detail: "Routed result did not expose recovery guidance." },
        notes,
    };
}
function scoreCorrectness(expected, observation) {
    if (observation.skipped) {
        return {
            passed: false,
            pathCorrect: false,
            spanCorrect: false,
            excerptComplete: false,
            generatedFalsePositive: false,
        };
    }
    const pathCorrect = expected.path
        ? observation.actualPath === expected.path
        : expected.pathIncludes
            ? Boolean(observation.actualPath?.includes(expected.pathIncludes))
            : true;
    const spanCorrect = expected.lines
        ? Boolean(observation.actualLines && rangesOverlap(expected.lines, observation.actualLines))
        : true;
    const excerptComplete = (expected.requiredExcerpt ?? []).every((snippet) => observation.excerpt.toLowerCase().includes(snippet.toLowerCase()));
    const generatedFalsePositive = observation.actualPath ? isGeneratedBenchmarkPath(observation.actualPath) : false;
    const passed = pathCorrect && spanCorrect && excerptComplete && !generatedFalsePositive;
    return {
        passed,
        pathCorrect,
        spanCorrect,
        excerptComplete,
        generatedFalsePositive,
    };
}
async function createTempRepo(files) {
    const root = await createTempDir("freeflow-router-benchmark-repo-");
    for (const [path, text] of Object.entries(files)) {
        const absolutePath = resolve(root.path, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, text, "utf8");
    }
    return root;
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
async function collectTextFiles(root, skipDirs) {
    const files = [];
    await collectTextFilesInto(resolve(root), resolve(root), skipDirs, files);
    return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function collectTextFilesInto(root, currentPath, skipDirs, files) {
    const currentStat = await stat(currentPath);
    const name = currentPath.split(/[\\/]+/).at(-1) ?? currentPath;
    if (currentStat.isDirectory()) {
        if (currentPath !== root && skipDirs.has(name)) {
            return;
        }
        const entries = await readdir(currentPath, { withFileTypes: true });
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            await collectTextFilesInto(root, resolve(currentPath, entry.name), skipDirs, files);
        }
        return;
    }
    if (!currentStat.isFile()) {
        return;
    }
    const text = await readFile(currentPath, "utf8");
    if (text.includes("\0")) {
        return;
    }
    files.push({
        path: normalizeRelativePath(relative(root, currentPath)),
        text,
        lines: splitLines(text),
    });
}
function findBestLineHit(files, query) {
    const tokens = tokenize(query);
    let best = null;
    for (const file of files) {
        const pathScore = scoreText(file.path, tokens);
        file.lines.forEach((line, lineIndex) => {
            const lineScore = scoreText(line, tokens);
            const headingBonus = line.trimStart().startsWith("#") ? 2 : 0;
            const score = lineScore * 4 + pathScore + headingBonus;
            if (score <= 0) {
                return;
            }
            if (!best || score > best.score) {
                best = { file, lineIndex, score };
            }
        });
    }
    return best;
}
function contextRange(lines, lineIndex) {
    return {
        start: Math.max(1, lineIndex + 1 - DEFAULT_CONTEXT_LINES),
        end: Math.min(lines.length, lineIndex + 1 + DEFAULT_CONTEXT_LINES),
    };
}
async function readRepoBytes(root) {
    const files = await collectTextFiles(root, new Set());
    return files.map((file) => file.text).join("\n");
}
function rangesOverlap(left, right) {
    const leftRange = parseRange(left);
    const rightRange = parseRange(right);
    if (!leftRange || !rightRange) {
        return false;
    }
    return leftRange.start <= rightRange.end && rightRange.start <= leftRange.end;
}
function parseRange(range) {
    const match = /^(\d+)-(\d+)$/.exec(range);
    if (!match) {
        return null;
    }
    const start = Number(match[1]);
    const end = Number(match[2]);
    return Number.isInteger(start) && Number.isInteger(end) ? { start, end } : null;
}
function isGeneratedBenchmarkPath(path) {
    const segments = path.split(/[\\/]+/);
    if (segments.some((segment) => GENERATED_DIRS.has(segment))) {
        return true;
    }
    const name = segments.at(-1)?.toLowerCase() ?? path.toLowerCase();
    return name.endsWith(".log") || name.endsWith(".map") || name.endsWith(".min.js") || name.endsWith(".min.css") || name.includes(".bundle.");
}
function scoreText(text, tokens) {
    const lower = text.toLowerCase();
    return tokens.reduce((score, token) => score + countOccurrences(lower, token), 0);
}
function countOccurrences(text, token) {
    let count = 0;
    let index = text.indexOf(token);
    while (index !== -1) {
        count += 1;
        index = text.indexOf(token, index + token.length);
    }
    return count;
}
function tokenize(query) {
    return query
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
}
function splitLines(text) {
    if (text.length === 0) {
        return [];
    }
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
function byteLength(value) {
    return Buffer.byteLength(value, "utf8");
}
function approximateTokens(bytes) {
    return Math.ceil(bytes / 4);
}
function percentile(values, quantile) {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
    return sorted[index] ?? 0;
}
function benchmarkModes() {
    return ["native-baseline-proxy", "pre-hardening-freeflow-proxy", "improved-freeflow-router"];
}
function skippedObservation(toolPathUsed, reason) {
    return {
        toolPathUsed,
        rawBytes: 0,
        routedBytes: 0,
        excerpt: "",
        recovery: { status: "skipped", detail: reason },
        skipped: true,
        skipReason: reason,
    };
}
function normalizeRelativePath(path) {
    return path.split(/[/\\]+/).filter(Boolean).join("/");
}
function escapeTable(value) {
    return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function defaultReportPath() {
    return resolve(process.cwd(), "plugins/freeflow/evals/reports/runtime/output-router-benchmark-1-report.md");
}
function parseCliArgs(argv) {
    let iterations;
    let reportPath = defaultReportPath();
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
    }
    return iterations === undefined ? { reportPath } : { iterations, reportPath };
}
async function runCli() {
    const { iterations, reportPath } = parseCliArgs(process.argv.slice(2));
    const options = {};
    if (iterations !== undefined) {
        options.iterations = iterations;
    }
    const report = await runRouterBenchmarks(options);
    await writeRouterBenchmarkReport(report, reportPath);
    const shortId = createHash("sha256").update(JSON.stringify(report.summary)).digest("hex").slice(0, 8);
    console.log(`Freeflow router benchmark ${shortId}: improved ${report.summary.improved.passed}/${report.summary.fixtures} pass`);
    console.log(`Report: ${reportPath}`);
    if (report.summary.improved.failed > 0) {
        process.exitCode = 1;
    }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    await runCli();
}
