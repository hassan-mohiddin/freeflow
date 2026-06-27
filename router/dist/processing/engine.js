import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import { resolveRepoPath } from "../repo/repo-traversal.js";
import { createVault, readOutputText, readVaultRecord, storeRepoFileReference, storeTextOutput } from "../vault/vault.js";
export const PROCESSING_ENGINE_IMPLEMENTATION = "processing-engine-skeleton-v1";
const DEFAULT_PROCESSING_LIMITS = {
    maxSourceBytes: 2 * 1024 * 1024,
    maxVisibleBytes: 4_096,
};
export async function loadProcessingSource(source, options = {}) {
    const limits = normalizeLimits(options.limits);
    switch (source.kind) {
        case "repo-file":
            return loadRepoFileSource(source, options, limits);
        case "vault-output":
            return loadVaultOutputSource(source, options, limits);
        case "command-output":
            return loadCapturedCommandOutputSource(source, limits);
    }
}
export async function processSource(source, options = {}) {
    const loaded = await loadProcessingSource(source, options);
    const reducer = selectReducerSkeleton();
    const script = selectScriptPolicySkeleton();
    if (loaded.status === "blocked") {
        return {
            implementation: PROCESSING_ENGINE_IMPLEMENTATION,
            status: "blocked",
            source: loaded.source,
            reason: loaded.reason,
            policy: loaded.policy,
            visibleText: `${loaded.policy}: ${loaded.reason}`,
            facts: [],
            reducer,
            script,
        };
    }
    if (loaded.status === "unavailable") {
        return {
            implementation: PROCESSING_ENGINE_IMPLEMENTATION,
            status: "unavailable",
            source: loaded.source,
            reason: loaded.reason,
            visibleText: `source unavailable: ${loaded.reason}`,
            facts: [],
            reducer,
            script,
        };
    }
    const facts = sourceFacts(loaded);
    const visibleText = truncateVisible(renderFactFirstSourceSummary(loaded, facts), normalizeLimits(options.limits).maxVisibleBytes);
    const persisted = await persistProcessingVisibleText(visibleText, loaded, options);
    const result = {
        implementation: PROCESSING_ENGINE_IMPLEMENTATION,
        status: "ok",
        source: loaded.source,
        stats: loaded.stats,
        visibleText,
        facts,
        reducer,
        script,
    };
    const lineage = persisted.lineage ?? loaded.lineage;
    const persistence = persisted.persistence ?? loaded.persistence;
    const recovery = persisted.recovery ?? loaded.recovery;
    if (lineage !== undefined) {
        result.lineage = lineage;
    }
    if (persistence !== undefined) {
        result.persistence = persistence;
    }
    if (recovery !== undefined) {
        result.recovery = recovery;
    }
    return result;
}
async function loadRepoFileSource(source, options, limits) {
    const descriptor = repoSourceDescriptor(source.path);
    let resolved;
    try {
        resolved = await resolveRepoPath(source.root, source.path);
    }
    catch (error) {
        const message = errorMessage(error);
        const blocked = message.includes("escapes root");
        return blocked
            ? { status: "blocked", source: descriptor, policy: "repo_containment", reason: message }
            : { status: "unavailable", source: descriptor, reason: message };
    }
    const resolvedDescriptor = repoSourceDescriptor(resolved.relativePath || ".");
    const fileStat = await stat(resolved.absolutePath);
    if (!fileStat.isFile()) {
        return { status: "unavailable", source: resolvedDescriptor, reason: `Repo source is not a file: ${resolved.relativePath || "."}` };
    }
    if (fileStat.size > limits.maxSourceBytes) {
        return {
            status: "blocked",
            source: resolvedDescriptor,
            policy: "source_limit",
            reason: `Repo source ${resolved.relativePath} is ${fileStat.size} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
            stats: { bytes: fileStat.size },
        };
    }
    const text = await readFile(resolved.absolutePath, "utf8");
    const stats = textStats(text);
    const lineage = await persistRepoFileReferenceIfRequested({ sourcePath: resolved.relativePath, text, options });
    return {
        status: "ok",
        source: resolvedDescriptor,
        text,
        stats,
        ...(lineage !== undefined ? { lineage } : {}),
    };
}
async function loadVaultOutputSource(source, options, limits) {
    const requestedStream = source.stream;
    const unavailableDescriptor = vaultSourceDescriptor(source.outputId, requestedStream ?? "combined");
    const vaultOptions = {};
    const vaultRoot = source.vaultRoot ?? options.vaultRoot;
    if (vaultRoot !== undefined) {
        vaultOptions.root = vaultRoot;
    }
    if (options.vaultRetention !== undefined) {
        vaultOptions.retention = options.vaultRetention;
    }
    const vault = createVault(vaultOptions);
    let record;
    try {
        record = await readVaultRecord(vault, source.sessionId, source.outputId);
    }
    catch (error) {
        return { status: "unavailable", source: unavailableDescriptor, reason: errorMessage(error) };
    }
    const stream = resolveProcessingVaultStream(record, requestedStream);
    const descriptor = vaultSourceDescriptor(source.outputId, stream);
    const sourceBytes = byteCountForVaultStream(record, stream);
    if (sourceBytes !== undefined && sourceBytes > limits.maxSourceBytes) {
        return {
            status: "blocked",
            source: descriptor,
            policy: "source_limit",
            reason: `Vault source ${source.outputId}:${stream} is ${sourceBytes} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
            stats: { bytes: sourceBytes },
        };
    }
    try {
        const text = await readOutputText(vault, source.sessionId, source.outputId, stream);
        const stats = textStats(text);
        if (stats.bytes > limits.maxSourceBytes) {
            return {
                status: "blocked",
                source: descriptor,
                policy: "source_limit",
                reason: `Vault source ${source.outputId}:${stream} is ${stats.bytes} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
                stats: { bytes: stats.bytes },
            };
        }
        const lineage = {
            sourceRecordIds: record.recordId ? [record.recordId] : [],
            sourceOutputIds: [source.outputId],
            operation: "processing-source-load",
        };
        return {
            status: "ok",
            source: descriptor,
            text,
            stats,
            lineage,
            recovery: { how: `Recover source with freeflow_retrieve action=retrieve outputId=${source.outputId} stream=${stream}.`, outputId: source.outputId },
        };
    }
    catch (error) {
        return { status: "unavailable", source: descriptor, reason: errorMessage(error) };
    }
}
function resolveProcessingVaultStream(record, requested) {
    if (requested !== undefined) {
        return requested;
    }
    return record.kind === "text" ? "raw" : "combined";
}
function vaultSourceDescriptor(outputId, stream) {
    return {
        kind: "vault-output",
        ref: { kind: "vault", outputId, stream },
        displayPath: `${outputId}:${stream}`,
        stream,
    };
}
function loadCapturedCommandOutputSource(source, limits) {
    const stream = source.stream ?? "combined";
    const descriptor = {
        kind: "command-output",
        ref: { kind: "native", tool: "command", outputId: source.outputId ?? "inline-command-output" },
        displayPath: source.outputId ? `${source.outputId}:${stream}` : `inline-command-output:${stream}`,
        stream,
    };
    const text = commandOutputStreamText(source, stream);
    const stats = textStats(text);
    if (stats.bytes > limits.maxSourceBytes) {
        return {
            status: "blocked",
            source: descriptor,
            policy: "source_limit",
            reason: `Captured command output ${descriptor.displayPath} is ${stats.bytes} bytes, above maxSourceBytes=${limits.maxSourceBytes}.`,
            stats: { bytes: stats.bytes },
        };
    }
    const lineage = source.outputId
        ? { sourceOutputIds: [source.outputId], operation: "processing-source-load" }
        : undefined;
    return {
        status: "ok",
        source: descriptor,
        text,
        stats,
        ...(lineage !== undefined ? { lineage } : {}),
        ...(source.outputId !== undefined
            ? { recovery: { how: `Recover source from captured command outputId=${source.outputId} stream=${stream}.`, outputId: source.outputId } }
            : {}),
    };
}
async function persistRepoFileReferenceIfRequested(input) {
    if (input.options.sessionId === undefined) {
        return undefined;
    }
    const vaultOptions = {};
    if (input.options.vaultRoot !== undefined) {
        vaultOptions.root = input.options.vaultRoot;
    }
    if (input.options.vaultRetention !== undefined) {
        vaultOptions.retention = input.options.vaultRetention;
    }
    const record = await storeRepoFileReference(createVault(vaultOptions), {
        sessionId: input.options.sessionId,
        path: input.sourcePath,
        hashSha256: sha256(input.text),
        producer: { kind: "repo", name: "processing-source-loader" },
        persistence: { status: "metadata_only", recoverability: "metadata_only" },
    });
    return {
        sourceRecordIds: [record.recordId],
        sourceOutputIds: [record.outputId],
        operation: "processing-source-load",
    };
}
async function persistProcessingVisibleText(visibleText, loaded, options) {
    if (options.sessionId === undefined) {
        return {};
    }
    const vaultOptions = {};
    if (options.vaultRoot !== undefined) {
        vaultOptions.root = options.vaultRoot;
    }
    if (options.vaultRetention !== undefined) {
        vaultOptions.retention = options.vaultRetention;
    }
    const lineage = {
        ...(loaded.lineage?.sourceRecordIds !== undefined ? { sourceRecordIds: loaded.lineage.sourceRecordIds } : {}),
        ...(loaded.lineage?.sourceOutputIds !== undefined ? { sourceOutputIds: loaded.lineage.sourceOutputIds } : {}),
        operation: "processing-fact-summary",
        operationHash: sha256(JSON.stringify({ source: loaded.source, stats: loaded.stats })),
    };
    const record = await storeTextOutput(createVault(vaultOptions), {
        sessionId: options.sessionId,
        raw: visibleText,
        sourceKind: "derive",
        producer: { kind: "derive", name: "processing-engine" },
        persistence: { status: "vaulted", recoverability: "exact" },
        lineage,
    });
    const persistence = { status: "vaulted", recoverability: "exact", outputId: record.outputId };
    return {
        lineage,
        persistence,
        recovery: { how: `Recover processing result with freeflow_retrieve action=retrieve outputId=${record.outputId} stream=raw.`, outputId: record.outputId },
    };
}
function selectReducerSkeleton() {
    return {
        status: "not_selected",
        candidates: [],
        reason: "Reducer registry is reserved for Slice 2; Slice 1 only loads and bounds sources.",
    };
}
function selectScriptPolicySkeleton() {
    return {
        status: "not_configured",
        reason: "Script processing is reserved for a later slice; no sandbox or host fallback runs in Slice 1.",
    };
}
function sourceFacts(loaded) {
    return [
        { name: "source.kind", value: loaded.source.kind },
        { name: "source.path", value: loaded.source.displayPath },
        { name: "source.bytes", value: loaded.stats.bytes },
        { name: "source.lines", value: loaded.stats.lines },
        { name: "source.sha256", value: loaded.stats.sha256 },
    ];
}
function renderFactFirstSourceSummary(loaded, facts) {
    const lines = ["processing source loaded", ...facts.map((fact) => `${fact.name}: ${fact.value}`)];
    if (loaded.recovery?.how) {
        lines.push(`source recovery: ${loaded.recovery.how}`);
    }
    return lines.join("\n");
}
function commandOutputStreamText(source, stream) {
    if (stream === "stdout") {
        return source.stdout ?? "";
    }
    if (stream === "stderr") {
        return source.stderr ?? "";
    }
    return source.combined ?? combineOutput(source.stdout ?? "", source.stderr ?? "");
}
function byteCountForVaultStream(record, stream) {
    if (record.kind === "command") {
        if (stream === "stdout") {
            return record.byteCounts.stdout;
        }
        if (stream === "stderr") {
            return record.byteCounts.stderr;
        }
        if (stream === "combined" || stream === "raw") {
            return record.byteCounts.combined;
        }
    }
    if (record.kind === "text" && stream === "raw") {
        return record.byteCounts.raw;
    }
    return undefined;
}
function normalizeLimits(limits) {
    return {
        maxSourceBytes: positiveInteger(limits?.maxSourceBytes) ?? DEFAULT_PROCESSING_LIMITS.maxSourceBytes,
        maxVisibleBytes: positiveInteger(limits?.maxVisibleBytes) ?? DEFAULT_PROCESSING_LIMITS.maxVisibleBytes,
    };
}
function positiveInteger(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
function repoSourceDescriptor(displayPath) {
    return {
        kind: "repo-file",
        ref: { kind: "repo", path: displayPath },
        displayPath,
    };
}
function textStats(text) {
    return {
        bytes: byteLength(text),
        lines: countLines(text),
        sha256: sha256(text),
    };
}
function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}
function countLines(text) {
    if (text.length === 0) {
        return 0;
    }
    return text.split(/\r?\n/).length;
}
function sha256(text) {
    return createHash("sha256").update(text).digest("hex");
}
function combineOutput(stdout, stderr) {
    if (stdout && stderr) {
        return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
    }
    return stdout || stderr;
}
function truncateVisible(text, maxBytes) {
    if (byteLength(text) <= maxBytes) {
        return text;
    }
    let end = Math.min(text.length, maxBytes);
    while (end > 0 && byteLength(text.slice(0, end)) > maxBytes) {
        end -= 1;
    }
    return `${text.slice(0, end)}\n… [truncated]`;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function isProcessingPathInsideRoot(root, absolutePath) {
    const relativePath = relative(root, absolutePath);
    return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !/^[A-Za-z]:/.test(relativePath));
}
