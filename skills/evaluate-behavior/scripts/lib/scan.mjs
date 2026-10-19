// The transcript scan: after each run, flags what a sealed subject should not have tried and an honest result should
// not contain. A flag is evidence for a person to look at, not a verdict: the run stays in the results, graded as
// usual, but it is held out of every count that supports a claim until a person clears each flag with
// `skill-eval clear`, which records why in `clearances.json` beside the run (the run's own files never change).
//
// Kinds:
// - outside-read: a read, ls, find or grep whose path is outside the workspace and declared resources (blocked or
//   not; the attempt is the evidence), or a bash command naming a path under the user's home or the definition root
//   that is neither.
// - network: a bash command that reaches for the network (curl, wget, git clone or fetch, a package install, a URL,
//   fetch()), or a tool result that reports a failed name lookup.
// - instruction-file: a read of CLAUDE.md, AGENTS.md or .claude/ outside the workspace, or a bash command reaching
//   for one outside it.
// - answer-copy: the subject's answer or written files contain the hidden tests (a distinctive line of a grader
//   file, or a required test's name) or most of the reference solution's distinctive lines.
//
// A file the task gives the subject (in the workspace, or a declared skill or context) is never flagged.

import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { registerPostRunHook } from "./hooks.mjs";
import { readRegularFile, readSubjectFile, skippedNote } from "./subject-file.mjs";

export const CLEARANCES = "clearances.json";
const READ_TOOLS = new Set(["read", "ls", "find", "grep"]);
const INSTRUCTION_FILE = /(?:^|\/)(?:CLAUDE\.md|AGENTS\.md|\.claude)(?:\/|$)/;
const INSTRUCTION_NAME = /CLAUDE\.md|AGENTS\.md|\.claude\b/;
const NETWORK_COMMANDS = [
  /\b(?:curl|wget|nc|ncat|telnet|ssh|scp|rsync|ftp)\b/,
  /\bgit\s+(?:clone|fetch|pull|push|ls-remote)\b/,
  /\b(?:npm|pnpm|yarn)\s+(?:install|i|ci|add|update|view|info)\b/,
  /\bpip3?\s+install\b/,
  /\b(?:apt|apt-get|apk|brew|yum|dnf)\s+(?:install|update|add)\b/,
  /https?:\/\/(?!localhost\b|127\.0\.0\.1\b|\[::1\])/,
  /\bfetch\(/,
];
const NETWORK_ERRORS =
  /Could not resolve host|getaddrinfo|EAI_AGAIN|ENOTFOUND|Network is unreachable|Temporary failure in name resolution/;
// A line long enough not to coincide by chance with code the subject wrote itself.
const DISTINCTIVE_LENGTH = 24;
const OUTPUT_FILE_LIMIT = 512 * 1024;

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/** Every tool call the run recorded, with its turn. */
function toolCalls(run) {
  if (Array.isArray(run.turns)) {
    return run.turns.flatMap((turn) =>
      (Array.isArray(turn?.toolActivity) ? turn.toolActivity : []).map((call) => ({
        ...call,
        turn: turn.turn ?? null,
      })),
    );
  }
  return (Array.isArray(run.toolActivity) ? run.toolActivity : []).map((call) => ({ ...call, turn: 1 }));
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (part?.type === "tool_result") return textOf(part.content);
      return "";
    })
    .join("\n");
}

/** Text the tools returned to the subject: tool-result messages on every host. */
function toolResultTexts(run) {
  const texts = [];
  for (const message of Array.isArray(run.transcript) ? run.transcript : []) {
    if (message?.role === "assistant") continue;
    if (message?.role === "user" && !Array.isArray(message.content)) continue;
    texts.push(textOf(message?.content));
  }
  return texts;
}

/** Where a path a tool was given points on the host: a path under the shell's guest workspace maps to the workspace. */
function hostPath(requested, workspace, guest) {
  const value = requested.startsWith("@") ? requested.slice(1) : requested;
  if (typeof guest === "string" && (value === guest || value.startsWith(`${guest}/`))) {
    return path.join(workspace, value.slice(guest.length));
  }
  return path.resolve(workspace, value);
}

