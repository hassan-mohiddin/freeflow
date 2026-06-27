import { createHash } from "node:crypto";
import { commandOutputFingerprints, createVault, findExactDuplicateCommandOutput, storeCommandOutput, storeMetadataOutput, storeTextOutput, } from "../vault/vault.js";
import { DEFAULT_ROUTER_THRESHOLDS, DEFAULT_STORAGE_POLICY } from "../config/config.js";
import { freeflowTransform, validateDeriveInput } from "../transform/engine.js";
import { assembleTextEvidence, byteLength, countLines } from "../evidence/evidence.js";
import { parseCommandOutput } from "../routing/parsers.js";
import { applyRunOutputFilters, hasRunOutputFilters, normalizeRunOutputFilters, } from "../routing/run-filters.js";
import { parserWithReducer, reducerImportantLines, selectRunReducerRoute, } from "../routing/run-reducers.js";
export async function freeflowRun(options, runner) {
    const preserve = options.preserve ?? "important";
    const filterValidation = normalizeRunOutputFilters(options.filters);
    if (!filterValidation.ok) {
        return commandFilterValidationFailureResult({
            command: options.command,
            preserve,
            message: filterValidation.message,
            path: filterValidation.path,
        });
    }
    const scriptFilterValidation = normalizeRunScriptFilter(options.scriptFilter);
    if (!scriptFilterValidation.ok) {
        return commandScriptFilterValidationFailureResult({
            command: options.command,
            preserve,
            message: scriptFilterValidation.message,
            path: scriptFilterValidation.path,
        });
    }
    const filters = hasRunOutputFilters(filterValidation.filters) ? filterValidation.filters : undefined;
    const scriptFilter = scriptFilterValidation.scriptFilter;
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
            producer: { kind: "command" },
            persistence: { status: "not_persisted", recoverability: "none" },
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
    try {
        duplicate = await findExactDuplicateCommandOutput(vault, {
            sessionId: options.sessionId,
            fingerprints,
        });
    }
    catch {
        duplicate = undefined;
    }
    const storagePolicy = options.storagePolicy ?? DEFAULT_STORAGE_POLICY;
    const storageParser = parseCommandOutput({
        command: options.command,
        executionStatus: runResult.executionStatus,
        exitCode: runResult.exitCode,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        combined,
        ...(options.goal !== undefined ? { goal: options.goal } : {}),
    });
    const reducerRoute = selectRunReducerRoute({
        command: options.command,
        ...(options.goal !== undefined ? { goal: options.goal } : {}),
        executionStatus: runResult.executionStatus,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        combined,
        preserve,
        thresholds,
        hasFilters: filters !== undefined,
        hasScriptFilter: scriptFilter !== undefined,
    });
    const storageInput = {
        policy: storagePolicy,
        command: options.command,
        preserve,
        executionStatus: runResult.executionStatus,
        outputBytes: byteLength(combined),
        outputLines: countLines(combined),
        thresholds,
        parserName: storageParser.parser.name,
        hasFilters: filters !== undefined,
        hasScriptFilter: scriptFilter !== undefined,
        hasReducer: reducerRoute.status === "selected",
    };
    if (options.goal !== undefined) {
        Object.assign(storageInput, { goal: options.goal });
    }
    if (duplicate !== undefined) {
        Object.assign(storageInput, { duplicate });
    }
    const storageDecision = decideCommandStorage(storageInput);
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
        const metadataStoreOptions = {
            vault,
            sessionId: options.sessionId,
            command: options.command,
            runResult,
            combined,
            fingerprints,
            storageDecision,
            parserName: storageParser.parser.name,
        };
        if (options.cwd !== undefined) {
            Object.assign(metadataStoreOptions, { cwd: options.cwd });
        }
        record = storageDecision.mode === "exact"
            ? await storeCommandOutput(vault, storeOptions)
            : await storeCommandMetadataOutput(metadataStoreOptions);
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
            storage: storageDecision,
        };
        if (filters !== undefined) {
            routeOptions.filters = filters;
        }
        if (options.goal !== undefined) {
            routeOptions.goal = options.goal;
        }
        if (reducerRoute.status === "selected") {
            routeOptions.reducer = reducerRoute;
        }
        let routing;
        const duplicateForRouting = duplicate && preserve !== "full" && filters === undefined && scriptFilter === undefined ? duplicate : undefined;
        if (duplicateForRouting) {
            routing = routeDuplicateCommandOutput({
                outputId: record.outputId,
                duplicate: duplicateForRouting,
                storage: storageDecision,
                command: options.command,
                executionStatus: runResult.executionStatus,
                exitCode: runResult.exitCode,
            });
        }
        else if (scriptFilter) {
            const scriptRouteOptions = {
                routeOptions,
                rawRecord: record,
                sessionId: options.sessionId,
                scriptFilter,
                scriptSandboxAdapters: options.scriptSandboxAdapters ?? [],
            };
            if (options.vaultRoot !== undefined) {
                Object.assign(scriptRouteOptions, { vaultRoot: options.vaultRoot });
            }
            if (options.vaultRetention !== undefined) {
                Object.assign(scriptRouteOptions, { vaultRetention: options.vaultRetention });
            }
            if (options.scriptDerive !== undefined) {
                Object.assign(scriptRouteOptions, { scriptDerive: options.scriptDerive });
            }
            routing = await routeScriptFilteredOutput(scriptRouteOptions);
        }
        else {
            if (routeOptions.reducer?.status === "selected" && record.kind === "command" && storageDecision.mode === "exact") {
                routeOptions.reducerRecord = await storeReducerOutput({
                    vault,
                    sessionId: options.sessionId,
                    rawRecord: record,
                    reducer: routeOptions.reducer,
                });
            }
            routing = routeCommandOutput(routeOptions);
        }
        return {
            toolStatus: "ok",
            decisionId: routing.decisionId,
            outputId: record.outputId,
            recordId: record.recordId,
            preserve,
            execution,
            producer: record.producer,
            persistence: record.persistence,
            ...(routing.lineage !== undefined ? { lineage: routing.lineage } : record.lineage !== undefined ? { lineage: record.lineage } : {}),
            ...(routing.failure !== undefined ? { failure: routing.failure } : {}),
            ...(routing.deriveExecution !== undefined ? { deriveExecution: routing.deriveExecution } : {}),
            ...(routing.evidence !== undefined ? { evidence: routing.evidence } : {}),
            routing: {
                status: routing.routingStatus,
                route: "run",
                reason: routing.reason,
            },
            summary: routing.summary,
            importantLines: routing.importantLines,
            parser: routing.parser,
            ...(routing.filters !== undefined ? { filters: routing.filters } : {}),
            ...(routing.scriptFilter !== undefined ? { scriptFilter: routing.scriptFilter } : {}),
            ...(routing.reducer !== undefined ? { reducer: routing.reducer } : {}),
            recovery: routing.recovery ?? commandRecoveryHint(record.outputId, storageDecision),
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return commandRoutingFailureResult({
            command: options.command,
            outputId: record?.outputId ?? "",
            record,
            preserve,
            execution,
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            combined,
            errorMessage: message,
            storage: storageDecision,
        });
    }
}
function routeDuplicateCommandOutput(options) {
    const currentVaultText = options.storage.mode === "duplicate-metadata"
        ? `Current run stored metadata-only as outputId=${options.outputId}; exact raw output remains recoverable from prior outputId=${options.duplicate.outputId}.`
        : options.outputId === options.duplicate.outputId
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
function commandRecoveryHint(outputId, storage) {
    if (storage.mode === "exact") {
        return {
            how: `Use freeflow_retrieve with source.kind=vault and outputId=${outputId} to recover exact command output.`,
            outputId,
        };
    }
    if (storage.mode === "duplicate-metadata" && storage.exactRecoveryOutputId) {
        return {
            how: `Current command record is metadata-only outputId=${outputId}; exact duplicate raw output is recoverable with freeflow_retrieve source.kind=vault outputId=${storage.exactRecoveryOutputId}.`,
            outputId: storage.exactRecoveryOutputId,
        };
    }
    return {
        how: `Current command record is metadata-only outputId=${outputId}; exact raw output was not vaulted by storagePolicy=${storage.policy}. Rerun with preserve=full or a verification/diagnosis goal if exact recovery is required.`,
    };
}
function commandStorageReason(storage) {
    if (!storage || storage.mode === "exact") {
        return "raw output was vaulted";
    }
    if (storage.mode === "duplicate-metadata" && storage.exactRecoveryOutputId) {
        return `current output was stored as metadata-only with exact duplicate recovery from outputId=${storage.exactRecoveryOutputId}`;
    }
    return `current output was stored as metadata-only by storagePolicy=${storage.policy}; exact raw output was not vaulted`;
}
function decideCommandStorage(options) {
    const exactnessSensitive = commandOutputIsExactnessSensitive(options);
    if (options.policy === "store-everything") {
        return { policy: options.policy, mode: "exact", exactnessSensitive, reason: "storagePolicy=store-everything stores every command output exactly." };
    }
    if (!exactnessSensitive) {
        return {
            policy: options.policy,
            mode: "metadata-only",
            exactnessSensitive,
            reason: "Small non-sensitive successful command output is stored metadata-only by storagePolicy=hybrid-dedupe.",
        };
    }
    if (options.duplicate?.outputId) {
        return {
            policy: options.policy,
            mode: "duplicate-metadata",
            exactnessSensitive,
            exactRecoveryOutputId: options.duplicate.outputId,
            reason: `Exactness-sensitive command output duplicates prior exact outputId=${options.duplicate.outputId}; current record stores metadata only.`,
        };
    }
    return {
        policy: options.policy,
        mode: "exact",
        exactnessSensitive,
        reason: "Command output is exactness-sensitive or large/noisy; storagePolicy=hybrid-dedupe stores it exactly.",
    };
}
function commandOutputIsExactnessSensitive(options) {
    if (options.preserve === "full" || options.executionStatus !== "success" || options.hasFilters || options.hasScriptFilter || options.hasReducer) {
        return true;
    }
    if (options.outputBytes > options.thresholds.largeOutputBytes || options.outputLines > options.thresholds.largeOutputLines) {
        return true;
    }
    const goalText = `${options.goal ?? ""} ${commandText(options.command)}`.toLowerCase();
    if (/\b(verify|verification|test|tests|lint|typecheck|type-check|diagnos|debug|build|ci)\b/.test(goalText)) {
        return true;
    }
    return options.parserName !== "generic";
}
async function storeCommandMetadataOutput(options) {
    const metadata = {
        storagePolicy: options.storageDecision.policy,
        storageDecision: options.storageDecision.mode,
        storageReason: options.storageDecision.reason,
        command: options.command,
        executionStatus: options.runResult.executionStatus,
        exitCode: options.runResult.exitCode,
        parserName: options.parserName,
        exactnessSensitive: options.storageDecision.exactnessSensitive,
        byteCounts: {
            stdout: byteLength(options.runResult.stdout),
            stderr: byteLength(options.runResult.stderr),
            combined: byteLength(options.combined),
        },
        lineCounts: {
            stdout: countLines(options.runResult.stdout),
            stderr: countLines(options.runResult.stderr),
            combined: countLines(options.combined),
        },
        fingerprints: options.fingerprints,
    };
    if (options.cwd !== undefined) {
        metadata.cwd = options.cwd;
    }
    if (options.runResult.durationMs !== undefined) {
        metadata.durationMs = options.runResult.durationMs;
    }
    if (options.storageDecision.exactRecoveryOutputId !== undefined) {
        metadata.exactRecoveryOutputId = options.storageDecision.exactRecoveryOutputId;
    }
    return storeMetadataOutput(options.vault, {
        sessionId: options.sessionId,
        sourceKind: "other",
        rawLineCount: countLines(options.combined),
        rawByteCount: byteLength(options.combined),
        rawSha256: hash(options.combined),
        decisionIds: [decisionId("run-metadata", commandText(options.command), options.sessionId, options.storageDecision.mode)],
        producer: { kind: "command", name: "freeflow_run" },
        metadata,
    });
}
function commandFilterValidationFailureResult(options) {
    return {
        toolStatus: "error",
        decisionId: decisionId("run-filter-validation", commandText(options.command), options.path, options.message),
        outputId: "",
        preserve: options.preserve,
        execution: { status: "failed", exitCode: null },
        producer: { kind: "command" },
        persistence: { status: "not_persisted", recoverability: "none" },
        routing: {
            status: "failed",
            route: "run",
            reason: `Invalid freeflow_run filters at ${options.path}: ${options.message}`,
        },
        summary: "Command was not executed because freeflow_run filters were invalid.",
        recovery: {
            how: "No command output was captured. Fix the declarative filter and rerun through freeflow_run.",
        },
    };
}
function commandScriptFilterValidationFailureResult(options) {
    return {
        toolStatus: "error",
        decisionId: decisionId("run-script-filter-validation", commandText(options.command), options.path, options.message),
        outputId: "",
        preserve: options.preserve,
        execution: { status: "failed", exitCode: null },
        producer: { kind: "command" },
        persistence: { status: "not_persisted", recoverability: "none" },
        routing: {
            status: "failed",
            route: "run",
            reason: `Invalid freeflow_run scriptFilter at ${options.path}: ${options.message}`,
        },
        summary: "Command was not executed because freeflow_run scriptFilter was invalid.",
        recovery: {
            how: "No command output was captured. Fix the sandboxed script filter and rerun through freeflow_run.",
        },
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
        ? options.storage !== undefined
            ? commandRecoveryHint(options.outputId, options.storage)
            : {
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
        ...(options.record !== undefined ? { recordId: options.record.recordId } : {}),
        preserve: options.preserve,
        execution: options.execution,
        producer: options.record?.producer ?? { kind: "command" },
        persistence: options.record?.persistence ?? { status: "not_persisted", recoverability: "none" },
        ...(options.record?.lineage !== undefined ? { lineage: options.record.lineage } : {}),
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
// skills/output-router/references/safety-policy.md.
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
    if (options.filters) {
        return routeFilteredOutput({ ...options, filters: options.filters }, parsed, statusText);
    }
    if (options.preserve === "full") {
        return routeFullOutput(options, parsed, outputBytes, outputLines, statusText);
    }
    if (options.executionStatus !== "success") {
        return {
            decisionId: decisionId("run-route", options.outputId, options.executionStatus, "failed", parser.name),
            routingStatus: "routed",
            reason: `Command failed or did not complete (${statusText}); selected failure evidence was returned and ${commandStorageReason(options.storage)} before routing (${parserText}).`,
            summary: parsed.summary ?? `Command ${options.executionStatus} with exitCode=${options.exitCode}.`,
            importantLines: parsed.importantLines,
            parser,
        };
    }
    if (options.reducer) {
        return routeReducedCommandOutput({ ...options, reducer: options.reducer }, parsed, statusText);
    }
    if (isLarge) {
        return {
            decisionId: decisionId("run-route", options.outputId, "large-success", parser.name),
            routingStatus: "partial",
            reason: `Large successful command output (${outputBytes} bytes, ${outputLines} lines): ${commandStorageReason(options.storage)}; bounded important lines were returned instead of full output (${parserText}).`,
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
        reason: `Small successful command output: ${commandStorageReason(options.storage)}; routed evidence was returned near-raw from the captured execution (${parserTextFor(nearRawParser)}).`,
        summary: parsed.summary ?? `Command success with exitCode=${options.exitCode}.`,
        importantLines: nearRaw.importantLines,
        parser: nearRawParser,
    };
}
function routeReducedCommandOutput(options, parsed, statusText) {
    const importantLines = reducerImportantLines(options.reducer);
    const parser = parserWithReducer(parsed.parser, options.reducer);
    return {
        decisionId: decisionId("run-route", options.outputId, "reducer", options.reducer.result.name, options.reducer.result.version),
        routingStatus: "partial",
        reason: `Reducer ${options.reducer.result.name}@${options.reducer.result.version} selected for successful command output (${statusText}); raw output was vaulted before deterministic reduction (${parserTextFor(parser)}).`,
        summary: options.reducer.result.visibleText,
        importantLines,
        parser,
        reducer: runReducerMetadata(options.outputId, options.reducer, options.reducerRecord),
        ...(options.reducerRecord?.lineage !== undefined ? { lineage: options.reducerRecord.lineage } : {}),
        recovery: commandReducerRecoveryHint(options.outputId, options.reducerRecord?.outputId),
    };
}
function routeFilteredOutput(options, parsed, statusText) {
    const defaultText = routedCommandText(options);
    const filtered = applyRunOutputFilters({
        filters: options.filters,
        defaultStream: defaultText.stream,
        stdout: options.stdout,
        stderr: options.stderr,
        combined: options.combined,
        fallbackImportantLines: parsed.importantLines,
        preserveFallbackFailureEvidence: options.executionStatus !== "success",
        caps: {
            maxLines: options.thresholds.largeOutputLines,
            maxExcerptBytes: options.thresholds.largeOutputBytes,
            maxLineBytes: options.thresholds.largeOutputBytes,
        },
    });
    const parser = parserWithEvidence(parsed.parser, filtered.evidence);
    const fallbackText = filtered.metadata.fallbackPreservedFailureEvidence
        ? " No filtered lines matched, so parsed failure evidence was preserved instead of hiding the failure."
        : "";
    const selectedText = `${filtered.metadata.selectedLines}/${filtered.metadata.sourceLines} line(s) selected`;
    return {
        decisionId: decisionId("run-route", options.outputId, "filtered", filtered.description, parser.name),
        routingStatus: filtered.evidence.compressed ? "partial" : "routed",
        reason: `Command output was vaulted before declarative filters were applied (${statusText}; filters: ${filtered.description}; ${parserTextFor(parser)}).${fallbackText}`,
        summary: `${parsed.summary ?? `Command ${options.executionStatus} with exitCode=${options.exitCode}.`} Filtered routed evidence: ${selectedText} from ${filtered.stream}.`,
        importantLines: filtered.evidence.importantLines,
        parser: {
            ...parser,
            counts: {
                ...(parser.counts ?? {}),
                filterSourceLines: filtered.metadata.sourceLines,
                filterSelectedLines: filtered.metadata.selectedLines,
            },
        },
        filters: filtered.metadata,
    };
}
async function routeScriptFilteredOutput(options) {
    const { routeOptions, rawRecord, scriptFilter } = options;
    const baseRouting = routeCommandOutput(routeOptions);
    const operation = {
        kind: "script",
        language: scriptFilter.language,
        code: scriptFilter.code,
    };
    if (scriptFilter.label !== undefined) {
        operation.label = scriptFilter.label;
    }
    const transformOptions = {
        sessionId: options.sessionId,
        sources: runScriptFilterSources(rawRecord.outputId),
        operation,
        preserve: routeOptions.preserve,
        thresholds: routeOptions.thresholds,
        scriptSandboxAdapters: options.scriptSandboxAdapters,
    };
    if (options.scriptDerive !== undefined) {
        Object.assign(transformOptions, { scriptDerive: options.scriptDerive });
    }
    if (options.vaultRoot !== undefined) {
        Object.assign(transformOptions, { vaultRoot: options.vaultRoot });
    }
    if (options.vaultRetention !== undefined) {
        Object.assign(transformOptions, { vaultRetention: options.vaultRetention });
    }
    if (scriptFilter.limits !== undefined) {
        Object.assign(transformOptions, { limits: scriptFilter.limits });
    }
    const scriptResult = await freeflowTransform(transformOptions);
    const metadata = runScriptFilterMetadata(scriptFilter, scriptResult, rawRecord.outputId);
    if (isSuccessfulScriptFilterResult(scriptResult)) {
        const importantLines = evidencePacketsAsImportantLines(scriptResult.evidence);
        const parser = {
            name: `script-filter:${scriptFilter.language}`,
            confidence: 1,
            fidelity: "exact",
            compressed: scriptResult.routing.status === "partial",
            counts: {
                scriptEvidencePackets: scriptResult.evidence?.length ?? 0,
            },
        };
        return {
            decisionId: decisionId("run-route", rawRecord.outputId, "script-filter", scriptResult.outputId, scriptFilter.language),
            routingStatus: scriptResult.routing.status,
            reason: `Command output was vaulted as outputId=${rawRecord.outputId} before a sandboxed ${scriptFilter.language} script filter ran over captured stdout/stderr/combined. ${scriptResult.routing.reason}`,
            summary: `${baseRouting.summary} Script filter completed; derived outputId=${scriptResult.outputId}.`,
            importantLines,
            parser,
            ...(baseRouting.filters !== undefined ? { filters: baseRouting.filters } : {}),
            scriptFilter: metadata,
            ...(scriptResult.lineage !== undefined ? { lineage: scriptResult.lineage } : {}),
            ...(scriptResult.evidence !== undefined ? { evidence: scriptResult.evidence } : {}),
            recovery: commandScriptFilterRecoveryHint(rawRecord.outputId, scriptResult.outputId),
        };
    }
    const failureMessage = scriptResult.failure?.message ?? scriptResult.routing.reason;
    return {
        ...baseRouting,
        decisionId: decisionId("run-route", rawRecord.outputId, "script-filter-failed", scriptFilter.language, failureMessage),
        routingStatus: baseRouting.routingStatus === "failed" ? "failed" : "partial",
        reason: `Command executed and raw output was vaulted as outputId=${rawRecord.outputId}, but the sandboxed ${scriptFilter.language} script filter did not produce derived output: ${failureMessage} Base command evidence was returned instead.`,
        summary: `${baseRouting.summary} Script filter did not produce derived output: ${failureMessage}`,
        parser: {
            ...baseRouting.parser,
            counts: {
                ...(baseRouting.parser.counts ?? {}),
                scriptFilterFailures: 1,
            },
        },
        scriptFilter: metadata,
        ...(scriptResult.failure !== undefined ? { failure: scriptResult.failure } : {}),
        ...(scriptResult.deriveExecution !== undefined ? { deriveExecution: scriptResult.deriveExecution } : {}),
        ...(scriptResult.lineage !== undefined ? { lineage: scriptResult.lineage } : {}),
        recovery: commandScriptFilterRecoveryHint(rawRecord.outputId),
    };
}
function routeFullOutput(options, parsed, outputBytes, outputLines, statusText) {
    const full = selectFullOutputLines(options);
    const parser = parserWithEvidence(parsed.parser, full);
    const routedStatus = full.fidelity === "exact" ? "routed" : "partial";
    const capText = `${options.thresholds.largeOutputBytes} byte full-context cap`;
    const reason = full.fidelity === "exact"
        ? `preserve=full returned exact command output within the ${capText} after ${commandStorageReason(options.storage)} (${statusText}; ${parserTextFor(parser)}).`
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
function runScriptFilterSources(outputId) {
    return [
        { kind: "vault", outputId, stream: "stdout", alias: "stdout" },
        { kind: "vault", outputId, stream: "stderr", alias: "stderr" },
        { kind: "vault", outputId, stream: "combined", alias: "combined" },
    ];
}
function isSuccessfulScriptFilterResult(result) {
    return result.toolStatus === "ok" && result.failure === undefined && typeof result.outputId === "string" && result.outputId.length > 0;
}
function runScriptFilterMetadata(input, result, rawOutputId) {
    const metadata = {
        status: isSuccessfulScriptFilterResult(result) ? "success" : result.deriveExecution?.status ?? "failed",
        language: input.language,
        sourceAliases: ["stdout", "stderr", "combined"],
        rawOutputId,
    };
    if (input.label !== undefined) {
        metadata.label = input.label;
    }
    if ("operation" in result && result.operation !== undefined) {
        metadata.operation = result.operation;
    }
    if (result.outputId !== undefined) {
        metadata.outputId = result.outputId;
    }
    if (result.recordId !== undefined) {
        metadata.recordId = result.recordId;
    }
    if (result.persistence !== undefined) {
        metadata.persistence = result.persistence;
    }
    if (result.lineage !== undefined) {
        metadata.lineage = result.lineage;
    }
    if (result.failure !== undefined) {
        metadata.failure = result.failure;
    }
    if (result.deriveExecution !== undefined) {
        metadata.deriveExecution = result.deriveExecution;
    }
    if ("summary" in result && result.summary !== undefined) {
        metadata.summary = result.summary;
    }
    return metadata;
}
function evidencePacketsAsImportantLines(evidence) {
    if (!Array.isArray(evidence)) {
        return [];
    }
    return evidence
        .filter((packet) => typeof packet.excerpt === "string" && typeof packet.lines === "string")
        .map((packet) => ({
        stream: "combined",
        lines: packet.lines,
        excerpt: packet.excerpt,
    }));
}
function storeReducerOutput(options) {
    const operation = `run-reducer:${options.reducer.result.name}@${options.reducer.result.version}`;
    return storeTextOutput(options.vault, {
        sessionId: options.sessionId,
        raw: options.reducer.result.visibleText,
        sourceKind: "derive",
        decisionIds: [decisionId("run-reducer", options.rawRecord.outputId, options.reducer.result.name, options.reducer.result.version)],
        producer: { kind: "derive", name: "freeflow_run reducer" },
        lineage: {
            sourceRecordIds: [options.rawRecord.recordId],
            sourceOutputIds: [options.rawRecord.outputId],
            operation,
            operationHash: hash(JSON.stringify({ operation, sourceOutputId: options.rawRecord.outputId, facts: options.reducer.result.facts })),
        },
    });
}
function runReducerMetadata(rawOutputId, reducer, reducerRecord) {
    return {
        status: reducerRecord === undefined ? "selected" : "success",
        name: reducer.result.name,
        version: reducer.result.version,
        confidence: reducer.result.confidence,
        rawOutputId,
        summary: reducer.result.visibleText,
        facts: reducer.result.facts,
        ...(reducerRecord !== undefined ? {
            outputId: reducerRecord.outputId,
            recordId: reducerRecord.recordId,
            persistence: reducerRecord.persistence,
            lineage: reducerRecord.lineage,
        } : {}),
    };
}
function commandReducerRecoveryHint(rawOutputId, derivedOutputId) {
    if (derivedOutputId) {
        return {
            how: `Raw command output: use freeflow_retrieve with source.kind=vault and outputId=${rawOutputId}. Reducer-derived output: use freeflow_retrieve with source.kind=vault, outputId=${derivedOutputId}, stream=raw, and an exact lineRange.`,
            outputId: rawOutputId,
        };
    }
    return {
        how: `Reducer output was returned in the structured command result. Raw command output remains recoverable with freeflow_retrieve source.kind=vault outputId=${rawOutputId}.`,
        outputId: rawOutputId,
    };
}
function commandScriptFilterRecoveryHint(rawOutputId, derivedOutputId) {
    if (derivedOutputId) {
        return {
            how: `Raw command output: use freeflow_retrieve with source.kind=vault and outputId=${rawOutputId}. Script-filtered derived output: use freeflow_retrieve with source.kind=vault, outputId=${derivedOutputId}, stream=raw, and an exact lineRange.`,
            outputId: rawOutputId,
        };
    }
    return {
        how: `Script filter did not produce derived output. Raw command output remains recoverable with freeflow_retrieve source.kind=vault outputId=${rawOutputId}.`,
        outputId: rawOutputId,
    };
}
function normalizeRunScriptFilter(input) {
    if (input === undefined || input === null) {
        return { ok: true };
    }
    if (!isRecord(input)) {
        return { ok: false, path: "$.scriptFilter", message: "freeflow_run scriptFilter must be an object." };
    }
    const operation = { kind: "script" };
    if (input.language !== undefined) {
        operation.language = input.language;
    }
    if (input.code !== undefined) {
        operation.code = input.code;
    }
    if (input.label !== undefined) {
        operation.label = input.label;
    }
    const candidate = {
        sources: runScriptFilterSources("ffout_run_script_filter_validation"),
        operation,
    };
    if (input.limits !== undefined) {
        candidate.limits = input.limits;
    }
    const validation = validateDeriveInput(candidate);
    if (!validation.ok) {
        const issue = validation.issues[0] ?? { path: "$.scriptFilter", message: "Invalid script filter." };
        return {
            ok: false,
            path: issue.path.replace(/^\$\.operation/, "$.scriptFilter").replace(/^\$\.limits/, "$.scriptFilter.limits"),
            message: issue.message,
        };
    }
    const scriptFilter = {
        language: input.language,
        code: input.code,
    };
    if (input.label !== undefined) {
        scriptFilter.label = input.label;
    }
    if (input.limits !== undefined) {
        scriptFilter.limits = input.limits;
    }
    return { ok: true, scriptFilter };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
