// Reuse (E-1): a complete, canonical run can stand in for a new trial of the same arm when nothing that could
// change its behavior changed. Each such run is indexed in `<results>/index.jsonl` under a key over the group's
// task and inputs, the arm's effective configuration and inputs, the model, the host version and this
// evaluator's own source, whenever a canonical run completes. `--reuse` counts a matching run instead of running
// the arm again.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, cp, readdir, readFile, readlink, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { isSourceExtension } from "./build-source.mjs";
import { unclearedFlags } from "./scan.mjs";

const execFileAsync = promisify(execFile);
const SCRIPTS = fileURLToPath(new URL("../", import.meta.url));
export const INDEX_FILE = "index.jsonl";
// Group fields that describe arms rather than the task; each arm's effective configuration is hashed instead.
const ARM_FIELDS = new Set([
  "arms",
  "configuration",
  "configurations",
  "variants",
  "model",
  "files",
  "component",
  "reference",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** A content hash of a file or directory tree: relative paths, file bytes and link targets, in sorted order. */
export async function contentHash(target) {
  const hash = createHash("sha256");
  const visit = async (absolute, relative) => {
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOTDIR") {
        hash.update(`missing:${relative}\0`);
        return;
      }
      hash
        .update(`file:${relative}\0`)
        .update(await readFile(absolute))
        .update("\0");
      return;
    }
    hash.update(`dir:${relative}\0`);
    for (const entry of entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))) {
      const child = path.join(absolute, entry.name);
      const name = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) hash.update(`link:${name}\0${await readlink(child)}\0`);
      else await visit(child, name);
    }
  };
  await visit(target, "");
  return hash.digest("hex");
}

let evaluatorVersionPromise = null;

/** This evaluator's version: a content hash of its scripts directory, computed once per process. */
export function evaluatorVersion() {
  evaluatorVersionPromise ??= contentHash(SCRIPTS);
  return evaluatorVersionPromise;
}

async function gitCommit(root, ref) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], {
    cwd: root,
  });
  return stdout.trim();
}

/**
 * The reuse key of one arm of a loaded group. Working-tree inputs are identified by their content, and Git
 * sources (the arm's and Freeflow's) by the commit their ref resolves to, so a change anywhere else in the
 * repository does not invalidate a run.
 *
 * @param {{group: any, arm: string, root: string, hostVersion: string}} input
 */
export async function reuseKey({ group, arm, root, hostVersion }) {
  const task = Object.fromEntries(Object.entries(group).filter(([key]) => !ARM_FIELDS.has(key)));
  const groupInputs = [];
  if (typeof group.fixture === "string") groupInputs.push(group.fixture);
  for (const bundle of group.runtime?.extensions ?? []) groupInputs.push(...(bundle.resources ?? []));
  const inputHashes = {};
  for (const input of groupInputs) inputHashes[input] = await contentHash(path.resolve(root, input));
  // The first file is the group definition itself, already hashed by its parsed fields; the rest are files its
  // configuration extends and its command graders read.
  for (const file of (group.files ?? []).slice(1)) {
    inputHashes[path.relative(root, file).split(path.sep).join("/")] = await contentHash(file);
  }

  const variant = group.variants?.[arm];
  if (variant === undefined) throw new Error(`group ${group.id} has no arm ${arm}`);
  const armInputs = {};
  if (variant.source?.kind === "working-tree") {
    for (const entry of [...(variant.skills ?? []), ...(variant.context ?? [])]) {
      armInputs[entry] = await contentHash(path.resolve(root, entry));
    }
  } else if (variant.source?.kind === "git") {
    armInputs.source = await gitCommit(root, variant.source.ref);
  }
  if (variant.freeflow?.source?.ref) armInputs.freeflow = await gitCommit(root, variant.freeflow.source.ref);
  // Host extensions built from source: a working-tree directory by content, a Git source by its commit.
  for (const [index, extension] of (variant.hostExtensions ?? []).entries()) {
    if (!isSourceExtension(extension)) continue;
    armInputs[`hostExtensions.${index}`] =
      extension.source === undefined
        ? await contentHash(path.resolve(root, extension.path))
        : await gitCommit(root, extension.source.ref);
  }

  return sha256(
    canonicalJson({
      task: sha256(canonicalJson(task)),
      groupInputs: inputHashes,
      arm,
      configuration: sha256(canonicalJson(variant)),
      armInputs,
      model: variant.model ?? null,
      hostVersion,
      evaluator: await evaluatorVersion(),
    }),
  );
}

