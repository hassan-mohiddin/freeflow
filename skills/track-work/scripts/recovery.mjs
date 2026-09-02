import { randomUUID } from "node:crypto";
import { link, lstat, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertValidRecord, sha256 } from "./model.mjs";
import { parseRecord } from "./markdown-codec.mjs";
import { assertGitSafeTaskPath, assertSafeRecordPath } from "./workspace.mjs";

const MARKER_NAME = ".working-record.recovery.json";
const QUARANTINE_PREFIX = ".working-record.lock.";
const QUARANTINE_SUFFIX = ".quarantine";
const STALE_LOCK_AGE_MS = 5 * 60 * 1000;
const UNSUPPORTED_DIRECTORY_SYNC_ERRORS = new Set(["EBADF", "EINVAL", "ENOTSUP", "EOPNOTSUPP"]);
const MARKER_KEYS = new Set([
  "version",
  "token",
  "pid",
  "createdAt",
  "recordPath",
  "operation",
  "beforeSha256",
  "candidateSha256",
  "reasonCode",
]);

export class RecoveryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RecoveryError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new RecoveryError(code, message, details);
}

function lockPath(recordPath) {
  return join(dirname(resolve(recordPath)), ".working-record.lock");
}

export function recoveryPath(recordPath) {
  return join(dirname(resolve(recordPath)), MARKER_NAME);
}

function quarantineName(recordPath) {
  return join(dirname(resolve(recordPath)), `${QUARANTINE_PREFIX}${process.pid}.${randomUUID()}${QUARANTINE_SUFFIX}`);
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

function validMarker(marker) {
  return (
    marker &&
    typeof marker === "object" &&
    !Array.isArray(marker) &&
    Object.keys(marker).every((key) => MARKER_KEYS.has(key)) &&
    marker.version === 1 &&
    typeof marker.token === "string" &&
    marker.token.length > 0 &&
    Number.isSafeInteger(marker.pid) &&
    marker.pid > 0 &&
    typeof marker.createdAt === "string" &&
    !Number.isNaN(Date.parse(marker.createdAt)) &&
    typeof marker.recordPath === "string" &&
    marker.recordPath.length > 0 &&
    typeof marker.operation === "string" &&
    marker.operation.length > 0 &&
    /^[a-f0-9]{64}$/.test(marker.beforeSha256) &&
    /^[a-f0-9]{64}$/.test(marker.candidateSha256) &&
    typeof marker.reasonCode === "string" &&
    marker.reasonCode.length > 0
  );
}

async function readJsonFile(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing", path };
    return { status: "invalid", path };
  }
  try {
    const value = JSON.parse(text);
    return { status: "valid", path, value };
  } catch {
    return { status: "invalid", path };
  }
}

export async function inspectLockState(recordPath) {
  const path = lockPath(recordPath);
  try {
    if ((await lstat(path)).isSymbolicLink()) return { status: "invalid", path };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing", path };
    return { status: "invalid", path };
  }
  const parsed = await readJsonFile(path);
  if (parsed.status !== "valid" || !validLock(parsed.value)) return { status: "invalid", path };
  return { status: "valid", path, lock: parsed.value };
}

export function isStaleLock(lock, now = Date.now()) {
  return validLock(lock) && now - Date.parse(lock.createdAt) >= STALE_LOCK_AGE_MS && !processAlive(lock.pid);
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

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!UNSUPPORTED_DIRECTORY_SYNC_ERRORS.has(error?.code))
      fail("recovery-directory-sync-failure", "Could not sync the recovery directory", { path });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeSynced(path, text) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } catch (error) {
    fail("recovery-marker-failure", "Could not write the recovery marker", { path, cause: error?.code ?? "write" });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function listQuarantines(recordPath) {
  const directory = dirname(resolve(recordPath));
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    fail("recovery-inspection-failure", "Could not inspect recovery quarantine", { path: directory });
  }
  const result = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(QUARANTINE_PREFIX) || !entry.name.endsWith(QUARANTINE_SUFFIX)) continue;
    const path = join(directory, entry.name);
    if (!entry.isFile()) {
      result.push({ path, status: "invalid" });
      continue;
    }
    const parsed = await readJsonFile(path);
    if (parsed.status !== "valid" || !validLock(parsed.value)) result.push({ path, status: "invalid" });
    else result.push({ path, status: "valid", lock: parsed.value });
  }
  return result;
}

