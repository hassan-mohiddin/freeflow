function parsePlanningReport(expectedTaskId, raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "rejected", reason: "invalid_json" };
  }
  if (value?.task_id !== expectedTaskId || value?.status !== "ready") {
    return { status: "rejected", reason: "identity_or_status" };
  }
  return { status: "accepted", value };
}

export function createPlanningSystem() {
  let canonicalRaw = null;

  function recordTaskReport(raw) {
    canonicalRaw = raw;
  }

  function direct(expectedTaskId, raw) {
    recordTaskReport(raw);
    return parsePlanningReport(expectedTaskId, raw);
  }

  function runtime(expectedTaskId, raw) {
    recordTaskReport(raw);
    return parsePlanningReport(expectedTaskId, raw);
  }

  function finishParent(expectedTaskId, raw) {
    recordTaskReport(raw);
    return parsePlanningReport(expectedTaskId, raw);
  }

  return {
    get canonicalRaw() { return canonicalRaw; },
    direct,
    runtime,
    finishParent,
  };
}
