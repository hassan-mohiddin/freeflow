import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { DEFAULT_VAULT_RETENTION, DEFAULT_VAULT_ROOT } from "./config.js";
import type {
  CommandOutputRecord,
  ExecutionStatus,
  OutputFingerprints,
  OutputStream,
  RepoFileReferenceRecord,
  RouterVaultConfig,
  SessionIndexEntry,
  TextOutputRecord,
  VaultRecord,
  VaultRetentionPolicy,
  VaultSessionIndex,
} from "./types.js";

export interface VaultHandle {
  root: string;
  retention: VaultRetentionPolicy;
}

export interface CreateVaultOptions extends Partial<RouterVaultConfig> {}

export interface StoreCommandOutputOptions {
  sessionId: string;
  command: string | readonly string[];
  stdout: string;
  stderr: string;
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  combined?: string;
  cwd?: string;
  durationMs?: number;
  decisionIds?: string[];
  createdAt?: string;
}

export interface StoreTextOutputOptions {
  sessionId: string;
  raw: string;
  sourceKind: TextOutputRecord["sourceKind"];
  decisionIds?: string[];
  createdAt?: string;
}

export interface StoreRepoFileReferenceOptions {
  sessionId: string;
  path: string;
  hashSha256?: string;
  decisionIds?: string[];
  createdAt?: string;
}

export interface ReadOutputLinesOptions {
  sessionId: string;
  outputId: string;
  stream: OutputStream;
  startLine: number;
  endLine: number;
}

export interface CommandOutputFingerprintOptions {
  command: string | readonly string[];
  stdout: string;
  stderr: string;
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  combined?: string;
  cwd?: string;
}

export interface TextOutputFingerprintOptions {
  raw: string;
}

export interface FindExactDuplicateCommandOutputOptions {
  sessionId: string;
  fingerprints: OutputFingerprints & { commandFingerprintSha256: string };
  excludeOutputId?: string;
}

export interface FindExactDuplicateTextOutputOptions {
  sessionId: string;
  fingerprints: OutputFingerprints;
  excludeOutputId?: string;
}

export function createVault(options: CreateVaultOptions = {}): VaultHandle {
  return {
    root: resolveVaultRoot(options.root ?? DEFAULT_VAULT_ROOT),
    retention: options.retention ?? DEFAULT_VAULT_RETENTION,
  };
}

export function resolveVaultRoot(root: string): string {
  if (root === "~") {
    return homedir();
  }

  if (root.startsWith("~/")) {
    return join(homedir(), root.slice(2));
  }

  return resolve(root);
}

export function commandOutputFingerprints(
  options: CommandOutputFingerprintOptions,
): OutputFingerprints & { commandFingerprintSha256: string } {
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

export function textOutputFingerprints(options: TextOutputFingerprintOptions): OutputFingerprints {
  return {
    exactSha256: sha256Text(options.raw),
    normalizedSha256: sha256Text(normalizeOutputText(options.raw)),
  };
}

export async function findExactDuplicateCommandOutput(
  vault: VaultHandle,
  options: FindExactDuplicateCommandOutputOptions,
): Promise<SessionIndexEntry | undefined> {
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
    if (
      fingerprints?.exactSha256 === options.fingerprints.exactSha256 &&
      fingerprints.commandFingerprintSha256 === options.fingerprints.commandFingerprintSha256
    ) {
      return entry;
    }
  }

  return undefined;
}

