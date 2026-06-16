import { createHash } from "node:crypto";
import { createVault, storeCommandOutput } from "./vault.js";
import { DEFAULT_ROUTER_THRESHOLDS } from "./config.js";
export async function freeflowRun(options, runner) {
    const preserve = options.preserve ?? "important";
    const thresholds = { ...DEFAULT_ROUTER_THRESHOLDS, ...options.thresholds };
    const vaultOptions = {};
    if (options.vaultRoot !== undefined) {
        vaultOptions.root = options.vaultRoot;
    }
    if (options.vaultRetention !== undefined) {
        vaultOptions.retention = options.vaultRetention;
    }
    const vault = createVault(vaultOptions);
    let runResult;
    try {
        const runRequest = { command: options.command };
        if (options.cwd !== undefined) {
            runRequest.cwd = options.cwd;
        }
        if (options.timeoutMs !== undefined) {
            runRequest.timeoutMs = options.timeoutMs;
        }
        runResult = await runner.run(runRequest);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            toolStatus: "error",
            decisionId: decisionId("run-error", commandText(options.command), message),
            preserve,
            outputId: "",
            execution: { status: "failed", exitCode: null },
            routing: {
                status: "failed",
                route: "run",
                reason: `Adapter-provided runner failed before command output could be captured: ${message}`,
            },
            recovery: {
                how: "No command output was captured. Retry through the host-approved runner or use the host-native shell tool if direct raw behavior is required.",
            },
        };
    }
    const combined = runResult.combined ?? combineOutputSections(runResult.stdout, runResult.stderr);
    const storeOptions = {
        sessionId: options.sessionId,
        command: options.command,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        combined,
        executionStatus: runResult.executionStatus,
        exitCode: runResult.exitCode,
        decisionIds: [decisionId("run", commandText(options.command), options.sessionId)],
    };
    if (options.cwd !== undefined) {
        Object.assign(storeOptions, { cwd: options.cwd });
    }
    if (runResult.durationMs !== undefined) {
        Object.assign(storeOptions, { durationMs: runResult.durationMs });
    }
    const record = await storeCommandOutput(vault, storeOptions);
    const routeOptions = {
        outputId: record.outputId,
        command: options.command,
        executionStatus: runResult.executionStatus,
        exitCode: runResult.exitCode,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        combined,
        preserve,
        thresholds,
    };
    if (options.goal !== undefined) {
        routeOptions.goal = options.goal;
    }
    const routing = routeCommandOutput(routeOptions);
    const execution = {
        status: runResult.executionStatus,
        exitCode: runResult.exitCode,
    };
    if (runResult.durationMs !== undefined) {
        Object.assign(execution, { durationMs: runResult.durationMs });
    }
    return {
        toolStatus: "ok",
        decisionId: routing.decisionId,
        outputId: record.outputId,
        preserve,
        execution,
        routing: {
            status: routing.routingStatus,
            route: "run",
            reason: routing.reason,
        },
        summary: routing.summary,
        importantLines: routing.importantLines,
        recovery: {
            how: `Use freeflow_retrieve with source.kind=vault and outputId=${record.outputId} to recover exact command output.`,
            outputId: record.outputId,
        },
    };
}
// Keep exactness-sensitive command routing aligned with
// plugins/freeflow/skills/output-router/references/safety-policy.md.
function routeCommandOutput(options) {
    const outputBytes = byteLength(options.combined);
    const outputLines = splitLines(options.combined).length;
    const isLarge = outputBytes > options.thresholds.largeOutputBytes || outputLines > options.thresholds.largeOutputLines;
    const importantLines = selectImportantLines(options);
    const statusText = `executionStatus=${options.executionStatus} exitCode=${options.exitCode}`;
    if (options.executionStatus !== "success") {
        return {
            decisionId: decisionId("run-route", options.outputId, options.executionStatus, "failed"),
            routingStatus: "routed",
            reason: `Command failed or did not complete (${statusText}); exact failure evidence was returned and raw output was vaulted before routing.`,
            summary: `Command ${options.executionStatus} with exitCode=${options.exitCode}.`,
            importantLines,
        };
    }
    if (isLarge) {
        return {
            decisionId: decisionId("run-route", options.outputId, "large-success"),
            routingStatus: "partial",
            reason: `Large successful command output (${outputBytes} bytes, ${outputLines} lines) was vaulted; deterministic important lines were returned instead of full output.`,
            summary: `Command succeeded with ${outputLines} output lines and ${outputBytes} bytes.`,
            importantLines,
        };
    }
    return {
        decisionId: decisionId("run-route", options.outputId, "small-success"),
        routingStatus: "routed",
        reason: `Small successful command output was captured in the vault and returned near-raw.`,
        summary: `Command success with exitCode=${options.exitCode}.`,
        importantLines,
    };
}
function selectImportantLines(options) {
    if (isVerificationGoal(options.goal)) {
        const verificationLines = findVerificationSummaryLines(options.combined);
        if (verificationLines) {
            return [verificationLines];
        }
    }
    if (options.executionStatus !== "success") {
        const stderrLines = nonEmptyLines(options.stderr);
        if (stderrLines.length > 0) {
            return [{ stream: "stderr", lines: firstLineRange(stderrLines), excerpt: stderrLines.slice(0, 8).join("\n") }];
        }
    }
    const combinedLines = nonEmptyLines(options.combined);
    if (combinedLines.length === 0) {
        return [];
    }
    return [{ stream: "combined", lines: firstLineRange(combinedLines), excerpt: combinedLines.slice(0, 8).join("\n") }];
}
function isVerificationGoal(goal) {
    if (!goal) {
        return false;
    }
    return /\b(verify|verification|test|tests|check|ci)\b/i.test(goal);
}
function findVerificationSummaryLines(text) {
    const lines = splitLines(text);
    const matches = lines
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => /\b(Tests?|Test Suites?|passed|failed|total)\b/i.test(line));
    if (matches.length === 0) {
        return null;
    }
    const firstMatch = matches[0];
    const lastMatch = matches[matches.length - 1];
    if (!firstMatch || !lastMatch) {
        return null;
    }
    return {
        stream: "combined",
        lines: matches.length === 1
            ? `${firstMatch.lineNumber}-${firstMatch.lineNumber}`
            : `${firstMatch.lineNumber}-${lastMatch.lineNumber}`,
        excerpt: matches.map((match) => match.line).join("\n"),
    };
}
function firstLineRange(lines) {
    return lines.length === 1 ? "1-1" : `1-${Math.min(lines.length, 8)}`;
}
function nonEmptyLines(text) {
    return splitLines(text).filter((line) => line.trim().length > 0);
}
function splitLines(text) {
    if (text.length === 0) {
        return [];
    }
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}
function combineOutputSections(stdout, stderr) {
    if (stdout.length === 0) {
        return stderr;
    }
    if (stderr.length === 0) {
        return stdout;
    }
    return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
}
function commandText(command) {
    return typeof command === "string" ? command : command.join(" ");
}
function decisionId(...parts) {
    return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}
function hash(value) {
    return createHash("sha256").update(value).digest("hex");
}
