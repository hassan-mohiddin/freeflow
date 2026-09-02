import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { assertValidRecord, createRecord, sha256 } from "./model.mjs";
import { parseRecord, renderRecord } from "./markdown-codec.mjs";
import {
  assertNoRecovery,
  inspectLockState,
  inspectRecovery,
  isStaleLock,
  recoveryPath,
  writeRecoveryMarker,
} from "./recovery.mjs";
import {
  assertGitSafeTaskPath,
  assertNoSymlinkPath,
  assertSafeRecordPath,
  nextTaskNumber,
  taskDirectory,
  taskRoot,
} from "./workspace.mjs";

const UNSUPPORTED_DIRECTORY_SYNC_ERRORS = new Set(["EBADF", "EINVAL", "ENOTSUP", "EOPNOTSUPP"]);
const NO_EXISTING_RECORD_SHA256 = "0".repeat(64);

export class PersistenceError extends Error {
  constructor(code, message, details = {}, { committed = false } = {}) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
    this.details = details;
    this.committed = committed;
    this.status = committed ? "committed-unconfirmed" : "rejected";
  }
}

function fail(code, message, details = {}, options = {}) {
  throw new PersistenceError(code, message, details, options);
}

function timestamp(value) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.valueOf())) fail("invalid-clock", "Persistence clock is invalid");
  return date.toISOString();
}

function lockPath(recordPath) {
  return join(dirname(recordPath), ".working-record.lock");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function validLock(lock) {
  return (
    lock &&
    typeof lock === "object" &&
    !Array.isArray(lock) &&
    typeof lock.token === "string" &&
    lock.token.length > 0 &&
    Number.isSafeInteger(lock.pid) &&
    lock.pid > 0 &&
    typeof lock.createdAt === "string" &&
    !Number.isNaN(Date.parse(lock.createdAt)) &&
    typeof lock.path === "string" &&
    lock.path.length > 0
  );
}

export async function inspectLock(recordPath) {
  const path = lockPath(resolve(recordPath));
  try {
    if ((await lstat(path)).isSymbolicLink()) return { status: "invalid", path };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing", path };
    return { status: "invalid", path };
  }
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing", path };
    return { status: "invalid", path };
  }
  let lock;
  try {
    lock = JSON.parse(text);
  } catch {
    return { status: "invalid", path };
  }
  return validLock(lock) ? { status: "valid", path, lock } : { status: "invalid", path };
}

