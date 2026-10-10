#!/usr/bin/env node

import { rm } from "node:fs/promises";
import { cwd } from "node:process";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { canonicalLines, joinLines, slugify } from "./lib/format.mjs";
import { parseDocument, validateDocument } from "./lib/document.mjs";
import { runTransition } from "./lib/transitions.mjs";
import {
  createRecordPath,
  displayPath,
  readInput,
  readRecord,
  resolveRecordPath,
  storeOf,
  writeInitialAtomically,
} from "./lib/store.mjs";
import { renderEntries, renderFull, renderResume } from "./lib/views.mjs";
import { Registry, TASK_ID } from "./lib/registry.mjs";
import { searchRecords } from "./lib/search.mjs";

const ROOT_HELP =
  "--record is resolved against --root, which defaults to the current directory; an absolute --record path finds its own root.";

function usage() {
  return [
    "Usage:",
    "  working-record.mjs init --root <path> --name <task name> [--input <file|->]",
    "  working-record.mjs view resume|full --record <record.md>",
    "  working-record.mjs view entry <ID> [<ID> ...] --record <record.md>",
    "  working-record.mjs validate --record <record.md>",
    "  working-record.mjs <slice|checkpoint|decision|task> <operation> ...",
    "  working-record.mjs project <new|link|show> ...",
    "  working-record.mjs task <create|import|search|env|here|fanout> ...",
    "",
    ROOT_HELP,
    "A registered task's ID (such as my-project/task-003) may be given as --record.",
  ].join("\n");
}

