// Extension points for later evaluator features. Every registry starts empty, and with nothing registered the
// evaluator writes exactly what it wrote before. A hook that throws is recorded as `{ error }` in its own slot;
// it never fails the run, the grade or the aggregate.

const HOOK_NAME = /^[a-z][A-Za-z0-9]*$/;
// Fields an aggregate group entry already has; a section may not replace one.
const AGGREGATE_GROUP_FIELDS = new Set([
  "id",
  "trials",
  "unreadableGrades",
  "gradeErrors",
  "runStates",
  "comparisons",
  "checks",
]);

function createRegistry(kind, reserved = new Set()) {
  const hooks = new Map();
  return {
    register(name, hook) {
      if (typeof name !== "string" || !HOOK_NAME.test(name) || reserved.has(name)) {
        throw new Error(`${kind} name must be a camelCase identifier that is not reserved: ${name}`);
      }
      if (typeof hook !== "function") throw new Error(`${kind} ${name} must be a function`);
      if (hooks.has(name)) throw new Error(`${kind} ${name} is already registered`);
      hooks.set(name, hook);
      return () => {
        if (hooks.get(name) === hook) hooks.delete(name);
      };
    },
    entries() {
      return [...hooks.entries()];
    },
  };
}

function failure(error) {
  return { error: error instanceof Error ? error.message : String(error) };
}

const aggregators = createRegistry("aggregator", AGGREGATE_GROUP_FIELDS);
const postRunHooks = createRegistry("post-run hook");
const runMetricsHooks = createRegistry("run-metrics hook");

/** Aggregator: `hook({ id, arms, reference, trials: [{ id, directory, state, grade, runs }] })`, where `directory` is the trial's group directory; its result is stored on the aggregate group entry under `<name>`. */
export const registerAggregator = aggregators.register;

/** Post-run hook: `hook({ group, arm, run, root, directory, signal })` for each executed run, before run.json is written; its result is stored in run.json under `postRun.<name>`. */
export const registerPostRunHook = postRunHooks.register;

/** Run-metrics hook: synchronous `hook({ group, arm, subject, observation, run })` where pi.mjs assembles run.json; its returned object is merged into `run.metrics`. */
export const registerRunMetricsHook = runMetricsHooks.register;

export function hasAggregators() {
  return aggregators.entries().length > 0;
}

/** Each registered aggregator's section for one aggregate group, by name. */
export async function aggregateSections(input) {
  const sections = {};
  for (const [name, hook] of aggregators.entries()) {
    try {
      sections[name] = await hook(input);
    } catch (error) {
      sections[name] = failure(error);
    }
  }
  return sections;
}

/** Each registered post-run hook's record for one run, by name; null when none is registered. */
export async function postRunRecords(context) {
  const entries = postRunHooks.entries();
  if (entries.length === 0) return null;
  const records = {};
  for (const [name, hook] of entries) {
    try {
      records[name] = await hook(context);
    } catch (error) {
      records[name] = failure(error);
    }
  }
  return records;
}

/** The registered run-metrics hooks' fields merged in registration order; null when none is registered. */
export function runMetrics(context) {
  const entries = runMetricsHooks.entries();
  if (entries.length === 0) return null;
  const metrics = {};
  for (const [name, hook] of entries) {
    try {
      Object.assign(metrics, hook(context));
    } catch (error) {
      metrics[name] = failure(error);
    }
  }
  return metrics;
}
