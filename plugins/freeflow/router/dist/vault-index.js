import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const DEFAULT_CHUNK_LINE_COUNT = 40;
const DEFAULT_CHUNK_MAX_BYTES = 8_192;
const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 50;
const DEFAULT_EXCERPT_BYTES = 2_048;
const LOCAL_INDEX_LOCK_RETRY_MS = 10;
const LOCAL_INDEX_LOCK_TIMEOUT_MS = 5_000;
const localIndexWriteLocks = new Map();
export function createLocalVaultIndex(vault, options = {}) {
    return new LocalVaultIndex({ root: join(vault.root, "index", "v1"), ...options });
}
export async function recordVaultIndexFailure(vault, error) {
    const index = createLocalVaultIndex(vault);
    if (index instanceof LocalVaultIndex) {
        await index.recordFailure(error);
    }
}
export class LocalVaultIndex {
    root;
    chunkLineCount;
    chunkMaxBytes;
    now;
    constructor(options) {
        this.root = options.root;
        this.chunkLineCount = options.chunkLineCount ?? DEFAULT_CHUNK_LINE_COUNT;
        this.chunkMaxBytes = options.chunkMaxBytes ?? DEFAULT_CHUNK_MAX_BYTES;
        this.now = options.now ?? (() => new Date().toISOString());
    }
    async indexRecord(record, text, metadata) {
        return withLocalIndexWriteLock(this.root, async () => {
            const state = await this.readState();
            state.entries = state.entries.filter((entry) => !(entry.sessionId === metadata.sessionId && entry.outputId === record.outputId));
            if (record.persistence.recoverability === "none") {
                await this.writeState({ ...state, updatedAt: this.now() });
                return {
                    indexed: false,
                    outputId: record.outputId,
                    entriesWritten: 0,
                    reason: "Record persistence is none; no index entry was written.",
                };
            }
            const indexedAt = this.now();
            const entries = this.entriesForRecord(record, text, metadata, indexedAt);
            state.entries.push(...entries);
            delete state.lastError;
            await this.writeState({ ...state, updatedAt: indexedAt });
            return {
                indexed: entries.length > 0,
                outputId: record.outputId,
                entriesWritten: entries.length,
                reason: record.persistence.recoverability === "metadata_only"
                    ? "Indexed metadata-only record without raw content."
                    : "Indexed exact record text chunks and metadata.",
            };
        });
    }
    async queryVault(query, filters = {}, caps = {}) {
        const state = await this.readState();
        const terms = tokenize(query);
        const topK = boundedPositiveInteger(caps.topK, DEFAULT_TOP_K, MAX_TOP_K);
        const maxExcerptBytes = boundedPositiveInteger(caps.maxExcerptBytes, DEFAULT_EXCERPT_BYTES, DEFAULT_EXCERPT_BYTES * 8);
        const matches = state.entries
            .filter((entry) => entryMatchesFilters(entry, filters))
            .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
            .filter((scored) => terms.length === 0 ? false : scored.score > 0)
            .sort((a, b) => b.score - a.score || a.entry.createdAt.localeCompare(b.entry.createdAt) || a.entry.entryId.localeCompare(b.entry.entryId))
            .slice(0, topK)
            .map(({ entry, score }) => entryToMatch(entry, score, maxExcerptBytes));
        return {
            query,
            matches,
            totalIndexedEntries: state.entries.length,
        };
    }
    async deleteExpired(options = {}) {
        return withLocalIndexWriteLock(this.root, async () => {
            const state = await this.readState();
            const now = Date.parse(options.now ?? this.now());
            const before = state.entries.length;
            state.entries = state.entries.filter((entry) => {
                if (options.sessionId !== undefined && entry.sessionId !== options.sessionId) {
                    return true;
                }
                if (!entry.expiresAt) {
                    return true;
                }
                const expiresAt = Date.parse(entry.expiresAt);
                return !Number.isFinite(expiresAt) || expiresAt > now;
            });
            await this.writeState({ ...state, updatedAt: this.now() });
            return { removedEntries: before - state.entries.length, remainingEntries: state.entries.length };
        });
    }
    async recordFailure(error) {
        await withLocalIndexWriteLock(this.root, async () => {
            const state = await this.readState().catch(() => ({ version: 1, updatedAt: this.now(), entries: [] }));
            await this.writeState({ ...state, updatedAt: this.now(), lastError: errorMessage(error) });
        });
    }
    async status() {
        let state;
        try {
            state = await this.readState();
        }
        catch (error) {
            return {
                engine: "local-json-sidecar",
                root: this.root,
                available: false,
                degraded: true,
                stale: true,
                rebuildRecommended: true,
                entryCount: 0,
                textEntryCount: 0,
                metadataOnlyEntryCount: 0,
                outputCount: 0,
                lastError: errorMessage(error),
            };
        }
        const status = {
            engine: "local-json-sidecar",
            root: this.root,
            available: true,
            degraded: state.lastError !== undefined,
            stale: state.lastError !== undefined,
            rebuildRecommended: state.lastError !== undefined,
            entryCount: state.entries.length,
            textEntryCount: state.entries.filter((entry) => !entry.metadataOnly).length,
            metadataOnlyEntryCount: state.entries.filter((entry) => entry.metadataOnly).length,
            outputCount: new Set(state.entries.map((entry) => `${entry.sessionId}:${entry.outputId}`)).size,
        };
        const lastIndexedAt = state.entries.map((entry) => entry.indexedAt).sort().at(-1);
        if (lastIndexedAt !== undefined) {
            status.lastIndexedAt = lastIndexedAt;
        }
        if (state.lastError !== undefined) {
            status.lastError = state.lastError;
        }
        return status;
    }
    entriesForRecord(record, text, metadata, indexedAt) {
        const base = {
            version: 1,
            outputId: record.outputId,
            recordId: record.recordId,
            sessionId: metadata.sessionId,
            recordKind: record.kind,
            producer: record.producer,
            ...(metadata.stream !== undefined ? { stream: metadata.stream } : {}),
            ...(metadata.hostToolName !== undefined ? { hostToolName: metadata.hostToolName } : {}),
            createdAt: record.createdAt,
            ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}),
            recoverability: record.persistence.recoverability,
            contentHashSha256: record.contentHashSha256,
            indexedAt,
        };
        const metadataText = metadataSearchText(record, metadata);
        if (record.persistence.recoverability !== "exact" || text === undefined || text.length === 0) {
            return [{
                    ...base,
                    entryId: entryId(record, metadata.sessionId, "metadata", 0),
                    chunkId: "metadata",
                    metadataText,
                    metadataOnly: true,
                }];
        }
        return chunkText(text, this.chunkLineCount, this.chunkMaxBytes).map((chunk, index) => ({
            ...base,
            entryId: entryId(record, metadata.sessionId, chunk.chunkId, index),
            chunkId: chunk.chunkId,
            lineStart: chunk.lineStart,
            lineEnd: chunk.lineEnd,
            text: chunk.text,
            metadataText,
            metadataOnly: false,
        }));
    }
    async readState() {
        try {
            return JSON.parse(await readFile(this.statePath(), "utf8"));
        }
        catch (error) {
            const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
            if (code !== "ENOENT") {
                throw error;
            }
            return { version: 1, updatedAt: this.now(), entries: [] };
        }
    }
    async writeState(state) {
        const path = this.statePath();
        await mkdir(dirname(path), { recursive: true });
        const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
        await rename(temp, path);
    }
    statePath() {
        return join(this.root, "entries.json");
    }
}
function chunkText(text, maxLines, maxBytes) {
    const lines = splitLines(text);
    const chunks = [];
    let start = 0;
    while (start < lines.length) {
        let end = start;
        let candidate = "";
        while (end < lines.length && end - start < maxLines) {
            const line = lines[end] ?? "";
            const next = candidate.length === 0 ? line : `${candidate}\n${line}`;
            if (Buffer.byteLength(next, "utf8") > maxBytes && candidate.length > 0) {
                break;
            }
            candidate = next;
            end += 1;
            if (Buffer.byteLength(candidate, "utf8") >= maxBytes) {
                break;
            }
        }
        if (end === start) {
            candidate = truncateUtf8(lines[start] ?? "", maxBytes);
            end = start + 1;
        }
        chunks.push({ chunkId: `chunk-${chunks.length + 1}`, lineStart: start + 1, lineEnd: end, text: candidate });
        start = end;
    }
    return chunks.length > 0 ? chunks : [{ chunkId: "chunk-1", lineStart: 1, lineEnd: 1, text: "" }];
}
async function withLocalIndexWriteLock(root, operation) {
    const previous = localIndexWriteLocks.get(root) ?? Promise.resolve();
    let releaseCurrent;
    const current = new Promise((resolve) => {
        releaseCurrent = resolve;
    });
    const chained = previous.catch(() => undefined).then(() => current);
    localIndexWriteLocks.set(root, chained);
    await previous.catch(() => undefined);
    try {
        return await withLocalIndexFileLock(root, operation);
    }
    finally {
        releaseCurrent();
        if (localIndexWriteLocks.get(root) === chained) {
            localIndexWriteLocks.delete(root);
        }
    }
}
async function withLocalIndexFileLock(root, operation) {
    const lockPath = join(root, ".entries.lock");
    await mkdir(root, { recursive: true });
    const startedAt = Date.now();
    let handle;
    while (handle === undefined) {
        try {
            handle = await open(lockPath, "wx");
            await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
        }
        catch (error) {
            const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
            if (code !== "EEXIST") {
                throw error;
            }
            if (Date.now() - startedAt > LOCAL_INDEX_LOCK_TIMEOUT_MS) {
                throw new Error(`Timed out waiting for vault index lock at ${root}.`);
            }
            await sleep(LOCAL_INDEX_LOCK_RETRY_MS);
        }
    }
    try {
        return await operation();
    }
    finally {
        await handle.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
    }
}
function metadataSearchText(record, metadata) {
    return stableJson({
        outputId: record.outputId,
        recordId: record.recordId,
        kind: record.kind,
        producer: record.producer,
        persistence: record.persistence,
        recordMetadata: record.kind === "metadata" ? record.metadata : undefined,
        repoReference: record.kind === "repo-file" ? { path: record.path, hashSha256: record.hashSha256 } : undefined,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        stream: metadata.stream,
        hostToolName: metadata.hostToolName,
        routingDecisionId: metadata.routingDecisionId,
        summary: metadata.summary,
        tags: metadata.tags,
        extra: metadata.extra,
    });
}
function entryMatchesFilters(entry, filters) {
    if (filters.sessionId !== undefined && entry.sessionId !== filters.sessionId)
        return false;
    if (filters.outputId !== undefined && entry.outputId !== filters.outputId)
        return false;
    if (filters.recordKind !== undefined && entry.recordKind !== filters.recordKind)
        return false;
    if (filters.producerKind !== undefined && entry.producer.kind !== filters.producerKind)
        return false;
    if (filters.server !== undefined && entry.producer.server !== filters.server)
        return false;
    if (filters.tool !== undefined && entry.producer.tool !== filters.tool)
        return false;
    if (filters.hostToolName !== undefined && entry.hostToolName !== filters.hostToolName)
        return false;
    if (filters.stream !== undefined && entry.stream !== filters.stream)
        return false;
    if (filters.recoverability !== undefined && entry.recoverability !== filters.recoverability)
        return false;
    return true;
}
function scoreEntry(entry, terms) {
    const haystack = `${entry.text ?? ""}\n${entry.metadataText}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
        const count = countOccurrences(haystack, term);
        if (count === 0) {
            continue;
        }
        score += entry.metadataOnly ? count : count * 2;
    }
    return score;
}
function entryToMatch(entry, score, maxExcerptBytes) {
    return {
        entryId: entry.entryId,
        outputId: entry.outputId,
        recordId: entry.recordId,
        sessionId: entry.sessionId,
        recordKind: entry.recordKind,
        producer: entry.producer,
        ...(entry.stream !== undefined ? { stream: entry.stream } : {}),
        recoverability: entry.recoverability,
        chunkId: entry.chunkId,
        ...(entry.lineStart !== undefined ? { lineStart: entry.lineStart } : {}),
        ...(entry.lineEnd !== undefined ? { lineEnd: entry.lineEnd } : {}),
        excerpt: truncateUtf8(entry.text ?? entry.metadataText, maxExcerptBytes),
        score,
        metadataOnly: entry.metadataOnly,
    };
}
function tokenize(query) {
    return Array.from(new Set(query.toLowerCase().match(/[a-z0-9_./:-]+/g) ?? []));
}
function countOccurrences(text, term) {
    let count = 0;
    let index = text.indexOf(term);
    while (index !== -1) {
        count += 1;
        index = text.indexOf(term, index + term.length);
    }
    return count;
}
function boundedPositiveInteger(value, defaultValue, max) {
    if (!Number.isFinite(value) || Number(value) <= 0) {
        return defaultValue;
    }
    return Math.min(max, Math.max(1, Math.floor(Number(value))));
}
function entryId(record, sessionId, chunkId, index) {
    return `ffvix_${sha256Text(`${sessionId}:${record.outputId}:${chunkId}:${index}`).slice(0, 20)}`;
}
function splitLines(text) {
    if (text.length === 0) {
        return [];
    }
    return text.split(/\r?\n/);
}
function stableJson(value) {
    return JSON.stringify(value, sortJsonKeys, 2);
}
function sortJsonKeys(_key, value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }
    return Object.keys(value).sort().reduce((sorted, key) => {
        sorted[key] = value[key];
        return sorted;
    }, {});
}
function truncateUtf8(text, maxBytes) {
    if (Buffer.byteLength(text, "utf8") <= maxBytes) {
        return text;
    }
    let output = "";
    for (const char of text) {
        const next = `${output}${char}`;
        if (Buffer.byteLength(next, "utf8") > Math.max(0, maxBytes - 1)) {
            return `${output}…`;
        }
        output = next;
    }
    return output;
}
function sha256Text(text) {
    return createHash("sha256").update(text).digest("hex");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
