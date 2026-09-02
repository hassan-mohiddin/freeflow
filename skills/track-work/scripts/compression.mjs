import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assertValidRecord, sha256 } from "./model.mjs";
import { parseRecord, renderRecord } from "./markdown-codec.mjs";
import { acquireLock, inspectLock, loadRecord, persistRecord, PersistenceError } from "./persistence.mjs";
import { assertNoRecovery, inspectRecovery, writeRecoveryMarker } from "./recovery.mjs";
import { assertGitSafeTaskPath, assertNoSymlinkPath, assertSafeRecordPath } from "./workspace.mjs";

export const COMPRESSION_SCOPE = "canonical-markdown";

export class CompressionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CompressionError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new CompressionError(code, message, details);
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("missing-field", `${field} is required`);
  if (/\r|\n/.test(value)) fail("multiline-field", `${field} must be single-line`);
  return value.trim();
}

function expectedSha(value) {
  const sha = requiredText(value, "expectedSha");
  if (!/^[a-f0-9]{64}$/.test(sha)) fail("invalid-sha", "expectedSha must be a SHA-256 hex string");
  return sha;
}

function isoTimestamp(value) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.valueOf())) fail("invalid-clock", "Compression clock is invalid");
  return date.toISOString();
}

function compressionDirectory(recordPath) {
  return join(dirname(recordPath), ".compression");
}

function artifactPaths(recordPath, sourceSha256) {
  const directory = compressionDirectory(recordPath);
  return {
    directory,
    snapshotPath: join(directory, `source-${sourceSha256}.md`),
    manifestPath: join(directory, "manifest.md"),
  };
}

function manifestValue(text, label) {
  return text.match(new RegExp(`^${label}: (.+)$`, "m"))?.[1] ?? null;
}

