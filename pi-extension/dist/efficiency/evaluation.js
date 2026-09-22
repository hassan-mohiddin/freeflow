const METRICS = [
  "requests",
  "providerInputBytes",
  "toolSchemaBytes",
  "toolArgumentBytes",
  "resultBytes",
  "programSourceBytes",
  "emittedBytes",
  "recoveryBytes",
  "failures",
];
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function validateMetrics(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== METRICS.length ||
    Object.keys(value).some((key) => !METRICS.includes(key)) ||
    METRICS.some((key) => !finite(value[key]))
  )
    throw new Error("invalid_offline_metrics: Offline metrics must be finite non-negative observations.");
}
export function runOfflineEvaluation(scenarios) {
  if (!Array.isArray(scenarios) || !scenarios.length || scenarios.length > 1000)
    throw new Error("invalid_offline_scenarios: Supply 1-1000 fixed scenarios.");
  const ids = new Set();
  const totals = Object.fromEntries(METRICS.map((key) => [key, { baseline: 0, candidate: 0, delta: 0 }]));
  const rows = scenarios.map((scenario) => {
    if (
      !scenario ||
      typeof scenario !== "object" ||
      Array.isArray(scenario) ||
      Object.keys(scenario).length !== 4 ||
      Object.keys(scenario).some((key) => !["id", "accepted", "baseline", "candidate"].includes(key)) ||
      typeof scenario.id !== "string" ||
      !scenario.id ||
      scenario.id.length > 256 ||
      ids.has(scenario.id)
    )
      throw new Error("invalid_offline_scenarios: Scenario IDs must be unique bounded strings.");
    ids.add(scenario.id);
    if (typeof scenario.accepted !== "boolean")
      throw new Error("invalid_offline_scenarios: Scenario acceptance must be observed explicitly.");
    validateMetrics(scenario.baseline);
    validateMetrics(scenario.candidate);
    const delta = Object.fromEntries(METRICS.map((key) => [key, scenario.candidate[key] - scenario.baseline[key]]));
    for (const key of METRICS) {
      totals[key].baseline += scenario.baseline[key];
      totals[key].candidate += scenario.candidate[key];
      totals[key].delta += delta[key];
    }
    return {
      id: scenario.id,
      accepted: scenario.accepted,
      baseline: scenario.baseline,
      candidate: scenario.candidate,
      delta,
    };
  });
  return {
    version: 1,
    mode: "offline",
    coverage: "fixed-scripted-scenarios",
    acceptedScenarios: rows.filter((row) => row.accepted).length,
    rejectedScenarios: rows.filter((row) => !row.accepted).length,
    totals,
    scenarios: rows,
    claims: {
      bytes: "measured serialized bytes at the fixture boundary",
      requests: "observed scripted request occurrences",
      providerCacheHits: "not observed",
      billing: "not observed",
      modelQuality: "not observed",
    },
  };
}
export function validateLiveEvaluationRequest(value) {
  const exact = (candidate, keys) =>
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    Object.keys(candidate).length === keys.length &&
    Object.keys(candidate).every((key) => keys.includes(key));
  if (
    !exact(value, ["approved", "tasks", "provider", "model", "credentialSource", "qualityTolerance", "budget"]) ||
    value.approved !== true ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 1 ||
    value.tasks.length > 100 ||
    !value.tasks.every(
      (task) =>
        exact(task, ["id", "acceptance"]) &&
        typeof task.id === "string" &&
        task.id.length > 0 &&
        task.id.length <= 256 &&
        typeof task.acceptance === "string" &&
        task.acceptance.length > 0 &&
        task.acceptance.length <= 4000,
    ) ||
    new Set(value.tasks.map((task) => task.id)).size !== value.tasks.length ||
    typeof value.provider !== "string" ||
    !value.provider ||
    value.provider.length > 256 ||
    typeof value.model !== "string" ||
    !value.model ||
    value.model.length > 256 ||
    !["environment", "host-runtime"].includes(value.credentialSource) ||
    typeof value.qualityTolerance !== "number" ||
    value.qualityTolerance < 0 ||
    value.qualityTolerance > 1 ||
    !exact(value.budget, ["currency", "maximumCost", "maximumRuns"]) ||
    typeof value.budget.currency !== "string" ||
    !value.budget.currency ||
    value.budget.currency.length > 16 ||
    !finite(value.budget.maximumCost) ||
    value.budget.maximumCost <= 0 ||
    !Number.isSafeInteger(value.budget.maximumRuns) ||
    value.budget.maximumRuns < 1 ||
    value.budget.maximumRuns > 1000
  )
    throw new Error(
      "live_evaluation_not_authorized: Require explicit approval, tasks, acceptance, credential source, quality tolerance and total budget.",
    );
  return structuredClone(value);
}
function boundedUsage(value) {
  if (value === undefined) return undefined;
  try {
    const text = JSON.stringify(value);
    return Buffer.byteLength(text, "utf8") <= 64 * 1024 ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}
export async function runLiveEvaluation(raw, execute) {
  const request = validateLiveEvaluationRequest(raw);
  const results = [];
  let observedCost = 0;
  for (const task of request.tasks) {
    if (results.length >= request.budget.maximumRuns || observedCost >= request.budget.maximumCost) break;
    const result = await execute(task, request, {
      cost: Math.max(0, request.budget.maximumCost - observedCost),
      runs: request.budget.maximumRuns - results.length,
    });
    const cost = finite(result.cost) ? result.cost : undefined;
    if (cost !== undefined) observedCost += cost;
    const usage = boundedUsage(result.usage);
    results.push({
      taskId: task.id,
      accepted: result.accepted === true,
      ...(cost !== undefined ? { cost } : {}),
      ...(usage !== undefined ? { usage } : {}),
      failures: Object.freeze(
        [...(result.failures ?? [])].slice(0, 100).map((failure) => String(failure).slice(0, 1000)),
      ),
    });
  }
  return {
    version: 1,
    mode: "live",
    provider: request.provider,
    model: request.model,
    currency: request.budget.currency,
    qualityTolerance: request.qualityTolerance,
    budget: structuredClone(request.budget),
    observedCost,
    costCoverage: results.every((result) => result.cost !== undefined) ? "complete-at-boundary" : "partial",
    acceptedTasks: results.filter((result) => result.accepted).length,
    attemptedTasks: results.length,
    stoppedByBudget:
      results.length < request.tasks.length &&
      (results.length >= request.budget.maximumRuns || observedCost >= request.budget.maximumCost),
    results,
  };
}
