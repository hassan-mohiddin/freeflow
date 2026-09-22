const MAX_GROUPS = 100;
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
function addUsage(totals, costs, usage) {
  if (!usage) return;
  totals.input += finite(usage.input);
  totals.output += finite(usage.output);
  // Reasoning is reported separately and is already a subset of output.
  totals.reasoning += finite(usage.reasoning);
  totals.cacheRead += finite(usage.cacheRead);
  totals.cacheWrite += finite(usage.cacheWrite);
  totals.cacheWrite1h += finite(usage.cacheWrite1h);
  totals.totalTokens += finite(usage.totalTokens);
  totals.observedRecords += 1;
  if (usage.cost) {
    costs.input += finite(usage.cost.input);
    costs.output += finite(usage.cost.output);
    costs.cacheRead += finite(usage.cost.cacheRead);
    costs.cacheWrite += finite(usage.cost.cacheWrite);
    costs.total += finite(usage.cost.total);
    costs.observedRecords += 1;
  }
}
function sortedCounts(values, key) {
  return [...values]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_GROUPS)
    .map(([name, observations]) => ({ [key]: name, observations }));
}
export function efficiencyReport(observations) {
  const attempts = new Set();
  const usage = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    totalTokens: 0,
    observedRecords: 0,
  };
  const toolUsage = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    totalTokens: 0,
    observedRecords: 0,
  };
  const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, observedRecords: 0 };
  const toolCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, observedRecords: 0 };
  const tooling = {
    argumentBytes: 0,
    resultBytes: 0,
    programSourceBytes: 0,
    emittedBytes: 0,
    capturedBytes: 0,
    recoveredBytes: 0,
    failed: 0,
  };
  const profiles = new Map();
  const assignments = new Map();
  const operations = new Map();
  const runs = new Map();
  let preparedRequests = 0;
  let responses = 0;
  let assistantCompletions = 0;
  let successfulAssistants = 0;
  let failedAssistants = 0;
  let toolCompletions = 0;
  let incomplete = 0;
  for (const observation of observations) {
    if (observation.coverage !== "complete-at-boundary") incomplete += 1;
    const profile = observation.responsibility.profile;
    const profileTotals = profiles.get(profile) ?? { observations: 0, usageRecords: 0 };
    profileTotals.observations += 1;
    if ("usage" in observation && observation.usage) profileTotals.usageRecords += 1;
    profiles.set(profile, profileTotals);
    if (observation.responsibility.assignmentId)
      assignments.set(
        observation.responsibility.assignmentId,
        (assignments.get(observation.responsibility.assignmentId) ?? 0) + 1,
      );
    if (observation.kind === "prepared-request") {
      attempts.add(observation.attemptId);
      preparedRequests += 1;
      continue;
    }
    if (observation.kind !== "tool-complete" && observation.attemptId) attempts.add(observation.attemptId);
    if (observation.kind === "response-headers") {
      responses += 1;
      continue;
    }
    if (observation.kind === "assistant-complete") {
      assistantCompletions += 1;
      if (observation.stopReason === "error" || observation.stopReason === "aborted") failedAssistants += 1;
      else successfulAssistants += 1;
      addUsage(usage, cost, observation.usage);
      continue;
    }
    toolCompletions += 1;
    addUsage(toolUsage, toolCost, observation.usage);
    tooling.argumentBytes += finite(observation.argumentBytes);
    tooling.resultBytes += finite(observation.resultBytes);
    tooling.programSourceBytes += finite(observation.programSourceBytes);
    tooling.emittedBytes += finite(observation.emittedBytes);
    tooling.capturedBytes += finite(observation.capturedBytes);
    tooling.recoveredBytes += finite(observation.recoveredBytes);
    if (observation.isError) tooling.failed += 1;
    const operationFacts = [
      ...(observation.operation
        ? [
            {
              operation: observation.operation,
              failed: observation.isError,
              resultBytes: finite(observation.resultBytes),
            },
          ]
        : []),
      ...(observation.childOperations ?? []).map((child) => ({
        operation: child.operation,
        failed: child.status !== "succeeded",
        resultBytes: 0,
      })),
    ];
    for (const fact of operationFacts) {
      const totals = operations.get(fact.operation) ?? { calls: 0, failures: 0, resultBytes: 0 };
      totals.calls += 1;
      totals.failures += fact.failed ? 1 : 0;
      totals.resultBytes += fact.resultBytes;
      operations.set(fact.operation, totals);
    }
    if (observation.runId)
      runs.set(observation.runId, {
        ...(observation.programStatus ? { status: observation.programStatus } : {}),
        toolCallId: observation.toolCallId,
        resultBytes: finite(observation.resultBytes),
        emittedBytes: finite(observation.emittedBytes),
      });
  }
  const profileRows = [...profiles]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_GROUPS)
    .map(([profile, totals]) => ({ profile, ...totals }));
  const assignmentRows = sortedCounts(assignments, "assignmentId");
  const runRows = [...runs]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_GROUPS)
    .map(([runId, value]) => ({ runId, ...value }));
  const operationRows = [...operations]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_GROUPS)
    .map(([operation, value]) => ({ operation, ...value }));
  const groupingCoverage = [profiles.size, assignments.size, runs.size, operations.size].some(
    (size) => size > MAX_GROUPS,
  )
    ? "limited"
    : "complete-at-boundary";
  return {
    observations: observations.length,
    attempts: attempts.size,
    preparedRequests,
    responses,
    assistantCompletions,
    successfulAssistants,
    failedAssistants,
    toolCompletions,
    incomplete,
    usage,
    toolUsage,
    cost,
    toolCost,
    tooling,
    profiles: profileRows,
    assignments: assignmentRows,
    runs: runRows,
    operations: operationRows,
    groupingCoverage,
  };
}