const COMMAND_HELP = new Map([
  [
    "slice",
    [
      "Usage: working-record.mjs slice <operation> ...",
      "Operations: slice propose, slice start, slice start-direct, slice pause, slice resume, slice close, slice reopen, slice record.",
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
      "Operations: task set-state; and for projects: task create, task import, task search, task env, task here, task fanout.",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
    ].join("\n"),
  ],
  [
    "init",
    "Usage: init --root <path> --name <task name> [--input <file|->]\nInput: Goal and Next useful action required; the seven Current Context headings and Recovery sources are accepted, and every line must sit under one of them. The record starts active. Use --input - to read Markdown fragments from stdin.",
  ],
  [
    "view",
    "Usage: view resume|full --record <record.md>\n       view entry <ID> [<ID> ...] --record <record.md>\nresume: the header, Current Context, active Decisions, Current Work, Future Work, a one-line index of closed History, and Notes. entry: the named S-NNN, C-NNN, or D-NNN entries exactly as stored. full: the file exactly as stored, valid or not.",
  ],
  ["validate", "Usage: validate --record <record.md>"],
  [
    "project",
    "Usage: working-record.mjs project <operation> ...\nOperations: project new, project link, project show.\nA project groups tasks; its records live in a store under the Freeflow home (FREEFLOW_HOME, default ~/.freeflow), outside any repository. Create or link a project only when the user asks.",
  ],
  [
    "project new",
    "Usage: project new --name <name> [--cwd <directory>] [--worktrees <directory>]\nCreates the project and links the repository containing --cwd (default: the current directory) to it. --worktrees is where fan-out puts children's worktrees (default: the repository's parent directory).",
  ],
  [
    "project link",
    "Usage: project link --name <name> [--cwd <directory>] [--worktrees <directory>]\nLinks another repository to an existing project; --worktrees changes where fan-out puts worktrees.",
  ],
  [
    "task env",
    "Usage: task env --id <task-id> [--primary <directory>] [--add-dir <directory>] [--remove-dir <directory>]\nPrints where the task's work happens: its primary directory with its current Git branch, and additional directories. The options change it; change it only when the user asks.",
  ],
  [
    "task here",
    "Usage: task here [--cwd <directory>]\nPrints the registered tasks whose primary directory contains the directory, deepest first.",
  ],
  [
    "task fanout",
    "Usage: task fanout --parent <task-id> --title <title> --goal <goal> [--path <directory>] [--base <ref>]\nCreates a child of the task, a Git worktree for it on branch <project>/<task-NNN>-<slug> (at <worktrees>/<repo>-<slug> unless --path), copies .freeflow/local.json into it when it has none, and makes the worktree the child's directory. The user then starts a session there.",
  ],
  [
    "project show",
    "Usage: project show [--cwd <directory>]\nPrints the linked project and its tasks: ID, title, parent, and whether a session owns it.",
  ],
  [
    "task create",
    "Usage: task create --title <title> --goal <goal> [--parent <task-id>] [--cwd <directory>]\nCreates a registered record in the project linked to --cwd, or with --parent a child of that task in its project, and prints its ID and path. A child has no children.",
  ],
  [
    "task import",
    "Usage: task import --record <record.md> --project <name>\nMoves an unregistered record's task directory into the project's store, with the next free number, and registers it. Ask the user first.",
  ],
  [
    "task search",
    "Usage: task search --query <text> (--id <task-id> --scope task|tree|project | --project <name>)\nPrints matching lines with the record, entry heading and state. tree is the task's root (its parent, or itself) and the root's children. Read-only.",
  ],
  [
    "slice propose",
    "Usage: slice propose --record <record.md> --title <title> --input <file|->\nInput: Intended result required; Type, Expected evidence, and Dependencies optional. Commands set State; input never includes it. Use --input - to read the fragment from stdin.",
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
    "slice record",
    "Usage: slice record --record <record.md> --title <title> --state <completed|blocked|abandoned> --input <file|->\nRecords a Slice that finished before it could be recorded, directly into History. The Current Slice, Future Work, and Next useful action are unchanged; the ID follows recording order and the command adds Recorded: retroactively on <today>.\nInput: Occurred (YYYY-MM-DD or YYYY-MM-DD to YYYY-MM-DD), Intended result, Authority source, Result, Evidence and limits, and Task effect required; Type and Residual effects optional; Resume when required for blocked; Reason required for abandoned. Use --input - to read the fragment from stdin.",
  ],
  [
    "checkpoint propose",
    "Usage: checkpoint propose --record <record.md> --title <title> --input <file|->\nInput: Type (preserve, publish, review, decision, or continuity), Condition, and Applies to required. Use --input - to read the fragment from stdin.",
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
  const help = COMMAND_HELP.get([command, operation].filter(Boolean).join(" ")) ?? COMMAND_HELP.get(command);
  if (!help) return `${usage()}\n`;
  return command === "init" ? `${help}\n` : `${help}\n${ROOT_HELP}\n`;
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
  if (command === "init") return new Set(["--root", "--name", "--input", "--help"]);
  if (command === "view") return new Set(["--root", "--record", "--view", "--help"]);
  if (command === "validate") return new Set(["--root", "--record", "--help"]);
  if (command === "slice") {
    if (operation === "propose") return new Set([...common, "--title"]);
    if (operation === "start" || operation === "start-direct") return new Set([...withNextAction, "--title"]);
    if (operation === "pause") return new Set([...withNextAction, "--reason", "--resume-when"]);
    if (operation === "resume") return new Set([...withNextAction, "--resolution"]);
    if (operation === "close") return new Set([...withNextAction, "--state"]);
    if (operation === "reopen") return new Set([...withNextAction, "--id", "--title"]);
    if (operation === "record") return new Set([...common, "--title", "--state"]);
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
  if (command === "task" && operation === "create")
    return new Set(["--title", "--goal", "--parent", "--cwd", "--help"]);
  if (command === "task" && operation === "import") return new Set(["--record", "--project", "--help"]);
  if (command === "task" && operation === "search")
    return new Set(["--query", "--id", "--scope", "--project", "--help"]);
  if (command === "task" && operation === "env")
    return new Set(["--id", "--primary", "--add-dir", "--remove-dir", "--help"]);
  if (command === "task" && operation === "here") return new Set(["--cwd", "--help"]);
  if (command === "task" && operation === "fanout")
    return new Set(["--parent", "--title", "--goal", "--path", "--base", "--cwd", "--help"]);
  if (command === "project" && (operation === "new" || operation === "link"))
    return new Set(["--name", "--cwd", "--worktrees", "--help"]);
  if (command === "project" && operation === "show") return new Set(["--cwd", "--help"]);
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
  if (options["--root"]) return options["--root"];
  const record = options["--record"];
  if (record && isAbsolute(record)) {
    const marker = `${sep}.freeflow${sep}tasks${sep}`;
    const index = record.lastIndexOf(marker);
    if (index > 0) return record.slice(0, index);
    const store = storeOf(record);
    if (store) return store;
  }
  return cwd();
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
    "Recovery sources",
    "Next useful action",
  ];
  const allowed = new Set(names);
  let seenHeading = false;
  for (let index = 0; index < inputLines.length; index += 1) {
    const levelThree = /^### (.+?)\s*$/.exec(inputLines[index]);
    if (!levelThree && !seenHeading && inputLines[index].trim() !== "")
      throw new CliError(`Initialization text outside a heading would be lost: ${inputLines[index].trim()}`);
    if (levelThree) {
      const name = levelThree[1];
      if (!allowed.has(name)) throw new CliError(`Unknown initialization heading: ${name}`);
      if (targets.has(name)) throw new CliError(`Duplicate initialization heading: ${name}`);
      seenHeading = true;
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
  const input = await readInput(options["--input"], cwd());
  const text = initialContent(canonicalLines(name), input);
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

/** Projects, registered tasks and search, through the registry under the Freeflow home. */
async function runRegistry(command, operation, options) {
  const registry = new Registry();
  const where = options["--cwd"] ?? cwd();
  if (command === "project" && operation === "new")
    return `Project ${await registry.createProject(requireOption(options, "--name"), where, options["--worktrees"])} created and linked to ${await registry.repoRoot(where)}.\n`;
  if (command === "project" && operation === "link")
    return `${await registry.repoRoot(where)} linked to project ${await registry.linkProject(requireOption(options, "--name"), where, options["--worktrees"])}.\n`;
  if (command === "project" && operation === "show") {
    const found = await registry.projectFor(where);
    if (!found) return `No project is linked to ${await registry.repoRoot(where)}.\n`;
    const lines = [`Project ${found.project.name} (${found.slug}), store ${found.project.store}`];
    for (const { id, task } of await registry.projectTasks(found.slug))
      lines.push(
        `- ${id} — ${task.title} (${task.record})${task.parent ? `, child of ${task.parent}` : ""}${task.owner ? `, owned by session ${task.owner.session}` : ""}`,
      );
    return `${lines.join("\n")}\n`;
  }
  if (operation === "create") {
    const title = requireOption(options, "--title");
    const goal = requireOption(options, "--goal");
    const parent = options["--parent"];
    const slug = parent ? (await registry.task(parent))?.project : (await registry.projectFor(where))?.slug;
    if (!slug)
      throw new CliError(parent ? `No task ${parent}.` : `No project is linked to ${await registry.repoRoot(where)}.`);
    const primary = parent ? undefined : await registry.repoRoot(where);
    const created = await registry.createTask(slug, title, goal, parent, primary);
    return `${created.id}\n${created.record}\n`;
  }
  if (operation === "import") {
    const record = resolve(requireOption(options, "--record"));
    const moved = await registry.importRecord(requireOption(options, "--project"), record);
    return `${moved.id}\n${moved.record}\n`;
  }
  if (operation === "env") {
    const id = requireOption(options, "--id");
    if (options["--primary"] || options["--add-dir"] || options["--remove-dir"])
      await registry.setEnvironment(id, {
        primary: options["--primary"],
        add: options["--add-dir"],
        remove: options["--remove-dir"],
      });
    const env = await registry.environment(id);
    if (!env.primary) return `${id} has no recorded directory.\n`;
    const facts =
      env.exists === false
        ? ["missing"]
        : [env.worktree ? "Git worktree" : "", env.branch ? `branch ${env.branch}` : ""];
    const state = facts.filter(Boolean).join(", ");
    return `${[`primary: ${env.primary}${state ? ` (${state})` : ""}`, ...env.directories.map((dir) => `also: ${dir}`)].join("\n")}\n`;
  }
  if (operation === "here") {
    const found = await registry.here(where);
    if (!found.length) return `No registered task works in ${resolve(where)}.\n`;
    return `${found.map(({ id, task }) => `${id} — ${task.title} (${task.environment.primary})`).join("\n")}\n`;
  }
  if (operation === "fanout") {
    const result = await registry.fanout(
      requireOption(options, "--parent"),
      requireOption(options, "--title"),
      requireOption(options, "--goal"),
      { path: options["--path"], base: options["--base"], cwd: where },
    );
    if (result.error) throw new CliError(result.error);
    return `${result.id}\n${result.path}\nbranch ${result.branch}${result.copiedConfig ? "; copied .freeflow/local.json" : ""}\nNext: open a terminal in ${result.path} and start a session there.\n`;
  }
  if (operation === "search") {
    const query = requireOption(options, "--query");
    let records;
    if (options["--id"]) records = await registry.scope(options["--id"], options["--scope"] ?? "task");
    else {
      const slug = (await registry.read()).projects[options["--project"] ?? ""] ? options["--project"] : undefined;
      if (!slug) throw new CliError("Give --id with --scope, or --project with a project's slug.");
      records = (await registry.projectTasks(slug)).map(({ id, task }) => [id, task.record]);
    }
    return `${await searchRecords(records, query)}\n`;
  }
  throw new CliError(`Unknown command: ${command} ${operation}`);
}

async function runCore(command, rest) {
  const { options, positionals } = parseOptions(rest);
  const operation = positionals[0];
  if (options["--help"]) return commandHelp(command, operation);
  validateCommandOptions(command, operation, options);
  if (
    command === "project" ||
    (command === "task" && ["create", "import", "search", "env", "here", "fanout"].includes(operation))
  )
    return runRegistry(command, operation, options);
  // A registered task's ID stands for its record's path.
  if (typeof options["--record"] === "string" && TASK_ID.test(options["--record"])) {
    const task = await new Registry().task(options["--record"]);
    if (!task) throw new CliError(`No task ${options["--record"]} in the registry.`);
    options["--record"] = task.record;
  }
  if (command === "init") return initialize(options);
  if (command === "view") {
    const view = positionals[0] ?? options["--view"];
    if (!view || !["resume", "full", "entry"].includes(view)) throw new CliError("View must be resume, full, or entry");
    const ids = positionals.slice(1);
    if (view === "entry") {
      if (!ids.length) throw new CliError("View entry needs at least one S-NNN, C-NNN, or D-NNN ID");
      const invalid = ids.find((id) => !/^[SCD]-\d{3,}$/.test(id));
      if (invalid) throw new CliError(`Not an entry ID: ${invalid}`);
    } else if (ids.length) throw new CliError(`View ${view} accepts no further arguments`);
    const loaded = await readExisting(options);
    if (view === "full") return renderFull(loaded.text);
    if (view === "entry") return renderEntries(loaded.text, ids);
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
