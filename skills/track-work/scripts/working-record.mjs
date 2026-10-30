#!/usr/bin/env node

import { cwd } from "node:process";
import { delimiter, isAbsolute, resolve, sep } from "node:path";
import { displayPath, readInput, readRecord, resolveRecordPath, storeOf, isFreeflowStore } from "./lib/store.mjs";
import { checkLinePointers } from "./lib/recover.mjs";
import { loadTask5, schemaOf, warnings5 } from "./lib/record5.mjs";
import { checkpointSession, runTransition5, writeCompactionRequest } from "./lib/transitions5.mjs";
import { budgetLines, budgetFor, contextWindow, measureTask, renderBudget } from "./lib/budget5.mjs";
import { copyTaskIntoStore, migrateTask, readCues } from "./lib/migrate5.mjs";
import { findResult, listResults, sessionTranscript } from "./lib/carry5.mjs";
import { dropBlock, listText, parseNumbers, saveBlock, userMessages } from "./lib/discussion5.mjs";
import { renderBundle5, renderEntries5, renderIndex5, renderRecover5, renderSessionBundle } from "./lib/views5.mjs";
import {
  amendDelegation,
  checkReturn,
  closeDelegation,
  delegationStatus,
  openDelegation,
} from "./lib/delegations5.mjs";
import { addStoreRemote, initStore, missingParts, storeHome, storeStatus, syncStore } from "./lib/freeflow-store.mjs";
import {
  createProject,
  createTask,
  createTaskFolder5,
  findRepositories,
  listProjects,
  menu,
  sessionRules,
  moveTask,
  releaseTask,
  removeProject,
  removeTask,
  searchTasks,
  sessionIdentity,
  sessionFiles,
  sessionStatus,
  showProject,
  STORE_TASK_ID,
  storeRecordPath,
  switchTask,
  takeTask,
} from "./lib/projects5.mjs";
import { EstimateError, estimate } from "./lib/estimate5.mjs";
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
    "  working-record.mjs checkpoint --record <record.md> [--repo <path>] [--input <file|->] [--compact]",
    "  working-record.mjs checkpoint --session --input <file|-> [--compact] (a session holding no task)",
    "  working-record.mjs budget [--record <record.md>] [--window <tokens>] [--mode normal|expanded]",
    "  working-record.mjs estimate [--used <tokens>] [--window <tokens>] [--done <n> --left <m>] [--transcript <path>]",
    "  working-record.mjs estimate --plan --record <ID> [--input -] [--fan-out <n>] [--done <n>] | --project <name> | --store",
    "  working-record.mjs view bundle --record <record.md> | --session",
    "  working-record.mjs delegate <open|amend|status|check-return|close> ...",
    "  working-record.mjs discussion <list|save|drop> --record <record.md> ...",
    "  working-record.mjs carry <list|show> ...",
    "  working-record.mjs migrate --record <record.md> --cue <cue> [--cues <file>] [--project <name>] (Schema 4 to 5)",
    "  working-record.mjs project <new|show|list|remove> ... (in a Freeflow store)",
    "  working-record.mjs task <create|take|release|switch|move|here|search|remove> ... (in a Freeflow store)",
    "  working-record.mjs store <init|remote|status|sync> ...",
    "  working-record.mjs session status [--home <folder>] (for a harness layer)",
    "",
    ROOT_HELP,
    "In a Freeflow store, a task's ID (such as my-project/task-003, or task-004 in no project) may be given as --record.",
  ].join("\n");
}

