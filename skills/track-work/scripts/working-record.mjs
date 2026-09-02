#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { applyCommand } from "./command-runner.mjs";
import {
  CommandContractError,
  cliOptionsForCommand,
  commandNames,
  getCommandDefinition,
  renderCommandSchema,
  schemaForCommand,
  validateCommandInput,
} from "./command-registry.mjs";
import { MarkdownCodecError, renderRecord } from "./markdown-codec.mjs";
import { OperationError } from "./lifecycle-operations.mjs";
import { initializeRecord, inspectLock, loadRecord, persistRecord, PersistenceError } from "./persistence.mjs";
import { CompressionError, compressRecord } from "./compression.mjs";
import { MigrationError, migrateCopy } from "./migration.mjs";
import { RecoveryError, reconcileRecovery, recoverStaleLock } from "./recovery.mjs";
import { ViewError, renderView } from "./views.mjs";
import { sha256 } from "./model.mjs";
import { WorkspaceError, pathInside } from "./workspace.mjs";

const VIEW_NAMES = new Set(["resume", "discuss", "execute", "recent", "entity", "full"]);
const MUTATION_COMMANDS = new Set(commandNames());
const SAFE_MESSAGES = {
  "unknown-command": "The command is not supported.",
  "unknown-option": "The command option is not supported.",
  "missing-option-value": "The command option requires a value.",
  "missing-option": "A required command option is missing.",
  "duplicate-option": "The command option may be supplied once.",
  "invalid-option": "The option is not valid for this command.",
  "invalid-input-json": "The input is not valid JSON.",
  "invalid-input": "The command input is invalid.",
  "invalid-type": "A value has the wrong type.",
  "empty-field": "A required value is empty.",
  "missing-field": "A required value is missing.",
  "unknown-field": "The input contains an unsupported field.",
  "alias-rejected": "The input uses a retired alias.",
  "invalid-id": "An ID has the wrong format.",
  "invalid-reference": "A reference has the wrong shape or kind.",
  "invalid-enum": "A value is not one of the supported choices.",
  "proposal-form": "Proposal start cannot include direct-start fields.",
  "direct-form": "Direct start requires its complete declaration.",
  "legacy-record": "The record uses a legacy schema and is read-only.",
  "unsupported-schema": "The record uses an unsupported schema.",
  "malformed-record": "The record Markdown is malformed.",
  "invalid-record": "The record failed schema validation.",
  "record-unavailable": "The record could not be read.",
  "missing-record": "A record path is required.",
  "invalid-view": "The requested view is not supported.",
  "invalid-limit": "The view limit is invalid.",
  "missing-entity": "The requested entity does not exist.",
  "candidate-validation": "The proposed candidate violates the semantic model.",
  "candidate-validation-failure": "The proposed candidate violates the semantic model.",
  "candidate-roundtrip-failure": "The proposed candidate changed during Markdown round-trip.",
  "invalid-expected-sha": "The expected SHA-256 is invalid.",
  "stale-sha": "The record changed since the expected SHA was read.",
  "stale-source": "The record changed before publication.",
  "recovery-required": "Recovery evidence must be reconciled before mutation.",
  "recovery-marker-failure": "Publication is uncertain and recovery evidence could not be recorded.",
  "recovery-validation-failure": "Fresh recovery validation did not establish a safe state.",
  "recovery-marker-changed": "Recovery evidence changed before cleanup.",
  "recovery-cleanup-failure": "Recovery evidence could not be cleaned up.",
  "stale-lock": "The mutation lock is stale and requires explicit recovery.",
  "stale-lock-changed": "The stale lock changed before recovery.",
  "lock-conflict": "Another mutation holds the record lock.",
  "lock-metadata-invalid": "The record lock metadata is invalid.",
  "lock-recovery-failure": "The stale lock could not be safely recovered.",
  "lock-release-failure": "The record lock could not be released.",
  "tracked-task-path": "The task record is tracked and cannot be mutated.",
  "unignored-task-path": "The task record is not in an ignored task path.",
  "unsafe-path": "The record path is outside the safe task workspace.",
  "unsafe-symlink": "The task path contains a symlink.",
  "task-already-exists": "The task directory already exists.",
  "invalid-sha": "The source SHA-256 is invalid.",
  "multiline-field": "A command value must be single-line.",
  "unsupported-scope": "The compression scope is not supported.",
  "semantic-change": "Compression would change semantic record state.",
  "compression-artifacts-exist": "Compression evidence already exists for this record.",
  "compression-conflict": "Compression recovery found conflicting record state.",
  "rollback-conflict": "Compression rollback found conflicting evidence.",
  "forward-recovery-conflict": "Compression forward recovery found conflicting record state.",
  "rollback-unavailable": "Compression rollback evidence is unavailable.",
  "forward-recovery-unavailable": "Compression forward recovery evidence is unavailable.",
};

