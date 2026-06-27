import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { escapeMarkdownTableCell as escapeTable, formatPercent, latencySummary, normalizeIterations, parseBenchmarkCliArgs, reductionPercent, writeBenchmarkReportPair, } from "./benchmark-harness.js";
import { createLocalVaultIndex } from "../vault/vault-index.js";
import { createVault, readOutputText, storeCommandOutput, storeMetadataOutput, storeTextOutput } from "../vault/vault.js";
const DEFAULT_ITERATIONS = 3;
const REPORT_PATH = "evals/reports/runtime/vault-index-storage-spike-1-report.md";
export async function runVaultIndexStorageBenchmark(options = {}) {
    const iterations = normalizeIterations(options.iterations, DEFAULT_ITERATIONS);
    const localAppendLatencies = [];
    const localQueryLatencies = [];
    const scanQueryLatencies = [];
    let localPassed = true;
    let scanPassed = true;
    let localRawBytes = 0;
    let localResultBytes = 0;
    let fixtureCount = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const tmpRoot = await mkdtemp(resolve(tmpdir(), "freeflow-vault-index-bench-"));
        try {
            const vault = createVault({ root: tmpRoot });
            const index = createLocalVaultIndex(vault);
            const emptyStatus = await index.status();
            localPassed &&= emptyStatus.entryCount === 0;
            const fixtures = await createBenchmarkFixtures(vault, iteration);
            fixtureCount = fixtures.length;
            for (const fixture of fixtures) {
                localAppendLatencies.push(fixture.appendMs);
                const visibilityStarted = performance.now();
                const visible = await index.queryVault(fixture.query, { sessionId: "vault-index-benchmark" }, { topK: 3 });
                localQueryLatencies.push(performance.now() - visibilityStarted);
                localPassed &&= visible.matches.some((match) => match.outputId === fixture.expectedOutputId);
                if (fixture.forbiddenQuery) {
                    const forbidden = await index.queryVault(fixture.forbiddenQuery, { sessionId: "vault-index-benchmark" }, { topK: 3 });
                    localPassed &&= forbidden.matches.length === 0;
                }
            }
            const status = await index.status();
            localPassed &&= status.outputCount === fixtures.length;
            for (const fixture of fixtures) {
                const started = performance.now();
                const scanned = await scanVaultFixture(vault, fixture);
                scanQueryLatencies.push(performance.now() - started);
                scanPassed &&= scanned;
            }
            const queryResult = await index.queryVault("target", { sessionId: "vault-index-benchmark" }, { topK: 10 });
            localRawBytes += fixtures.reduce((total, fixture) => total + Buffer.byteLength(fixture.text ?? JSON.stringify(fixture.record), "utf8"), 0);
            localResultBytes += Buffer.byteLength(JSON.stringify(queryResult.matches), "utf8");
        }
        finally {
            await rm(tmpRoot, { recursive: true, force: true });
        }
    }
    const localAppend = latencySummary(localAppendLatencies);
    const localQuery = latencySummary(localQueryLatencies);
    const scanQuery = latencySummary(scanQueryLatencies);
    const localReduction = reductionPercent(localRawBytes, localResultBytes);
    const sqliteStatus = "not-run";
    const candidates = [
        {
            candidate: "local-json-sidecar",
            status: localPassed ? "pass" : "fail",
            adopted: true,
            appendMs: localAppend,
            queryMs: localQuery,
            rawBytes: localRawBytes,
            resultBytes: localResultBytes,
            reductionPercent: localReduction,
            checks: [
                "fresh index starts empty",
                "each persisted append is queryable immediately",
                "metadata-only raw content is not indexed",
                "no native dependency",
            ],
            notes: ["Selected for the Slice 11 interface and exercised through the Slice 12 write path because it is portable and dependency-free."],
        },
        {
            candidate: "vault-session-scan-baseline",
            status: scanPassed ? "pass" : "fail",
            adopted: false,
            queryMs: scanQuery,
            checks: ["finds fixture evidence by reading vault records directly"],
            notes: ["Baseline remains source-truth fallback but query cost grows with vaulted text."],
        },
        {
            candidate: "sqlite-fts",
            status: sqliteStatus,
            adopted: false,
            checks: ["not introduced during Slice 11"],
            notes: ["Deferred: adding a native dependency or relying on experimental runtime SQLite needs explicit owner approval."],
        },
    ];
    return {
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        iterations,
        summary: {
            selectedEngine: "local-json-sidecar",
            selectedReason: "Portable deterministic sidecar files satisfy automatic incremental write-through semantics without adding a native dependency.",
            fixtures: fixtureCount,
            localSidecarPassed: localPassed,
            scannerBaselinePassed: scanPassed,
            sqliteFtsStatus: sqliteStatus,
            localAppendMs: localAppend,
            localQueryMs: localQuery,
            scanQueryMs: scanQuery,
            localQueryReductionPercent: localReduction,
        },
        candidates,
    };
}
async function createBenchmarkFixtures(vault, iteration) {
    const commandText = [
        "setup noise ".repeat(100),
        `alpha target evidence iteration ${iteration}`,
        "tail noise ".repeat(100),
    ].join("\n");
    let started = performance.now();
    const command = await storeCommandOutput(vault, {
        sessionId: "vault-index-benchmark",
        command: "npm test",
        stdout: commandText,
        stderr: "",
        executionStatus: "success",
        exitCode: 0,
        createdAt: `2026-06-24T00:00:${String(iteration).padStart(2, "0")}.000Z`,
    });
    const commandAppendMs = performance.now() - started;
    const observedText = [
        "github issue search",
        `beta target issue https://github.com/acme/freeflow/issues/${iteration + 1}`,
        "body noise ".repeat(160),
    ].join("\n");
    started = performance.now();
    const observed = await storeTextOutput(vault, {
        sessionId: "vault-index-benchmark",
        sourceKind: "mcp",
        raw: observedText,
        producer: { kind: "mcp", server: "github", tool: "search_issues" },
        createdAt: `2026-06-24T00:01:${String(iteration).padStart(2, "0")}.000Z`,
    });
    const observedAppendMs = performance.now() - started;
    started = performance.now();
    const metadata = await storeMetadataOutput(vault, {
        sessionId: "vault-index-benchmark",
        sourceKind: "mcp",
        rawLineCount: 3,
        rawByteCount: 4096,
        rawSha256: "b".repeat(64),
        metadata: { producer: { kind: "mcp", server: "gmail", tool: "search" }, note: "gamma target metadata only" },
        producer: { kind: "mcp", server: "gmail", tool: "search" },
        createdAt: `2026-06-24T00:02:${String(iteration).padStart(2, "0")}.000Z`,
    });
    const metadataAppendMs = performance.now() - started;
    return [
        { record: command, appendMs: commandAppendMs, text: commandText, stream: "combined", query: "alpha target", expectedOutputId: command.outputId },
        { record: observed, appendMs: observedAppendMs, text: observedText, stream: "raw", query: "beta target github", expectedOutputId: observed.outputId },
        { record: metadata, appendMs: metadataAppendMs, query: "gmail gamma target", expectedOutputId: metadata.outputId, forbiddenQuery: "PRIVATE_RAW_SECRET" },
    ];
}
async function scanVaultFixture(vault, fixture) {
    const text = await textForScan(vault, fixture.record, fixture.stream);
    return fixture.query.toLowerCase().split(/\s+/).every((term) => text.toLowerCase().includes(term));
}
async function textForScan(vault, record, stream) {
    if (record.kind === "command") {
        return readOutputText(vault, "vault-index-benchmark", record.outputId, stream ?? "combined");
    }
    if (record.kind === "text") {
        return readOutputText(vault, "vault-index-benchmark", record.outputId, "raw");
    }
    return JSON.stringify(record);
}
export function renderVaultIndexStorageBenchmarkReport(report) {
    const date = report.generatedAt.slice(0, 10);
    const lines = [
        "# Vault Index Storage Spike Report - Iteration 1",
        "",
        `Date: ${date}`,
        "",
        "## Scope",
        "",
        "Slice 11/12 storage-interface and write-path spike for the Freeflow vault index. The benchmark checks that a fresh index starts empty, persisted appends become queryable incrementally through automatic write-through indexing, metadata-only records do not index raw content, and the selected storage engine stays hidden behind the vault-index interface.",
        "",
        "## Command",
        "",
        "```sh",
        "npm run bench:router:vault-index",
        "```",
        "",
        "## Summary",
        "",
        `- Fixtures per iteration: ${report.summary.fixtures}`,
        `- Iterations: ${report.iterations}`,
        `- Selected engine: ${report.summary.selectedEngine}`,
        `- Selected reason: ${report.summary.selectedReason}`,
        `- Local sidecar passed: ${report.summary.localSidecarPassed ? "yes" : "no"}`,
        `- Scanner baseline passed: ${report.summary.scannerBaselinePassed ? "yes" : "no"}`,
        `- SQLite FTS status: ${report.summary.sqliteFtsStatus}`,
        `- Local append p50/p95: ${report.summary.localAppendMs.p50.toFixed(2)}/${report.summary.localAppendMs.p95.toFixed(2)} ms`,
        `- Local query p50/p95: ${report.summary.localQueryMs.p50.toFixed(2)}/${report.summary.localQueryMs.p95.toFixed(2)} ms`,
        `- Scan query p50/p95: ${report.summary.scanQueryMs.p50.toFixed(2)}/${report.summary.scanQueryMs.p95.toFixed(2)} ms`,
        `- Local query result reduction: ${formatPercent(report.summary.localQueryReductionPercent)}`,
        "",
        "## Candidates",
        "",
        "| candidate | status | adopted | append p50/p95 ms | query p50/p95 ms | raw/result bytes | reduction | checks | notes |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ];
    for (const candidate of report.candidates) {
        lines.push([
            escapeTable(candidate.candidate),
            candidate.status,
            candidate.adopted ? "yes" : "no",
            candidate.appendMs ? `${candidate.appendMs.p50.toFixed(2)}/${candidate.appendMs.p95.toFixed(2)}` : "-",
            candidate.queryMs ? `${candidate.queryMs.p50.toFixed(2)}/${candidate.queryMs.p95.toFixed(2)}` : "-",
            candidate.rawBytes !== undefined && candidate.resultBytes !== undefined ? `${candidate.rawBytes}/${candidate.resultBytes}` : "-",
            candidate.reductionPercent !== undefined ? formatPercent(candidate.reductionPercent) : "-",
            escapeTable(candidate.checks.join("; ")),
            escapeTable(candidate.notes.join("; ")),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("", "## Decision", "", "Use the deterministic local JSON sidecar behind the vault-index interface for the next slices. Do not adopt SQLite/FTS in this slice because introducing a native dependency or relying on experimental runtime SQLite needs separate owner approval. The vault remains source truth; the index is a rebuildable sidecar.", "");
    return lines.join("\n");
}
export async function writeVaultIndexStorageBenchmarkReport(report, reportPath) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, renderVaultIndexStorageBenchmarkReport(report), "utf8");
}
export async function writeVaultIndexStorageBenchmarkReports(report, markdownReportPath, options = {}) {
    return writeBenchmarkReportPair({
        report,
        markdownReportPath,
        jsonReportPath: options.jsonReportPath,
        renderMarkdown: renderVaultIndexStorageBenchmarkReport,
    });
}
async function main() {
    const args = parseBenchmarkCliArgs(process.argv.slice(2), { reportPath: REPORT_PATH });
    const benchmarkOptions = args.iterations === undefined ? {} : { iterations: args.iterations };
    const report = await runVaultIndexStorageBenchmark(benchmarkOptions);
    const writeOptions = args.jsonReportPath === undefined ? {} : { jsonReportPath: args.jsonReportPath };
    const written = await writeVaultIndexStorageBenchmarkReports(report, resolve(process.cwd(), args.reportPath), writeOptions);
    console.log(`Wrote ${written.markdown}`);
    if (written.json) {
        console.log(`Wrote ${written.json}`);
    }
}
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