const COMMAND_HELP = new Map([
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
      'The checkpoint, before a compaction or a transfer, once Current Context is rewritten: with --input, rewrites In flight whole from its lines (each "- Now|Observed|Hypothesis|Dropped|Pending|Carry: …", a Carry line "- Carry: <path> (lines <a>–<b>) — <why>"; "none" empties it); checks the task folder\'s structure and the recovery budget for the session\'s window (FREEFLOW_CONTEXT_WINDOW) and the task\'s mode, warning when the counted memory or a fixed part is over; writes the Space line for the work repository at --repo (default: the current directory, unless it is the Freeflow store), sets State as of, then commits and pushes the Freeflow store holding the task.',
      "With --session, for a session that holds no task: writes the session summary to <store>/sessions/<session ID>/summary.md, which Freeflow's compaction installs and removes. Input: the headings ## Goal, ## Settled, ## Open, ## Agreement, ## In flight, ## Read when, ## Next action, in order; Goal and Next action must say something; (none) where a heading has nothing.",
      "With --compact, either form also asks Freeflow's harness layer to compact the session at the end of this turn, with the record in place of the conversation: it leaves a request in <store>/sessions/<session ID>/compact.json, which session status reports. A checkpoint without it never compacts. Where no harness layer runs, nothing more happens.",
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
    "Usage: init --root <path> --name <task name> --cue <cue> [--input <file|->]\nWrites a Schema 5 task folder: record.md, history.md and decisions.md, then prints the record's path and the recovery budget. --cue (required) says when the task matters, starting \"read when\", in at most 25 words. Input: Goal and Next action required; Settled, Open, Space, Defined by, Read on recovery and Read when accepted. --root may be a project's folder in the Freeflow store (<store>/projects/<project>), whose tasks/ then holds the task; elsewhere the task goes in <root>/.freeflow/tasks/. The record starts active. Use --input - to read Markdown fragments from stdin.",
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
    "Usage: migrate --record <record.md> --cue <cue> [--cues <file>] [--project <name> [--home <folder>]]\nConverts a Schema 4 record to Schema 5: Goal, Settled (with the active Decisions) and Open (with Tentative and pending Checkpoints); the Work agreement and Boundaries become the open agreement A-001; What defines this task and the Recovery sources become Read on recovery and Read when; the Current Slice and its Material updates carry over; proposed Slices stay in Future Work, with Current direction as one more; closed Slices become history.md entries. The Schema 4 record is kept whole in sources/schema4-record.md, Notes move to sources/notes.md, and the decision list moves to decisions.md when an agreement is open. --cue is the task's cue; --cues is a file of \"S-NNN: read when …\" lines for closed Slices, and a Slice without one is marked missing. Without --project the folder converts in place; with it, the folder is copied into that project in the Freeflow store as its next task, converted there and pushed, and the original stays as it was. A Schema 5 record kept without a store, in a repository's .freeflow/tasks/, is brought into the store the same way with --project, unchanged, and needs no --cue. migrate is the only command that reads a Schema 4 record, whether kept in a repository's .freeflow/tasks/ or by Pi's former Task Memory (its projects' records under the folder that holds registry.json).",
  ],
  [
    "delegate",
    "Usage: working-record.mjs delegate <operation> ...\nOperations: delegate open, delegate amend, delegate status, delegate check-return, delegate close. One folder per delegation, delegations/D-NNN-<slug>/ in the task folder, with brief.md (whoever hands the work out), progress.md and return.md (the worker); a sub-worker's folder sits inside its worker's. Only the coordinator's delegations have a line in Current Work's Delegations and an entry in History. How to hand work out: Execute Work's references/delegation.md.",
  ],
  [
    "delegate open",
    "Usage: delegate open --record <record.md> --title <title> --kind <build|review|research|eval|gather> --agent \"<model>, <effort>\" [--repo <path> [--base <ref>] [--branch <name>] [--worktree <path>]] [--from S-NNN] [--under A-NNN] [--continues D-NNN] [--handle <agent ID>] [--parent D-NNN] --input <file|->\nAssigns D-NNN (or D-NNN.n with --parent), writes brief.md from the template, and, with --repo, makes the worker's own worktree on a new branch at the base (default HEAD). Without --parent it writes the delegation's line in Current Work's Delegations; --parent opens a sub-worker's delegation inside its worker's folder, and is refused for a sub-worker (no fourth level). --from defaults to the current Slice and --under to the open agreement.\nInput: the brief's sections under \"## <section>\" headings: Result wanted, Scope and Done when required; Settled, Read and Return when optional. Read gains the delegation reference and the worker's recover command.\nWith no task, --scratch <folder> in place of --record keeps the delegation in <folder>/delegations/ with the same brief, and records nothing.",
  ],
  [
    "delegate amend",
    "Usage: delegate amend --record <record.md> --id <D-NNN[.n]> (--text <change> | --input <file|->) [--handle <agent ID>]\nAppends the change, dated, to the brief's Changes, so a worker that compacts afterwards still has it; tell the worker too. A returned delegation runs again (another round in the same folder). --handle records the host's ID for the agent.",
  ],
  [
    "delegate status",
    "Usage: delegate status --record <record.md>\nThe open delegations: ID, title, kind, agent, when opened, branch, whether a return is there, and each one's sub-workers.",
  ],
  [
    "delegate check-return",
    "Usage: delegate check-return --record <record.md> --id <D-NNN[.n]>\nRefuses a return that is missing, lacks its State line or a heading (Result, Identities, Checks, Left open, Not done; a reviewer returns Review Work's report instead), or names a commit that is not on the brief's branch. When it passes, the delegation's line says returned. A return that passes is not accepted: read it and the diff, and rerun the check that decides the result. --scratch <folder> in place of --record checks a delegation opened with --scratch.",
  ],
  [
    "delegate close",
    "Usage: delegate close --record <record.md> --id <D-NNN> --outcome <accepted|sent back|stopped> [--merge <commit>] [--tokens <n>] [--minutes <n>] [--transcript <path>] --input <file|->\nRecords the outcome in the delegation's one History entry, with the model, effort, tokens and minutes the host reports, what the worker used (its Measured line: context, billed tokens and list-price cost by model and effort, working and wall-clock time, read from its own log beside the coordinator's transcript, --transcript or FREEFLOW_TRANSCRIPT, found by the brief's Handle or Freeflow's map of workers; else not measured), the merge commit and the return's path; removes its line; syncs the store. Accepting needs a return that passes check-return and, when the brief has a branch, the commit that merged it. A sub-worker's delegation is not closed here: its worker reports it.\nInput: Cue (\"read when …\", at most 25 words), Result and Task effect required.",
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
    "carry list",
    "Usage: carry list [--transcript <path>]\nThe tool results of this compaction cycle, numbered, each with its time, what the call was for, its size in tokens and its tool-use ID, read from the session's transcript (--transcript, else FREEFLOW_TRANSCRIPT, else this Claude Code session's log; Claude Code's log or Pi's session file, along its active branch). In flight carries one with \"- Carry: result <n> — <why>\"; checkpoint pins the number to its ID. Changes nothing.",
  ],
  [
    "carry show",
    "Usage: carry show --id <tool-use ID or n> [--transcript <path>]\nPrints one tool result whole, by its ID (from any compaction cycle of the session) or its number in carry list. Changes nothing.",
  ],
  [
    "estimate",
    "Usage: estimate [--used <tokens>] [--window <tokens>] [--done <n> --left <m>] [--transcript <path>]\n       estimate --plan --record <ID> [--input -] [--fan-out <n>] [--done <n>] [--used <tokens>] [--window <tokens>]\n       estimate --project <name> | --store\nHow much of the context window the work has used, before you decide what fits in this compaction cycle: the context's use (--used, as the harness shows it; else the latest request in the session's transcript, --transcript or FREEFLOW_TRANSCRIPT or this Claude Code session's log) against the window (--window, else FREEFLOW_CONTEXT_WINDOW, else 200,000 tokens) and the point where Freeflow's notice comes (75% of the window), with what is left before it. With --done <n> --left <m>, the parts of the work done in this compaction cycle and the parts still to do: what the rest needs at the rate so far (an upper bound), and whether it fits before the notice or about how many more compaction cycles it takes.\nWith --plan, the Slices left (Future Work's proposals, or with --input one Slice a line, \"- <title>\", then optionally \" · after: <titles it waits for>\"): each one's expected context, working time and cost at API list price, from the median of the nearest of this task, its project and the store holding 3 measured Slices, corrected by the median of actual over predicted; the compaction cycle each lands in; any Slice bigger than a compaction cycle; the totals; the Slices with no dependency between them; and delegations' measured cost by kind, model and effort, with --fan-out <n> pricing n workers. With fewer than 3 measured Slices anywhere, --done <n> plans at this compaction cycle's rate. --project <name> lists each of the project's tasks with what it used and what its proposed Slices would take; --store adds up every project and task by model and effort, and delegations by kind. Prices are the dated table in lib/measure5.mjs, or the JSON file FREEFLOW_PRICES names. It prints costs and never picks a model.",
  ],
  [
    "budget",
    "Usage: budget [--record <record.md>] [--window <tokens>] [--mode normal|expanded]\nThe recovery budget, before you write: the total for the session's context window (--window, else FREEFLOW_CONTEXT_WINDOW, else 200,000 tokens) and the task's mode (--mode, else the record's Budget, else normal), by the square root of the window (about 10,000 words at 200,000 tokens; expanded half as large again); Current Context and Future Work fixed; what the decisions shown and the History index may hold; what is not counted (the rules, the skills, Defined by). With --record: what each part holds now, the total and what is left.",
  ],
  [
    "view",
    "Usage: view recover|full|index|bundle --record <record.md>\n       view entry <ID> [<ID> ...] --record <record.md>\n       view bundle --record <record.md> [--fallback] [--no-recent]\n       view bundle --session [--home <store>] [--no-recent]\nrecover [--delegation <D-NNN[.n]>] prints an opening line (the record is memory; the user's direction decides the work), then the store's and the project's rules, record.md, the open agreement's decisions within their budget (waiting and answered first), the History index (the newest within the budget, and any the record names), the project's other tasks with their cues, and the checks: the budget, pointers that do not resolve, the store's unpushed commits, and where each repository in Space is. bundle: the same, then Read on recovery's sources and In flight's Carry files (counted), Defined by's entries and the core skills (not counted), each whole and read now, In flight's carried tool results, this compaction cycle's newest other results within the carry budget (--no-recent leaves them out, as a harness layer does where context reuse is off), their sizes, and the recovery line: what Freeflow's compaction installs. With --fallback, for a compaction that came before the checkpoint, what Freeflow adds after the harness's own summary: the same bundle as of the record's State as of, then the user's messages since then word for word (as discussion list reads them), and a closing line naming that time and the transcript, to read back what the summary lost. With --session, the bundle of a session that holds no task: the store's rules and the session summary. entry: the named S-NNN, A-NNN or D-NNN History entries as stored. index: every History entry, one line each. full: record.md as stored. With --delegation, recover is a worker's: after the opening line it states the worker's rule (the brief is its scope and wins over the record) and prints the delegation's brief, progress and return. full prints record.md of any schema, a Schema 4 one too; every other view and command but migrate refuses a Schema 4 record.",
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
    "Usage: task here [--cwd <directory>] [--scan <folders>] [--rules]\nThe session-start menu. It opens by saying the record is memory and the user's message decides the work; says which task this session holds, if any; then lists the open tasks of each project whose tasks name --cwd's repository, and those with no project that name it (newest activity first, at most 15 each), each with who holds it and when it last synced, and its cue; or every project's open tasks, when none matches. --scan <folders>, separated as in PATH, remembers where each repository a task names is on this machine, from the Git checkouts at those folders and directly inside them, so recovery resolves its pointers there. --rules adds, after the menu, the store's rules and those of the folder's project and of the task this session holds, each whole: what Freeflow's harness layer gives a session at its start. It takes nothing.",
  ],
  [
    "project show",
    "Usage: project show [--name <project>] [--cwd <directory>]\nLists every task of the project: ID, title, state, who holds it and when it last synced, and its cue; without --name, the menu for --cwd (see task here).",
  ],
  [
    "project list",
    "Usage: project list\nEach project in the Freeflow store with its number of tasks and the repositories its tasks name in Space.",
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
    "Usage: task release [--id <task ID>]\nCloses this session's hold on the task it holds (or --id) as released, commits and pushes.",
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
    "Usage: slice start --record <record.md> --title <proposal title> --next-action <text> --input <file|->\nInput: Scope, Stop if and Started from required; Under (default: the open agreement), Done when (default: the proposal's), Waits on (D-NNN, comma-separated) and Dependencies. Takes the Slice's first reading of what it uses (its Measured line), from --used <tokens>, else the transcript --transcript or FREEFLOW_TRANSCRIPT names; with neither it is not measured. Use --input - to read the fragment from stdin.",
  ],
  [
    "slice start-direct",
    "Usage: slice start-direct --record <record.md> --title <title> --next-action <text> --input <file|->\nInput: Result wanted, Scope, Done when, Stop if and Started from required; Under (default: the open agreement), Waits on and Dependencies; Future Work is unchanged. Takes the Slice's first reading of what it uses, as slice start does.",
  ],
  [
    "slice pause",
    "Usage: slice pause --record <record.md> --reason <reason> --resume-when <condition> --next-action <text>",
  ],
  ["slice resume", "Usage: slice resume --record <record.md> --resolution <source> --next-action <text>"],
  [
    "slice close",
    'Usage: slice close --record <record.md> --state <completed|blocked|abandoned> --next-action <text> --input <file|->\nInput: Cue ("read when …", at most 25 words), Result, Evidence and Task effect required; Resume when for blocked, Reason for abandoned. Appends the Slice\'s History entry, its updates included, then syncs the Freeflow store holding the task. A Slice is not closed as completed while a delegation it Waits on is open. Takes a last reading (--used, --transcript or FREEFLOW_TRANSCRIPT) and writes the Slice\'s Measured totals into its History entry, or "not measured". Use --input - to read the fragment from stdin.',
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
  return ["init", "store", "session"].includes(command) ? `${help}\n` : `${help}\n${ROOT_HELP}\n`;
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
        "--store",
        "--json",
        "--compact",
        "--rules",
        "--no-recent",
      ].includes(token)
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
    return new Set([
      "--root",
      "--record",
      "--view",
      "--delegation",
      "--session",
      "--fallback",
      "--home",
      "--no-recent",
      "--help",
    ]);
  if (command === "budget") return new Set(["--root", "--record", "--window", "--mode", "--help"]);
  if (command === "carry" && operation === "list") return new Set(["--transcript", "--help"]);
  if (command === "carry" && operation === "show") return new Set(["--id", "--transcript", "--help"]);
  if (command === "estimate")
    return new Set([
      "--used",
      "--window",
      "--done",
      "--left",
      "--transcript",
      "--plan",
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
      ]);
    if (operation === "amend") return new Set([...record, "--id", "--text", "--handle", "--input"]);
    if (operation === "status") return new Set(record);
    if (operation === "check-return") return new Set([...record, "--id", "--scratch"]);
    if (operation === "close")
      return new Set([...record, "--id", "--outcome", "--merge", "--tokens", "--minutes", "--transcript", "--input"]);
  }
  if (command === "validate") return new Set(["--root", "--record", "--strict", "--help"]);
  if (command === "slice") {
    if (operation === "propose") return new Set([...common, "--title"]);
    if (operation === "start" || operation === "start-direct")
      return new Set([...withNextAction, "--title", "--used", "--transcript"]);
    if (operation === "pause") return new Set([...withNextAction, "--reason", "--resume-when"]);
    if (operation === "resume") return new Set([...withNextAction, "--resolution"]);
    if (operation === "close") return new Set([...withNextAction, "--state", "--used", "--transcript"]);
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

const INIT5_HEADINGS = [
  "Goal",
  "Settled",
  "Open",
  "Space",
  "In flight",
  "Defined by",
  "Read on recovery",
  "Read when",
  "Next action",
];

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
  ["project list", []],
  ["project show", ["--name", "--cwd"]],
  ["task create", ["--title", "--goal", "--cue", "--project", "--no-project", "--cwd", "--next-action"]],
  ["task move", ["--id", "--project", "--no-project"]],
  ["task take", ["--id", "--takeover"]],
  ["task release", ["--id"]],
  ["task switch", ["--id", "--takeover"]],
  ["task here", ["--cwd", "--scan", "--rules"]],
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
  if (key === "project list") return listProjects(home);
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
  if (key === "task release") return releaseTask(home, identity, options["--id"] ?? null);
  if (key === "task switch")
    return switchTask(home, requireOption(options, "--id"), identity, { takeover: options["--takeover"] === true });
  if (key === "task here") {
    const found = options["--scan"] ? await findRepositories(home, String(options["--scan"]).split(delimiter)) : [];
    const lines = found.map((each) => `Found on this machine: ${each.name} at ${each.top}.`);
    const rulesText = options["--rules"] ? sessionRules(home, where, identity) : "";
    return `${menu(home, where, identity)}${lines.length ? `${lines.join("\n")}\n` : ""}${rulesText}`;
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

async function runCore(command, rest) {
  const { options, positionals } = parseOptions(rest);
  const operation = positionals[0];
  if (options["--help"]) return commandHelp(command, operation);
  // Projects and tasks are the Freeflow store's folders.
  if (STORE_OPTIONS.has(`${command} ${operation}`)) {
    const home = storeHome(options["--home"]);
    if (isFreeflowStore(home)) return runProjects5(command, operation, options, home);
    throw new CliError(`${command} ${operation} works in a Freeflow store; ${home} is not one (store init makes one)`);
  }
  validateCommandOptions(command, operation, options);
  if (command === "store") return runStore(operation, options);
  if (command === "session") {
    if (operation !== "status") throw new CliError(`Unknown command: session ${operation ?? ""}`.trim());
    const home = storeHome(options["--home"]);
    const status = isFreeflowStore(home)
      ? await sessionStatus(home, sessionIdentity())
      : {
          home,
          store: false,
          session: sessionIdentity()?.id ?? null,
          ...sessionFiles(home, sessionIdentity()),
          missing: await missingParts(home),
        };
    return `${JSON.stringify(status, null, 2)}\n`;
  }
  // A task's ID stands for its record's path.
  if (
    typeof options["--record"] === "string" &&
    STORE_TASK_ID.test(options["--record"]) &&
    isFreeflowStore(storeHome())
  )
    options["--record"] = storeRecordPath(storeHome(), options["--record"]);
  if (command === "carry") {
    const transcript = sessionTranscript(options["--transcript"] ?? null);
    if (!transcript) throw new CliError("No transcript: pass --transcript <path>, or set FREEFLOW_TRANSCRIPT.");
    if (operation === "list") return listResults(transcript);
    const key = options["--id"];
    if (typeof key !== "string") throw new CliError("carry show requires --id <tool-use ID or n>");
    const result = findResult(transcript, key);
    if (!result)
      throw new CliError(`No tool result ${key} in ${transcript}; carry list numbers this compaction cycle's.`);
    return `${result.label} · ${result.at ?? "time not recorded"} · ${result.id}\n${result.text}\n`;
  }
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
  if (command === "checkpoint" && positionals.length === 0 && options["--session"]) {
    if (options["--record"])
      throw new CliError("checkpoint --session is for a session that holds no task: no --record");
    return checkpointSession({
      home: options["--home"],
      identity: sessionIdentity(),
      text: await readInput(requireOption(options, "--input"), cwd()),
      transcript: options["--transcript"] ?? null,
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
    if (schemaOf(loaded.text) === 5 && options["--project"])
      return copyTaskIntoStore({
        recordPath: loaded.path,
        home: storeHome(options["--home"]),
        project: options["--project"],
      });
    if (schemaOf(loaded.text) !== 4)
      throw new CliError(
        `migrate converts a Schema 4 record, or with --project brings a Schema 5 one into the store; this one is Schema ${schemaOf(loaded.text) ?? "unknown"}`,
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
    const input = await readInput(options["--input"], cwd());
    if (operation === "open") return openDelegation(loaded, options, input);
    if (operation === "amend") return amendDelegation(loaded, options, input);
    if (operation === "status") return delegationStatus(loaded);
    if (operation === "check-return") return checkReturn(loaded, options);
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
    if (view === "bundle" && options["--session"]) {
      if (options["--record"])
        throw new CliError("view bundle --session is for a session that holds no task: no --record");
      return renderSessionBundle({ home: options["--home"] ?? null, recent: options["--no-recent"] !== true });
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
        recent: options["--no-recent"] !== true,
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
  const input = await readInput(options["--input"], cwd());
  return runTransition5(command, positionals, options, input, loaded);
}

/** Leaves this session's request for Freeflow's compaction in the store (P102); says where it went, or why none did. */
async function requestCompaction(args) {
  const at = args.indexOf("--home");
  const home = storeHome(at === -1 ? undefined : args[at + 1]);
  const identity = sessionIdentity();
  // A session summary lives in the Freeflow home whether or not a store is there, so its compaction needs none (P4).
  if (!identity || (!args.includes("--session") && !isFreeflowStore(home)))
    return "Compaction not requested: it needs a session ID, and for a task the Freeflow store.\n";
  await writeCompactionRequest(home, identity);
  return "Compaction requested: Freeflow's harness layer compacts the session when this turn ends, with the record in place of the conversation. End your turn now.\n";
}

try {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    process.stdout.write(`${usage()}\n`);
  } else {
    const output = await runCore(command, rest);
    // A checkpoint that asks for Freeflow's compaction leaves its request once it is written (P102).
    process.stdout.write(
      command === "checkpoint" && rest.includes("--compact") ? `${output}${await requestCompaction(rest)}` : output,
    );
  }
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = error.exitCode ?? 1;
}
