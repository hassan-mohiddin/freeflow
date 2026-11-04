#!/usr/bin/env node

import { cwd } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import {
  displayPath,
  readInput,
  readRecord,
  resolveRecordPath,
  storeOf,
  isFreeflowStore,
  freeflowStoreOf,
} from "./lib/store.mjs";
import { checkLinePointers } from "./lib/recover.mjs";
import { loadTask5, schemaOf, warnings5 } from "./lib/record5.mjs";
import { checkpointSession, runTransition5, writeCompactionRequest } from "./lib/transitions5.mjs";
import { budgetLines, budgetFor, contextWindow, measureTask, renderBudget } from "./lib/budget5.mjs";
import {
  copyTaskIntoStore,
  hasOldRecoveryHeadings,
  migrateRecoveryHeadings,
  migrateTask,
  readCues,
} from "./lib/migrate5.mjs";
import { dropBlock, listText, parseNumbers, saveBlock, userMessages } from "./lib/discussion5.mjs";
import { renderBundle5, renderEntries5, renderIndex5, renderRecover5, renderSessionBundle } from "./lib/views5.mjs";
import {
  amendDelegation,
  checkpointDelegation,
  checkReturn,
  closeDelegation,
  delegationStatus,
  joinDelegation,
  joinedDelegation,
  joinedPath,
  openDelegation,
  renderChannel,
} from "./lib/delegations5.mjs";
import { appendChannel, CHANNEL_KINDS } from "./lib/channel5.mjs";
import { addClaims, claimHours, releaseClaims, renderClaims, renewClaims } from "./lib/claims5.mjs";
import { addStoreRemote, initStore, missingParts, storeHome, storeStatus, syncStore } from "./lib/freeflow-store.mjs";
import {
  createProject,
  createTask,
  createTaskFolder5,
  findRepositories,
  heldTask,
  listProjects,
  menu,
  sessionRules,
  moveTask,
  releaseTask,
  removeProject,
  requireHold,
  removeTask,
  searchTasks,
  sessionIdentity,
  sessionFiles,
  sessionStatus,
  showProject,
  STORE_TASK_ID,
  storeRecordPath,
  switchTask,
  takeBack,
  takeTask,
} from "./lib/projects5.mjs";
import { EstimateError, estimate } from "./lib/estimate5.mjs";
import { runEvents } from "./lib/events-cli.mjs";
import { appendEvents, HARNESSES } from "./lib/events5.mjs";
import { delegationScope, gateDrift, gatesPath, readGateState, refreshGates } from "./lib/gate-state5.mjs";
import { PlanError } from "./lib/planner5.mjs";

const ROOT_HELP =
  "--record is resolved against --root, which defaults to the current directory; an absolute --record path finds its own root.";

function usage() {
  return [
    "Usage:",
    "  working-record.mjs init --root <path> --name <task name> --cue <cue> [--input <file|->]",
    "  working-record.mjs view recover|full|index --record <record.md>",
    "  working-record.mjs view entry <ID> [<ID> ...] --record <record.md>",
    "  working-record.mjs validate --record <record.md>",
    "  working-record.mjs <slice|task> <operation> ...",
    "  working-record.mjs agreement <open|update|close> ...",
    '  working-record.mjs agree --outcome <text> [--exact-spec "<reason>"] (a session holding no task)',
    "  working-record.mjs checkpoint --record <record.md> [--repo <path>] [--input <file|->] [--compact]",
    "  working-record.mjs checkpoint --session --input <file|-> [--compact] (a session holding no task)",
    "  working-record.mjs budget [--record <record.md>] [--window <tokens>] [--mode normal|expanded]",
    "  working-record.mjs estimate [--used <tokens>] [--window <tokens>] [--done <n> --left <m>] [--transcript <path>]",
    "  working-record.mjs estimate --plan --record <ID> [--input -] [--fan-out <n>] [--done <n>] | --spent --record <ID> [--json] | --project <name> | --store",
    "  working-record.mjs view bundle --record <record.md> | --session",
    "  working-record.mjs delegate <open|amend|status|check-return|close|join|log> ...",
    "  working-record.mjs checkpoint --delegation <D-NNN> --record <record.md> --input <file|-> [--compact] (a worker)",
    "  working-record.mjs claim --paths <glob> ... [--for <hours>] | claim --list; release [--paths <glob> ...] [--ended]",
    "  working-record.mjs discussion <list|save|drop> --record <record.md> ...",
    "  working-record.mjs carry <list|show> ...",
    "  working-record.mjs migrate --record <record.md> --cue <cue> [--cues <file>] [--project <name>] (Schema 4 to 5)",
    "  working-record.mjs project <new|show|list|remove> ... (in a Freeflow store)",
    "  working-record.mjs task <create|take|release|switch|move|here|search|remove> ... (in a Freeflow store)",
    "  working-record.mjs store <init|remote|status|sync> ...",
    "  working-record.mjs session status [--home <folder>] (for a harness layer)",
    "  working-record.mjs events <append|summary|show> ... (the event log; append is for a harness layer)",
    "",
    ROOT_HELP,
    "In a Freeflow store, a task's ID (such as my-project/task-003, or task-004 in no project) may be given as --record.",
  ].join("\n");
}

