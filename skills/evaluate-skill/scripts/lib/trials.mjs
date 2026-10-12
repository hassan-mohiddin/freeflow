import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createInvocationId, writeJson } from "./evidence.mjs";
import { budgetEvidence, runEvaluation } from "./runner.mjs";

const CHECK_STATES = ["pass", "fail", "unavailable"];

/**
 * Runs the selection as independent complete invocations and records an aggregate beside them.
 * Each trial remains an ordinary result; the aggregate only counts their deterministic grades.
 *
 * @param {string} definitionFile
 * @param {any} selectors
 * @param {{root?: string, signal?: AbortSignal, trials: number, maxCost: number | null, onTrial?: (result: any) => void}} options
 */
export async function runTrials(
  definitionFile,
  selectors,
  { root = process.cwd(), signal, trials, maxCost, onTrial, dryRun = false, hostExtensions = [] },
) {
  const budget = maxCost === null ? null : { maxCost, spent: 0, exhausted: false };
  const results = [];
  for (let trial = 0; trial < trials; trial += 1) {
    if (signal?.aborted || budget?.exhausted) break;
    const result = await runEvaluation(definitionFile, selectors, { root, signal, budget, dryRun, hostExtensions });
    results.push(result);
    onTrial?.(result);
  }

  const id = createInvocationId();
  const directory = path.join(root, ".skill-eval", "runs", id);
  await mkdir(directory, { recursive: true });
  const aggregate = {
    schema_version: 1,
    kind: "aggregate",
    id,
    state: aggregateState(results, trials),
    requestedTrials: trials,
    trials: results.map((result) => ({ id: result.id, state: result.state })),
    groups: await aggregateGroups(results),
    dryRun,
    claim: claimFor(results, trials, dryRun),
    completedAt: new Date().toISOString(),
  };
  if (budget !== null) aggregate.budget = budgetEvidence(budget);
  await writeJson(path.join(directory, "aggregate.json"), aggregate);
  return { id, path: directory, state: aggregate.state, aggregate };
}

/**
 * The strongest claim the aggregate supports. Counts over complete trials support a rate on this suite;
 * a "beats" claim needs a decision rule and size declared by the suite, which no definition declares yet.
 */
function claimFor(results, requested, dryRun) {
  const complete = results.filter((result) => result.state === "complete").length;
  // A dry run read inputs no commit identifies, so its counts support no claim.
  return {
    class: complete > 0 && !dryRun ? "rate-on-suite" : "none",
    ...(dryRun ? { reason: "dry run" } : {}),
    k: requested,
    beats: "not supported: the suite declares no decision rule",
  };
}

function aggregateState(results, requested) {
  if (results.length < requested || results.some((result) => result.state === "cancelled")) return "cancelled";
  if (results.every((result) => result.state === "complete")) return "complete";
  return "partially-complete";
}

export async function aggregateGroups(results) {
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const result of results) {
    for (const group of result.summary.groups) {
      const entry = groups.get(group.id) ?? {
        id: group.id,
        trials: 0,
        unreadableGrades: 0,
        gradeErrors: 0,
        runStates: { baseline: {}, candidate: {} },
        comparisons: new Map(),
        checks: new Map(),
      };
      groups.set(group.id, entry);
      entry.trials += 1;
      for (const variant of ["baseline", "candidate"]) {
        const state = group.variants?.[variant];
        if (typeof state === "string") entry.runStates[variant][state] = (entry.runStates[variant][state] ?? 0) + 1;
      }
      const gradeFile = path.join(
        result.path,
        "groups",
        group.id,
        group.artifacts?.grade ?? "deterministic-grade.json",
      );
      // One trial's missing or corrupt grade is counted, not allowed to discard every other trial's evidence.
      let grade;
      try {
        grade = JSON.parse(await readFile(gradeFile, "utf8"));
      } catch {
        entry.unreadableGrades += 1;
        continue;
      }
      // A check that could not be graded is counted, so it cannot silently leave every denominator.
      entry.gradeErrors += Array.isArray(grade.errors) ? grade.errors.length : 0;
      for (const check of grade.checks ?? []) {
        const counts = entry.checks.get(check.id) ?? {
          id: check.id,
          variant: check.variant,
          kind: check.kind,
          ...zeroCounts(),
        };
        entry.checks.set(check.id, counts);
        if (CHECK_STATES.includes(check.state)) counts[check.state] += 1;
      }
      for (const comparison of grade.comparisons ?? []) {
        const counts = entry.comparisons.get(comparison.id) ?? {
          id: comparison.id,
          kind: comparison.kind,
          baseline: zeroCounts(),
          candidate: zeroCounts(),
          transitions: {},
          pairs: { "both-pass": 0, "both-fail": 0, "baseline-only": 0, "candidate-only": 0, incomplete: 0 },
        };
        entry.comparisons.set(comparison.id, counts);
        for (const variant of ["baseline", "candidate"]) {
          const state = comparison[variant]?.state;
          if (CHECK_STATES.includes(state)) counts[variant][state] += 1;
        }
        counts.transitions[comparison.transition] = (counts.transitions[comparison.transition] ?? 0) + 1;
        counts.pairs[pairOf(comparison.baseline?.state, comparison.candidate?.state)] += 1;
      }
    }
  }
  return [...groups.values()].map((entry) => ({
    id: entry.id,
    trials: entry.trials,
    unreadableGrades: entry.unreadableGrades,
    gradeErrors: entry.gradeErrors,
    runStates: entry.runStates,
    comparisons: [...entry.comparisons.values()],
    // pass^k: the check passed in every one of the k trials that graded it.
    checks: [...entry.checks.values()].map((check) => {
      const graded = check.pass + check.fail + check.unavailable;
      return { ...check, trials: graded, passAll: graded > 0 && check.pass === graded };
    }),
  }));
}

/** One trial's pair of outcomes for a comparison; anything but pass or fail on either side is incomplete. */
function pairOf(baseline, candidate) {
  const graded = (state) => state === "pass" || state === "fail";
  if (!graded(baseline) || !graded(candidate)) return "incomplete";
  if (baseline === "pass") return candidate === "pass" ? "both-pass" : "baseline-only";
  return candidate === "pass" ? "candidate-only" : "both-fail";
}

function zeroCounts() {
  return { pass: 0, fail: 0, unavailable: 0 };
}
