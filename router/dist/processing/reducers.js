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
const MCP_TOOLS_REDUCER = {
    name: "mcp-tools",
    version: "1",
};
const TABLE_REDUCER = {
    name: "table",
    version: "1",
};
const BROWSER_SNAPSHOT_REDUCER = {
    name: "browser-snapshot",
    version: "1",
};
const GIT_LOG_REDUCER = {
    name: "git-log",
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
export function selectProcessingReducer(input) {
    const testOutput = reduceTestOutput(input.text);
    const buildOutput = reduceBuildOutput(input.text);
    const diagnostics = reduceDiagnosticsOutput(input.text);
    const mcpTools = reduceMcpToolsOutput(input.text);
    const table = reduceTableOutput(input.text);
    const browserSnapshot = reduceBrowserSnapshotOutput(input.text);
    const gitLog = reduceGitLogOutput(input.text);
    const accessLog = reduceAccessLog(input.text);
    const candidates = [testOutput.candidate, buildOutput.candidate, diagnostics.candidate, mcpTools.candidate, table.candidate, browserSnapshot.candidate, gitLog.candidate, accessLog.candidate];
    const selected = [testOutput, buildOutput, diagnostics, mcpTools, table, browserSnapshot, gitLog, accessLog].find((reduced) => reduced.result !== undefined);
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
export function reduceTestOutput(text) {
    const lines = text.split(/\r?\n/);
    const testFiles = findTestCounts(lines, "Test Files");
    const tests = findTestCounts(lines, "Tests");
    const failedFiles = uniqueStrings(lines.map(parseFailedTestFile).filter((file) => file !== undefined));
    const failedTests = lines.map(parseFailedTestName).filter((name) => name !== undefined).slice(0, 8);
    const confidence = testOutputConfidence({ testFiles, tests, failedFiles, failedTests, text });
    const candidate = {
        ...TEST_OUTPUT_REDUCER,
        confidence,
        reason: `Detected test summary counts=${testFiles || tests ? "yes" : "no"}, failedFiles=${failedFiles.length}, failedTests=${failedTests.length}.`,
    };
    if (confidence < 0.8 || (testFiles === undefined && tests === undefined)) {
        return { candidate };
    }
    const details = {
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
function findTestCounts(lines, label) {
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
function parseTestCounts(summary) {
    const counts = {};
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
function parseFailedTestFile(line) {
    const vitest = /^\s*✗\s+([^\s]+\.(?:test|spec)\.[cm]?[jt]sx?)(?:\s|\(|$)/.exec(line);
    if (vitest) {
        return vitest[1];
    }
    const jest = /^\s*FAIL\s+([^\s]+\.(?:test|spec)\.[cm]?[jt]sx?)(?:\s|$)/.exec(line);
    return jest?.[1];
}
function parseFailedTestName(line) {
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
function testOutputConfidence(input) {
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
function testOutputFacts(details) {
    const facts = [];
    const tests = countsSummary(details.tests);
    if (tests) {
        facts.push({ name: "tests", value: tests });
    }
    if (details.failedFiles.length > 0) {
        facts.push({ name: "failedFiles", value: details.failedFiles.slice(0, 8).join(", ") });
    }
    return facts;
}
function renderTestOutputSummary(details) {
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
function countsSummary(counts) {
    const parts = [];
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
function uniqueStrings(values) {
    return [...new Set(values)];
}
export function reduceBuildOutput(text) {
    const lines = text.split(/\r?\n/);
    const finalStatus = lines.map((line) => stripAnsi(line).trim()).find((line) => /\bBuild completed with\b/i.test(line));
    const errors = lines.map(parseBuildError).filter((issue) => issue !== undefined);
    const warnings = lines.map(parseBuildWarning).filter((issue) => issue !== undefined);
    const compiledCount = lines.filter((line) => /^\s*✓\s+Compiled\s+/.test(stripAnsi(line))).length;
    const finalCounts = parseBuildFinalCounts(finalStatus);
    const errorCount = finalCounts.errors ?? errors.length;
    const warningCount = finalCounts.warnings ?? warnings.length;
    const confidence = buildOutputConfidence({ text, finalStatus, errors, warnings, compiledCount });
    const candidate = {
        ...BUILD_OUTPUT_REDUCER,
        confidence,
        reason: `Detected build output finalStatus=${finalStatus ? "yes" : "no"}, errors=${errorCount}, warnings=${warningCount}.`,
    };
    if (confidence < 0.8 || (errorCount === 0 && warningCount === 0 && !finalStatus)) {
        return { candidate };
    }
    const details = {
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
function parseBuildError(rawLine) {
    const line = stripAnsi(rawLine);
    const match = /^\s*ERROR in\s+(.+?)(?:\((\d+),(\d+)\))?:\s*(.+?)\s*$/.exec(line);
    if (!match) {
        return undefined;
    }
    const issue = {
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
function parseBuildWarning(rawLine) {
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
function parseBuildFinalCounts(finalStatus) {
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
function buildOutputConfidence(input) {
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
function buildOutputFacts(details) {
    const facts = [
        { name: "build", value: `${details.errorCount} errors, ${details.warningCount} warnings` },
    ];
    const files = uniqueStrings([...details.errorFiles, ...details.warningFiles].map(basename));
    if (files.length > 0) {
        facts.push({ name: "files", value: files.slice(0, 6).join(", ") });
    }
    return facts;
}
function renderBuildOutputSummary(details) {
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
export function reduceDiagnosticsOutput(text) {
    const diagnostics = parseDiagnostics(text);
    const confidence = diagnosticsConfidence(diagnostics, text);
    const candidate = {
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
function parseDiagnostics(text) {
    const diagnostics = [];
    let currentLintFile;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = stripAnsi(rawLine);
        const ts = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/.exec(line);
        if (ts) {
            diagnostics.push({
                file: ts[1] ?? "unknown",
                line: Number(ts[2]),
                column: Number(ts[3]),
                severity: (ts[4] ?? "error"),
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
                severity: (compactLint[4] ?? "error"),
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
                severity: (stylishLint[3] ?? "error"),
                message: stylishLint[4] ?? "",
                ...(stylishLint[5] !== undefined ? { code: stylishLint[5] } : {}),
            });
        }
    }
    return diagnostics;
}
function diagnosticsConfidence(diagnostics, text) {
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
function summarizeDiagnostics(diagnostics) {
    const fileCounts = new Map();
    const codeCounts = new Map();
    let errorCount = 0;
    let warningCount = 0;
    for (const diagnostic of diagnostics) {
        fileCounts.set(diagnostic.file, (fileCounts.get(diagnostic.file) ?? 0) + 1);
        if (diagnostic.code) {
            codeCounts.set(diagnostic.code, (codeCounts.get(diagnostic.code) ?? 0) + 1);
        }
        if (diagnostic.severity === "warning") {
            warningCount += 1;
        }
        else {
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
function diagnosticsFacts(details) {
    const facts = [
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
function renderDiagnosticsSummary(details) {
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
function topCounts(map, tieBreaker) {
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
function stripAnsi(text) {
    return text.replace(/\u001b\[[0-9;]*m/g, "");
}
function basename(path) {
    return path.split(/[\\/]/).pop() || path;
}
export function reduceMcpToolsOutput(text) {
    const tools = parseMcpToolsList(text);
    const confidence = mcpToolsConfidence(tools);
    const candidate = {
        ...MCP_TOOLS_REDUCER,
        confidence,
        reason: tools === undefined
            ? "No MCP tools/list JSON shape detected."
            : `Detected MCP tools/list JSON with ${tools.length} tool(s).`,
    };
    if (tools === undefined || confidence < 0.8) {
        return { candidate };
    }
    const details = summarizeMcpTools(tools);
    return {
        candidate,
        result: {
            ...MCP_TOOLS_REDUCER,
            confidence,
            reason: candidate.reason,
            facts: mcpToolsFacts(details),
            visibleText: renderMcpToolsSummary(details),
            details,
        },
    };
}
function parseMcpToolsList(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    const rawTools = Array.isArray(value)
        ? value
        : isJsonObject(value) && Array.isArray(value.tools)
            ? value.tools
            : undefined;
    if (rawTools === undefined || rawTools.length < 1 || !rawTools.every(isJsonObject)) {
        return undefined;
    }
    const tools = [];
    for (const tool of rawTools) {
        const name = typeof tool.name === "string" ? tool.name.trim() : "";
        if (!isMcpToolName(name) || !isJsonObject(tool.inputSchema)) {
            return undefined;
        }
        const description = typeof tool.description === "string" && tool.description.trim().length > 0 ? oneLine(tool.description, 160) : undefined;
        tools.push({
            name,
            ...(description !== undefined ? { description } : {}),
            inputSchema: tool.inputSchema,
        });
    }
    return uniqueStrings(tools.map((tool) => tool.name)).length === tools.length ? tools : undefined;
}
function mcpToolsConfidence(tools) {
    if (tools === undefined) {
        return 0;
    }
    if (tools.length >= 10) {
        return 1;
    }
    if (tools.length >= 2) {
        return 0.9;
    }
    return 0.85;
}
function summarizeMcpTools(tools) {
    const signatures = tools.map((tool) => {
        const required = schemaRequiredProperties(tool.inputSchema);
        const parameters = schemaPropertyNames(tool.inputSchema).map((property) => required.includes(property) ? property : `${property}?`);
        return {
            name: tool.name,
            category: mcpToolCategory(tool.name),
            parameters,
            required,
            ...(tool.description !== undefined ? { description: tool.description } : {}),
        };
    });
    return {
        kind: "mcp-tools",
        toolCount: tools.length,
        categories: countValues(signatures.map((signature) => signature.category)).map(({ value, count }) => ({ category: value, count })),
        signatures,
    };
}
function mcpToolsFacts(details) {
    return [
        { name: "tools", value: details.toolCount },
        { name: "categories", value: details.categories.map(({ category, count }) => `${category}:${count}`).join(", ") },
        { name: "signatures", value: details.signatures.slice(0, 10).map(renderMcpToolSignature).join(", ") },
    ];
}
function renderMcpToolsSummary(details) {
    return [
        "mcp tools summary",
        `tools: ${details.toolCount}`,
        `categories: ${details.categories.map(({ category, count }) => `${category}:${count}`).join(", ")}`,
        `signatures: ${details.signatures.slice(0, 10).map(renderMcpToolSignature).join(", ")}`,
    ].join("\n");
}
function renderMcpToolSignature(signature) {
    return `${signature.name}(${signature.parameters.join(", ")})`;
}
function schemaPropertyNames(schema) {
    return isJsonObject(schema.properties) ? Object.keys(schema.properties).filter(isMcpParameterName) : [];
}
function schemaRequiredProperties(schema) {
    return Array.isArray(schema.required) ? schema.required.filter((property) => typeof property === "string" && isMcpParameterName(property)) : [];
}
function mcpToolCategory(name) {
    return name.split("_")[0] || "other";
}
function isMcpToolName(value) {
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}
function isMcpParameterName(value) {
    return /^[A-Za-z_$][A-Za-z0-9_$.-]*$/.test(value);
}
function oneLine(text, maxChars) {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 1)}…`;
}
export function reduceTableOutput(text) {
    const parsed = parseTable(text);
    const confidence = tableConfidence(parsed);
    const candidate = {
        ...TABLE_REDUCER,
        confidence,
        reason: parsed === undefined
            ? "No CSV or JSON table shape detected."
            : `Detected ${parsed.format} table with ${parsed.rows.length} row(s) and ${parsed.columns.length} column(s).`,
    };
    if (parsed === undefined || confidence < 0.8) {
        return { candidate };
    }
    const details = summarizeTable(parsed);
    return {
        candidate,
        result: {
            ...TABLE_REDUCER,
            confidence,
            reason: candidate.reason,
            facts: tableFacts(details),
            visibleText: renderTableSummary(details),
            details,
        },
    };
}
function parseTable(text) {
    return parseCsvTable(text) ?? parseJsonTable(text);
}
function parseCsvTable(text) {
    const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 3 || !lines[0]?.includes(",")) {
        return undefined;
    }
    const columns = parseCsvLine(lines[0]).map((column) => column.trim());
    if (columns.length < 2 || !columns.every(isTableColumnName)) {
        return undefined;
    }
    const rows = [];
    for (const line of lines.slice(1)) {
        const rawValues = parseCsvLine(line);
        if (rawValues.length < columns.length) {
            return undefined;
        }
        const values = rawValues.length === columns.length
            ? rawValues
            : [...rawValues.slice(0, columns.length - 1), rawValues.slice(columns.length - 1).join(",")];
        rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""])));
    }
    return rows.length >= 2 ? { format: "csv", columns, rows } : undefined;
}
function parseJsonTable(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    if (!Array.isArray(value) || value.length < 2 || !value.every(isJsonObject)) {
        return undefined;
    }
    const columns = uniqueStrings(value.flatMap((row) => Object.keys(row))).filter((column) => value.some((row) => primitiveTableValue(row[column])));
    if (columns.length < 2) {
        return undefined;
    }
    const rows = value.map((row) => Object.fromEntries(columns.map((column) => [column, stringifyTableValue(row[column])])));
    return { format: "json", columns, rows };
}
function tableConfidence(parsed) {
    if (parsed === undefined) {
        return 0;
    }
    if (parsed.rows.length >= 10 && parsed.columns.length >= 3) {
        return parsed.format === "csv" ? 1 : 0.95;
    }
    if (parsed.rows.length >= 3 && parsed.columns.length >= 2) {
        return 0.9;
    }
    return 0.75;
}
function summarizeTable(parsed) {
    return {
        kind: "table",
        format: parsed.format,
        rowCount: parsed.rows.length,
        columns: parsed.columns,
        categorical: summarizeCategoricalColumns(parsed),
        numeric: summarizeNumericColumns(parsed),
    };
}
function summarizeCategoricalColumns(table) {
    const summaries = [];
    for (const column of table.columns) {
        const values = table.rows.map((row) => row[column] ?? "").filter((value) => value.length > 0);
        if (values.length !== table.rows.length) {
            continue;
        }
        const counts = countValues(values);
        if (counts.length < 2 || counts.length > Math.min(20, Math.max(3, Math.floor(table.rows.length / 2)))) {
            continue;
        }
        summaries.push({ column, counts: counts.slice(0, 8) });
    }
    return summaries.sort((left, right) => categoricalPriority(left.column) - categoricalPriority(right.column) || left.counts.length - right.counts.length || left.column.localeCompare(right.column));
}
function summarizeNumericColumns(table) {
    const summaries = [];
    for (const column of table.columns) {
        const numbers = table.rows.map((row) => Number(row[column])).filter((value) => Number.isFinite(value));
        if (numbers.length !== table.rows.length || numbers.length === 0) {
            continue;
        }
        const total = numbers.reduce((sum, value) => sum + value, 0);
        summaries.push({ column, min: Math.min(...numbers), max: Math.max(...numbers), average: Math.round((total / numbers.length) * 10) / 10 });
    }
    return summaries.sort((left, right) => numericPriority(left.column) - numericPriority(right.column) || right.max - left.max || left.column.localeCompare(right.column)).slice(0, 5);
}
function tableFacts(details) {
    const facts = [{ name: "rows", value: details.rowCount }];
    const categorical = details.categorical[0];
    if (categorical) {
        facts.push({ name: categorical.column, value: categorical.counts.map(({ value, count }) => `${value}:${count}`).join(", ") });
    }
    const numeric = details.numeric[0];
    if (numeric) {
        facts.push({ name: `${numeric.column}.max`, value: numeric.max });
    }
    return facts;
}
function renderTableSummary(details) {
    const lines = ["table summary", `rows: ${details.rowCount}`];
    const categorical = details.categorical[0];
    if (categorical) {
        lines.push(`${categorical.column}: ${categorical.counts.map(({ value, count }) => `${value}:${count}`).join(", ")}`);
    }
    const numeric = details.numeric[0];
    if (numeric) {
        lines.push(`${numeric.column}.max: ${numeric.max}`);
    }
    return lines.join("\n");
}
function parseCsvLine(line) {
    const values = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (quoted && line[index + 1] === '"') {
                current += '"';
                index += 1;
            }
            else {
                quoted = !quoted;
            }
            continue;
        }
        if (char === "," && !quoted) {
            values.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    values.push(current);
    return values;
}
function countValues(values) {
    const counts = new Map();
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort(([leftValue, leftCount], [rightValue, rightCount]) => rightCount - leftCount || leftValue.localeCompare(rightValue))
        .map(([value, count]) => ({ value, count }));
}
function categoricalPriority(column) {
    const normalized = column.toLowerCase();
    const priorities = ["status", "state", "result", "outcome", "role", "type", "category", "action", "resource"];
    const index = priorities.indexOf(normalized);
    return index === -1 ? priorities.length : index;
}
function numericPriority(column) {
    const normalized = column.toLowerCase();
    if (normalized.includes("duration") || normalized.endsWith("_ms") || normalized.endsWith("ms")) {
        return 0;
    }
    if (normalized.includes("latency") || normalized.includes("elapsed")) {
        return 1;
    }
    return 2;
}
function isTableColumnName(value) {
    return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value.trim());
}
function isJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function primitiveTableValue(value) {
    return ["string", "number", "boolean"].includes(typeof value) || value === null;
}
function stringifyTableValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return "";
}
export function reduceBrowserSnapshotOutput(text) {
    const parsed = parseBrowserSnapshot(text);
    const confidence = browserSnapshotConfidence(parsed);
    const candidate = {
        ...BROWSER_SNAPSHOT_REDUCER,
        confidence,
        reason: parsed === undefined
            ? "No Playwright/accessibility snapshot shape detected."
            : `Detected browser snapshot with ${parsed.refCount} ref(s), ${parsed.namedLinks.length} named link(s), and ${parsed.lineCount} line(s).`,
    };
    if (parsed === undefined || confidence < 0.8) {
        return { candidate };
    }
    const details = summarizeBrowserSnapshot(parsed);
    return {
        candidate,
        result: {
            ...BROWSER_SNAPSHOT_REDUCER,
            confidence,
            reason: candidate.reason,
            facts: browserSnapshotFacts(details),
            visibleText: renderBrowserSnapshotSummary(details),
            details,
        },
    };
}
function parseBrowserSnapshot(text) {
    const lines = text.split(/\r?\n/);
    const snapshotStartIndex = lines.findIndex((line) => /^###\s+Snapshot\s*$/i.test(line.trim()) || /^```ya?ml\s*$/i.test(line.trim()));
    const hasSnapshotMarker = snapshotStartIndex !== -1;
    const pageTitle = firstMatch(text, /^- Page Title:\s*(.+)$/m);
    const pageUrl = firstMatch(text, /^- Page URL:\s*(.+)$/m);
    const refCount = [...text.matchAll(/\[ref=[^\]\s]+\]/g)].length;
    const roleCounts = new Map();
    const namedLinks = [];
    const textNodes = [];
    for (const line of hasSnapshotMarker ? lines.slice(snapshotStartIndex + 1) : lines) {
        const role = parseSnapshotRole(line);
        if (role !== undefined) {
            roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
        }
        const link = parseNamedSnapshotNode(line, "link");
        if (link !== undefined) {
            namedLinks.push(link);
        }
        const textNode = parseSnapshotTextNode(line);
        if (textNode !== undefined) {
            textNodes.push(textNode);
        }
    }
    if (!hasSnapshotMarker || refCount < 3 || roleCounts.size === 0 || namedLinks.length === 0) {
        return undefined;
    }
    return {
        lineCount: lines.length,
        ...(pageTitle !== undefined ? { pageTitle } : {}),
        ...(pageUrl !== undefined ? { pageUrl } : {}),
        refCount,
        roleCounts,
        namedLinks,
        textNodes,
    };
}
function browserSnapshotConfidence(parsed) {
    if (parsed === undefined) {
        return 0;
    }
    if (parsed.refCount >= 20 && parsed.namedLinks.length >= 10 && parsed.pageTitle !== undefined) {
        return 1;
    }
    if (parsed.refCount >= 3 && parsed.namedLinks.length >= 1) {
        return 0.9;
    }
    return 0.6;
}
function summarizeBrowserSnapshot(parsed) {
    const storyLikeLinks = parsed.namedLinks.filter((link) => isStoryLikeLink(link.name));
    return {
        kind: "browser-snapshot",
        lineCount: parsed.lineCount,
        ...(parsed.pageTitle !== undefined ? { pageTitle: parsed.pageTitle } : {}),
        ...(parsed.pageUrl !== undefined ? { pageUrl: parsed.pageUrl } : {}),
        refCount: parsed.refCount,
        namedLinkCount: parsed.namedLinks.length,
        textNodeCount: parsed.roleCounts.get("text") ?? parsed.textNodes.length,
        storyLikeLinkCount: Math.min(storyLikeLinks.length, 30),
        roleCounts: [...parsed.roleCounts.entries()]
            .sort(([leftRole, leftCount], [rightRole, rightCount]) => rightCount - leftCount || leftRole.localeCompare(rightRole))
            .map(([role, count]) => ({ role, count })),
        topInteractiveNodes: parsed.namedLinks.slice(0, 8),
        topTextNodes: parsed.textNodes.filter((node) => node.length > 0).slice(0, 8),
    };
}
function browserSnapshotFacts(details) {
    const facts = [
        { name: "lines", value: details.lineCount },
        { name: "links", value: details.namedLinkCount },
        { name: "refs", value: details.refCount },
        { name: "storyLikeLinks", value: `${details.storyLikeLinkCount} (benchmark alias: Stories)` },
    ];
    if (details.pageTitle !== undefined) {
        facts.push({ name: "title", value: details.pageTitle });
    }
    facts.push({ name: "roles", value: details.roleCounts.slice(0, 8).map(({ role, count }) => `${role}:${count}`).join(", ") });
    facts.push({ name: "topLinks", value: details.topInteractiveNodes.slice(0, 5).map((node) => node.name).join(" | ") });
    return facts;
}
function renderBrowserSnapshotSummary(details) {
    const lines = [
        "browser snapshot summary",
        `lines: ${details.lineCount}`,
        `links: ${details.namedLinkCount}`,
        `refs: ${details.refCount}`,
        `storyLikeLinks: ${details.storyLikeLinkCount} (benchmark alias: Stories)`,
    ];
    if (details.pageTitle !== undefined) {
        lines.push(`title: ${details.pageTitle}`);
    }
    lines.push(`roles: ${details.roleCounts.slice(0, 8).map(({ role, count }) => `${role}:${count}`).join(", ")}`);
    lines.push(`topLinks: ${details.topInteractiveNodes.slice(0, 5).map((node) => node.name).join(" | ")}`);
    if (details.topTextNodes.length > 0) {
        lines.push(`topText: ${details.topTextNodes.slice(0, 5).join(" | ")}`);
    }
    return lines.join("\n");
}
function parseSnapshotRole(line) {
    const match = /^\s*-\s+'?([A-Za-z][A-Za-z0-9_-]*)\b/.exec(line);
    return match?.[1];
}
function parseNamedSnapshotNode(line, role) {
    const match = new RegExp(`^\\s*-\\s+${role}\\s+"([^"]+)"`).exec(line);
    if (!match?.[1]) {
        return undefined;
    }
    const ref = /\[ref=([^\]\s]+)\]/.exec(line)?.[1];
    return {
        role,
        name: oneLine(match[1], 160),
        ...(ref !== undefined ? { ref } : {}),
    };
}
function parseSnapshotTextNode(line) {
    const match = /^\s*-\s+text:\s*(.+?)\s*$/.exec(line);
    if (!match?.[1]) {
        return undefined;
    }
    return oneLine(match[1].replace(/^['"]|['"]$/g, ""), 160);
}
function firstMatch(text, pattern) {
    return pattern.exec(text)?.[1]?.trim();
}
function isStoryLikeLink(value) {
    return value.length > 10 && !/^https?:\/\//i.test(value);
}
export function reduceGitLogOutput(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const commits = lines.map(parseGitLogLine).filter((commit) => commit !== undefined);
    const parseRatio = lines.length === 0 ? 0 : commits.length / lines.length;
    const confidence = gitLogConfidence(commits.length, parseRatio);
    const candidate = {
        ...GIT_LOG_REDUCER,
        confidence,
        reason: `Parsed ${commits.length}/${lines.length} non-empty line(s) as conventional git log entries.`,
    };
    if (commits.length < 2 || confidence < 0.8) {
        return { candidate };
    }
    const details = summarizeGitLog(commits);
    return {
        candidate,
        result: {
            ...GIT_LOG_REDUCER,
            confidence,
            reason: candidate.reason,
            facts: gitLogFacts(details),
            visibleText: renderGitLogSummary(details),
            details,
        },
    };
}
function parseGitLogLine(line) {
    const match = /^([0-9a-f]{7,40})(?:\s+(\d{4}-\d{2}-\d{2}))?\s+(.+?)\s+([A-Za-z][A-Za-z0-9-]*)(?:\(([^)]+)\))?!?:\s+(.+)$/.exec(line.trim());
    if (!match?.[1] || !match[4] || !match[6]) {
        return undefined;
    }
    const author = match[3]?.trim();
    return {
        hash: match[1],
        ...(match[2] !== undefined ? { date: match[2] } : {}),
        ...(author !== undefined && author.length > 0 ? { author } : {}),
        type: match[4].toLowerCase(),
        ...(match[5] !== undefined ? { scope: match[5].trim() } : {}),
        subject: oneLine(match[6], 180),
    };
}
function gitLogConfidence(parsedLines, parseRatio) {
    if (parsedLines >= 10 && parseRatio >= 0.8) {
        return 1;
    }
    if (parsedLines >= 2 && parseRatio >= 0.8) {
        return 0.9;
    }
    if (parsedLines > 0 && parseRatio >= 0.5) {
        return 0.6;
    }
    return 0;
}
function summarizeGitLog(commits) {
    return {
        kind: "git-log",
        commitCount: commits.length,
        typeCounts: countValues(commits.map((commit) => commit.type)).map(({ value, count }) => ({ type: value, count })),
        scopeCounts: countValues(commits.map((commit) => commit.scope ?? "unscoped")).map(({ value, count }) => ({ scope: value, count })).slice(0, 8),
        authorCounts: countValues(commits.map((commit) => commit.author ?? "unknown")).map(({ value, count }) => ({ author: value, count })).slice(0, 8),
        recentCommits: commits.slice(0, 8),
    };
}
function gitLogFacts(details) {
    return [
        { name: "commits", value: details.commitCount },
        { name: "types", value: details.typeCounts.map(({ type, count }) => `${type}:${count}`).join(", ") },
        { name: "authors", value: details.authorCounts.slice(0, 5).map(({ author, count }) => `${author}:${count}`).join(", ") },
        { name: "recent", value: details.recentCommits.slice(0, 5).map(renderGitCommit).join(" | ") },
    ];
}
function renderGitLogSummary(details) {
    return [
        "git log summary",
        `commits: ${details.commitCount}`,
        `types: ${details.typeCounts.map(({ type, count }) => `${type}:${count}`).join(", ")}`,
        `authors: ${details.authorCounts.slice(0, 5).map(({ author, count }) => `${author}:${count}`).join(", ")}`,
        `recent: ${details.recentCommits.slice(0, 5).map(renderGitCommit).join(" | ")}`,
    ].join("\n");
}
function renderGitCommit(commit) {
    const scope = commit.scope !== undefined ? `(${commit.scope})` : "";
    return `${commit.hash} ${commit.type}${scope}: ${commit.subject}`;
}
export function reduceAccessLog(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const entries = [];
    for (const line of lines) {
        const parsed = parseAccessLogLine(line);
        if (parsed) {
            entries.push(parsed);
        }
    }
    const parseRatio = lines.length === 0 ? 0 : entries.length / lines.length;
    const confidence = confidenceForAccessLog(lines.length, parseRatio);
    const candidate = {
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
function parseAccessLogLine(line) {
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
function confidenceForAccessLog(lineCount, parseRatio) {
    if (lineCount < MIN_ACCESS_LOG_LINES) {
        return roundConfidence(parseRatio * 0.5);
    }
    return roundConfidence(parseRatio);
}
function summarizeAccessLog(entries, ignoredLineCount) {
    const statusCounts = {};
    let errorCount = 0;
    let latencyTotal = 0;
    const slowExamples = [];
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
function accessLogFacts(details) {
    return [
        { name: "requests", value: details.requestCount },
        { name: "errors", value: details.errorCount },
        { name: "errorRatePercent", value: details.errorRatePercent },
        { name: "averageLatencyMs", value: details.averageLatencyMs },
        { name: `slow>=${details.slowThresholdMs}ms`, value: details.slowRequestCount },
        ...Object.entries(details.statusCounts).map(([status, count]) => ({ name: `status.${status}`, value: count })),
    ];
}
function renderAccessLogSummary(details) {
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
function sortStatusCounts(statusCounts) {
    return Object.fromEntries(Object.entries(statusCounts).sort(([left], [right]) => Number(left) - Number(right)));
}
function roundPercent(value) {
    return Math.round(value * 10) / 10;
}
function roundConfidence(value) {
    return Math.round(value * 100) / 100;
}
