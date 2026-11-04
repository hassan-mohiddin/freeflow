// A suite's decision rule: the measure, the two arms, the direction and the test, declared before the run.
// The unit is the case (one suite group): each case's trials are summarized per arm, the non-reference arm is
// better, worse or equal, and an exact two-sided sign test over the decided cases gives the verdict.

import { createHash } from "node:crypto";

import { bootstrapMean, mcnemarExact, signTest } from "../../../research-work/scripts/lib/stats.mjs";
import { ARM_NAME } from "./arms.mjs";

// The exact sign test is Research Work's; the evaluator's callers and tests import it from here.
export { signTest };

const DECISION_FIELDS = new Set(["measure", "arms", "direction", "method", "alpha", "min_cases", "trials"]);
const SCHEDULE_FIELDS = ["initial", "max", "step"];
// Where each measure kind is read: comparisons from the deterministic counts, the others from aggregator sections.
const MEASURE_KINDS = { comparison: null, metric: "metrics", judged: "judged", score: "scores" };
const MEASURE_NAME = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
/**
 * Metric names as decision rules and `perTrial` values name them (metrics.mjs records them); nested run.json fields
 * use a dotted path.
 */
export const METRIC_NAMES = [
  "durationMs",
  "turns",
  "toolCalls",
  "toolErrors",
  "tokens.input",
  "tokens.output",
  "tokens.cacheRead",
  "tokens.cacheWrite",
  "cost",
  "cacheHitRate",
  "peakContext",
  "skillReads",
  "skillReadTokens",
  // SPEC-011 4.3: the run's requests at API list price, and the simulated user's turns.
  "listCost",
  "interruptions",
  "defaultAnswers",
];

const DIRECTIONS = new Set(["higher", "lower"]);
const DEFAULTS = { method: "sign-test", alpha: 0.05, min_cases: 10 };
/**
 * The tests a rule may use: the exact sign test over each case's mean; exact McNemar over each case's success, an arm
 * succeeding on a case when every one of its trials passed (pass^k); and a paired bootstrap interval of the mean
 * difference over cases. Each is Research Work's (stats.mjs).
 */
export const METHODS = ["sign-test", "mcnemar", "bootstrap"];
/** The bootstrap's resamples and its fixed seed, so the same results always give the same interval. */
export const BOOTSTRAP = Object.freeze({ resamples: 10000, seed: 1 });
const VERDICT_TEXT = { beats: "beats", worse: "worse", "no-difference-shown": "no difference shown" };

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInteger(value, minimum) {
  return Number.isInteger(value) && value >= minimum;
}

/**
 * Validates a suite's `decision` and returns it with defaults applied (`method` sign-test, `alpha` 0.05,
 * `min_cases` 10), which is the form that is hashed and recorded. `fail(message)` must throw.
 */
