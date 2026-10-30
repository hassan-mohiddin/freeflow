// Delegations (the Spec's section 10): one folder per delegation in the task folder, delegations/D-NNN-<slug>/, with
// brief.md written by whoever hands the work out, and progress.md and return.md by the worker. A sub-worker's folder
// sits inside its worker's (D-012/D-012.1-<slug>/), and there is no fourth level. Only the coordinator's delegations
// have a line in record.md's Delegations and an entry in history.md; a delegation is not part of a Slice (P57).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyLineReplacements, parseFragment } from "./document.mjs";
import { slugify } from "./format.mjs";
import { syncStore } from "./freeflow-store.mjs";
import {
  ENTRY_ORDER,
  HISTORY_FILE,
  cueProblem,
  emptyHistory,
  loadTask5,
  parseHistory5,
  parseRecord5,
  renderFields5,
} from "./record5.mjs";
import { priceTable, renderMeasure, workerMeasure } from "./measure5.mjs";
import { freeflowStoreOf, projectOf, writeAtomically, writeTaskFile } from "./store.mjs";

export const KINDS = new Set(["build", "review", "research", "eval", "gather"]);
export const OUTCOMES = new Set(["accepted", "sent back", "stopped"]);
const RETURN_STATES = new Set(["done", "blocked", "stopped"]);
const BRIEF_SECTIONS = ["Result wanted", "Scope", "Settled", "Read", "Done when", "Return when", "Changes"];
const RETURN_SECTIONS = ["Result", "Identities", "Checks", "Left open", "Not done"];
const ID = /^D-(\d{3,})(?:\.(\d+))?$/;
const REFERENCE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../execute-work/references/delegation.md");
const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../working-record.mjs");

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
    ...task.history.entries.map((entry) => entry.id),
    ...task.record.work.delegations.map((item) => item.text.split(" ")[0]),
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
 * Opens a delegation: assigns its ID, writes brief.md from the template, makes a writing worker's worktree on its
 * own branch at the base, and, for the coordinator's delegations, writes its line in record.md's Delegations.
 */
export async function openDelegation(loaded, options, text) {
  const task = await loadTask5(loaded.path, loaded.text);
  const taskDir = dirname(loaded.path);
  const title = oneLine(options["--title"]) || fail("delegate open requires --title.");
  const kind = oneLine(options["--kind"]);
  if (!KINDS.has(kind)) fail(`--kind is one of ${[...KINDS].join(", ")}.`);
  const agent = oneLine(options["--agent"]);
  if (!/^[^,]+, ?\S+$/.test(agent)) fail('--agent names the model and effort, as "Haiku, xhigh".');
  const sections = briefInput(text);
  const parent = options["--parent"] ? parseId(options["--parent"]) : null;
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
  const under = options["--under"] ?? task.record.work.agreement?.id ?? null;
  // A sub-worker's delegation comes from its worker; the coordinator's, from its current Slice.
  const from = options["--from"] ?? parent?.id ?? task.record.work.slice?.id ?? null;
  const slug = basename(directory).toLowerCase();
  let space = "the coordinator's checkout (read only)";
  if (options["--repo"]) {
    const repo = git(resolve(options["--repo"]), ["rev-parse", "--show-toplevel"]);
    if (!ok(repo)) fail(`--repo ${options["--repo"]} is not a Git repository.`);
    const base = options["--base"] ?? "HEAD";
    const commit = git(repo, ["rev-parse", "--short=8", `${base}^{commit}`]);
    if (!ok(commit)) fail(`--base ${base} is not a commit in ${repo}.`);
    const branch = options["--branch"] ?? slug;
    const worktree = resolve(options["--worktree"] ?? join(dirname(repo), `${basename(repo)}-${slug}`));
    const made = git(repo, ["worktree", "add", "-q", "-b", branch, worktree, commit]);
    if (!ok(made)) fail(`Could not make the worktree: ${made.message}`);
    space = `${repo} worktree ${worktree} at ${commit}, branch ${branch}`;
  }
  const recover = `node ${SCRIPT} view recover --record ${loaded.path} --delegation ${id}`;
  const read = [
    ...trim(sections.Read),
    `- ${REFERENCE}, Work From A Brief: how to work from this brief, write progress.md and return.md, and hand work down.`,
    `- After a compaction, recover with: ${recover}`,
  ];
  const header = [
    `# ${id} — ${title}`,
    [
      `Task: ${taskName(loaded.path)}`,
      under && `Agreement: ${under}`,
      from && `From: ${from}`,
      options["--continues"] && `Continues: ${options["--continues"]}`,
      `Opened: ${localDate()}`,
    ]
      .filter(Boolean)
      .join(" · "),
    `Agent: ${agent} · Kind: ${kind} · Handle: ${oneLine(options["--handle"]) || "not started"}`,
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
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "brief.md"), `${[...header, ...body].join("\n").trimEnd()}\n`);
  const path = relative(taskDir, join(directory, "brief.md"));
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
  return `Opened ${id} — ${title}\n${path}\nSpace: ${space}\nStart the worker with a prompt that names ${id} and the brief's path; it recovers with:\n  ${recover}\n`;
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
  let note = "";
  if (change && !sub) {
    // Another round for the same result keeps the folder: a returned delegation runs again.
    const task = await loadTask5(loaded.path, loaded.text);
    const item = lineOf(task.record, id);
    const running = item && withState(task.record, item, "running");
    if (running && task.record.lines[item.index] !== running.lines[0]) {
      await writeAtomically(loaded.root, loaded.path, loaded.text, edit(task.record, [running]));
      note = ` ${id} is running again.`;
    }
  }
  return `Amended ${id}${change ? ": the change is appended to its brief, dated; tell the worker too." : ""}${handle ? ` Handle: ${handle}.` : ""}${note}\n`;
}

