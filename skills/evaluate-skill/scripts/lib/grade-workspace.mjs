import { isDeepStrictEqual } from "node:util";

import {
  compareText,
  completedCheck,
  hasOwn,
  isSafeRelativePath,
  readWorkspaceFile,
  RESPONSE_EXPECTATIONS,
  textMatches,
  unavailableCheck,
  validBodyExpectation,
  validPathArray,
  workspaceEvidence,
} from "./grade-support.mjs";

const JSON_EXPECTATIONS = new Set([
  "available",
  "missing",
  "valid",
  "malformed",
  "field-present",
  "field-absent",
  "field-equals",
]);

export async function gradePath(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  if (
    !validBodyExpectation(group, expectation, turn) ||
    !["exists", "absent"].includes(expectation.expect) ||
    typeof expectation.path !== "string" ||
    !isSafeRelativePath(expectation.path)
  ) {
    return { error: "invalid path expectation" };
  }
  const expected = { expect: expectation.expect, path: expectation.path, turn };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const workspace = workspaceEvidence(run, turn);
  if (workspace === null) return unavailableCheck(expectation, expected);
  const entry = workspace.files.find((file) => file.path === expectation.path);
  const observed = {
    path: expectation.path,
    state: entry ? "present" : "missing",
    type: entry ? (entry.type ?? "file") : null,
    turn,
  };
  return completedCheck(
    expectation,
    expected,
    observed,
    expectation.expect === "exists" ? observed.state === "present" : observed.state === "missing",
  );
}

export async function gradeChangedPaths(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  if (
    !validBodyExpectation(group, expectation, turn) ||
    !["equals", "excludes"].includes(expectation.expect) ||
    !validPathArray(expectation.paths)
  ) {
    return { error: "invalid changed-paths expectation" };
  }
  const expectedPaths = [...expectation.paths].sort(compareText);
  const expected = { expect: expectation.expect, paths: expectedPaths, turn };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const workspace = workspaceEvidence(run, turn);
  if (workspace === null || workspace.changes === null) return unavailableCheck(expectation, expected);
  const actual = [...workspace.changes.created, ...workspace.changes.modified, ...workspace.changes.deleted].sort(
    compareText,
  );
  const matches =
    expectation.expect === "equals"
      ? isDeepStrictEqual(actual, expectedPaths)
      : expectedPaths.every((entry) => !actual.includes(entry));
  return completedCheck(expectation, expected, { paths: actual, turn }, matches);
}

export async function gradeFileText(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  if (
    !validBodyExpectation(group, expectation, turn) ||
    !RESPONSE_EXPECTATIONS.has(expectation.expect) ||
    typeof expectation.value !== "string" ||
    typeof expectation.path !== "string" ||
    !isSafeRelativePath(expectation.path)
  ) {
    return { error: "invalid file-text expectation" };
  }
  const expected = { expect: expectation.expect, path: expectation.path, value: expectation.value, turn };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const workspace = workspaceEvidence(run, turn);
  if (workspace === null) return unavailableCheck(expectation, expected);
  const file = await readWorkspaceFile(workspace, expectation.path);
  const observed = {
    path: expectation.path,
    file: file.state,
    sha256: file.sha256,
    turn,
  };
  const matches = file.state === "present" && textMatches(expectation.expect, expectation.value, file.text);
  return completedCheck(expectation, expected, observed, matches);
}

export async function gradeJson(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  if (!validJsonExpectation(group, expectation, turn)) return { error: "invalid json expectation" };

  const expected = {
    expect: expectation.expect,
    path: expectation.path,
    pointer: typeof expectation.pointer === "string" ? expectation.pointer : null,
    value: hasOwn(expectation, "value") ? expectation.value : null,
    turn,
  };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const workspace = workspaceEvidence(run, turn);
  if (workspace === null) return unavailableCheck(expectation, expected);
  const file = await readWorkspaceFile(workspace, expectation.path);
  const observed = jsonObservation(file, expectation.pointer);
  return completedCheck(expectation, expected, observed, jsonMatches(expectation, observed));
}

function validJsonExpectation(group, expectation, turn) {
  const fieldExpectation = ["field-present", "field-absent", "field-equals"].includes(expectation.expect);
  return (
    validBodyExpectation(group, expectation, turn) &&
    typeof expectation.path === "string" &&
    isSafeRelativePath(expectation.path) &&
    JSON_EXPECTATIONS.has(expectation.expect) &&
    (!fieldExpectation || isJsonPointer(expectation.pointer)) &&
    (expectation.expect !== "field-equals" || hasOwn(expectation, "value"))
  );
}

function jsonObservation(file, pointer) {
  if (file.state === "missing") {
    return { file: "missing", sha256: null, parse: "unavailable", field: "unavailable", value: null };
  }
  let value;
  try {
    value = JSON.parse(file.text);
  } catch {
    return { file: "present", sha256: file.sha256, parse: "malformed", field: "unavailable", value: null };
  }
  if (typeof pointer !== "string") {
    return { file: "present", sha256: file.sha256, parse: "valid", field: "unavailable", value: null };
  }
  const field = jsonPointer(value, pointer);
  return {
    file: "present",
    sha256: file.sha256,
    parse: "valid",
    field: field.present ? "present" : "absent",
    value: field.present ? field.value : null,
  };
}

function jsonMatches(expectation, observed) {
  if (expectation.expect === "available") return observed.file === "present";
  if (expectation.expect === "missing") return observed.file === "missing";
  if (expectation.expect === "valid") return observed.parse === "valid";
  if (expectation.expect === "malformed") return observed.parse === "malformed";
  if (expectation.expect === "field-present") return observed.field === "present";
  if (expectation.expect === "field-absent") return observed.field === "absent";
  return observed.field === "present" && isDeepStrictEqual(observed.value, expectation.value);
}

function jsonPointer(value, pointer) {
  let current = value;
  if (pointer === "") return { present: true, value: current };
  for (const token of pointer.slice(1).split("/").map(decodePointerToken)) {
    if (typeof current !== "object" || current === null || !hasOwn(current, token)) {
      return { present: false, value: null };
    }
    current = current[token];
  }
  return { present: true, value: current };
}

function decodePointerToken(token) {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function isJsonPointer(value) {
  return typeof value === "string" && (value === "" || (value.startsWith("/") && !/~(?:[^01]|$)/.test(value)));
}