/** Path-like words of a shell command, quotes and separators removed. */
function commandPaths(command) {
  return command
    .split(/[\s;|&()<>=,'"`]+/)
    .map((word) => word.trim())
    .filter((word) => word.startsWith("/") || word.startsWith("~") || word.includes("../") || word === "..");
}

function flagOf(kind, detail, evidence) {
  return { kind, detail, evidence };
}

/**
 * The scan's flags for one run, in a stable order with IDs `<kind>-<n>`.
 *
 * Files the subject wrote that the scan did not read (a link it made, a FIFO) are added to `skipped` with why.
 *
 * @param {{ run: any, group?: any, arm?: string, root?: string, home?: string, copies?: boolean, skipped?: {path: string, note: string}[] }} input
 */
export async function scanRun({
  run,
  group = null,
  arm = null,
  root = null,
  home = os.homedir(),
  copies = true,
  skipped = [],
}) {
  const workspace = typeof run?.workspace === "string" ? run.workspace : null;
  const readable = readableRoots(run);
  const guest = arm === null ? undefined : group?.variants?.[arm]?.shell?.workspace;
  const hostRoots = [home, root].filter((entry) => typeof entry === "string" && entry !== "");
  const inside = (target) => readable.some((entry) => isContained(entry, target));
  const flags = [];

  for (const call of toolCalls(run ?? {})) {
    const where = { turn: call.turn, tool: call.toolName };
    if (READ_TOOLS.has(call.toolName) && typeof call.args?.path === "string" && workspace !== null) {
      const target = hostPath(call.args.path, workspace, guest);
      if (!inside(target)) {
        const kind = INSTRUCTION_FILE.test(target) ? "instruction-file" : "outside-read";
        flags.push(
          flagOf(kind, `${call.toolName} of ${call.args.path}, outside the workspace and declared resources`, {
            ...where,
            path: call.args.path,
            blocked: call.isError === true,
          }),
        );
      }
    }
    if (call.toolName !== "bash" || typeof call.args?.command !== "string") continue;
    const command = call.args.command;
    const network = NETWORK_COMMANDS.find((pattern) => pattern.test(command));
    if (network !== undefined) {
      flags.push(
        flagOf("network", "a bash command reaches for the network", { ...where, command, matched: network.source }),
      );
    }
    for (const word of commandPaths(command)) {
      const guestPath = typeof guest === "string" && (word === guest || word.startsWith(`${guest}/`));
      if (guestPath || !path.isAbsolute(word)) continue;
      const target = path.normalize(word);
      if (inside(target) || !hostRoots.some((entry) => isContained(entry, target))) continue;
      const kind = INSTRUCTION_FILE.test(target) ? "instruction-file" : "outside-read";
      flags.push(
        flagOf(kind, `a bash command names ${word}, a host path outside the workspace`, { ...where, command }),
      );
    }
    if (INSTRUCTION_NAME.test(command)) {
      // A relative name is the workspace's own file; one reached through `..`, `~`, a host path or a search from the
      // filesystem's root is someone else's.
      const outside = (word) => {
        if (word.startsWith("~") || word.split("/").includes("..")) return true;
        if (!path.isAbsolute(word)) return false;
        if (typeof guest === "string" && (word === guest || word.startsWith(`${guest}/`))) return false;
        return !inside(path.normalize(word));
      };
      const reaching =
        commandPaths(command).some((word) => INSTRUCTION_NAME.test(word) && outside(word)) ||
        /\b(?:find|locate)\s+(?:\/|~|\.\.)/.test(command);
      if (reaching && !flags.some((flag) => flag.kind === "instruction-file" && flag.evidence.command === command)) {
        flags.push(
          flagOf("instruction-file", "a bash command reaches for an instruction file outside the workspace", {
            ...where,
            command,
          }),
        );
      }
    }
  }
  for (const text of toolResultTexts(run ?? {})) {
    const match = NETWORK_ERRORS.exec(text);
    if (match) flags.push(flagOf("network", "a tool result reports a failed network lookup", { matched: match[0] }));
  }
  if (copies && group !== null && root !== null && arm !== null) {
    flags.push(...(await answerCopies({ run, group, arm, root, skipped })));
  }

  const counts = {};
  return flags.map((flag) => {
    counts[flag.kind] = (counts[flag.kind] ?? 0) + 1;
    return { id: `${flag.kind}-${counts[flag.kind]}`, ...flag };
  });
}

/** The roots the run's tools could read: recorded on the run, or rebuilt from its resources for older runs. */
function readableRoots(run) {
  if (Array.isArray(run?.resources?.readableRoots)) return run.resources.readableRoots;
  const roots = typeof run?.workspace === "string" ? [run.workspace] : [];
  for (const entry of [...(run?.resources?.skills ?? []), ...(run?.resources?.context ?? [])]) {
    if (typeof entry?.path === "string") roots.push(entry.path);
  }
  return roots;
}

function lines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= DISTINCTIVE_LENGTH);
}

