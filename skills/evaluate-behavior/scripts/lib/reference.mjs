import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { armNames } from "./arms.mjs";
import { runCommandExpectation } from "./grade-command.mjs";
import { gradeDeterministic } from "./grade.mjs";
import { fingerprintDirectory, WORKSPACE, workspaceChanges } from "./sandbox.mjs";
import { taskCopyGaps } from "./task-copy.mjs";

const execFileAsync = promisify(execFile);

// Expectation kinds that grade a workspace or a command, which a reference solution can satisfy without a model.
// Interaction kinds (reads, responses, tool calls, context) need a transcript, so they are not checkable here.
const WORKSPACE_KINDS = new Set(["path", "changed-paths", "file-text", "json", "command"]);
// States that refuse a run unless --skip-reference-check: the reference fails, or the task needs no change.
const REFUSED = new Set(["unsolvable", "already-solved"]);

/**
 * Validates `group.reference_solution` and returns a problem `{ code, message }`, or null when it is valid or absent.
 * Called from definitions.mjs; a reference must stay in the definition root and must not sit inside the fixture,
 * which the subject sees.
 */
export function validateReferenceSolution(value, { root, fixture, arms }) {
  if (value === undefined) return null;
  const invalid = (message) => ({ code: "invalid-definition", message: `group.reference_solution ${message}` });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid("must be an object with exactly one of patch or files");
  }
  const sources = Object.keys(value).filter((key) => key !== "arm");
  if (sources.length !== 1 || !["patch", "files"].includes(sources[0])) {
    return invalid("must declare exactly one of patch or files, and may also declare arm");
  }
  if (value.arm !== undefined && !(arms ?? []).includes(value.arm)) {
    return invalid(`arm must name one of group.arms: ${(arms ?? []).join(", ")}`);
  }
  const keys = sources;
  const declared = value[keys[0]];
  if (typeof declared !== "string" || declared === "") return invalid(`${keys[0]} must be a path string`);
  const normalized = path.normalize(declared);
  if (
    path.isAbsolute(declared) ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    return { code: "unsafe-path", message: `group.reference_solution.${keys[0]} must stay inside the definition root` };
  }
  const absolute = path.resolve(root, declared);
  if (fixture !== null && fixture !== undefined && isInside(path.resolve(root, fixture), absolute)) {
    return invalid(`${keys[0]} is inside the fixture, which the subject sees`);
  }
  return null;
}

/** The definition-root paths a reference reads, which a run counts as inputs (group.files). */
export function referenceFiles(group, root) {
  const reference = group.reference_solution;
  if (!reference) return [];
  const declared = reference.patch ?? reference.files;
  return [path.resolve(root, declared)];
}

/**
 * Checks one group's reference against its workspace and command expectations, with no model and no subject.
 * Every arm's applicable expectations are graded on the one reference workspace (arms share the fixture), unless
 * reference_solution.arm names one arm. The same graders also run on the unchanged fixture, which they must fail:
 * a task already solved before any change measures nothing. Command graders of an arm with a container environment
 * run in its image. Returns `{ id, state, reason, arms }`: solvable only when every checked arm passes on the
 * reference and fails before it; unsolvable when an arm fails on the reference; already-solved when an arm passes
 * on the unchanged fixture; not-checkable otherwise.
 */