export class PublicBoundaryError extends Error {
  constructor(status, errorClass, code, message, details = {}) {
    super(message);
    this.name = "PublicBoundaryError";
    this.status = status;
    this.errorClass = errorClass;
    this.code = code;
    this.details = details;
  }
}

function fail(status, errorClass, code, message, details = {}) {
  throw new PublicBoundaryError(status, errorClass, code, message, details);
}

function parsePublicArgs(args) {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h") return { command: null, help: true, options: {} };
  const cli = cliOptionsForCommand(command);
  const optionDefinitions = new Map(cli.options.map((option) => [option.name, option]));
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const equals = argument.indexOf("=");
    const key = equals >= 0 ? argument.slice(0, equals) : argument;
    const definition = optionDefinitions.get(key);
    if (!definition) fail("failed", "invalid-input", "unknown-option", `Unknown command option: ${key}`);
    if (definition.kind === "flag") {
      if (equals >= 0) fail("failed", "invalid-input", "invalid-option", `${key} does not accept a value`);
      if (Object.hasOwn(options, key))
        fail("failed", "invalid-input", "duplicate-option", `Option may be supplied once: ${key}`);
      options[key] = true;
      continue;
    }
    if (Object.hasOwn(options, key))
      fail("failed", "invalid-input", "duplicate-option", `Option may be supplied once: ${key}`);
    const value = equals >= 0 ? argument.slice(equals + 1) : rest[++index];
    if (value === undefined || (value.startsWith("--") && value !== "-"))
      fail("failed", "invalid-input", "missing-option-value", `Option requires a value: ${key}`);
    options[key] = value;
  }
  if (!Object.hasOwn(options, "--help"))
    for (const required of cli.required)
      if (!Object.hasOwn(options, required))
        fail("failed", "invalid-input", "missing-option", `Option requires a value: ${required}`);
  return { command, help: false, options };
}

