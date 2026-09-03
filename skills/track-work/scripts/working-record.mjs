#!/usr/bin/env node

import { rm } from "node:fs/promises";
import { cwd } from "node:process";
import { dirname } from "node:path";
import { canonicalLines, joinLines, slugify, TASK_STATES } from "./lib/format.mjs";
import { parseDocument, validateDocument } from "./lib/document.mjs";
import { runTransition } from "./lib/transitions.mjs";
import {
  createRecordPath,
  displayPath,
  readInput,
  readRecord,
  resolveRecordPath,
  writeInitialAtomically,
} from "./lib/store.mjs";
import { renderFull, renderResume } from "./lib/views.mjs";

function usage() {
  return [
    "Usage:",
    "  working-record.mjs init --root <path> --name <task name> [--input <file|->]",
    "  working-record.mjs view resume|full --record <record.md>",
    "  working-record.mjs validate --record <record.md>",
    "  working-record.mjs <slice|checkpoint|decision|task> <operation> ...",
  ].join("\n");
}

const COMMAND_HELP = new Map([
  [
    "slice",
    [
      "Usage: working-record.mjs slice <operation> ...",
      "Operations: slice propose, slice start, slice start-direct, slice pause, slice resume, slice close, slice reopen.",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
      "Use --input - to read Markdown fragments from stdin.",
    ].join("\n"),
  ],
  [
    "checkpoint",
    [
      "Usage: working-record.mjs checkpoint <operation> ...",
      "Operations: checkpoint propose, checkpoint activate, checkpoint defer, checkpoint resume, checkpoint close.",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
      "Use --input - to read Markdown fragments from stdin.",
    ].join("\n"),
  ],
  [
    "decision",
    [
      "Usage: working-record.mjs decision <operation> ...",
      "Operations: decision add, decision supersede, decision retire.",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
      "Use --input - to read Markdown fragments from stdin.",
    ].join("\n"),
  ],
  [
    "task",
    [
      "Usage: working-record.mjs task <operation> ...",
      "Operations: task set-state.",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
    ].join("\n"),
  ],
  [
    "init",
    "Usage: init --root <path> --name <task name> [--state <state>] [--input <file|->]\nInput: Goal and Next useful action required; the seven Current Context headings are accepted. Use --input - to read Markdown fragments from stdin.",
  ],
  ["view", "Usage: view resume|full --record <record.md>"],
  ["validate", "Usage: validate --record <record.md>"],
  [
    "slice propose",
    "Usage: slice propose --record <record.md> --title <title> --input <file|->\nInput: Intended result required; Type, Expected evidence, and Dependencies optional. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice start",
    "Usage: slice start --record <record.md> --title <proposal title> --next-action <text> --input <file|->\nInput: Authority source, Scope, Expected evidence, Stop condition, and Starting state required. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice start-direct",
    "Usage: slice start-direct --record <record.md> --title <title> --next-action <text> --input <file|->\nInput: Intended result, Authority source, Scope, Expected evidence, Stop condition, and Starting state required; Future Work is unchanged. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice pause",
    "Usage: slice pause --record <record.md> --reason <reason> --resume-when <condition> --next-action <text>",
  ],
  ["slice resume", "Usage: slice resume --record <record.md> --resolution <source> --next-action <text>"],
  [
    "slice close",
    "Usage: slice close --record <record.md> --state <completed|blocked|abandoned> --next-action <text> --input <file|->\nInput: Result, Evidence and limits, and Task effect required. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice reopen",
    "Usage: slice reopen --record <record.md> --id <S-NNN> --next-action <text> --input <file|->\nInput: fresh Authority source, Scope, Expected evidence, Stop condition, and Starting state required. Use --input - to read the fragment from stdin.",
  ],
  [
    "checkpoint propose",
    "Usage: checkpoint propose --record <record.md> --title <title> --input <file|->\nInput: Type, Condition, and Applies to required. Use --input - to read the fragment from stdin.",
  ],
  [
    "checkpoint activate",
    "Usage: checkpoint activate --record <record.md> --title <proposal title> [--next-action <text>]",
  ],
  ["checkpoint defer", "Usage: checkpoint defer --record <record.md> --id <C-NNN> [--next-action <text>]"],
  ["checkpoint resume", "Usage: checkpoint resume --record <record.md> --id <C-NNN> [--next-action <text>]"],
  [
    "checkpoint close",
    "Usage: checkpoint close --record <record.md> --id <C-NNN> --state <completed|cancelled|replaced> [--next-action <text>] --input <file|->\nInput: Result and Task effect required; Evidence optional; Reason required for cancelled or replaced; Replaced by required for replaced. Use --input - to read the fragment from stdin.",
  ],
  [
    "decision add",
    "Usage: decision add --record <record.md> --title <title> --input <file|->\nInput: Decision, Established by, Rationale, Consequences, and Revisit when required; Source references optional. Use --input - to read the fragment from stdin.",
  ],
  [
    "decision supersede",
    "Usage: decision supersede --record <record.md> --id <D-NNN> --title <title> --input <file|->\nInput: Decision, Established by, Rationale, Consequences, and Revisit when required; Source references optional. Use --input - to read the fragment from stdin.",
  ],
  ["decision retire", "Usage: decision retire --record <record.md> --id <D-NNN> --reason <reason>"],
  [
    "task set-state",
    "Usage: task set-state --record <record.md> --state <active|paused|completed|abandoned> --next-action <text>",
  ],
]);

