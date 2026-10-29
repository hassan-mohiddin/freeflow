#!/usr/bin/env node

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { cwd } from "node:process";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { WORK_AGREEMENT_HEADING, canonicalLines, joinLines, slugify } from "./lib/format.mjs";
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
  writeTaskFile,
} from "./lib/store.mjs";
import { renderEntries, renderFull, renderResume } from "./lib/views.mjs";
import { checkEvidencePointers, checkLinePointers, renderRecover } from "./lib/recover.mjs";
import {
  DECISIONS_FILE,
  EMPTY_DECISIONS,
  HISTORY_FILE,
  cueProblem,
  emptyHistory,
  loadTask5,
  parseRecord5,
  schemaOf,
  skeleton5,
  warnings5,
} from "./lib/record5.mjs";
import { runTransition5 } from "./lib/transitions5.mjs";
import { PROJECT_LINK, Registry, TASK_ID, removalText, startCommand } from "./lib/registry.mjs";
import { searchRecords } from "./lib/search.mjs";
import { addStoreRemote, initStore, storeStatus, syncStore } from "./lib/freeflow-store.mjs";

const ROOT_HELP =
  "--record is resolved against --root, which defaults to the current directory; an absolute --record path finds its own root.";

function usage() {
  return [
    "Usage:",
    "  working-record.mjs init --root <path> --name <task name> [--schema 5 --cue <cue>] [--input <file|->]",
    "  working-record.mjs view resume|recover|full --record <record.md>",
    "  working-record.mjs view entry <ID> [<ID> ...] --record <record.md>",
    "  working-record.mjs validate --record <record.md>",
    "  working-record.mjs <slice|checkpoint|decision|task> <operation> ...",
    "  working-record.mjs agreement <open|update|close> ... (Schema 5)",
    "  working-record.mjs checkpoint --record <record.md> [--repo <path>] (Schema 5)",
    "  working-record.mjs project <new|link|show|list|remove> ...",
    "  working-record.mjs task <create|import|search|env|here|fanout|remove> ...",
    "  working-record.mjs store <init|remote|status|sync> ...",
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
      "Usage: working-record.mjs checkpoint <operation> ... (Schema 4)",
      "       working-record.mjs checkpoint --record <record.md> [--repo <path>] (Schema 5)",
      "Schema 4 operations: checkpoint propose, checkpoint activate, checkpoint defer, checkpoint resume, checkpoint close.",
      "Schema 5's checkpoint, before a compaction or a transfer, once Current Context is rewritten: checks the task folder's structure and the budgets (warning on any section over), writes the Space line for the work repository at --repo (default: the current directory, unless it is the Freeflow store), sets State as of, then commits and pushes the Freeflow store holding the task.",
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
      "Operations: task set-state; and for projects: task create, task import, task search, task env, task here, task fanout, task remove.",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
    ].join("\n"),
  ],
  [
    "init",
    'Usage: init --root <path> --name <task name> [--schema 5 --cue <cue>] [--input <file|->]\nInput: Goal and Next useful action required; the seven Current Context headings, Work agreement (written only when given) and Recovery sources are accepted, and every line must sit under one of them. The record starts active. Use --input - to read Markdown fragments from stdin.\nWith --schema 5: the task folder gets record.md, history.md and decisions.md. --cue (required) says when the task matters, starting "read when", in at most 25 words. Input: Goal and Next action required; Settled, Open, Space, Read on recovery and Read when accepted. --root may be a project\'s folder in the Freeflow store (<store>/projects/<project>), whose tasks/ then holds the task.',
  ],
  [
    "agreement",
    "Usage: working-record.mjs agreement <operation> ... (Schema 5)\nOperations: agreement open, agreement update, agreement close. A task has one open agreement at a time: what the user agreed, in their words, dated; its decision list is decisions.md beside the record.",
  ],
  [
    "agreement open",
    "Usage: agreement open --record <record.md> --title <title> [--next-action <text>] --input <file|->\nInput: the agreement's lines as bullets (Done when …, Without asking: …, Ask first: …, Back at …, Holds until …), each quoting the user with the date; a bullet may continue on lines indented two spaces. Assigns A-NNN and writes Opened. Use --input - to read the lines from stdin.",
  ],
  [
    "agreement update",
    "Usage: agreement update --record <record.md> (--text <text> | --input <file|->)\nAppends one Update line: a change to what is agreed (an extension, a narrowing such as \"don't edit yet\", a lifted limit, a new endpoint), in the user's words, dated. Progress and results belong to Slices.",
  ],
  [
    "agreement close",
    "Usage: agreement close --record <record.md> --state <completed|ended|replaced> [--next-action <text>] --input <file|->\nAppends the agreement's History entry (its lines, updates and decisions.md's list), removes it from Current Work, empties decisions.md, then syncs the Freeflow store holding the task. Refused while the current Slice works under it.\nInput: Cue (\"read when …\", at most 25 words), Result and Task effect required; Settled optional: choices that still govern the task, added to Current Context's Settled.",
  ],
  [
    "view",
    "Usage: view resume|recover|full --record <record.md>\n       view entry <ID> [<ID> ...] --record <record.md>\nresume: the header, Current Context, active Decisions, Current Work, Future Work, a one-line index of closed History, and Notes. recover: the resume view, then each defining artifact and Recovery source with its trigger, whether it resolves and its size, then live Git state and where it disagrees with the record: what recovery after context loss reads first. entry: the named S-NNN, C-NNN, or D-NNN entries exactly as stored. full: the file exactly as stored, valid or not.",
  ],
  [
    "validate",
    "Usage: validate --record <record.md> [--strict]\nChecks the record's structure, and whether the pointers in Material updates resolve: files (from the repository root or the task folder) and commits. An unresolved pointer is a warning, since it may name a planned path or a commit not fetched yet; with --strict, one on an Evidence or Result line fails. Pointers outside the repository are listed, not checked.",
  ],
  [
    "store",
    "Usage: working-record.mjs store <operation> ...\nOperations: store init, store remote, store status, store sync.\nThe Freeflow store is one Git repository at the Freeflow home (FREEFLOW_HOME, default ~/.freeflow, or --home) that holds every task's memory; its records are tracked on purpose. It is local by default, on this device only; with your private repository as its remote it is a cloud store, the same store kept in step on every device.",
  ],
  [
    "store init",
    "Usage: store init [--remote <url>] [--home <folder>] [--git-name <name> --git-email <email>]\nWithout --remote, makes a local store in the folder: the store's layout (store.json, .gitignore, .gitattributes, rules/, projects/) and a first commit authored as you; nothing leaves this machine. With --remote, clones the private repository into the store's folder. An empty repository gets the store's layout (store.json, .gitignore, .gitattributes, rules/, projects/) and a first commit authored as you, pushed to main; a repository that already holds a store is joined as it is. Refuses a folder that holds Pi's Task Memory (registry.json) or anything else, and a repository that is not a store. Without --git-name and --git-email, your Git configuration's identity is used.",
  ],
  [
    "store remote",
    "Usage: store remote --url <url> [--home <folder>]\nTurns a local store into a cloud store: adds your private repository, which must be empty, as its remote and pushes the store's whole history there, after the secret scan. To use a store already in a repository, run store init --remote <url> --home <another folder>.",
  ],
  [
    "store status",
    "Usage: store status [--home <folder>]\nPrints the store's folder, remote and branch, how many paths are not committed and commits not pushed or not yet taken (as of the last sync), and the last sync. Reaches no network.",
  ],
  [
    "store sync",
    "Usage: store sync [--home <folder>] [--message <commit message>] [--pull | --resolved]\nCommits every change in the store as you, takes the remote's commits under the local ones, and pushes. history.md and sessions.md merge by keeping both sides' lines. Before every push the changes are scanned for secrets (common token shapes): one in the files stops the push and names its path, line and kind; one only an earlier unpushed commit held is dropped by pushing those commits as one. A push refused because the remote moved takes its commits and tries again; with no network or no access the commits stay here, the output says so, and the next sync pushes them. Any other file both sides changed stops the sync: this store's copy stays in place, committed and not pushed, and the remote's goes under local/conflicts/; merge what should stay into this store's file, then run store sync --resolved, which keeps this store's version where the two still conflict. --pull takes the remote's commits and pushes nothing, as at session start.",
  ],
  [
    "project",
    "Usage: working-record.mjs project <operation> ...\nOperations: project new, project link, project show, project list, project remove.\nA project groups tasks; its records live in a store under the Freeflow home (FREEFLOW_HOME, default ~/.freeflow), outside any repository. Create or link a project only when the user asks.",
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
    "Usage: task fanout --parent <task-id> --title <title> --goal <goal> [--path <directory>] [--base <ref>] [--agent <command>]\nCreates a child of the task, a Git worktree for it on branch <project>/<task-NNN>-<slug> (at <worktrees>/<repo>-<slug> unless --path), copies .freeflow/local.json into it when it has none, and makes the worktree the child's directory. The user then starts a session there: --agent is the command that starts this host's agent (such as claude or codex), and the output ends with a command for the user to paste into a new terminal.",
  ],
  [
    "project show",
    "Usage: project show [--cwd <directory>] [--name <project>]\nPrints a project and its tasks: ID, title, parent, and whether a session owns it. Without --name, the project linked to the repository containing --cwd.",
  ],
  ["project list", "Usage: project list\nPrints every project: name, number of tasks, and linked repositories."],
  [
    "project remove",
    "Usage: project remove --name <project>\nMoves the project's store (every task's record) to the trash under the Freeflow home, removes the project and its tasks from the registry, and removes its .freeflow/project links. Git worktrees and branches stay; the output gives the commands to remove them. Run it only when the user asked to remove that project. Never empty the trash: the user does.",
  ],
  [
    "task remove",
    "Usage: task remove --id <task ID>\nMoves the task's record, and its children's, to the trash under the Freeflow home and removes them from the registry. Task numbers are never reused. Git worktrees and branches stay; the output gives the commands to remove them. Run it only when the user asked to remove that task. Never empty the trash: the user does.",
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
    "Usage: slice propose --record <record.md> --title <title> --input <file|->\nInput: Intended result required; Type, Expected evidence, and Dependencies optional. Commands set State; input never includes it. Use --input - to read the fragment from stdin.\nSchema 5 input: Result wanted required; Done when and Dependencies optional.",
  ],
  [
    "slice start",
    "Usage: slice start --record <record.md> --title <proposal title> --next-action <text> --input <file|->\nInput: Authority source, Scope, Expected evidence, Stop condition, and Starting state required. Use --input - to read the fragment from stdin.\nSchema 5 input: Scope, Stop if and Started from required; Under (default: the open agreement), Done when (default: the proposal's), Waits on (D-NNN, comma-separated) and Dependencies.",
  ],
  [
    "slice start-direct",
    "Usage: slice start-direct --record <record.md> --title <title> --next-action <text> --input <file|->\nInput: Intended result, Authority source, Scope, Expected evidence, Stop condition, and Starting state required; Future Work is unchanged. Use --input - to read the fragment from stdin.\nSchema 5 input: Result wanted, Scope, Done when, Stop if and Started from required; Under (default: the open agreement), Waits on and Dependencies.",
  ],
  [
    "slice pause",
    "Usage: slice pause --record <record.md> --reason <reason> --resume-when <condition> --next-action <text>",
  ],
  ["slice resume", "Usage: slice resume --record <record.md> --resolution <source> --next-action <text>"],
  [
    "slice close",
    'Usage: slice close --record <record.md> --state <completed|blocked|abandoned> --next-action <text> --input <file|->\nInput: Result, Evidence and limits, and Task effect required. Use --input - to read the fragment from stdin.\nSchema 5 input: Cue ("read when …", at most 25 words), Result, Evidence and Task effect required; Resume when for blocked, Reason for abandoned. Appends the Slice\'s History entry, its updates included, then syncs the Freeflow store holding the task. A Slice is not closed as completed while a delegation it Waits on is open.',
  ],
  [
    "slice reopen",
    "Usage: slice reopen --record <record.md> --id <S-NNN> --next-action <text> --input <file|->\nInput: fresh Authority source, Scope, Expected evidence, Stop condition, and Starting state required. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice record",
    "Usage: slice record --record <record.md> --title <title> --state <completed|blocked|abandoned> --input <file|->\nRecords a Slice that finished before it could be recorded, directly into History. The Current Slice, Future Work, and Next useful action are unchanged; the ID follows recording order and the command adds Recorded: retroactively on <today>.\nInput: Occurred (YYYY-MM-DD or YYYY-MM-DD to YYYY-MM-DD), Intended result, Authority source, Result, Evidence and limits, and Task effect required; Type and Residual effects optional; Resume when required for blocked; Reason required for abandoned. Use --input - to read the fragment from stdin.\nSchema 5 input: Occurred, Cue, Under, Result wanted, Result, Evidence and Task effect required; Resume when for blocked, Reason for abandoned.",
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
  return command === "init" || command === "store" ? `${help}\n` : `${help}\n${ROOT_HELP}\n`;
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
    if (token === "--help" || token === "--strict" || token === "--pull" || token === "--resolved") {
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
  if (command === "init") return new Set(["--root", "--name", "--input", "--schema", "--cue", "--help"]);
  if (command === "view") return new Set(["--root", "--record", "--view", "--help"]);
  if (command === "validate") return new Set(["--root", "--record", "--strict", "--help"]);
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
    if (operation === undefined) return new Set(["--root", "--record", "--repo", "--help"]);
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
  if (command === "agreement") {
    if (operation === "open") return new Set([...withNextAction, "--title"]);
    if (operation === "update") return new Set([...common, "--text"]);
    if (operation === "close") return new Set([...withNextAction, "--state"]);
  }
  if (command === "task" && operation === "create")
    return new Set(["--title", "--goal", "--parent", "--cwd", "--help"]);
  if (command === "task" && operation === "import") return new Set(["--record", "--project", "--help"]);
  if (command === "task" && operation === "search")
    return new Set(["--query", "--id", "--scope", "--project", "--help"]);
  if (command === "task" && operation === "env")
    return new Set(["--id", "--primary", "--add-dir", "--remove-dir", "--help"]);
  if (command === "task" && operation === "here") return new Set(["--cwd", "--help"]);
  if (command === "task" && operation === "fanout")
    return new Set(["--parent", "--title", "--goal", "--path", "--base", "--cwd", "--agent", "--help"]);
  if (command === "project" && (operation === "new" || operation === "link"))
    return new Set(["--name", "--cwd", "--worktrees", "--help"]);
  if (command === "project" && operation === "show") return new Set(["--cwd", "--name", "--help"]);
  if (command === "project" && operation === "list") return new Set(["--help"]);
  if (command === "task" && operation === "remove") return new Set(["--id", "--help"]);
  if (command === "project" && operation === "remove") return new Set(["--name", "--help"]);
  if (command === "store" && operation === "init")
    return new Set(["--remote", "--home", "--git-name", "--git-email", "--help"]);
  if (command === "store" && operation === "remote") return new Set(["--url", "--home", "--help"]);
  if (command === "store" && operation === "status") return new Set(["--home", "--help"]);
  if (command === "store" && operation === "sync")
    return new Set(["--home", "--message", "--pull", "--resolved", "--help"]);
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
    WORK_AGREEMENT_HEADING,
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
  // The skeleton has no Work agreement heading: it is written only when the input gives one.
  if (targets.has(WORK_AGREEMENT_HEADING))
    output.splice(output.indexOf("### What defines this task"), 0, `### ${WORK_AGREEMENT_HEADING}`, "");
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

const INIT5_HEADINGS = ["Goal", "Settled", "Open", "Space", "Read on recovery", "Read when", "Next action"];

async function initialize5(options) {
  const root = rootOption(options);
  const name = requireOption(options, "--name");
  const cue = requireOption(options, "--cue").replace(/\s+/g, " ").trim();
  const problem = cueProblem(cue);
  if (problem) throw new CliError(`--cue: ${problem}`);
  const input = (await readInput(options["--input"], cwd())).replace(/\r\n?/g, "\n");
  const sections = {};
  let current = null;
  for (const line of input.split("\n")) {
    const heading = /^#{2,3} (.+?)\s*$/.exec(line);
    if (heading) {
      if (!INIT5_HEADINGS.includes(heading[1]))
        throw new CliError(
          `Unknown initialization heading: ${heading[1]}; Schema 5 takes ${INIT5_HEADINGS.join(", ")}`,
        );
      if (sections[heading[1]]) throw new CliError(`Duplicate initialization heading: ${heading[1]}`);
      current = heading[1];
      sections[current] = [];
    } else if (current) sections[current].push(line);
    else if (line.trim()) throw new CliError(`Initialization text outside a heading would be lost: ${line.trim()}`);
  }
  const text = skeleton5({ name, cue, stateAsOf: new Date().toISOString(), sections });
  parseRecord5(text);
  const created = await createRecordPath(root, name, slugify(name));
  try {
    await writeInitialAtomically(root, created.path, text);
    await writeTaskFile(root, created.path, HISTORY_FILE, null, emptyHistory(name));
    await writeTaskFile(root, created.path, DECISIONS_FILE, null, EMPTY_DECISIONS);
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

/** Schema 5's validate: the task folder's structure, then budget and cue warnings and the update lines' pointers. */
async function validate5(loaded, options) {
  const task = await loadTask5(loaded.path, loaded.text);
  const slice = task.record.work.slice;
  // An update is "<claim> — <pointer>": what follows its last dash is the pointer, whatever its shape.
  const updates = (slice?.updates ?? []).map((update) => {
    const pointer = update.text.includes(" — ") ? update.text.split(" — ").pop().trim() : "";
    return { index: update.index, line: `- ${update.kind}: ${update.text}${pointer ? ` \`${pointer}\`` : ""}` };
  });
  const pointers = checkLinePointers(updates, { root: loaded.root, recordPath: loaded.path });
  const unresolved = options["--strict"] ? pointers.warnings : [...pointers.problems, ...pointers.warnings];
  const notes = [
    ...warnings5(task).map((warning) => `warning: ${warning}`),
    ...unresolved.map((each) => `warning: a pointer in the Slice's updates does not resolve here: ${each}`),
    ...pointers.outside.map((each) => `outside the repository, not checked: ${each}`),
  ];
  if (options["--strict"] && pointers.problems.length)
    throw new CliError(
      `Pointers on Evidence or Result lines do not resolve:\n${pointers.problems.map((each) => `- ${each}`).join("\n")}`,
    );
  return `valid\n${displayPath(loaded.root, loaded.path)}, ${task.history.entries.length} history entries\n${pointers.checked} evidence pointer(s) checked${notes.length ? `\n${notes.join("\n")}` : ""}\n`;
}

/** Projects, registered tasks and search, through the registry under the Freeflow home. */
async function runRegistry(command, operation, options) {
  const registry = new Registry();
  const where = options["--cwd"] ?? cwd();
  // Where the user can browse the project's records, when the project link was made.
  const browse = async () => {
    const link = resolve(await registry.repoRoot(where), PROJECT_LINK);
    return existsSync(link) ? ` The user can browse its records at ${link}.` : "";
  };
  if (command === "project" && operation === "new")
    return `Project ${await registry.createProject(requireOption(options, "--name"), where, options["--worktrees"])} created and linked to ${await registry.repoRoot(where)}.${await browse()}\n`;
  if (command === "project" && operation === "link")
    return `${await registry.repoRoot(where)} linked to project ${await registry.linkProject(requireOption(options, "--name"), where, options["--worktrees"])}.${await browse()}\n`;
  // Removal moves records to the trash; nothing here empties it, which is the user's to do (Task 006).
  if (command === "task" && operation === "remove")
    return `${removalText(await registry.removeTask(requireOption(options, "--id")), registry.trash)}\n`;
  if (command === "project" && operation === "remove")
    return `${removalText(await registry.removeProject(requireOption(options, "--name")), registry.trash)}\n`;
  if (command === "project" && operation === "list") {
    const data = await registry.read();
    const projects = Object.entries(data.projects);
    if (!projects.length) return "No projects.\n";
    const count = (slug) => Object.values(data.tasks).filter((task) => task.project === slug).length;
    return `${projects.map(([slug, project]) => `- ${project.name} (${slug}): ${count(slug)} task(s); repositories ${project.repos.join(", ")}`).join("\n")}\n`;
  }
  if (command === "project" && operation === "show") {
    const found = options["--name"] ? await registry.project(options["--name"]) : await registry.projectFor(where);
    if (!found)
      return options["--name"]
        ? `No project named ${options["--name"]}.\n`
        : `No project is linked to ${await registry.repoRoot(where)}.\n`;
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
    return `${result.id}\n${result.path}\nbranch ${result.branch}${result.copiedConfig ? "; copied .freeflow/local.json" : ""}\nNext: open a new terminal and run:\n  ${startCommand(result.path, options["--agent"])}${options["--agent"] ? "" : " (then start the agent there)"}\n`;
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

/** The Freeflow store: init, status and sync (lib/freeflow-store.mjs). */
async function runStore(operation, options) {
  if (operation === "init") {
    const made = await initStore({
      home: options["--home"],
      remote: options["--remote"],
      name: options["--git-name"],
      email: options["--git-email"],
    });
    if (made.local)
      return `Created a local Freeflow store at ${made.home}; nothing leaves this machine until store remote --url <url> adds your private repository. Commits are authored as ${made.author.name} <${made.author.email}>.\n`;
    const pushed = made.pushed ? "pushed" : `not pushed (${made.reason}); the next store sync pushes it`;
    return made.joined
      ? `Joined the Freeflow store at ${made.home} from ${made.remote}; commits are authored as ${made.author.name} <${made.author.email}>.\n`
      : `Created the Freeflow store at ${made.home} from ${made.remote}, first commit ${pushed}; commits are authored as ${made.author.name} <${made.author.email}>.\n`;
  }
  if (operation === "remote") {
    const moved = await addStoreRemote({ home: options["--home"], url: requireOption(options, "--url") });
    return `${moved.home} is now a cloud store: it syncs with ${moved.url}, and its history (${moved.commits} commit(s)) is pushed.\n`;
  }
  if (operation === "status") {
    const status = await storeStatus({ home: options["--home"] });
    const count = (value) => (value === null ? "unknown (no upstream)" : String(value));
    const last = status.lastSync
      ? `${status.lastSync.at}, ${status.lastSync.result}${status.lastSync.reason ? ` (${status.lastSync.reason})` : ""}`
      : "never";
    return `${[
      `Store: ${status.home}`,
      status.remote
        ? `Remote: ${status.remote} · branch ${status.branch ?? "none"}`
        : `Remote: none, a local store (store remote --url <url> makes it a cloud store) · branch ${status.branch ?? "none"}`,
      `Not committed: ${status.uncommitted} path(s)`,
      `Not pushed: ${count(status.unpushed)} commit(s); not yet taken: ${count(status.behind)}, as of the last sync`,
      `Last sync: ${last}`,
      ...(status.conflict
        ? [
            `Conflict waiting: ${status.conflict.join(", ")}; the remote's copies are under local/conflicts/; then store sync --resolved`,
          ]
        : []),
    ].join("\n")}\n`;
  }
  if (operation === "sync") {
    if (options["--pull"] && options["--resolved"]) throw new CliError("Give --pull or --resolved, not both");
    const synced = await syncStore({
      home: options["--home"],
      message: options["--message"],
      pull: options["--pull"] === true,
      resolved: options["--resolved"] === true,
    });
    const committed = synced.committed ? `committed ${synced.committed} path(s), ` : "nothing to commit, ";
    if (synced.local) return `Synced the local store ${synced.home}: ${committed}nothing to push.\n`;
    if (options["--pull"] && synced.pulled)
      return `Took the remote's commits into ${synced.home}: ${committed}nothing pushed.\n`;
    return synced.pushed
      ? `Synced ${synced.home}: ${committed}pushed.\n`
      : `Synced ${synced.home}: ${committed}not pushed (${synced.reason}); the next store sync pushes it.\n`;
  }
  throw new CliError(`Unknown command: store ${operation}`);
}

async function runCore(command, rest) {
  const { options, positionals } = parseOptions(rest);
  const operation = positionals[0];
  if (options["--help"]) return commandHelp(command, operation);
  validateCommandOptions(command, operation, options);
  if (command === "store") return runStore(operation, options);
  if (
    command === "project" ||
    (command === "task" && ["create", "import", "search", "env", "here", "fanout", "remove"].includes(operation))
  )
    return runRegistry(command, operation, options);
  // A registered task's ID stands for its record's path.
  if (typeof options["--record"] === "string" && TASK_ID.test(options["--record"])) {
    const task = await new Registry().task(options["--record"]);
    if (!task) throw new CliError(`No task ${options["--record"]} in the registry.`);
    options["--record"] = task.record;
  }
  if (command === "init") {
    const schema = options["--schema"] ?? "4";
    if (!["4", "5"].includes(schema)) throw new CliError(`--schema is 4 or 5, not ${schema}`);
    if (schema === "4" && options["--cue"]) throw new CliError("--cue is for --schema 5");
    return schema === "5" ? initialize5(options) : initialize(options);
  }
  if (command === "view") {
    const view = positionals[0] ?? options["--view"];
    if (!view || !["resume", "recover", "full", "entry"].includes(view))
      throw new CliError("View must be resume, recover, full, or entry");
    const ids = positionals.slice(1);
    if (view === "entry") {
      if (!ids.length) throw new CliError("View entry needs at least one S-NNN, C-NNN, or D-NNN ID");
      const invalid = ids.find((id) => !/^[SCD]-\d{3,}$/.test(id));
      if (invalid) throw new CliError(`Not an entry ID: ${invalid}`);
    } else if (ids.length) throw new CliError(`View ${view} accepts no further arguments`);
    const loaded = await readExisting(options);
    if (view === "full") return renderFull(loaded.text);
    if (schemaOf(loaded.text) === 5)
      throw new CliError(`View ${view} for Schema 5 records is not built yet; use view full`);
    if (view === "entry") return renderEntries(loaded.text, ids);
    if (view === "recover") return renderRecover(loaded.text, { root: loaded.root, recordPath: loaded.path });
    return renderResume(loaded.text);
  }
  if (command === "validate") {
    if (positionals.length) throw new CliError("Validate does not accept positional arguments");
    const loaded = await readExisting(options);
    if (schemaOf(loaded.text) === 5) return validate5(loaded, options);
    validateDocument(parseDocument(loaded.text));
    const pointers = checkEvidencePointers(loaded.text, { root: loaded.root, recordPath: loaded.path });
    const outside = pointers.outside.length
      ? `\n${pointers.outside.length} evidence pointer(s) outside the repository, not checked:\n${pointers.outside.map((each) => `- ${each}`).join("\n")}`
      : "";
    // Unresolved pointers warn: a record may name a planned path or a commit not fetched yet. --strict fails on those
    // an Evidence or Result line claims exist.
    const unresolved = options["--strict"] ? pointers.warnings : [...pointers.problems, ...pointers.warnings];
    const warnings = unresolved.length
      ? `\n${unresolved.length} pointer(s) in Material updates do not resolve here (a planned path, or a commit not fetched?):\n${unresolved.map((each) => `- ${each}`).join("\n")}`
      : "";
    if (options["--strict"] && pointers.problems.length)
      throw new CliError(
        `Evidence pointers on Evidence or Result lines do not resolve:\n${pointers.problems.map((each) => `- ${each}`).join("\n")}${warnings}${outside}`,
      );
    return `valid\n${displayPath(loaded.root, loaded.path)}\n${pointers.checked} evidence pointer(s) checked${warnings}${outside}\n`;
  }
  const schema5Only = command === "agreement" || (command === "checkpoint" && positionals.length === 0);
  if (positionals.length !== (command === "checkpoint" && positionals.length === 0 ? 0 : 1))
    throw new CliError(`Expected one operation for ${command}`);
  const loaded = await readExisting(options);
  const input = await readInput(options["--input"], cwd());
  if (schemaOf(loaded.text) === 5) return runTransition5(command, positionals, options, input, loaded);
  if (schema5Only)
    throw new CliError(
      `${command === "agreement" ? "agreement" : "checkpoint without an operation"} is for Schema 5 records; this one is Schema ${schemaOf(loaded.text) ?? "unknown"}`,
    );
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
