// Delegations (the Spec's section 10): one folder per delegation in the task folder, delegations/D-NNN-<slug>/, with
// brief.md written by whoever hands the work out, and progress.md and return.md by the worker. A sub-worker's folder
// sits inside its worker's (D-012/D-012.1-<slug>/), and there is no fourth level. Only the coordinator's delegations
// have a line in record.md's Delegations and an entry in history.md; a delegation is not part of a Slice (P57).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyLineReplacements, parseFragment } from "./document.mjs";
import { slugify } from "./format.mjs";
import { syncStore } from "./freeflow-store.mjs";
import { appendChannel, latestReturn, readChannel } from "./channel5.mjs";
import { addClaims, claimHours, claimGroups, releaseClaims } from "./claims5.mjs";
import { parseChoices } from "../../../discuss-work/scripts/lib/choices.mjs";
import {
  DECISIONS_FILE,
  EMPTY_DECISIONS,
  ENTRY_ORDER,
  HISTORY_FILE,
  cueProblem,
  emptyHistory,
  loadTask5,
  parseHistory5,
  parseRecord5,
  renderFields5,
} from "./record5.mjs";
import { modelNow, priceTable, renderMeasure, workerMeasure } from "./measure5.mjs";
import { freeflowStoreOf, isFreeflowStore, projectOf, writeAtomically, writeTaskFile } from "./store.mjs";
import { sessionIdentity } from "./projects5.mjs";
import { storeHome } from "./freeflow-store.mjs";
import { CHECKS, ROUTING_FILE, SETTLED, routeFrom, routingFiles } from "./routing5.mjs";

export const KINDS = new Set(["build", "review", "research", "eval", "gather"]);
export const OUTCOMES = new Set(["accepted", "sent back", "stopped"]);
/** Why a return was sent back (SPEC-010 4.2, P4): the brief left out what the work needed, the model could not do it, or the work was not what the brief said. */
export const REASONS = new Set(["brief", "capability", "scope"]);
const RETURN_STATES = new Set(["done", "blocked", "stopped"]);
const BRIEF_SECTIONS = ["Result wanted", "Scope", "Settled", "Read", "Done when", "Return when", "Changes"];
/** What decides a return, by the brief's Check (SPEC-010 4.2): what check-return tells the coordinator to do next. */
const CHECK_NEXT = {
  scripted: "rerun the script that decides the result",
  tests: "rerun the tests that decide the result",
  judgement: "judge it against the brief's Result wanted and Done when, or have it judged, since no script decides it",
};
const RETURN_SECTIONS = ["Result", "Identities", "Checks", "Left open", "Not done"];
const ID = /^D-(\d{3,})(?:\.(\d+))?$/;
const REFERENCE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../execute-work/references/delegation.md");
const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../working-record.mjs");
/** A worker's progress.md, which checkpoint --delegation writes (SPEC-009 4.1). */
const PROGRESS_SECTIONS = ["Done", "Half done", "Didn't work", "Next"];
/** A return's Left open choice the coordinator's close adds to decisions.md (SPEC-009 4.3). */
const LEFT_OPEN = /^\s*[-*]\s+(.+?)\s+->\s+(.+?)(,\s*technical)?\s*$/;
/** The file in a session's folder of the Freeflow home that says it works for a delegation (SPEC-009 4.1). */
export const JOINED_FILE = "delegation.json";

class DelegationError extends Error {
  constructor(message) {
    super(message);
    this.name = "DelegationError";
  }
}

function fail(message) {
  throw new DelegationError(message);
}

function localDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const oneLine = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

function git(directory, args) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    return {
      failed: true,
      message: String(error.stderr ?? error.message)
        .trim()
        .split("\n")
        .pop(),
    };
  }
}

const ok = (result) => typeof result === "string";

function parseId(id) {
  const match = ID.exec(id ?? "");
  if (!match) fail(`A delegation ID is D-NNN, or D-NNN.n for a sub-worker; not ${id}.`);
  return { id, top: `D-${match[1]}`, sub: match[2] ?? null };
}

const folderIn = (directory, id) =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).find(
        (entry) => entry.isDirectory() && entry.name.startsWith(`${id}-`),
      )?.name
    : undefined;

/** The folder of a delegation: delegations/D-NNN-<slug>/, or a sub-worker's inside its worker's. */
export function delegationDir(taskDir, id) {
  const { top, sub } = parseId(id);
  const root = join(taskDir, "delegations");
  const worker = folderIn(root, top);
  if (!worker) fail(`No folder for ${top} in ${root}.`);
  if (!sub) return join(root, worker);
  const inner = folderIn(join(root, worker), id);
  if (!inner) fail(`No folder for ${id} in ${join(root, worker)}.`);
  return join(root, worker, inner);
}

/** The brief's header: its ID and title, the Task, Agent and Space lines' parts, and its sections' text. */
export function parseBrief(text) {
  const lines = text.split(/\r?\n/);
  const title = /^# (D-\d{3,}(?:\.\d+)?) — (.+)$/.exec(lines[0] ?? "");
  if (!title) fail("brief.md begins with '# D-NNN — <title>'.");
  const parts = {};
  for (const line of lines.slice(1)) {
    if (line.startsWith("## ")) break;
    if (line.startsWith("Space: ")) parts.Space = line.slice(7).trim();
    else
      for (const part of line.split(" · ")) {
        const match = /^([A-Z][a-z]+): (.*)$/.exec(part.trim());
        if (match) parts[match[1]] = match[2].trim();
      }
  }
  const space = /^(.+) worktree (.+) at ([0-9a-f]{7,40}), branch (\S+)$/.exec(parts.Space ?? "");
  return {
    id: title[1],
    title: title[2],
    ...parts,
    repo: space?.[1] ?? null,
    worktree: space?.[2] ?? null,
    base: space?.[3] ?? null,
    branch: space?.[4] ?? null,
    sections: sectionsOf(lines),
  };
}

function sectionsOf(lines) {
  const sections = {};
  let current = null;
  for (const line of lines) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      sections[current] = [];
    } else if (current) sections[current].push(line);
  }
  return sections;
}

