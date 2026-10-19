// What a task's copy lacks against the setting it was taken from. A fixture is copied into each workspace as plain
// files, so a subject never has the original's Git history, its ignored files (a `.env`, built output, installed
// packages), or tools and network the original had. `check-tasks` lists each such gap, without a model, so the author
// can judge whether the task is still fair before paying for runs. Gaps are reported, never refused.

import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { armNames } from "./arms.mjs";
import { armSealing } from "./seal.mjs";

const run = promisify(execFile);
const GIT_WORDS = /\b(?:git|commit|commits|diff|branch|blame|stash|rebase|history|log)\b/i;
const RUN_WORDS = /\b(?:run|test|tests|build|install|npm|node|pytest|make|cargo|go test|execute)\b/i;
const NETWORK_WORDS = /\b(?:npm install|pip install|git clone|curl|wget|download|https?:\/\/\S+)/i;

/** Everything the subject is told: the prompt or turns, and each pipeline stage's own input. */
function taskText(group) {
  const parts = [];
  if (typeof group.input?.prompt === "string") parts.push(group.input.prompt);
  for (const turn of group.input?.turns ?? []) if (typeof turn === "string") parts.push(turn);
  for (const stage of group.participants?.stages ?? []) {
    if (typeof stage.input === "string") parts.push(stage.input);
    else if (typeof stage.input?.prompt === "string") parts.push(stage.input.prompt);
  }
  return parts.join("\n");
}

/** Words of the task that look like file or folder names: `src/a.js`, `.env`, `report.md`, `node_modules/`. */
function namedPaths(text) {
  const names = new Set();
  for (const raw of text.split(/[\s`'"(),;:]+/)) {
    const word = raw.replace(/[.!?]+$/, "");
    if (word === "" || /^[a-z]+:\/\//i.test(word) || word.startsWith("/") || word.includes("..")) continue;
    if (word.includes("/") || /^\.[A-Za-z0-9_-]+/.test(word) || /^[\w-]+\.[A-Za-z0-9]{1,8}$/.test(word)) {
      names.add(word.replace(/\/+$/, ""));
    }
  }
  return [...names];
}

async function git(cwd, args) {
  try {
    const { stdout } = await run("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, stdout: String(error?.stdout ?? "") };
  }
}

/**
 * The gaps between one group's task copy and its original setting, with no model: `gaps` (each a line saying what
 * the copy lacks), and the `tools` and `network` each arm's subject has.
 *
 * @param {any} group a loaded group
 * @param {{ root: string }} options
 */
export async function taskCopyGaps(group, { root }) {
  const text = taskText(group);
  const gaps = [];
  const fixture = group.fixture === null ? null : path.resolve(root, group.fixture);

  // Git history: a fixture is copied as plain files, so the workspace is never a repository.
  const hasGit = fixture !== null && (await stat(path.join(fixture, ".git")).catch(() => null)) !== null;
  if (!hasGit) {
    const words = [...new Set((text.match(new RegExp(GIT_WORDS, "gi")) ?? []).map((word) => word.toLowerCase()))];
    gaps.push(
      `git history: the workspace is not a Git repository${words.length > 0 ? `, and the task mentions ${words.join(", ")}` : ""}`,
    );
  }

  if (fixture !== null) {
    // Ignored files the fixture holds here: a run copies them, but no clone has them, so the task changes by machine.
    const ignored = await git(fixture, ["ls-files", "--others", "--ignored", "--exclude-standard", "--", "."]);
    const present = ignored.ok ? ignored.stdout.split("\n").filter(Boolean) : [];
    if (present.length > 0) {
      gaps.push(
        `ignored files: the fixture holds ${present.slice(0, 5).join(", ")}${present.length > 5 ? ` and ${present.length - 5} more` : ""}, which Git ignores, so a clone of the repository lacks them`,
      );
    }
    // Ignored files the task names but the copy lacks: the original setting had them (a .env, built output).
    const missing = [];
    for (const name of namedPaths(text)) {
      if ((await stat(path.join(fixture, name)).catch(() => null)) !== null) continue;
      const checked = await git(fixture, ["check-ignore", "--no-index", "-q", "--", name]);
      if (checked.ok) missing.push(name);
    }
    if (missing.length > 0) {
      gaps.push(`ignored files the task names: ${missing.join(", ")}; Git ignores them here, and the copy lacks them`);
    }
  }

  // Tools and network, per arm: what the subject can run, and what its code can reach.
  const tools = {};
  const network = {};
  for (const arm of armNames(group)) {
    const shell = group.variants?.[arm]?.shell;
    const bash = !group.tools.includes("bash")
      ? null
      : shell?.container !== undefined
        ? `bash in ${shell.container.image}`
        : `bash in ${shell?.isolation ?? "an undeclared shell"}`;
    const commands = (group.commands ?? []).map((command) => command.id);
    tools[arm] = [
      ...group.tools.filter((tool) => tool !== "bash" && tool !== "run_command"),
      ...(bash === null ? [] : [bash]),
      ...(commands.length > 0 ? [`run_command (${commands.join(", ")})`] : []),
    ];
    const sealing = armSealing(group, arm);
    network[arm] = sealing.network;
    // A description group only reads, so only a body group's tools and network can fall short of the task.
    if (group.type !== "body") continue;
    if (bash === null && commands.length === 0 && RUN_WORDS.test(text)) {
      gaps.push(`tools: arm ${arm} has no bash or run_command, and the task asks to run something`);
    }
    const wants = NETWORK_WORDS.exec(text);
    if (wants !== null && sealing.network === "none") {
      gaps.push(`network: arm ${arm} has none, and the task refers to it (${wants[0]})`);
    }
  }
  return { gaps: [...new Set(gaps)], tools, network };
}