export function validateDecision(value, fail, label = "suite.decision") {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!DECISION_FIELDS.has(key)) fail(`${label} contains unsupported field ${key}`);
  }
  for (const key of ["measure", "arms", "direction"]) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`);
  }

  const measure = value.measure;
  const kinds = isPlainObject(measure) ? Object.keys(measure) : [];
  if (kinds.length !== 1 || !Object.hasOwn(MEASURE_KINDS, kinds[0])) {
    fail(`${label}.measure must have exactly one of comparison, metric, judged or score`);
  }
  const [kind] = kinds;
  if (typeof measure[kind] !== "string" || !MEASURE_NAME.test(measure[kind])) {
    fail(`${label}.measure.${kind} must be a name of letters, numbers, dots, underscores or hyphens`);
  }
  if (kind === "metric" && !METRIC_NAMES.includes(measure.metric)) {
    fail(`${label}.measure.metric must be one of ${METRIC_NAMES.join(", ")}`);
  }

  const arms = value.arms;
  if (!Array.isArray(arms) || arms.length !== 2 || arms.some((arm) => typeof arm !== "string" || !ARM_NAME.test(arm))) {
    fail(`${label}.arms must be two arm names, the reference first`);
  }
  if (arms[0] === arms[1]) fail(`${label}.arms must name two different arms`);
  if (!DIRECTIONS.has(value.direction)) fail(`${label}.direction must be higher or lower`);

  const method = value.method ?? DEFAULTS.method;
  if (!METHODS.includes(method)) fail(`${label}.method must be one of ${METHODS.join(", ")}`);
  // McNemar's test needs a success per trial, which a comparison's pass or fail is.
  if (method === "mcnemar" && kind !== "comparison") fail(`${label}.method mcnemar needs a comparison measure`);
  const alpha = value.alpha ?? DEFAULTS.alpha;
  if (typeof alpha !== "number" || !(alpha > 0 && alpha < 1)) fail(`${label}.alpha must be between 0 and 1`);
  const minCases = value.min_cases ?? DEFAULTS.min_cases;
  if (!isInteger(minCases, 1)) fail(`${label}.min_cases must be a positive integer`);

  const rule = { measure: { [kind]: measure[kind] }, arms: [...arms], direction: value.direction, method, alpha };
  Object.assign(rule, { min_cases: minCases });
  if (Object.hasOwn(value, "trials")) {
    const trials = value.trials;
    if (!isPlainObject(trials)) fail(`${label}.trials must be an object`);
    for (const key of Object.keys(trials)) {
      if (!SCHEDULE_FIELDS.includes(key)) fail(`${label}.trials contains unsupported field ${key}`);
    }
    for (const key of SCHEDULE_FIELDS) {
      if (!isInteger(trials[key], 1)) fail(`${label}.trials.${key} must be a positive integer`);
    }
    if (trials.max < trials.initial) fail(`${label}.trials.max must be at least trials.initial`);
    rule.trials = { initial: trials.initial, max: trials.max, step: trials.step };
  }
  return rule;
}

/**
 * Validates a suite's `decisions` (SPEC-011 4.3): one rule per measure, each validated as a `decision` is, the first
 * the suite's claim. Only the first may declare `trials`, since one schedule sets how many trials every case runs.
 */
export function validateDecisions(value, fail) {
  if (!Array.isArray(value) || value.length === 0) fail("suite.decisions must be a non-empty array");
  const rules = value.map((each, index) => validateDecision(each, fail, `suite.decisions[${index}]`));
  for (const [index, rule] of rules.entries()) {
    if (index > 0 && rule.trials !== undefined)
      fail(`suite.decisions[${index}].trials: only the first decision schedules trials`);
  }
  const keys = rules.map((rule) => canonicalJson({ measure: rule.measure, arms: rule.arms, method: rule.method }));
  if (new Set(keys).size !== keys.length) fail("suite.decisions repeats a measure, arms and method");
  return rules;
}

/**
 * Why a suite's decision could only exclude cases, decided by the definition alone, or null: a group without a
 * decision arm; a group that records the measure in one decision arm but not the other; or a measure no group
 * records in both. A group that records the measure in neither arm, such as a control case, stays in the suite
 * and its case is excluded and counted. Checked when the suite loads, before any trial is paid for.
 *
 * @returns {{ group: any, message: string } | null} the group at fault, or null for the suite as a whole
 */
export function decisionProblem(rule, groups) {
  const { kind, name } = measureOf(rule);
  let recorded = false;
  for (const group of groups) {
    const missing = rule.arms.filter((arm) => !Object.hasOwn(group.variants ?? {}, arm));
    if (missing.length > 0) {
      return { group, message: `decision arm ${missing.join(", ")} is not an arm of group ${group.id}` };
    }
    const reporting = rule.arms.filter((arm) => recordsMeasure(group, arm, kind, name));
    if (reporting.length === rule.arms.length) recorded = true;
    else if (reporting.length > 0) {
      const silent = rule.arms.filter((arm) => !reporting.includes(arm));
      return {
        group,
        message: `group ${group.id} records ${kind} ${name} for arm ${reporting.join(", ")} but not ${silent.join(", ")}, so its case could only be excluded`,
      };
    }
  }
  if (recorded) return null;
  return {
    group: null,
    message: `no group records ${kind} ${name} in both arms ${rule.arms.join(" and ")}, so every case would be excluded`,
  };
}

/** Whether a loaded group records the measure for an arm: every run records metrics; the rest need a declaration. */
function recordsMeasure(group, arm, kind, name) {
  if (kind === "metric") return true;
  if (kind === "judged") return (group.rubric ?? []).some((dimension) => dimension.id === name);
  // A score is recorded per arm as `score.<id>` and `score.<comparison>`, from test-graded command checks only.
  return (group.expectations ?? []).some(
    (expectation) =>
      expectation.variant === arm &&
      (kind === "comparison"
        ? expectation.comparison === name
        : expectation.kind === "command" &&
          expectation.pass?.tests !== undefined &&
          (expectation.id === name || expectation.comparison === name)),
  );
}

/** The rule's identity: sha256 over its JSON with sorted keys, so the same rule always hashes the same. */
export function ruleSha256(rule) {
  return createHash("sha256").update(canonicalJson(rule)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function measureOf(rule) {
  const [kind] = Object.keys(rule.measure);
  return { kind, name: rule.measure[kind] };
}

/**
 * One case's usable values per decision arm, from an aggregate group entry. A comparison gives 1 per pass and 0
 * per fail; a section's `perTrial` gives true as 1, false as 0, numbers as themselves. Null, unavailable and
 * anything else are excluded and counted. `absent` names why the case has no such measure at all.
 */
function armValues(group, rule) {
  const { kind, name } = measureOf(rule);
  const arms = Object.fromEntries(rule.arms.map((arm) => [arm, { values: [], excluded: 0 }]));
  if (kind === "comparison") {
    const comparison = (group.comparisons ?? []).find((entry) => entry.id === name);
    if (comparison === undefined) return { absent: `no comparison ${name}` };
    for (const arm of rule.arms) {
      const counts = comparison.arms !== undefined ? comparison.arms[arm] : comparison[arm];
      if (!isPlainObject(counts)) continue;
      arms[arm].values.push(...Array(counts.pass ?? 0).fill(1), ...Array(counts.fail ?? 0).fill(0));
      arms[arm].excluded += counts.unavailable ?? 0;
    }
    return { arms };
  }
  const section = group[MEASURE_KINDS[kind]];
  if (!isPlainObject(section) || !Array.isArray(section.perTrial)) {
    return { absent: `no ${MEASURE_KINDS[kind]} section` };
  }
  for (const entry of section.perTrial) {
    const slot = arms[entry?.arm];
    if (slot === undefined) continue;
    // A score measure names a command expectation or its comparison; the section records it as `score.<id>`.
    const value = entry.values?.[kind === "score" ? `score.${name}` : name];
    if (typeof value === "boolean") slot.values.push(value ? 1 : 0);
    else if (typeof value === "number" && Number.isFinite(value)) slot.values.push(value);
    else slot.excluded += 1;
  }
  return { arms };
}

function summarize({ values, excluded }) {
  const n = values.length;
  return { n, mean: n === 0 ? null : values.reduce((sum, value) => sum + value, 0) / n, excluded };
}

/** One case: each arm's summary and the non-reference arm's sign, plus what the adaptive schedule needs. */
function caseOutcome(group, rule) {
  const [reference, arm] = rule.arms;
  const found = armValues(group, rule);
  const outcome = { id: group.id, trials: group.trials };
  if (found.absent !== undefined) return { ...outcome, sign: "excluded", reason: found.absent, stable: true };
  const summaries = { [reference]: summarize(found.arms[reference]), [arm]: summarize(found.arms[arm]) };
  Object.assign(outcome, { arms: summaries });
  if (summaries[reference].n === 0 || summaries[arm].n === 0) {
    // More trials of an arm that produced no usable value are unlikely to help, so the schedule leaves it.
    return { ...outcome, sign: "excluded", reason: "an arm has no usable value", stable: true };
  }
  const raw = summaries[arm].mean - summaries[reference].mean;
  const difference = rule.direction === "higher" ? raw : -raw;
  const scale = Math.max(1, Math.abs(summaries[arm].mean), Math.abs(summaries[reference].mean));
  const equal = Math.abs(difference) <= 1e-12 * scale;
  const sign = equal ? "equal" : difference > 0 ? "better" : "worse";
  // Undecided: a tie, or a difference smaller than one trial's worth (the observed range over the fewer values).
  // A loop, not a spread: a spread fails once the values outgrow a call's argument limit.
  let lowest = Infinity;
  let highest = -Infinity;
  for (const values of [found.arms[reference].values, found.arms[arm].values]) {
    for (const value of values) {
      if (value < lowest) lowest = value;
      if (value > highest) highest = value;
    }
  }
  const worth = (highest - lowest) / Math.min(summaries[reference].n, summaries[arm].n);
  return { ...outcome, sign, stable: !equal && Math.abs(raw) >= worth };
}

/**
 * The decision over an aggregate's groups. "beats" needs at least `min_cases` decided cases, p < alpha and the
 * split in the declared direction; the same evidence the other way is "worse"; anything else is
 * "no-difference-shown".
 */
export function decide(rule, groups) {
  if (rule.method === "mcnemar") return decideMcnemar(rule, groups);
  if (rule.method === "bootstrap") return decideBootstrap(rule, groups);
  const cases = groups.map((group) => caseOutcome(group, rule));
  const count = (sign) => cases.filter((entry) => entry.sign === sign).length;
  const better = count("better");
  const worse = count("worse");
  const decided = better + worse;
  const p = signTest(better, worse);
  let verdict = "no-difference-shown";
  if (decided >= rule.min_cases && p < rule.alpha && better !== worse) verdict = better > worse ? "beats" : "worse";
  const excludedValues = cases.reduce(
    (sum, entry) => sum + Object.values(entry.arms ?? {}).reduce((armSum, arm) => armSum + arm.excluded, 0),
    0,
  );
  return {
    rule,
    ruleSha256: ruleSha256(rule),
    reference: rule.arms[0],
    arm: rule.arms[1],
    verdict,
    better,
    worse,
    ties: count("equal"),
    decided,
    excluded: count("excluded"),
    excludedValues,
    p,
    cases: cases.map(({ stable, ...entry }) => entry),
  };
}

/** What every verdict carries, whatever its method. */
function verdictBase(rule, cases) {
  const count = (sign) => cases.filter((entry) => entry.sign === sign).length;
  const excludedValues = cases.reduce(
    (sum, entry) => sum + Object.values(entry.arms ?? {}).reduce((armSum, arm) => armSum + arm.excluded, 0),
    0,
  );
  return {
    rule,
    ruleSha256: ruleSha256(rule),
    reference: rule.arms[0],
    arm: rule.arms[1],
    better: count("better"),
    worse: count("worse"),
    ties: count("equal"),
    excluded: count("excluded"),
    excludedValues,
  };
}

/**
 * Exact McNemar over each case's success (SPEC-011 4.3). An arm succeeds on a case when every one of its trials passed
 * (pass^k); its pass@1 is the share of its trials that passed. A case where exactly one arm succeeded is discordant
 * and decided, better or worse by the rule's direction; "beats" needs `min_cases` discordant cases, p < alpha and
 * the split in the declared direction. A trial whose value is not a pass or a fail is excluded and counted.
 */
function decideMcnemar(rule, groups) {
  const [reference, arm] = rule.arms;
  const cases = groups.map((group) => {
    const found = armValues(group, rule);
    const outcome = { id: group.id, trials: group.trials };
    if (found.absent !== undefined) return { ...outcome, sign: "excluded", reason: found.absent };
    const arms = {};
    for (const name of rule.arms) {
      const { values, excluded } = found.arms[name];
      const binary = values.filter((value) => value === 0 || value === 1);
      const n = binary.length;
      arms[name] = {
        n,
        mean: n === 0 ? null : binary.reduce((sum, value) => sum + value, 0) / n,
        excluded: excluded + values.length - n,
        passK: n === 0 ? null : binary.every((value) => value === 1),
      };
    }
    if (arms[reference].n === 0 || arms[arm].n === 0) {
      return { ...outcome, arms, sign: "excluded", reason: "an arm has no usable value" };
    }
    const armOnly = arms[arm].passK && !arms[reference].passK;
    const referenceOnly = arms[reference].passK && !arms[arm].passK;
    const ahead = rule.direction === "higher" ? armOnly : referenceOnly;
    const behind = rule.direction === "higher" ? referenceOnly : armOnly;
    return { ...outcome, arms, sign: ahead ? "better" : behind ? "worse" : "equal" };
  });
  const decidedCases = cases.filter((entry) => entry.sign !== "excluded");
  const armOnly = decidedCases.filter((entry) => entry.arms[arm].passK && !entry.arms[reference].passK).length;
  const referenceOnly = decidedCases.filter((entry) => entry.arms[reference].passK && !entry.arms[arm].passK).length;
  const test = mcnemarExact({ armOnly, referenceOnly });
  const base = verdictBase(rule, cases);
  const decided = test.discordant;
  let verdict = "no-difference-shown";
  if (decided >= rule.min_cases && test.p < rule.alpha && base.better !== base.worse)
    verdict = base.better > base.worse ? "beats" : "worse";
  const share = (name, pick) =>
    decidedCases.length === 0
      ? null
      : decidedCases.reduce((sum, entry) => sum + pick(entry.arms[name]), 0) / decidedCases.length;
  return {
    ...base,
    verdict,
    decided,
    p: test.p,
    mcnemar: {
      armOnly,
      referenceOnly,
      bothPassed: decidedCases.filter((entry) => entry.arms[arm].passK && entry.arms[reference].passK).length,
      neitherPassed: decidedCases.filter((entry) => !entry.arms[arm].passK && !entry.arms[reference].passK).length,
    },
    passAt1: Object.fromEntries(rule.arms.map((name) => [name, share(name, (each) => each.mean)])),
    passK: Object.fromEntries(rule.arms.map((name) => [name, share(name, (each) => (each.passK ? 1 : 0))])),
    cases,
  };
}

/**
 * A paired bootstrap of the mean difference over cases (SPEC-011 4.3): each case's arm mean minus its reference mean,
 * resampled BOOTSTRAP.resamples times with a fixed seed, at a 1 - alpha percentile interval. "beats" needs
 * `min_cases` cases measured in both arms and an interval wholly on the better side of zero; wholly on the worse side
 * is "worse". It gives an interval, not a p.
 */
function decideBootstrap(rule, groups) {
  const [reference, arm] = rule.arms;
  const cases = groups.map((group) => {
    const { stable: _stable, ...entry } = caseOutcome(group, rule);
    if (entry.sign === "excluded") return entry;
    return { ...entry, difference: entry.arms[arm].mean - entry.arms[reference].mean };
  });
  const differences = cases.filter((entry) => entry.difference !== undefined).map((entry) => entry.difference);
  const base = verdictBase(rule, cases);
  let interval = null;
  let verdict = "no-difference-shown";
  if (differences.length > 0) {
    const result = bootstrapMean(differences, { ...BOOTSTRAP, confidence: 1 - rule.alpha });
    interval = {
      mean: result.estimate,
      low: result.low,
      high: result.high,
      confidence: result.confidence,
      resamples: result.resamples,
      seed: result.seed,
    };
    const above = result.low > 0;
    const below = result.high < 0;
    if (differences.length >= rule.min_cases && (above || below)) {
      const better = rule.direction === "higher" ? above : below;
      verdict = better ? "beats" : "worse";
    }
  }
  return { ...base, verdict, decided: differences.length, p: null, interval, cases };
}

/** Case IDs the adaptive schedule extends: tied or within one trial's worth, and below the schedule's maximum. */
export function undecidedCases(rule, groups) {
  if (rule.trials === undefined) return [];
  return groups
    .map((group) => caseOutcome(group, rule))
    .filter((entry) => !entry.stable && entry.trials < rule.trials.max)
    .map((entry) => ({ id: entry.id, trials: entry.trials }));
}

/** The aggregate's claim when the suite declares a decision: the verdict reached, with its numbers and rule hash. */
export function decisionClaim(decision, { k, supported, reason }) {
  return {
    class: supported ? decision.verdict : "none",
    ...(reason ? { reason } : {}),
    k,
    method: decision.rule.method,
    ruleSha256: decision.ruleSha256,
    better: decision.better,
    worse: decision.worse,
    ties: decision.ties,
    decided: decision.decided,
    excluded: decision.excluded,
    p: decision.p,
    ...(decision.interval ? { interval: decision.interval } : {}),
  };
}

/**
 * Trials run against trials asked for. With an adaptive schedule the full invocations and the trials its rounds
 * added are counted apart, so the header never presents added trials as requested ones.
 */
export function trialCounts(aggregate) {
  const trials = Array.isArray(aggregate.trials) ? aggregate.trials : [];
  if (aggregate.schedule === undefined) return `${trials.length}/${aggregate.requestedTrials}`;
  const added = trials.filter((trial) => trial.round !== undefined).length;
  const scheduled = (aggregate.schedule.rounds ?? []).reduce((sum, round) => sum + (round.scheduled ?? 0), 0);
  return (
    `${trials.length - added}/${aggregate.requestedTrials} initial, ${added}/${scheduled} adaptive` +
    ` (up to ${aggregate.schedule.max} per case)`
  );
}

/** A verdict's words: "beats", "worse" or "no difference shown". */
export function verdictText(verdict) {
  return VERDICT_TEXT[verdict] ?? String(verdict);
}

/**
 * The aggregate's claim in words, shared by the text and HTML views: `reached` is the class reached ("rate on this
 * suite, k=3", "beats", "none (uncommitted inputs)"), and `detail` what it is about (the decision's arms, measure and
 * direction) or, without a decision, why no "beats" claim is supported. Null when the aggregate has no claim.
 */
export function claimSummary(aggregate) {
  const claim = aggregate?.claim;
  if (!claim) return null;
  const none = `none${claim.reason ? ` (${claim.reason})` : ""}`;
  const decision = aggregate.decision;
  if (decision === undefined) {
    return {
      reached: claim.class === "rate-on-suite" ? `rate on this suite, k=${claim.k}` : none,
      detail: `no "beats" claim: ${String(claim.beats).replace(/^not supported: /, "")}`,
    };
  }
  const { kind, name } = measureOf(decision.rule);
  return {
    reached: claim.class === "none" ? none : verdictText(claim.class),
    detail: `${decision.arm} against ${decision.reference} on ${kind} ${name}, ${decision.rule.direction} is better`,
  };
}

/** The claim lines of an aggregate view: the rate claim without a decision, else the rule, split, p and verdict. */
export function renderClaim(aggregate) {
  const summary = claimSummary(aggregate);
  if (summary === null) return [];
  const decision = aggregate.decision;
  if (decision === undefined) return [`Claim: ${summary.reached}; ${summary.detail}`];
  const lines = [`Claim: ${summary.reached}; ${summary.detail}`, ...decisionLines(decision)];
  for (const round of aggregate.schedule?.rounds ?? []) {
    lines.push(
      row("adaptive", [
        `round=${round.round}`,
        `trials=${round.trials}/${round.scheduled}`,
        `cases=${round.groups.join(",")}`,
      ]),
    );
  }
  lines.push(...caseLines(decision));
  // A suite with several measures (SPEC-011 4.3): each further decision's verdict, rule and cases after the claim's.
  for (const [index, other] of (aggregate.decisions ?? []).slice(1).entries()) {
    const { kind, name } = measureOf(other.rule);
    lines.push(
      `Decision ${index + 2}: ${verdictText(other.verdict)}; ${other.arm} against ${other.reference} on ${kind} ${name}, ${other.rule.direction} is better`,
      ...decisionLines(other),
      ...caseLines(other),
    );
  }
  return lines;
}

/** A decision's rule and verdict rows, with what its method adds: McNemar's split and pass rates, or the interval. */
function decisionLines(decision) {
  const rule = decision.rule;
  const lines = [
    row("decision", [
      `rule=sha256:${decision.ruleSha256}`,
      `method=${rule.method}`,
      `alpha=${formatNumber(rule.alpha)}`,
      `min-cases=${rule.min_cases}`,
      ...(rule.trials ? [`trials=${rule.trials.initial}..${rule.trials.max} step ${rule.trials.step}`] : []),
    ]),
    row("decision", [
      `verdict=${VERDICT_TEXT[decision.verdict]}`,
      `better=${decision.better}`,
      `worse=${decision.worse}`,
      `ties=${decision.ties}`,
      `decided=${decision.decided}`,
      `excluded=${decision.excluded}`,
      `excluded-values=${decision.excludedValues}`,
      `p=${decision.p === null || decision.p === undefined ? "-" : formatNumber(decision.p)}`,
    ]),
  ];
  if (decision.mcnemar) {
    lines.push(
      row("mcnemar", [
        `${decision.arm}-only=${decision.mcnemar.armOnly}`,
        `${decision.reference}-only=${decision.mcnemar.referenceOnly}`,
        `both=${decision.mcnemar.bothPassed}`,
        `neither=${decision.mcnemar.neitherPassed}`,
        ...rule.arms.map(
          (arm) => `${arm}=pass@1:${share(decision.passAt1?.[arm])} pass^k:${share(decision.passK?.[arm])}`,
        ),
      ]),
    );
  }
  if (decision.interval) {
    const { mean, low, high, confidence, resamples, seed } = decision.interval;
    lines.push(
      row("bootstrap", [
        `${decision.arm}-${decision.reference}=mean:${formatNumber(mean)}`,
        `${Math.round(confidence * 100)}%=[${formatNumber(low)}, ${formatNumber(high)}]`,
        `resamples=${resamples}`,
        `seed=${seed}`,
      ]),
    );
  }
  return lines;
}

function share(value) {
  return typeof value === "number" ? formatNumber(value) : "-";
}

/** A decision's rows for each case. */
function caseLines(decision) {
  const lines = [];
  for (const entry of decision.cases) {
    const arms = Object.entries(entry.arms ?? {}).map(
      ([arm, summary]) => `${arm}=${summary.mean === null ? "-" : formatNumber(summary.mean)} (n=${summary.n})`,
    );
    lines.push(
      row("case", [entry.id, entry.sign, `trials=${entry.trials}`, ...arms, ...(entry.reason ? [entry.reason] : [])]),
    );
  }
  return lines;
}

function row(kind, values) {
  return [kind, ...values]
    .map((value) =>
      String(value).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t"),
    )
    .join("\t");
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}