export async function inspectRecovery(recordPath) {
  const markerPath = recoveryPath(recordPath);
  let markerInspection;
  try {
    if ((await lstat(markerPath)).isSymbolicLink()) markerInspection = { status: "invalid", path: markerPath };
    else markerInspection = await readJsonFile(markerPath);
  } catch (error) {
    if (error?.code === "ENOENT") markerInspection = { status: "missing", path: markerPath };
    else markerInspection = { status: "invalid", path: markerPath };
  }
  const quarantines = await listQuarantines(recordPath);
  if (
    markerInspection.status === "valid" &&
    validMarker(markerInspection.value) &&
    markerInspection.value.recordPath === resolve(recordPath)
  )
    return {
      status: "valid",
      path: markerPath,
      marker: markerInspection.value,
      quarantinePaths: quarantines.map((item) => item.path),
    };
  if (markerInspection.status !== "missing")
    return { status: "invalid", path: markerPath, quarantinePaths: quarantines.map((item) => item.path) };
  if (quarantines.length)
    return { status: "quarantined", path: null, quarantinePaths: quarantines.map((item) => item.path), quarantines };
  return { status: "missing", path: markerPath, quarantinePaths: [] };
}

export async function assertNoRecovery(root, recordPath) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  const state = await inspectRecovery(path);
  if (state.status !== "missing")
    fail("recovery-required", "Recovery evidence must be reconciled before semantic mutation", {
      status: state.status,
      path: state.path,
      quarantinePaths: state.quarantinePaths,
    });
  return state;
}

