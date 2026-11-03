// Planning from measured cost (task-004's Spec, section 12, "Planning from measured cost"; P84 to P89): what past
// Slices and delegations used, pooled from the task, then its project, then the whole store; the prediction a Slice
// starts with, corrected by how far past predictions were off; and what `estimate --plan`, `--project` and `--store`
// print. Deterministic: medians, ranges and ratios over measured figures, no fitted model. It prints costs and never
// picks a model: Execute Work's delegation reference does.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { HISTORY_FILE, fieldText, filesIn, parseHistory5, parseRecord5 } from "./record5.mjs";
import { PRICES, parseMeasure } from "./measure5.mjs";
import { freeflowStoreOf, isFreeflowStore } from "./store.mjs";

/** A pool stands for a prediction only with at least this many measured Slices, or sized ones for a per-file rate. */
export const MIN_MEASURED = 3;
/**
 * The correction starts from the first Slice with its actual (P16), pulled toward none by this many imaginary
 * on-target Slices: one Slice 3× over scales the next prediction by 3^(1/3), about 1.44.
 */
export const CORRECTION_PRIOR = 2;
/** Where Freeflow's notice comes, as a share of the window. */
const NOTICE_AT = 0.75;

export class PlanError extends Error {}

const count = (value) => Math.round(value).toLocaleString("en-US");
const dollars = (value) => `$${value.toFixed(2)}`;
const minutes = (ms) => Math.round(ms / 60_000);
function duration(ms) {
  const total = minutes(ms);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h${total % 60 ? ` ${total % 60} min` : ""}`;
}
const plural = (n, word) => (n === 0 ? `no ${word}` : `${n} ${word}${n === 1 ? "" : "s"}`);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
/** The median and range of the values known; null when none is. */
function spread(values) {
  const known = values.filter((value) => value !== null && Number.isFinite(value));
  return known.length ? { median: median(known), min: Math.min(...known), max: Math.max(...known) } : null;
}

const usdOf = (measure) =>
  Object.values(measure.billed).reduce((sum, billed) => sum + (billed.priced ? billed.usd : 0), 0);
/**
 * A measure's figures. One read from a transcript has its requests' working time and cost; one taken with --used has
 * neither (null), only the context and the wall-clock time.
 */
function figuresOf(measure) {
  const read = Object.keys(measure.billed).length > 0;
  return { context: measure.context, workingMs: read ? measure.workingMs : null, usd: read ? usdOf(measure) : null };
}
const sum = (values) => values.reduce((total, value) => total + (value ?? 0), 0);
const QUANTITIES = ["context", "workingMs", "usd"];

function measureOf(entry) {
  const text = fieldText(entry, "Measured");
  if (!text || text === "not measured") return null;
  try {
    const measure = parseMeasure(text);
    // A reading that found no requests measured nothing, not a Slice that used nothing (P17).
    return measure.context === 0 && Object.keys(measure.billed).length === 0 ? null : measure;
  } catch {
    return null;
  }
}

const PREDICTED =
  /^context ([\d,]+)(?: \(×([\d.]+)\))?(?:, working (\d+) min(?: \(×([\d.]+)\))?, \$([\d.]+)(?: \(×([\d.]+)\))?)?; (?:median of (\d+) Slices of (.+?)|(\d+) files at the median rate of (\d+) sized Slices of (.+?))(?:, corrected from (\d+) predictions? of (.+))?$/;

/** A Predicted line's figures, and the uncorrected median they were scaled from; null when it is not one. */
export function parsePredicted(text) {
  const match = PREDICTED.exec(text ?? "");
  if (!match) return null;
  const factor = (value) => (value === undefined ? 1 : Number(value));
  const context = Number(match[1].replace(/,/g, ""));
  const workingMs = match[3] === undefined ? null : Number(match[3]) * 60_000;
  const usd = match[5] === undefined ? null : Number(match[5]);
  const base = (value, scale) => (value === null ? null : value / factor(scale));
  return {
    context,
    workingMs,
    usd,
    sized: match[9] !== undefined,
    base: { context: base(context, match[2]), workingMs: base(workingMs, match[4]), usd: base(usd, match[6]) },
  };
}

/** What one task folder's History holds: its Slices' measures and predictions, its delegations' measures. */
function taskFigures(dir) {
  let entries;
  try {
    entries = parseHistory5(readFileSync(join(dir, HISTORY_FILE), "utf8")).entries;
  } catch {
    return null;
  }
  return {
    dir,
    slices: entries
      .filter((entry) => entry.kind === "slice")
      .map((entry) => ({
        measure: measureOf(entry),
        predicted: parsePredicted(fieldText(entry, "Predicted")),
        files: filesIn(fieldText(entry, "Files")),
      })),
    delegations: entries
      .filter((entry) => entry.kind === "delegation")
      .map((entry) => ({ kind: fieldText(entry, "Kind"), measure: measureOf(entry) })),
  };
}

function taskDirs(tasksFolder) {
  if (!existsSync(tasksFolder)) return [];
  return readdirSync(tasksFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^task-\d{3,}-/.test(entry.name))
    .map((entry) => join(tasksFolder, entry.name))
    .sort();
}

function projectNames(home) {
  const folder = join(home, "projects");
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const storeTaskDirs = (home) => [
  ...projectNames(home).flatMap((name) => taskDirs(join(home, "projects", name, "tasks"))),
  ...taskDirs(join(home, "tasks")),
];

/**
 * The pools a task's figures come from, nearest first: the task, its project, the whole store; with no task (a plan
 * before one exists), the store at `home` alone.
 */
function poolsFor(recordPath, home) {
  if (!recordPath) return home && isFreeflowStore(home) ? [{ name: "the store", dirs: storeTaskDirs(home) }] : [];
  const dir = dirname(resolve(recordPath));
  const pools = [{ name: "this task", dirs: [dir] }];
  const store = freeflowStoreOf(dir);
  if (!store) return pools;
  const tasks = dirname(dir);
  if (basename(tasks) === "tasks" && dirname(dirname(tasks)) === join(store, "projects")) {
    const project = basename(dirname(tasks));
    pools.push({ name: `project ${project}`, dirs: taskDirs(tasks) });
  }
  pools.push({ name: "the store", dirs: storeTaskDirs(store) });
  return pools;
}

function loadPools(recordPath, home = null) {
  const read = new Map();
  return poolsFor(recordPath, home).map((pool) => {
    const tasks = pool.dirs
      .map((dir) => {
        if (!read.has(dir)) read.set(dir, taskFigures(dir));
        return read.get(dir);
      })
      .filter(Boolean);
    return {
      name: pool.name,
      slices: tasks.flatMap((task) => task.slices),
      delegations: tasks.flatMap((task) => task.delegations),
    };
  });
}

const complete = (slices) => slices.filter((slice) => slice.measure && !slice.measure.partial);

/** The model and effort that took the most of these measures' cost (or tokens, where none is priced). */
function mostBilled(measures) {
  const totals = new Map();
  for (const measure of measures)
    for (const [key, billed] of Object.entries(measure.billed))
      totals.set(
        key,
        (totals.get(key) ?? 0) + (billed.usd || billed.input + billed.written + billed.read + billed.output),
      );
  return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The median and range of the nearest pool with enough measured Slices, or null. */
function sizeFrom(pools) {
  for (const pool of pools) {
    const measured = complete(pool.slices);
    const figures = measured.map((slice) => figuresOf(slice.measure));
    if (figures.length >= MIN_MEASURED)
      return {
        pool: pool.name,
        n: figures.length,
        model: mostBilled(measured.map((slice) => slice.measure)),
        ...Object.fromEntries(QUANTITIES.map((name) => [name, spread(figures.map((each) => each[name]))])),
      };
  }
  return null;
}

/**
 * The per-file rate of the nearest pool with enough sized Slices (P15, T13): each Slice's figures over the files it
 * added, changed or renamed; the median and range per quantity, or null.
 */
function rateFrom(pools) {
  for (const pool of pools) {
    const sized = complete(pool.slices).filter((slice) => slice.files > 0);
    if (sized.length < MIN_MEASURED) continue;
    const rates = sized.map((slice) => {
      const figures = figuresOf(slice.measure);
      return Object.fromEntries(
        QUANTITIES.map((name) => [name, figures[name] === null ? null : figures[name] / slice.files]),
      );
    });
    return {
      pool: pool.name,
      n: sized.length,
      model: mostBilled(sized.map((slice) => slice.measure)),
      ...Object.fromEntries(QUANTITIES.map((name) => [name, spread(rates.map((each) => each[name]))])),
    };
  }
  return null;
}

/**
 * Actual over the uncorrected prediction, per quantity, from the nearest pool with any Slice predicted the same way
 * (from its size, or as the median Slice) that has its actual (P16): their geometric mean, pulled toward 1 by
 * CORRECTION_PRIOR on-target Slices, with the raw range. A per-file prediction is corrected only by per-file ones.
 */
function correctionFrom(pools, sized) {
  for (const pool of pools) {
    const pairs = complete(pool.slices).filter((slice) => slice.predicted && slice.predicted.sized === sized);
    if (!pairs.length) continue;
    const ratios = (name) => {
      const values = pairs
        .filter((slice) => figuresOf(slice.measure)[name] && slice.predicted.base[name])
        .map((slice) => figuresOf(slice.measure)[name] / slice.predicted.base[name]);
      if (!values.length) return { median: 1, min: 1, max: 1 };
      const logs = values.reduce((total, value) => total + Math.log(value), 0);
      return {
        median: Math.exp(logs / (values.length + CORRECTION_PRIOR)),
        min: Math.min(...values),
        max: Math.max(...values),
      };
    };
    return { pool: pool.name, n: pairs.length, ...Object.fromEntries(QUANTITIES.map((name) => [name, ratios(name)])) };
  }
  return null;
}

/** Whether a prediction has time and cost, which only Slices read from a transcript give. */
const priced = (prediction) => Boolean(prediction) && prediction.usd !== null && prediction.workingMs !== null;

/**
 * A Slice's prediction: with its size in files and a pool with enough sized Slices, the size times their median
 * per-file rate (P15); otherwise the median Slice. Each quantity is scaled by the correction, with its low and high
 * from the lowest and highest rate or Slice.
 */
function predictFrom(pools, files = null) {
  const rate = files ? rateFrom(pools) : null;
  const size = rate ? null : sizeFrom(pools);
  if (!rate && !size) return null;
  const basis = rate ?? size;
  const scale = rate ? files : 1;
  const correction = correctionFrom(pools, Boolean(rate));
  const factor = (name) => (correction ? correction[name].median : 1);
  const prediction = { size: basis, rate, files: rate ? files : null, correction, factor, low: {}, high: {} };
  for (const name of QUANTITIES) {
    const figure = basis[name];
    prediction[name] = figure ? figure.median * scale * factor(name) : null;
    prediction.low[name] = figure ? figure.min * scale * factor(name) : null;
    prediction.high[name] = figure ? figure.max * scale * factor(name) : null;
  }
  return prediction;
}

function renderPredicted(prediction) {
  const scaled = (text, name) => {
    const factor = prediction.factor(name).toFixed(2);
    return factor === "1.00" ? text : `${text} (×${factor})`;
  };
  const { size, correction } = prediction;
  const timeAndCost =
    prediction.usd === null || prediction.workingMs === null
      ? ""
      : `, ${scaled(`working ${minutes(prediction.workingMs)} min`, "workingMs")}, ${scaled(dollars(prediction.usd), "usd")}`;
  const basis = prediction.rate
    ? `${prediction.files} files at the median rate of ${size.n} sized Slices of ${size.pool}`
    : `median of ${size.n} Slices of ${size.pool}`;
  const corrected = correction ? `, corrected from ${plural(correction.n, "prediction")} of ${correction.pool}` : "";
  return `${scaled(`context ${count(prediction.context)}`, "context")}${timeAndCost}; ${basis}${corrected}`;
}

/**
 * The prediction a Slice starts with (P89, P15, P16): from its size in files where it has one and enough sized Slices
 * exist, else the median Slice of the nearest pool with enough measured, scaled by the correction; null with too few
 * measured anywhere.
 */
export function predictSlice(recordPath, files = null) {
  const prediction = predictFrom(loadPools(recordPath), files);
  return prediction && { ...prediction, line: renderPredicted(prediction) };
}

const counts = (pools) =>
  pools.length
    ? pools.map((pool) => `${pool.name} ${complete(pool.slices).length}`).join(", ")
    : "no task or store to draw on";

function priceLine(table) {
  return `Prices: API list price as of ${table.date}, from ${table.source}; on a subscription, what the work would cost through the API. This prints costs; Execute Work's delegation reference chooses models.`;
}

