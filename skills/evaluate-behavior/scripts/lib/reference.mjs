import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { referenceArm } from "./arms.mjs";
import { runCommandExpectation } from "./grade-command.mjs";
import { gradeDeterministic } from "./grade.mjs";
import { fingerprintDirectory, workspaceChanges } from "./sandbox.mjs";

const execFileAsync = promisify(execFile);

// Expectation kinds that grade a workspace or a command, which a reference solution can satisfy without a model.
// Interaction kinds (reads, responses, tool calls, context) need a transcript, so they are not checkable here.
const WORKSPACE_KINDS = new Set(["path", "changed-paths", "file-text", "json", "command"]);

/**
 * Validates `group.reference_solution` and returns a problem `{ code, message }`, or null when it is valid or absent.
 * Called from definitions.mjs; a reference must stay in the definition root and must not sit inside the fixture,
 * which the subject sees.
 */
export function validateReferenceSolution(value, { root, fixture }) {
  if (value === undefined) return null;
  const invalid = (message) => ({ code: "invalid-definition", message: `group.reference_solution ${message}` });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid("must be an object with exactly one of patch or files");
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || !["patch", "files"].includes(keys[0])) {
    return invalid("must declare exactly one of patch or files");
  }
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
 * Checks one group's reference against its own workspace and command expectations, with no model and no subject.
 * Returns `{ id, state, reason, checks }` where state is solvable, unsolvable or not-checkable.
 */
export async function checkGroupReference(group, { root, signal } = {}) {
  const base = { id: group.id };
  if (!group.reference_solution) return { ...base, state: "not-checkable", reason: "no reference_solution declared" };
  if (group.type !== "body") return { ...base, state: "not-checkable", reason: "reference checks need a body group" };

  const arm = referenceArm(group);
  const expectations = group.expectations.filter(
    (expectation) => expectation.variant === arm && WORKSPACE_KINDS.has(expectation.kind),
  );
  if (expectations.length === 0) {
    return {
      ...base,
      state: "not-checkable",
      reason: `no workspace or command expectation for the reference arm ${arm}`,
    };
  }

  const work = await mkdtemp(path.join(os.tmpdir(), "skill-eval-reference-"));
  try {
    const workspace = path.join(work, "workspace");
    const applied = await applyReference(group, { root, workspace });
    if (applied.error) return { ...base, state: "unsolvable", reason: applied.error, checks: [] };

    const run = {
      state: "complete",
      workspace,
      effects: { after: applied.after, changes: applied.changes },
      isolation: { root: path.join(work, "isolation") },
      postRun: { commands: {} },
    };
    for (const expectation of expectations) {
      if (expectation.kind !== "command") continue;
      run.postRun.commands[expectation.id] = await runCommandExpectation({
        expectation,
        run,
        root,
        directory: work,
        signal,
      });
    }

    // Comparisons compare arms, so the reference check drops them and grades each expectation on its own.
    const graded = {
      ...group,
      expectations: expectations.map(({ comparison: _comparison, ...expectation }) => expectation),
    };
    const result = await gradeDeterministic(graded, { [arm]: run }, {});
    const checks = result.checks;
    const failing = [
      ...checks.filter((check) => check.state === "fail").map((check) => `${check.id}: failed`),
      ...result.errors.map((error) => `${error.id ?? "system"}: ${error.reason}`),
    ];
    const unavailable = checks.filter((check) => check.state === "unavailable").map((check) => check.id);
    if (failing.length > 0) return { ...base, state: "unsolvable", reason: failing.join("; "), checks };
    if (unavailable.length > 0 || checks.length === 0) {
      const reason = unavailable.length > 0 ? `unavailable: ${unavailable.join(", ")}` : "no check could run";
      return { ...base, state: "not-checkable", reason, checks };
    }
    return { ...base, state: "solvable", reason: null, checks };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Checks every selected group that declares a reference; groups without one are reported as not checkable. */
export async function checkSelection(selection, { root, signal } = {}) {
  const results = [];
  for (const { group } of selection.groups) results.push(await checkGroupReference(group, { root, signal }));
  return results;
}

/**
 * Before any subject starts: checks each selected group's reference and records the result in its group
 * directory. An unsolvable reference refuses the run unless skip is set; the refusal names the failing graders.
 */
export async function enforceReferenceChecks(selection, { root, resultDirectory, skip = false, signal }) {
  for (const { group } of selection.groups) {
    if (!group.reference_solution) continue;
    const result = await checkGroupReference(group, { root, signal });
    const groupDirectory = path.join(resultDirectory, "groups", group.id);
    await mkdir(groupDirectory, { recursive: true });
    await writeFile(
      path.join(groupDirectory, "reference-check.json"),
      `${JSON.stringify({ ...result, skipped: skip && result.state === "unsolvable" }, null, 2)}\n`,
    );
    if (result.state === "unsolvable" && !skip) {
      throw new Error(
        `reference solution for ${group.id} does not solve the task: ${result.reason}; ` +
          "run skill-eval check-tasks for details, or pass --skip-reference-check",
      );
    }
  }
}

/**
 * Builds the reference workspace in `workspace`: copies the fixture, then applies the patch or overlays the files.
 * Returns the fingerprint evidence the workspace graders read, or an error string when the reference cannot apply.
 */
async function applyReference(group, { root, workspace }) {
  if (group.fixture !== null) {
    await cp(path.resolve(root, group.fixture), workspace, { recursive: true, dereference: false, force: false });
  } else {
    await mkdir(workspace, { recursive: true });
  }
  const before = await fingerprintDirectory(workspace);
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
  const after = await fingerprintDirectory(workspace);
  return { after, changes: workspaceChanges(before, after) };
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
