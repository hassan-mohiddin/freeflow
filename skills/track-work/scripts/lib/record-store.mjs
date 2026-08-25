import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { WorkingRecordError, canonicalizeValue, fail, failureInjection, sha256, validateModel } from "./model.mjs";
import { parseRecord, renderRecord } from "./codec.mjs";
import { assertNoSymlinkPath, assertTaskRecordPath, displayPath, exists, taskRoot } from "./workspace.mjs";

const STALE_LOCK_AGE_MS = 5 * 60 * 1000;

function lockPath(recordPath) {
  return join(dirname(recordPath), ".working-record.lock");
}

function validLock(lock) {
  return (
    lock &&
    typeof lock === "object" &&
    !Array.isArray(lock) &&
    Number.isSafeInteger(lock.pid) &&
    lock.pid > 0 &&
    typeof lock.createdAt === "string" &&
    Number.isFinite(Date.parse(lock.createdAt)) &&
    typeof lock.path === "string" &&
    lock.path.length > 0
  );
}

async function inspectLock(lockFile) {
  let text;
  try {
    text = await readFile(lockFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing" };
    return { status: "invalid" };
  }
  let lock;
  try {
    lock = JSON.parse(text);
  } catch {
    return { status: "invalid" };
  }
  return validLock(lock) ? { status: "valid", lock } : { status: "invalid" };
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function staleLock(lock) {
  const createdAt = typeof lock?.createdAt === "string" ? Date.parse(lock.createdAt) : NaN;
  return Number.isFinite(createdAt) && Date.now() - createdAt >= STALE_LOCK_AGE_MS && !processAlive(lock.pid);
}

export async function loadRecord(root, recordPath) {
  const path = assertTaskRecordPath(root, recordPath);
  await assertNoSymlinkPath(path, root);
  if (!(await exists(path)))
    fail("missing-record", `Record does not exist: ${displayPath(root, path)}`, { path: displayPath(root, path) });
  const text = await readFile(path, "utf8");
  const rawSha = sha256(text);
  let parsed;
  try {
    parsed = parseRecord(text, path);
  } catch (error) {
    if (error instanceof WorkingRecordError) {
      error.details = { ...error.details, path: displayPath(root, path), sha256: rawSha };
    }
    throw error;
  }
  return { path, text, rawSha, ...parsed };
}

export async function acquireLock(recordPath) {
  const lockFile = lockPath(recordPath);
  let handle;
  let created = false;
  try {
    handle = await open(lockFile, "wx");
    created = true;
    if (failureInjection("lock-write")) fail("lock-write-failure", "Injected lock metadata write failure");
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), path: recordPath }));
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    if (created) {
      try {
        await unlink(lockFile);
      } catch (cleanupError) {
        fail("lock-cleanup-failure", "Could not clean up an incomplete mutation lock", {
          lockPath: lockFile,
          cause: cleanupError.message,
        });
      }
    }
    if (error?.code === "EEXIST") {
      const inspected = await inspectLock(lockFile);
      if (inspected.status === "invalid")
        fail("lock-metadata-invalid", `Mutation lock metadata is invalid: ${lockFile}`, { lockPath: lockFile });
      if (inspected.status === "valid" && staleLock(inspected.lock))
        fail("stale-lock", `Task mutation lock is stale: ${lockFile}`, {
          lockPath: lockFile,
          recoverable: true,
          lock: inspected.lock,
        });
      fail("lock-conflict", `Task mutation lock is held: ${lockFile}`, { lockPath: lockFile });
    }
    throw error;
  }
  return async () => {
    await unlink(lockFile).catch(() => undefined);
  };
}

export async function recoverStaleLock(root, ownerPath, input) {
  const lockFile = lockPath(ownerPath);
  await assertNoSymlinkPath(lockFile, taskRoot(root));
  const inspected = await inspectLock(lockFile);
  if (inspected.status === "missing")
    fail("stale-lock-changed", `The stale lock disappeared before recovery: ${lockFile}`, { lockPath: lockFile });
  if (inspected.status === "invalid")
    fail("lock-metadata-invalid", `Mutation lock metadata is invalid: ${lockFile}`, { lockPath: lockFile });
  const existing = inspected.lock;
  if (!staleLock(existing))
    fail("lock-conflict", `Task mutation lock is not stale: ${lockFile}`, { lockPath: lockFile });
  if (resolve(root, existing.path ?? "") !== resolve(ownerPath))
    fail("stale-lock-owner-mismatch", "The stale lock belongs to a different owner path", {
      lockPath: lockFile,
      expectedOwnerPath: resolve(ownerPath),
      actualOwnerPath: existing.path,
    });
  if (existing.pid !== input.lockPid || existing.createdAt !== input.lockCreatedAt)
    fail("stale-lock-changed", "The stale lock changed before recovery", { lockPath: lockFile, lock: existing });
  if (failureInjection("stale-lock-recheck"))
    await writeFile(lockFile, JSON.stringify({ ...existing, createdAt: "2000-01-01T00:00:01.000Z" }));
  const confirmedInspection = await inspectLock(lockFile);
  if (
    confirmedInspection.status !== "valid" ||
    JSON.stringify(canonicalizeValue(confirmedInspection.lock)) !== JSON.stringify(canonicalizeValue(existing))
  )
    fail("stale-lock-changed", "The stale lock changed before recovery", { lockPath: lockFile });
  const recoveryPath = `${lockFile}.${process.pid}.${randomUUID()}.recovery`;
  try {
    await rename(lockFile, recoveryPath);
  } catch (error) {
    if (error?.code === "ENOENT")
      fail("stale-lock-changed", "The stale lock changed before recovery", { lockPath: lockFile });
    fail("lock-recovery-failure", "Could not claim the stale lock for recovery", {
      lockPath: lockFile,
      cause: error.message,
    });
  }
  try {
    await unlink(recoveryPath);
  } catch (error) {
    fail("lock-recovery-failure", "Could not remove the quarantined stale lock", {
      lockPath: lockFile,
      recoveryPath,
      cause: error.message,
    });
  }
  return { lockPath: lockFile, ownerPath, lock: confirmedInspection.lock };
}

