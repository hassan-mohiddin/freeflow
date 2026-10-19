// The transcript scan: after each run, flags what a sealed subject should not have tried and an honest result should
// not contain. A flag is evidence for a person to look at, not a verdict: the run stays in the results, graded as
// usual, but it is held out of every count that supports a claim until a person clears each flag with
// `skill-eval clear`, which records why in `clearances.json` beside the run (the run's own files never change).
//
// Kinds:
// - outside-read: a read, ls, find or grep whose path is outside what the run was given (blocked or not; the attempt
//   is the evidence), or a bash command naming a host path under the user's home or the definition root that is
//   outside it, or a credential location under a home (`~/.ssh`, `~/.pi`, ...). What the run was given is its
//   workspace, its declared resources and its own arm directory except `isolation/`, where the host's login lives.
// - network: a bash command that reaches for an external target: an HTTP client, socket tool, remote shell or Git
//   remote whose target is not this machine or the container's own network, code that fetches an external URL, or,
//   when the run's network was "none", an install that names a package from a registry. A URL in a payload or in
//   tool output is not an attempt (`lib/scan-shell.mjs`).
// - instruction-file: a read of CLAUDE.md, AGENTS.md or .claude/ outside the workspace, or a bash command reaching
//   for one outside it.
// - answer-copy: the subject's answer or written files contain the hidden tests (several distinctive lines of a
//   grader file, or a required test's name) or most of the reference solution's distinctive lines. A distinctive line
//   is long, carries several words and is not an import, so boilerplate any code shares is never a copy.
//
// A file the task gives the subject (in the workspace, or a declared skill or context) is never flagged.

import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { registerPostRunHook } from "./hooks.mjs";
import { networkAttempts, program, simpleCommands } from "./scan-shell.mjs";
import { readRegularFile, readSubjectFile, skippedNote } from "./subject-file.mjs";

export const CLEARANCES = "clearances.json";
const READ_TOOLS = new Set(["read", "ls", "find", "grep"]);
const INSTRUCTION_FILE = /(?:^|\/)(?:CLAUDE\.md|AGENTS\.md|\.claude)(?:\/|$)/;
const INSTRUCTION_NAME = /CLAUDE\.md|AGENTS\.md|\.claude\b/;
// Where a home keeps logins and keys. A shell's HOME may be an isolated directory, but naming one of these is still
// reaching for a credential.
const CREDENTIAL =
  /^(?:~|\$HOME|\$\{HOME\})\/(?:\.ssh|\.aws|\.gnupg|\.netrc|\.npmrc|\.git-credentials|\.docker|\.kube|\.config\/gh|\.pi|\.claude|\.codex)(?:\/|$)/;
// A line long enough, with enough words, not to coincide by chance with code the subject wrote itself.
const DISTINCTIVE_LENGTH = 24;
const DISTINCTIVE_WORDS = 4;
// Lines every module of a language shares: imports and requires are never evidence of a copy.
const BOILERPLATE =
  /^(?:import\b|export\s+(?:\*|\{[^}]*\})\s+from\b|from\s+\S+\s+import\b|(?:const|let|var)\s+.*=\s*require\()/;
// How many consecutive distinctive lines of one hidden grader file make a copy.
const GRADER_LINES = 3;
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

/**
 * Where a path a tool was given points on the host: a path under the shell's guest workspace maps to the workspace,
 * and `~` is the user's home.
 */
function hostPath(requested, workspace, guest, home) {
  const value = requested.startsWith("@") ? requested.slice(1) : requested;
  if (typeof guest === "string" && (value === guest || value.startsWith(`${guest}/`))) {
    return path.join(workspace, value.slice(guest.length));
  }
  if (value === "~" || value.startsWith("~/")) return path.join(home, value.slice(1));
  return path.resolve(workspace, value);
}

