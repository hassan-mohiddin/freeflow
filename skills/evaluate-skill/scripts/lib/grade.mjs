const VARIANTS = ["baseline", "candidate"];
const EXPECTATIONS = new Set(["never", "on-turn", "by-turn", "not-before-turn"]);

export function gradeActivation(group, runs, evidence) {
  const checks = [];
  const errors = [];

  for (const expectation of group.expectations) {
    if (expectation.kind !== "skill-read") {
      errors.push({ id: expectation.id, reason: `unsupported expectation kind: ${expectation.kind}` });
      continue;
    }
    if (!VARIANTS.includes(expectation.variant) || !EXPECTATIONS.has(expectation.expect)) {
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
