import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { comparisonArms, referenceArm, storedArms } from "./arms.mjs";
import { createInvocationId, writeJson } from "./evidence.mjs";
import { aggregateSections, hasAggregators } from "./hooks.mjs";
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
  { root = process.cwd(), signal, trials, maxCost, onTrial, dryRun = false },
) {
  const budget = maxCost === null ? null : { maxCost, spent: 0, exhausted: false };
  const results = [];
  for (let trial = 0; trial < trials; trial += 1) {
    if (signal?.aborted || budget?.exhausted) break;
    const result = await runEvaluation(definitionFile, selectors, { root, signal, budget, dryRun });
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

/**
 * Counts each group's checks and comparisons over every trial that ran it. A trial that recorded no state for a
 * check or comparison (its grade was unreadable, or that check or comparison could not be graded) counts as
 * `unavailable` for it, so every count, and pass^k, covers all the group's trials. Comparisons are counted per
 * arm, and each non-reference arm's transitions and pairs against the reference.
 */
export async function aggregateGroups(results) {
  /** @type {Map<string, any>} */
  const groups = new Map();
  const collectTrials = hasAggregators();
  for (const result of results) {
    for (const group of result.summary.groups) {
      const groupDirectory = path.join(result.path, "groups", group.id);
      let entry = groups.get(group.id);
      if (entry === undefined) {
        entry = {
          id: group.id,
          trials: 0,
          unreadableGrades: 0,
          gradeErrors: 0,
          runStates: {},
          comparisons: new Map(),
          checks: new Map(),
          definition: null,
          perTrial: [],
        };
        groups.set(group.id, entry);
      }
      entry.trials += 1;
      if (entry.definition === null) {
        entry.definition = await readJson(path.join(groupDirectory, "definition.json"));
        seedChecks(entry);
      }
      const arms = storedArms(group, entry.definition);
      for (const arm of arms) {
        const states = (entry.runStates[arm] ??= {});
        const state = group.variants?.[arm];
        if (typeof state === "string") states[state] = (states[state] ?? 0) + 1;
      }
      // One trial's missing or corrupt grade is counted, not allowed to discard every other trial's evidence.
      const grade = await readJson(path.join(groupDirectory, group.artifacts?.grade ?? "deterministic-grade.json"));
      if (grade === null) entry.unreadableGrades += 1;
      else countGrade(entry, grade);
      if (collectTrials) {
        entry.perTrial.push({
          id: result.id ?? null,
          state: group.state ?? null,
          grade,
          runs: Object.fromEntries(
            await Promise.all(
              arms.map(async (arm) => [arm, await readJson(path.join(groupDirectory, arm, "run.json"))]),
            ),
          ),
        });
      }
    }
  }
  const aggregated = [];
  for (const entry of groups.values()) {
    const output = {
      id: entry.id,
      trials: entry.trials,
      unreadableGrades: entry.unreadableGrades,
      gradeErrors: entry.gradeErrors,
      runStates: entry.runStates,
      comparisons: [...entry.comparisons.values()].map((counts) => comparisonOutput(counts, entry.trials)),
      // pass^k: the check passed in every one of the group's k trials.
      checks: [...entry.checks.values()].map((check) => {
        const counted = check.pass + check.fail + check.unavailable;
        const filled = { ...check, unavailable: check.unavailable + Math.max(0, entry.trials - counted) };
        const graded = filled.pass + filled.fail + filled.unavailable;
        return { ...filled, trials: graded, passAll: graded > 0 && filled.pass === graded };
      }),
    };
    if (collectTrials) {
      Object.assign(
        output,
        await aggregateSections({
          id: entry.id,
          arms: Object.keys(entry.runStates),
          reference: referenceArm(entry.definition),
          trials: entry.perTrial,
        }),
      );
    }
    aggregated.push(output);
  }
  return aggregated;
}

async function readJson(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Declared expectations become checks before any grade is read, so one that never graded is still counted. */
function seedChecks(entry) {
  const expectations = Array.isArray(entry.definition?.expectations) ? entry.definition.expectations : [];
  for (const expectation of expectations) {
    if (typeof expectation?.id !== "string" || entry.checks.has(expectation.id)) continue;
    entry.checks.set(expectation.id, {
      id: expectation.id,
      variant: expectation.variant,
      kind: expectation.kind,
      ...zeroCounts(),
    });
  }
}

function countGrade(entry, grade) {
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
    const { reference, arms, transitions } = comparisonArms(comparison);
    let counts = entry.comparisons.get(comparison.id);
    if (counts === undefined) {
      counts = {
        id: comparison.id,
        kind: comparison.kind,
        classic: comparison.arms === undefined,
        reference,
        arms: {},
        outcomes: {},
        recorded: 0,
      };
      entry.comparisons.set(comparison.id, counts);
    }
    counts.recorded += 1;
    for (const [arm, outcome] of Object.entries(arms ?? {})) {
      const armCounts = (counts.arms[arm] ??= zeroCounts());
      if (CHECK_STATES.includes(outcome?.state)) armCounts[outcome.state] += 1;
      if (arm === reference) continue;
      const versus = (counts.outcomes[arm] ??= { transitions: {}, pairs: zeroPairs(reference, arm) });
      const transition = transitions[arm];
      versus.transitions[transition] = (versus.transitions[transition] ?? 0) + 1;
      versus.pairs[pairOf(arms[reference]?.state, outcome?.state, reference, arm)] += 1;
    }
  }
}

/**
 * A comparison's counts with every trial accounted for. A baseline/candidate comparison keeps its original shape
 * (`baseline`, `candidate`, `transitions`, `pairs`); any other has `reference`, per-arm `arms`, and `outcomes`
 * holding each non-reference arm's transitions and pairs against the reference.
 */
function comparisonOutput(counts, trials) {
  const missing = Math.max(0, trials - counts.recorded);
  for (const armCounts of Object.values(counts.arms)) {
    armCounts.unavailable += Math.max(0, trials - (armCounts.pass + armCounts.fail + armCounts.unavailable));
  }
  for (const versus of Object.values(counts.outcomes)) {
    if (missing > 0) versus.transitions.unavailable = (versus.transitions.unavailable ?? 0) + missing;
    versus.pairs.incomplete += missing;
  }
  if (counts.classic) {
    return {
      id: counts.id,
      kind: counts.kind,
      baseline: counts.arms.baseline ?? zeroCounts(),
      candidate: counts.arms.candidate ?? zeroCounts(),
      transitions: counts.outcomes.candidate?.transitions ?? {},
      pairs: counts.outcomes.candidate?.pairs ?? zeroPairs("baseline", "candidate"),
    };
  }
  return {
    id: counts.id,
    kind: counts.kind,
    reference: counts.reference,
    arms: counts.arms,
    outcomes: counts.outcomes,
  };
}

/** One trial's pair of outcomes for an arm against the reference; anything but pass or fail on either side is incomplete. */
function pairOf(referenceState, armState, reference, arm) {
  const graded = (state) => state === "pass" || state === "fail";
  if (!graded(referenceState) || !graded(armState)) return "incomplete";
  if (referenceState === "pass") return armState === "pass" ? "both-pass" : `${reference}-only`;
  return armState === "pass" ? `${arm}-only` : "both-fail";
}

function zeroPairs(reference, arm) {
  return { "both-pass": 0, "both-fail": 0, [`${reference}-only`]: 0, [`${arm}-only`]: 0, incomplete: 0 };
}

function zeroCounts() {
  return { pass: 0, fail: 0, unavailable: 0 };
}