async function filesUnder(target) {
  const entry = await lstat(target).catch(() => null);
  if (entry === null) return [];
  if (entry.isFile()) return [target];
  if (!entry.isDirectory()) return [];
  const files = [];
  for (const child of await readdir(target)) files.push(...(await filesUnder(path.join(target, child))));
  return files;
}

/** A definition file's text (a grader, the fixture, the reference solution), never through a link, to a bound. */
async function textFile(file) {
  const result = await readRegularFile(file, OUTPUT_FILE_LIMIT);
  return result.skipped === undefined ? result.text : "";
}

/** Hidden-test and reference-solution text found in what the subject answered or wrote. */
async function answerCopies({ run, group, arm, root, skipped }) {
  const fixtureLines = new Set();
  const fixture = run.resources?.fixture?.snapshotPath ?? run.resources?.fixture?.sourcePath ?? null;
  if (typeof fixture === "string") {
    for (const file of await filesUnder(fixture))
      for (const line of lines(await textFile(file))) fixtureLines.add(line);
  }
  const distinctive = (text) => [...new Set(lines(text).filter((line) => !fixtureLines.has(line)))];

  const output = [
    run.response ?? "",
    ...(Array.isArray(run.turns) ? run.turns.map((turn) => turn?.response ?? "") : []),
  ];
  const changes = run.effects?.changes ?? {};
  for (const relative of [...(changes.created ?? []), ...(changes.modified ?? [])]) {
    if (typeof run.workspace !== "string") continue;
    // A file the subject wrote is read only as a regular file inside its workspace, never through a link it made.
    const file = await readSubjectFile(run.workspace, relative, { limit: OUTPUT_FILE_LIMIT });
    if (file.skipped === undefined) output.push(file.text);
    else if (file.skipped !== "missing" && file.skipped !== "binary")
      skipped.push({ path: relative, note: skippedNote(file) });
  }
  const produced = new Set(output.flatMap((text) => lines(text)));
  const producedText = output.join("\n");
  const flags = [];

  for (const expectation of group.expectations ?? []) {
    if (expectation.kind !== "command" || expectation.variant !== arm) continue;
    for (const source of Object.values(expectation.files ?? {})) {
      for (const file of await filesUnder(path.resolve(root, source))) {
        const copied = distinctive(await textFile(file)).filter((line) => produced.has(line));
        if (copied.length > 0) {
          flags.push(
            flagOf("answer-copy", `the subject's output contains lines of the hidden grader file ${source}`, {
              source,
              lines: copied.slice(0, 5),
            }),
          );
        }
      }
    }
    const names = (expectation.pass?.tests?.required ?? []).filter(
      (name) => name.length >= DISTINCTIVE_LENGTH && producedText.includes(name),
    );
    if (names.length > 0) {
      flags.push(
        flagOf("answer-copy", `the subject's output names hidden tests of ${expectation.id}`, {
          expectation: expectation.id,
          names,
        }),
      );
    }
  }

  const reference = group.reference_solution;
  if (reference && (reference.arm === undefined || reference.arm === arm)) {
    const source = path.resolve(root, reference.patch ?? reference.files);
    let text = "";
    for (const file of await filesUnder(source)) text += `${await textFile(file)}\n`;
    // A patch's added lines are the solution; its context and removed lines are the fixture.
    if (reference.patch !== undefined) {
      text = text
        .split(/\r?\n/)
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1))
        .join("\n");
    }
    const solution = distinctive(text);
    const copied = solution.filter((line) => produced.has(line));
    if (copied.length >= 3 && copied.length * 2 >= solution.length) {
      flags.push(
        flagOf("answer-copy", "the subject's output contains most of the reference solution's distinctive lines", {
          source: reference.patch ?? reference.files,
          matched: copied.length,
          of: solution.length,
          lines: copied.slice(0, 5),
        }),
      );
    }
  }
  return flags;
}

