import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const VARIANTS = ["baseline", "candidate"];
export const RESPONSE_EXPECTATIONS = new Set(["contains", "not-contains", "equals"]);

export function hasOwn(value, key) {
  return Object.getOwnPropertyDescriptor(value, key) !== undefined;
}

export function validBodyExpectation(group, expectation, turn) {
  return group.type === "body" && VARIANTS.includes(expectation.variant) && validTurn(group, turn);
}

export function validTurn(group, turn) {
  if (turn === null) return true;
  const declaredTurnCount = group.input.prompt === undefined ? group.input.turns.length : 1;
  return Number.isInteger(turn) && turn >= 1 && turn <= declaredTurnCount;
}

export function completedCheck(expectation, expected, observed, passed) {
  return {
    id: expectation.id,
    kind: expectation.kind,
    variant: expectation.variant,
    state: passed ? "pass" : "fail",
    expected,
    observed,
  };
}

export function unavailableCheck(expectation, expected) {
  return {
    id: expectation.id,
    kind: expectation.kind,
    variant: expectation.variant,
    state: "unavailable",
    expected,
    observed: null,
  };
}

export function workspaceEvidence(run, turn) {
  if (turn === null || (!Array.isArray(run.turns) && turn === 1)) {
    if (!run.workspace || !Array.isArray(run.effects?.after)) return null;
    return { root: run.workspace, files: run.effects.after, changes: run.effects.changes ?? null };
  }
  const observedTurn = run.turns?.find((entry) => entry.turn === turn);
  if (!observedTurn?.workspace?.path || !Array.isArray(observedTurn.workspace.files)) return null;
  return {
    root: observedTurn.workspace.path,
    files: observedTurn.workspace.files,
    changes: observedTurn.workspace.changes ?? null,
  };
}

export function readPaths(run, turn) {
  if (turn === null) {
    if (Array.isArray(run.turns)) {
      return run.turns.flatMap((entry) => (Array.isArray(entry.successfulReadPaths) ? entry.successfulReadPaths : []));
    }
    return Array.isArray(run.successfulReadPaths) ? run.successfulReadPaths : [];
  }
  if (!Array.isArray(run.turns)) {
    return turn === 1 && Array.isArray(run.successfulReadPaths) ? run.successfulReadPaths : null;
  }
  const observedTurn = run.turns.find((entry) => entry.turn === turn);
  return observedTurn && Array.isArray(observedTurn.successfulReadPaths) ? observedTurn.successfulReadPaths : null;
}

export function textMatches(expect, value, text) {
  if (expect === "contains") return text.includes(value);
  if (expect === "not-contains") return !text.includes(value);
  return text === value;
}

export function validPathArray(value) {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && isSafeRelativePath(entry)) &&
    new Set(value).size === value.length
  );
}

export async function readWorkspaceFile(workspace, relativePath) {
  const entry = workspace.files.find((file) => file.path === relativePath);
  if (!entry) return { state: "missing", sha256: null };
  if (entry.type !== undefined && entry.type !== "file") {
    throw new Error(`file assertion requires a regular file: ${relativePath}`);
  }

  const root = await realpath(workspace.root);
  const declaredPath = path.resolve(root, relativePath);
  const declaredStat = await lstat(declaredPath);
  if (declaredStat.isSymbolicLink()) {
    throw new Error(`file assertion requires a regular file: ${relativePath}`);
  }
  const file = await realpath(declaredPath);
  if (!isContained(root, file)) throw new Error(`workspace evidence path escapes its root: ${relativePath}`);
  const contents = await readFile(file);
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== entry.sha256) throw new Error(`workspace evidence changed after capture: ${relativePath}`);
  return { state: "present", sha256: actualHash, text: contents.toString("utf8") };
}

export function isSafeRelativePath(value) {
  return (
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

export function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
