import { realpath } from "node:fs/promises";
import path from "node:path";

import {
  completedCheck,
  hasOwn,
  isContained,
  isSafeRelativePath,
  readPaths,
  RESPONSE_EXPECTATIONS,
  textMatches,
  unavailableCheck,
  validBodyExpectation,
  validTurn,
  VARIANTS,
} from "./grade-support.mjs";

const ACTIVATION_EXPECTATIONS = new Set(["never", "on-turn", "by-turn", "not-before-turn"]);

export async function gradeSkillRead(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  const timingExpectation = expectation.expect !== "never";
  if (
    group.type !== "description" ||
    !VARIANTS.includes(expectation.variant) ||
    !ACTIVATION_EXPECTATIONS.has(expectation.expect) ||
    (timingExpectation ? turn === null || !validTurn(group, turn) : hasOwn(expectation, "turn"))
  ) {
    return { error: "invalid skill-read expectation" };
  }

  const expected = { read: expectation.expect, turn };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);

  const observed = {
    targetRead: run.activation.targetRead,
    firstReadTurn: run.activation.firstReadTurn,
    readTurns: run.activation.readTurns,
  };
  return completedCheck(expectation, expected, observed, activationMatches(expectation, observed));
}

export async function gradeResourceRead(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  const indexed = expectation.resource === "skill" || expectation.resource === "context";
  if (
    !VARIANTS.includes(expectation.variant) ||
    !["workspace", "skill", "context"].includes(expectation.resource) ||
    !["read", "not-read"].includes(expectation.expect) ||
    typeof expectation.path !== "string" ||
    !isSafeRelativePath(expectation.path) ||
    !validTurn(group, turn) ||
    (indexed && (!Number.isInteger(expectation.index) || expectation.index < 0)) ||
    (!indexed && hasOwn(expectation, "index"))
  ) {
    return { error: "invalid resource-read expectation" };
  }
  const expected = {
    expect: expectation.expect,
    resource: expectation.resource,
    index: indexed ? expectation.index : null,
    path: expectation.path,
    turn,
  };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const reads = readPaths(run, turn);
  if (reads === null) return unavailableCheck(expectation, expected);

  const resources = /** @type {any} */ (run.resources);
  let resource = null;
  if (expectation.resource === "skill") resource = resources?.skills?.[expectation.index];
  if (expectation.resource === "context") resource = resources?.context?.[expectation.index];
  const root = expectation.resource === "workspace" ? run.workspace : resource?.path;
  if (typeof root !== "string") return { error: "declared resource is unavailable" };
  if (resource !== null && !resource.files?.some((file) => file.path === expectation.path)) {
    return { error: "declared resource path is unavailable" };
  }

  const canonicalRoot = await realpath(root);
  const declaredPath = path.resolve(canonicalRoot, expectation.path);
  const canonicalPath = await realpath(declaredPath).catch(() => declaredPath);
  if (!isContained(canonicalRoot, canonicalPath)) return { error: "resource-read path escapes its declared root" };
  if (
    expectation.resource === "workspace" &&
    !run.effects?.before?.some((file) => file.path === expectation.path) &&
    !run.effects?.after?.some((file) => file.path === expectation.path) &&
    !reads.includes(canonicalPath)
  ) {
    return { error: "declared workspace resource path is unavailable" };
  }

  const observed = { path: canonicalPath, read: reads.includes(canonicalPath), turn };
  return completedCheck(
    expectation,
    expected,
    observed,
    expectation.expect === "read" ? observed.read : !observed.read,
  );
}

export async function gradeResponseText(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  if (
    !validBodyExpectation(group, expectation, turn) ||
    !RESPONSE_EXPECTATIONS.has(expectation.expect) ||
    typeof expectation.value !== "string"
  ) {
    return { error: "invalid response-text expectation" };
  }

  const expected = { expect: expectation.expect, value: expectation.value, turn };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const observed = responseObservation(run, turn);
  if (observed === null) return unavailableCheck(expectation, expected);
  return completedCheck(
    expectation,
    expected,
    observed,
    textMatches(expectation.expect, expectation.value, observed.response),
  );
}

function activationMatches(expectation, observed) {
  if (expectation.expect === "never") return !observed.targetRead;
  if (!Number.isInteger(expectation.turn) || expectation.turn < 1) return false;
  if (expectation.expect === "on-turn") return observed.readTurns.includes(expectation.turn);
  if (expectation.expect === "by-turn") {
    return observed.firstReadTurn !== null && observed.firstReadTurn <= expectation.turn;
  }
  return observed.firstReadTurn === null || observed.firstReadTurn >= expectation.turn;
}

function responseObservation(run, turn) {
  if (turn === null) {
    const observedTurn = Array.isArray(run.turns) && run.turns.length > 0 ? run.turns.at(-1).turn : 1;
    return { response: typeof run.response === "string" ? run.response : "", turn: observedTurn };
  }
  if (!Array.isArray(run.turns)) {
    if (turn !== 1) return null;
    return { response: typeof run.response === "string" ? run.response : "", turn };
  }
  const observedTurn = run.turns.find((entry) => entry.turn === turn);
  if (!observedTurn) return null;
  return { response: observedTurn.response ?? "", turn };
}