/** The index as a map from key to its entries, oldest first; an unreadable line is skipped. */
export async function readIndex(resultsDirectory) {
  const index = new Map();
  let text = "";
  try {
    text = await readFile(path.join(resultsDirectory, INDEX_FILE), "utf8");
  } catch {
    return index;
  }
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry?.key !== "string") continue;
      if (!index.has(entry.key)) index.set(entry.key, []);
      index.get(entry.key).push(entry);
    } catch {
      // A torn or foreign line never blocks the rest of the index.
    }
  }
  return index;
}

/** Appends index entries, one JSON line each. */
export async function appendIndex(resultsDirectory, entries) {
  if (entries.length === 0) return;
  await appendFile(
    path.join(resultsDirectory, INDEX_FILE),
    entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
  );
}

async function readJson(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The reuse state shared by every invocation of one run or aggregate: whether `--reuse` is on (only then does it
 * claim indexed runs; keys are computed either way, so new runs are indexed), the index as it stood when the run
 * began, each host's version, and the runs already reused, so none is reused twice.
 *
 * @param {{resultsDirectory: string, enabled: boolean, hostVersion: (host: string) => Promise<string | null>}} options
 */
export function createReuse({ resultsDirectory, enabled, hostVersion }) {
  let index = null;
  const versions = new Map();
  const used = new Set();
  const reused = [];
  return {
    enabled,
    resultsDirectory,
    reused,
    async hostVersion(host = "pi") {
      if (!versions.has(host)) versions.set(host, await hostVersion(host).catch(() => null));
      return versions.get(host);
    },
    async keyFor(group, arm, root) {
      const host = await this.hostVersion(group.host ?? group.runtime?.host ?? "pi");
      if (host === null) return null;
      return reuseKey({ group, arm, root, hostVersion: host });
    },
    /**
     * Claims an indexed run for this key that this run has not used, whose run is still complete, not held for
     * transcript flags no person has cleared, and whose group grade is still readable; null when there is none. The
     * claim happens before any wait, so parallel groups never claim the same run.
     */
    async claim(key) {
      if (!enabled || key === null) return null;
      index ??= readIndex(resultsDirectory);
      const entries = (await index).get(key) ?? [];
      for (const entry of entries) {
        const origin = `${entry.result}/${entry.group}/${entry.arm}`;
        if (used.has(origin)) continue;
        used.add(origin);
        const groupDirectory = path.join(resultsDirectory, entry.result, "groups", entry.group);
        const run = await readJson(path.join(groupDirectory, entry.arm, "run.json"));
        const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
        const summary = await readJson(path.join(resultsDirectory, entry.result, "summary.json"));
        if (run?.state !== "complete" || grade === null || grade.state === "grade-error") continue;
        // A held run counts toward nothing until a person clears its flags, so it cannot stand in for a new one.
        if ((await unclearedFlags(run, path.join(groupDirectory, entry.arm))).length > 0) continue;
        if (summary === null || summary.dryRun !== false) continue;
        return { ...entry, directory: path.join(groupDirectory, entry.arm) };
      }
      return null;
    },
  };
}

function remapPaths(value, from, to) {
  if (typeof value === "string") {
    return value === from || value.startsWith(`${from}${path.sep}`) ? `${to}${value.slice(from.length)}` : value;
  }
  if (Array.isArray(value)) return value.map((entry) => remapPaths(entry, from, to));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remapPaths(entry, from, to)]));
  }
  return value;
}

/**
 * Copies a claimed run's directory into the new trial and returns it as an in-memory run (transcripts read back,
 * paths moved to the copy), marked `reused` with where it came from, ready to grade and persist like a new run.
 */
export async function adoptRun(claimed, variantDirectory) {
  await rm(variantDirectory, { recursive: true, force: true });
  await cp(claimed.directory, variantDirectory, { recursive: true, verbatimSymlinks: true });
  const stored = await readJson(path.join(variantDirectory, "run.json"));
  if (stored === null) throw new Error(`reused run ${claimed.result}/${claimed.group}/${claimed.arm} is unreadable`);
  const transcript = JSON.parse(await readFile(path.join(variantDirectory, "transcript.json"), "utf8"));
  const run = remapPaths(stored, claimed.directory, variantDirectory);
  run.transcript = Array.isArray(transcript) ? transcript : [];
  if (Array.isArray(run.turns)) {
    run.turns = run.turns.map((turn) =>
      isPlainObject(turn.transcript) && turn.transcript.file === "transcript.json"
        ? { ...turn, transcript: run.transcript.slice(turn.transcript.start, turn.transcript.end) }
        : turn,
    );
  }
  delete run.artifacts;
  run.reused = { result: claimed.result, group: claimed.group, arm: claimed.arm, key: claimed.key };
  return run;
}
