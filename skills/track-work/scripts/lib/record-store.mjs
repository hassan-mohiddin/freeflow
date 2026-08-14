import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { WorkingRecordError, fail, failureInjection, sha256, validateModel } from "./model.mjs";
import { parseRecord } from "./codec.mjs";
import { assertNoSymlinkPath, assertTaskRecordPath, displayPath, exists } from "./workspace.mjs";

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
      error.details = { ...(error.details ?? {}), path: displayPath(root, path), sha256: rawSha };
    }
    throw error;
  }
  return { path, text, rawSha, ...parsed };
}

export async function acquireLock(recordPath) {
  const lockPath = join(dirname(recordPath), ".working-record.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), path: recordPath }));
    await handle.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    if (error?.code === "EEXIST") fail("lock-conflict", `Task mutation lock is held: ${lockPath}`, { lockPath });
    throw error;
  }
  return async () => {
    await unlink(lockPath).catch(() => undefined);
  };
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