const cycleName = (cycle) =>
  cycle === 0 ? "this compaction cycle" : cycle === 1 ? "the next compaction cycle" : `compaction cycle +${cycle}`;
const laterName = (cycle) => (cycle === 1 ? "the next" : cycleName(cycle));

/** Whether a Slice's dependency text names another Slice, by its title or the part of it before " — ". */
function dependsOn(item, other) {
  const text = (item.after ?? "").toLowerCase();
  const title = other.title.toLowerCase();
  return Boolean(text) && (text.includes(title) || text.includes(title.split(" — ")[0]));
}

/** Groups of Slices with no dependency between them, in the order they could start. */
function waves(items) {
  const groups = [];
  let left = [...items];
  while (left.length) {
    const wave = left.filter((item) => !left.some((other) => other !== item && dependsOn(item, other)));
    if (!wave.length) break;
    groups.push(wave);
    left = left.filter((item) => !wave.includes(item));
  }
  return groups;
}

/** The delegations measured in the nearest pool that has any, grouped by kind, model and effort. */
function delegationRows(pools, fanOut) {
  const pool = pools.find((each) => each.delegations.some((item) => item.measure));
  if (!pool) return fanOut ? ["No delegation is measured yet, so a fan-out cannot be priced."] : [];
  const groups = new Map();
  for (const item of pool.delegations.filter((each) => each.measure)) {
    const [key] = Object.entries(item.measure.billed).sort((a, b) => b[1].usd - a[1].usd)[0] ?? ["unknown"];
    const name = `${item.kind}, ${key}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(figuresOf(item.measure));
  }
  return [
    `Delegations measured (${pool.name}), the median of each:`,
    ...[...groups].map(([name, figures]) => {
      const each = Object.fromEntries(
        QUANTITIES.map((quantity) => [quantity, spread(figures.map((f) => f[quantity]))?.median ?? null]),
      );
      const time = each.workingMs === null ? "" : `, working ${duration(each.workingMs)}`;
      const cost =
        each.usd === null
          ? ""
          : `, ${dollars(each.usd)} each${fanOut ? `; a fan-out of ${fanOut}: about ${dollars(each.usd * fanOut)}` : ""}`;
      return `- ${name}: ${plural(figures.length, "delegation")}, context about ${count(each.context)}${time}${cost}`;
    }),
  ];
}

/**
 * `estimate --plan` (P84): each Slice left with its expected size, the compaction cycle it lands in counting from
 * what is left of this one, any Slice bigger than a compaction cycle, the totals, the Slices with no dependency
 * between them, and delegated work's measured cost; with `json`, the same as data, which Discuss Work's
 * `choices.mjs agreement --plan` renders as the agreement's size and plan (P87).
 */
export function planView({
  recordPath,
  home,
  items,
  from,
  used,
  window,
  start,
  done,
  fanOut,
  json = false,
  table = PRICES,
}) {
  if (!items.length) throw new PlanError("No Slice is left to plan: Future Work proposes none, and no list was given.");
  const pools = loadPools(recordPath, home);
  const median = predictFrom(pools);
  const rate = rateFrom(pools);
  const lines = [`Plan: ${plural(items.length, "Slice")} left, from ${from}.`];
  if (!median && !done)
    throw new PlanError(
      `There are fewer than ${MIN_MEASURED} measured Slices (${counts(pools)}): pass --done <n>, the parts of the work done in this compaction cycle, to plan at its rate.`,
    );
  // Each Slice's prediction: from its size where it has one and sized Slices exist (P15), else the median Slice,
  // else, with too few measured, at most this compaction cycle's rate per part done.
  const atRate = median ? null : used / done;
  const predictions = items.map((item) => (item.size && rate ? predictFrom(pools, item.size) : median));
  const contextOf = (index) => predictions[index]?.context ?? atRate;
  const anyPriced = predictions.every((each) => priced(each));
  const sumOf = (pick) => predictions.reduce((total, each, index) => total + pick(each, index), 0);
  const total = {
    context: sumOf((_, index) => contextOf(index)),
    low: sumOf((each, index) => each?.low.context ?? contextOf(index)),
    high: sumOf((each, index) => each?.high.context ?? contextOf(index)),
  };
  const money = anyPriced
    ? {
        usd: sumOf((each) => each.usd),
        low: sumOf((each) => each.low.usd),
        high: sumOf((each) => each.high.usd),
        workingMs: sumOf((each) => each.workingMs),
      }
    : null;
  const sizedCount = items.filter((item, index) => predictions[index]?.rate).length;
  const measured = pools.length ? complete(pools[0].slices).length : 0;
  const correction = predictions.find((each) => each?.correction)?.correction ?? null;
  // What the plan rests on, first, with the range it leaves (P18).
  const sureness = median
    ? `from ${plural(median.size.n, "measured Slice")} of ${median.size.pool}${rate ? `, ${rate.n} of them sized` : ", none sized"}; ${sizedCount} of ${items.length} Slices left sized; ${correction ? `corrected from ${plural(correction.n, "prediction")} of ${correction.pool}` : "not corrected yet"}`
    : `from this compaction cycle's rate, with ${plural(measured, "measured Slice")}: an upper bound, no cost`;
  lines.push(
    money
      ? `Expected in all: ${dollars(money.low)} to ${dollars(money.high)} at list price, most likely ${dollars(money.usd)}; context ${count(total.low)} to ${count(total.high)}, most likely ${count(total.context)}; working about ${duration(money.workingMs)}. Resting on: ${sureness}.`
      : `Expected in all: context ${count(total.low)} to ${count(total.high)}, most likely ${count(total.context)}. Resting on: ${sureness}.`,
  );
  if (median) {
    const { size } = median;
    const ranges = [
      `context ${count(size.context.min)} to ${count(size.context.max)}`,
      ...(size.workingMs ? [`working ${minutes(size.workingMs.min)} to ${minutes(size.workingMs.max)} min`] : []),
      ...(size.usd ? [`${dollars(size.usd.min)} to ${dollars(size.usd.max)}`] : []),
    ].join("; ");
    const timeAndCost = priced(median)
      ? `, working about ${duration(median.workingMs)}, about ${dollars(median.usd)} at list price${size.model ? `, mostly ${size.model}` : ""}`
      : ", no time or cost (its Slices were measured from --used)";
    if (sizedCount < items.length)
      lines.push(
        `A Slice with no size, expected: context about ${count(median.context)}${timeAndCost}: the median of ${size.n} measured Slices of ${size.pool} (${ranges}), ${median.correction ? `corrected by ${median.correction.context.median.toFixed(2)}, from actual over predicted of ${plural(median.correction.n, "prediction")} of ${median.correction.pool} (context ${median.correction.context.min.toFixed(2)} to ${median.correction.context.max.toFixed(2)})` : "not corrected: no past prediction of a Slice with no size has its actual"}.`,
      );
  } else {
    lines.push(
      `Each Slice, expected: context at most about ${count(atRate)}, at this compaction cycle's rate (${count(used)} tokens over ${done} parts done), since fewer than ${MIN_MEASURED} Slices are measured (${counts(pools)}); no cost or time until they are.`,
    );
  }
  if (rate && sizedCount) {
    const perFile = [
      `context ${count(rate.context.median)} (${count(rate.context.min)} to ${count(rate.context.max)})`,
      ...(rate.workingMs ? [`working ${(rate.workingMs.median / 60_000).toFixed(1)} min`] : []),
      ...(rate.usd ? [`${dollars(rate.usd.median)} (${dollars(rate.usd.min)} to ${dollars(rate.usd.max)})`] : []),
    ].join(", ");
    const sizedCorrection = predictions.find((each) => each?.rate)?.correction;
    lines.push(
      `A sized Slice, expected: its files times the median per file of ${rate.n} sized Slices of ${rate.pool}: ${perFile}${sizedCorrection ? `, corrected by ${sizedCorrection.context.median.toFixed(2)} from ${plural(sizedCorrection.n, "prediction")} of ${sizedCorrection.pool}` : "; not corrected: no sized prediction has its actual yet"}.`,
    );
  } else if (items.some((item) => item.size))
    lines.push(
      `Sizes are given but fewer than ${MIN_MEASURED} closed Slices have Files (slice size adds them), so every Slice is planned as the median one.`,
    );
  const notice = NOTICE_AT * window.tokens;
  const startsAt = start?.tokens ?? 0;
  const capacity = notice - startsAt;
  if (capacity <= 0)
    throw new PlanError(
      `A compaction cycle starts at about ${count(startsAt)} tokens, at or past the notice point: nothing fits.`,
    );
  lines.push(
    `Context now: about ${count(used)} of ${count(window.tokens)} tokens; Freeflow's notice at about ${count(notice)}. ${start ? `A compaction cycle starts at about ${count(startsAt)} (${start.from}), so each later one holds about ${count(capacity)}.` : `Where a compaction cycle starts is unknown (no transcript read): taken as empty, so each later compaction cycle holds about ${count(capacity)}.`}`,
  );
  // Each Slice from where the last one ended: what does not fit before the notice goes on after the next start.
  const inCycle = new Map();
  const usdInCycle = new Map();
  const landings = [];
  let cycle = 0;
  let position = used;
  for (const [index, item] of items.entries()) {
    const context = contextOf(index);
    const usdPerToken = priced(predictions[index]) ? predictions[index].usd / context : null;
    const add = (number, amount) => {
      inCycle.set(number, (inCycle.get(number) ?? 0) + amount);
      if (usdPerToken !== null) usdInCycle.set(number, (usdInCycle.get(number) ?? 0) + amount * usdPerToken);
    };
    if (position >= notice) {
      cycle += 1;
      position = startsAt;
    }
    const first = cycle;
    let left = context;
    while (position + left > notice) {
      add(cycle, notice - position);
      left -= notice - position;
      cycle += 1;
      position = startsAt;
    }
    add(cycle, left);
    position += left;
    const oversized = context > capacity;
    const prediction = predictions[index];
    landings.push({
      title: item.title,
      first,
      last: cycle,
      oversized,
      files: item.size ?? null,
      context: Math.round(context),
      usd: priced(prediction) ? prediction.usd : null,
    });
    const landing = first === cycle ? cycleName(first) : `${cycleName(first)} into ${laterName(cycle)}`;
    const figures = `context about ${count(context)}${priced(prediction) ? `, about ${dollars(prediction.usd)}` : ""}`;
    lines.push(
      `- ${item.title}${item.size ? ` (${plural(item.size, "file")})` : ""}: ${landing}; ${figures}${oversized ? `; bigger than a compaction cycle (about ${count(capacity)}): split it or delegate it` : ""}`,
    );
  }
  const reach = cycle === 0 ? "within this compaction cycle" : `reaching ${cycleName(cycle)}`;
  lines.push(
    money
      ? `In all: about ${count(total.context)} tokens of context, ${reach}; working about ${duration(money.workingMs)}; about ${dollars(money.usd)} at list price (${dollars(money.low)} to ${dollars(money.high)}).`
      : `In all: about ${count(total.context)} tokens of context, ${reach}.`,
  );
  const parallel = waves(items)
    .filter((wave) => wave.length > 1)
    .map((wave) => wave.map((item) => item.title));
  if (parallel.length)
    lines.push(
      `No dependency between them, so they could run in parallel through delegation: ${parallel.map((wave) => wave.join(", ")).join("; then ")}.`,
    );
  lines.push(...delegationRows(pools, fanOut));
  if (money || pools.some((pool) => pool.delegations.some((item) => item.measure))) lines.push(priceLine(table));
  if (!json) return `${lines.join("\n")}\n`;
  const perSlice = median ?? null;
  return `${JSON.stringify(
    {
      from,
      slices: items.length,
      perSlice: {
        context: Math.round(perSlice ? perSlice.context : atRate),
        workingMs: priced(perSlice) ? Math.round(perSlice.workingMs) : null,
        usd: priced(perSlice) ? perSlice.usd : null,
        model: perSlice?.size.model ?? null,
        upperBound: !perSlice,
        source: perSlice
          ? `the median of ${perSlice.size.n} measured Slices of ${perSlice.size.pool}${perSlice.correction ? `, corrected from ${plural(perSlice.correction.n, "prediction")}` : ""}`
          : `this compaction cycle's rate (${count(used)} tokens over ${done} parts done)`,
      },
      sureness,
      landings,
      perCycle: [...inCycle].map(([number, context]) => ({
        cycle: number,
        context: Math.round(context),
        usd: money ? (usdInCycle.get(number) ?? 0) : null,
      })),
      cycles: cycle + 1,
      total: {
        context: Math.round(total.context),
        contextLow: Math.round(total.low),
        contextHigh: Math.round(total.high),
        workingMs: money ? Math.round(money.workingMs) : null,
        usd: money ? money.usd : null,
        usdLow: money ? money.low : null,
        usdHigh: money ? money.high : null,
      },
      parallel,
      prices: { date: table.date, source: table.source },
    },
    null,
    2,
  )}\n`;
}

/** The Slices left in a record's Future Work, with their Dependencies. */
export function futureItems(recordPath) {
  const record = parseRecord5(readFileSync(recordPath, "utf8"));
  return record.future.map((item) => ({
    title: item.title,
    after: fieldText(item, "Dependencies"),
    size: filesIn(fieldText(item, "Size")),
  }));
}

/**
 * A list given as input: one Slice a line, `- <title>`, then optionally ` · size: <n>` (the files it will add or
 * change) and ` · after: <titles it waits for>`, in either order.
 */
export function listItems(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const [title, ...parts] = line.slice(2).split(/\s+·\s+(?=(?:after|size):)/);
      const part = (name) =>
        parts
          .find((each) => each.startsWith(`${name}:`))
          ?.slice(name.length + 1)
          .trim() ?? "";
      const size = Number.parseInt(part("size"), 10);
      return { title: title.trim(), after: part("after"), size: Number.isInteger(size) && size > 0 ? size : null };
    });
}

function totalsOf(slices, delegations) {
  const measured = slices.filter((slice) => slice.measure);
  const total = (items, name) => sum(items.map((item) => figuresOf(item.measure)[name]));
  const measuredDelegations = delegations.filter((item) => item.measure);
  return {
    slices: measured.length,
    partial: measured.filter((slice) => slice.measure.partial).length,
    context: total(measured, "context"),
    workingMs: total(measured, "workingMs"),
    usd: total(measured, "usd"),
    delegations: measuredDelegations.length,
    delegationUsd: total(measuredDelegations, "usd"),
  };
}

function requireStore(home) {
  if (!isFreeflowStore(home)) throw new PlanError(`No Freeflow store at ${home}.`);
}

/** `estimate --project <name>` (P85): each task's measured totals, and what its proposed Slices would take. */
export function projectView(home, name) {
  requireStore(home);
  const dirs = taskDirs(join(home, "projects", name, "tasks"));
  if (!projectNames(home).includes(name))
    throw new PlanError(`No project ${name}; projects: ${projectNames(home).join(", ") || "none"}.`);
  const lines = [`Project ${name}: ${plural(dirs.length, "task")}; costs at API list price.`];
  const all = { slices: 0, context: 0, workingMs: 0, usd: 0, proposedContext: 0, proposedUsd: 0, proposed: false };
  for (const dir of dirs) {
    const id = `${name}/${/^task-\d{3,}/.exec(basename(dir))[0]}`;
    let record = null;
    try {
      record = parseRecord5(readFileSync(join(dir, "record.md"), "utf8"));
    } catch (error) {
      lines.push(`- ${id} — not readable as Schema 5: ${error.message}`);
      continue;
    }
    const figures = taskFigures(dir) ?? { slices: [], delegations: [] };
    const totals = totalsOf(figures.slices, figures.delegations);
    const parts = [`- ${id} — ${record.header.name}`];
    parts.push(
      totals.slices
        ? `${plural(totals.slices, "Slice")} measured${totals.partial ? ` (${totals.partial} partly)` : ""}: context ${count(totals.context)}, working ${duration(totals.workingMs)}, ${dollars(totals.usd)}`
        : "no Slice measured",
    );
    if (totals.delegations)
      parts.push(`${plural(totals.delegations, "delegation")} measured: ${dollars(totals.delegationUsd)}`);
    const proposed = record.future.length;
    if (!proposed) parts.push("nothing proposed");
    else {
      const prediction = predictFrom(loadPools(join(dir, "record.md")));
      if (prediction) {
        all.proposed = true;
        all.proposedContext += prediction.context * proposed;
        all.proposedUsd += prediction.usd * proposed;
        const source = prediction.size.pool === "this task" ? "this task's" : `${prediction.size.pool}'s`;
        parts.push(
          `${plural(proposed, "Slice")} proposed: about ${count(prediction.context * proposed)}, about ${dollars(prediction.usd * proposed)} (${source} data)`,
        );
      } else
        parts.push(`${plural(proposed, "Slice")} proposed: not sized (fewer than ${MIN_MEASURED} Slices measured)`);
    }
    lines.push(parts.join(" · "));
    all.slices += totals.slices;
    all.context += totals.context;
    all.workingMs += totals.workingMs;
    all.usd += totals.usd + totals.delegationUsd;
  }
  lines.push(
    `In all: ${plural(all.slices, "Slice")} measured, context ${count(all.context)}, working ${duration(all.workingMs)}, ${dollars(all.usd)}${all.proposed ? `; proposed: about ${count(all.proposedContext)}, about ${dollars(all.proposedUsd)}` : ""}.`,
  );
  return `${lines.join("\n")}\n`;
}

