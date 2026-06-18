import { createHash } from "node:crypto";
import { commandOutputFingerprints, createVault, findExactDuplicateCommandOutput, storeCommandOutput, } from "./vault.js";
import { DEFAULT_ROUTER_THRESHOLDS } from "./config.js";
import { assembleTextEvidence, byteLength, countLines } from "./evidence.js";
import { parseCommandOutput } from "./parsers.js";
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
    let record;
    let duplicate;
    const fingerprints = commandOutputFingerprints({
        command: options.command,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        combined,
        executionStatus: runResult.executionStatus,
        exitCode: runResult.exitCode,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    });
    if (preserve !== "full") {
        try {
            duplicate = await findExactDuplicateCommandOutput(vault, {
                sessionId: options.sessionId,
                fingerprints,
            });
        }
        catch {
            duplicate = undefined;
        }
    }
    const execution = {
        status: runResult.executionStatus,
        exitCode: runResult.exitCode,
    };
    if (runResult.durationMs !== undefined) {
        Object.assign(execution, { durationMs: runResult.durationMs });
    }
    try {
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
        record = await storeCommandOutput(vault, storeOptions);
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
        const routing = duplicate
            ? routeDuplicateCommandOutput({
                outputId: record.outputId,
                duplicate,
                command: options.command,
                executionStatus: runResult.executionStatus,
                exitCode: runResult.exitCode,
            })
            : routeCommandOutput(routeOptions);
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
            parser: routing.parser,
            recovery: commandRecoveryHint(record.outputId, duplicate),
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return commandRoutingFailureResult({
            command: options.command,
            outputId: record?.outputId ?? "",
            preserve,
            execution,
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            combined,
            errorMessage: message,
        });
    }
}
function routeDuplicateCommandOutput(options) {
    const currentVaultText = options.outputId === options.duplicate.outputId
        ? `Current run resolved to the same outputId=${options.outputId}.`
        : `Current raw output was vaulted as outputId=${options.outputId}.`;
    const statusText = `executionStatus=${options.executionStatus} exitCode=${options.exitCode}`;
    return {
        decisionId: decisionId("run-route", options.outputId, "exact-duplicate", options.duplicate.outputId),
        routingStatus: "partial",
        reason: `Exact duplicate command output matched previous outputId=${options.duplicate.outputId} by exact output hash and command/cwd/status fingerprint (${statusText}); returning a compact duplicate note instead of re-injecting repeated output. ${currentVaultText}`,
        summary: `Command output is an exact duplicate of previous outputId=${options.duplicate.outputId}. ${currentVaultText}`,
        importantLines: [],
        parser: {
            name: "duplicate-output",
            confidence: 1,
            fidelity: "exact",
            compressed: true,
            counts: { duplicateOutputs: 1 },
        },
    };
}
function commandRecoveryHint(outputId, duplicate) {
    if (duplicate) {
        return {
            how: `Current exact command output: use freeflow_retrieve with source.kind=vault and outputId=${outputId}. Prior identical output: outputId=${duplicate.outputId}.`,
            outputId,
        };
    }
    return {
        how: `Use freeflow_retrieve with source.kind=vault and outputId=${outputId} to recover exact command output.`,
        outputId,
    };
}
function commandRoutingFailureResult(options) {
    const { stream, text } = routedCommandText({
        outputId: options.outputId,
        command: options.command,
        executionStatus: options.execution.status,
        exitCode: options.execution.exitCode,
        stdout: options.stdout,
        stderr: options.stderr,
        combined: options.combined,
        preserve: options.preserve,
        thresholds: DEFAULT_ROUTER_THRESHOLDS,
    });
    const fallback = assembleTextEvidence({ stream, text });
    const parser = {
        name: "router-fallback",
        confidence: 0,
        fidelity: fallback.fidelity,
        compressed: fallback.compressed,
    };
    const recovery = options.outputId
        ? {
            how: `Routing failed after vault capture; use freeflow_retrieve with source.kind=vault and outputId=${options.outputId} to recover exact command output.`,
            outputId: options.outputId,
        }
        : {
            how: "Command output could not be vaulted. A bounded in-memory preview was returned; rerun through the host-approved runner if exact recovery is required.",
        };
    return {
        toolStatus: "error",
        decisionId: decisionId("run-route-error", commandText(options.command), options.errorMessage),
        outputId: options.outputId,
        preserve: options.preserve,
        execution: options.execution,
        routing: {
            status: "failed",
            route: "run",
            reason: `Command executed, but Freeflow routing failed after execution: ${options.errorMessage}`,
        },
        summary: "Command executed, but Freeflow routing failed after execution.",
        importantLines: fallback.importantLines,
        parser,
        recovery,
    };
}
// Keep exactness-sensitive command routing aligned with
// plugins/freeflow/skills/output-router/references/safety-policy.md.
function routeCommandOutput(options) {
    const outputBytes = byteLength(options.combined);
    const outputLines = countLines(options.combined);
    const isLarge = outputBytes > options.thresholds.largeOutputBytes || outputLines > options.thresholds.largeOutputLines;
    const parseInput = {
        command: options.command,
        executionStatus: options.executionStatus,
        exitCode: options.exitCode,
        stdout: options.stdout,
        stderr: options.stderr,
        combined: options.combined,
    };
    if (options.goal !== undefined) {
        Object.assign(parseInput, { goal: options.goal });
    }
    const parsed = parseCommandOutput(parseInput);
    const parser = parsed.parser;
    const statusText = `executionStatus=${options.executionStatus} exitCode=${options.exitCode}`;
    const parserText = parserTextFor(parser);
    if (options.preserve === "full") {
        return routeFullOutput(options, parsed, outputBytes, outputLines, statusText);
    }
    if (options.executionStatus !== "success") {
        return {
            decisionId: decisionId("run-route", options.outputId, options.executionStatus, "failed", parser.name),
            routingStatus: "routed",
            reason: `Command failed or did not complete (${statusText}); selected failure evidence was returned and raw output was vaulted before routing (${parserText}).`,
            summary: parsed.summary ?? `Command ${options.executionStatus} with exitCode=${options.exitCode}.`,
            importantLines: parsed.importantLines,
            parser,
        };
    }
    if (isLarge) {
        return {
            decisionId: decisionId("run-route", options.outputId, "large-success", parser.name),
            routingStatus: "partial",
            reason: `Large successful command output (${outputBytes} bytes, ${outputLines} lines) was vaulted; bounded important lines were returned instead of full output (${parserText}).`,
            summary: parsed.summary ?? `Command succeeded with ${outputLines} output lines and ${outputBytes} bytes.`,
            importantLines: parsed.importantLines,
            parser,
        };
    }
    const nearRaw = selectNearRawSuccessfulLines(options);
    const nearRawParser = parserWithEvidence(parser, nearRaw);
    return {
        decisionId: decisionId("run-route", options.outputId, "small-success", parser.name, nearRaw.fidelity),
        routingStatus: nearRaw.fidelity === "exact" ? "routed" : "partial",
        reason: `Small successful command output was captured in the vault and returned near-raw (${parserTextFor(nearRawParser)}).`,
        summary: parsed.summary ?? `Command success with exitCode=${options.exitCode}.`,
        importantLines: nearRaw.importantLines,
        parser: nearRawParser,
    };
}
function routeFullOutput(options, parsed, outputBytes, outputLines, statusText) {
    const full = selectFullOutputLines(options);
    const parser = parserWithEvidence(parsed.parser, full);
    const routedStatus = full.fidelity === "exact" ? "routed" : "partial";
    const capText = `${options.thresholds.largeOutputBytes} byte full-context cap`;
    const reason = full.fidelity === "exact"
        ? `preserve=full returned exact command output within the ${capText} after raw output was vaulted (${statusText}; ${parserTextFor(parser)}).`
        : `preserve=full output exceeded the bounded context policy (${outputBytes} bytes, ${outputLines} lines); a bounded preview was returned with raw vault recovery (${statusText}; ${parserTextFor(parser)}).`;
    return {
        decisionId: decisionId("run-route", options.outputId, "preserve-full", full.fidelity, parsed.parser.name),
        routingStatus: routedStatus,
        reason,
        summary: parsed.summary ?? `Command ${options.executionStatus} with exitCode=${options.exitCode}.`,
        importantLines: full.importantLines,
        parser,
    };
}
function selectNearRawSuccessfulLines(options) {
    const { stream, text } = routedCommandText(options);
    return assembleTextEvidence({
        stream,
        text,
        caps: {
            maxLines: options.thresholds.largeOutputLines,
            maxExcerptBytes: options.thresholds.largeOutputBytes,
            maxLineBytes: options.thresholds.largeOutputBytes,
        },
    });
}
function selectFullOutputLines(options) {
    const { stream, text } = routedCommandText(options);
    return assembleTextEvidence({
        stream,
        text,
        caps: {
            maxLines: Number.MAX_SAFE_INTEGER,
            maxExcerptBytes: options.thresholds.largeOutputBytes,
            maxLineBytes: options.thresholds.largeOutputBytes,
        },
    });
}
function routedCommandText(options) {
    if (options.stdout.length > 0 && options.stderr.length === 0) {
        return { stream: "stdout", text: options.stdout };
    }
    if (options.stderr.length > 0 && options.stdout.length === 0) {
        return { stream: "stderr", text: options.stderr };
    }
    return { stream: "combined", text: options.combined };
}
function parserWithEvidence(parser, evidence) {
    return {
        ...parser,
        fidelity: parser.fidelity === "lossy" || evidence.fidelity === "lossy" ? "lossy" : "exact",
        compressed: evidence.compressed,
    };
}
function parserTextFor(parser) {
    return `parser=${parser.name} confidence=${parser.confidence.toFixed(2)} fidelity=${parser.fidelity}`;
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