const COMMAND_HELP = new Map([
  [
    "agree",
    "Usage: agree --outcome <text> [--exact-spec \"<reason>\"] [--home <folder>]\nRecords the user's agreement for a session that holds no task (a task's agreement is agreement open): in this session's gate state, <FREEFLOW_HOME>/sessions/<session>/gates.json, which the gates read, and as an agreement line in its event log. --exact-spec declares that the request fixes every choice, with the reason; the declaration lasts the session and is logged, for a reviewer to audit. Refused while the session holds a task.",
  ],
  [
    "events append",
    "Usage: events append --input <file|-> [--home <folder>]\nAppends a Freeflow driver's event lines (JSON Lines, schema v1) to each line's session log in <FREEFLOW_HOME>/events/<session>.jsonl, on this machine only: it sets seq under a lock on the file, redacts and cuts a shell command to 200 characters, refuses a line that is not schema v1 and writes the rest, with a freeflow line saying how many it dropped.",
  ],
  [
    "events summary",
    "Usage: events summary [--session <ID>] [--json] [--home <folder>]\nWhat a session's event log adds up to: model requests and tokens by model and effort, tool calls by tool with failures, compactions, workers, and the share of tool calls that were Freeflow's own; since this session took its task when it holds one. The session is this one unless --session names another; with neither, every log here with its size.",
  ],
  [
    "events show",
    "Usage: events show [--session <ID>] [--kind <kind>] [--home <folder>]\nPrints a session's event log as stored, one JSON line each, only the lines of one kind with --kind; a line that cannot be read is named on standard error and skipped.",
  ],
  [
    "slice",
    [
      "Usage: working-record.mjs slice <operation> ...",
      "Operations: slice propose, slice start, slice start-direct, slice pause, slice resume, slice close, slice record.",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
      "Use --input - to read Markdown fragments from stdin.",
    ].join("\n"),
  ],
  [
    "checkpoint",
    [
      "Usage: working-record.mjs checkpoint --record <record.md> [--repo <path>] [--input <file|->] [--compact]",
      "       working-record.mjs checkpoint --session --input <file|-> [--compact] (a session holding no task)",
      'The checkpoint, before a compaction or a transfer, once Current Context is rewritten: with --input, rewrites In flight whole from its lines (each "- Now|Observed|Hypothesis|Dropped|Pending: …"; "none" empties it), and, after a line "Recovery:", replaces the Recovery list whole with the lines below it (each "- always: <pointer> — <why>", "- always, not counted: <pointer> — <why>" or "- when <trigger>: <pointer> — <why>", a file pointer optionally followed by "(lines <a>–<b>)"); "Recovery: none" empties the list, input without that line keeps it, and input with only that block keeps In flight; prints each Recovery line with the size of what it names and an always line\'s share of the budget, and names an always, not counted line the new list dropped; checks the task folder\'s structure and the recovery budget for the session\'s window (FREEFLOW_CONTEXT_WINDOW) and the task\'s mode, warning when the counted memory or a fixed part is over; writes the Space line for the work repository at --repo (default: the current directory, unless it is the Freeflow store), sets State as of, then commits and pushes the Freeflow store holding the task. Refused for a task in the store that this session does not hold: take it first with task take.',
      "With --session, for a session that holds no task: writes the session summary to <store>/sessions/<session ID>/summary.md, which Freeflow's compaction installs and removes. Input: the headings ## Goal, ## Settled, ## Open, ## Agreement, ## In flight, ## Recovery, ## Next action, in order; Goal and Next action must say something; (none) where a heading has nothing; Recovery\'s lines as a record\'s, whose always files view bundle --session copies fresh.",
      "With --delegation <D-NNN>, a worker's checkpoint, in the worker's own session or a subagent: rewrites the delegation's progress.md whole from the input's ## Done, ## Half done, ## Didn't work and ## Next (Next required), with the time, and logs it; a worker session's compaction then installs view bundle --delegation. A session that joined a delegation checkpoints only this way.",
      "With --compact, any form also asks Freeflow's harness layer to compact the session at the end of this turn, with the record in place of the conversation: it leaves a request in <store>/sessions/<session ID>/compact.json, which session status reports, where the session's Freeflow driver claims it can compact (its capabilities.json); elsewhere it leaves none and says so. A checkpoint without it never compacts. Where no harness layer runs, nothing more happens.",
      "Use --input - to read Markdown fragments from stdin.",
    ].join("\n"),
  ],
  [
    "task",
    [
      "Usage: working-record.mjs task <operation> ...",
      "Operations: task set-state and task set-budget on a record; in a Freeflow store, task create, take, release, switch, move, here, search and remove. A task belongs to a project (<project>/task-NNN) or to none (task-NNN). A session holds at most one task and a task has at most one holder: its sessions.md's last open line. The session is read from the environment: CLAUDE_CODE_SESSION_ID on Claude Code, else FREEFLOW_SESSION (with FREEFLOW_HARNESS and FREEFLOW_RESUME).",
      "Run working-record.mjs <group> <operation> --help for options and input fields.",
    ].join("\n"),
  ],
  [
    "init",
    "Usage: init --root <path> --name <task name> --cue <cue> [--input <file|->]\nWrites a Schema 5 task folder: record.md, history.md and decisions.md, then prints the record's path and the recovery budget. --cue (required) says when the task matters, starting \"read when\", in at most 25 words. Input: Goal and Next action required; Settled, Open, Space and Recovery accepted. --root may be a project's folder in the Freeflow store (<store>/projects/<project>), whose tasks/ then holds the task; elsewhere the task goes in <root>/.freeflow/tasks/. The record starts active. Use --input - to read Markdown fragments from stdin.",
  ],
  [
    "discussion",
    'Usage: working-record.mjs discussion <list|save|drop> --record <record.md> ...\nThe user\'s messages that shaped the work, kept word for word as blocks in sources/discussion.md, each message with the agent\'s line saying what it answered; blocks are added or dropped, never edited. The transcript is --transcript <path> (--format claude-code, pi or plain; a Pi session file is known by its header), else FREEFLOW_TRANSCRIPT, else this Claude Code session\'s log; --transcript - reads a plain export (lines starting "User:" or "Assistant:") from standard input.',
  ],
  [
    "discussion list",
    "Usage: discussion list --record <record.md> [--since <time>] [--until <time>] [--transcript <path>] [--format <claude-code|pi|plain>]\nNumbers the user's messages since the record's State as of (or --since), each with its time and first words; messages sent while a turn ran are included, and resent duplicates and cut-off copies left out.",
  ],
  [
    "discussion save",
    'Usage: discussion save --record <record.md> --messages <4-7,11> --title <topic> --shapes <A-NNN, S-NNN> [--replaces B-NNN] [--since <time>] [--transcript <path>] --input <file|->\nAppends one block B-NNN to sources/discussion.md: the chosen messages, numbered as discussion list numbers them, word for word, each followed by the agent\'s line. --shapes names the agreement or Slices the discussion shaped; --replaces drops the block this one replaces. Input: one "N: <what the message answered, specifically enough that it reads alone>" line per chosen message.',
  ],
  [
    "discussion drop",
    "Usage: discussion drop --record <record.md> --block <B-NNN>\nRemoves a block, once the work it shaped is closed and nothing open rests on it; Git keeps it. checkpoint lists the blocks whose shaped work is closed.",
  ],
  [
    "migrate",
    "Usage: migrate --record <record.md> --cue <cue> [--cues <file>] [--project <name> [--home <folder>]]\nConverts a Schema 4 record to Schema 5: Goal, Settled (with the active Decisions) and Open (with Tentative and pending Checkpoints); the Work agreement and Boundaries become the open agreement A-001; What defines this task and the Recovery sources become Recovery lines (a definition or a skill always and not counted, a source with \"read when …\" a when line, the rest always); the Current Slice and its Material updates carry over; proposed Slices stay in Future Work, with Current direction as one more; closed Slices become history.md entries. The Schema 4 record is kept whole in sources/schema4-record.md, Notes move to sources/notes.md, and the decision list moves to decisions.md when an agreement is open. --cue is the task's cue; --cues is a file of \"S-NNN: read when …\" lines for closed Slices, and a Slice without one is marked missing. Without --project the folder converts in place; with it, the folder is copied into that project in the Freeflow store as its next task, converted there and pushed, and the original stays as it was. A Schema 5 record kept without a store, in a repository's .freeflow/tasks/, is brought into the store the same way with --project, unchanged, and needs no --cue. A Schema 5 record written before the one Recovery list (with Defined by, Read on recovery and Read when, or Carry lines in In flight) is converted in place, needing no --cue: each Defined by entry becomes an always, not counted line, each Read on recovery entry and Carry file an always line, and each Read when entry a when line with its trigger; the record as it was is kept in sources/record-before-recovery.md. migrate is the only command that reads a Schema 4 record, whether kept in a repository's .freeflow/tasks/ or by Pi's former Task Memory (its projects' records under the folder that holds registry.json).",
  ],
  [
    "delegate",
    "Usage: working-record.mjs delegate <operation> ...\nOperations: delegate open, delegate amend, delegate status, delegate check-return, delegate close, delegate join, delegate log. One folder per delegation, delegations/D-NNN-<slug>/ in the task folder, with brief.md (whoever hands the work out), progress.md and return.md (the worker); a sub-worker's folder sits inside its worker's. Only the coordinator's delegations have a line in Current Work's Delegations and an entry in History. How to hand work out: Execute Work's references/delegation.md.",
  ],
  [
    "delegate join",
    "Usage: delegate join --record <record.md> --id <D-NNN>\nRun in the worker's own session, as the prompt delegate open --session printed says: makes this session the worker of a delegation opened with --session. Records the session as the brief's Handle and in <FREEFLOW_HOME>/sessions/<session>/delegation.json, logs that it joined, and prints the worker's recovery (view recover --delegation). From then on this session holds no task: task take, task create, task switch, checkpoint --record or --session, and every command that writes the record are refused (\"this session works for D-NNN\"); it writes its progress.md with checkpoint --delegation and its return.md, and may hand parts to its own subagents (delegate open --parent), never to another session. Refused for a sub-worker, a delegation opened for a subagent, one not open, and a session that holds a task.",
  ],
  [
    "delegate log",
    "Usage: delegate log --record <record.md> [--id <D-NNN>]\n       delegate log --record <record.md> --id <D-NNN[.n]> --append --kind <inform|blocked> --body <text> [--agent <agent ID>] (for a harness layer)\nPrints the task's delegation log, channel.jsonl in the task folder: one line per delegation event (brief, amend, progress, return, blocked, sent-back, accepted, stopped, inform), with its time, who wrote it (the session, and the agent for a subagent) and a short body; with --id, one delegation's and its sub-workers'. The commands that act write it (delegate open, amend, join, check-return and close, checkpoint --delegation); --append is how a harness layer logs its own notice to a worker or the block of its stop. No message goes through it.",
  ],
  [
    "claim",
    "Usage: claim --paths <glob> ... [--for <hours>] [--home <folder>]\n       claim --list [--home <folder>]\nClaims files this session is changing, for the task it holds or the delegation it works for, in the Freeflow store's claims.jsonl (the project's, or the store's for a task with no project), so the delegation gate warns another session before it writes them. A path is kept relative to its repository, so every checkout and worktree of it is covered. A claim lasts --for hours (default: delegation.claimHours, which the driver passes as FREEFLOW_CLAIM_HOURS, else 4), is renewed by this session's store sync while it is live, and ends at release, its delegation's close or the session's end. --list prints every live claim in the store.",
  ],
  [
    "release",
    "Usage: release [--paths <glob> ...] [--ended] [--home <folder>]\nReleases this session's claims, all of them or those naming --paths. With --ended, as a harness layer runs it when the session ends: releases them all and, in a worker session, logs in its delegation's log that the session ended, so the coordinator's delegate status shows it.",
  ],
  [
    "delegate open",
    "Usage: delegate open --record <record.md> --title <title> --kind <build|review|research|eval|gather> --agent \"<model>, <effort>\" [--repo <path> [--base <ref>] [--branch <name>] [--worktree <path>]] [--from S-NNN] [--under A-NNN] [--continues D-NNN] [--handle <agent ID>] [--parent D-NNN] [--writes <glob> ...] [--session] --input <file|->\nAssigns D-NNN (or D-NNN.n with --parent), writes brief.md from the template, and, with --repo, makes the worker's own worktree on a new branch at the base (default HEAD). Without --parent it writes the delegation's line in Current Work's Delegations; --parent opens a sub-worker's delegation inside its worker's folder, and is refused for a sub-worker (no fourth level). --from defaults to the current Slice and --under to the open agreement. --writes, once per glob, names what the worker may write (relative to its worktree; absolute without one) and puts a \"May write:\" line at the top of the brief's Scope, which the delegation gate reads; without it a worker with a worktree may write the worktree, and one without is a reader; in a Freeflow store, the same globs are claimed for the delegation (claim), so other sessions are warned. --session hands the work to a separate session rather than a subagent: the brief's Agent line says Process: session, and the output prints the command that starts the worker session on Claude Code and on Pi, whose prompt runs delegate join. Each open logs a brief line in the task's delegation log (delegate log).\nInput: the brief's sections under \"## <section>\" headings: Result wanted, Scope and Done when required; Settled, Read and Return when optional. Read gains the delegation reference and the worker's recover command.\nWith no task, --scratch <folder> in place of --record keeps the delegation in <folder>/delegations/ with the same brief, and records nothing.",
  ],
  [
    "delegate amend",
    "Usage: delegate amend --record <record.md> --id <D-NNN[.n]> (--text <change> | --input <file|->) [--handle <agent ID>]\nAppends the change, dated, to the brief's Changes, so a worker that compacts afterwards still has it; tell the worker too. A returned delegation runs again (another round in the same folder). --handle records the host's ID for the agent.",
  ],
  [
    "delegate status",
    "Usage: delegate status --record <record.md> [--json]\nThe open delegations: ID, title, kind, agent, when opened, branch, whether a return is there, and each one's sub-workers. With --json, the same as data for a harness layer such as Freeflow's Claude Code pane: delegations, each with id, title, kind, agent, opened, handle, branch, worktree, returned (its return's State, or null), folder and sub (its sub-workers, the same way).",
  ],
  [
    "delegate check-return",
    "Usage: delegate check-return --record <record.md> --id <D-NNN[.n]>\nRefuses a return that is missing, lacks its State line or a heading (Result, Identities, Checks, Left open, Not done; a reviewer returns Review Work's report instead), or names a commit that is not on the brief's branch. When it passes, the delegation's line says returned and the delegation log has its return (or blocked) line; it warns when Left open has text but no choice line (\"- <the choice> -> <what was taken>[, technical]\"). A worker session checks its own return the same way, leaving the record as it is. A return that passes is not accepted: read it and the diff, and rerun the check that decides the result. --scratch <folder> in place of --record checks a delegation opened with --scratch.",
  ],
  [
    "delegate close",
    "Usage: delegate close --record <record.md> --id <D-NNN> --outcome <accepted|sent back|stopped> [--merge <commit>] [--tokens <n>] [--minutes <n>] [--transcript <path>] --input <file|->\nRecords the outcome in the delegation's one History entry, with the model, effort, tokens and minutes the host reports, what the worker used (its Measured line: context, billed tokens and list-price cost by model and effort, working and wall-clock time, read from its own log beside the coordinator's transcript, --transcript or FREEFLOW_TRANSCRIPT, found by the brief's Handle or Freeflow's map of workers; else not measured), the merge commit and the return's path; removes its line; logs the outcome in the delegation log; releases the delegation's claims (unless sent back); syncs the store. Accepting adds each of the return's Left open choices to decisions.md with the next free ID, as \"- P<n> [default] <choice> -> <taken> (from D-NNN)\" (a technical one as a T item serving the plain item added last, to relink), and is refused when decisions.md would not validate. Accepting needs a return that passes check-return and, when the brief has a branch, the commit that merged it. A sub-worker's delegation is not closed here: its worker reports it.\nInput: Cue (\"read when …\", at most 25 words), Result and Task effect required.",
  ],
  [
    "agreement",
    "Usage: working-record.mjs agreement <operation> ...\nOperations: agreement open, agreement update, agreement close. A task has one open agreement at a time: what the user agreed, in their words, dated; its decision list is decisions.md beside the record.",
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
    "estimate",
    "Usage: estimate [--used <tokens>] [--window <tokens>] [--done <n> --left <m>] [--transcript <path>]\n       estimate --plan --record <ID> [--input -] [--fan-out <n>] [--done <n>] [--used <tokens>] [--window <tokens>]\n       estimate --spent --record <ID> [--json]\n       estimate --project <name> | --store\nHow much of the context window the work has used, before you decide what fits in this context cycle: the context's use (--used, as the harness shows it; else the latest request in the session's transcript, --transcript or FREEFLOW_TRANSCRIPT or this Claude Code session's log) against the window (--window, else FREEFLOW_CONTEXT_WINDOW, else 200,000 tokens) and the point where Freeflow's notice comes (75% of the window), with what is left before it. With --done <n> --left <m>, the parts of the work done in this context cycle and the parts still to do: what the rest needs at the rate so far (an upper bound), and whether it fits before the notice or about how many more context cycles it takes.\nWith --plan, the Slices left (Future Work's proposals, or with --input one Slice a line, \"- <title>\", then optionally \" · after: <titles it waits for>\"): each one's expected context, working time and cost at API list price, from the median of the nearest of this task, its project and the store holding 3 measured Slices, corrected by the median of actual over predicted; the context cycle each lands in; any Slice bigger than a context cycle; the totals; the Slices with no dependency between them; and delegations' measured cost by kind, model and effort, with --fan-out <n> pricing n workers. With fewer than 3 measured Slices anywhere, --done <n> plans at this context cycle's rate. --project <name> lists each of the project's tasks with what it used and what its proposed Slices would take; --store adds up every project and task by model and effort, and delegations by kind. --spent adds up what one task has used so far, from its History's Measured lines: its Slices and delegations measured, their cost, and by model and effort; with --json, as data (slices, partial, delegations, usd, byModel) for a harness layer such as Freeflow's Claude Code pane. Prices are the dated table in lib/measure5.mjs, or the JSON file FREEFLOW_PRICES names. It prints costs and never picks a model.",
  ],
  [
    "budget",
    "Usage: budget [--record <record.md>] [--window <tokens>] [--mode normal|expanded]\nThe recovery budget, before you write: the total for the session's context window (--window, else FREEFLOW_CONTEXT_WINDOW, else 200,000 tokens) and the task's mode (--mode, else the record's Budget, else normal), by the square root of the window (about 10,000 words at 200,000 tokens; expanded half as large again); Current Context and Future Work fixed; what the decisions shown and the History index may hold; what is not counted (the rules, the skills, the files Recovery's always, not counted lines name). With --record: what each part holds now, the total and what is left.",
  ],
  [
    "view",
    "Usage: view recover|full|index|bundle --record <record.md>\n       view entry <ID> [<ID> ...] --record <record.md>\n       view bundle --record <record.md> [--fallback]\n       view bundle --record <record.md> --delegation <D-NNN>\n       view bundle --session [--home <store>]\nrecover [--delegation <D-NNN[.n]>] prints an opening line (the record is memory; the user's direction decides the work), then the store's and the project's rules, record.md, the open agreement's decisions within their budget (waiting and answered first), the History index (the newest within the budget, and any the record names), the project's other tasks with their cues, and the checks: the budget, pointers that do not resolve, the store's unpushed commits, and where each repository in Space is. bundle: the same, then the files Recovery's always lines name (counted) and its always, not counted lines name, and the core skills (not counted), each whole or for the lines its line gives, read now, their sizes, and the recovery line: what Freeflow's compaction installs. With --fallback, for a compaction that came before the checkpoint, what Freeflow adds after the harness's own summary: the same bundle as of the record's State as of, then the user's messages since then word for word (as discussion list reads them), and a closing line naming that time and the transcript, to read back what the summary lost. With --session, the bundle of a session that holds no task: the store's rules, the session summary, and the files its Recovery always lines name. entry: the named S-NNN, A-NNN or D-NNN History entries as stored. index: every History entry, one line each. full: record.md as stored. With --delegation, recover is a worker's: after the opening line it states the worker's rule (the brief is its scope and wins over the record) and prints the delegation's brief, progress and return; bundle --delegation is what a worker session's compaction installs: the same, the task's state for context, and the worker's recovery line. full prints record.md of any schema, a Schema 4 one too; every other view and command but migrate refuses a Schema 4 record.",
  ],
  [
    "validate",
    "Usage: validate --record <record.md> [--strict]\nChecks the task folder's structure (record.md, history.md, decisions.md), warns where the budget or a cue is over, and checks whether the pointers in the current Slice's update lines resolve: files (from the task folder or the repository root) and commits. An unresolved pointer is a warning, since it may name a planned path or a commit not fetched yet; with --strict, one on an Evidence or Result line fails. Pointers outside the repository are listed, not checked.",
  ],
  [
    "store",
    "Usage: working-record.mjs store <operation> ...\nOperations: store init, store remote, store status, store sync.\nThe Freeflow store is one Git repository at the Freeflow home (FREEFLOW_HOME, default ~/.freeflow, or --home) that holds every task's memory; its records are tracked on purpose. It is local by default, on this device only; with your private repository as its remote it is a cloud store, the same store kept in step on every device.",
  ],
  [
    "store init",
    "Usage: store init [--remote <url>] [--home <folder>] [--git-name <name> --git-email <email>]\nWithout --remote, makes a local store in the folder: the store's layout (store.json, .gitignore, .gitattributes, rules/, projects/) and a first commit authored as you; nothing leaves this machine. With --remote, clones the private repository into the store's folder. An empty repository gets the store's layout (store.json, .gitignore, .gitattributes, rules/, projects/) and a first commit authored as you, pushed to main; a repository that already holds a store is joined as it is. Refuses a folder that holds anything else, Pi's former Task Memory (registry.json) among them, and a repository that is not a store. Without --git-name and --git-email, your Git configuration's identity is used.",
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
    "session status",
    "Usage: session status [--home <folder>]\nPrints, as JSON for a harness layer such as Freeflow's Claude Code mod, this session's state in the Freeflow store: home and store (false where the home is not a store, with only missing beside it); session, the session's ID; task, the task it holds, with its ID, record and State as of, or null; summary, the session summary checkpoint --session wrote, with its path and time, or null; changed, whether the store holds paths not committed or commits not pushed; transcript, the session's log, or null; missing, what keeps the session from a working store (a store FREEFLOW_HOME names that is not there, an empty clone not laid out yet, a cloud session's store with no remote), each with what, fix and by (user or agent), and empty when nothing is; compact, the request checkpoint --compact left (its path, requestedAt and done), or null. Reaches no network.",
  ],
  [
    "project",
    "Usage: working-record.mjs project <operation> ...\nOperations: project new, project show, project list, project remove.\nIn the Freeflow store (store init), a project is a folder under projects/ with its rules/ and tasks/; every change is committed and, in a cloud store, pushed. Create or remove a project only when the user asks.",
  ],
  [
    "project new",
    "Usage: project new --name <name>\nMakes projects/<slug>/ in the Freeflow store with rules/ and tasks/, then commits and pushes. Only on the user's word.",
  ],
  [
    "task here",
    "Usage: task here [--cwd <directory>] [--scan <folders>] [--rules]\nThe session-start menu. It opens by saying the record is memory and the user's message decides the work; says which task this session holds, if any; then lists the open tasks of each project whose tasks name --cwd's repository, and those with no project that name it (newest activity first, at most 15 each), each with who holds it and when it last synced, and its cue; or every project's open tasks, when none matches. --scan <folders>, separated as in PATH, remembers where each repository a task names is on this machine, from the Git checkouts at those folders and directly inside them, so recovery resolves its pointers there. --rules adds, after the menu, the store's rules and those of the folder's project and of the task this session holds, each whole: what Freeflow's harness layer gives a session at its start. It takes nothing, except with --take-back, which a harness layer passes at a session's start: when this session's last hold ended with the session (task release --ended) and no other session took that task since, it takes the task back, and the menu opens with \"Took <ID> back: this session held it until it ended.\"",
  ],
  [
    "project show",
    "Usage: project show [--name <project>] [--cwd <directory>]\nLists every task of the project: ID, title, state, who holds it and when it last synced, and its cue; without --name, the menu for --cwd (see task here).",
  ],
  [
    "project list",
    "Usage: project list [--json]\nEach project in the Freeflow store with its number of tasks and the repositories its tasks name in Space. With --json, for a harness layer such as Freeflow's Claude Code pane: every project (the store's tasks with no project under the name null) with each of its tasks, newest first: its ID, title, state and cue; hold, the session holding it (its short ID, harness, where and since when) or null, and thisSession; lastSync; its open agreement and Slice (ID and title) or null; decisions, the open agreement's decision items (id, state, text), those waiting on the user and those the user answered first; and problem, why its record cannot be read, or null.",
  ],
  [
    "project remove",
    "Usage: project remove --name <project>\nDeletes the project's folder and every task in it, then commits and pushes; Git history keeps them, and the output says how to bring them back. Only when the user asked.",
  ],
  [
    "task remove",
    "Usage: task remove --id <task ID>\nDeletes the task's folder, then commits and pushes; Git history keeps it, and the output says how to bring it back. Its number is never reused. Only when the user asked.",
  ],
  [
    "task take",
    "Usage: task take --id <task ID> [--takeover]\nTakes the remote's commits, then writes this session's hold in the task's sessions.md, commits and pushes. Refused while another session holds the task, naming it and when it last synced: ask the user, then --takeover closes that hold as taken over. Refused while this session holds another task: use task switch.",
  ],
  [
    "task release",
    "Usage: task release [--id <task ID>] [--ended] [--no-push]\nCloses this session's hold on the task it holds (or --id) as released, commits and pushes. With --ended, as a harness layer closes it when the session ends: the hold is closed as ended, and when this session is resumed, task here --take-back takes the task back. With --no-push it commits on this machine only, as Codex's driver does in the second or so Codex gives a session's end; the next store sync pushes it.",
  ],
  [
    "task switch",
    "Usage: task switch --id <task ID> [--takeover]\nReleases the task this session holds, then takes the other. Checkpoint the held task first.",
  ],
  [
    "task create",
    "Usage: task create --title <title> --goal <goal> --cue <cue> [--project <project> | --no-project] [--cwd <directory>] [--next-action <text>]\nMakes a Schema 5 task in the project, by default the one whose tasks name --cwd's repository, or with no project (task-NNN, in the store's tasks/) when none does or with --no-project; names that repository in its Space, and this session takes it; then commits and pushes. Only when the user asks or says yes to your question, which also asks where the task goes.",
  ],
  [
    "task move",
    "Usage: task move --id <task ID> (--project <project> | --no-project)\nMoves the task's folder into the project, or out of it to the store's tasks with no project, with the next number free there, then commits and pushes; Git history keeps the old path. Its new ID is printed; the old one no longer names it, and its delegations' briefs name the new one. Refused while another session holds the task. Only on the user's word.",
  ],
  [
    "task search",
    "Usage: task search --query <text> [--project <project>]\nSearches every task's record.md, history.md and decisions.md in the Freeflow store, or the project's. Read-only.",
  ],
  [
    "slice propose",
    "Usage: slice propose --record <record.md> --title <title> --input <file|->\nInput: Result wanted required; Done when and Dependencies optional. Commands set State; input never includes it. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice start",
    "Usage: slice start --record <record.md> --title <proposal title> --next-action <text> --input <file|->\nInput: Scope, Stop if and Started from required; Under (default: the open agreement), Done when (default: the proposal's), Size (default: the proposal's; \"<n> files\", the files it will add or change), Waits on (D-NNN, comma-separated) and Dependencies. Takes the Slice's first reading of what it uses (its Measured line), from --used <tokens>, else the transcript --transcript or FREEFLOW_TRANSCRIPT names; with neither it is not measured. Writes Base, the work repository (--repo, else this folder's, else Space's first on this machine) and its commit, and Predicted, from the Slice's Size where it has one. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice start-direct",
    "Usage: slice start-direct --record <record.md> --title <title> --next-action <text> --input <file|->\nInput: Result wanted, Scope, Done when, Stop if and Started from required; Under (default: the open agreement), Size, Waits on and Dependencies; Future Work is unchanged. Takes the Slice's first reading and writes Base and Predicted, as slice start does.",
  ],
  [
    "slice pause",
    "Usage: slice pause --record <record.md> --reason <reason> --resume-when <condition> --next-action <text>",
  ],
  ["slice resume", "Usage: slice resume --record <record.md> --resolution <source> --next-action <text>"],
  [
    "slice close",
    "Usage: slice close --record <record.md> --state <completed|blocked|abandoned> --next-action <text> --input <file|->\nInput: Cue (\"read when …\", at most 25 words), Result, Evidence and Task effect required; Resume when for blocked, Reason for abandoned. Appends the Slice's History entry, its updates included, then syncs the Freeflow store holding the task. A Slice is not closed as completed while a delegation it Waits on is open. Takes a last reading (--used, --transcript or FREEFLOW_TRANSCRIPT) and writes the Slice's Measured totals into its History entry, or \"not measured\", and its Files: the files added, changed or renamed between its Base commit and HEAD of that repository (--repo, else this folder's or Space's on this machine), or --files <n>. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice size",
    "Usage: slice size --record <record.md> --id <S-NNN> (--files <n> | --range <from>..<to> [--repo <path>])\nAdds a Files line to a closed Slice that has none, for a Slice closed before Slices were sized: --files, or the files added, changed or renamed in that commit range of --repo (else this folder's repository). Appended inside its History entry and dated; a Files line it has stays.",
  ],
  [
    "slice record",
    "Usage: slice record --record <record.md> --title <title> --state <completed|blocked|abandoned> --input <file|->\nRecords a Slice that finished before it could be recorded, directly into History. The current Slice, Future Work and the Next action are unchanged; the ID follows recording order and the command adds Recorded: retroactively on <today>.\nInput: Occurred (YYYY-MM-DD or YYYY-MM-DD to YYYY-MM-DD), Cue, Under, Result wanted, Result, Evidence and Task effect required; Resume when for blocked, Reason for abandoned. Use --input - to read the fragment from stdin.",
  ],
  [
    "task set-state",
    "Usage: task set-state --record <record.md> --state <active|paused|completed|abandoned> --next-action <text>",
  ],
  [
    "task set-budget",
    "Usage: task set-budget --record <record.md> --mode <normal|expanded>\nSets the task's budget mode in the record's header, on the user's word: expanded is half as large again as normal.",
  ],
]);

