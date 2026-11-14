// Projects, tasks and holds in the Freeflow store (the Spec's section 4). A project is a folder under projects/, a task
// a folder under its tasks/, and who holds a task is the last open line of its sessions.md: a session holds at most
// one task and a task has at most one holder. Every change is committed and, in a cloud store, pushed. These
// commands run only where the Freeflow home is a store.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { releaseClaims } from "./claims5.mjs";
import { slugify } from "./format.mjs";
import { DISCUSSIONS_DIR, SESSION_DISCUSSION, claudeCodeLog, moveSessionMessages } from "./discussion5.mjs";
import { missingParts, storeStatus, syncStore } from "./freeflow-store.mjs";
import {
  DECISIONS_FILE,
  EMPTY_DECISIONS,
  HISTORY_FILE,
  cueProblem,
  emptyHistory,
  parseRecord5,
  skeleton5,
} from "./record5.mjs";
import { holdStart, summaryForTask } from "./events5.mjs";
import { decisionItem, orderedDecisions, rules } from "./budget5.mjs";
import { applyTidy, checkTidyRecord, makeTaskFolders, planTidy, writeReadme } from "./task-folder5.mjs";
import { searchRecords } from "./search.mjs";
import {
  LAST_TASK_NUMBER,
  createRecordPath,
  isFreeflowStore,
  nextTaskNumber,
  writeAtomically,
  writeInitialAtomically,
  writeTaskFile,
} from "./store.mjs";
import {
  REPOSITORIES_FILE,
  compactionRequestPath,
  rememberRepository,
  repositoryState,
  sessionSummaryPath,
} from "./transitions5.mjs";

export const SESSIONS_FILE = "sessions.md";
export const MENU_TASKS = 15;
// How a hold ends: released on purpose (a release or a switch), ended with its session (which a resume of that session
// takes back, F36), or taken over by another session.
const SESSION_LINE = /^- (\S+) · (.+?) · (.+?) · (.+?) – (.+?) · (holding|released|ended|taken over) · (.+)$/;

class ProjectError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProjectError";
  }
}

function fail(message) {
  throw new ProjectError(message);
}

/**
 * This session, read from the environment (T6): Claude Code sets CLAUDE_CODE_SESSION_ID, and in cloud sessions
 * CLAUDE_CODE_REMOTE_SESSION_ID, which names the cloud session; other harness layers set FREEFLOW_SESSION and
 * FREEFLOW_HARNESS.
 */
export function sessionIdentity(env = process.env) {
  const id = env.FREEFLOW_SESSION || env.CLAUDE_CODE_SESSION_ID;
  if (!id) return null;
  const claude = Boolean(env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID);
  const cloud = env.CLAUDE_CODE_REMOTE === "true" || Boolean(env.CLAUDE_CODE_REMOTE_SESSION_ID);
  const remote = env.CLAUDE_CODE_REMOTE_SESSION_ID?.replace(/^(cse|session)_/, "");
  const back =
    env.FREEFLOW_RESUME ||
    (remote
      ? `https://claude.ai/code/session_${remote}`
      : claude && env.CLAUDE_CODE_SESSION_ID
        ? `claude --resume ${env.CLAUDE_CODE_SESSION_ID}`
        : "no way back recorded");
  return {
    id,
    short: id.slice(0, 8),
    harness: env.FREEFLOW_HARNESS || (claude ? "Claude Code" : "unknown harness"),
    where: cloud ? "cloud" : hostname(),
    back,
  };
}

function requireIdentity(identity) {
  if (!identity) fail("No session ID: Claude Code sets CLAUDE_CODE_SESSION_ID; other harnesses set FREEFLOW_SESSION.");
  return identity;
}

const minute = (date = new Date()) => date.toISOString().slice(0, 16).replace("T", " ");

/** sessions.md's holds, oldest first; `hold` is the last line still holding. */
export function readSessions(taskDir) {
  const path = join(taskDir, SESSIONS_FILE);
  const text = existsSync(path) ? readFileSync(path, "utf8") : null;
  const lines = (text ?? "").split(/\r?\n/);
  const holds = lines
    .map((line, index) => ({ index, match: SESSION_LINE.exec(line) }))
    .filter((each) => each.match)
    .map(({ index, match }) => ({
      index,
      short: match[1],
      harness: match[2],
      where: match[3],
      from: match[4],
      to: match[5],
      state: match[6],
      back: match[7],
    }));
  return { path, text, lines, holds, hold: holds.filter((each) => each.state === "holding").at(-1) ?? null };
}

