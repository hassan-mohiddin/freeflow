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
export async function runTrials(definitionFile, selectors, { root = process.cwd(), signal, trials, maxCost, onTrial }) {
  const budget = maxCost === null ? null : { maxCost, spent: 0, exhausted: false };
  const results = [];
  for (let trial = 0; trial < trials; trial += 1) {
    if (signal?.aborted || budget?.exhausted) break;
    const result = await runEvaluation(definitionFile, selectors, { root, signal, budget });
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
    completedAt: new Date().toISOString(),
  };
  if (budget !== null) aggregate.budget = budgetEvidence(budget);
  await writeJson(path.join(directory, "aggregate.json"), aggregate);
  return { id, path: directory, state: aggregate.state, aggregate };
}

function aggregateState(results, requested) {
  if (results.length < requested || results.some((result) => result.state === "cancelled")) return "cancelled";
  if (results.every((result) => result.state === "complete")) return "complete";
  return "partially-complete";
}

async function aggregateGroups(results) {
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const result of results) {
    for (const group of result.summary.groups) {
      const entry = groups.get(group.id) ?? { id: group.id, trials: 0, comparisons: new Map(), checks: new Map() };
      groups.set(group.id, entry);
      const gradeFile = path.join(
        result.path,
        "groups",
        group.id,
        group.artifacts?.grade ?? "deterministic-grade.json",
      );
      const grade = JSON.parse(await readFile(gradeFile, "utf8"));
      entry.trials += 1;
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
        };
        entry.comparisons.set(comparison.id, counts);
        for (const variant of ["baseline", "candidate"]) {
          const state = comparison[variant]?.state;
          if (CHECK_STATES.includes(state)) counts[variant][state] += 1;
        }
        counts.transitions[comparison.transition] = (counts.transitions[comparison.transition] ?? 0) + 1;
      }
    }
  }
  return [...groups.values()].map((entry) => ({
    id: entry.id,
    trials: entry.trials,
    comparisons: [...entry.comparisons.values()],
    checks: [...entry.checks.values()],
  }));
}

function zeroCounts() {
  return { pass: 0, fail: 0, unavailable: 0 };
}
