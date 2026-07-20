import { isDeepStrictEqual } from "node:util";

import { hasOwn } from "./grade-support.mjs";

export function gradeComparisons(expectations, checks) {
  /** @type {Map<string, any[]>} */
  const grouped = new Map();
  const errors = /** @type {any[]} */ ([]);
  for (const expectation of expectations) {
    if (!hasOwn(expectation, "comparison")) continue;
    if (typeof expectation.comparison !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(expectation.comparison)) {
      errors.push({ id: expectation.id, reason: "invalid comparison identity" });
      continue;
    }
    const entries = grouped.get(expectation.comparison) ?? [];
    entries.push(expectation);
    grouped.set(expectation.comparison, entries);
  }

  /** @type {Map<string, any>} */
  const byCheck = new Map(checks.map((check) => [check.id, check]));
  const comparisons = /** @type {any[]} */ ([]);
  for (const [id, entries] of grouped) {
    const baselineExpectation = entries.find((entry) => entry.variant === "baseline");
    const candidateExpectation = entries.find((entry) => entry.variant === "candidate");
    if (entries.length !== 2 || !baselineExpectation || !candidateExpectation) {
      errors.push({ id, reason: "comparison requires one baseline and one candidate expectation" });
      continue;
    }
    const baseline = byCheck.get(baselineExpectation.id);
    const candidate = byCheck.get(candidateExpectation.id);
    if (!sameCheck(baseline, candidate)) {
      errors.push({ id, reason: "comparison expectations must describe the same deterministic check" });
      continue;
    }
    comparisons.push({
      id,
      kind: baseline.kind,
      baseline: { check: baseline.id, state: baseline.state },
      candidate: { check: candidate.id, state: candidate.state },
      transition: transition(baseline.state, candidate.state),
    });
  }
  return { comparisons, errors };
}

function sameCheck(baseline, candidate) {
  return (
    baseline !== undefined &&
    candidate !== undefined &&
    baseline.kind === candidate.kind &&
    isDeepStrictEqual(baseline.expected, candidate.expected)
  );
}

function transition(baseline, candidate) {
  return [baseline, candidate].every((state) => state === "pass" || state === "fail")
    ? `${baseline}-to-${candidate}`
    : "unavailable";
}