/** Brief sections from the input: `## <section>` headings, each followed by its text. */
function briefInput(text) {
  const sections = sectionsOf(
    String(text ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n"),
  );
  const before = String(text ?? "")
    .split(/^## /m)[0]
    .trim();
  if (before)
    fail(
      `delegate open takes the brief's sections under "## <section>" headings; text before them: ${before.split("\n")[0]}`,
    );
  for (const name of Object.keys(sections))
    if (!BRIEF_SECTIONS.slice(0, 6).includes(name))
      fail(`Unknown brief section ${name}; the brief has ${BRIEF_SECTIONS.slice(0, 6).join(", ")}.`);
  for (const name of ["Result wanted", "Scope", "Done when"])
    if (!sections[name]?.join("").trim()) fail(`delegate open requires the brief's ${name} section.`);
  return sections;
}

const trim = (lines = []) => {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out.at(-1).trim()) out.pop();
  return out;
};

function nextTopId(task, taskDir) {
  const used = [
    ...(task?.history.entries.map((entry) => entry.id) ?? []),
    ...(task?.record.work.delegations.map((item) => item.text.split(" ")[0]) ?? []),
    ...(existsSync(join(taskDir, "delegations")) ? readdirSync(join(taskDir, "delegations")) : []),
  ];
  const highest = Math.max(0, ...used.map((id) => Number(/^D-(\d{3,})/.exec(id)?.[1] ?? 0)));
  return `D-${String(highest + 1).padStart(3, "0")}`;
}

function edit(record, replacements) {
  return applyLineReplacements({ lines: [...record.lines], newline: record.newline }, replacements);
}

function sectionEnd(record, name) {
  const section = record.work.headings.get(name);
  let at = section.end;
  while (at > section.start && !record.lines[at - 1].trim()) at -= 1;
  return { at, first: at === section.start };
}

function lineOf(record, id) {
  return record.work.delegations.find((item) => item.text.split(" ")[0] === id) ?? null;
}

/** A Delegations line with its state changed (`running` or `returned`). */
function withState(record, item, state) {
  const parts = record.lines[item.index].split(" · ");
  const at = parts.findIndex((part) => part === "running" || part === "returned");
  if (at < 0) return null;
  parts[at] = state;
  return { start: item.index, end: item.index + 1, lines: [parts.join(" · ")] };
}

async function sync(taskDir, message) {
  const home = freeflowStoreOf(taskDir);
  if (!home) return "Not in a Freeflow store: nothing to commit.";
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

function taskName(recordPath) {
  const project = projectOf(recordPath);
  const folder = basename(dirname(recordPath));
  return project ? `${basename(project)}/${/^task-\d{3,}/.exec(folder)[0]}` : folder;
}

/**
 * Appends a line to the task's delegation log (SPEC-009 4.2); a log that cannot be written never fails the command
 * that acted, and says so.
 */
async function logged(taskDir, event, who = {}) {
  try {
    await appendChannel(taskDir, event, { identity: who.identity ?? sessionIdentity(), agent: who.agent ?? null });
    return "";
  } catch (error) {
    return `\nNot in the delegation log: ${error.message}`;
  }
}

/** The task a record belongs to, as its ID in the store, or its folder's name outside one. */
export function taskIdOf(recordPath) {
  return taskName(recordPath);
}

/** The commands that start a separate session as the worker, for each harness that can (SPEC-009 4.1). */
function startCommands(id, task, recordArg, worktree) {
  const prompt = `You are the worker for ${id} of ${task}. Run: node ${SCRIPT} delegate join --record ${recordArg} --id ${id}`;
  const quoted = `"${prompt.replace(/(["\\$`])/g, "\\$1")}"`;
  const at = worktree ? `cd ${worktree} && ` : "";
  return [
    "Start the worker session in its own process, on the harness's own terms:",
    `  Claude Code: ${at}claude --name ${id} ${quoted}`,
    `  Pi: ${at}pi --session-name ${id} ${quoted}`,
    "  Or a background or cloud session by the harness's own means, with the same prompt.",
  ].join("\n");
}

/** The work as the routing table reads it: its kind, the review tier it is for, and --settled and --check. */
function routeWork(kind, options) {
  const settled = oneLine(options["--settled"]) || null;
  if (settled && !SETTLED.has(settled))
    fail("--settled is yes or no: whether the brief has settled the work's decisions.");
  const check = oneLine(options["--check"]) || null;
  if (check && !CHECKS.has(check))
    fail(
      `--check is ${[...CHECKS].join(", ")}: how the return is checked (a script decides, tests, or a person or model judges).`,
    );
  const tier = oneLine(options["--tier"]).toLowerCase() || null;
  if (tier && !/^[a-z][a-z-]*$/.test(tier)) fail("--tier names one tier of the routing table, as --tier security.");
  return { kind, tier, settled, check };
}