function closeHold(sessions, hold, state) {
  const lines = [...sessions.lines];
  lines[hold.index] =
    `- ${hold.short} · ${hold.harness} · ${hold.where} · ${hold.from} – ${minute()} · ${state} · ${hold.back}`;
  return lines.join("\n");
}

function openHold(sessions, identity) {
  const base = (sessions.text ?? "# Sessions (times in UTC)\n").replace(/\s+$/, "");
  return `${base}\n${sessions.text ? "" : "\n"}- ${identity.short} · ${identity.harness} · ${identity.where} · ${minute()} – now · holding · ${identity.back}\n`;
}

function git(home, args) {
  try {
    return execFileSync("git", ["-C", home, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export async function sync(home, message, { push = true } = {}) {
  try {
    const synced = await syncStore({ home, message, push });
    if (synced.local) return "Store: committed; a local store, nothing to push.";
    return synced.pushed
      ? "Store: committed and pushed."
      : `Store: committed, not pushed (${synced.reason}); the next store sync pushes it.`;
  } catch (error) {
    return `Store not synced: ${error.message} Run store status.`;
  }
}

const projectsDir = (home) => join(home, "projects");
/** The tasks folder of a project, or of the store's tasks with no project (P76). */
const tasksDir = (home, slug) => (slug ? join(projectsDir(home), slug, "tasks") : join(home, "tasks"));
/** A store task's ID: <project>/task-NNN, or task-NNN for a task with no project. */
export const STORE_TASK_ID = /^(?:([a-z0-9-]+)\/)?(task-\d{3,})$/;

function projectNames(home) {
  if (!existsSync(projectsDir(home))) return [];
  return readdirSync(projectsDir(home), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function requireProject(home, name) {
  const slug = slugify(name);
  if (!projectNames(home).includes(slug))
    fail(`No project ${slug}; projects: ${projectNames(home).join(", ") || "none"}.`);
  return slug;
}

/**
 * Every task of a project, or with slug null the store's tasks with no project: its ID, folder, header (or why it
 * cannot be read), Space remotes, hold and last sync.
 */
export function projectTasks(home, slug) {
  const tasks = tasksDir(home, slug);
  if (!existsSync(tasks)) return [];
  return readdirSync(tasks, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^task-\d{3,}-/.test(entry.name))
    .map((entry) => {
      const dir = join(tasks, entry.name);
      const number = /^task-\d{3,}/.exec(entry.name)[0];
      const id = slug ? `${slug}/${number}` : number;
      let header = null;
      let space = [];
      let work = null;
      let problem = null;
      try {
        const record = parseRecord5(readFileSync(join(dir, "record.md"), "utf8"));
        header = record.header;
        space = record.work.space.map((item) => item.text.split(" · ")[0]);
        const open = (item) => (item ? { id: item.id, title: item.title } : null);
        work = { agreement: open(record.work.agreement), slice: open(record.work.slice) };
      } catch (error) {
        problem = error.message;
      }
      const synced = git(home, ["log", "-1", "--format=%cI", "--", relative(home, dir)]);
      return {
        id,
        dir,
        header,
        space,
        work,
        problem,
        hold: readSessions(dir).hold,
        lastSync: synced ? minute(new Date(synced)) : null,
      };
    });
}

function allTasks(home) {
  return [...projectNames(home).flatMap((slug) => projectTasks(home, slug)), ...projectTasks(home, null)];
}

function findTask(home, id) {
  const match = STORE_TASK_ID.exec(id ?? "");
  if (!match) fail(`A task ID is <project>/task-NNN, or task-NNN for a task with no project, not ${id}.`);
  const task = projectTasks(home, match[1] ?? null).find((each) => each.id === id);
  if (!task) fail(`No task ${id} in the store.`);
  return task;
}

/** The record path of a store task ID, for --record. */
export function storeRecordPath(home, id) {
  return join(findTask(home, id).dir, "record.md");
}

const holderText = (task) =>
  task.hold
    ? `held by ${task.hold.short} (${task.hold.harness}, ${task.hold.where}) since ${task.hold.from}, last synced ${task.lastSync ?? "never"}`
    : "free";

function taskLine(task, identity) {
  if (!task.header) return `- ${task.id} — not readable as Schema 5: ${task.problem}`;
  const holder =
    task.hold && identity && task.hold.short === identity.short ? "held by this session" : holderText(task);
  return `- ${task.id} — ${task.header.name} · ${task.header.state} · ${holder} · ${task.header.cue}`;
}

/** The task this session holds, if any. */
export function heldTask(home, identity) {
  return identity ? (allTasks(home).find((task) => task.hold?.short === identity.short) ?? null) : null;
}

/** This session's request for Freeflow's compaction, written by checkpoint --compact (P102), or null. */
function compactionRequest(home, identity) {
  const path = identity ? compactionRequestPath(home, identity) : null;
  if (!path || !existsSync(path)) return null;
  try {
    return { path, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return null;
  }
}

/**
 * This session's state in the store, for a harness layer such as Freeflow's Claude Code mod: the task it holds, with
 * its record and State as of; its session summary and that summary's time, when checkpoint --session wrote one;
 * whether the store holds changes not yet synced (paths not committed, or commits not pushed); its transcript; and
 * what is missing for a working store, with who fixes it (P94); and its request for Freeflow's compaction (P102).
 */
/**
 * This session's summary and compaction request: both live in the Freeflow home's sessions/ folder, which a session
 * with no store uses too (P64, P4), so its compaction works without one.
 */
export function sessionFiles(home, identity) {
  const summaryPath = identity ? sessionSummaryPath(home, identity) : null;
  const summary = summaryPath && existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : null;
  return {
    summary: summary ? { path: summaryPath, asOf: /^As of: (\S+)$/m.exec(summary)?.[1] ?? null } : null,
    compact: compactionRequest(home, identity),
  };
}

export async function sessionStatus(home, identity, env = process.env) {
  const held = heldTask(home, identity);
  const { summary, compact } = sessionFiles(home, identity);
  const status = await storeStatus({ home });
  return {
    home,
    store: true,
    session: identity?.id ?? null,
    task: held ? { id: held.id, record: join(held.dir, "record.md"), stateAsOf: held.header?.stateAsOf ?? null } : null,
    summary,
    changed: status.uncommitted > 0 || (status.unpushed ?? 0) > 0,
    transcript: env.FREEFLOW_TRANSCRIPT || claudeCodeLog(env),
    missing: await missingParts(home, env),
    compact,
  };
}

export async function createProject(home, name) {
  const slug = slugify(name);
  const folder = join(projectsDir(home), slug);
  if (existsSync(folder)) fail(`Project ${slug} already exists.`);
  for (const sub of ["rules", "tasks"]) {
    await mkdir(join(folder, sub), { recursive: true });
    await writeFile(join(folder, sub, ".gitkeep"), "");
  }
  return `Project ${slug} created at ${folder}.\n${await sync(home, `Create project ${slug}`)}\n`;
}

export async function removeProject(home, name) {
  const slug = requireProject(home, name);
  const tasks = projectTasks(home, slug);
  await rm(join(projectsDir(home), slug), { recursive: true, force: true });
  const synced = await sync(home, `Remove project ${slug} and its ${tasks.length} task(s)`);
  const commit = git(home, ["rev-parse", "--short=8", "HEAD"]);
  return `Removed project ${slug} and its ${tasks.length} task(s). Git history keeps them: git -C ${home} checkout ${commit}~1 -- projects/${slug} brings them back.\n${synced}\n`;
}

/**
 * `project list --json`, for a harness layer such as Freeflow's Claude Code pane (SPEC-015): every project, and the
 * store's tasks with no project as the project null, each task with its title, state and cue, who holds it (and
 * whether that is this session), its last sync, its open agreement and Slice, and the open agreement's decision items
 * in the order they are shown (waiting and answered first).
 */
function projectsJson(home, identity) {
  const task = (each) => {
    const decisions = existsSync(join(each.dir, DECISIONS_FILE))
      ? orderedDecisions(readFileSync(join(each.dir, DECISIONS_FILE), "utf8")).map(decisionItem)
      : [];
    return {
      id: each.id,
      title: each.header?.name ?? null,
      state: each.header?.state ?? null,
      cue: each.header?.cue ?? null,
      hold: each.hold
        ? { session: each.hold.short, harness: each.hold.harness, where: each.hold.where, since: each.hold.from }
        : null,
      thisSession: Boolean(each.hold && identity && each.hold.short === identity.short),
      lastSync: each.lastSync,
      agreement: each.work?.agreement ?? null,
      slice: each.work?.slice ?? null,
      decisions,
      problem: each.problem,
    };
  };
  const newestFirst = (tasks) =>
    [...tasks].sort((left, right) => right.id.localeCompare(left.id, undefined, { numeric: true }));
  const loose = projectTasks(home, null);
  return `${JSON.stringify(
    {
      session: identity?.short ?? null,
      projects: [
        ...projectNames(home).map((name) => ({ name, tasks: newestFirst(projectTasks(home, name)).map(task) })),
        ...(loose.length ? [{ name: null, tasks: newestFirst(loose).map(task) }] : []),
      ],
    },
    null,
    2,
  )}\n`;
}

export function listProjects(home, { json = false, identity = null } = {}) {
  if (json) return projectsJson(home, identity);
  const names = projectNames(home);
  const loose = projectTasks(home, null);
  if (!names.length && !loose.length) return "No projects.\n";
  const line = (label, tasks) => {
    const repositories = [...new Set(tasks.flatMap((task) => task.space))];
    return `- ${label}: ${tasks.length} task(s)${repositories.length ? `; repositories ${repositories.join(", ")}` : ""}`;
  };
  return `${[
    ...(names.length ? names.map((slug) => line(slug, projectTasks(home, slug))) : ["No projects."]),
    ...(loose.length ? [line("no project", loose)] : []),
  ].join("\n")}\n`;
}

export function showProject(home, name, identity) {
  const slug = requireProject(home, name);
  const tasks = projectTasks(home, slug).sort((left, right) =>
    right.id.localeCompare(left.id, undefined, { numeric: true }),
  );
  return `Project ${slug}\n${tasks.length ? tasks.map((task) => taskLine(task, identity)).join("\n") : "No tasks."}\n`;
}

/** The projects whose tasks name the repository holding directory in Space (T8). */
function projectsFor(home, directory) {
  const repository = repositoryState(directory);
  if (!repository) return { repository: null, projects: [] };
  const projects = projectNames(home).filter((slug) =>
    projectTasks(home, slug).some((task) => task.space.includes(repository.name)),
  );
  return { repository, projects };
}

/**
 * The rules a session follows from its start (Spec section 4), printed after the menu: the store's, then the project's
 * for the folder's repository and for the task this session holds, each whole, as the bundle prints them; empty when
 * there are none.
 */
export function sessionRules(home, directory, identity) {
  const held = heldTask(home, identity);
  const slugs = new Set(projectsFor(home, directory).projects);
  if (held?.id.includes("/")) slugs.add(held.id.split("/")[0]);
  const seen = new Set();
  const files = [null, ...[...slugs].map((slug) => join(home, "projects", slug))]
    .flatMap((project) => rules(home, project))
    .filter((file) => !seen.has(file.path) && seen.add(file.path));
  return files.length ? `\n## Rules\n\n${files.map((file) => `### ${file.path}\n\n${file.text}\n`).join("\n")}` : "";
}

/**
 * The session-start menu: the open tasks of the folder's project, or of every project where none matches, newest
 * activity first; tookBack, the line takeBack printed, comes first.
 */
export function menu(home, directory, identity, tookBack = null) {
  const lines = [
    ...(tookBack ? [tookBack] : []),
    `The record is memory; the user's message decides the work. Nothing ${tookBack ? "else " : ""}is taken: take a task only when the user's message points to it (task take --id <ID>), and ask when it could be more than one.`,
  ];
  const held = heldTask(home, identity);
  if (held) lines.push(`This session holds ${held.id}: recover it with view recover --record ${held.id}.`);
  const { repository, projects } = projectsFor(home, directory);
  const openOf = (tasks) =>
    tasks
      .filter((task) => !task.header || ["active", "paused"].includes(task.header.state))
      .sort(
        (left, right) =>
          (right.lastSync ?? "").localeCompare(left.lastSync ?? "") ||
          right.id.localeCompare(left.id, undefined, { numeric: true }),
      );
  const loose = repository
    ? openOf(projectTasks(home, null).filter((task) => task.space.includes(repository.name)))
    : [];
  if (!projects.length && !loose.length) {
    // No project to choose by, as in a cloud session whose folder is the store itself: every open task (P95).
    const open = openOf(allTasks(home));
    lines.push(repository ? `No task names ${repository.name}.` : "This folder is not in a repository a task names.");
    if (!open.length) lines.push("No open tasks. Projects:", listProjects(home).trimEnd());
    else {
      lines.push("Open tasks in the store:", ...open.slice(0, MENU_TASKS).map((task) => taskLine(task, identity)));
      if (open.length > MENU_TASKS) lines.push(`${open.length - MENU_TASKS} more: project list.`);
    }
    return `${lines.join("\n")}\n`;
  }
  for (const slug of projects) {
    const open = openOf(projectTasks(home, slug));
    lines.push(`Project ${slug} (${repository.name}):`);
    lines.push(
      ...(open.length ? open.slice(0, MENU_TASKS).map((task) => taskLine(task, identity)) : ["No open tasks."]),
    );
    if (open.length > MENU_TASKS) lines.push(`${open.length - MENU_TASKS} more: project show --name ${slug}.`);
  }
  if (loose.length) {
    lines.push(`No project (${repository.name}):`);
    lines.push(...loose.slice(0, MENU_TASKS).map((task) => taskLine(task, identity)));
    if (loose.length > MENU_TASKS) lines.push(`${loose.length - MENU_TASKS} more: project list.`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Remembers in local/ where each repository a task names in Space is on this machine, from the Git checkouts at the
 * given folders and directly inside them, so recovery resolves its pointers in a fresh container (P96). Returns the
 * repositories newly found.
 */
export async function findRepositories(home, folders) {
  const named = new Set(allTasks(home).flatMap((task) => task.space));
  const candidates = folders.filter(Boolean).flatMap((folder) => {
    if (!existsSync(folder)) return [];
    const children = readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => join(folder, entry.name));
    return [folder, ...children];
  });
  const known = JSON.parse(await readFile(join(home, REPOSITORIES_FILE), "utf8").catch(() => "{}"));
  const found = [];
  for (const candidate of candidates) {
    if (!existsSync(join(candidate, ".git"))) continue;
    const state = repositoryState(candidate);
    if (!state || !named.has(state.name) || found.some((each) => each.name === state.name)) continue;
    if (known[state.name] && existsSync(known[state.name])) continue;
    await rememberRepository(home, state);
    found.push(state);
  }
  return found;
}

/** Makes a Schema 5 task folder at root: record.md, history.md and decisions.md. */
export async function createTaskFolder5(root, { name, cue, sections }) {
  const problem = cueProblem(cue);
  if (problem) fail(`--cue: ${problem}`);
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
  return created.path;
}

async function writeHold(home, task, identity, { takeover = false } = {}) {
  const sessions = readSessions(task.dir);
  const holder = sessions.hold;
  if (holder?.short === identity.short) return null;
  if (holder && !takeover)
    fail(
      `${task.id} is ${holderText({ ...task, hold: holder })}. Ask the user before taking it over; then task take --id ${task.id} --takeover.`,
    );
  const text = holder ? closeHold(sessions, holder, "taken over") : sessions.text;
  await writeFile(sessions.path, openHold({ text }, identity));
  return holder;
}

export async function createTask(
  home,
  { project, noProject = false, directory, title, goal, cue, nextAction },
  identity,
) {
  requireIdentity(identity);
  const held = heldTask(home, identity);
  if (held) fail(`This session holds ${held.id}; checkpoint it and use task switch, or release it first.`);
  if (project && noProject) fail("Give --project or --no-project, not both.");
  // Without --project, the one project whose tasks name this repository; with none, no project (P76).
  let slug = project ? requireProject(home, project) : null;
  if (!slug && !noProject) {
    const { projects } = projectsFor(home, directory);
    if (projects.length > 1)
      fail(`Name the project with --project, or --no-project: ${projects.join(", ")} all match this folder.`);
    slug = projects[0] ?? null;
  }
  const repository = repositoryState(directory);
  const record = await createTaskFolder5(slug ? join(projectsDir(home), slug) : home, {
    name: title,
    cue,
    sections: {
      Goal: [`- ${goal}`],
      Space: repository ? [repository.line] : [],
      "Next action": [`- ${nextAction || "Agree the work with the user."}`],
    },
  });
  if (repository) await rememberRepository(home, repository);
  // The task's folders that always exist, and the messages this session sent before it held a task (renumbered).
  makeTaskFolders(dirname(record), title);
  moveSessionMessages(join(home, "sessions", identity.id, SESSION_DISCUSSION), dirname(record));
  const number = /^task-\d{3,}/.exec(basename(dirname(record)))[0];
  const task = findTask(home, slug ? `${slug}/${number}` : number);
  await writeHold(home, task, identity);
  return `${task.id}\n${record}\nThis session holds it.\n${await sync(home, `Create ${task.id}, held by ${identity.short}`)}\n`;
}

export async function takeTask(home, id, identity, { takeover = false } = {}) {
  requireIdentity(identity);
  const pulled = await syncStore({ home, pull: true }).catch(() => null);
  const task = findTask(home, id);
  const held = heldTask(home, identity);
  if (held && held.id !== id) fail(`This session holds ${held.id}; checkpoint it and use task switch --id ${id}.`);
  if (held?.id === id) return `This session already holds ${id}.\n`;
  const previous = await writeHold(home, task, identity, { takeover });
  // The pre-task messages this session sent go into the task it takes, as task create moves them (numbered on).
  moveSessionMessages(join(home, "sessions", identity.id, SESSION_DISCUSSION), task.dir);
  const note = pulled ? "" : " (could not take the remote's commits first)";
  return `This session holds ${id}${previous ? `, taken over from ${previous.short}` : ""}${note}.\n${await sync(home, `Take ${id} (${identity.short})`)}\n`;
}

/**
 * Closes this session's hold: released, or with ended, as a harness layer closes it when the session ends, so that a
 * resume of this session takes the task back (F36). Without push it commits and leaves the push to the next sync, for
 * a harness whose session end allows no time for the network (Codex's, SPEC-012 P3).
 */
export async function releaseTask(home, identity, id = null, { ended = false, push = true } = {}) {
  requireIdentity(identity);
  const task = id ? findTask(home, id) : heldTask(home, identity);
  if (!task) return "This session holds no task.\n";
  const sessions = readSessions(task.dir);
  if (sessions.hold?.short !== identity.short)
    fail(`This session does not hold ${task.id}; it is ${holderText(task)}.`);
  const state = ended ? "ended" : "released";
  // The session's event summary since it took the task goes into the same commit as the release (P7).
  const events = await summaryForTask({
    home,
    taskDir: task.dir,
    taskId: task.id,
    identity,
    since: holdStart(sessions.hold.from),
  });
  await writeFile(sessions.path, `${closeHold(sessions, sessions.hold, state).replace(/\s+$/, "")}\n`);
  // The session's claims end with it (SPEC-009 4.5), in the same commit.
  const claims = ended ? await releaseClaims({ home, identity }).catch(() => []) : [];
  const done = ended ? `Released ${task.id} as ended: a resume of this session takes it back.` : `Released ${task.id}.`;
  return `${done}${claims.length ? ` Released this session's ${claims.length} claim(s).` : ""}\n${events ? `${events}\n` : ""}${await sync(home, `Release ${task.id} (${identity.short}${ended ? ", ended" : ""})`, { push })}\n`;
}

/**
 * At a session's start, takes back the task this session held when it last ended (F36): only a hold closed as ended,
 * never one released on purpose, and only when it is still the task's last line, so no other session took the task
 * since. Returns the line that says so, or null when there is nothing to take back.
 */
export async function takeBack(home, identity) {
  if (!identity || heldTask(home, identity)) return null;
  // This session's last closed hold anywhere. A session holds one task at a time, so its holds never overlap: within
  // a task the later line is later, and across tasks the one that started later. Times are to the minute, so where
  // both times match the end is not taken as last, and nothing is taken back that may have been released on purpose.
  const after = (x, y) =>
    x.task === y.task
      ? x.hold.index > y.hold.index
      : x.hold.from !== y.hold.from
        ? x.hold.from > y.hold.from
        : x.hold.to !== y.hold.to
          ? x.hold.to > y.hold.to
          : y.hold.state === "ended" && x.hold.state !== "ended";
  let last = null;
  for (const task of allTasks(home)) {
    const { holds } = readSessions(task.dir);
    for (const hold of holds) {
      if (hold.short !== identity.short || hold.state === "holding") continue;
      const each = { task, hold, isLast: hold.index === holds.at(-1).index };
      if (!last || after(each, last)) last = each;
    }
  }
  if (!last || last.hold.state !== "ended" || !last.isLast || last.task.hold) return null;
  const sessions = readSessions(last.task.dir);
  await writeFile(sessions.path, openHold(sessions, identity));
  await sync(home, `Take ${last.task.id} back (${identity.short})`);
  return `Took ${last.task.id} back: this session held it until it ended.`;
}

/** The Freeflow store a task folder sits in, as <store>/tasks/<task> or <store>/projects/<project>/tasks/<task>; or null. */
function storeHolding(taskDir) {
  const tasks = dirname(taskDir);
  if (basename(tasks) !== "tasks") return null;
  const above = dirname(tasks);
  if (isFreeflowStore(above)) return above;
  const projects = dirname(above);
  return basename(projects) === "projects" && isFreeflowStore(dirname(projects)) ? dirname(projects) : null;
}

/**
 * A checkpoint writes the task this session holds, and no other (F36): refused for a task in the store that this
 * session does not hold, naming task take. A session with no ID, or a record outside a store, is not checked.
 */
export function requireHold(recordPath, identity) {
  if (!identity) return;
  const dir = dirname(recordPath);
  const home = storeHolding(dir);
  if (!home) return;
  const parts = relative(home, dir).split(/[\\/]/);
  const number = /^task-\d{3,}/.exec(parts.at(-1))?.[0];
  const id = parts[0] === "projects" ? `${parts[1]}/${number}` : number;
  const task = findTask(home, id);
  if (task.hold?.short === identity.short) return;
  if (!task.hold) fail(`This session does not hold ${id}: take it with task take --id ${id}, then checkpoint.`);
  fail(
    `This session does not hold ${id}; it is ${holderText(task)}. Ask the user before task take --id ${id} --takeover, then checkpoint.`,
  );
}

export async function switchTask(home, id, identity, options) {
  requireIdentity(identity);
  const held = heldTask(home, identity);
  if (held?.id === id) return `This session already holds ${id}.\n`;
  const released = held ? await releaseTask(home, identity, held.id) : "";
  return `${released}${await takeTask(home, id, identity, options)}`;
}

/**
 * `task tidy --id`: the task's folder brought to its fixed structure, a move of sources/discussion*.md into discussions/
 * and the Recovery lines that named them rewritten, then the README (task-folder5.mjs). The record is checked and
 * written before anything moves, so a failure leaves the folder as it was.
 */
export async function tidyTask(home, id, identity) {
  const recordPath = storeRecordPath(home, id);
  requireHold(recordPath, identity);
  const taskDir = dirname(recordPath);
  const text = await readFile(recordPath, "utf8");
  const name = parseRecord5(text).header.name;
  const plan = planTidy(taskDir, text);
  if (plan.recordText !== null) checkTidyRecord(plan.recordText);
  // The files move first, then the record is published whole as checkpoint publishes it, then the README follows.
  applyTidy(taskDir, plan);
  // The record's root is its project folder (or the store, for a task in no project): two levels above its task folder.
  if (plan.recordText !== null) await writeAtomically(dirname(dirname(taskDir)), recordPath, text, plan.recordText);
  const readmeChanged = writeReadme(taskDir, name);
  const moved = plan.moved.map((file) => `- sources/${file} → ${DISCUSSIONS_DIR}/${file}`);
  const lines = [
    ...(moved.length
      ? [`Moved ${plan.moved.length} file(s) unchanged, from sources/ to ${DISCUSSIONS_DIR}/:`, ...moved]
      : ["Nothing to move: sources/ holds no discussion file."]),
    plan.rewritten
      ? `Recovery: rewrote ${plan.rewritten} line(s) to the new place.`
      : "Recovery: no line named a moved file.",
    readmeChanged ? "README.md written." : "README.md is current.",
  ];
  return `${lines.join("\n")}\n${await sync(home, `Tidy ${id}`)}\n`;
}

export async function removeTask(home, id) {
  const task = findTask(home, id);
  // Numbers are never reused: the tasks folder keeps the highest number a removal took away.
  const marker = join(dirname(task.dir), LAST_TASK_NUMBER);
  const last = Number((await readFile(marker, "utf8").catch(() => "0")).trim()) || 0;
  await writeFile(marker, `${Math.max(last, Number(/task-(\d+)/.exec(id)[1]))}\n`);
  await rm(task.dir, { recursive: true, force: true });
  const synced = await sync(home, `Remove ${id}`);
  const commit = git(home, ["rev-parse", "--short=8", "HEAD"]);
  const path = relative(home, task.dir);
  return `Removed ${id}. Git history keeps it: git -C ${home} checkout ${commit}~1 -- ${path} brings it back. Task numbers are never reused.\n${synced}\n`;
}

export async function searchTasks(home, query, project = null) {
  const slugs = project ? [requireProject(home, project)] : [...projectNames(home), null];
  const files = slugs.flatMap((slug) =>
    projectTasks(home, slug).flatMap((task) =>
      ["record.md", HISTORY_FILE, DECISIONS_FILE].map((name) => [`${task.id} ${name}`, join(task.dir, name)]),
    ),
  );
  return `${await searchRecords(files, query)}\n`;
}

/**
 * Moves a task into a project, or out of one to the store's tasks with no project (P76, T25): its folder moves, with
 * the next number free at the destination, and Git history follows it. Refused while another session holds it.
 */
export async function moveTask(home, id, { project = null, noProject = false }, identity) {
  if (Boolean(project) === noProject) fail("task move takes --project <name> or --no-project.");
  const task = findTask(home, id);
  const slug = project ? requireProject(home, project) : null;
  const from = STORE_TASK_ID.exec(id)[1] ?? null;
  if (slug === from) return `${id} is already ${slug ? `in project ${slug}` : "outside any project"}.\n`;
  if (task.hold && task.hold.short !== identity?.short)
    fail(`${id} is ${holderText(task)}; move it once it is released, or from the session that holds it.`);
  const destination = tasksDir(home, slug);
  await mkdir(destination, { recursive: true });
  const number = String(await nextTaskNumber(destination)).padStart(3, "0");
  const folder = join(destination, basename(task.dir).replace(/^task-\d{3,}/, `task-${number}`));
  // The folder it leaves keeps its number taken, as a removal does, so an old ID never names a new task.
  const marker = join(dirname(task.dir), LAST_TASK_NUMBER);
  const last = Number((await readFile(marker, "utf8").catch(() => "0")).trim()) || 0;
  await writeFile(marker, `${Math.max(last, Number(/task-(\d+)/.exec(id)[1]))}\n`);
  await rename(task.dir, folder);
  const moved = slug ? `${slug}/task-${number}` : `task-${number}`;
  // Its delegations' briefs name the task they belong to.
  for (const brief of briefsUnder(join(folder, "delegations"))) {
    const text = await readFile(brief, "utf8");
    if (text.includes(`Task: ${id} `) || text.includes(`Task: ${id}\n`))
      await writeFile(
        brief,
        text.replace(`Task: ${id}`, () => `Task: ${moved}`),
      );
  }
  const synced = await sync(home, `Move ${id} to ${moved}`);
  return `Moved ${id} to ${moved}: ${folder}. Its old ID no longer names it; Git history keeps the old path.\n${synced}\n`;
}

function briefsUnder(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => [join(folder, entry.name, "brief.md"), ...briefsUnder(join(folder, entry.name))])
    .filter((path) => existsSync(path));
}