function commandHelp(command, operation) {
  const help = COMMAND_HELP.get([command, operation].filter(Boolean).join(" ")) ?? COMMAND_HELP.get(command);
  if (!help) return `${usage()}\n`;
  return ["init", "store", "session", "events", "agree", "claim", "release"].includes(command)
    ? `${help}\n`
    : `${help}\n${ROOT_HELP}\n`;
}

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

/** `--session` is a flag elsewhere (a session that holds no task); the events commands take it with a session ID. */
function parseOptions(args, { valued = [] } = {}) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token === "--writes" || token === "--paths") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) throw new CliError(`Missing value for ${token}`);
      options[token] = [...(options[token] ?? []), value];
      index += 1;
      continue;
    }
    if (options[token] !== undefined) throw new CliError(`Duplicate option: ${token}`);
    if (
      [
        "--help",
        "--strict",
        "--pull",
        "--resolved",
        "--takeover",
        "--session",
        "--fallback",
        "--no-project",
        "--plan",
        "--spent",
        "--store",
        "--json",
        "--compact",
        "--rules",
        "--ended",
        "--no-push",
        "--take-back",
        "--append",
        "--list",
      ].includes(token) &&
      !valued.includes(token)
    ) {
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
  if (command === "init") return new Set(["--root", "--name", "--input", "--cue", "--help"]);
  if (command === "view")
    return new Set(["--root", "--record", "--view", "--delegation", "--session", "--fallback", "--home", "--help"]);
  if (command === "claim" && operation === undefined)
    return new Set(["--paths", "--for", "--list", "--home", "--help"]);
  if (command === "release" && operation === undefined) return new Set(["--paths", "--ended", "--home", "--help"]);
  if (command === "budget") return new Set(["--root", "--record", "--window", "--mode", "--help"]);
  if (command === "estimate")
    return new Set([
      "--used",
      "--window",
      "--done",
      "--left",
      "--transcript",
      "--plan",
      "--spent",
      "--record",
      "--input",
      "--fan-out",
      "--json",
      "--project",
      "--store",
      "--help",
    ]);
  if (command === "migrate") return new Set(["--root", "--record", "--cue", "--cues", "--project", "--home", "--help"]);
  if (command === "discussion") {
    const reading = ["--root", "--record", "--since", "--until", "--transcript", "--format", "--help"];
    if (operation === "list") return new Set(reading);
    if (operation === "save")
      return new Set([...reading, "--messages", "--title", "--shapes", "--replaces", "--input"]);
    if (operation === "drop") return new Set(["--root", "--record", "--block", "--help"]);
  }
  if (command === "delegate") {
    const record = ["--root", "--record", "--help"];
    if (operation === "open")
      return new Set([
        ...record,
        "--input",
        "--title",
        "--kind",
        "--agent",
        "--from",
        "--under",
        "--continues",
        "--handle",
        "--repo",
        "--base",
        "--branch",
        "--worktree",
        "--parent",
        "--scratch",
        "--writes",
        "--session",
      ]);
    if (operation === "join") return new Set([...record, "--id", "--home"]);
    if (operation === "log") return new Set([...record, "--id", "--append", "--kind", "--body", "--agent"]);
    if (operation === "amend") return new Set([...record, "--id", "--text", "--handle", "--input"]);
    if (operation === "status") return new Set([...record, "--json"]);
    if (operation === "check-return") return new Set([...record, "--id", "--scratch"]);
    if (operation === "close")
      return new Set([...record, "--id", "--outcome", "--merge", "--tokens", "--minutes", "--transcript", "--input"]);
  }
  if (command === "validate") return new Set(["--root", "--record", "--strict", "--help"]);
  if (command === "agree" && operation === undefined) return new Set(["--outcome", "--exact-spec", "--home", "--help"]);
  if (command === "slice") {
    if (operation === "propose") return new Set([...common, "--title"]);
    if (operation === "start" || operation === "start-direct")
      return new Set([...withNextAction, "--title", "--used", "--transcript", "--repo"]);
    if (operation === "pause") return new Set([...withNextAction, "--reason", "--resume-when"]);
    if (operation === "resume") return new Set([...withNextAction, "--resolution"]);
    if (operation === "close")
      return new Set([...withNextAction, "--state", "--used", "--transcript", "--repo", "--files"]);
    if (operation === "size") return new Set(["--root", "--record", "--id", "--files", "--range", "--repo", "--help"]);
    if (operation === "record") return new Set([...common, "--title", "--state"]);
  }
  if (command === "checkpoint" && operation === undefined)
    return new Set([
      "--root",
      "--record",
      "--repo",
      "--input",
      "--session",
      "--home",
      "--used",
      "--transcript",
      "--compact",
      "--delegation",
      "--help",
    ]);
  if (command === "task" && operation === "set-state")
    return new Set(["--root", "--record", "--state", "--next-action", "--help"]);
  if (command === "task" && operation === "set-budget") return new Set(["--root", "--record", "--mode", "--help"]);
  if (command === "agreement") {
    if (operation === "open") return new Set([...withNextAction, "--title"]);
    if (operation === "update") return new Set([...common, "--text"]);
    if (operation === "close") return new Set([...withNextAction, "--state"]);
  }
  if (command === "events") {
    if (operation === "append") return new Set(["--input", "--home", "--help"]);
    if (operation === "summary") return new Set(["--session", "--json", "--home", "--help"]);
    if (operation === "show") return new Set(["--session", "--kind", "--home", "--help"]);
  }
  if (command === "store" && operation === "init")
    return new Set(["--remote", "--home", "--git-name", "--git-email", "--help"]);
  if (command === "store" && operation === "remote") return new Set(["--url", "--home", "--help"]);
  if (command === "store" && operation === "status") return new Set(["--home", "--help"]);
  if (command === "session" && operation === "status") return new Set(["--home", "--help"]);
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

const INIT5_HEADINGS = ["Goal", "Settled", "Open", "Space", "In flight", "Recovery", "Next action"];

async function initialize5(options) {
  const root = rootOption(options);
  const name = requireOption(options, "--name");
  const cue = requireOption(options, "--cue").replace(/\s+/g, " ").trim();
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
  const record = await createTaskFolder5(root, { name, cue, sections });
  // The first line is the record's path; then the budget, so the agent writes the record knowing it (P66).
  const window = contextWindow();
  return `${record}\n${budgetLines(budgetFor({ window: window.tokens }), window).join("\n")}\n`;
}

async function readExisting(options) {
  const root = rootOption(options);
  const recordOption = requireOption(options, "--record");
  const loaded = await readRecord(root, resolveRecordPath(root, recordOption));
  return { root, ...loaded };
}

/** A record every command but migrate and view full works on: Schema 5. A Schema 4 record is converted first (P7). */
function requireSchema5(loaded) {
  const schema = schemaOf(loaded.text);
  if (schema === 4)
    throw new CliError(
      `${displayPath(loaded.root, loaded.path)} is a Schema 4 record, which only migrate reads now: convert it with migrate, or move it into the Freeflow store as Setup Freeflow's store setup says`,
    );
  if (schema !== 5) throw new CliError(`${displayPath(loaded.root, loaded.path)} is not a Schema 5 record`);
  return loaded;
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
  const identity = sessionIdentity();
  const drift = identity
    ? gateDrift(readGateState(storeHome(), identity.id), task.record, loaded.path).map(
        (each) =>
          `warning: this session's gate state differs from the record (${each}); the next lifecycle command rewrites it`,
      )
    : [];
  const notes = [
    ...warnings5(task).map((warning) => `warning: ${warning}`),
    ...drift,
    ...unresolved.map((each) => `warning: a pointer in the Slice's updates does not resolve here: ${each}`),
    ...pointers.outside.map((each) => `outside the repository, not checked: ${each}`),
  ];
  if (options["--strict"] && pointers.problems.length)
    throw new CliError(
      `Pointers on Evidence or Result lines do not resolve:\n${pointers.problems.map((each) => `- ${each}`).join("\n")}`,
    );
  return `valid\n${displayPath(loaded.root, loaded.path)}, ${task.history.entries.length} history entries\n${pointers.checked} evidence pointer(s) checked${notes.length ? `\n${notes.join("\n")}` : ""}\n`;
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

/** The project and task commands in a Freeflow store, with the options each takes there. */
const STORE_OPTIONS = new Map([
  ["project new", ["--name"]],
  ["project remove", ["--name"]],
  ["project list", ["--json"]],
  ["project show", ["--name", "--cwd"]],
  ["task create", ["--title", "--goal", "--cue", "--project", "--no-project", "--cwd", "--next-action"]],
  ["task move", ["--id", "--project", "--no-project"]],
  ["task take", ["--id", "--takeover"]],
  ["task release", ["--id", "--ended", "--no-push"]],
  ["task switch", ["--id", "--takeover"]],
  ["task here", ["--cwd", "--scan", "--rules", "--take-back"]],
  ["task search", ["--query", "--project"]],
  ["task remove", ["--id"]],
]);

async function runProjects5(command, operation, options, home) {
  const allowed = new Set([...STORE_OPTIONS.get(`${command} ${operation}`), "--home"]);
  for (const name of Object.keys(options))
    if (!allowed.has(name))
      throw new CliError(`Unknown option ${name} for ${command} ${operation} in a Freeflow store`);
  const identity = sessionIdentity();
  const where = resolve(options["--cwd"] ?? cwd());
  const key = `${command} ${operation}`;
  if (key === "project new") return createProject(home, requireOption(options, "--name"));
  if (key === "project remove") return removeProject(home, requireOption(options, "--name"));
  if (key === "project list") return listProjects(home, { json: options["--json"] === true, identity });
  if (key === "project show") {
    if (options["--name"]) return showProject(home, options["--name"], identity);
    return menu(home, where, identity);
  }
  if (key === "task create")
    return createTask(
      home,
      {
        project: options["--project"],
        noProject: options["--no-project"] === true,
        directory: where,
        title: requireOption(options, "--title"),
        goal: requireOption(options, "--goal"),
        cue: requireOption(options, "--cue"),
        nextAction: options["--next-action"],
      },
      identity,
    );
  if (key === "task take")
    return takeTask(home, requireOption(options, "--id"), identity, { takeover: options["--takeover"] === true });
  if (key === "task release")
    return releaseTask(home, identity, options["--id"] ?? null, {
      ended: options["--ended"] === true,
      push: options["--no-push"] !== true,
    });
  if (key === "task switch")
    return switchTask(home, requireOption(options, "--id"), identity, { takeover: options["--takeover"] === true });
  if (key === "task here") {
    const found = options["--scan"] ? await findRepositories(home, String(options["--scan"]).split(delimiter)) : [];
    const lines = found.map((each) => `Found on this machine: ${each.name} at ${each.top}.`);
    const rulesText = options["--rules"] ? sessionRules(home, where, identity) : "";
    const tookBack = options["--take-back"] ? await takeBack(home, identity) : null;
    return `${menu(home, where, identity, tookBack)}${lines.length ? `${lines.join("\n")}\n` : ""}${rulesText}`;
  }
  if (key === "task search") return searchTasks(home, requireOption(options, "--query"), options["--project"] ?? null);
  if (key === "task remove") return removeTask(home, requireOption(options, "--id"));
  if (key === "task move")
    return moveTask(
      home,
      requireOption(options, "--id"),
      { project: options["--project"] ?? null, noProject: options["--no-project"] === true },
      identity,
    );
  throw new CliError(`Unknown command: ${key}`);
}

/** The record commands a worker session may not run, as `command operation` (SPEC-009 4.1). */
const WORKER_REFUSED = new Set([
  "task take",
  "task create",
  "task switch",
  "task move",
  "task remove",
  "task set-state",
  "task set-budget",
  "project new",
  "project remove",
  "agree ",
  "migrate ",
  "discussion save",
  "discussion drop",
  "delegate close",
]);

/**
 * Why a session that joined a delegation may not run this command, or null (SPEC-009 4.1): a worker session holds no
 * task, writes only its progress.md, return.md and claimed paths, and opens only subagent workers of its own.
 */
function workerRefusal(command, operation, options, joined) {
  if (!joined) return null;
  const key = `${command} ${operation ?? ""}`;
  const refused =
    WORKER_REFUSED.has(key) ||
    command === "slice" ||
    command === "agreement" ||
    (command === "checkpoint" && !options["--delegation"]) ||
    (key === "delegate open" && (options["--session"] || !options["--parent"])) ||
    (key === "delegate amend" && !String(options["--id"] ?? "").includes("."));
  if (!refused) return null;
  return `This session works for ${joined.id} of ${joined.task}; it writes its progress.md (checkpoint --delegation ${joined.id}) and return.md, and only the coordinator writes the record${key === "delegate open" ? ". It may hand parts to its own subagents (delegate open --parent), never to another session" : ""}.`;
}

async function runCore(command, rest) {
  const { options, positionals } = parseOptions(rest, { valued: command === "events" ? ["--session"] : [] });
  const operation = positionals[0];
  if (options["--help"]) return commandHelp(command, operation);
  const joined = joinedDelegation(storeHome(options["--home"]), sessionIdentity());
  const refusal = workerRefusal(command, operation, options, joined);
  if (refusal) throw new CliError(refusal);
  // Projects and tasks are the Freeflow store's folders.
  if (STORE_OPTIONS.has(`${command} ${operation}`)) {
    const home = storeHome(options["--home"]);
    if (isFreeflowStore(home)) return runProjects5(command, operation, options, home);
    throw new CliError(`${command} ${operation} works in a Freeflow store; ${home} is not one (store init makes one)`);
  }
  validateCommandOptions(command, operation, options);
  if (command === "store") {
    // A sync renews this session's live claims, so a claim lasts while its session works (SPEC-009 4.5).
    if (operation === "sync" && !options["--pull"]) {
      const home = storeHome(options["--home"]);
      await renewClaims({ home, identity: sessionIdentity() }).catch(() => []);
    }
    return runStore(operation, options);
  }
  if (command === "events") {
    try {
      return await runEvents(operation, options, {
        home: storeHome(options["--home"]),
        identity: sessionIdentity(),
        input: operation === "append" ? await readInput(requireOption(options, "--input"), cwd()) : "",
      });
    } catch (error) {
      throw new CliError(error.message);
    }
  }
  if (command === "agree") {
    if (positionals.length) throw new CliError("agree takes no operation");
    return agree(options);
  }
  if (command === "claim" || command === "release") {
    if (positionals.length) throw new CliError(`${command} takes no operation`);
    return claimCommand(command, options, joined);
  }
  if (command === "session") {
    if (operation !== "status") throw new CliError(`Unknown command: session ${operation ?? ""}`.trim());
    const home = storeHome(options["--home"]);
    // The drivers run session status at session start: a session whose gate state no command wrote yet gets one, so
    // the gates read what holds now rather than nothing (SPEC-008 section 5).
    const identity = sessionIdentity();
    if (identity && !existsSync(gatesPath(home, identity.id))) await refreshGates({ home, identity });
    const status = isFreeflowStore(home)
      ? await sessionStatus(home, sessionIdentity())
      : {
          home,
          store: false,
          session: sessionIdentity()?.id ?? null,
          ...sessionFiles(home, sessionIdentity()),
          missing: await missingParts(home),
        };
    return `${JSON.stringify({ ...status, ...(await delegationStatusFields(home, status)) }, null, 2)}\n`;
  }
  // A task's ID stands for its record's path.
  if (
    typeof options["--record"] === "string" &&
    STORE_TASK_ID.test(options["--record"]) &&
    isFreeflowStore(storeHome())
  )
    options["--record"] = storeRecordPath(storeHome(), options["--record"]);
  if (command === "estimate") {
    try {
      const input = options["--input"] === undefined ? "" : await readInput(options["--input"], cwd());
      return estimate(options, process.env, input);
    } catch (error) {
      if (error instanceof EstimateError || error instanceof PlanError) throw new CliError(error.message);
      throw error;
    }
  }
  if (command === "budget") {
    if (positionals.length) throw new CliError("budget takes no operation");
    const given = options["--window"];
    if (given !== undefined && !/^\d+$/.test(given)) throw new CliError("--window is a token count, as 200000");
    const window = given !== undefined ? { tokens: Number(given), source: "--window" } : contextWindow();
    if (options["--mode"] !== undefined && !["normal", "expanded"].includes(options["--mode"]))
      throw new CliError("--mode is normal or expanded");
    if (!options["--record"]) return renderBudget({ window, mode: options["--mode"] ?? "normal" });
    const loaded = requireSchema5(await readExisting(options));
    const task = await loadTask5(loaded.path, loaded.text);
    if (options["--mode"]) task.record.header.budget = options["--mode"];
    return renderBudget({ window, measured: measureTask(task, { root: loaded.root, path: loaded.path, window }) });
  }
  if (command === "checkpoint" && positionals.length === 0 && options["--delegation"] !== undefined) {
    if (options["--session"]) throw new CliError("checkpoint --delegation is a worker's: no --session");
    const loaded = requireSchema5(await readExisting(options));
    return checkpointDelegation(
      loaded,
      options["--delegation"],
      await readInput(requireOption(options, "--input"), cwd()),
      {
        joined,
      },
    );
  }
  if (command === "checkpoint" && positionals.length === 0 && options["--session"]) {
    if (options["--record"])
      throw new CliError("checkpoint --session is for a session that holds no task: no --record");
    return checkpointSession({
      home: options["--home"],
      identity: sessionIdentity(),
      text: await readInput(requireOption(options, "--input"), cwd()),
    });
  }
  if (command === "discussion") {
    const loaded = requireSchema5(await readExisting(options));
    if (operation === "drop") return dropBlock(loaded, requireOption(options, "--block"));
    const task = await loadTask5(loaded.path, loaded.text);
    // List and save number the same messages: by default, those since the record's last checkpoint.
    const since = options["--since"] ?? task.record.header.stateAsOf;
    if (options["--transcript"] === "-" && options["--input"] === "-")
      throw new CliError("--transcript - reads standard input; give the notes with --input <file>");
    const stdin = options["--transcript"] === "-" ? await readInput("-", cwd()) : null;
    const messages = userMessages({
      transcript: options["--transcript"],
      format: options["--format"],
      since,
      until: options["--until"],
      stdin,
    });
    if (operation === "list") return listText(messages, since);
    if (operation === "save") {
      if (!messages.length) throw new CliError(`No messages from the user since ${since} to save.`);
      return saveBlock(loaded, {
        messages,
        numbers: parseNumbers(requireOption(options, "--messages"), messages.length),
        title: options["--title"],
        shapes: options["--shapes"],
        replaces: options["--replaces"],
        notesText: await readInput(options["--input"], cwd()),
      });
    }
  }
  if (command === "migrate") {
    const loaded = await readExisting(options);
    if (schemaOf(loaded.text) === 5 && (hasOldRecoveryHeadings(loaded.text) || /^- Carry:/m.test(loaded.text)))
      return migrateRecoveryHeadings({
        recordPath: loaded.path,
        text: loaded.text,
        home: freeflowStoreOf(loaded.path),
      });
    if (schemaOf(loaded.text) === 5 && options["--project"])
      return copyTaskIntoStore({
        recordPath: loaded.path,
        home: storeHome(options["--home"]),
        project: options["--project"],
      });
    if (schemaOf(loaded.text) !== 4)
      throw new CliError(
        `migrate converts a Schema 4 record, a Schema 5 one written before the Recovery list, or with --project brings a Schema 5 one into the store; this one is Schema ${schemaOf(loaded.text) ?? "unknown"}`,
      );
    return migrateTask({
      recordPath: loaded.path,
      text: loaded.text,
      root: loaded.root,
      cue: requireOption(options, "--cue").replace(/\s+/g, " ").trim(),
      cues: await readCues(options["--cues"]),
      home: storeHome(options["--home"]),
      project: options["--project"] ?? null,
    });
  }
  if (command === "delegate") {
    // A delegation with no task: its folder is in the scratch folder --scratch names, and nothing is recorded.
    if (options["--scratch"] !== undefined) {
      if (options["--record"] !== undefined)
        throw new CliError("--scratch is for a delegation with no task: give --record or --scratch, not both");
      const input = operation === "open" ? await readInput(options["--input"], cwd()) : null;
      if (operation === "open") return openDelegation(null, options, input);
      if (operation === "check-return") return checkReturn(null, options);
    }
    const loaded = requireSchema5(await readExisting(options));
    if (operation === "join") {
      const home = storeHome(options["--home"]);
      const identity = sessionIdentity();
      const joinedNow = await joinDelegation(loaded, options, {
        home,
        identity,
        held: isFreeflowStore(home) ? heldTask(home, identity) : null,
      });
      return `${joinedNow}\n${await renderRecover5(loaded, { delegation: options["--id"] })}`;
    }
    if (operation === "log") return delegationLog(loaded, options);
    const input = await readInput(options["--input"], cwd());
    if (operation === "open") return openDelegation(loaded, options, input);
    if (operation === "amend") return amendDelegation(loaded, options, input);
    if (operation === "status") return delegationStatus(loaded, { json: options["--json"] === true });
    // A worker checks its own return before it hands back; the record stays the coordinator's.
    if (operation === "check-return") return checkReturn(loaded, options, { readOnly: Boolean(joined) });
    if (operation === "close") return closeDelegation(loaded, options, input);
  }
  if (command === "init") {
    if (!options["--cue"]) throw new CliError('init requires --cue, saying when the task matters ("read when …")');
    return initialize5(options);
  }
  if (command === "view") {
    const view = positionals[0] ?? options["--view"];
    if (!view || !["recover", "full", "entry", "index", "bundle"].includes(view))
      throw new CliError("View must be recover, full, entry, index, or bundle");
    if (options["--session"] && view !== "bundle") throw new CliError("--session is for view bundle");
    if (options["--fallback"] && (view !== "bundle" || options["--session"]))
      throw new CliError("--fallback is for view bundle --record");
    if (options["--delegation"] && !["recover", "bundle"].includes(view))
      throw new CliError("--delegation is for view recover and view bundle");
    if (options["--delegation"] && options["--fallback"])
      throw new CliError("view bundle --delegation is a worker's bundle: no --fallback");
    if (view === "bundle" && options["--session"]) {
      if (options["--record"])
        throw new CliError("view bundle --session is for a session that holds no task: no --record");
      return renderSessionBundle({ home: options["--home"] ?? null });
    }
    const ids = positionals.slice(1);
    if (view === "entry") {
      if (!ids.length) throw new CliError("View entry needs at least one S-NNN, D-NNN, or A-NNN ID");
      const invalid = ids.find((id) => !/^[SDA]-\d{3,}$/.test(id));
      if (invalid) throw new CliError(`Not an entry ID: ${invalid}`);
    } else if (ids.length) throw new CliError(`View ${view} accepts no further arguments`);
    const loaded = await readExisting(options);
    // full prints record.md as stored, valid or not, of any schema: what to read after an uncertain write.
    if (view === "full") return loaded.text;
    requireSchema5(loaded);
    if (view === "recover") return renderRecover5(loaded, { delegation: options["--delegation"] ?? null });
    if (view === "bundle")
      return renderBundle5(loaded, {
        fallback: options["--fallback"] === true,
        delegation: options["--delegation"] ?? null,
      });
    if (view === "entry") return renderEntries5(loaded, ids);
    return renderIndex5(loaded);
  }
  if (command === "validate") {
    if (positionals.length) throw new CliError("Validate does not accept positional arguments");
    return validate5(requireSchema5(await readExisting(options)), options);
  }
  if (positionals.length !== (command === "checkpoint" ? 0 : 1))
    throw new CliError(
      command === "checkpoint" ? "checkpoint takes no operation" : `Expected one operation for ${command}`,
    );
  const loaded = requireSchema5(await readExisting(options));
  // A checkpoint writes only the task this session holds (F36).
  if (command === "checkpoint") requireHold(loaded.path, sessionIdentity());
  const input = await readInput(options["--input"], cwd());
  return runTransition5(command, positionals, options, input, loaded);
}

/** The event log's name for this session's harness, or null for one the schema does not know. */
function eventHarness(identity) {
  const name = String(identity?.harness ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return HARNESSES.includes(name) ? name : null;
}

/**
 * `agree` (SPEC-008 4.1): the user's agreement for a session that holds no task, in the session's gate state and as an
 * agreement line in its event log; with --exact-spec, the declaration that the request fixes every choice, logged.
 */
async function agree(options) {
  const identity = sessionIdentity();
  if (!identity)
    throw new CliError("No session ID: Claude Code sets CLAUDE_CODE_SESSION_ID; other harnesses set FREEFLOW_SESSION.");
  const home = storeHome(options["--home"]);
  const outcome = String(requireOption(options, "--outcome")).replace(/\s+/g, " ").trim();
  const reason =
    options["--exact-spec"] === undefined ? null : String(options["--exact-spec"]).replace(/\s+/g, " ").trim();
  if (reason === "") throw new CliError("--exact-spec gives the reason the request fixes every choice");
  const held = isFreeflowStore(home) ? heldTask(home, identity) : null;
  if (held)
    throw new CliError(
      `This session holds ${held.id}: record the agreement in its record with agreement open --record ${held.id}.`,
    );
  const at = new Date().toISOString();
  const path = await refreshGates({
    home,
    identity,
    agreed: { outcome, at, ...(reason ? { exactSpec: { reason, at } } : {}) },
  });
  if (!path) throw new CliError(`Could not write this session's gate state in ${join(home, "sessions", identity.id)}`);
  const harness = eventHarness(identity);
  let logged = "no event line: this harness has no name in the event log's schema";
  if (harness) {
    const line = { v: 1, ts: at, session: identity.id, harness, agent: "main", kind: "agreement", outcome };
    if (reason) line.exactSpec = reason;
    try {
      const { written, refused } = await appendEvents(home, JSON.stringify(line));
      logged = refused.length
        ? `no event line (${refused[0].problem})`
        : written.length
          ? "an agreement line in the event log"
          : "no event line";
    } catch (error) {
      logged = `no event line (${error.message})`;
    }
  }
  return `Agreed for this session: ${outcome}${reason ? `\nExact spec declared: ${reason}; a reviewer audits it` : ""}\nRecorded in ${path} and ${logged}.\n`;
}

/** The commands after which this session's gate state is written again (SPEC-008 4.1). */
const GATE_COMMANDS = new Set([
  "task take",
  "task release",
  "task switch",
  "task create",
  "task here",
  "agreement open",
  "agreement close",
  "slice start",
  "slice start-direct",
  "slice pause",
  "slice resume",
  "slice close",
  "delegate open",
  "delegate close",
  "delegate join",
  "claim ",
  "release ",
  "store sync",
]);

/** After a lifecycle command succeeded: this session's gate state, derived again; never fails the command. */
async function gatesAfter(command, rest, output) {
  let parsed;
  try {
    parsed = parseOptions(rest, { valued: command === "events" ? ["--session"] : [] });
  } catch {
    return;
  }
  const { options, positionals } = parsed;
  const key = `${command} ${positionals[0] ?? ""}`;
  if (!GATE_COMMANDS.has(key) || options["--help"]) return;
  if (key === "task here" && !options["--take-back"]) return;
  const home = storeHome(options["--home"]);
  const record = options["--record"];
  const recordPath =
    typeof record === "string" && !STORE_TASK_ID.test(record) ? resolveRecordPath(rootOption(options), record) : null;
  // A scratch delegation has no record to read it back from: its scope joins a state that holds no task.
  let extra = null;
  if (key === "delegate open" && options["--scratch"] !== undefined) {
    const id = /^Opened (D-\d{3,}(?:\.\d+)?) — /m.exec(output)?.[1];
    const brief = output.split("\n")[1]?.trim();
    if (id && brief) extra = { [id]: delegationScope(dirname(brief)) };
  }
  await refreshGates({ home, identity: sessionIdentity(), recordPath, extra });
}

/**
 * What session status adds for delegation (SPEC-009), each only where it applies: in a worker session, `delegation`,
 * the delegation it joined with its progress.md's time, which its compaction and checkpoint notice read; for a held
 * task whose current Slice waits on open delegations, `waits`, each with what came back and the delegation log's path,
 * for the coordinator's Waits on row; and `claims`, how many live claims this session holds, which its end releases.
 */
async function delegationStatusFields(home, status) {
  const identity = sessionIdentity();
  const fields = {};
  const joined = joinedDelegation(home, identity);
  if (joined) {
    const { progressAsOf } = await import("./lib/delegations5.mjs");
    fields.delegation = { ...joined, progressAsOf: progressAsOf(joined.taskDir, joined.id) };
  }
  if (status.task?.record) {
    try {
      const { waitsOf } = await import("./lib/delegations5.mjs");
      const { parseRecord5 } = await import("./lib/record5.mjs");
      const taskDir = dirname(status.task.record);
      const waits = waitsOf(taskDir, parseRecord5(readFileSync(status.task.record, "utf8")));
      if (waits) fields.waits = { ...waits, channel: join(taskDir, "channel.jsonl") };
    } catch {
      // A record that cannot be read has no Waits on to report.
    }
  }
  if (isFreeflowStore(home) && identity) {
    const { storeClaims } = await import("./lib/claims5.mjs");
    const claims = storeClaims(home).filter((claim) => claim.session === identity.id).length;
    if (claims) fields.claims = claims;
  }
  return fields;
}

/** `delegate log`: the task's delegation log, or a harness layer's own line appended to it. */
async function delegationLog(loaded, options) {
  const taskDir = dirname(loaded.path);
  if (!options["--append"]) return renderChannel(taskDir, options["--id"] ?? null);
  const kind = requireOption(options, "--kind");
  if (!["inform", "blocked"].includes(kind))
    throw new CliError(
      `delegate log --append logs a harness layer's inform or blocked line; ${CHANNEL_KINDS.filter((each) => !["inform", "blocked"].includes(each)).join(", ")} come from the commands that act`,
    );
  const line = await appendChannel(
    taskDir,
    { delegation: requireOption(options, "--id"), kind, body: requireOption(options, "--body") },
    { identity: sessionIdentity(), agent: options["--agent"] ?? null },
  );
  return `Logged ${line.delegation} ${line.kind}.\n`;
}

/** `claim` and `release` (SPEC-009 4.5): this session's claims on paths, in the store. */
async function claimCommand(command, options, joined) {
  const home = storeHome(options["--home"]);
  if (!isFreeflowStore(home)) throw new CliError(`${command} works in a Freeflow store; ${home} is not one`);
  const identity = sessionIdentity();
  if (!identity)
    throw new CliError("No session ID: Claude Code sets CLAUDE_CODE_SESSION_ID; other harnesses set FREEFLOW_SESSION.");
  const paths = [options["--paths"] ?? []].flat();
  try {
    if (command === "claim") {
      if (options["--list"]) return renderClaims(home, identity);
      const held = heldTask(home, identity);
      const taskDir = held?.dir ?? joined?.taskDir;
      if (!taskDir)
        throw new CliError(
          "A claim belongs to a task: take the task (task take), or join the delegation you work for.",
        );
      const lines = await addClaims({
        taskDir,
        task: held?.id ?? joined.task,
        delegation: held ? null : joined.id,
        identity,
        globs: paths,
        cwd: cwd(),
        hours: claimHours(options["--for"]),
      });
      return `${lines.map((line) => `Claimed ${line.repo ? `${line.repo}: ` : ""}${line.paths.join(", ")} for ${line.task}${line.delegation ? ` ${line.delegation}` : ""} until ${line.until.slice(0, 16).replace("T", " ")} UTC (${line.id}).`).join("\n")}\nThe gates warn other sessions before they write these; release them when done (release).\n`;
    }
    const released = await releaseClaims({ home, identity, globs: paths, cwd: cwd() });
    let ended = "";
    if (options["--ended"] && joined) {
      await appendChannel(
        joined.taskDir,
        { delegation: joined.id, kind: "inform", body: `session ${identity.id} ended` },
        { identity },
      ).catch(() => {});
      ended = ` Logged that this session, ${joined.id}'s worker, ended.`;
    }
    return `Released ${released.length} claim(s).${ended}\n`;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(error.message);
  }
}

/** Leaves this session's request for Freeflow's compaction in the store (P102); says where it went, or why none did. */
async function requestCompaction(args) {
  const at = args.indexOf("--home");
  const home = storeHome(at === -1 ? undefined : args[at + 1]);
  const identity = sessionIdentity();
  // A session summary lives in the Freeflow home whether or not a store is there, so its compaction needs none (P4).
  if (!identity || (!args.includes("--session") && !isFreeflowStore(home)))
    return "Compaction not requested: it needs a session ID, and for a task the Freeflow store.\n";
  // Only a driver that claims compact answers the request (SPEC-006 P11): elsewhere none is written for no one.
  const refused = compactRefusal(home, identity);
  if (refused) return refused;
  await writeCompactionRequest(home, identity);
  return "Compaction requested: Freeflow's harness layer compacts the session when this turn ends, with the record in place of the conversation. End your turn now.\n";
}

/**
 * Why this session's Freeflow driver will not compact it, from the claims it wrote at session start
 * (<home>/sessions/<session>/capabilities.json, read by Setup Freeflow's capabilities.mjs too), or null when it claims
 * compact as yes.
 */
function compactRefusal(home, identity) {
  const path = join(home, "sessions", identity.id, "capabilities.json");
  let claim = null;
  try {
    const file = JSON.parse(readFileSync(path, "utf8"));
    if (file?.v === 1 && file.requestSet === 1) claim = file.claims?.compact ?? null;
  } catch {
    // No file, or not one this script reads: no driver here claims anything.
  }
  if (claim?.claim === "yes") return null;
  const why = claim
    ? `Freeflow's driver here does not compact (compact: ${claim.claim}, ${claim.how})`
    : "No Freeflow driver here compacts (no capabilities for this session)";
  return `${why}. The harness compacts on its own; after it, recover with view recover.\n`;
}

try {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    process.stdout.write(`${usage()}\n`);
  } else {
    const output = await runCore(command, rest);
    await gatesAfter(command, rest, output).catch(() => {});
    // A checkpoint that asks for Freeflow's compaction leaves its request once it is written (P102).
    process.stdout.write(
      command === "checkpoint" && rest.includes("--compact") ? `${output}${await requestCompaction(rest)}` : output,
    );
  }
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = error.exitCode ?? 1;
}