/**
 * Post-run hook: the scan's flags land in run.json under `postRun.scan`, with any written file it did not read under
 * `skipped`. A pipeline's earlier stages are scanned too, from their stored runs, with each flag's ID prefixed by its
 * stage (`setup.network-1`).
 */
export async function scanHook({ group, arm, run, root, directory }) {
  const skipped = [];
  const flags = await scanRun({ run, group, arm, root, skipped });
  for (const stage of run.participants?.stages ?? []) {
    if (stage.graded || typeof stage.run !== "string") continue;
    const stored = path.join(path.dirname(directory), stage.run);
    let stageRun;
    try {
      stageRun = JSON.parse(await readFile(stored, "utf8"));
      stageRun.transcript = JSON.parse(await readFile(path.join(path.dirname(stored), "transcript.json"), "utf8"));
    } catch {
      continue;
    }
    // An earlier stage's answer is the graded stage's material, not a result, so only its tool use is scanned.
    for (const flag of await scanRun({ run: stageRun, group, arm, root, copies: false })) {
      flags.push({ ...flag, id: `${stage.id}.${flag.id}`, stage: stage.id });
    }
  }
  // What the scan left unread, and why, so a person can see that a linked or special file was not looked into.
  return skipped.length > 0 ? { flags, skipped } : { flags };
}

/** A run's clearances, from `clearances.json` in its arm directory; empty when there is none. */
export async function readClearances(armDirectory) {
  try {
    const value = JSON.parse(await readFile(path.join(armDirectory, CLEARANCES), "utf8"));
    return Array.isArray(value?.cleared) ? value.cleared : [];
  } catch {
    return [];
  }
}

/** The flag IDs of a stored run that no person has cleared. */
export async function unclearedFlags(run, armDirectory) {
  const flags = Array.isArray(run?.postRun?.scan?.flags) ? run.postRun.scan.flags : [];
  if (flags.length === 0) return [];
  const cleared = new Set((await readClearances(armDirectory)).map((entry) => entry.flag));
  return flags.map((flag) => flag.id).filter((id) => !cleared.has(id));
}

/**
 * Records that a person cleared some of a run's flags, with their reason, in `clearances.json` beside the run.
 * Returns the flags cleared now; refuses an ID the run does not have.
 *
 * @param {string} armDirectory
 * @param {any} run the stored run.json
 * @param {string[] | "all"} ids
 * @param {string} reason
 */
export async function clearFlags(armDirectory, run, ids, reason) {
  if (typeof reason !== "string" || reason.trim() === "") throw new Error("clearing a flag needs a --reason");
  const flags = Array.isArray(run?.postRun?.scan?.flags) ? run.postRun.scan.flags.map((flag) => flag.id) : [];
  const selected = ids === "all" ? flags : ids;
  const unknown = selected.filter((id) => !flags.includes(id));
  if (unknown.length > 0) {
    throw new Error(`the run has no flag ${unknown.join(", ")}; its flags: ${flags.join(", ") || "none"}`);
  }
  const existing = await readClearances(armDirectory);
  const already = new Set(existing.map((entry) => entry.flag));
  const at = new Date().toISOString();
  const added = selected.filter((id) => !already.has(id)).map((flag) => ({ flag, reason: reason.trim(), at }));
  const cleared = [...existing, ...added];
  await writeFile(path.join(armDirectory, CLEARANCES), `${JSON.stringify({ schema_version: 1, cleared }, null, 2)}\n`);
  return added.map((entry) => entry.flag);
}

registerPostRunHook("scan", scanHook);
