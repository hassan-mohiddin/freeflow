// Projects, tasks and holds in the Freeflow store (the Spec's section 4). A project is a folder under projects/, a task
// a folder under its tasks/, and who holds a task is the last open line of its sessions.md: a session holds at most
// one task and a task has at most one holder. Every change is committed and, in a cloud store, pushed. Pi's Task
// Memory registry is untouched: these commands run only where the Freeflow home is a store.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { slugify } from "./format.mjs";
import { syncStore } from "./freeflow-store.mjs";
import {
  DECISIONS_FILE,
  EMPTY_DECISIONS,
  HISTORY_FILE,
  cueProblem,
  emptyHistory,
  parseRecord5,
  skeleton5,
} from "./record5.mjs";
import { searchRecords } from "./search.mjs";
import { LAST_TASK_NUMBER, createRecordPath, writeInitialAtomically, writeTaskFile } from "./store.mjs";
import { rememberRepository, repositoryState } from "./transitions5.mjs";

export const SESSIONS_FILE = "sessions.md";
export const MENU_TASKS = 15;
const SESSION_LINE = /^- (\S+) · (.+?) · (.+?) · (.+?) – (.+?) · (holding|released|taken over) · (.+)$/;

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

async function sync(home, message) {
  try {
    const synced = await syncStore({ home, message });
    if (synced.local) return "Store: committed; a local store, nothing to push.";
    return synced.pushed
      ? "Store: committed and pushed."
      : `Store: committed, not pushed (${synced.reason}); the next store sync pushes it.`;
  } catch (error) {
    return `Store not synced: ${error.message} Run store status.`;
  }
}

const projectsDir = (home) => join(home, "projects");

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

/** Every task of a project: its ID, folder, header (or why it cannot be read), Space remotes, hold and last sync. */
export function projectTasks(home, slug) {
  const tasks = join(projectsDir(home), slug, "tasks");
  if (!existsSync(tasks)) return [];
  return readdirSync(tasks, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^task-\d{3,}-/.test(entry.name))
    .map((entry) => {
      const dir = join(tasks, entry.name);
      const id = `${slug}/${/^task-\d{3,}/.exec(entry.name)[0]}`;
      let header = null;
      let space = [];
      let problem = null;
      try {
        const record = parseRecord5(readFileSync(join(dir, "record.md"), "utf8"));
        header = record.header;
        space = record.work.space.map((item) => item.text.split(" · ")[0]);
      } catch (error) {
        problem = error.message;
      }
      const synced = git(home, ["log", "-1", "--format=%cI", "--", join("projects", slug, "tasks", entry.name)]);
      return {
        id,
        dir,
        header,
        space,
        problem,
        hold: readSessions(dir).hold,
        lastSync: synced ? minute(new Date(synced)) : null,
      };
    });
}

function allTasks(home) {
  return projectNames(home).flatMap((slug) => projectTasks(home, slug));
}

