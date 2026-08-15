import { basename, join, resolve } from "node:path";
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  CommittedResultError,
  loadRecord,
  acquireLock,
  commitText,
  requireV2,
  withMutationLock,
} from "./record-store.mjs";
import { parseRecord, renderRecord } from "./codec.mjs";
import { applyOperation } from "./operations.mjs";
import {
  WorkingRecordError,
  changedSemanticPaths,
  clone,
  createRecord,
  fail,
  failureInjection,
  isoNow,
  sha256,
  validateModel,
} from "./model.mjs";
import {
  assertNoSymlinkPath,
  displayPath,
  exists,
  gitInfo,
  nextTaskNumber,
  resolveRecordPath,
  safeShortName,
  taskRoot,
  versionControlEvidence,
} from "./workspace.mjs";
import { baseEnvelope, errorItems, recordMetadata } from "./result.mjs";
import {
  inspectData,
  legacyView,
  renderNamedSection,
  renderRecordHeaderOnly,
  renderView,
  unavailableRecord,
} from "./views.mjs";
import { renderCommandSchema } from "./schema.mjs";
import { rewriteExisting } from "./rewrites.mjs";

function normalizeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("invalid-input", "Structured input must be a JSON object");
  return input;
}

function readOnlyReason(loaded) {
  return loaded.kind === "legacy" ? "legacy-record" : "unsupported-schema";
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonInput(options) {
  const inputPath = options["--input"];
  if (!inputPath) return {};
  const source = inputPath === "-" ? await readStdin() : await readFile(inputPath, "utf8");
  try {
    return normalizeInput(JSON.parse(source));
  } catch (error) {
    if (error instanceof WorkingRecordError) throw error;
    fail("invalid-input-json", `Input is not valid JSON: ${inputPath}`);
  }
}

function expectedSha(options, input) {
  return options["--expected-sha"] ?? options["--expected-sha256"] ?? input.expectedSha256 ?? input.expectedSha;
}

function shouldDryRun(options, input) {
  return options["--dry-run"] === true || input.dryRun === true;
}

async function mutateExisting(root, command, recordPath, input, options) {
  const dryRun = shouldDryRun(options, input);
  const expected = expectedSha(options, input);
  if (!expected) fail("missing-expected-sha", "Existing-record mutations require --expected-sha or expectedSha256");
  await assertNoSymlinkPath(recordPath, taskRoot(root));
  return withMutationLock(recordPath, { dryRun }, async () => {
    const loaded = await loadRecord(root, recordPath);
    requireV2(loaded);
    if (loaded.rawSha !== expected)
      fail("stale-sha", "Expected SHA-256 does not match the current record", {
        expectedSha256: expected,
        actualSha256: loaded.rawSha,
      });
    const before = clone(loaded.data);
    const candidate = clone(loaded.data);
    const operation = applyOperation(candidate, command, input);
    const changedPaths = changedSemanticPaths(before, candidate);
    const unchangedText = renderRecord(candidate);
    const currentText = loaded.text.endsWith("\n") ? loaded.text : `${loaded.text}\n`;
    if (unchangedText === currentText) {
      const envelope = baseEnvelope(command, command, recordMetadata(root, recordPath, loaded.data, loaded.rawSha));
      envelope.beforeSha256 = loaded.rawSha;
      envelope.afterSha256 = loaded.rawSha;
      envelope.affectedIds = operation.affectedIds ?? [];
      envelope.changedPaths = [];
      if (dryRun) {
        envelope.status = "dry-run";
        envelope.prospective = {
          wouldChange: false,
          candidateSha256: loaded.rawSha,
          candidateTimestamp: loaded.data.lastUpdated,
          record: recordMetadata(root, recordPath, loaded.data, loaded.rawSha, "candidate"),
        };
      } else {
        envelope.status = "no-change";
      }
      return envelope;
    }
    candidate.lastUpdated = isoNow();
    const candidateText = renderRecord(candidate);
    if (failureInjection("candidate-validation"))
      fail("candidate-validation-failure", "Injected candidate-validation failure");
    const parsedCandidate = parseRecord(candidateText, recordPath);
    const validation =
      parsedCandidate.kind === "v2"
        ? validateModel(parsedCandidate.data)
        : [{ code: "candidate-validation", message: "Candidate is not schema v2" }];
    if (validation.length) fail("candidate-validation-failure", "Candidate failed validation", { validation });
    const candidateSha = sha256(candidateText);
    if (dryRun) {
      const envelope = baseEnvelope(command, command, recordMetadata(root, recordPath, loaded.data, loaded.rawSha));
      envelope.status = "dry-run";
      envelope.beforeSha256 = loaded.rawSha;
      envelope.afterSha256 = loaded.rawSha;
      envelope.affectedIds = operation.affectedIds ?? [];
      envelope.changedPaths = changedPaths;
      envelope.prospective = {
        wouldChange: true,
        candidateSha256: candidateSha,
        candidateTimestamp: candidate.lastUpdated,
        record: recordMetadata(root, recordPath, candidate, candidateSha, "candidate"),
      };
      return envelope;
    }
    try {
      const committed = await commitText(recordPath, candidateText, candidate);
      const envelope = baseEnvelope(
        command,
        command,
        recordMetadata(root, recordPath, committed.data, committed.sha256),
      );
      envelope.status = "updated";
      envelope.beforeSha256 = loaded.rawSha;
      envelope.afterSha256 = committed.sha256;
      envelope.affectedIds = operation.affectedIds ?? [];
      envelope.changedPaths = changedPaths;
      return envelope;
    } catch (error) {
      if (error instanceof WorkingRecordError && error.committed) {
        const envelope = baseEnvelope(
          command,
          "committed-unconfirmed",
          recordMetadata(
            root,
            recordPath,
            error.candidate?.data ?? candidate,
            error.candidate?.sha256 ?? candidateSha,
            "candidate",
            ["publicationConfirmation"],
          ),
        );
        envelope.status = "committed-unconfirmed";
        envelope.beforeSha256 = loaded.rawSha;
        envelope.afterSha256 = null;
        envelope.affectedIds = operation.affectedIds ?? [];
        envelope.changedPaths = changedPaths;
        envelope.errors = errorItems(error);
        envelope.recovery = {
          required: true,
          discardExpectedSha: true,
          steps: [
            "fresh read of the actual record path",
            "validate",
            "inspect when available",
            "establish confirmed task projection before another transition",
          ],
        };
        throw new CommittedResultError(envelope);
      }
      throw error;
    }
  });
}

async function initRecord(root, input, options) {
  const shortName = safeShortName(options["--name"] ?? input.shortName ?? input.slug ?? input.name);
  const recordInput = { ...input, taskName: input.taskName ?? input.displayName ?? input.name ?? shortName };
  const tasks = taskRoot(root);
  await assertNoSymlinkPath(tasks, root);
  const git = await gitInfo(root);
  const number = (await exists(tasks)) ? nextTaskNumber(await readdir(tasks, { withFileTypes: true })) : 1;
  const taskDirectory = `task-${String(number).padStart(3, "0")}-${shortName}`;
  const taskDir = join(tasks, taskDirectory);
  const recordPath = join(taskDir, "record.md");
  const vc = await versionControlEvidence(root, recordPath);
  if (vc.available && !vc.ignored)
    fail("task-workspace-not-ignored", "Git-backed initialization requires .freeflow/tasks/** to be ignored", {
      path: displayPath(root, recordPath),
    });
  if (vc.available && vc.tracked)
    fail("tracked-task-file", "Initialization refuses to edit a tracked task path", {
      path: displayPath(root, recordPath),
    });
  if (await exists(taskDir))
    fail("task-already-exists", `Task directory already exists: ${displayPath(root, taskDir)}`);
  if (options["--dry-run"] || input.dryRun) {
    const candidate = createRecord(recordInput, isoNow());
    const text = renderRecord(candidate);
    const envelope = baseEnvelope(
      "init",
      "init",
      recordMetadata(root, recordPath, null, null, "unavailable", ["recordDoesNotExist"]),
    );
    envelope.status = "dry-run";
    envelope.affectedIds = candidate.currentWork.currentSlice ? [candidate.currentWork.currentSlice.id] : [];
    envelope.prospective = {
      wouldChange: true,
      candidateSha256: sha256(text),
      candidateTimestamp: candidate.lastUpdated,
      record: recordMetadata(root, recordPath, candidate, sha256(text), "candidate"),
      versionControl: vc,
    };
    if (!git.available)
      envelope.warnings.push({
        code: "version-control-unavailable",
        message: "Git ignore/tracked-file evidence is unavailable outside Git",
      });
    return envelope;
  }
  await mkdir(tasks, { recursive: true });
  const release = await acquireLock(join(tasks, ".init"));
  let createdDirectory = false;
  try {
    await mkdir(taskDir);
    createdDirectory = true;
    const candidate = createRecord(recordInput, isoNow());
    const text = renderRecord(candidate);
    const tempPath = join(taskDir, `.${basename(recordPath)}.${process.pid}.${randomUUID()}.tmp`);
    let committed = false;
    try {
      if (failureInjection("temp-write")) fail("temp-write-failure", "Injected temporary-write failure");
      await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
      const parsed = parseRecord(text, recordPath);
      const validation = validateModel(parsed.data);
      if (validation.length) fail("candidate-validation-failure", "Candidate failed validation", { validation });
      if (failureInjection("rename")) fail("rename-failure", "Injected atomic rename failure");
      await rename(tempPath, recordPath);
      committed = true;
      if (failureInjection("confirmation")) {
        const envelope = baseEnvelope(
          "init",
          "committed-unconfirmed",
          recordMetadata(root, recordPath, candidate, sha256(text), "candidate", ["publicationConfirmation"]),
        );
        envelope.status = "committed-unconfirmed";
        envelope.afterSha256 = null;
        envelope.errors = [
          { code: "publication-confirmation-failure", message: "Injected publication confirmation failure" },
        ];
        envelope.recovery = {
          required: true,
          discardExpectedSha: true,
          steps: ["fresh read", "validate", "inspect when available", "establish confirmed projection"],
        };
        throw new CommittedResultError(envelope);
      }
      if (failureInjection("confirmation-read"))
        fail("publication-confirmation-failure", "Injected post-rename confirmation read failure");
      const confirmedText = await readFile(recordPath, "utf8");
      const confirmed = parseRecord(confirmedText, recordPath);
      const confirmationErrors = validateModel(confirmed.data);
      if (confirmationErrors.length)
        fail("publication-confirmation-failure", "Committed record failed confirmation", {
          validation: confirmationErrors,
        });
      const envelope = baseEnvelope(
        "init",
        "init",
        recordMetadata(root, recordPath, confirmed.data, sha256(confirmedText)),
      );
      envelope.status = "updated";
      envelope.affectedIds = candidate.currentWork.currentSlice ? [candidate.currentWork.currentSlice.id] : [];
      if (!git.available)
        envelope.warnings.push({
          code: "version-control-unavailable",
          message: "Git ignore/tracked-file evidence is unavailable outside Git",
        });
      return envelope;
    } catch (error) {
      if (!committed) {
        await unlink(tempPath).catch(() => undefined);
        if (createdDirectory) await rm(taskDir, { recursive: true, force: true });
      } else if (error instanceof CommittedResultError) {
        throw error;
      } else {
        const candidateSha = sha256(text);
        const envelope = baseEnvelope(
          "init",
          "committed-unconfirmed",
          recordMetadata(root, recordPath, candidate, candidateSha, "candidate", ["publicationConfirmation"]),
        );
        envelope.status = "committed-unconfirmed";
        envelope.afterSha256 = null;
        envelope.errors = errorItems(error);
        envelope.recovery = {
          required: true,
          discardExpectedSha: true,
          steps: ["fresh read", "validate", "inspect when available", "establish confirmed projection"],
        };
        throw new CommittedResultError(envelope);
      }
      throw error;
    }
  } finally {
    await release();
  }
}
async function executeRewriteCommand(root, command, input, options) {
  const recordPath = resolveRecordPath(root, options);
  try {
    return await rewriteExisting(root, command, recordPath, input, options);
  } catch (error) {
    if (error instanceof WorkingRecordError && !error.committed && !error.record) {
      try {
        const loaded = await loadRecord(root, recordPath);
        if (loaded.kind === "v2") {
          const validation = validateModel(loaded.data);
          error.record = validation.length
            ? unavailableRecord(root, recordPath, loaded.rawSha, "invalid-record")
            : recordMetadata(root, recordPath, loaded.data, loaded.rawSha);
        } else {
          error.record = unavailableRecord(root, recordPath, loaded.rawSha, readOnlyReason(loaded), loaded.data);
        }
      } catch {
        const rawPath = error.details?.path ?? displayPath(root, recordPath);
        error.record = recordMetadata(root, recordPath, null, error.details?.sha256 ?? null, "unavailable", [
          "recordProjectionUnavailable",
        ]);
        error.record.path = rawPath;
      }
    }
    throw error;
  }
}

async function executeMutationCommand(root, command, input, options) {
  const recordPath = resolveRecordPath(root, options);
  try {
    return await mutateExisting(root, command, recordPath, input, options);
  } catch (error) {
    if (error instanceof WorkingRecordError && !error.committed && !error.record) {
      try {
        const loaded = await loadRecord(root, recordPath);
        if (loaded.kind === "v2") {
          const validation = validateModel(loaded.data);
          error.record = validation.length
            ? unavailableRecord(root, recordPath, loaded.rawSha, "invalid-record")
            : recordMetadata(root, recordPath, loaded.data, loaded.rawSha);
        } else {
          error.record = unavailableRecord(root, recordPath, loaded.rawSha, readOnlyReason(loaded), loaded.data);
        }
      } catch {
        const rawPath = error.details?.path ?? displayPath(root, recordPath);
        error.record = recordMetadata(root, recordPath, null, error.details?.sha256 ?? null, "unavailable", [
          "recordProjectionUnavailable",
        ]);
        error.record.path = rawPath;
      }
    }
    throw error;
  }
}

function executeSchemaCommand(input, options) {
  const command = options["--command"] ?? input.command ?? "all";
  return {
    status: "schema",
    operation: "schema",
    command,
    content: renderCommandSchema(command),
    errors: [],
    warnings: [],
  };
}

async function executeViewCommand(root, input, options, command) {
  const recordPath = resolveRecordPath(root, options);
  const loaded = await loadRecord(root, recordPath);
  const view = options["--view"] ?? input.view ?? "resume";
  const record =
    loaded.kind === "v2"
      ? recordMetadata(root, recordPath, loaded.data, loaded.rawSha)
      : unavailableRecord(root, recordPath, loaded.rawSha, readOnlyReason(loaded), loaded.data);
  const envelope = baseEnvelope(command, "view", record);
  envelope.status = "viewed";
  const entity = options["--entity"] ?? input.entity;
  const section = options["--section"] ?? input.section;
  if (view === "section" && loaded.kind === "v2") fail("invalid-view", "Unknown view: section");
  if (loaded.kind !== "v2") {
    envelope.warnings.push({
      code: loaded.kind === "legacy" ? "legacy-read-only" : "unsupported-schema-read-only",
      message: "Legacy or unsupported record was rendered read-only; explicit migration is required for mutation",
    });
    try {
      const content = legacyView(loaded, view, entity, section);
      envelope.view = { name: view, sha256: sha256(content), content };
      return envelope;
    } catch (error) {
      if (error instanceof WorkingRecordError) error.record = record;
      throw error;
    }
  }
  const validation = validateModel(loaded.data);
  if (validation.length) {
    const error = new WorkingRecordError("invalid-record", "Record failed schema validation", {
      validation,
      path: displayPath(root, recordPath),
      sha256: loaded.rawSha,
    });
    error.record = unavailableRecord(root, recordPath, loaded.rawSha, "invalid-record");
    throw error;
  }
  const content =
    view === "section"
      ? `${renderRecordHeaderOnly(loaded.data)}\n${renderNamedSection(loaded.data, section)}`
      : renderView(loaded.data, view, entity, Number(options["--limit"] ?? input.limit ?? 5), loaded.rawSha);
  envelope.view = { name: view, sha256: sha256(content), content };
  return envelope;
}

async function executeValidateCommand(root, options, command = "validate") {
  const recordPath = resolveRecordPath(root, options);
  const loaded = await loadRecord(root, recordPath);
  const record =
    loaded.kind === "v2"
      ? recordMetadata(root, recordPath, loaded.data, loaded.rawSha)
      : unavailableRecord(root, recordPath, loaded.rawSha, readOnlyReason(loaded), loaded.data);
  const envelope = baseEnvelope(command, command, record);
  if (loaded.kind !== "v2") {
    envelope.status = "failed";
    envelope.errors = [
      {
        code: loaded.kind === "legacy" ? "legacy-read-only" : "unsupported-schema-read-only",
        message: "Legacy or unsupported record is parseable for read-only audit but is not schema-v2 valid or mutable",
      },
    ];
    envelope.validation = { valid: false, validForReadOnlyAudit: true, mutable: false, errors: envelope.errors };
    return envelope;
  }
  const errors = validateModel(loaded.data);
  envelope.validation = { valid: errors.length === 0, errors };
  if (errors.length) {
    envelope.status = "failed";
    envelope.record = unavailableRecord(root, recordPath, loaded.rawSha, "invalid-record");
    envelope.errors = errors;
    return envelope;
  }
  envelope.status = "valid";
  return envelope;
}

async function executeInspectCommand(root, options) {
  const recordPath = resolveRecordPath(root, options);
  const loaded = await loadRecord(root, recordPath);
  const record =
    loaded.kind === "v2"
      ? recordMetadata(root, recordPath, loaded.data, loaded.rawSha)
      : unavailableRecord(root, recordPath, loaded.rawSha, readOnlyReason(loaded), loaded.data);
  const envelope = baseEnvelope("inspect", "inspect", record);
  const validation = loaded.kind === "v2" ? validateModel(loaded.data) : [];
  envelope.inspection = await inspectData(root, loaded);
  envelope.warnings.push(...envelope.inspection.warnings);
  if (validation.length) {
    envelope.status = "failed";
    envelope.record = unavailableRecord(root, recordPath, loaded.rawSha, "invalid-record");
    envelope.errors = validation;
    return envelope;
  }
  envelope.status = "inspected";
  return envelope;
}

export async function executeCommand(command, { root = process.cwd(), options = {}, input = {} } = {}) {
  const workspaceRoot = resolve(root);
  const normalizedInput = normalizeInput(input);
  if (command === "init") return initRecord(workspaceRoot, normalizedInput, options);
  if (["view", "resume-view"].includes(command))
    return executeViewCommand(workspaceRoot, normalizedInput, options, "view");
  if (command === "validate") return executeValidateCommand(workspaceRoot, options);
  if (command === "inspect") return executeInspectCommand(workspaceRoot, options);
  if (command === "schema") return executeSchemaCommand(normalizedInput, options);
  if (["update", "start", "block", "resume", "reopen", "close"].includes(command))
    return executeMutationCommand(workspaceRoot, command, normalizedInput, options);
  if (["migrate", "compress"].includes(command))
    return executeRewriteCommand(workspaceRoot, command, normalizedInput, options);
  fail("unknown-command", `Unknown command: ${command}`);
}