export async function withMutationLock(recordPath, options, callback) {
  const release = await acquireLock(recordPath, options);
  try {
    return await callback();
  } finally {
    await release();
  }
}

export function requireV2(loaded) {
  if (loaded.kind !== "v2")
    fail("legacy-read-only", "Legacy or unsupported records are read-only until explicit migration");
  const errors = validateModel(loaded.data);
  if (errors.length) fail("invalid-record", "Record failed schema validation", { validation: errors });
}
export async function commitText(recordPath, candidateText, candidateData) {
  const temporaryPath = join(dirname(recordPath), `.${basename(recordPath)}.${process.pid}.${randomUUID()}.tmp`);
  let committed = false;
  try {
    if (failureInjection("temp-write")) fail("temp-write-failure", "Injected temporary-write failure");
    await writeFile(temporaryPath, candidateText, { encoding: "utf8", flag: "wx" });
    if (failureInjection("candidate-validation"))
      fail("candidate-validation-failure", "Injected candidate-validation failure");
    const reparsed = parseRecord(candidateText, recordPath);
    const validation =
      reparsed.kind === "v2"
        ? validateModel(reparsed.data)
        : [{ code: "legacy-candidate", message: "Candidate must be schema v2" }];
    if (validation.length) fail("candidate-validation-failure", "Candidate failed validation", { validation });
    if (JSON.stringify(canonicalizeValue(candidateData)) !== JSON.stringify(canonicalizeValue(reparsed.data)))
      fail("candidate-roundtrip-failure", "Candidate changed during Markdown parse", { path: recordPath });
    if (renderRecord(reparsed.data) !== candidateText)
      fail("candidate-roundtrip-failure", "Candidate changed during Markdown render/parse round-trip", {
        path: recordPath,
      });
    if (failureInjection("rename")) fail("rename-failure", "Injected atomic rename failure");
    await rename(temporaryPath, recordPath);
    committed = true;
    if (failureInjection("confirmation")) {
      throw new WorkingRecordError(
        "publication-confirmation-failure",
        "Injected publication confirmation failure",
        {},
        {
          committed: true,
          candidate: { data: candidateData, sha256: sha256(candidateText), path: recordPath },
        },
      );
    }
    const confirmedText = await readFile(recordPath, "utf8");
    const confirmed = parseRecord(confirmedText, recordPath);
    const confirmedValidation =
      confirmed.kind === "v2"
        ? validateModel(confirmed.data)
        : [{ code: "unsupported-schema", message: "Committed record is not schema v2" }];
    if (confirmedValidation.length) {
      throw new WorkingRecordError(
        "publication-confirmation-failure",
        "Committed record failed publication validation",
        { validation: confirmedValidation },
        {
          committed: true,
          candidate: { data: candidateData, sha256: sha256(candidateText), path: recordPath },
        },
      );
    }
    return { data: confirmed.data, text: confirmedText, sha256: sha256(confirmedText) };
  } catch (error) {
    if (!committed) await unlink(temporaryPath).catch(() => undefined);
    if (error instanceof WorkingRecordError) throw error;
    if (committed) {
      throw new WorkingRecordError(
        "publication-confirmation-failure",
        "Could not confirm committed record publication",
        { cause: error.message },
        {
          committed: true,
          candidate: { data: candidateData, sha256: sha256(candidateText), path: recordPath },
        },
      );
    }
    throw error;
  } finally {
    if (!committed) await unlink(temporaryPath).catch(() => undefined);
  }
}
export class CommittedResultError extends Error {
  constructor(result) {
    super(result.errors?.[0]?.message ?? "Committed but unconfirmed");
    this.name = "CommittedResultError";
    this.result = result;
    this.exitCode = 2;
  }
}
