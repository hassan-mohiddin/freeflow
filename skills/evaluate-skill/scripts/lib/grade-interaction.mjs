import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
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
const TOOL_CALL_EXPECTATIONS = new Set(["called", "succeeded", "failed", "not-called"]);
const CONTEXT_TEXT_EXPECTATIONS = new Set(["contains", "not-contains", "equals"]);
const CONTEXT_SURFACES = new Set(["system-prompt", "provider-context"]);
const CONTEXT_REQUEST_SELECTORS = new Set(["first", "last"]);

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

export async function gradeContextText(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  const surface = expectation.surface ?? "system-prompt";
  const request = expectation.request ?? "last";
  if (
    !validBodyExpectation(group, expectation, turn) ||
    !CONTEXT_SURFACES.has(surface) ||
    (!CONTEXT_REQUEST_SELECTORS.has(request) && !Number.isInteger(request)) ||
    (Number.isInteger(request) && request < 1) ||
    !CONTEXT_TEXT_EXPECTATIONS.has(expectation.expect) ||
    typeof expectation.value !== "string"
  ) {
    return { error: "invalid context-text expectation" };
  }

  const expected = { expect: expectation.expect, value: expectation.value, surface, request, turn };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const observed = await contextObservation(run, turn, surface, request);
  if (observed === null) return unavailableCheck(expectation, expected);
  const passed = textMatches(expectation.expect, expectation.value, observed.text);
  return completedCheck(expectation, expected, compactContextObservation(observed, passed), passed);
}

export async function gradeToolCall(group, runs, expectation) {
  const turn = expectation.turn ?? null;
  const contains = expectation.argumentContains ?? [];
  const notContains = expectation.argumentNotContains ?? [];
  if (
    !validBodyExpectation(group, expectation, turn) ||
    typeof expectation.tool !== "string" ||
    expectation.tool.trim() === "" ||
    !TOOL_CALL_EXPECTATIONS.has(expectation.expect) ||
    !Array.isArray(contains) ||
    !contains.every((value) => typeof value === "string") ||
    !Array.isArray(notContains) ||
    !notContains.every((value) => typeof value === "string")
  ) {
    return { error: "invalid tool-call expectation" };
  }

  const expected = {
    tool: expectation.tool,
    expect: expectation.expect,
    turn,
    argumentContains: contains,
    argumentNotContains: notContains,
  };
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);

  const calls = toolCalls(run, turn).filter((call) => call.toolName === expectation.tool);
  const matchingCalls = calls.filter((call) => {
    const argumentsText = JSON.stringify(call.args ?? null);
    return (
      contains.every((value) => argumentsText.includes(value)) &&
      notContains.every((value) => !argumentsText.includes(value))
    );
  });
  const succeededCalls = matchingCalls.filter((call) => call.completed === true && call.isError !== true);
  const failedCalls = matchingCalls.filter((call) => call.completed === true && call.isError === true);
  let passed;
  if (expectation.expect === "called") {
    passed = matchingCalls.length > 0;
  } else if (expectation.expect === "succeeded") {
    passed = succeededCalls.length > 0;
  } else if (expectation.expect === "failed") {
    passed = failedCalls.length > 0;
  } else if (contains.length > 0 || notContains.length > 0) {
    passed = matchingCalls.length === 0;
  } else {
    passed = calls.length === 0;
  }
  const observed = {
    tool: expectation.tool,
    turn,
    callCount: calls.length,
    matchingCallCount: matchingCalls.length,
    succeededCount: succeededCalls.length,
    failedCount: failedCalls.length,
    calls: calls.map((call) => ({
      args: call.args ?? null,
      completed: call.completed ?? null,
      isError: call.isError ?? null,
    })),
  };
  return completedCheck(expectation, expected, observed, passed);
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

function compactContextObservation(observation, matched) {
  return {
    surface: observation.surface,
    turn: observation.turn,
    request: observation.request,
    characters: observation.characters,
    sha256: createHash("sha256").update(observation.text, "utf8").digest("hex"),
    matched,
    preview: observation.text.slice(0, 240),
  };
}

async function contextObservation(run, turn, surface, request) {
  const observations = await loadContextObservations(run);
  if (observations === null) return null;
  const matching = observations.filter((entry) => entry.surface === surface);
  const inTurn = turn === null ? matching : matching.filter((entry) => entry.turn === turn);
  if (inTurn.length === 0) return null;
  let observation;
  if (request === "first") observation = inTurn[0];
  else if (request === "last") observation = inTurn.at(-1);
  else observation = inTurn.find((entry) => (entry.requestInTurn ?? 1) === request);
  const text = surface === "system-prompt" ? (observation?.text ?? observation?.systemPrompt) : observation?.text;
  if (!observation || typeof text !== "string") return null;
  return {
    surface,
    turn: observation.turn ?? turn,
    request: observation.requestInTurn ?? 1,
    characters: observation.characters ?? text.length,
    text,
  };
}

async function loadContextObservations(run) {
  const artifact = run.contextObservationArtifact;
  if (!artifact || typeof artifact.path !== "string" || typeof artifact.sha256 !== "string") return null;
  const contents = await readFile(artifact.path, "utf8");
  const actualHash = createHash("sha256").update(contents, "utf8").digest("hex");
  if (actualHash !== artifact.sha256) throw new Error("context observation artifact changed after run persistence");
  const observations = [];
  for (const line of contents.split("\n").filter(Boolean)) {
    try {
      observations.push(JSON.parse(line));
    } catch (error) {
      throw new Error(
        `context observation artifact is malformed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return observations;
}

function toolCalls(run, turn) {
  if (turn === null) {
    if (Array.isArray(run.turns)) return run.turns.flatMap((entry) => entry.toolActivity ?? []);
    return Array.isArray(run.toolActivity) ? run.toolActivity : [];
  }
  if (!Array.isArray(run.turns)) return turn === 1 && Array.isArray(run.toolActivity) ? run.toolActivity : [];
  return run.turns.find((entry) => entry.turn === turn)?.toolActivity ?? [];
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