function commandHelp(command, operation) {
  return `${COMMAND_HELP.get([command, operation].filter(Boolean).join(" ")) ?? COMMAND_HELP.get(command) ?? usage()}\n`;
}

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function parseOptions(args) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (options[token] !== undefined) throw new CliError(`Duplicate option: ${token}`);
    if (token === "--help") {
      options[token] = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new CliError(`Missing value for ${token}`);
    options[token] = value;
    index += 1;
  }
  return { options, positionals };
}

function allowedOptions(command, operation) {
  const common = new Set(["--root", "--record", "--input", "--help"]);
  const withNextAction = new Set([...common, "--next-action"]);
  if (command === "init") return new Set(["--root", "--name", "--state", "--input", "--help"]);
  if (command === "view") return new Set(["--root", "--record", "--view", "--help"]);
  if (command === "validate") return new Set(["--root", "--record", "--help"]);
  if (command === "slice") {
    if (operation === "propose") return new Set([...common, "--title"]);
    if (operation === "start" || operation === "start-direct") return new Set([...withNextAction, "--title"]);
    if (operation === "pause") return new Set([...withNextAction, "--reason", "--resume-when"]);
    if (operation === "resume") return new Set([...withNextAction, "--resolution"]);
    if (operation === "close") return new Set([...withNextAction, "--state"]);
    if (operation === "reopen") return new Set([...withNextAction, "--id", "--title"]);
  }
  if (command === "checkpoint") {
    if (operation === "propose") return new Set([...common, "--title"]);
    if (operation === "activate") return new Set([...withNextAction, "--title"]);
    if (operation === "defer" || operation === "resume") return new Set([...withNextAction, "--id"]);
    if (operation === "close") return new Set([...withNextAction, "--id", "--state"]);
  }
  if (command === "decision") {
    if (operation === "add") return new Set([...common, "--title"]);
    if (operation === "supersede") return new Set([...common, "--id", "--title"]);
    if (operation === "retire") return new Set(["--root", "--record", "--id", "--reason", "--input", "--help"]);
  }
  if (command === "task" && operation === "set-state")
    return new Set(["--root", "--record", "--state", "--next-action", "--help"]);
  return null;
}

function validateCommandOptions(command, operation, options) {
  const allowed = allowedOptions(command, operation);
  if (!allowed) throw new CliError(`Unknown command: ${command}${operation ? ` ${operation}` : ""}`);
  for (const name of Object.keys(options)) {
    if (!allowed.has(name))
      throw new CliError(`Unknown option ${name} for ${command}${operation ? ` ${operation}` : ""}`);
  }
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) throw new CliError(`Missing required option: ${name}`);
  return value;
}

