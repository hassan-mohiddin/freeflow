const TEST_OUTPUT_REDUCER = {
    name: "test-output",
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
    const accessLog = reduceAccessLog(input.text);
    const candidates = [testOutput.candidate, accessLog.candidate];
    const selected = [testOutput, accessLog].find((reduced) => reduced.result !== undefined);
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