/** The coordinator's model, for the frontier tier: the newest request's in the transcript FREEFLOW_TRANSCRIPT names, else null. */
function coordinatorModel(env = process.env) {
  // Only the transcript the harness layer names (P83): a lookup of a log would read a test's or another session's.
  const transcript = env.FREEFLOW_TRANSCRIPT;
  if (!transcript || !existsSync(transcript)) return null;
  try {
    return modelNow(transcript)?.split(" ")[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The route delegate open takes from the routing table (SPEC-010 4.1, section 5): with --agent, the agent given and
 * only a warning when a table does not parse; without it, the first matching row's model and effort, refused with
 * the reason when there is no table, a table does not parse, no row matches, or the row asks the user first.
 */
function routeOf(loaded, taskDir, work, given) {
  const home = freeflowStoreOf(taskDir) ?? (loaded ? null : isFreeflowStore(storeHome()) ? storeHome() : null);
  const project = loaded ? projectOf(loaded.path) : null;
  const files = routingFiles(home, project ? basename(project) : null);
  const where = home ? join(home, ROUTING_FILE) : `the Freeflow store's ${ROUTING_FILE}`;
  const routed = routeFrom(files, work, given ? null : coordinatorModel());
  const instead = `give --agent "<model>, <effort>"`;
  if (given)
    return routed.state === "malformed"
      ? {
          warning: `Warning: ${routed.error.message}; the brief's Agent is the one given (only the user edits the table).`,
        }
      : {};
  if (routed.state === "none")
    fail(
      `delegate open requires --agent "<model>, <effort>": there is no routing table${home ? "" : ", since this task is not in a Freeflow store"}. The table goes in ${where}, and only the user writes it.`,
    );
  if (routed.state === "malformed")
    fail(
      `delegate open: ${routed.error.message}. Ask the user to mend it (only the user edits the table), or ${instead}.`,
    );
  if (routed.state === "unmatched")
    fail(
      `delegate open: no row of ${routed.labels.join(" or ")} matches ${routed.inputs}${work.settled && work.check ? "" : " (give --settled and --check where the table asks)"}; ${instead}.`,
    );
  if (routed.askFirst)
    fail(
      `${routed.line}. Ask the user; on their yes, open it again with --agent "${routed.resolved ? routed.model : routed.row.tier === "frontier" ? "<the coordinator's model>" : `<the ${routed.model} tier's model>`}, ${routed.effort}".`,
    );
  return routed;
}

/**
 * Opens a delegation: assigns its ID, writes brief.md from the template, makes a writing worker's worktree on its
 * own branch at the base, and, for the coordinator's delegations, writes its line in record.md's Delegations. With no
 * record (`loaded` null), the delegation lives in the scratch folder `--scratch` names and nothing is recorded.
 */
export async function openDelegation(loaded, options, text) {
  const task = loaded ? await loadTask5(loaded.path, loaded.text) : null;
  const taskDir = loaded ? dirname(loaded.path) : resolve(options["--scratch"]);
  const title = oneLine(options["--title"]) || fail("delegate open requires --title.");
  const kind = oneLine(options["--kind"]);
  if (!KINDS.has(kind)) fail(`--kind is one of ${[...KINDS].join(", ")}.`);
  const given = oneLine(options["--agent"]);
  if (given && !/^[^,]+, ?\S+$/.test(given)) fail('--agent names the model and effort, as "Haiku, xhigh".');
  const work = routeWork(kind, options);
  const routed = routeOf(loaded, taskDir, work, given);
  const agent = given || routed.agent;
  const sections = briefInput(text);
  const parent = options["--parent"] ? parseId(options["--parent"]) : null;
  const session = options["--session"] === true;
  if (session && parent)
    fail("A sub-worker is a subagent of its worker: --session is for the coordinator's own delegations.");
  if (session && !loaded) fail("A session worker joins a task's delegation: --session needs --record, not --scratch.");
  if (parent?.sub)
    fail(`${parent.id} is a sub-worker, the third and last level: a sub-worker starts no agents of its own.`);
  let id;
  let directory;
  if (parent) {
    const workerDir = delegationDir(taskDir, parent.id);
    const subs = readdirSync(workerDir).map((name) =>
      Number(new RegExp(`^${parent.id}\\.(\\d+)-`).exec(name)?.[1] ?? 0),
    );
    id = `${parent.id}.${Math.max(0, ...subs) + 1}`;
    directory = join(workerDir, `${id}-${slugify(title)}`);
  } else {
    id = nextTopId(task, taskDir);
    directory = join(taskDir, "delegations", `${id}-${slugify(title)}`);
  }
  const under = options["--under"] ?? task?.record.work.agreement?.id ?? null;
  // A sub-worker's delegation comes from its worker; the coordinator's, from its current Slice.
  const from = options["--from"] ?? parent?.id ?? task?.record.work.slice?.id ?? null;
  const slug = basename(directory).toLowerCase();
  let space = "the coordinator's checkout (read only)";
  let worktree = null;
  if (options["--repo"]) {
    const repo = git(resolve(options["--repo"]), ["rev-parse", "--show-toplevel"]);
    if (!ok(repo)) fail(`--repo ${options["--repo"]} is not a Git repository.`);
    const base = options["--base"] ?? "HEAD";
    const commit = git(repo, ["rev-parse", "--short=8", `${base}^{commit}`]);
    if (!ok(commit)) fail(`--base ${base} is not a commit in ${repo}.`);
    const branch = options["--branch"] ?? slug;
    worktree = resolve(options["--worktree"] ?? join(dirname(repo), `${basename(repo)}-${slug}`));
    const made = git(repo, ["worktree", "add", "-q", "-b", branch, worktree, commit]);
    if (!ok(made)) fail(`Could not make the worktree: ${made.message}`);
    space = `${repo} worktree ${worktree} at ${commit}, branch ${branch}`;
  }
  // What the worker may write, for the delegation gate (SPEC-008 T2): relative to its worktree, absolute without one.
  const writes = [options["--writes"] ?? []].flat().map((glob) => String(glob).trim());
  if (writes.some((glob) => !glob || /[`,\n]/.test(glob)))
    fail("--writes takes one glob each, with no comma or backquote, as --writes 'skills/review-work/**'.");
  const mayWrite = writes.map((glob) => (worktree || isAbsolute(glob) ? glob : resolve(glob)));
  if (mayWrite.length)
    sections.Scope = [`May write: ${mayWrite.map((glob) => `\`${glob}\``).join(", ")}`, ...trim(sections.Scope)];
  const briefPath = join(directory, "brief.md");
  const recover = loaded
    ? `node ${SCRIPT} view recover --record ${loaded.path} --delegation ${id}`
    : `read this brief again: ${briefPath}`;
  const read = [
    ...trim(sections.Read),
    `- ${REFERENCE}, Work From A Brief: how to work from this brief, write progress.md and return.md, and hand work down.`,
    loaded ? `- After a compaction, recover with: ${recover}` : `- After a compaction, ${recover}`,
  ];
  const header = [
    `# ${id} — ${title}`,
    [
      `Task: ${loaded ? taskName(loaded.path) : "none (a scratch folder; nothing is recorded)"}`,
      under && `Agreement: ${under}`,
      from && `From: ${from}`,
      options["--continues"] && `Continues: ${options["--continues"]}`,
      `Opened: ${localDate()}`,
    ]
      .filter(Boolean)
      .join(" · "),
    [
      `Agent: ${agent}`,
      `Kind: ${kind}`,
      work.settled && `Settled: ${work.settled}`,
      work.check && `Check: ${work.check}`,
      `Route: ${given ? "given" : routed.route}`,
      session && "Process: session",
      `Handle: ${oneLine(options["--handle"]) || "not started"}`,
    ]
      .filter(Boolean)
      .join(" · "),
    `Space: ${space}`,
  ];
  const body = BRIEF_SECTIONS.flatMap((name) => {
    const content =
      name === "Read"
        ? read
        : name === "Return when"
          ? trim(sections[name]).length
            ? trim(sections[name])
            : ["Done, blocked, or a choice that is not yours to make."]
          : trim(sections[name]);
    return [`## ${name}`, ...content, ""];
  });
  const routeLine = given ? `Route: given (${agent})${routed.warning ? `\n${routed.warning}` : ""}` : routed.line;
  await mkdir(directory, { recursive: true });
  await writeFile(briefPath, `${[...header, ...body].join("\n").trimEnd()}\n`);
  if (!loaded)
    return `Opened ${id} — ${title}\n${briefPath}\nSpace: ${space}\n${routeLine}\nStart the worker with a prompt that names ${id} and the brief's path; nothing is recorded. Check its return with:\n  node ${SCRIPT} delegate check-return --scratch ${taskDir} --id ${id}\n`;
  const path = relative(taskDir, briefPath);
  const note = await logged(taskDir, { delegation: id, kind: "brief", ref: path, body: title });
  // What the worker may write is claimed for it in the store, so other sessions are warned (SPEC-009 4.5).
  let claimed = "";
  if (mayWrite.length && freeflowStoreOf(taskDir)) {
    try {
      const lines = await addClaims({
        taskDir,
        task: taskName(loaded.path),
        delegation: id,
        identity: sessionIdentity(),
        globs: mayWrite,
        cwd: worktree ?? process.cwd(),
        hours: claimHours(undefined),
      });
      claimed = `\nClaimed: ${lines.flatMap((line) => line.paths).join(", ")} for ${taskName(loaded.path)} ${id}`;
    } catch (error) {
      claimed = `\nNot claimed: ${error.message}`;
    }
  }
  if (!parent) {
    const [model, effort] = agent.split(/,\s*/);
    const line = [
      `- ${id} — ${title} (${kind}, ${model} ${effort})`,
      under && `under ${under}`,
      from && `from ${from}`,
      "running",
      path,
    ]
      .filter(Boolean)
      .join(" · ");
    const { at, first } = sectionEnd(task.record, "Delegations");
    await writeAtomically(
      loaded.root,
      loaded.path,
      loaded.text,
      edit(task.record, [{ start: at, end: at, lines: [...(first ? [""] : []), line] }]),
    );
  }
  if (session)
    return `Opened ${id} — ${title} (a separate session)\n${path}\nSpace: ${space}\n${routeLine}${claimed}${note}\n${startCommands(id, taskName(loaded.path), freeflowStoreOf(taskDir) ? taskName(loaded.path) : loaded.path, worktree)}\nThe worker joins with delegate join, which prints its recovery; it recovers with:\n  ${recover}\n`;
  return `Opened ${id} — ${title}\n${path}\nSpace: ${space}\n${routeLine}${claimed}${note}\nStart the worker with a prompt that names ${id} and the brief's path; it recovers with:\n  ${recover}\n`;
}

export async function amendDelegation(loaded, options, text) {
  const { id, sub } = parseId(options["--id"]);
  const taskDir = dirname(loaded.path);
  const path = join(delegationDir(taskDir, id), "brief.md");
  let brief = await readFile(path, "utf8");
  const change = oneLine(options["--text"] || text);
  const handle = oneLine(options["--handle"]);
  if (!change && !handle) fail("delegate amend takes a change (--text or --input) or --handle.");
  if (handle) brief = brief.replace(/^(Agent: .*· Handle: ).*$/m, (_, lead) => `${lead}${handle}`);
  if (change) brief = `${brief.trimEnd()}\n- ${localDate()}: ${change}\n`;
  await writeFile(path, brief);
  let note = await logged(taskDir, {
    delegation: id,
    kind: "amend",
    ref: relative(taskDir, path),
    body: change || `handle: ${handle}`,
  });
  if (change && !sub) {
    // Another round for the same result keeps the folder: a returned delegation runs again.
    const task = await loadTask5(loaded.path, loaded.text);
    const item = lineOf(task.record, id);
    const running = item && withState(task.record, item, "running");
    if (running && task.record.lines[item.index] !== running.lines[0]) {
      await writeAtomically(loaded.root, loaded.path, loaded.text, edit(task.record, [running]));
      note = ` ${id} is running again.${note}`;
    }
  }
  return `Amended ${id}${change ? ": the change is appended to its brief, dated; tell the worker too." : ""}${handle ? ` Handle: ${handle}.` : ""}${note}\n`;
}

function returnState(directory) {
  const path = join(directory, "return.md");
  if (!existsSync(path)) return null;
  return /^State: (.+)$/m.exec(readFileSync(path, "utf8"))?.[1]?.trim() ?? "no State line";
}

/**
 * Where a session worker stands, from the delegation log: not joined yet, its session working, or its session ended
 * (the worker's driver logs that at the session's end), so the coordinator knows to reassign (SPEC-009 section 5).
 */
function sessionText(channel, id, brief, returned) {
  const own = channel.filter((line) => line.delegation === id && line.kind === "inform");
  const joined = own.filter((line) => /^session \S+ joined/.test(line.body ?? "")).at(-1);
  if (!joined) return "a separate session, not joined yet";
  const session = /^session (\S+)/.exec(joined.body)[1];
  const ended = own.find((line) => line.ts >= joined.ts && line.body === `session ${session} ended`);
  const reassign = returned ? "" : ": reassign it with a new session that joins it";
  return `session ${session}${ended ? `, ended ${ended.ts.slice(0, 16).replace("T", " ")} UTC${reassign}` : ", joined"}${brief.Handle && !brief.Handle.includes(session) ? ` (Handle ${brief.Handle})` : ""}`;
}

/**
 * The coordinator's open delegations, and each one's sub-workers, from the record and the folders; with `json`, the
 * same as data for a harness layer such as Freeflow's Claude Code pane (SPEC-015): each one's ID, title, kind, agent,
 * opened date, handle, branch and worktree, its return's State or null, its folder, and its sub-workers.
 */
export async function delegationStatus(loaded, { json = false } = {}) {
  const task = await loadTask5(loaded.path, loaded.text);
  const taskDir = dirname(loaded.path);
  if (!task.record.work.delegations.length)
    return json ? `${JSON.stringify({ delegations: [] }, null, 2)}\n` : "No open delegations.\n";
  const channel = readChannel(taskDir).lines;
  const lines = [];
  const items = [];
  const data = (brief, directory) => ({
    id: brief.id,
    title: brief.title,
    kind: brief.Kind ?? null,
    agent: brief.Agent ?? null,
    settled: brief.Settled ?? null,
    check: brief.Check ?? null,
    route: brief.Route ?? null,
    opened: brief.Opened ?? null,
    handle: brief.Handle ?? null,
    branch: brief.branch,
    worktree: brief.worktree,
    returned: returnState(directory),
    folder: directory,
  });
  for (const item of task.record.work.delegations) {
    const id = item.text.split(" ")[0];
    let directory;
    try {
      directory = delegationDir(taskDir, id);
    } catch (error) {
      lines.push(`- ${id}: ${error.message}`);
      items.push({ id, problem: error.message, sub: [] });
      continue;
    }
    const brief = parseBrief(readFileSync(join(directory, "brief.md"), "utf8"));
    const state = returnState(directory);
    lines.push(
      `- ${id} — ${brief.title} · ${brief.Kind}, ${brief.Agent.replace(/,\s*/, " ")}${brief.Process === "session" ? ` · ${sessionText(channel, id, brief, state)}` : ""} · opened ${brief.Opened} · ${brief.branch ? `branch ${brief.branch}` : "no branch"} · ${state ? `returned: ${state}` : "no return yet"} · ${relative(taskDir, join(directory, "brief.md"))}`,
    );
    const entry = { ...data(brief, directory), sub: [] };
    items.push(entry);
    for (const name of readdirSync(directory)
      .filter((each) => new RegExp(`^${id}\\.\\d+-`).test(each))
      .sort()) {
      const subBrief = parseBrief(readFileSync(join(directory, name, "brief.md"), "utf8"));
      const subState = returnState(join(directory, name));
      lines.push(
        `  - ${subBrief.id} — ${subBrief.title} · ${subBrief.Kind}, ${subBrief.Agent.replace(/,\s*/, " ")} · ${subState ? `returned: ${subState}` : "no return yet"}`,
      );
      entry.sub.push(data(subBrief, join(directory, name)));
    }
  }
  return json ? `${JSON.stringify({ delegations: items }, null, 2)}\n` : `${lines.join("\n")}\n`;
}

/** Problems with a delegation's return: its State and headings, and every commit it names on the brief's branch. */
export function returnProblems(directory) {
  const brief = parseBrief(readFileSync(join(directory, "brief.md"), "utf8"));
  const path = join(directory, "return.md");
  if (!existsSync(path)) return { brief, problems: ["no return.md yet"], commits: [] };
  const text = readFileSync(path, "utf8");
  const problems = [];
  if (!new RegExp(`^# ${brief.id.replace(".", "\\.")} return\\b`).test(text))
    problems.push(`return.md begins with "# ${brief.id} return"`);
  const state = /^State: (.+)$/m.exec(text)?.[1]?.trim();
  if (!RETURN_STATES.has(state))
    problems.push(`its State line is done, blocked or stopped${state ? `, not ${state}` : ""}`);
  const sections = sectionsOf(text.split(/\r?\n/));
  if (brief.Kind !== "review")
    for (const name of RETURN_SECTIONS) if (!(name in sections)) problems.push(`the heading "## ${name}" is missing`);
  const commits = [...new Set((sections.Identities ?? []).join(" ").match(/\b[0-9a-f]{7,40}\b/g) ?? [])].filter(
    // A hash can be all digits; a word of hex letters alone is not taken for one.
    (token) => /\d/.test(token),
  );
  const repo = brief.worktree && existsSync(brief.worktree) ? brief.worktree : brief.repo;
  // A delegation without a branch only read: commits it names are what it read, not what it made.
  for (const commit of repo ? commits : []) {
    if (!ok(git(repo, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`])))
      problems.push(`commit ${commit} does not exist`);
    else if (!ok(git(repo, ["merge-base", "--is-ancestor", commit, brief.branch])))
      problems.push(`commit ${commit} is not on branch ${brief.branch}`);
  }
  return { brief, problems, commits: repo ? commits : [], state };
}

/** A return's Left open choices, one per "- <choice> -> <what was taken>[, technical]" line, and whether it has other text. */
export function leftOpen(returnText) {
  const lines = trim(sectionsOf(String(returnText ?? "").split(/\r?\n/))["Left open"] ?? []);
  const choices = [];
  let other = false;
  for (const line of lines) {
    const match = LEFT_OPEN.exec(line);
    if (match) choices.push({ choice: oneLine(match[1]), taken: oneLine(match[2]), technical: Boolean(match[3]) });
    else if (line.trim() && !/^[-*]?\s*\(?none\.?\)?\.?$/i.test(line.trim())) other = true;
  }
  return { choices, other };
}

/**
 * Checks a return; when it passes, the coordinator's line says returned and the log has its return or blocked line.
 * `readOnly`, for a worker checking its own return, leaves the record as it is.
 */
export async function checkReturn(loaded, options, { readOnly = false } = {}) {
  const { id, sub } = parseId(options["--id"]);
  const taskDir = loaded ? dirname(loaded.path) : resolve(options["--scratch"]);
  const directory = delegationDir(taskDir, id);
  const { brief, problems, commits, state } = returnProblems(directory);
  if (problems.length) fail(`${id}'s return is not ready: ${problems.join("; ")}.`);
  const open = leftOpen(readFileSync(join(directory, "return.md"), "utf8"));
  const warning =
    open.other && !open.choices.length
      ? `\nWarning: Left open has text but no choice line; write each choice you took as "- <the choice> -> <what you took>[, technical]", so the coordinator's close adds it to decisions.md.`
      : "";
  let note = loaded
    ? await logged(taskDir, {
        delegation: id,
        kind: state === "blocked" ? "blocked" : "return",
        ref: relative(taskDir, join(directory, "return.md")),
        body: `State: ${state}`,
      })
    : "";
  if (loaded && !sub && !readOnly) {
    const task = await loadTask5(loaded.path, loaded.text);
    const item = lineOf(task.record, id);
    const returned = item && withState(task.record, item, "returned");
    if (returned && task.record.lines[item.index] !== returned.lines[0]) {
      await writeAtomically(loaded.root, loaded.path, loaded.text, edit(task.record, [returned]));
      note = ` Its line now says returned.${note}`;
    }
  }
  const shape = brief.Kind === "review" ? "a reviewer's return" : "every heading is there";
  const next = readOnly
    ? "Now tell your coordinator, through the harness's message tool where there is one, that it is there."
    : `Now read it and the diff, and ${CHECK_NEXT[brief.Check] ?? "rerun the check that decides the result"}.`;
  // The route as the brief records it, for work opened with --settled or --check (SPEC-010 4.2).
  const routed =
    brief.Settled || brief.Check
      ? [
          brief.Settled && `settled ${brief.Settled}`,
          brief.Check && `check ${brief.Check}`,
          brief.Route && `route ${brief.Route}`,
        ]
          .filter(Boolean)
          .join(", ")
      : "";
  return `${id}'s return: State ${state}${routed ? ` (${brief.Kind}, ${routed})` : ""}; ${shape}; ${commits.length ? `its ${commits.length} commit(s) are on branch ${brief.branch}` : "it names no commit"}${open.choices.length ? `; ${open.choices.length} Left open choice(s)` : ""}.${note}${warning} ${next}\n`;
}

/**
 * What the worker used, from its own log (A in P89): its host agent ID from the brief's Handle, else from the map
 * Freeflow's Claude Code mod keeps (<store>/sessions/<session>/delegations.json), and its log beside the coordinator's
 * transcript (--transcript or FREEFLOW_TRANSCRIPT), as Claude Code keeps a subagent's: "not measured" when any is missing.
 */
function workerMeasured(taskDir, id, brief, options, env = process.env) {
  const transcript = options["--transcript"] ?? env.FREEFLOW_TRANSCRIPT;
  if (!transcript) return "not measured";
  let agent = brief.Handle && brief.Handle !== "not started" ? brief.Handle.replace(/^agent-/, "") : null;
  const home = freeflowStoreOf(taskDir);
  const map =
    home && env.CLAUDE_CODE_SESSION_ID && join(home, "sessions", env.CLAUDE_CODE_SESSION_ID, "delegations.json");
  if (!agent && map && existsSync(map)) {
    try {
      agent = Object.entries(JSON.parse(readFileSync(map, "utf8"))).find(([, value]) => value === id)?.[0] ?? null;
    } catch {
      agent = null;
    }
  }
  const log = agent && join(transcript.replace(/\.jsonl$/, ""), "subagents", `agent-${agent}.jsonl`);
  if (!log || !existsSync(log)) return "not measured";
  const measure = workerMeasure(log, priceTable(env));
  return measure ? renderMeasure(measure) : "not measured";
}

/**
 * Closes one of the coordinator's delegations: records its outcome in one History entry (with the model, effort,
 * tokens, minutes, the merge commit and the return's path), removes its line, and syncs the store.
 */
export async function closeDelegation(loaded, options, text) {
  const { id, sub } = parseId(options["--id"]);
  if (sub)
    fail(
      `${id} is a sub-worker's delegation: its worker reports it in its own return; only the coordinator's delegations enter History.`,
    );
  const outcome = oneLine(options["--outcome"]);
  if (!OUTCOMES.has(outcome)) fail(`--outcome is accepted, sent back or stopped.`);
  const reason = oneLine(options["--reason"]) || null;
  if (outcome === "sent back" && !reason)
    fail(
      "A return sent back says why: --reason brief (the brief left out what the work needed), capability (the model could not do it) or scope (the work was not what the brief said).",
    );
  if (reason && !REASONS.has(reason)) fail(`--reason is ${[...REASONS].join(", ")}.`);
  if (reason && outcome !== "sent back")
    fail('--reason says why a return was sent back: it goes with --outcome "sent back".');
  const task = await loadTask5(loaded.path, loaded.text);
  const taskDir = dirname(loaded.path);
  const item = lineOf(task.record, id);
  if (!item)
    fail(`${id} has no line in Current Work's Delegations: it is closed, or was never opened with delegate open.`);
  const directory = delegationDir(taskDir, id);
  const { brief, problems } = returnProblems(directory);
  const finishing = task.history.entries.some((entry) => entry.id === id);
  let history = task.historyText;
  if (!finishing) {
    const fields = closeInput(text);
    const cue = fields.text("Cue") || fail("delegate close requires Cue.");
    const problem = cueProblem(cue);
    if (problem) fail(`delegate close: ${problem}`);
    const merge = oneLine(options["--merge"]);
    if (outcome === "accepted") {
      if (problems.length) fail(`${id} cannot be accepted: its return is not ready: ${problems.join("; ")}.`);
      if (brief.branch && !merge)
        fail(`${id} has branch ${brief.branch}: accepting it records the commit that merged it, --merge <commit>.`);
      if (merge && !ok(git(brief.repo, ["merge-base", "--is-ancestor", brief.branch, merge])))
        fail(`Branch ${brief.branch} is not merged in ${merge} in ${brief.repo}.`);
    }
    const number = (name) => {
      const value = oneLine(options[name]);
      if (value && !/^\d+$/.test(value)) fail(`${name} is a whole number, as the host reports it.`);
      return value || null;
    };
    const opened = brief.Opened ?? localDate();
    const today = localDate();
    const values = {
      State: outcome,
      Dates: opened === today ? today : `${opened} to ${today}`,
      Cue: cue,
      Under: brief.Agreement ?? "the user's request",
      From: brief.From ?? null,
      Kind: brief.Kind,
      Agent: brief.Agent,
      Settled: brief.Settled ?? null,
      Check: brief.Check ?? null,
      Route: brief.Route ?? null,
      Reason: reason,
      Tokens: number("--tokens"),
      Minutes: number("--minutes"),
      Measured: workerMeasured(taskDir, id, brief, options),
      Result: fields.require("Result"),
      "Task effect": fields.require("Task effect"),
      "Merge commit": merge || null,
      Return: relative(taskDir, join(directory, "return.md")),
    };
    const heading = `## ${id} — ${brief.title}`;
    const entry = renderFields5(heading, ENTRY_ORDER.delegation, values);
    history = `${(task.historyText ?? emptyHistory(task.record.header.name)).trimEnd()}\n\n${[entry[0], "", ...entry.slice(1)].join("\n")}\n`;
    parseHistory5(history);
  }
  // An accepted return's Left open choices join the decision list (SPEC-009 4.3); an invalid list refuses the close.
  const added =
    !finishing && outcome === "accepted" && existsSync(join(directory, "return.md"))
      ? decisionsWithLeftOpen(
          task.decisionsText,
          leftOpen(readFileSync(join(directory, "return.md"), "utf8")).choices,
          id,
        )
      : null;
  // The last line goes with the blank line before it, so the section stays as init wrote it.
  const alone = !task.record.lines[item.index - 1]?.trim() && !task.record.lines[item.index + 1]?.trim();
  const record = edit(task.record, [{ start: item.index - (alone ? 1 : 0), end: item.index + 1, lines: [] }]);
  parseRecord5(record);
  if (history !== task.historyText)
    await writeTaskFile(loaded.root, loaded.path, HISTORY_FILE, task.historyText, history);
  if (added?.items.length)
    await writeTaskFile(loaded.root, loaded.path, DECISIONS_FILE, task.decisionsText, added.text);
  await writeAtomically(loaded.root, loaded.path, loaded.text, record);
  const kind = outcome === "sent back" ? "sent-back" : outcome;
  const note = await logged(taskDir, {
    delegation: id,
    kind,
    ref: relative(taskDir, join(directory, "return.md")),
    body: (finishing ? "" : oneLine(closeInput(text).text("Result"))) || outcome,
  });
  // Its claims end with it (SPEC-009 4.5); a sent-back delegation runs again and keeps them.
  let released = "";
  const home = freeflowStoreOf(taskDir);
  if (home && outcome !== "sent back") {
    const ended = await releaseClaims({ home, task: taskName(loaded.path), delegation: id }).catch(() => []);
    if (ended.length) released = `\nReleased ${ended.length} claim(s) of ${id}.`;
  }
  const decided = added?.items.length
    ? `\nAdded to decisions.md from ${id}'s Left open: ${added.items.join(", ")}${added.linked.length ? ` (${added.linked.join("; ")})` : ""}.`
    : "";
  return `Closed ${id} — ${outcome}${reason ? ` (${reason})` : ""}${decided}${released}${note}\n${await sync(taskDir, `close ${id}`)}\n`;
}

/**
 * decisions.md with a return's Left open choices added, each with the next free ID (SPEC-009 4.3): a plain choice as
 * `- P<n> [default] <choice> -> <taken> (from D-NNN)`; a technical one as `- T<n> [default] <choice>: <taken> (from
 * D-NNN) -> serves P<m>`, linked to the plain item this return added last, else the list's last plain item, for the
 * coordinator to relink, and as a plain item where the list has none. Refused when the list then does not validate.
 */
export function decisionsWithLeftOpen(decisionsText, choices, id) {
  const text = decisionsText ?? EMPTY_DECISIONS;
  if (!choices.length) return { text, items: [], linked: [] };
  const parsed = parseChoices(text);
  const highest = (letter) =>
    Math.max(0, ...parsed.items.filter((item) => item.id[0] === letter).map((item) => Number(item.id.slice(1))));
  let p = highest("P");
  let t = highest("T");
  let lastPlain = [...parsed.items].reverse().find((item) => item.kind === "plain" && item.state !== "dropped")?.id;
  const lines = [];
  const items = [];
  const linked = [];
  for (const choice of choices.filter((each) => !each.technical)) {
    p += 1;
    lastPlain = `P${p}`;
    lines.push(`- P${p} [default] ${choice.choice} -> ${choice.taken} (from ${id})`);
    items.push(`P${p}`);
  }
  for (const choice of choices.filter((each) => each.technical)) {
    if (lastPlain) {
      t += 1;
      lines.push(`- T${t} [default] ${choice.choice}: ${choice.taken} (from ${id}) -> serves ${lastPlain}`);
      items.push(`T${t}`);
      linked.push(`T${t} serves ${lastPlain} until you relink it`);
    } else {
      p += 1;
      lines.push(`- P${p} [default] ${choice.choice} -> ${choice.taken} (technical, from ${id})`);
      items.push(`P${p}`);
    }
  }
  const candidate = `${text.trimEnd()}\n${lines.join("\n")}\n`;
  const checked = parseChoices(candidate);
  if (checked.errors.length)
    fail(
      `${id} cannot be closed: decisions.md would not validate with its Left open choices: ${checked.errors.join("; ")}. Mend decisions.md, then close again.`,
    );
  return { text: candidate, items, linked };
}

function closeInput(text) {
  const fragment = parseFragment(text, new Set(["Cue", "Result", "Task effect"]), "delegate close input");
  const lines = (name) => trim(fragment.fields.get(name)?.valueLines ?? []);
  return {
    text: (name) => lines(name).join(" ").trim(),
    require(name) {
      const value = lines(name);
      if (!value.length) fail(`delegate close requires ${name}.`);
      return value;
    },
  };
}

/** The part of the recovery view a worker or sub-worker reads first: its rule, then its brief, progress and return. */
export function workerSection(taskDir, id) {
  const { sub, top } = parseId(id);
  const directory = delegationDir(taskDir, id);
  const file = (name) => {
    const path = join(directory, name);
    return [
      `### ${relative(taskDir, path)}`,
      "",
      existsSync(path) ? readFileSync(path, "utf8").trim() : "None yet.",
      "",
    ];
  };
  const brief = parseBrief(readFileSync(join(directory, "brief.md"), "utf8"));
  const continues = brief.Continues
    ? (() => {
        try {
          return `- The return it continues: ${relative(taskDir, join(delegationDir(taskDir, brief.Continues), "return.md"))}`;
        } catch {
          return `- The return it continues: ${brief.Continues}'s folder is not found.`;
        }
      })()
    : null;
  return [
    `You are ${id}'s ${sub ? "sub-worker" : "worker"}: the brief is your scope. Where it and the record disagree, the brief wins, and a dated change in its Changes overrides the earlier text${sub ? `; your worker's brief (${relative(taskDir, join(delegationDir(taskDir, top), "brief.md"))}) governs yours` : ""}. Only the coordinator writes the record.`,
    "",
    `## Delegation ${id}`,
    "",
    ...file("brief.md"),
    ...file("progress.md"),
    ...file("return.md"),
    ...(continues ? [continues, ""] : []),
  ];
}

/** One line per open delegation for the coordinator's checks: its return's state and branch. */
export function delegationChecks(taskDir, record) {
  return record.work.delegations.map((item) => {
    const id = item.text.split(" ")[0];
    try {
      const directory = delegationDir(taskDir, id);
      const brief = parseBrief(readFileSync(join(directory, "brief.md"), "utf8"));
      const state = returnState(directory);
      return `- Delegation ${id}: opened ${brief.Opened ?? "on an unknown date"}, ${brief.branch ? `branch ${brief.branch}` : "no branch"}; ${state ? `returned: ${state}, check it (delegate check-return --id ${id})` : "no return yet"}.`;
    } catch (error) {
      return `- Delegation ${id}: ${error.message}`;
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// A worker in a separate session (SPEC-009 4.1): it joins its delegation, keeps its progress.md with checkpoint
// --delegation, and holds no task; only the coordinator writes the record.

/** Where the Freeflow home says this session works for a delegation. */
export function joinedPath(home, identity) {
  return join(home, "sessions", identity.id, JOINED_FILE);
}

/** The delegation this session joined, `{ id, task, record, taskDir, joinedAt }`, or null. */
export function joinedDelegation(home, identity) {
  if (!identity) return null;
  try {
    const joined = JSON.parse(readFileSync(joinedPath(home, identity), "utf8"));
    return typeof joined?.id === "string" && typeof joined.record === "string" ? joined : null;
  } catch {
    return null;
  }
}

/**
 * `delegate join`: this session becomes the worker of a delegation opened with --session. Records the session as the
 * brief's Handle and in the Freeflow home's sessions/<session>/delegation.json, and logs that it joined. The caller
 * prints the worker's recovery.
 */
export async function joinDelegation(loaded, options, { home, identity, held }) {
  if (!identity) fail("No session ID: Claude Code sets CLAUDE_CODE_SESSION_ID; other harnesses set FREEFLOW_SESSION.");
  const { id, sub } = parseId(options["--id"]);
  if (sub) fail(`${id} is a sub-worker's delegation: a sub-worker is a subagent of its worker, not a session.`);
  if (held)
    fail(
      `This session holds ${held.id}: a worker session holds no task. Release it first, or join from another session.`,
    );
  const taskDir = dirname(loaded.path);
  const directory = delegationDir(taskDir, id);
  const briefPath = join(directory, "brief.md");
  let text = readFileSync(briefPath, "utf8");
  const brief = parseBrief(text);
  if (brief.Process !== "session")
    fail(
      `${id} was opened for a subagent: only a delegation opened with delegate open --session takes a session worker.`,
    );
  const task = await loadTask5(loaded.path, loaded.text);
  if (!lineOf(task.record, id)) fail(`${id} is not open in ${taskName(loaded.path)}: it was closed, or never opened.`);
  const previous = joinedDelegation(home, identity);
  if (previous && (previous.id !== id || previous.record !== loaded.path))
    fail(`This session works for ${previous.id} already: a session works for one delegation.`);
  const handle = `session ${identity.id}`;
  text = text.replace(/^(Agent: .*· Handle: ).*$/m, (_, lead) => `${lead}${handle}`);
  await writeFile(briefPath, text);
  const path = joinedPath(home, identity);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify({ id, task: taskName(loaded.path), record: loaded.path, taskDir, joinedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  await rename(temporary, path);
  const note = await logged(taskDir, { delegation: id, kind: "inform", body: `session ${identity.id} joined` });
  return `This session is the worker for ${id} of ${taskName(loaded.path)} (Handle: ${handle}). It holds no task: write progress.md (checkpoint --delegation ${id}) and return.md; only the coordinator writes the record.${note}\n`;
}

/** progress.md's sections from checkpoint --delegation's input: `## Done`, `## Half done`, `## Didn't work`, `## Next`. */
function progressInput(text) {
  const raw = String(text ?? "").replace(/\r\n?/g, "\n");
  const before = raw.split(/^## /m)[0].trim();
  if (before)
    fail(
      `checkpoint --delegation takes progress.md's sections under "## <section>" headings; text before them: ${before.split("\n")[0]}`,
    );
  const sections = sectionsOf(raw.split("\n"));
  for (const name of Object.keys(sections))
    if (!PROGRESS_SECTIONS.includes(name))
      fail(`Unknown progress section ${name}; progress.md has ${PROGRESS_SECTIONS.join(", ")}.`);
  if (!trim(sections.Next).length) fail("checkpoint --delegation requires Next: where the work goes on from.");
  return sections;
}

/**
 * `checkpoint --delegation`: a worker's checkpoint, which rewrites its progress.md whole (Done, Half done, Didn't
 * work, Next) with the time, and logs it. A worker session's compaction then installs `view bundle --delegation`.
 */
export async function checkpointDelegation(loaded, id, text, { joined = null } = {}) {
  parseId(id);
  if (joined && joined.id !== id)
    fail(`This session works for ${joined.id}: its checkpoint is checkpoint --delegation ${joined.id}.`);
  const taskDir = dirname(loaded.path);
  const directory = delegationDir(taskDir, id);
  const sections = progressInput(text);
  const asOf = new Date().toISOString();
  const body = PROGRESS_SECTIONS.flatMap((name) => [
    `## ${name}`,
    ...(trim(sections[name]).length ? trim(sections[name]) : ["None."]),
    "",
  ]);
  const path = join(directory, "progress.md");
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${[`# ${id} progress`, `As of: ${asOf}`, "", ...body].join("\n").trimEnd()}\n`);
  await rename(temporary, path);
  const note = await logged(taskDir, {
    delegation: id,
    kind: "progress",
    ref: relative(taskDir, path),
    body: `Next: ${trim(sections.Next)
      .map((line) => line.replace(/^\s*[-*]\s+/, ""))
      .join(" ")}`,
  });
  return `Wrote ${relative(taskDir, path)} as of ${asOf}.${note}\n`;
}

/** progress.md's time, as checkpoint --delegation wrote it, or null. */
export function progressAsOf(taskDir, id) {
  try {
    const text = readFileSync(join(delegationDir(taskDir, id), "progress.md"), "utf8");
    return /^As of: (\S+)$/m.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The current Slice's Waits on that are still open, each with what came back (SPEC-009 4.4): the latest return or
 * blocked line in the log, else a return.md with its State, else nothing yet.
 */
export function waitsOf(taskDir, record) {
  const slice = record.work.slice;
  const named = slice
    ? (slice.values.get("Waits on")?.lines.join(" ") ?? "")
        .split(",")
        .map((each) => each.trim())
        .filter((each) => /^D-\d{3,}$/.test(each))
    : [];
  const open = new Set(record.work.delegations.map((item) => item.text.split(" ")[0]));
  const waiting = named.filter((id) => open.has(id));
  if (!waiting.length) return null;
  const channel = readChannel(taskDir).lines;
  return {
    slice: slice.id,
    delegations: waiting.map((id) => {
      const line = latestReturn(channel, id);
      let state = line
        ? (/^State: (\w+)/.exec(line.body ?? "")?.[1] ?? (line.kind === "blocked" ? "blocked" : "done"))
        : null;
      let at = line?.ts ?? null;
      if (!state) {
        try {
          const found = returnState(delegationDir(taskDir, id));
          if (found && RETURN_STATES.has(found)) state = found;
        } catch {
          state = null;
        }
      }
      return { id, returned: state, at };
    }),
  };
}

/** The delegation log, as `delegate log` prints it. */
export { renderChannel } from "./channel5.mjs";
export { claimGroups };
