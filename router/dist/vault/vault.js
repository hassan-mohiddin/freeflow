import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_VAULT_RETENTION, DEFAULT_VAULT_ROOT } from "../config/config.js";
import { createLocalVaultIndex, recordVaultIndexFailure } from "./vault-index.js";
const sessionIndexWriteLocks = new Map();
const SESSION_INDEX_LOCK_RETRY_MS = 5;
const SESSION_INDEX_LOCK_TIMEOUT_MS = 5_000;
export function createVault(options = {}) {
    return {
        root: resolveVaultRoot(options.root ?? DEFAULT_VAULT_ROOT),
        retention: options.retention ?? DEFAULT_VAULT_RETENTION,
    };
}
export function resolveVaultRoot(root) {
    if (root === "~") {
        return homedir();
    }
    if (root.startsWith("~/")) {
        return join(homedir(), root.slice(2));
    }
    return resolve(root);
}
export function commandOutputFingerprints(options) {
    const combined = options.combined ?? combineOutputSections(options.stdout, options.stderr);
    return {
        exactSha256: sha256Json({ stdout: options.stdout, stderr: options.stderr, combined }),
        normalizedSha256: sha256Json({
            stdout: normalizeOutputText(options.stdout),
            stderr: normalizeOutputText(options.stderr),
            combined: normalizeOutputText(combined),
        }),
        commandFingerprintSha256: sha256Json({
            command: options.command,
            cwd: options.cwd ?? null,
            executionStatus: options.executionStatus,
            exitCode: options.exitCode,
        }),
    };
}
export function textOutputFingerprints(options) {
    return {
        exactSha256: sha256Text(options.raw),
        normalizedSha256: sha256Text(normalizeOutputText(options.raw)),
    };
}
export async function findExactDuplicateCommandOutput(vault, options) {
    const index = await readSessionIndex(vault, options.sessionId);
    for (const outputId of index.outputs) {
        if (outputId === options.excludeOutputId) {
            continue;
        }
        const entry = index.records[outputId];
        if (!entry || entry.kind !== "command") {
            continue;
        }
        const fingerprints = entry.fingerprints;
        if (fingerprints?.exactSha256 === options.fingerprints.exactSha256 &&
            fingerprints.commandFingerprintSha256 === options.fingerprints.commandFingerprintSha256) {
            return entry;
        }
    }
    return undefined;
}
export async function findExactDuplicateTextOutput(vault, options) {
    const index = await readSessionIndex(vault, options.sessionId);
    for (const outputId of index.outputs) {
        if (outputId === options.excludeOutputId) {
            continue;
        }
        const entry = index.records[outputId];
        if (!entry || entry.kind !== "text") {
            continue;
        }
        if (entry.fingerprints?.exactSha256 === options.fingerprints.exactSha256) {
            return entry;
        }
    }
    return undefined;
}
export async function storeCommandOutput(vault, options) {
    assertStorablePersistence(options.persistence);
    const createdAt = options.createdAt ?? new Date().toISOString();
    const combined = options.combined ?? combineOutputSections(options.stdout, options.stderr);
    const decisionIds = options.decisionIds ?? [];
    const fingerprints = commandOutputFingerprints({
        command: options.command,
        stdout: options.stdout,
        stderr: options.stderr,
        combined,
        executionStatus: options.executionStatus,
        exitCode: options.exitCode,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    });
    const payloadHash = sha256Json({
        kind: "command",
        createdAt,
        command: options.command,
        cwd: options.cwd,
        executionStatus: options.executionStatus,
        exitCode: options.exitCode,
        durationMs: options.durationMs,
        stdout: options.stdout,
        stderr: options.stderr,
        combined,
        decisionIds,
    });
    const objectId = objectIdFromHash(payloadHash);
    const outputId = outputIdFromHash(payloadHash);
    const recordId = recordIdFromHash(payloadHash);
    const objectDir = objectDirectory(vault, objectId);
    const paths = {
        meta: join(objectDir, "meta.json"),
        stdout: join(objectDir, "stdout.txt"),
        stderr: join(objectDir, "stderr.txt"),
        combined: join(objectDir, "combined.txt"),
    };
    const record = {
        kind: "command",
        outputId,
        recordId,
        objectId,
        command: options.command,
        createdAt,
        executionStatus: options.executionStatus,
        exitCode: options.exitCode,
        paths,
        lineCounts: {
            stdout: countLines(options.stdout),
            stderr: countLines(options.stderr),
            combined: countLines(combined),
        },
        byteCounts: {
            stdout: byteLength(options.stdout),
            stderr: byteLength(options.stderr),
            combined: byteLength(combined),
        },
        hashes: {
            stdoutSha256: sha256Text(options.stdout),
            stderrSha256: sha256Text(options.stderr),
            combinedSha256: sha256Text(combined),
        },
        fingerprints,
        decisionIds,
        producer: options.producer ?? { kind: "command" },
        persistence: options.persistence ?? exactVaultPersistence(outputId),
        contentHashSha256: payloadHash,
        retention: vault.retention,
    };
    if (options.lineage !== undefined) {
        record.lineage = options.lineage;
    }
    const commandExpiresAt = expiresAt(createdAt, vault.retention);
    if (commandExpiresAt !== undefined) {
        record.expiresAt = commandExpiresAt;
    }
    if (options.cwd !== undefined) {
        record.cwd = options.cwd;
    }
    if (options.durationMs !== undefined) {
        record.durationMs = options.durationMs;
    }
    await mkdir(objectDir, { recursive: true });
    await writeFile(paths.stdout, options.stdout, "utf8");
    await writeFile(paths.stderr, options.stderr, "utf8");
    await writeFile(paths.combined, combined, "utf8");
    await writeJson(paths.meta, record);
    await addRecordToSessionIndex(vault, options.sessionId, record);
    await indexVaultRecordAfterAppend(vault, options.sessionId, record, combined, "combined");
    return record;
}
export async function storeTextOutput(vault, options) {
    assertStorablePersistence(options.persistence);
    const createdAt = options.createdAt ?? new Date().toISOString();
    const decisionIds = options.decisionIds ?? [];
    const fingerprints = textOutputFingerprints({ raw: options.raw });
    const payloadHash = sha256Json({
        kind: "text",
        createdAt,
        sourceKind: options.sourceKind,
        raw: options.raw,
        decisionIds,
    });
    const objectId = objectIdFromHash(payloadHash);
    const outputId = outputIdFromHash(payloadHash);
    const recordId = recordIdFromHash(payloadHash);
    const objectDir = objectDirectory(vault, objectId);
    const paths = {
        meta: join(objectDir, "meta.json"),
        raw: join(objectDir, "raw.txt"),
    };
    const record = {
        kind: "text",
        outputId,
        recordId,
        objectId,
        sourceKind: options.sourceKind,
        createdAt,
        paths,
        lineCounts: { raw: countLines(options.raw) },
        byteCounts: { raw: byteLength(options.raw) },
        hashes: { rawSha256: sha256Text(options.raw) },
        fingerprints,
        decisionIds,
        producer: options.producer ?? producerForTextSourceKind(options.sourceKind),
        persistence: options.persistence ?? exactVaultPersistence(outputId),
        contentHashSha256: payloadHash,
        retention: vault.retention,
    };
    if (options.lineage !== undefined) {
        record.lineage = options.lineage;
    }
    const textExpiresAt = expiresAt(createdAt, vault.retention);
    if (textExpiresAt !== undefined) {
        record.expiresAt = textExpiresAt;
    }
    await mkdir(objectDir, { recursive: true });
    await writeFile(paths.raw, options.raw, "utf8");
    await writeJson(paths.meta, record);
    await addRecordToSessionIndex(vault, options.sessionId, record);
    await indexVaultRecordAfterAppend(vault, options.sessionId, record, options.raw, "raw");
    return record;
}
export async function storeMetadataOutput(vault, options) {
    assertStorablePersistence(options.persistence);
    const createdAt = options.createdAt ?? new Date().toISOString();
    const decisionIds = options.decisionIds ?? [];
    const payloadHash = sha256Json({
        kind: "metadata",
        createdAt,
        sourceKind: options.sourceKind,
        rawLineCount: options.rawLineCount,
        rawByteCount: options.rawByteCount,
        rawSha256: options.rawSha256,
        metadata: options.metadata,
        decisionIds,
    });
    const objectId = objectIdFromHash(payloadHash);
    const outputId = outputIdFromHash(payloadHash);
    const recordId = recordIdFromHash(payloadHash);
    const objectDir = objectDirectory(vault, objectId);
    const paths = {
        meta: join(objectDir, "meta.json"),
    };
    const record = {
        kind: "metadata",
        outputId,
        recordId,
        objectId,
        sourceKind: options.sourceKind,
        createdAt,
        paths,
        lineCounts: { raw: options.rawLineCount },
        byteCounts: { raw: options.rawByteCount },
        hashes: options.rawSha256 !== undefined ? { rawSha256: options.rawSha256 } : {},
        decisionIds,
        producer: options.producer ?? producerForTextSourceKind(options.sourceKind),
        persistence: options.persistence ?? metadataOnlyPersistence(outputId),
        contentHashSha256: payloadHash,
        retention: vault.retention,
    };
    if (options.metadata !== undefined) {
        record.metadata = options.metadata;
    }
    if (options.lineage !== undefined) {
        record.lineage = options.lineage;
    }
    const metadataExpiresAt = expiresAt(createdAt, vault.retention);
    if (metadataExpiresAt !== undefined) {
        record.expiresAt = metadataExpiresAt;
    }
    await mkdir(objectDir, { recursive: true });
    await writeJson(paths.meta, record);
    await addRecordToSessionIndex(vault, options.sessionId, record);
    await indexVaultRecordAfterAppend(vault, options.sessionId, record, undefined);
    return record;
}
export async function storeRepoFileReference(vault, options) {
    assertStorablePersistence(options.persistence);
    const createdAt = options.createdAt ?? new Date().toISOString();
    const decisionIds = options.decisionIds ?? [];
    const payloadHash = sha256Json({
        kind: "repo-file",
        createdAt,
        path: options.path,
        hashSha256: options.hashSha256,
        decisionIds,
    });
    const objectId = objectIdFromHash(payloadHash);
    const outputId = outputIdFromHash(payloadHash);
    const recordId = recordIdFromHash(payloadHash);
    const objectDir = objectDirectory(vault, objectId);
    const paths = {
        meta: join(objectDir, "meta.json"),
    };
    const record = {
        kind: "repo-file",
        outputId,
        recordId,
        objectId,
        path: options.path,
        paths,
        decisionIds,
        createdAt,
        producer: options.producer ?? { kind: "repo" },
        persistence: options.persistence ?? metadataOnlyPersistence(),
        contentHashSha256: payloadHash,
        retention: vault.retention,
    };
    if (options.lineage !== undefined) {
        record.lineage = options.lineage;
    }
    const repoExpiresAt = expiresAt(createdAt, vault.retention);
    if (repoExpiresAt !== undefined) {
        record.expiresAt = repoExpiresAt;
    }
    if (options.hashSha256 !== undefined) {
        record.hashSha256 = options.hashSha256;
    }
    await mkdir(objectDir, { recursive: true });
    await writeJson(paths.meta, record);
    await addRecordToSessionIndex(vault, options.sessionId, record);
    await indexVaultRecordAfterAppend(vault, options.sessionId, record, undefined);
    return record;
}
export async function readVaultRecord(vault, sessionId, outputId) {
    const index = await readSessionIndex(vault, sessionId);
    const entry = index.records[outputId];
    if (!entry) {
        throw new Error(`No vault output found for ${outputId} in session ${sessionId}.`);
    }
    return readJson(join(objectDirectory(vault, entry.objectId), "meta.json"));
}
export async function readOutputText(vault, sessionId, outputId, stream) {
    const record = await readVaultRecord(vault, sessionId, outputId);
    const path = streamPath(record, stream);
    return readFile(path, "utf8");
}
export async function readOutputLines(vault, options) {
    if (!Number.isInteger(options.startLine) || !Number.isInteger(options.endLine)) {
        throw new Error("Line ranges must use integer line numbers.");
    }
    if (options.startLine < 1 || options.endLine < options.startLine) {
        throw new Error("Line ranges must be 1-based and endLine must be greater than or equal to startLine.");
    }
    const text = await readOutputText(vault, options.sessionId, options.outputId, options.stream);
    return splitLines(text).slice(options.startLine - 1, options.endLine).join("\n");
}
export async function readSessionIndex(vault, sessionId) {
    const path = sessionIndexPath(vault, sessionId);
    try {
        return (await readJson(path));
    }
    catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (code !== "ENOENT") {
            throw error;
        }
        const now = new Date().toISOString();
        return emptySessionIndex(sessionId, now);
    }
}
function assertStorablePersistence(persistence) {
    if (persistence?.recoverability === "none") {
        throw new Error("Cannot store output with persistence recoverability none; skip vault storage instead.");
    }
}
async function indexVaultRecordAfterAppend(vault, sessionId, record, text, stream) {
    try {
        const index = createLocalVaultIndex(vault);
        const metadata = {
            sessionId,
            ...(stream !== undefined ? { stream } : {}),
        };
        await index.indexRecord(record, text, metadata);
    }
    catch (error) {
        await recordVaultIndexFailure(vault, error).catch(() => undefined);
    }
}
async function addRecordToSessionIndex(vault, sessionId, record) {
    await withSessionIndexWriteLock(vault, sessionId, async () => {
        const index = await readSessionIndex(vault, sessionId);
        const updatedAt = new Date().toISOString();
        const entry = {
            outputId: record.outputId,
            recordId: record.recordId,
            objectId: record.objectId,
            kind: record.kind,
            createdAt: record.createdAt,
            producer: record.producer,
            persistence: record.persistence,
        };
        if (record.lineage !== undefined) {
            entry.lineage = record.lineage;
        }
        if (record.kind === "command") {
            entry.executionStatus = record.executionStatus;
        }
        if (record.fingerprints !== undefined) {
            entry.fingerprints = record.fingerprints;
        }
        index.updatedAt = updatedAt;
        index.records[record.outputId] = entry;
        addUnique(index.outputs, record.outputId);
        if (record.kind === "command") {
            addToExecutionGroup(index, record.executionStatus, record.outputId);
        }
        await writeJsonAtomic(sessionIndexPath(vault, sessionId), index);
    });
}
async function withSessionIndexWriteLock(vault, sessionId, operation) {
    const key = `${vault.root}:${safeSegment(sessionId)}`;
    const previous = sessionIndexWriteLocks.get(key) ?? Promise.resolve();
    let releaseCurrent;
    const current = new Promise((resolve) => {
        releaseCurrent = resolve;
    });
    const chained = previous.catch(() => undefined).then(() => current);
    sessionIndexWriteLocks.set(key, chained);
    await previous.catch(() => undefined);
    try {
        return await withSessionIndexFileLock(vault, sessionId, operation);
    }
    finally {
        releaseCurrent();
        if (sessionIndexWriteLocks.get(key) === chained) {
            sessionIndexWriteLocks.delete(key);
        }
    }
}
async function withSessionIndexFileLock(vault, sessionId, operation) {
    const path = sessionIndexLockPath(vault, sessionId);
    await mkdir(dirname(path), { recursive: true });
    const startedAt = Date.now();
    let handle;
    while (handle === undefined) {
        try {
            handle = await open(path, "wx");
            await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
        }
        catch (error) {
            const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
            if (code !== "EEXIST") {
                throw error;
            }
            if (Date.now() - startedAt > SESSION_INDEX_LOCK_TIMEOUT_MS) {
                throw new Error(`Timed out waiting for vault session index lock for ${safeSegment(sessionId)}.`);
            }
            await sleep(SESSION_INDEX_LOCK_RETRY_MS);
        }
    }
    try {
        return await operation();
    }
    finally {
        await handle.close().catch(() => undefined);
        await unlink(path).catch(() => undefined);
    }
}
function addToExecutionGroup(index, status, outputId) {
    if (status === "success") {
        addUnique(index.successful, outputId);
    }
    else if (status === "failed") {
        addUnique(index.failed, outputId);
    }
    else if (status === "timed_out") {
        addUnique(index.timedOut, outputId);
    }
    else if (status === "cancelled") {
        addUnique(index.cancelled, outputId);
    }
}
function emptySessionIndex(sessionId, now) {
    return {
        version: 1,
        sessionId: safeSegment(sessionId),
        createdAt: now,
        updatedAt: now,
        outputs: [],
        records: {},
        successful: [],
        failed: [],
        timedOut: [],
        cancelled: [],
    };
}
function streamPath(record, stream) {
    if (record.kind === "command") {
        if (stream === "raw") {
            throw new Error("Command records do not have a raw stream. Use stdout, stderr, or combined.");
        }
        return record.paths[stream];
    }
    if (record.kind === "text") {
        if (stream !== "raw") {
            throw new Error("Text records only have a raw stream.");
        }
        return record.paths.raw;
    }
    if (record.kind === "metadata") {
        throw new Error("Metadata only records store no raw stream.");
    }
    throw new Error("Repo file reference records store metadata only and have no raw stream.");
}
function sessionIndexPath(vault, sessionId) {
    return join(vault.root, "sessions", safeSegment(sessionId), "index.json");
}
function sessionIndexLockPath(vault, sessionId) {
    return `${sessionIndexPath(vault, sessionId)}.lock`;
}
function objectDirectory(vault, objectId) {
    return join(vault.root, "objects", objectId);
}
function objectIdFromHash(hash) {
    return `sha256_${hash}`;
}
function outputIdFromHash(hash) {
    return `ffout_${hash.slice(0, 24)}`;
}
function recordIdFromHash(hash) {
    return `ffrec_${hash.slice(0, 24)}`;
}
function exactVaultPersistence(outputId) {
    return {
        status: "vaulted",
        recoverability: "exact",
        recoveryOutputId: outputId,
        outputId,
    };
}
function metadataOnlyPersistence(outputId) {
    return {
        status: "metadata_only",
        recoverability: "metadata_only",
        ...(outputId !== undefined ? { outputId } : {}),
    };
}
function producerForTextSourceKind(sourceKind) {
    if (sourceKind === "native") {
        return { kind: "native" };
    }
    if (sourceKind === "script") {
        return { kind: "script" };
    }
    if (sourceKind === "mcp") {
        return { kind: "mcp" };
    }
    if (sourceKind === "web") {
        return { kind: "web" };
    }
    if (sourceKind === "fetch") {
        return { kind: "fetch" };
    }
    if (sourceKind === "code_search") {
        return { kind: "code_search" };
    }
    if (sourceKind === "transform") {
        return { kind: "transform" };
    }
    return { kind: "other" };
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
function countLines(text) {
    if (text.length === 0) {
        return 0;
    }
    return splitLines(text).length;
}
function splitLines(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}
function sha256Text(text) {
    return createHash("sha256").update(text).digest("hex");
}
function normalizeOutputText(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
}
function sha256Json(value) {
    return sha256Text(JSON.stringify(value));
}
function expiresAt(createdAt, retention) {
    if (retention.strategy !== "ttl") {
        return undefined;
    }
    const createdTime = new Date(createdAt).getTime();
    if (!Number.isFinite(createdTime)) {
        return undefined;
    }
    return new Date(createdTime + retention.ttlDays * 24 * 60 * 60 * 1_000).toISOString();
}
function addUnique(items, item) {
    if (!items.includes(item)) {
        items.push(item);
    }
}
function safeSegment(value) {
    const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_");
    return safe.length > 0 ? safe : "session";
}
async function writeJson(path, value) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
async function writeJsonAtomic(path, value) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = join(dirname(path), `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    try {
        await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        await rename(tempPath, path);
    }
    catch (error) {
        await unlink(tempPath).catch(() => undefined);
        throw error;
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function readJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
