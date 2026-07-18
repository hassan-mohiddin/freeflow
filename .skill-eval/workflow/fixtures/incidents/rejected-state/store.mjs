function parsePlanningReport(expectedTaskId, raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "rejected", reason: "invalid_json" };
  }
  if (value?.status !== "ready" || value?.task_id !== expectedTaskId) {
    return { status: "rejected", reason: "identity_or_status" };
  }
  return { status: "accepted", value };
}

export function createPlanningStore(initialCanonicalRaw = null) {
  let canonicalRaw = initialCanonicalRaw;
  const rejected = [];
  return {
    get canonicalRaw() {
      return canonicalRaw;
    },
    get rejectedPublications() {
      return [...rejected];
    },
    publish(expectedTaskId, raw) {
      canonicalRaw = raw;
      const result = parsePlanningReport(expectedTaskId, raw);
      if (result.status === "rejected") rejected.push({ raw, reason: result.reason });
      return result;
    },
  };
}
