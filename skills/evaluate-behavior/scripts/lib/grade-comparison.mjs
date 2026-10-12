import { isDeepStrictEqual } from "node:util";

import { DEFAULT_ARMS, DEFAULT_REFERENCE, isClassicPair } from "./arms.mjs";
import { hasOwn } from "./grade-support.mjs";

/**
 * A comparison ID names exactly one expectation per arm, all of one kind and expected value. Each non-reference
 * arm's outcome is a factual transition from the reference's state to its own. A baseline/candidate group keeps
 * its original shape (`baseline`, `candidate`, `transition`); any other group records `reference`, `arms` and
 * `transitions` keyed by arm.
 *
 * @param {any[]} expectations
 * @param {any[]} checks
 * @param {{arms?: string[], reference?: string}} [options]
 */
export function gradeComparisons(expectations, checks, { arms = DEFAULT_ARMS, reference = DEFAULT_REFERENCE } = {}) {
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

  const classic = isClassicPair(arms, reference);
  const others = arms.filter((arm) => arm !== reference);
  /** @type {Map<string, any>} */
  const byCheck = new Map(checks.map((check) => [check.id, check]));
  const comparisons = /** @type {any[]} */ ([]);
  for (const [id, entries] of grouped) {
    const expectationFor = Object.fromEntries(
      arms.map((arm) => [arm, entries.filter((entry) => entry.variant === arm)]),
    );
    if (entries.length !== arms.length || arms.some((arm) => expectationFor[arm].length !== 1)) {
      errors.push({
        id,
        reason: classic
          ? "comparison requires one baseline and one candidate expectation"
          : `comparison requires exactly one expectation for each arm: ${arms.join(", ")}`,
      });
      continue;
    }
    const checkFor = Object.fromEntries(arms.map((arm) => [arm, byCheck.get(expectationFor[arm][0].id)]));
    if (!others.every((arm) => sameCheck(checkFor[reference], checkFor[arm]))) {
      errors.push({ id, reason: "comparison expectations must describe the same deterministic check" });
      continue;
    }
    if (classic) {
      comparisons.push({
        id,
        kind: checkFor.baseline.kind,
        baseline: { check: checkFor.baseline.id, state: checkFor.baseline.state },
        candidate: { check: checkFor.candidate.id, state: checkFor.candidate.state },
        transition: transition(checkFor.baseline.state, checkFor.candidate.state),
      });
      continue;
    }
    comparisons.push({
      id,
      kind: checkFor[reference].kind,
      reference,
      arms: Object.fromEntries(arms.map((arm) => [arm, { check: checkFor[arm].id, state: checkFor[arm].state }])),
      transitions: Object.fromEntries(
        others.map((arm) => [arm, transition(checkFor[reference].state, checkFor[arm].state)]),
      ),
    });
  }
  return { comparisons, errors };
}

function sameCheck(reference, other) {
  return (
    reference !== undefined &&
    other !== undefined &&
    reference.kind === other.kind &&
    isDeepStrictEqual(reference.expected, other.expected)
  );
}

function transition(reference, other) {
  return [reference, other].every((state) => state === "pass" || state === "fail")
    ? `${reference}-to-${other}`
    : "unavailable";
}