function addBilled(rows, key, measure) {
  for (const [name, billed] of Object.entries(measure.billed)) {
    const row = rows.get(`${key}${name}`) ?? { n: 0, input: 0, written: 0, read: 0, output: 0, usd: 0 };
    row.n += 1;
    for (const part of ["input", "written", "read", "output"]) row[part] += billed[part];
    row.usd += billed.priced ? billed.usd : 0;
    rows.set(`${key}${name}`, row);
  }
}

const billedRow = (name, row, word) =>
  `- ${name}: ${plural(row.n, word)}, ${count(row.input)} in, ${count(row.written)} written, ${count(row.read)} read, ${count(row.output)} out, ${dollars(row.usd)}`;

/** `estimate --store` (B): every project's and task's measured use, by model and effort, and delegations by kind. */
export function storeView(home) {
  requireStore(home);
  const groups = [
    ...projectNames(home).map((name) => ({ name, dirs: taskDirs(join(home, "projects", name, "tasks")) })),
    { name: "no project", dirs: taskDirs(join(home, "tasks")) },
  ];
  const slices = new Map();
  const delegations = new Map();
  const byProject = [];
  let totalSlices = 0;
  let totalDelegations = 0;
  for (const group of groups) {
    const figures = group.dirs.map(taskFigures).filter(Boolean);
    const groupSlices = figures.flatMap((task) => task.slices);
    const groupDelegations = figures.flatMap((task) => task.delegations);
    for (const slice of groupSlices.filter((each) => each.measure)) addBilled(slices, "", slice.measure);
    for (const item of groupDelegations.filter((each) => each.measure))
      addBilled(delegations, `${item.kind}, `, item.measure);
    const totals = totalsOf(groupSlices, groupDelegations);
    totalSlices += totals.slices;
    totalDelegations += totals.delegations;
    if (group.dirs.length)
      byProject.push(
        `- ${group.name}: ${plural(group.dirs.length, "task")}, ${plural(totals.slices, "Slice")}${totals.delegations ? `, ${plural(totals.delegations, "delegation")}` : ""}, ${dollars(totals.usd + totals.delegationUsd)}`,
      );
  }
  const projects = groups.length - 1;
  const loose = groups.at(-1).dirs.length;
  const tasks = groups.reduce((sum, group) => sum + group.dirs.length, 0);
  const lines = [
    `The store: ${plural(projects, "project")} and ${plural(loose, "task")} in none; ${plural(tasks, "task")}, ${plural(totalSlices, "Slice")} measured, ${totalDelegations ? `${plural(totalDelegations, "delegation")} measured` : "no delegation measured"}; costs at API list price.`,
  ];
  if (slices.size)
    lines.push("Slices by model and effort:", ...[...slices].map(([name, row]) => billedRow(name, row, "Slice")));
  if (delegations.size)
    lines.push(
      "Delegations by kind, model and effort:",
      ...[...delegations].map(([name, row]) => billedRow(name, row, "delegation")),
    );
  if (byProject.length) lines.push("By project:", ...byProject);
  return `${lines.join("\n")}\n`;
}