function returnState(directory) {
  const path = join(directory, "return.md");
  if (!existsSync(path)) return null;
  return /^State: (.+)$/m.exec(readFileSync(path, "utf8"))?.[1]?.trim() ?? "no State line";
}

/** The coordinator's open delegations, and each one's sub-workers, from the record and the folders. */
export async function delegationStatus(loaded) {
  const task = await loadTask5(loaded.path, loaded.text);
  const taskDir = dirname(loaded.path);
  if (!task.record.work.delegations.length) return "No open delegations.\n";
  const lines = [];
  for (const item of task.record.work.delegations) {
    const id = item.text.split(" ")[0];
    let directory;
    try {
      directory = delegationDir(taskDir, id);
    } catch (error) {
      lines.push(`- ${id}: ${error.message}`);
      continue;
    }
    const brief = parseBrief(readFileSync(join(directory, "brief.md"), "utf8"));
    const state = returnState(directory);
    lines.push(
      `- ${id} — ${brief.title} · ${brief.Kind}, ${brief.Agent.replace(/,\s*/, " ")} · opened ${brief.Opened} · ${brief.branch ? `branch ${brief.branch}` : "no branch"} · ${state ? `returned: ${state}` : "no return yet"} · ${relative(taskDir, join(directory, "brief.md"))}`,
    );
    for (const name of readdirSync(directory)
      .filter((each) => new RegExp(`^${id}\\.\\d+-`).test(each))
      .sort()) {
      const subBrief = parseBrief(readFileSync(join(directory, name, "brief.md"), "utf8"));
      const subState = returnState(join(directory, name));
      lines.push(
        `  - ${subBrief.id} — ${subBrief.title} · ${subBrief.Kind}, ${subBrief.Agent.replace(/,\s*/, " ")} · ${subState ? `returned: ${subState}` : "no return yet"}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
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

export async function checkReturn(loaded, options) {
  const { id, sub } = parseId(options["--id"]);
  const directory = delegationDir(dirname(loaded.path), id);
  const { brief, problems, commits, state } = returnProblems(directory);
  if (problems.length) fail(`${id}'s return is not ready: ${problems.join("; ")}.`);
  let note = "";
  if (!sub) {
    const task = await loadTask5(loaded.path, loaded.text);
    const item = lineOf(task.record, id);
    const returned = item && withState(task.record, item, "returned");
    if (returned && task.record.lines[item.index] !== returned.lines[0]) {
      await writeAtomically(loaded.root, loaded.path, loaded.text, edit(task.record, [returned]));
      note = ` Its line now says returned.`;
    }
  }
  const shape = brief.Kind === "review" ? "a reviewer's return" : "every heading is there";
  return `${id}'s return: State ${state}; ${shape}; ${commits.length ? `its ${commits.length} commit(s) are on branch ${brief.branch}` : "it names no commit"}.${note} Now read it and the diff, and rerun the check that decides the result.\n`;
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
  // The last line goes with the blank line before it, so the section stays as init wrote it.
  const alone = !task.record.lines[item.index - 1]?.trim() && !task.record.lines[item.index + 1]?.trim();
  const record = edit(task.record, [{ start: item.index - (alone ? 1 : 0), end: item.index + 1, lines: [] }]);
  parseRecord5(record);
  if (history !== task.historyText)
    await writeTaskFile(loaded.root, loaded.path, HISTORY_FILE, task.historyText, history);
  await writeAtomically(loaded.root, loaded.path, loaded.text, record);
  return `Closed ${id} — ${outcome}\n${await sync(taskDir, `close ${id}`)}\n`;
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