export async function checkGroupReference(group, { root, signal } = {}) {
  const base = { id: group.id };
  if (!group.reference_solution) return { ...base, state: "not-checkable", reason: "no reference_solution declared" };
  if (group.type !== "body") return { ...base, state: "not-checkable", reason: "reference checks need a body group" };

  const arms = group.reference_solution.arm !== undefined ? [group.reference_solution.arm] : armNames(group);
  const byArm = arms
    .map((arm) => ({
      arm,
      container: group.variants?.[arm]?.shell?.container,
      expectations: group.expectations.filter(
        (expectation) => expectation.variant === arm && WORKSPACE_KINDS.has(expectation.kind),
      ),
    }))
    .filter((entry) => entry.expectations.length > 0);
  if (byArm.length === 0) {
    return { ...base, state: "not-checkable", reason: "no workspace or command expectation for any checked arm" };
  }
  const work = await mkdtemp(path.join(os.tmpdir(), "skill-eval-reference-"));
  try {
    const unready = await containerReadiness(group, byArm, work);
    if (unready !== null) return { ...base, ...unready };
    const applied = await applyReference(group, { root, workspace: path.join(work, "after", "workspace") });
    if (applied.error) return { ...base, state: "unsolvable", reason: applied.error, arms: [] };
    const after = await gradeWorkspace(group, byArm, { root, signal, directory: path.join(work, "after"), ...applied });
    const fixture = await copyFixture(group, { root, workspace: path.join(work, "before", "workspace") });
    const before = await gradeWorkspace(group, byArm, {
      root,
      signal,
      directory: path.join(work, "before"),
      ...fixture,
    });

    const armResults = byArm.map(({ arm }, index) => ({
      ...armOutcome(arm, after[index]),
      before: beforeOutcome(before[index], after[index]),
    }));
    const summarize = (entries, describe) => entries.map((entry) => `${entry.arm}: ${describe(entry)}`).join("; ");
    const unsolvable = armResults.filter((entry) => entry.state === "unsolvable");
    if (unsolvable.length > 0) {
      return { ...base, state: "unsolvable", reason: summarize(unsolvable, (entry) => entry.reason), arms: armResults };
    }
    const uncheckable = armResults.filter((entry) => entry.state === "not-checkable");
    if (uncheckable.length > 0) {
      return {
        ...base,
        state: "not-checkable",
        reason: summarize(uncheckable, (entry) => entry.reason),
        arms: armResults,
      };
    }
    const solved = armResults.filter((entry) => entry.before.state === "already-solved");
    if (solved.length > 0) {
      return {
        ...base,
        state: "already-solved",
        reason: summarize(solved, () => "every check already passes on the unchanged fixture"),
        arms: armResults,
      };
    }
    return { ...base, state: "solvable", reason: null, arms: armResults };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * For a container arm, the docker CLI, engine and image must be ready, and the engine must see `workspaceRoot`, where
 * the graded copies live; otherwise the task is not checkable here.
 */
async function containerReadiness(group, byArm, workspaceRoot) {
  for (const { arm, container, expectations } of byArm) {
    if (container === undefined || !expectations.some((expectation) => expectation.kind === "command")) continue;
    const { missingContainerPrerequisites } = await import("./container.mjs");
    const { packageManager, prerequisiteRefusal } = await import("./shell.mjs");
    const missing = await missingContainerPrerequisites(container, await packageManager(process.env), workspaceRoot);
    if (missing.length > 0) {
      return {
        state: "not-checkable",
        reason: prerequisiteRefusal(group.id, arm, group.variants[arm].shell, missing),
        missing,
      };
    }
  }
  return null;
}

/**
 * Runs each arm's command graders (in the arm's image when it declares a container) and grades its expectations on
 * one workspace. Comparisons compare arms, so the check drops them and grades each expectation on its own.
 */
async function gradeWorkspace(group, byArm, { root, signal, directory, after, changes }) {
  const run = {
    state: "complete",
    workspace: path.join(directory, "workspace"),
    effects: { after, changes },
    isolation: { root: path.join(directory, "isolation") },
    postRun: { commands: {} },
  };
  const results = [];
  for (const { arm, container, expectations } of byArm) {
    for (const expectation of expectations) {
      if (expectation.kind !== "command") continue;
      run.postRun.commands[expectation.id] = await runCommandExpectation({
        expectation,
        run,
        root,
        directory,
        signal,
        container,
      });
    }
    const graded = {
      ...group,
      expectations: expectations.map(({ comparison: _comparison, ...expectation }) => expectation),
    };
    results.push(await gradeDeterministic(graded, { [arm]: run }, {}));
  }
  return results;
}

/**
 * The same graders on the unchanged fixture. They must not all pass; for test graders, each required test that
 * fails before and passes on the reference is fail-to-pass, and one that passes both times is pass-to-pass.
 */
function beforeOutcome(before, after) {
  const checks = before.checks.map(({ id, state }) => ({ id, state }));
  const solved =
    before.errors.length === 0 && before.checks.length > 0 && before.checks.every((check) => check.state === "pass");
  const tests = {};
  for (const check of before.checks) {
    const required = check.observed?.tests?.required;
    if (!Array.isArray(required)) continue;
    const afterRequired = after.checks.find((entry) => entry.id === check.id)?.observed?.tests?.required ?? [];
    const passedAfter = new Set(afterRequired.filter((entry) => entry.state === "pass").map((entry) => entry.name));
    tests[check.id] = {
      failToPass: required
        .filter((entry) => entry.state !== "pass" && passedAfter.has(entry.name))
        .map((entry) => entry.name),
      passToPass: required
        .filter((entry) => entry.state === "pass" && passedAfter.has(entry.name))
        .map((entry) => entry.name),
    };
  }
  return { state: solved ? "already-solved" : "fails-before", checks, tests };
}

/** One arm's outcome: unsolvable on a failed check or grader error, not-checkable when a check could not run. */
function armOutcome(arm, result) {
  const checks = result.checks;
  const failing = [
    ...checks.filter((check) => check.state === "fail").map((check) => `${check.id}: failed`),
    ...result.errors.map((error) => `${error.id ?? "system"}: ${error.reason}`),
  ];
  if (failing.length > 0) return { arm, state: "unsolvable", reason: failing.join("; "), checks };
  const unavailable = checks.filter((check) => check.state === "unavailable").map((check) => check.id);
  if (unavailable.length > 0)
    return { arm, state: "not-checkable", reason: `unavailable: ${unavailable.join(", ")}`, checks };
  if (checks.length === 0) return { arm, state: "not-checkable", reason: "no check could run", checks };
  return { arm, state: "solvable", reason: null, checks };
}

/**
 * Checks every selected group that declares a reference (groups without one are reported as not checkable), and
 * lists for every group what its task copy lacks against the original setting (`copy`, from task-copy.mjs).
 */
export async function checkSelection(selection, { root, signal } = {}) {
  const results = [];
  for (const { group } of selection.groups) {
    const result = await checkGroupReference(group, { root, signal });
    results.push({ ...result, copy: await taskCopyGaps(group, { root }) });
  }
  return results;
}

/**
 * Before any subject starts: checks each selected group's reference and records the result in its group
 * directory. An unsolvable or already-solved task refuses the run unless skip is set; the refusal names why.
 */
export async function enforceReferenceChecks(selection, { root, resultDirectory, skip = false, signal }) {
  for (const { group } of selection.groups) {
    if (!group.reference_solution) continue;
    const result = await checkGroupReference(group, { root, signal });
    const groupDirectory = path.join(resultDirectory, "groups", group.id);
    await mkdir(groupDirectory, { recursive: true });
    await writeFile(
      path.join(groupDirectory, "reference-check.json"),
      `${JSON.stringify({ ...result, skipped: skip && REFUSED.has(result.state) }, null, 2)}\n`,
    );
    if (REFUSED.has(result.state) && !skip) {
      // Named with its file, so a suite with many groups shows which one to fix.
      const task = `${group.id} (${path.relative(root, group.files[0])})`;
      const problem =
        result.state === "unsolvable"
          ? `reference solution for ${task} does not solve the task`
          : `task ${task} is already solved before any change, so it cannot show one`;
      throw new Error(
        `${problem}: ${result.reason}; run skill-eval check-tasks for details, or pass --skip-reference-check`,
      );
    }
  }
}

/**
 * Builds the reference workspace in `workspace`: copies the fixture, then applies the patch or overlays the files.
 * Returns the fingerprint evidence the workspace graders read, or an error string when the reference cannot apply.
 */
async function applyReference(group, { root, workspace }) {
  const { after: before } = await copyFixture(group, { root, workspace });
  const reference = group.reference_solution;
  if (reference.patch !== undefined) {
    const patch = path.resolve(root, reference.patch);
    try {
      await execFileAsync("git", ["apply", patch], { cwd: workspace });
    } catch (error) {
      const detail = String(error?.stderr ?? error?.message ?? error).trim();
      return { error: `the reference patch does not apply to the fixture: ${detail}` };
    }
  } else {
    const source = path.resolve(root, reference.files);
    if (!(await stat(source).catch(() => null))?.isDirectory()) {
      return { error: `reference files is not a directory: ${reference.files}` };
    }
    try {
      await overlay(source, workspace);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  const after = await fingerprintDirectory(workspace, WORKSPACE);
  return { after, changes: workspaceChanges(before, after) };
}

/** Copies the fixture into `workspace` unchanged; the evidence shows no change. */
async function copyFixture(group, { root, workspace }) {
  if (group.fixture !== null) {
    await cp(path.resolve(root, group.fixture), workspace, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      force: false,
    });
  } else {
    await mkdir(workspace, { recursive: true });
  }
  const after = await fingerprintDirectory(workspace, WORKSPACE);
  return { after, changes: workspaceChanges(after, after) };
}

/** Copies a directory tree over the workspace. Symbolic links and other special entries are refused. */
async function overlay(source, destination) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await overlay(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    } else {
      throw new Error(`reference files may contain only regular files and directories: ${entry.name}`);
    }
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