export async function writeRecoveryMarker(root, recordPath, marker, options = {}) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  if (!validMarker(marker)) fail("recovery-marker-failure", "Recovery marker metadata is invalid");
  const markerFile = recoveryPath(path);
  const existing = await inspectRecovery(path);
  if (existing.status !== "missing")
    fail("recovery-marker-exists", "Recovery evidence already exists", { path: markerFile });
  const temporaryPath = `${markerFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeSynced(temporaryPath, JSON.stringify(marker));
    await options.beforePublish?.({ temporaryPath, markerPath: markerFile, recordPath: path });
    await link(temporaryPath, markerFile);
    await unlink(temporaryPath);
    await syncDirectory(dirname(path));
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (error instanceof RecoveryError) throw error;
    if (error?.code === "EEXIST")
      fail("recovery-marker-exists", "Recovery evidence already exists", { path: markerFile });
    fail("recovery-marker-failure", "Could not publish the recovery marker", { path: markerFile });
  }
  return { status: "written", path: markerFile, marker };
}

export async function clearRecoveryMarker(root, recordPath, token) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  const state = await inspectRecovery(path);
  if (state.status === "missing") return { status: "missing" };
  if (state.status !== "valid" || state.quarantinePaths.length || state.marker.token !== token)
    fail("recovery-marker-changed", "Recovery evidence changed before cleanup", {
      path: state.path,
      quarantinePaths: state.quarantinePaths,
    });
  try {
    await unlink(state.path);
    await syncDirectory(dirname(path));
  } catch (error) {
    fail("recovery-cleanup-failure", "Could not clear recovery evidence", {
      path: state.path,
      cause: error?.code ?? "unlink",
    });
  }
  return { status: "cleared", path: state.path };
}

function selectorsMatch(lock, selectors, recordPath) {
  return (
    selectors &&
    selectors.token === lock.token &&
    selectors.pid === lock.pid &&
    selectors.createdAt === lock.createdAt &&
    selectors.path === lock.path &&
    lock.path === resolve(recordPath)
  );
}

function assertSelectors(selectors) {
  const keys = ["token", "pid", "createdAt", "path"];
  if (
    !selectors ||
    typeof selectors !== "object" ||
    Array.isArray(selectors) ||
    Object.keys(selectors).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(selectors, key))
  )
    fail("stale-lock-input", "Stale-lock recovery requires exact token, pid, createdAt, and path selectors");
}

async function loadRecordForRecovery(root, recordPath) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    fail("recovery-validation-failure", "Could not read the record during recovery");
  }
  try {
    const record = parseRecord(text);
    assertValidRecord(record);
    return { path, text, record, sha256: sha256(text) };
  } catch {
    fail("recovery-validation-failure", "The actual record failed fresh validation");
  }
}

export async function reconcileRecovery(root, recordPath) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  const state = await inspectRecovery(path);
  if (state.status === "missing") return { status: "no-recovery" };
  if (state.status !== "valid" || state.quarantinePaths.length)
    return { status: state.status === "valid" ? "quarantined" : state.status, quarantinePaths: state.quarantinePaths };
  const actual = await loadRecordForRecovery(root, path);
  const marker = state.marker;
  const classification =
    actual.sha256 === marker.candidateSha256
      ? "committed"
      : actual.sha256 === marker.beforeSha256
        ? "rejected"
        : "conflict";
  if (classification === "conflict") return { status: "conflict", actualSha256: actual.sha256, marker };
  await clearRecoveryMarker(root, path, marker.token);
  return { status: "recovered", classification, actualSha256: actual.sha256, record: actual.record };
}

export async function recoverStaleLock(root, recordPath, selectors, options = {}) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  const recoveryState = await inspectRecovery(path);
  if (recoveryState.status === "valid" || recoveryState.status === "invalid")
    fail("recovery-required", "Publication recovery must be reconciled before stale-lock recovery", {
      path: recoveryState.path,
      quarantinePaths: recoveryState.quarantinePaths,
    });
  assertSelectors(selectors);
  const inspected = await inspectLockState(path);
  let targetPath = inspected.path;
  let lock = inspected.lock;
  if (inspected.status === "valid") {
    if (!isStaleLock(lock))
      fail("lock-conflict", "The record mutation lock is not stale", { lockPath: inspected.path });
    if (!selectorsMatch(lock, selectors, path))
      fail("stale-lock-changed", "The stale lock selectors do not match", { lockPath: inspected.path });
    const confirmed = await inspectLockState(path);
    if (confirmed.status !== "valid" || !selectorsMatch(confirmed.lock, selectors, path))
      fail("stale-lock-changed", "The stale lock changed before recovery", { lockPath: inspected.path });
    const quarantinePath = quarantineName(path);
    try {
      await rename(inspected.path, quarantinePath);
      await syncDirectory(dirname(path));
    } catch (error) {
      fail("stale-lock-changed", "The stale lock changed before quarantine", { lockPath: inspected.path });
    }
    targetPath = quarantinePath;
  } else if (inspected.status === "invalid") {
    fail("lock-metadata-invalid", "Mutation lock metadata is invalid", { lockPath: inspected.path });
  } else {
    const quarantines = (await inspectRecovery(path)).quarantines ?? [];
    const match = quarantines.find((item) => item.status === "valid" && selectorsMatch(item.lock, selectors, path));
    if (!match)
      fail("stale-lock-changed", "The stale lock is no longer available for exact recovery", {
        lockPath: inspected.path,
      });
    targetPath = match.path;
    lock = match.lock;
  }
  try {
    await options.hooks?.afterQuarantine?.({ quarantinePath: targetPath, lockPath: inspected.path, recordPath: path });
    await unlink(targetPath);
    await syncDirectory(dirname(path));
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    fail("lock-recovery-failure", "Could not clean up the quarantined stale lock", { quarantinePath: targetPath });
  }
  return { status: "recovered", lock };
}

export { lockPath };
