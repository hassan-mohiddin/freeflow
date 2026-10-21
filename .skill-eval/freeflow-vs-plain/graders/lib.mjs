// Shared grader helpers for the freeflow-vs-plain suite. Graders run in the task's image on a copy of the final
// workspace, as the working directory, with the project's Git history at the image's GIT_DIR (HEAD is the fixture as
// the subject received it). Nothing here reaches the network.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const root = process.cwd();
export const read = (path, base = root) => readFileSync(join(base, path), "utf8");
export const has = (path, base = root) => existsSync(join(base, path));

// Files the graders and the harness add, which are never the subject's work.
const HARNESS = /^(?:\.fvp-|\.freeflow\/)|(?:^|\/)(?:__pycache__|node_modules)\//;
// A test file: anything under a test or tests folder, or named *.test.* / *_test.* / test_*.py.
const TEST_FILE = /(?:^|\/)tests?\/|\.test\.[cm]?js$|_test\.py$|(?:^|\/)test_[^/]*\.py$/;

export function run(command, args, options = {}) {
  // A test runner started from inside a test would report to this one instead of exiting with its own status.
  const env = { ...(options.env ?? process.env) };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60_000, ...options, env });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function git(args) {
  const result = run("git", args, { cwd: root });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/** A file's text at a revision, or null when it does not exist there. */
export function fileAt(revision, path) {
  const result = run("git", ["show", `${revision}:${path}`], { cwd: root });
  return result.status === 0 ? result.stdout : null;
}

/** The test files the project had at HEAD. */
export function headTestFiles() {
  return git(["ls-tree", "-r", "--name-only", "HEAD"])
    .split("\n")
    .filter((path) => path && TEST_FILE.test(path) && isTestScript(path));
}

/** Paths the subject added or changed since HEAD, with deletions, harness files left out. */
export function changedPaths() {
  const lines = git(["status", "--porcelain", "--untracked-files=all"]).split("\n").filter(Boolean);
  return lines
    .map((line) => {
      const path = line.slice(3);
      return { status: line.slice(0, 2), path: path.includes(" -> ") ? path.split(" -> ")[1] : path };
    })
    .map(({ status, path }) => ({ status, path: path.replace(/^"|"$/g, "") }))
    .filter(({ path }) => !HARNESS.test(path));
}

/** Test scripts the subject added or changed (not deleted). */
export function changedTestFiles() {
  return changedPaths()
    .filter(({ status, path }) => !status.includes("D") && TEST_FILE.test(path) && isTestScript(path))
    .map(({ path }) => path);
}

// A runnable test script: JavaScript, or a Python file unittest would discover (test_*.py or *_test.py).
function isTestScript(path) {
  return /\.[cm]?js$/.test(path) || /(?:^|\/)test_[^/]*\.py$|_test\.py$/.test(path);
}

/** A fresh copy of the project at a revision, in a temporary directory. */
export function treeAt(revision) {
  const directory = mkdtempSync(join(tmpdir(), "fvp-tree-"));
  const archive = run("sh", ["-c", `git archive --format=tar "$1" | tar -x -C "$2"`, "sh", revision, directory], {
    cwd: root,
  });
  if (archive.status !== 0) throw new Error(`could not extract ${revision}: ${archive.stderr}`);
  return directory;
}

/** A fresh copy of the final workspace, harness files included. */
export function workspaceCopy() {
  const directory = mkdtempSync(join(tmpdir(), "fvp-work-"));
  cpSync(root, directory, { recursive: true });
  return directory;
}

export function remove(directory) {
  rmSync(directory, { recursive: true, force: true });
}

/** Copies files from the final workspace into another tree, at the same paths. */
export function overlay(directory, paths) {
  for (const path of paths) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    cpSync(join(root, path), join(directory, path));
  }
}

/** Writes each file's text at a revision into a tree, at the same path. */
export function restore(directory, revision, paths) {
  for (const path of paths) {
    const text = fileAt(revision, path);
    if (text === null) continue;
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
}

/** Runs test files in a tree with the project's own runner: node --test, or Python's unittest. */
export function runTests(directory, files) {
  const python = files.filter((path) => path.endsWith(".py"));
  const node = files.filter((path) => !path.endsWith(".py"));
  const results = [];
  if (node.length > 0) results.push(run("node", ["--test", ...node], { cwd: directory }));
  for (const path of python) {
    const folder = dirname(path) === "." ? "." : dirname(path);
    const pattern = path.split("/").pop();
    results.push(
      run("python3", ["-m", "unittest", "discover", "-s", folder, "-p", pattern, "-t", "."], { cwd: directory }),
    );
  }
  return {
    status: results.every((result) => result.status === 0) ? 0 : 1,
    output: results.map((result) => result.stdout + result.stderr).join("\n"),
  };
}

/**
 * The project's tests as they were at HEAD, run against the final source: they must still pass. A subject that
 * changed or deleted a test to make it pass does not escape them.
 */
export function headTestsPassOnFinalSource() {
  const directory = workspaceCopy();
  try {
    const files = headTestFiles();
    restore(directory, "HEAD", files);
    return runTests(directory, files);
  } finally {
    remove(directory);
  }
}

/** Loads a module from the final workspace by path, fresh. */
export async function load(path) {
  return import(`${join(root, path)}?v=${Date.now()}-${Math.random()}`);
}

/** Runs a Python expression's JSON output in the final workspace, with the project's folder on the import path. */
export function python(script) {
  const result = run("python3", ["-c", `import json, sys\nsys.path.insert(0, ".")\n${script}`], { cwd: root });
  if (result.status !== 0) throw new Error(result.stderr || `python exited ${result.status}`);
  return JSON.parse(result.stdout);
}