/** Path-like words of a shell command, quotes and separators removed. */
function commandPaths(command) {
  return command
    .split(/[\s;|&()<>=,'"`]+/)
    .map((word) => word.trim())
    .filter((word) => word.startsWith("/") || word.startsWith("~") || word.startsWith("$HOME") || word.includes(".."));
}

const TEMPORARY = [
  ...new Set([
    "/tmp",
    "/private/tmp",
    "/var/tmp",
    "/private/var/tmp",
    "/var/folders",
    "/private/var/folders",
    os.tmpdir(),
  ]),
];

/** Whether a host path is under a temp directory, where a subject's commands keep their scratch files. */
function isTemporary(target) {
  return TEMPORARY.some((entry) => isContained(entry, target));
}

function flagOf(kind, detail, evidence) {
  return { kind, detail, evidence };
}

/** The arm directory a run was made in: its workspace's parent, where the run's own files are. */
function armDirectoryOf(run) {
  return typeof run?.workspace === "string" && path.basename(run.workspace) === "workspace"
    ? path.dirname(run.workspace)
    : null;
}

/**
 * The scan's flags for one run, in a stable order with IDs `<kind>-<n>`.
 *
 * Files the subject wrote that the scan did not read (a link it made, a FIFO) are added to `skipped` with why.
 *
 * @param {{ run: any, group?: any, arm?: string, root?: string, home?: string, directory?: string | null, copies?: boolean, skipped?: {path: string, note: string}[] }} input
 */
export async function scanRun({
  run,
  group = null,
  arm = null,
  root = null,
  home = os.homedir(),
  directory = null,
  copies = true,
  skipped = [],
}) {
  const workspace = typeof run?.workspace === "string" ? run.workspace : null;
  const guest = arm === null ? undefined : group?.variants?.[arm]?.shell?.workspace;
  const hostRoots = [home, root].filter((entry) => typeof entry === "string" && entry !== "");
  // The arm directory holds the run's resources and package copies; only its isolation holds what no tool may read.
  const armDirectory = directory ?? armDirectoryOf(run);
  const readable = readableRoots(run, armDirectory);
  const inside = (target) =>
    readable.some((entry) => isContained(entry, target)) ||
    (armDirectory !== null &&
      isContained(armDirectory, target) &&
      !isContained(path.join(armDirectory, "isolation"), target));
  const isGuest = (word) => typeof guest === "string" && (word === guest || word.startsWith(`${guest}/`));
  // Where a word of a bash command points on the host, or null when it is no host path: a guest path is the
  // workspace, and a relative path with `..` starts from the workspace (or, in a container, from its guest path).
  const bashTarget = (word) => {
    if (isGuest(word)) return null;
    if (path.isAbsolute(word)) return path.normalize(word);
    if (!word.split("/").includes("..") || workspace === null) return null;
    if (typeof guest === "string") {
      const resolved = path.posix.resolve(guest, word);
      return isGuest(resolved) ? null : path.normalize(resolved);
    }
    return path.resolve(workspace, word);
  };
  const flags = [];
  const sealed =
    (run?.sealing?.network ?? (arm === null ? undefined : group?.configurations?.[arm]?.network) ?? null) === "none";

  for (const call of toolCalls(run ?? {})) {
    const where = { turn: call.turn, tool: call.toolName };
    if (READ_TOOLS.has(call.toolName) && typeof call.args?.path === "string" && workspace !== null) {
      const target = hostPath(call.args.path, workspace, guest, home);
      // A scratch file under the system's temp directory is the subject's own (its bash wrote it there), unless the
      // temp directory holds the definition root or a home.
      const scratch = isTemporary(target) && !hostRoots.some((entry) => isContained(entry, target));
      if (!inside(target) && !scratch) {
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
    for (const attempt of networkAttempts(command, { sealed })) {
      flags.push(
        flagOf("network", `a bash command reaches for the network: ${attempt.program} ${attempt.target}`.trim(), {
          ...where,
          command,
          program: attempt.program,
          target: attempt.target,
        }),
      );
    }
    const named = new Set();
    for (const word of commandPaths(command)) {
      const credential = CREDENTIAL.test(word);
      const target = credential ? null : bashTarget(word);
      if (!credential) {
        if (target === null || inside(target) || !hostRoots.some((entry) => isContained(entry, target))) continue;
      }
      if (named.has(word)) continue;
      named.add(word);
      const kind = INSTRUCTION_FILE.test(target ?? word) ? "instruction-file" : "outside-read";
      flags.push(
        flagOf(kind, `a bash command names ${word}, a host path outside the workspace`, { ...where, command }),
      );
    }
    if (
      INSTRUCTION_NAME.test(command) &&
      !flags.some((flag) => flag.kind === "instruction-file" && flag.evidence.command === command)
    ) {
      if (reachesInstructionFile(command, { inside, bashTarget, isGuest })) {
        flags.push(
          flagOf("instruction-file", "a bash command reaches for an instruction file outside the workspace", {
            ...where,
            command,
          }),
        );
      }
    }
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

/**
 * Whether a bash command reaches for an instruction file outside the workspace: one of its simple commands names one
 * through `~`, `..` or a host path outside, or searches for one (`find`, `locate`) from the filesystem's root, a home
 * or a parent. A relative name is the workspace's own file.
 */
function reachesInstructionFile(command, { inside, bashTarget, isGuest }) {
  for (const { words } of simpleCommands(command)) {
    if (!words.some((word) => INSTRUCTION_NAME.test(word))) continue;
    for (const word of words) {
      if (!INSTRUCTION_NAME.test(word)) continue;
      if (word.startsWith("~") || word.startsWith("$HOME")) return true;
      const target = bashTarget(word);
      if (target !== null && !inside(target)) return true;
    }
    const { name, args } = program(words);
    if (name === "locate") return true;
    if (name === "find") {
      const start = args.find((arg) => !arg.startsWith("-")) ?? ".";
      if (start === "/" || start.startsWith("~") || start.startsWith("$HOME") || start.split("/").includes("..")) {
        return true;
      }
      if (path.isAbsolute(start) && !isGuest(start) && !inside(path.normalize(start))) return true;
    }
  }
  return false;
}

/**
 * The roots the run's tools could read: recorded on the run, or rebuilt from its resources for older runs, which kept
 * Freeflow's package and runtime bundles in the group's `resources/`, beside the arm directory.
 */
function readableRoots(run, armDirectory) {
  if (Array.isArray(run?.resources?.readableRoots)) return run.resources.readableRoots;
  const roots = typeof run?.workspace === "string" ? [run.workspace] : [];
  for (const entry of [...(run?.resources?.skills ?? []), ...(run?.resources?.context ?? [])]) {
    if (typeof entry?.path === "string") roots.push(entry.path);
  }
  if (armDirectory !== null) {
    const groupDirectory = path.dirname(armDirectory);
    const metadata = run?.resources?.freeflow?.metadata;
    if (typeof metadata === "string") roots.push(path.join(groupDirectory, path.dirname(metadata)));
    roots.push(path.join(groupDirectory, "resources", "runtime"));
  }
  return roots;
}

function lines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= DISTINCTIVE_LENGTH);
}

/** Whether a line could only be copied: long, several distinct words, and no import or require. */
function isDistinctive(line) {
  if (line.length < DISTINCTIVE_LENGTH || BOILERPLATE.test(line)) return false;
  return new Set(line.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []).size >= DISTINCTIVE_WORDS;
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
  const distinctive = (text) => [
    ...new Set(lines(text).filter((line) => isDistinctive(line) && !fixtureLines.has(line))),
  ];

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
        // Scattered shared lines are idioms any code for the task might write (start a server, read a response); a
        // copy is a block of consecutive lines, as in a copied test, or a large share of the file.
        const grader = distinctive(await textFile(file));
        const copied = grader.filter((line) => produced.has(line));
        let block = 0;
        let longest = 0;
        for (const line of grader) {
          block = produced.has(line) ? block + 1 : 0;
          longest = Math.max(longest, block);
        }
        if (longest >= GRADER_LINES || (copied.length >= GRADER_LINES && copied.length * 4 >= grader.length)) {
          flags.push(
            flagOf("answer-copy", `the subject's output contains lines of the hidden grader file ${source}`, {
              source,
              matched: copied.length,
              of: grader.length,
              consecutive: longest,
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
  const flags = await scanRun({ run, group, arm, root, directory, skipped });
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
    const stageDirectory = path.dirname(stored);
    for (const flag of await scanRun({ run: stageRun, group, arm, root, directory: stageDirectory, copies: false })) {
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