async function readLockIdentity(recordPath, token, code = "lock-changed", committed = false) {
  const inspected = await inspectLock(recordPath);
  if (inspected.status !== "valid" || inspected.lock.token !== token || inspected.lock.path !== resolve(recordPath))
    fail(code, "Mutation lock identity changed", { lockPath: inspected.path }, { committed });
  return inspected.lock;
}

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!UNSUPPORTED_DIRECTORY_SYNC_ERRORS.has(error?.code))
      fail("directory-sync-failure", "Could not sync the record directory", { path }, { committed: false });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeSynced(path, text, failureCode = "temp-write-failure") {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } catch (error) {
    fail(failureCode, "Could not write and sync the candidate file", { path, cause: error?.code ?? "write" });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function removeOwnedLock(recordPath, token) {
  const inspected = await inspectLock(recordPath);
  if (inspected.status === "valid" && inspected.lock.token === token && inspected.lock.path === resolve(recordPath))
    await unlink(inspected.path).catch(() => undefined);
}

function normalizeLockArgs(rootOrRecordPath, recordPathOrOptions, maybeOptions) {
  if (typeof recordPathOrOptions === "string")
    return { root: rootOrRecordPath, recordPath: recordPathOrOptions, options: maybeOptions ?? {} };
  return { root: null, recordPath: rootOrRecordPath, options: recordPathOrOptions ?? {} };
}

export async function acquireLock(rootOrRecordPath, recordPathOrOptions, maybeOptions) {
  const { root, recordPath, options } = normalizeLockArgs(rootOrRecordPath, recordPathOrOptions, maybeOptions);
  const path = resolve(recordPath);
  if (root) await assertSafeRecordPath(root, path);
  const pathToLock = lockPath(path);
  const temporaryPath = join(dirname(path), `.${basename(pathToLock)}.${process.pid}.${randomUUID()}.tmp`);
  const metadata = {
    token: randomUUID(),
    pid: process.pid,
    createdAt: timestamp(options.now),
    path,
  };
  let published = false;
  try {
    await writeSynced(temporaryPath, JSON.stringify(metadata), "lock-publication-failure");
    await options.hooks?.afterReservation?.({ temporaryPath, lockPath: pathToLock, recordPath: path });
    await link(temporaryPath, pathToLock);
    published = true;
    await unlink(temporaryPath);
    await syncDirectory(dirname(path));
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (published) await removeOwnedLock(path, metadata.token);
    if (error?.code === "EEXIST") {
      const inspected = await inspectLockState(path);
      if (inspected.status === "invalid")
        fail("lock-metadata-invalid", "Mutation lock metadata is invalid", { lockPath: pathToLock });
      if (inspected.status === "valid" && isStaleLock(inspected.lock))
        fail("stale-lock", "The record mutation lock is stale", {
          lockPath: pathToLock,
          lock: inspected.lock,
          recoverable: true,
        });
      fail("lock-conflict", "The record mutation lock is already held", { lockPath: pathToLock });
    }
    if (error instanceof PersistenceError) throw error;
    fail("lock-publication-failure", "Could not publish complete mutation lock metadata", { lockPath: pathToLock });
  }
  const release = async () => {
    await readLockIdentity(path, metadata.token, "lock-release-failure", false);
    try {
      await unlink(pathToLock);
    } catch (error) {
      fail("lock-release-failure", "Could not release the mutation lock", {
        lockPath: pathToLock,
        cause: error?.code ?? "unlink",
      });
    }
  };
  release.token = metadata.token;
  release.lockPath = pathToLock;
  release.metadata = metadata;
  return release;
}

export async function loadRecord(root, recordPath) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") fail("missing-record", "Record does not exist", { path });
    fail("record-read-failure", "Could not read the record", { path, cause: error?.code ?? "read" });
  }
  const headerLines = text.replace(/\r\n?/g, "\n").split("\n").slice(0, 8);
  const schema = headerLines.find((line) => /^Schema:\s*\d+\s*$/.test(line))?.match(/\d+/)?.[0];
  if (!schema) fail("malformed-record", "Record has no supported schema header", { path });
  if (schema === "2") fail("legacy-record", "Legacy records are read-only until migration", { path });
  if (schema !== "3") fail("unsupported-schema", "Record uses an unsupported schema", { path, schema });
  let record;
  try {
    record = parseRecord(text);
    assertValidRecord(record);
  } catch {
    fail("invalid-record", "Record failed schema-v3 validation", { path });
  }
  return { path, text, record, sha256: sha256(text), recovery: await inspectRecovery(path) };
}

function validateCandidate(candidate) {
  try {
    assertValidRecord(candidate);
    const text = renderRecord(candidate);
    const parsed = parseRecord(text);
    assertValidRecord(parsed);
    if (!sameValue(candidate, parsed))
      fail("candidate-roundtrip-failure", "Candidate changed during Markdown parse", {});
    if (renderRecord(parsed) !== text)
      fail("candidate-roundtrip-failure", "Candidate changed during Markdown render/parse", {});
    return { text, record: parsed, sha256: sha256(text) };
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    fail("candidate-validation-failure", "Candidate failed schema-v3 validation");
  }
}

async function readSource(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") fail("missing-record", "Record does not exist", { path });
    fail("record-read-failure", "Could not read the record", { path, cause: error?.code ?? "read" });
  }
}

async function releaseSafely(release, attempted, primaryError) {
  if (!release || attempted) return primaryError;
  try {
    await release();
  } catch (error) {
    if (!primaryError) return error;
  }
  return primaryError;
}