export async function findExactDuplicateTextOutput(
  vault: VaultHandle,
  options: FindExactDuplicateTextOutputOptions,
): Promise<SessionIndexEntry | undefined> {
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

export async function storeCommandOutput(
  vault: VaultHandle,
  options: StoreCommandOutputOptions,
): Promise<CommandOutputRecord> {
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
  const objectDir = objectDirectory(vault, objectId);
  const paths = {
    meta: join(objectDir, "meta.json"),
    stdout: join(objectDir, "stdout.txt"),
    stderr: join(objectDir, "stderr.txt"),
    combined: join(objectDir, "combined.txt"),
  };

  const record: CommandOutputRecord = {
    kind: "command",
    outputId,
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
    contentHashSha256: payloadHash,
    retention: vault.retention,
  };

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

  return record;
}

export async function storeTextOutput(
  vault: VaultHandle,
  options: StoreTextOutputOptions,
): Promise<TextOutputRecord> {
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
  const objectDir = objectDirectory(vault, objectId);
  const paths = {
    meta: join(objectDir, "meta.json"),
    raw: join(objectDir, "raw.txt"),
  };
  const record: TextOutputRecord = {
    kind: "text",
    outputId,
    objectId,
    sourceKind: options.sourceKind,
    createdAt,
    paths,
    lineCounts: { raw: countLines(options.raw) },
    byteCounts: { raw: byteLength(options.raw) },
    hashes: { rawSha256: sha256Text(options.raw) },
    fingerprints,
    decisionIds,
    contentHashSha256: payloadHash,
    retention: vault.retention,
  };

  const textExpiresAt = expiresAt(createdAt, vault.retention);
  if (textExpiresAt !== undefined) {
    record.expiresAt = textExpiresAt;
  }

  await mkdir(objectDir, { recursive: true });
  await writeFile(paths.raw, options.raw, "utf8");
  await writeJson(paths.meta, record);
  await addRecordToSessionIndex(vault, options.sessionId, record);

  return record;
}

export async function storeRepoFileReference(
  vault: VaultHandle,
  options: StoreRepoFileReferenceOptions,
): Promise<RepoFileReferenceRecord> {
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
  const objectDir = objectDirectory(vault, objectId);
  const paths = {
    meta: join(objectDir, "meta.json"),
  };
  const record: RepoFileReferenceRecord = {
    kind: "repo-file",
    outputId,
    objectId,
    path: options.path,
    paths,
    decisionIds,
    createdAt,
    contentHashSha256: payloadHash,
    retention: vault.retention,
  };

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

  return record;
}

export async function readVaultRecord(
  vault: VaultHandle,
  sessionId: string,
  outputId: string,
): Promise<VaultRecord> {
  const index = await readSessionIndex(vault, sessionId);
  const entry = index.records[outputId];
  if (!entry) {
    throw new Error(`No vault output found for ${outputId} in session ${sessionId}.`);
  }

  return readJson(join(objectDirectory(vault, entry.objectId), "meta.json")) as Promise<VaultRecord>;
}

export async function readOutputText(
  vault: VaultHandle,
  sessionId: string,
  outputId: string,
  stream: OutputStream,
): Promise<string> {
  const record = await readVaultRecord(vault, sessionId, outputId);
  const path = streamPath(record, stream);
  return readFile(path, "utf8");
}

export async function readOutputLines(vault: VaultHandle, options: ReadOutputLinesOptions): Promise<string> {
  if (!Number.isInteger(options.startLine) || !Number.isInteger(options.endLine)) {
    throw new Error("Line ranges must use integer line numbers.");
  }
  if (options.startLine < 1 || options.endLine < options.startLine) {
    throw new Error("Line ranges must be 1-based and endLine must be greater than or equal to startLine.");
  }

  const text = await readOutputText(vault, options.sessionId, options.outputId, options.stream);
  return splitLines(text).slice(options.startLine - 1, options.endLine).join("\n");
}

export async function readSessionIndex(vault: VaultHandle, sessionId: string): Promise<VaultSessionIndex> {
  const path = sessionIndexPath(vault, sessionId);
  try {
    return (await readJson(path)) as VaultSessionIndex;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") {
      throw error;
    }
    const now = new Date().toISOString();
    return emptySessionIndex(sessionId, now);
  }
}

async function addRecordToSessionIndex(vault: VaultHandle, sessionId: string, record: VaultRecord) {
  const index = await readSessionIndex(vault, sessionId);
  const updatedAt = new Date().toISOString();
  const entry: SessionIndexEntry = {
    outputId: record.outputId,
    objectId: record.objectId,
    kind: record.kind,
    createdAt: record.createdAt,
  };

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

  await writeJson(sessionIndexPath(vault, sessionId), index);
}

function addToExecutionGroup(index: VaultSessionIndex, status: ExecutionStatus, outputId: string) {
  if (status === "success") {
    addUnique(index.successful, outputId);
  } else if (status === "failed") {
    addUnique(index.failed, outputId);
  } else if (status === "timed_out") {
    addUnique(index.timedOut, outputId);
  } else if (status === "cancelled") {
    addUnique(index.cancelled, outputId);
  }
}

function emptySessionIndex(sessionId: string, now: string): VaultSessionIndex {
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

function streamPath(record: VaultRecord, stream: OutputStream): string {
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

  throw new Error("Repo file reference records store metadata only and have no raw stream.");
}

function sessionIndexPath(vault: VaultHandle, sessionId: string): string {
  return join(vault.root, "sessions", safeSegment(sessionId), "index.json");
}

function objectDirectory(vault: VaultHandle, objectId: string): string {
  return join(vault.root, "objects", objectId);
}

function objectIdFromHash(hash: string): string {
  return `sha256_${hash}`;
}

function outputIdFromHash(hash: string): string {
  return `ffout_${hash.slice(0, 24)}`;
}

function combineOutputSections(stdout: string, stderr: string): string {
  if (stdout.length === 0) {
    return stderr;
  }
  if (stderr.length === 0) {
    return stdout;
  }
  return `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return splitLines(text).length;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeOutputText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
}

function sha256Json(value: unknown): string {
  return sha256Text(JSON.stringify(value));
}

function expiresAt(createdAt: string, retention: VaultRetentionPolicy): string | undefined {
  if (retention.strategy !== "ttl") {
    return undefined;
  }

  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) {
    return undefined;
  }

  return new Date(createdTime + retention.ttlDays * 24 * 60 * 60 * 1_000).toISOString();
}

function addUnique(items: string[], item: string) {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function safeSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.length > 0 ? safe : "session";
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}