function parseManifest(text, manifestPath) {
  const sourceSha256 = manifestValue(text, "Source SHA-256");
  const candidateSha256 = manifestValue(text, "Candidate SHA-256");
  const scope = manifestValue(text, "Scope");
  if (
    !/^[a-f0-9]{64}$/.test(sourceSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(candidateSha256 ?? "") ||
    scope !== COMPRESSION_SCOPE
  )
    fail("manifest-invalid", "Compression manifest is invalid", { path: manifestPath });
  return { sourceSha256, candidateSha256, scope, status: manifestValue(text, "Status") };
}

function manifestText({ recordPath, scope, sourceSha256, candidateSha256, status, authoritySource, snapshotPath }) {
  return [
    "# Track Work compression manifest",
    "",
    "This manifest is non-semantic maintenance evidence; record.md remains canonical Markdown state.",
    "",
    `Record path: ${recordPath}`,
    `Scope: ${scope}`,
    `Status: ${status}`,
    `Source SHA-256: ${sourceSha256}`,
    `Candidate SHA-256: ${candidateSha256}`,
    `Snapshot path: ${snapshotPath}`,
    `Authority source: ${authoritySource}`,
    "",
  ].join("\n");
}

async function writeSynced(path, text) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } catch (error) {
    fail("artifact-write-failure", "Could not write compression evidence", { path, cause: error?.code ?? "write" });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!new Set(["EBADF", "EINVAL", "ENOTSUP", "EOPNOTSUPP"]).has(error?.code))
      fail("artifact-sync-failure", "Could not sync compression evidence", { path });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function replaceSynced(path, text, directory) {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeSynced(temporaryPath, text);
    await rename(temporaryPath, path);
    await syncDirectory(directory);
  } catch (error) {
    if (error instanceof CompressionError) throw error;
    fail("manifest-finalization-failure", "Could not finalize compression evidence", {
      path,
      cause: error?.code ?? "rename",
    });
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function cleanupArtifacts(paths) {
  let failure = null;
  for (const path of [paths.snapshotPath, paths.manifestPath]) {
    try {
      await unlink(path);
    } catch (error) {
      if (error?.code !== "ENOENT") failure = error;
    }
  }
  try {
    await rmdir(paths.directory);
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTEMPTY") failure = failure ?? error;
  }
  if (failure)
    fail("compression-cleanup-failure", "Could not clean pre-publication compression evidence", {
      cause: failure.code ?? "cleanup",
    });
}

async function prepareArtifacts(root, paths, values) {
  await assertNoSymlinkPath(paths.directory, root);
  let entries = [];
  try {
    entries = await readdir(paths.directory);
  } catch (error) {
    if (error?.code !== "ENOENT") fail("artifact-inspection-failure", "Could not inspect compression evidence");
  }
  if (entries.length)
    fail("compression-artifacts-exist", "Compression evidence already exists for this record", {
      path: paths.directory,
    });
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  await assertNoSymlinkPath(paths.directory, root);
  await writeSynced(paths.snapshotPath, values.sourceText);
  await writeSynced(paths.manifestPath, values.manifest);
  await syncDirectory(paths.directory);
}

async function candidateFor(loaded) {
  const candidateText = renderRecord(loaded.record);
  let candidate;
  try {
    candidate = parseRecord(candidateText);
    assertValidRecord(candidate);
  } catch (error) {
    fail("candidate-invalid", "Canonical Markdown candidate failed validation", {
      causeCode: error.code ?? "invalid-record",
    });
  }
  if (!isDeepStrictEqual(candidate, loaded.record))
    fail("semantic-change", "Canonical Markdown rendering changed semantic record state");
  return { candidate, candidateText, candidateSha256: sha256(candidateText) };
}

export async function compressRecord(root, recordPath, options = {}) {
  const scope = requiredText(options.scope, "scope");
  if (scope !== COMPRESSION_SCOPE) fail("unsupported-scope", "Only the canonical-markdown scope is supported");
  const authoritySource = requiredText(options.authoritySource, "authoritySource");
  const sourceSha256 = expectedSha(options.expectedSha);
  const loaded = await loadRecord(root, recordPath);
  if (loaded.recovery.status !== "missing")
    fail("recovery-required", "Compression requires reconciled publication recovery", {
      status: loaded.recovery.status,
    });
  if (loaded.sha256 !== sourceSha256)
    fail("stale-sha", "Expected SHA-256 does not match the record", {
      expectedSha: sourceSha256,
      actualSha: loaded.sha256,
    });
  const candidate = await candidateFor(loaded);
  const paths = artifactPaths(loaded.path, sourceSha256);
  const result = {
    scope,
    authoritySource,
    recordPath: loaded.path,
    sourceSha256,
    candidateSha256: candidate.candidateSha256,
    candidate: candidate.candidate,
    candidateText: candidate.candidateText,
    sourceText: loaded.text,
    ...paths,
  };
  if (candidate.candidateSha256 === sourceSha256) return { ...result, status: "no-change" };
  if (options.dryRun) return { ...result, status: "dry-run" };

  try {
    await prepareArtifacts(root, paths, {
      sourceText: loaded.text,
      manifest: manifestText({
        recordPath: loaded.path,
        scope,
        sourceSha256,
        candidateSha256: candidate.candidateSha256,
        status: "prepared",
        authoritySource,
        snapshotPath: paths.snapshotPath,
      }),
    });
  } catch (error) {
    await cleanupArtifacts(paths).catch(() => undefined);
    throw error;
  }

  try {
    const persistenceHooks = {
      ...options.hooks,
      beforeRelease: async (event) => {
        await options.hooks?.beforeRelease?.(event);
        await replaceSynced(
          paths.manifestPath,
          manifestText({
            recordPath: loaded.path,
            scope,
            sourceSha256,
            candidateSha256: candidate.candidateSha256,
            status: "updated",
            authoritySource,
            snapshotPath: paths.snapshotPath,
          }),
          paths.directory,
        );
      },
    };
    const persisted = await persistRecord(root, loaded.path, candidate.candidate, {
      expectedSha: sourceSha256,
      operation: "compression.canonical-markdown",
      now: options.now,
      hooks: persistenceHooks,
    });
    return {
      ...result,
      status: persisted.status === "no-change" ? "no-change" : "updated",
      record: persisted.record,
      candidateText: persisted.candidateText ?? candidate.candidateText,
    };
  } catch (error) {
    const committed =
      error instanceof PersistenceError && (error.committed === true || error.status === "committed-unconfirmed");
    if (!committed) await cleanupArtifacts(paths);
    throw error;
  }
}

async function publishExact(root, recordPath, text, expectedCurrentSha, options = {}) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  await assertNoRecovery(root, path);
  const release = await acquireLock(root, path, { now: options.now, hooks: options.hooks });
  let temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let committed = false;
  let preserveLock = false;
  let releaseAttempted = false;
  let primaryError = null;
  let succeeded = false;
  try {
    const current = await readFile(path, "utf8");
    if (sha256(current) !== expectedCurrentSha)
      fail("compression-conflict", "Record changed before compression rollback");
    await writeSynced(temporaryPath, text);
    await options.hooks?.afterTempWrite?.({ tempPath: temporaryPath, recordPath: path, lockPath: release.lockPath });
    await options.hooks?.beforeRename?.({ tempPath: temporaryPath, recordPath: path, lockPath: release.lockPath });
    const sourceBeforeRename = await readFile(path, "utf8");
    if (sha256(sourceBeforeRename) !== expectedCurrentSha)
      fail("compression-conflict", "Record changed before compression rollback publication");
    const lock = await inspectLock(path);
    if (lock.status !== "valid" || lock.lock.token !== release.token || lock.lock.path !== resolve(path))
      fail("lock-changed", "Compression rollback lock changed before publication");
    await rename(temporaryPath, path);
    temporaryPath = null;
    committed = true;
    await options.hooks?.afterRename?.({ recordPath: path, lockPath: release.lockPath });
    await syncDirectory(dirname(path));
    const confirmed = await readFile(path, "utf8");
    if (confirmed !== text)
      fail("rollback-confirmation-failure", "Compression rollback differs from the exact snapshot");
    await options.hooks?.beforeRelease?.({ recordPath: path, lockPath: release.lockPath });
    releaseAttempted = true;
    await release();
    succeeded = true;
  } catch (error) {
    primaryError = committed
      ? error instanceof PersistenceError
        ? error
        : new PersistenceError(
            "rollback-publication-failure",
            "Compression rollback publication failed",
            {},
            { committed: true },
          )
      : error;
    if (committed) {
      primaryError.committed = true;
      primaryError.status = "committed-unconfirmed";
      try {
        const marker = {
          version: 1,
          token: release.token,
          pid: process.pid,
          createdAt: isoTimestamp(options.now),
          recordPath: path,
          operation: "compression.rollback",
          beforeSha256: expectedCurrentSha,
          candidateSha256: sha256(text),
          reasonCode: primaryError.code,
        };
        await writeRecoveryMarker(root, path, marker, { beforePublish: options.hooks?.writeRecoveryMarker });
        primaryError.details = {
          ...(primaryError.details ?? {}),
          recoveryPath: join(dirname(path), ".working-record.recovery.json"),
          recoveryRequired: true,
        };
      } catch (markerError) {
        preserveLock = true;
        primaryError = new PersistenceError(
          "recovery-marker-failure",
          "Publication is committed but recovery marker publication failed",
          {
            recoveryPath: join(dirname(path), ".working-record.recovery.json"),
            causeCode: markerError.code ?? "marker",
            publicationCode: error.code,
          },
          { committed: true },
        );
        primaryError.status = "committed-unconfirmed";
      }
    }
  } finally {
    if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
    if (!releaseAttempted && !preserveLock) {
      releaseAttempted = true;
      await release().catch(() => undefined);
    }
  }
  if (!succeeded) throw primaryError;
}