export async function initializeRecord(root, shortName, input = {}, options = {}) {
  const tasks = taskRoot(root);
  await assertNoSymlinkPath(tasks, root);
  let entries = [];
  try {
    entries = await readdir(tasks, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") fail("task-root-read-failure", "Could not read the task root");
  }
  const number = nextTaskNumber(entries);
  const directory = taskDirectory(number, shortName);
  const taskDir = join(tasks, directory);
  const path = join(taskDir, "record.md");
  const record = createRecord(
    { ...input, name: input.name ?? input.taskName ?? shortName },
    { taskId: `T-${String(number).padStart(3, "0")}`, timestamp: options.now },
  );
  const candidate = validateCandidate(record);
  await assertGitSafeTaskPath(root, path);
  if (options.dryRun)
    return {
      status: "dry-run",
      path,
      record: candidate.record,
      candidate: candidate.record,
      candidateText: candidate.text,
      sha256: candidate.sha256,
    };
  try {
    await mkdir(tasks, { recursive: true, mode: 0o700 });
    await assertNoSymlinkPath(taskDir, root);
    await mkdir(taskDir, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") fail("task-already-exists", "Task directory already exists", { path: taskDir });
    throw error;
  }
  const temporaryPath = join(taskDir, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  const hooks = options.hooks ?? {};
  let release = null;
  let releaseAttempted = false;
  let committed = false;
  let preserveLock = false;
  const committedError = (error) =>
    error instanceof PersistenceError
      ? new PersistenceError(error.code, error.message, error.details, { committed: true })
      : new PersistenceError(
          "publication-failure",
          "Record initialization confirmation failed",
          {},
          { committed: true },
        );
  try {
    release = await acquireLock(root, path, { now: options.now, hooks });
    await writeSynced(temporaryPath, candidate.text);
    await rename(temporaryPath, path);
    committed = true;
    await hooks.afterRename?.({ recordPath: path, taskDir });
    await syncDirectory(taskDir);
    const confirmedText = await readSource(path);
    const confirmedRecord = parseRecord(confirmedText);
    assertValidRecord(confirmedRecord);
    if (!sameValue(confirmedRecord, candidate.record) || sha256(confirmedText) !== candidate.sha256)
      fail("publication-confirmation-failure", "Published record differs from the candidate", {}, { committed: true });
    await hooks.beforeRelease?.({ recordPath: path, lockPath: release.lockPath });
    releaseAttempted = true;
    await release();
    return { status: "updated", path, record: confirmedRecord, text: confirmedText, sha256: sha256(confirmedText) };
  } catch (error) {
    if (!committed) {
      let primaryError =
        error instanceof PersistenceError
          ? error
          : new PersistenceError("publication-failure", "Record initialization failed", {}, { committed: false });
      if (release && !releaseAttempted) {
        releaseAttempted = true;
        try {
          await release();
        } catch (releaseError) {
          preserveLock = true;
          primaryError =
            releaseError instanceof PersistenceError
              ? releaseError
              : new PersistenceError("lock-release-failure", "Could not release the mutation lock", {}, {});
        }
      }
      throw primaryError;
    }
    let primaryError = committedError(error);
    try {
      const marker = {
        version: 1,
        token: randomUUID(),
        pid: process.pid,
        createdAt: timestamp(options.now),
        recordPath: path,
        operation: "record.init",
        beforeSha256: NO_EXISTING_RECORD_SHA256,
        candidateSha256: candidate.sha256,
        reasonCode: primaryError.code,
      };
      await writeRecoveryMarker(root, path, marker, { beforePublish: hooks.writeRecoveryMarker });
      primaryError.details = {
        ...(primaryError.details ?? {}),
        recoveryPath: recoveryPath(path),
        recoveryRequired: true,
      };
    } catch (markerError) {
      preserveLock = true;
      primaryError = new PersistenceError(
        "recovery-marker-failure",
        "Initialization is committed but recovery evidence could not be recorded",
        {
          recoveryPath: recoveryPath(path),
          causeCode: markerError.code ?? "marker",
          publicationCode: error.code ?? "publication-failure",
        },
        { committed: true },
      );
    }
    if (!preserveLock && release && !releaseAttempted) {
      releaseAttempted = true;
      try {
        await release();
      } catch (releaseError) {
        preserveLock = true;
        const releaseFailure = committedError(releaseError);
        primaryError = new PersistenceError(
          releaseFailure.code,
          releaseFailure.message,
          { ...(primaryError.details ?? {}), ...(releaseFailure.details ?? {}) },
          { committed: true },
        );
      }
    }
    throw primaryError;
  } finally {
    if (!committed) await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function persistRecord(root, recordPath, candidate, options = {}) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  await assertNoRecovery(root, path);
  if (typeof options.expectedSha !== "string" || !/^[a-f0-9]{64}$/.test(options.expectedSha))
    fail("invalid-expected-sha", "expectedSha must be a SHA-256 hex string");
  const hooks = options.hooks ?? {};
  const sourceText = await readSource(path);
  const beforeSha256 = sha256(sourceText);
  if (beforeSha256 !== options.expectedSha) fail("stale-sha", "Expected SHA-256 does not match the record");
  const validated = validateCandidate(candidate);
  if (validated.sha256 === beforeSha256)
    return {
      status: "no-change",
      beforeSha256,
      afterSha256: beforeSha256,
      record: validated.record,
      candidate: validated.record,
      candidateText: validated.text,
    };
  if (options.dryRun)
    return {
      status: "dry-run",
      beforeSha256,
      afterSha256: beforeSha256,
      candidate: validated.record,
      candidateText: validated.text,
    };

  const release = await acquireLock(root, path, { now: options.now, hooks });
  let tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let committed = false;
  let preserveLock = false;
  let releaseAttempted = false;
  let primaryError = null;
  try {
    const lockedSource = await readSource(path);
    if (sha256(lockedSource) !== options.expectedSha)
      fail("stale-sha", "Expected SHA-256 does not match the record after lock acquisition");
    await writeSynced(tempPath, validated.text);
    await hooks.afterTempWrite?.({ tempPath, recordPath: path, lockPath: release.lockPath });
    await hooks.beforeRename?.({ tempPath, recordPath: path, lockPath: release.lockPath });
    const sourceBeforeRename = await readSource(path);
    if (sha256(sourceBeforeRename) !== options.expectedSha)
      fail("stale-source", "Record changed before atomic publication");
    await readLockIdentity(path, release.token);
    await rename(tempPath, path);
    tempPath = null;
    committed = true;
    await hooks.afterRename?.({ recordPath: path, lockPath: release.lockPath });
    await syncDirectory(dirname(path));
    const confirmedText = await readSource(path);
    const confirmedRecord = parseRecord(confirmedText);
    assertValidRecord(confirmedRecord);
    if (!sameValue(confirmedRecord, validated.record) || sha256(confirmedText) !== validated.sha256)
      fail("publication-confirmation-failure", "Published record differs from the candidate", {}, { committed: true });
    await hooks.beforeRelease?.({ recordPath: path, lockPath: release.lockPath });
    releaseAttempted = true;
    await release();
    return {
      status: "updated",
      commitStatus: "committed",
      beforeSha256,
      afterSha256: sha256(confirmedText),
      record: confirmedRecord,
      candidateText: confirmedText,
    };
  } catch (error) {
    primaryError =
      error instanceof PersistenceError
        ? error
        : new PersistenceError("publication-failure", "Record publication failed", {}, { committed });
    if (committed && !primaryError.committed) primaryError.committed = true;
    primaryError.status = committed ? "committed-unconfirmed" : "rejected";
    if (committed) {
      try {
        const marker = {
          version: 1,
          token: release.token,
          pid: process.pid,
          createdAt: timestamp(options.now),
          recordPath: path,
          operation: options.operation ?? "persistRecord",
          beforeSha256,
          candidateSha256: validated.sha256,
          reasonCode: primaryError.code,
        };
        await writeRecoveryMarker(root, path, marker, { beforePublish: hooks.writeRecoveryMarker });
        primaryError.details = {
          ...(primaryError.details ?? {}),
          recoveryPath: recoveryPath(path),
          recoveryRequired: true,
        };
      } catch (markerError) {
        preserveLock = true;
        primaryError = new PersistenceError(
          "recovery-marker-failure",
          "Publication is committed but recovery marker publication failed",
          { recoveryPath: recoveryPath(path), causeCode: markerError.code ?? "marker", publicationCode: error.code },
          { committed: true },
        );
        primaryError.status = "committed-unconfirmed";
      }
    }
  } finally {
    if (tempPath) await unlink(tempPath).catch(() => undefined);
    if (!releaseAttempted && !preserveLock) {
      releaseAttempted = true;
      primaryError = await releaseSafely(release, false, primaryError);
    }
  }
  throw primaryError;
}

export { lockPath };