function rootOption(options) {
  return options["--root"] ?? cwd();
}

function initialContent(skeletonLines, input) {
  if (!input.trim()) return joinLines(skeletonLines, "\n");
  const inputLines = input.replace(/\r\n?/g, "\n").split("\n");
  const targets = new Map();
  const names = [
    "Goal",
    "What defines this task",
    "Settled",
    "Tentative",
    "Open",
    "Current direction",
    "Boundaries",
    "Next useful action",
  ];
  const allowed = new Set(names);
  for (let index = 0; index < inputLines.length; index += 1) {
    const levelThree = /^### (.+?)\s*$/.exec(inputLines[index]);
    if (levelThree) {
      const name = levelThree[1];
      if (!allowed.has(name)) throw new CliError(`Unknown initialization heading: ${name}`);
      if (targets.has(name)) throw new CliError(`Duplicate initialization heading: ${name}`);
      const content = [];
      for (let next = index + 1; next < inputLines.length; next += 1) {
        if (/^### /.test(inputLines[next]) || /^## /.test(inputLines[next])) break;
        content.push(inputLines[next]);
      }
      targets.set(name, content);
      continue;
    }
    if (/^## /.test(inputLines[index])) throw new CliError(`Unknown initialization heading: ${inputLines[index]}`);
  }
  const output = [...skeletonLines];
  for (const name of names) {
    const content = targets.get(name);
    if (!content) continue;
    const headingIndex = output.findIndex((line) => line === `### ${name}`);
    if (headingIndex < 0) continue;
    let end = headingIndex + 1;
    while (end < output.length && !/^### |^## /.test(output[end])) end += 1;
    const trimmed = [...content];
    while (trimmed.length && trimmed[0].trim() === "") trimmed.shift();
    while (trimmed.length && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();
    output.splice(headingIndex + 1, end - headingIndex - 1, "", ...trimmed, "");
  }
  return joinLines(output, "\n");
}

async function initialize(options) {
  const root = rootOption(options);
  const name = requireOption(options, "--name");
  const state = options["--state"] ?? "active";
  if (!TASK_STATES.has(state)) throw new CliError(`Invalid task state: ${state}`);
  const input = await readInput(options["--input"], cwd());
  const text = initialContent(canonicalLines(name, state), input);
  parseDocument(text);
  const created = await createRecordPath(root, name, slugify(name));
  try {
    await writeInitialAtomically(root, created.path, text);
  } catch (error) {
    if (error?.exitCode !== 2) await rm(dirname(created.path), { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return `${created.path}\n`;
}

async function readExisting(options) {
  const root = rootOption(options);
  const recordOption = requireOption(options, "--record");
  const loaded = await readRecord(root, resolveRecordPath(root, recordOption));
  return { root, ...loaded };
}

async function runCore(command, rest) {
  const { options, positionals } = parseOptions(rest);
  const operation = positionals[0];
  if (options["--help"]) return commandHelp(command, operation);
  validateCommandOptions(command, operation, options);
  if (command === "init") return initialize(options);
  if (command === "view") {
    if (positionals.length > 1) throw new CliError("View accepts only resume or full");
    const view = positionals[0] ?? options["--view"];
    if (!view || !["resume", "full"].includes(view)) throw new CliError("View must be resume or full");
    const loaded = await readExisting(options);
    if (view === "full") return renderFull(loaded.text);
    return renderResume(loaded.text);
  }
  if (command === "validate") {
    if (positionals.length) throw new CliError("Validate does not accept positional arguments");
    const loaded = await readExisting(options);
    validateDocument(parseDocument(loaded.text));
    return `valid\n${displayPath(loaded.root, loaded.path)}\n`;
  }
  if (positionals.length !== 1) throw new CliError(`Expected one operation for ${command}`);
  const loaded = await readExisting(options);
  const input = await readInput(options["--input"], cwd());
  return runTransition(command, positionals, options, input, loaded);
}

try {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    process.stdout.write(`${usage()}\n`);
  } else {
    process.stdout.write(await runCore(command, rest));
  }
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = error.exitCode ?? 1;
}