export async function rollbackCompression(root, recordPath, options = {}) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  await assertNoRecovery(root, path);
  let manifestTextValue;
  try {
    manifestTextValue = await readFile(join(compressionDirectory(path), "manifest.md"), "utf8");
  } catch {
    fail("rollback-unavailable", "Compression manifest is missing");
  }
  const manifest = parseManifest(manifestTextValue, join(compressionDirectory(path), "manifest.md"));
  const exactPaths = artifactPaths(path, manifest.sourceSha256);
  let sourceText;
  try {
    sourceText = await readFile(exactPaths.snapshotPath, "utf8");
  } catch {
    fail("rollback-unavailable", "Compression source snapshot is missing");
  }
  if (sha256(sourceText) !== manifest.sourceSha256)
    fail("rollback-conflict", "Compression source snapshot hash does not match its manifest");
  const currentText = await readFile(path, "utf8");
  if (sha256(currentText) !== manifest.candidateSha256)
    fail("rollback-conflict", "Record does not match the recorded compression candidate");
  await publishExact(root, path, sourceText, manifest.candidateSha256, options);
  return {
    status: "rolled-back",
    recordPath: path,
    snapshotPath: exactPaths.snapshotPath,
    sourceSha256: manifest.sourceSha256,
    candidateSha256: manifest.candidateSha256,
  };
}

export async function forwardRecoverCompression(root, recordPath) {
  const path = await assertSafeRecordPath(root, recordPath);
  await assertGitSafeTaskPath(root, path);
  const manifestPath = join(compressionDirectory(path), "manifest.md");
  let manifestTextValue;
  try {
    manifestTextValue = await readFile(manifestPath, "utf8");
  } catch {
    fail("forward-recovery-unavailable", "Compression manifest is missing");
  }
  const manifest = parseManifest(manifestTextValue, manifestPath);
  const text = await readFile(path, "utf8");
  try {
    const record = parseRecord(text);
    assertValidRecord(record);
  } catch {
    fail("forward-recovery-conflict", "Compression destination is not a valid schema-v3 record");
  }
  if (sha256(text) !== manifest.candidateSha256)
    fail("forward-recovery-conflict", "Compression destination does not match its candidate");
  const recovery = await inspectRecovery(path);
  return {
    status: "forward-confirmed",
    recordPath: path,
    manifestPath,
    candidateSha256: manifest.candidateSha256,
    recoveryStatus: recovery.status,
  };
}