function findTask(home, id) {
  const match = /^([a-z0-9-]+)\/(task-\d{3,})$/.exec(id ?? "");
  if (!match) fail(`A task ID is <project>/task-NNN, not ${id}.`);
  const task = projectTasks(home, match[1]).find((each) => each.id === id);
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

export function listProjects(home) {
  const names = projectNames(home);
  if (!names.length) return "No projects.\n";
  return `${names
    .map((slug) => {
      const tasks = projectTasks(home, slug);
      const repositories = [...new Set(tasks.flatMap((task) => task.space))];
      return `- ${slug}: ${tasks.length} task(s)${repositories.length ? `; repositories ${repositories.join(", ")}` : ""}`;
    })
    .join("\n")}\n`;
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

/** The session-start menu: the open tasks of the folder's project, newest activity first. */
export function menu(home, directory, identity) {
  const lines = [
    "The record is memory; the user's message decides the work. Nothing is taken: take a task only when the user's message points to it (task take --id <ID>), and ask when it could be more than one.",
  ];
  const held = heldTask(home, identity);
  if (held) lines.push(`This session holds ${held.id}: recover it with view recover --record ${held.id}.`);
  const { repository, projects } = projectsFor(home, directory);
  if (!projects.length) {
    lines.push(
      repository
        ? `No project's tasks name ${repository.name}. Projects:`
        : "This folder is not in a repository a task names. Projects:",
      listProjects(home).trimEnd(),
    );
    return `${lines.join("\n")}\n`;
  }
  for (const slug of projects) {
    const open = projectTasks(home, slug)
      .filter((task) => !task.header || ["active", "paused"].includes(task.header.state))
      .sort(
        (left, right) =>
          (right.lastSync ?? "").localeCompare(left.lastSync ?? "") ||
          right.id.localeCompare(left.id, undefined, { numeric: true }),
      );
    lines.push(`Project ${slug} (${repository.name}):`);
    lines.push(
      ...(open.length ? open.slice(0, MENU_TASKS).map((task) => taskLine(task, identity)) : ["No open tasks."]),
    );
    if (open.length > MENU_TASKS) lines.push(`${open.length - MENU_TASKS} more: project show --name ${slug}.`);
  }
  return `${lines.join("\n")}\n`;
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

export async function createTask(home, { project, directory, title, goal, cue, nextAction }, identity) {
  requireIdentity(identity);
  const held = heldTask(home, identity);
  if (held) fail(`This session holds ${held.id}; checkpoint it and use task switch, or release it first.`);
  let slug = project ? requireProject(home, project) : null;
  if (!slug) {
    const { projects } = projectsFor(home, directory);
    if (projects.length !== 1)
      fail(
        `Name the project with --project: ${projects.length ? `${projects.join(", ")} all match this folder` : "no project matches this folder"}.`,
      );
    slug = projects[0];
  }
  const repository = repositoryState(directory);
  const record = await createTaskFolder5(join(projectsDir(home), slug), {
    name: title,
    cue,
    sections: {
      Goal: [`- ${goal}`],
      Space: repository ? [repository.line] : [],
      "Next action": [`- ${nextAction || "Agree the work with the user."}`],
    },
  });
  if (repository) await rememberRepository(home, repository);
  const task = findTask(home, `${slug}/${/^task-\d{3,}/.exec(basename(dirname(record)))[0]}`);
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
  const note = pulled ? "" : " (could not take the remote's commits first)";
  return `This session holds ${id}${previous ? `, taken over from ${previous.short}` : ""}${note}.\n${await sync(home, `Take ${id} (${identity.short})`)}\n`;
}

export async function releaseTask(home, identity, id = null) {
  requireIdentity(identity);
  const task = id ? findTask(home, id) : heldTask(home, identity);
  if (!task) return "This session holds no task.\n";
  const sessions = readSessions(task.dir);
  if (sessions.hold?.short !== identity.short)
    fail(`This session does not hold ${task.id}; it is ${holderText(task)}.`);
  await writeFile(sessions.path, `${closeHold(sessions, sessions.hold, "released").replace(/\s+$/, "")}\n`);
  return `Released ${task.id}.\n${await sync(home, `Release ${task.id} (${identity.short})`)}\n`;
}

export async function switchTask(home, id, identity, options) {
  requireIdentity(identity);
  const held = heldTask(home, identity);
  if (held?.id === id) return `This session already holds ${id}.\n`;
  const released = held ? await releaseTask(home, identity, held.id) : "";
  return `${released}${await takeTask(home, id, identity, options)}`;
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
  const path = join("projects", id.split("/")[0], "tasks", basename(task.dir));
  return `Removed ${id}. Git history keeps it: git -C ${home} checkout ${commit}~1 -- ${path} brings it back. Task numbers are never reused.\n${synced}\n`;
}

export async function searchTasks(home, query, project = null) {
  const slugs = project ? [requireProject(home, project)] : projectNames(home);
  const files = slugs.flatMap((slug) =>
    projectTasks(home, slug).flatMap((task) =>
      ["record.md", HISTORY_FILE, DECISIONS_FILE].map((name) => [`${task.id} ${name}`, join(task.dir, name)]),
    ),
  );
  return `${await searchRecords(files, query)}\n`;
}