function usage(command = null) {
  if (command) return `${renderCommandSchema(command)}\n`;
  return (
    [
      "Usage: working-record.mjs <command> [options]",
      "",
      "Commands: init, view, schema, validate, inspect, reconcile, unlock, migrate, compress, or a registered lifecycle command.",
      "Run <command> --help or schema --command <command> for generated CLI and JSON input details.",
      "Views emit direct Markdown. Schema, validation, inspection, recovery, and mutation results emit JSON transport.",
    ].join("\n") + "\n"
  );
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(options) {
  if (!Object.hasOwn(options, "--input")) return {};
  const text = options["--input"] === "-" ? await readStdin() : options["--input"];
  try {
    return JSON.parse(text);
  } catch {
    fail("failed", "invalid-input", "invalid-input-json", "Input is not valid JSON");
  }
}

function safeMessage(code) {
  return SAFE_MESSAGES[code] ?? "The operation was rejected.";
}

function safeErrors(error) {
  let source;
  if (error instanceof CommandContractError) source = error.errors;
  else if (Array.isArray(error?.details?.errors)) source = error.details.errors;
  else source = [error];
  return source.map((item) => ({
    code: item.code ?? error.code ?? "operation-failed",
    message: safeMessage(item.code ?? error.code),
    ...(item.path ? { path: item.path } : {}),
  }));
}

function errorCode(error) {
  return error instanceof CommandContractError
    ? (error.errors[0]?.code ?? "invalid-input")
    : (error.code ?? "view-failed");
}

function errorEnvelope(command, error) {
  const code = errorCode(error);
  let status = "failed";
  let errorClass = "internal-error";
  if (error instanceof PublicBoundaryError) {
    status = error.status;
    errorClass = error.errorClass;
  } else if (error instanceof CommandContractError) {
    errorClass = "invalid-input";
  } else if (error instanceof OperationError) {
    status = "candidate-invalid";
    errorClass = "candidate-invalid";
  } else if (error instanceof CompressionError) {
    if (error.code === "recovery-required") status = "recoverable";
    errorClass = "compression-failure";
  } else if (error instanceof PersistenceError) {
    if (error.status === "committed-unconfirmed") {
      status = "committed-unconfirmed";
      errorClass = "committed-unconfirmed";
    } else if (error.code === "recovery-required" || error.code === "stale-lock") {
      status = "recoverable";
      errorClass = error.code;
    } else if (error.code === "legacy-record") {
      status = "legacy";
      errorClass = "legacy-record";
    } else if (error.code === "unsupported-schema") {
      status = "unsupported";
      errorClass = "unsupported-schema";
    } else if (error.code === "invalid-record" || error.code === "malformed-record") {
      errorClass = "malformed-record";
    } else {
      errorClass = "persistence-failure";
    }
  } else if (error instanceof RecoveryError) {
    status = ["recovery-required", "stale-lock", "stale-lock-changed", "lock-recovery-failure"].includes(code)
      ? "recoverable"
      : "failed";
    errorClass = "recovery-failure";
  } else if (error instanceof ViewError || error instanceof WorkspaceError || error instanceof MarkdownCodecError) {
    errorClass = "invalid-input";
  }
  return { status, command, errorClass, errors: safeErrors(error) };
}

function metadata(record, sourceText, confirmation, path) {
  return {
    path,
    confirmation,
    sha256: sha256(sourceText),
    schemaVersion: record.schemaVersion,
    taskId: record.record.id,
    taskState: record.record.state,
    currentSliceId: record.current.currentSliceId,
  };
}

function rootFor(options) {
  return resolve(options["--root"] ?? process.cwd());
}

function requireRecord(options) {
  if (typeof options["--record"] !== "string" || !options["--record"])
    fail("failed", "invalid-input", "missing-record", "A record path is required");
  return options["--record"];
}

async function runInit(options) {
  if (typeof options["--name"] !== "string" || !options["--name"])
    fail("failed", "invalid-input", "missing-field", "init requires --name");
  const input = await readInput(options);
  validateCommandInput("init", input);
  const result = await initializeRecord(rootFor(options), options["--name"], input, {
    dryRun: options["--dry-run"] === true,
  });
  const text = result.text ?? result.candidateText;
  const record = result.record ?? result.candidate;
  return {
    format: "json",
    exitCode: 0,
    envelope: {
      status: result.status,
      command: "init",
      operation: "init",
      record: metadata(record, text, result.status === "dry-run" ? "candidate" : "confirmed", result.path),
      candidateText: text,
    },
  };
}

async function runView(options) {
  const view = options["--view"];
  if (!VIEW_NAMES.has(view)) fail("failed", "invalid-input", "invalid-view", "A supported view is required");
  if (view === "entity" && options["--entity"] === undefined)
    fail("failed", "invalid-input", "missing-entity", "Entity view requires --entity");
  if (view !== "entity" && options["--entity"] !== undefined)
    fail("failed", "invalid-input", "invalid-option", "--entity is only valid for entity view");
  if (view !== "recent" && options["--limit"] !== undefined)
    fail("failed", "invalid-input", "invalid-option", "--limit is only valid for recent view");
  const root = rootFor(options);
  const loaded = await loadRecord(root, requireRecord(options));
  if (loaded.recovery.status !== "missing" && (view === "resume" || view === "execute"))
    fail(
      "recoverable",
      "recovery-required",
      "recovery-required",
      "Reconcile recovery before requesting a continuation view",
    );
  const limit = options["--limit"] === undefined ? undefined : Number(options["--limit"]);
  const content = renderView(loaded.record, view, {
    ...(limit === undefined ? {} : { limit }),
    ...(options["--entity"] === undefined ? {} : { entityId: options["--entity"] }),
    recordSha: loaded.sha256,
  });
  return { format: "text", exitCode: 0, content };
}

async function runSchema(options) {
  const name = options["--command"] ?? "all";
  const schema = schemaForCommand(name);
  return {
    format: "json",
    exitCode: 0,
    envelope: {
      status: "confirmed",
      command: "schema",
      operation: "schema",
      commandName: name,
      schema,
      help: renderCommandSchema(name),
    },
  };
}

async function runValidate(options) {
  const loaded = await loadRecord(rootFor(options), requireRecord(options));
  const recoverable = loaded.recovery.status !== "missing";
  return {
    format: "json",
    exitCode: recoverable ? 2 : 0,
    envelope: {
      status: recoverable ? "recoverable" : "confirmed",
      command: "validate",
      operation: "validate",
      record: { ...metadata(loaded.record, loaded.text, "confirmed", loaded.path), recovery: loaded.recovery },
    },
  };
}

async function runInspect(options) {
  const loaded = await loadRecord(rootFor(options), requireRecord(options));
  const canonicalText = renderRecord(loaded.record);
  return {
    format: "json",
    exitCode: 0,
    envelope: {
      status: loaded.recovery.status === "missing" ? "confirmed" : "recoverable",
      command: "inspect",
      operation: "inspect",
      record: { ...metadata(loaded.record, loaded.text, "confirmed", loaded.path), recovery: loaded.recovery },
      lock: await inspectLock(loaded.path),
      representation: "schema-v3-markdown",
      bytes: Buffer.byteLength(loaded.text, "utf8"),
      canonical: canonicalText === loaded.text,
    },
  };
}

async function runReconcile(options) {
  const root = rootFor(options);
  const path = requireRecord(options);
  const result = await reconcileRecovery(root, path);
  const safeRecovery = {
    status: result.status,
    ...(result.classification ? { classification: result.classification } : {}),
    ...(result.actualSha256 ? { actualSha256: result.actualSha256 } : {}),
    ...(result.quarantinePaths?.length ? { quarantinePaths: result.quarantinePaths } : {}),
  };
  const confirmed = result.status === "recovered" || result.status === "no-recovery";
  return {
    format: "json",
    exitCode: confirmed ? 0 : 2,
    envelope: {
      status: confirmed ? "confirmed" : "recoverable",
      command: "reconcile",
      operation: "reconcile",
      recovery: safeRecovery,
    },
  };
}

async function runUnlock(options) {
  const input = await readInput(options);
  validateCommandInput("unlock", input);
  const result = await recoverStaleLock(rootFor(options), requireRecord(options), input);
  return {
    format: "json",
    exitCode: 0,
    envelope: { status: "recovered", command: "unlock", operation: "unlock", lock: result.lock },
  };
}

function resolveMigrationPath(root, value, label) {
  const path = resolve(root, value);
  if (!pathInside(root, path))
    fail("failed", "invalid-input", "unsafe-path", `${label} path must remain inside --root`);
  return path;
}

function migrationCoverage(result) {
  const counts = {
    sourceUnits: result.coverage.length,
    contentUnits: 0,
    represented: 0,
    normalized: 0,
    verbatim: 0,
    deferred: 0,
  };
  for (const unit of result.coverage) {
    if (unit.kind === "content") counts.contentUnits += 1;
    counts[unit.disposition] += 1;
  }
  return counts;
}

function migrationEnvelope(result) {
  return {
    status: result.status,
    command: "migrate",
    operation: "migration.copy",
    representation: result.inventory.schema.kind,
    sourcePath: result.sourcePath,
    sourceSha256: result.sourceSha256,
    candidateSha256: result.candidateSha256,
    destinationPath: result.destinationPath,
    snapshotPath: result.snapshotPath,
    manifestPath: result.manifestPath,
    artifactsWritten: result.status === "updated",
    coverage: migrationCoverage(result),
  };
}

function migrationFailure(error) {
  const partial = Array.isArray(error.details?.deferredContentUnits);
  const messages = {
    "stale-sha": "The migration source SHA does not match the supplied source.",
    "stale-source": "The migration source changed before publication.",
    "migration-blocked": partial
      ? "The migration candidate has deferred source content."
      : "The source cannot be safely mapped to schema-v3.",
    "unsupported-source": "The source representation is not supported by this migration boundary.",
    "unsafe-path": "The migration source path is unsafe.",
    "same-source-destination": "Migration source and destination must differ.",
  };
  return {
    format: "json",
    exitCode: partial ? 2 : 1,
    envelope: {
      status: partial ? "partial" : "failed",
      command: "migrate",
      operation: "migration.copy",
      errorClass: partial ? "partial" : "migration-failure",
      errors: [
        { code: error.code ?? "migration-failure", message: messages[error.code] ?? "The migration was rejected." },
      ],
    },
  };
}

async function runMigration(options) {
  const input = await readInput(options);
  validateCommandInput("migrate", input);
  const root = rootFor(options);
  const sourcePath = resolveMigrationPath(root, input.sourcePath, "source");
  const destinationPath = resolveMigrationPath(root, input.destinationPath, "destination");
  const migrationOptions = { authoritySource: input.authoritySource, expectedSha: input.sourceSha256 };
  try {
    const dryRun = await migrateCopy(root, sourcePath, destinationPath, { ...migrationOptions, dryRun: true });
    if (options["--dry-run"] === true || dryRun.status === "partial")
      return {
        format: "json",
        exitCode: dryRun.status === "partial" ? 2 : 0,
        envelope: migrationEnvelope({ ...dryRun, status: dryRun.status }),
      };
    const applied = await migrateCopy(root, sourcePath, destinationPath, migrationOptions);
    return { format: "json", exitCode: 0, envelope: migrationEnvelope(applied) };
  } catch (error) {
    if (error instanceof MigrationError) return migrationFailure(error);
    throw error;
  }
}

function compressionEnvelope(result) {
  return {
    status: result.status,
    command: "compress",
    operation: "compression.canonical-markdown",
    scope: result.scope,
    representation: "schema-v3-markdown",
    recordPath: result.recordPath,
    sourceSha256: result.sourceSha256,
    candidateSha256: result.candidateSha256,
    artifactsWritten: result.status === "updated",
    ...(result.status === "updated" ? { snapshotPath: result.snapshotPath, manifestPath: result.manifestPath } : {}),
  };
}

async function runCompression(options) {
  const input = await readInput(options);
  validateCommandInput("compress", input);
  const result = await compressRecord(rootFor(options), requireRecord(options), {
    scope: input.scope,
    expectedSha: input.sourceSha256,
    authoritySource: input.authoritySource,
    dryRun: options["--dry-run"] === true,
  });
  return { format: "json", exitCode: 0, envelope: compressionEnvelope(result) };
}

function runSpecialBoundary(command) {
  const definition = getCommandDefinition(command);
  return {
    format: "json",
    exitCode: 2,
    envelope: {
      status: "deferred",
      command,
      operation: definition.operation,
      specialBoundary: definition.specialBoundary,
      errors: [
        {
          code: "special-boundary",
          message: `${command} requires its dedicated ${definition.specialBoundary} boundary`,
        },
      ],
    },
  };
}

async function runMutation(command, options, input) {
  const root = rootFor(options);
  const path = requireRecord(options);
  if (typeof options["--expected-sha"] !== "string" || !options["--expected-sha"])
    fail("failed", "invalid-input", "invalid-expected-sha", "Existing mutations require --expected-sha");
  const loaded = await loadRecord(root, path);
  const operation = applyCommand(loaded.record, command, input);
  const persisted = await persistRecord(root, path, operation.record, {
    expectedSha: options["--expected-sha"],
    dryRun: options["--dry-run"] === true,
    operation: command,
  });
  const record = persisted.record ?? persisted.candidate;
  const candidateText = persisted.candidateText;
  const confirmation = persisted.status === "dry-run" ? "candidate" : "confirmed";
  return {
    format: "json",
    exitCode: 0,
    envelope: {
      status: persisted.status,
      command,
      operation: operation.operation,
      record: { ...metadata(record, candidateText, confirmation, path) },
      beforeSha256: persisted.beforeSha256,
      afterSha256: persisted.afterSha256,
      affectedIds: operation.affectedIds,
      candidateText,
    },
  };
}

export async function runPublicCommand(args) {
  let command = args[0] ?? null;
  try {
    const parsed = parsePublicArgs(args);
    command = parsed.command;
    if (parsed.help) return { format: "text", exitCode: 0, content: usage() };
    const { options } = parsed;
    if (options["--help"] === true) return { format: "text", exitCode: 0, content: usage(command) };
    if (command === "init") return await runInit(options);
    if (command === "view") return await runView(options);
    if (command === "schema") return await runSchema(options);
    if (command === "migrate") return await runMigration(options);
    if (command === "compress") return await runCompression(options);
    if (command === "validate") return await runValidate(options);
    if (command === "inspect") return await runInspect(options);
    if (command === "reconcile") return await runReconcile(options);
    if (command === "unlock") return await runUnlock(options);
    if (!MUTATION_COMMANDS.has(command))
      fail("failed", "invalid-input", "unknown-command", "The command is not supported");
    const input = await readInput(options);
    validateCommandInput(command, input);
    if (getCommandDefinition(command).specialBoundary) return runSpecialBoundary(command);
    return await runMutation(command, options, input);
  } catch (error) {
    if (command === "view") {
      const exitCode = error instanceof PersistenceError && error.status === "committed-unconfirmed" ? 2 : 1;
      return {
        format: "text",
        exitCode,
        content: `Track Work view failed [${errorCode(error)}]: ${safeMessage(errorCode(error))}\n`,
      };
    }
    const envelope = errorEnvelope(command, error);
    const exitCode = envelope.status === "committed-unconfirmed" || envelope.status === "recoverable" ? 2 : 1;
    return { format: "json", exitCode, envelope };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runPublicCommand(process.argv.slice(2));
  if (result.format === "text") process.stdout.write(result.content);
  else process.stdout.write(`${JSON.stringify(result.envelope, null, 2)}\n`);
  process.exitCode = result.exitCode;
}
