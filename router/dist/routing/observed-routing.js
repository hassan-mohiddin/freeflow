import { createHash } from "node:crypto";
import { DEFAULT_ROUTER_THRESHOLDS } from "../config/config.js";
import { byteLength, countLines } from "../evidence/evidence.js";
import { reduceObservedOutput } from "./observed-reducers.js";
import { createVault, storeMetadataOutput, storeTextOutput } from "../vault/vault.js";
export async function routeObservedToolOutput(options) {
    const preserve = options.preserve ?? "important";
    const thresholds = { ...DEFAULT_ROUTER_THRESHOLDS, ...options.thresholds };
    let normalizedOutput;
    let normalized;
    let decisionId;
    try {
        normalizedOutput = normalizeObservedOutput(options.rawResult, options.mediaType);
        normalized = observedNormalization(normalizedOutput);
        decisionId = observedDecisionId(options, normalizedOutput.text);
    }
    catch (error) {
        const passthroughText = safePassthroughText(options.rawResult);
        const fallbackOutput = {
            text: passthroughText,
            shape: "structured",
            ...(options.mediaType !== undefined ? { mediaType: options.mediaType } : {}),
        };
        const fallbackNormalized = observedNormalization(fallbackOutput);
        return failOpenObservedOutput({
            options,
            preserve,
            decisionId: observedDecisionId(options, `${passthroughText}:${errorMessage(error)}`),
            normalized: fallbackNormalized,
            text: passthroughText,
            failureKind: "observed_routing_failure",
            message: `Observed output from ${producerLabel(options.producer)} could not be normalized: ${errorMessage(error)}`,
        });
    }
    let stored;
    try {
        stored = await persistObservedOutput({
            ...options,
            decisionId,
            normalized,
            text: normalizedOutput.text,
        });
    }
    catch (error) {
        return failOpenObservedOutput({
            options,
            preserve,
            decisionId,
            normalized,
            text: normalizedOutput.text,
            failureKind: "storage_failure",
            message: `Observed output from ${producerLabel(options.producer)} could not be persisted: ${errorMessage(error)}`,
        });
    }
    let routed;
    try {
        routed = reduceObservedOutput({
            text: normalizedOutput.text,
            rawValue: options.rawResult,
            normalized,
            preserve,
            thresholds,
            source: stored.evidenceSource,
            outputId: stored.outputId ?? decisionId,
            producer: options.producer,
        });
    }
    catch (error) {
        return failOpenObservedOutput({
            options,
            preserve,
            decisionId,
            normalized,
            text: normalizedOutput.text,
            failureKind: "observed_routing_failure",
            stored,
            message: `Observed output from ${producerLabel(options.producer)} could not be reduced: ${errorMessage(error)}`,
        });
    }
    const result = {
        toolStatus: "ok",
        decisionId,
        preserve,
        host: options.host,
        normalized,
        producer: options.producer,
        ...(options.risk !== undefined ? { risk: options.risk } : {}),
        persistence: stored.persistence,
        routing: {
            status: routed.routingStatus,
            route: "observed",
            reason: routed.reason,
        },
        summary: routed.summary,
        evidence: routed.evidence,
        recovery: recoveryHint(stored.persistence),
    };
    if (stored.outputId !== undefined) {
        result.outputId = stored.outputId;
    }
    if (stored.recordId !== undefined) {
        result.recordId = stored.recordId;
    }
    return result;
}
async function persistObservedOutput(options) {
    if (options.persistence === "none") {
        return {
            persistence: noPersistence(),
            evidenceSource: { kind: "native", tool: options.host.toolName, outputId: options.decisionId },
        };
    }
    const vaultOptions = {};
    if (options.vaultRoot !== undefined) {
        vaultOptions.root = options.vaultRoot;
    }
    if (options.vaultRetention !== undefined) {
        vaultOptions.retention = options.vaultRetention;
    }
    const vault = createVault(vaultOptions);
    const sourceKind = sourceKindForProducer(options.producer);
    if (options.persistence === "metadata-only") {
        const record = await storeMetadataOutput(vault, {
            sessionId: options.sessionId,
            sourceKind,
            rawLineCount: options.normalized.lineCount,
            rawByteCount: options.normalized.byteCount,
            rawSha256: sha256Text(options.text),
            metadata: {
                host: options.host,
                producer: options.producer,
                shape: options.normalized.shape,
                ...(options.normalized.mediaType !== undefined ? { mediaType: options.normalized.mediaType } : {}),
                ...(options.toolInputHash !== undefined ? { toolInputHash: options.toolInputHash } : {}),
            },
            decisionIds: [options.decisionId],
            ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
            producer: options.producer,
        });
        return {
            outputId: record.outputId,
            recordId: record.recordId,
            persistence: { ...record.persistence, outputId: record.outputId },
            evidenceSource: { kind: "native", tool: options.host.toolName, outputId: record.outputId },
        };
    }
    const record = await storeTextOutput(vault, {
        sessionId: options.sessionId,
        raw: options.text,
        sourceKind,
        decisionIds: [options.decisionId],
        ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
        producer: options.producer,
    });
    return {
        outputId: record.outputId,
        recordId: record.recordId,
        persistence: record.persistence,
        evidenceSource: { kind: "vault", outputId: record.outputId, stream: "raw" },
    };
}
function observedNormalization(normalizedOutput) {
    return {
        shape: normalizedOutput.shape,
        ...(normalizedOutput.mediaType !== undefined ? { mediaType: normalizedOutput.mediaType } : {}),
        byteCount: byteLength(normalizedOutput.text),
        lineCount: countLines(normalizedOutput.text),
    };
}
function observedDecisionId(options, text) {
    return decisionIdFromSeed([
        "observed",
        options.sessionId,
        options.host.name,
        options.host.toolName,
        producerLabel(options.producer),
        options.persistence,
        sha256Text(text),
    ].join("|"));
}
function failOpenObservedOutput(options) {
    return {
        toolStatus: "ok",
        decisionId: options.decisionId,
        preserve: options.preserve,
        host: options.options.host,
        normalized: options.normalized,
        producer: options.options.producer,
        ...(options.options.risk !== undefined ? { risk: options.options.risk } : {}),
        persistence: options.stored?.persistence ?? noPersistence(),
        routing: {
            status: "failed",
            route: "observed",
            reason: `${options.message}; failing open with original host output preserved.`,
        },
        failure: {
            kind: options.failureKind,
            message: options.message,
        },
        passthrough: {
            text: options.text,
            reason: "Observed routing failed after the host tool completed; host output must be allowed through.",
        },
        recovery: options.stored
            ? recoveryHint(options.stored.persistence)
            : {
                how: "No content was persisted because observed routing failed. Recovery is unavailable; use the original host output from this result.",
            },
        ...(options.stored?.outputId !== undefined ? { outputId: options.stored.outputId } : {}),
        ...(options.stored?.recordId !== undefined ? { recordId: options.stored.recordId } : {}),
    };
}
function normalizeObservedOutput(value, mediaType) {
    if (typeof value === "string") {
        return { text: value, shape: "text", ...(mediaType !== undefined ? { mediaType } : {}) };
    }
    if (isRecord(value)) {
        const stdio = normalizeStdio(value);
        if (stdio !== undefined) {
            return { text: stdio, shape: "stdio", ...(mediaType !== undefined ? { mediaType } : {}) };
        }
        const contentBlocks = normalizeContentBlocks(value.content);
        if (contentBlocks !== undefined) {
            return { text: contentBlocks, shape: "content_blocks", ...(mediaType !== undefined ? { mediaType } : {}) };
        }
        if (typeof value.text === "string") {
            return { text: value.text, shape: "structured", ...(mediaType !== undefined ? { mediaType } : {}) };
        }
        return {
            text: stableJson(value),
            shape: "json",
            mediaType: mediaType ?? "application/json",
        };
    }
    return { text: value === undefined ? "" : String(value), shape: "text", ...(mediaType !== undefined ? { mediaType } : {}) };
}
function normalizeStdio(value) {
    const stdout = typeof value.stdout === "string" ? value.stdout : undefined;
    const stderr = typeof value.stderr === "string" ? value.stderr : undefined;
    if (stdout === undefined && stderr === undefined) {
        return undefined;
    }
    if (stdout !== undefined && stderr !== undefined) {
        if (stdout.length === 0) {
            return stderr;
        }
        if (stderr.length === 0) {
            return stdout;
        }
        return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
    }
    return stdout ?? stderr ?? "";
}
function normalizeContentBlocks(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value.map(normalizeContentBlock).join("\n");
}
function normalizeContentBlock(block) {
    if (typeof block === "string") {
        return block;
    }
    if (!isRecord(block)) {
        return String(block);
    }
    if (typeof block.text === "string") {
        return block.text;
    }
    if (block.json !== undefined) {
        return stableJson(block.json);
    }
    if (block.content !== undefined) {
        const nested = normalizeContentBlocks(block.content);
        if (nested !== undefined) {
            return nested;
        }
    }
    return stableJson(block);
}
function sourceKindForProducer(producer) {
    if (producer.kind === "mcp") {
        return "mcp";
    }
    if (producer.kind === "web") {
        return "web";
    }
    if (producer.kind === "fetch") {
        return "fetch";
    }
    if (producer.kind === "code_search") {
        return "code_search";
    }
    if (producer.kind === "derive") {
        return "derive";
    }
    if (producer.kind === "native") {
        return "native";
    }
    return "other";
}
function recoveryHint(persistence) {
    const recoveryOutputId = persistence.recoveryOutputId ?? persistence.outputId;
    if (persistence.recoverability === "exact" && recoveryOutputId !== undefined) {
        return {
            how: `Use freeflow_search with source.kind=vault and outputId=${recoveryOutputId}, stream=raw, and an exact lineRange to recover exact observed output.`,
            outputId: recoveryOutputId,
        };
    }
    if (persistence.recoverability === "metadata_only") {
        return {
            how: "Only metadata was persisted for this observed output. No raw content stream is recoverable.",
            ...(persistence.outputId !== undefined ? { outputId: persistence.outputId } : {}),
        };
    }
    return {
        how: "No content or metadata was persisted for this observed output. Recovery is unavailable.",
    };
}
function noPersistence() {
    return { status: "not_persisted", recoverability: "none" };
}
function producerLabel(producer) {
    return [producer.kind, producer.server, producer.tool, producer.name].filter(Boolean).join(":");
}
function decisionIdFromSeed(seed) {
    return `ffdec_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}
function sha256Text(text) {
    return createHash("sha256").update(text).digest("hex");
}
function stableJson(value) {
    return JSON.stringify(value, sortJsonKeys, 2);
}
function safePassthroughText(value) {
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value, safeJsonReplacer(), 2) ?? String(value);
    }
    catch {
        try {
            return String(value);
        }
        catch {
            return "[unrepresentable observed tool output]";
        }
    }
}
function safeJsonReplacer() {
    const seen = new WeakSet();
    return function replace(_key, value) {
        if (typeof value === "bigint") {
            return `${value.toString()}n`;
        }
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    };
}
function sortJsonKeys(_key, value) {
    if (!isRecord(value) || Array.isArray(value)) {
        return value;
    }
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
