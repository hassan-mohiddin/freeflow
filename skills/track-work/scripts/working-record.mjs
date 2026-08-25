#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { CommittedResultError } from "./lib/record-store.mjs";
import { WorkingRecordError, fail } from "./lib/model.mjs";
import { baseEnvelope, errorItems } from "./lib/result.mjs";
import { executeCommand, readJsonInput } from "./lib/commands.mjs";

function parseCliArgs(args) {
  const positionals = [];
  const options = {};
  const flags = new Set(["--dry-run", "--help"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    const key = equals >= 0 ? argument.slice(0, equals) : argument;
    if (Object.hasOwn(options, key)) fail("duplicate-option", `Option may be supplied once: ${key}`);
    if (flags.has(key)) {
      options[key] = true;
      if (equals >= 0) fail("invalid-option", `${key} does not accept a value`);
      continue;
    }
    const value = equals >= 0 ? argument.slice(equals + 1) : args[++index];
    if (value === undefined || value.startsWith("--")) fail("missing-option-value", `Option requires a value: ${key}`);
    options[key] = value;
  }
  return { positionals, options };
}
function usage() {
  return `Usage: node skills/track-work/scripts/working-record.mjs <command> [options]

Commands:
  init     --root <repo> --name <short-name> [--input <json-file|->] [--dry-run]
  view     --record <record.md> --view <resume|discuss|execute|recent|entity|full> [--entity <id-or-title>]
  schema   --command <init|update|start|block|resume|reopen|close|unlock|migrate|compress|all> [--help]
  update   --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  start    --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  block    --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  resume   --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  reopen   --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  close    --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  unlock   --record <record.md> --input <json-file|->
  migrate  --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  compress --record <record.md> --expected-sha <sha256> --input <json-file|-> [--dry-run]
  validate --record <record.md>
  inspect  --record <record.md>

Views emit bounded Markdown text. Other commands emit one JSON result. Existing-record mutations require the current SHA-256. Use --input - to read semantic JSON from stdin.
`;
}

export { executeCommand };

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  const { positionals, options } = parseCliArgs(args);
  if (options["--help"]) {
    process.stdout.write(usage());
    return;
  }
  const root = options["--root"] ? resolve(options["--root"]) : process.cwd();
  if (positionals.length > 1) fail("invalid-arguments", "Only one positional record or task path is supported");
  if (positionals.length === 1 && !options["--record"] && !options["--task"]) options["--record"] = positionals[0];
  const input = await readJsonInput(options);
  const result = await executeCommand(command, { root, options, input });
  if (command === "view" || command === "resume-view") {
    process.stdout.write(result.view?.content ?? "");
  } else if (command === "schema") {
    process.stdout.write(result.content ?? "");
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  if (result.status === "committed-unconfirmed") process.exitCode = 2;
  else if (result.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof CommittedResultError) {
      process.stdout.write(`${JSON.stringify(error.result, null, 2)}\n`);
      process.exitCode = 2;
    } else {
      const knownError = error instanceof WorkingRecordError;
      const command = process.argv[2] ?? null;
      if (command === "view" || command === "resume-view") {
        process.stdout.write(`Track Work view failed [${error.code ?? "view-failed"}]: ${error.message}\n`);
        process.exitCode = error instanceof WorkingRecordError ? error.exitCode : 1;
      } else if (command === "schema") {
        process.stdout.write(`Track Work schema failed [${error.code ?? "schema-failed"}]: ${error.message}\n`);
        process.exitCode = error instanceof WorkingRecordError ? error.exitCode : 1;
      } else {
        const result = baseEnvelope(command, command, knownError ? error.record : null);
        if (!result.record && knownError && error.details?.path) {
          result.record = {
            path: error.details.path,
            confirmation: "unavailable",
            sha256: error.details.sha256 ?? null,
            schemaVersion: null,
            taskState: null,
            lastUpdated: null,
            currentSlice: null,
            unavailable: ["recordProjectionUnavailable"],
          };
        }
        result.errors = errorItems(knownError ? error : new WorkingRecordError("unexpected-error", error.message));
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        process.exitCode = error instanceof WorkingRecordError ? error.exitCode : 1;
      }
    }
  }
}
