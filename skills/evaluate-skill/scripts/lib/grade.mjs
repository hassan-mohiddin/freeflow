const VARIANTS = ["baseline", "candidate"];
const EXPECTATIONS = new Set(["never", "on-turn", "by-turn", "not-before-turn"]);

export function gradeDeterministic(group, runs, evidence) {
  /** @type {any[]} */
  const checks = [];
  /** @type {any[]} */
  const errors = [];

  for (const expectation of group.expectations) {
    if (expectation.kind === "skill-read") {
      if (
        group.type !== "description" ||
        !VARIANTS.includes(expectation.variant) ||
        !EXPECTATIONS.has(expectation.expect)
      ) {
        errors.push({ id: expectation.id, reason: "invalid skill-read expectation" });
        continue;
      }

      const run = runs[expectation.variant];
      if (!run || run.state !== "complete") {
        checks.push({
          id: expectation.id,
          kind: expectation.kind,
          variant: expectation.variant,
          state: "unavailable",
          expected: expectedValue(expectation),
          observed: null,
        });
        continue;
      }

      const observed = {
        targetRead: run.activation.targetRead,
        firstReadTurn: run.activation.firstReadTurn,
        readTurns: run.activation.readTurns,
      };
      checks.push({
        id: expectation.id,
        kind: expectation.kind,
        variant: expectation.variant,
        state: activationMatches(expectation, observed) ? "pass" : "fail",
        expected: expectedValue(expectation),
        observed,
      });
      continue;
    }

    if (expectation.kind === "response-text") {
      const turn = expectation.turn ?? null;
      const declaredTurnCount = group.input.prompt === undefined ? group.input.turns.length : 1;
      if (
        group.type !== "body" ||
        !VARIANTS.includes(expectation.variant) ||
        expectation.expect !== "contains" ||
        typeof expectation.value !== "string" ||
        (turn !== null && (!Number.isInteger(turn) || turn < 1 || turn > declaredTurnCount))
      ) {
        errors.push({ id: expectation.id, reason: "invalid response-text expectation" });
        continue;
      }

      const expected = { expect: expectation.expect, value: expectation.value, turn };
      const run = runs[expectation.variant];
      if (!run || run.state !== "complete") {
        checks.push({
          id: expectation.id,
          kind: expectation.kind,
          variant: expectation.variant,
          state: "unavailable",
          expected,
          observed: null,
        });
        continue;
      }

      const observed = responseObservation(run, turn);
      let state = "unavailable";
      if (observed !== null) state = observed.response.includes(expectation.value) ? "pass" : "fail";
      checks.push({
        id: expectation.id,
        kind: expectation.kind,
        variant: expectation.variant,
        state,
        expected,
        observed,
      });
      continue;
    }

    errors.push({ id: expectation.id, reason: `unsupported expectation kind: ${expectation.kind}` });
  }

  return {
    schema_version: 1,
    state: errors.length === 0 ? "complete" : "grade-error",
    evidence,
    checks,
    errors,
  };
}

function activationMatches(expectation, observed) {
  const kind = expectation.expect;
  if (kind === "never") return !observed.targetRead;
  if (!Number.isInteger(expectation.turn) || expectation.turn < 1) return false;
  if (kind === "on-turn") {
    return observed.readTurns.includes(expectation.turn);
  }
  if (kind === "by-turn") {
    return observed.firstReadTurn !== null && observed.firstReadTurn <= expectation.turn;
  }
  if (kind === "not-before-turn") {
    return observed.firstReadTurn === null || observed.firstReadTurn >= expectation.turn;
  }
  return false;
}

function expectedValue(expectation) {
  return {
    read: expectation.expect,
    turn: Number.isInteger(expectation.turn) ? expectation.turn : null,
  };
}

function responseObservation(run, turn) {
  if (turn === null) {
    let observedTurn = 1;
    if (Array.isArray(run.turns) && run.turns.length > 0) observedTurn = run.turns.at(-1).turn;
    return {
      response: typeof run.response === "string" ? run.response : "",
      turn: observedTurn,
    };
  }
  if (!Array.isArray(run.turns)) {
    if (turn !== 1) return null;
    return { response: typeof run.response === "string" ? run.response : "", turn };
  }
  const observedTurn = run.turns.find((entry) => entry.turn === turn);
  if (!observedTurn) return null;
  return { response: observedTurn.response ?? "", turn };
}
