// Tracked metrics: what each run cost and how it went, derived only from evidence the run already records.
// Importing this module registers the run-metrics hook and the `metrics` aggregator; the CLI imports it once.
// A metric whose evidence is missing is null, never 0, so an absent measurement cannot read as a free one.

import { measuredCost } from "./budget.mjs";
import { registerAggregator, registerRunMetricsHook } from "./hooks.mjs";

/** Metric names as decision rules and `perTrial` values name them; nested run.json fields use a dotted path. */
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
];

/**
 * One run's metrics. RPC observations record turns, each with its tool activity; a one-shot observation records
 * one turn's tool activity at top level. Usage is the run's merged usage.
 *
 * @param {{ observation?: any, run: any }} context
 */
export function runMetricsFor({ observation, run }) {
  const turns = Array.isArray(observation?.turns) ? observation.turns : Array.isArray(run?.turns) ? run.turns : null;
  const activity = turns !== null ? turnActivity(turns) : topLevelActivity(observation, run);
  const usage = isObject(run?.usage) ? run.usage : isObject(observation?.usage) ? observation.usage : null;
  const tokens = {
    input: count(usage?.input),
    output: count(usage?.output),
    cacheRead: count(usage?.cacheRead),
    cacheWrite: count(usage?.cacheWrite),
  };
  const prompted =
    tokens.input === null || tokens.cacheRead === null || tokens.cacheWrite === null
      ? null
      : tokens.input + tokens.cacheRead + tokens.cacheWrite;
  return {
    durationMs: duration(run?.startedAt, run?.completedAt),
    turns: turns === null ? 1 : turns.length,
    toolCalls: activity === null ? null : activity.length,
    toolErrors: activity === null ? null : activity.filter((entry) => entry?.isError === true).length,
    tokens,
    // Null when unmeasured: a zero cost for a run that used tokens is a missing price, not a free run.
    cost: measuredCost(usage),
    // The share of prompt tokens served from the provider's cache.
    cacheHitRate: prompted === null || prompted === 0 ? null : tokens.cacheRead / prompted,
  };
}

/** A run's metrics as flat `{ name: number | null }` values; a run without recorded metrics has every value null. */
export function metricValues(run) {
  const metrics = isObject(run?.metrics) ? run.metrics : {};
  return Object.fromEntries(
    METRIC_NAMES.map((name) => [name, number(name.split(".").reduce((value, key) => value?.[key], metrics))]),
  );
}

/**
 * The `metrics` aggregate section for one group: per arm, each metric's count, median, mean, min and max over the
 * trials that measured it; per non-reference arm, the paired difference (arm minus reference, within each trial
 * where both were measured); and every trial's values per the shared measures contract.
 *
 * @param {{ arms: string[], reference: string, trials: Array<{ id: string | null, runs: Record<string, any> }> }} input
 */
export function aggregateMetrics({ arms, reference, trials }) {
  const perTrial = [];
  for (const trial of trials) {
    // Only a complete run's metrics count: an invalid, failed or cancelled run's cost or turns are no measure of
    // the arm, and must never reach a decision; nor do a run's held for transcript flags no one has cleared.
    for (const arm of arms) {
      const run = trial.runs?.[arm];
      const counted = run?.state === "complete" && !trial.held?.includes(arm);
      perTrial.push({ trial: trial.id, arm, values: metricValues(counted ? run : null) });
    }
  }
  const valuesOf = (arm, name) => perTrial.filter((entry) => entry.arm === arm).map((entry) => entry.values[name]);
  const summaries = {};
  for (const arm of arms) {
    summaries[arm] = Object.fromEntries(METRIC_NAMES.map((name) => [name, summarize(valuesOf(arm, name))]));
  }
  const differences = {};
  for (const arm of arms) {
    if (arm === reference || !arms.includes(reference)) continue;
    differences[arm] = Object.fromEntries(
      METRIC_NAMES.map((name) => {
        const referenceValues = valuesOf(reference, name);
        const paired = valuesOf(arm, name)
          .map((value, index) =>
            value === null || referenceValues[index] === null ? null : value - referenceValues[index],
          )
          .filter((value) => value !== null);
        const { count: pairs, mean, median } = summarize(paired);
        return [name, { pairs, mean, median }];
      }),
    );
  }
  return { reference, arms: summaries, differences, perTrial };
}

/** View rows for one run's metrics; tokens are already on the usage row. */
export function runMetricsLines(run) {
  if (!isObject(run?.metrics)) return [];
  const values = metricValues(run);
  return [
    row("  metrics", [
      `duration-ms=${format(values.durationMs)}`,
      `turns=${format(values.turns)}`,
      `tool-calls=${format(values.toolCalls)}`,
      `tool-errors=${format(values.toolErrors)}`,
      `cache-hit-rate=${format(values.cacheHitRate)}`,
      `cost=${format(values.cost)}`,
    ]),
  ];
}

/** View rows for an aggregate group's metrics section: one row per metric any arm measured. */
export function aggregateMetricsLines(section) {
  if (!isObject(section)) return [];
  if (typeof section.error === "string") return [row("metrics", ["error", section.error])];
  const lines = [];
  for (const name of METRIC_NAMES) {
    const arms = Object.entries(section.arms ?? {});
    if (arms.every(([, metrics]) => !metrics?.[name]?.count)) continue;
    lines.push(
      row("metric", [
        name,
        ...arms.map(([arm, metrics]) => {
          const summary = metrics?.[name];
          return `${arm}=median:${format(summary?.median)} mean:${format(summary?.mean)} n=${summary?.count ?? 0}`;
        }),
        ...Object.entries(section.differences ?? {}).map(([arm, metrics]) => {
          const difference = metrics?.[name];
          return `${arm}-${section.reference}=mean:${format(difference?.mean, true)} pairs=${difference?.pairs ?? 0}`;
        }),
      ]),
    );
  }
  return lines;
}

function summarize(values) {
  const measured = values.filter((value) => value !== null).sort((left, right) => left - right);
  const n = measured.length;
  if (n === 0) return { count: 0, median: null, mean: null, min: null, max: null };
  const middle = Math.floor(n / 2);
  return {
    count: n,
    median: n % 2 === 1 ? measured[middle] : (measured[middle - 1] + measured[middle]) / 2,
    mean: measured.reduce((total, value) => total + value, 0) / n,
    min: measured[0],
    max: measured[n - 1],
  };
}

function turnActivity(turns) {
  if (!turns.every((turn) => Array.isArray(turn?.toolActivity))) return null;
  return turns.flatMap((turn) => turn.toolActivity);
}

function topLevelActivity(observation, run) {
  if (Array.isArray(observation?.toolActivity)) return observation.toolActivity;
  if (Array.isArray(run?.toolActivity)) return run.toolActivity;
  return null;
}

function duration(startedAt, completedAt) {
  const start = typeof startedAt === "string" ? Date.parse(startedAt) : Number.NaN;
  const end = typeof completedAt === "string" ? Date.parse(completedAt) : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function format(value, signed = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unavailable";
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  return signed && value > 0 ? `+${text}` : text;
}

// Same cell escaping as view.mjs, so a metrics row reads like every other view row.
function row(kind, values) {
  return [kind, ...values]
    .map((value) =>
      String(value).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t"),
    )
    .join("\t");
}

registerRunMetricsHook("tracked", runMetricsFor);
registerAggregator("metrics", aggregateMetrics);
