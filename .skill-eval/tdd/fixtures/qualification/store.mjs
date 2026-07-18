function parse(expectedTaskId, raw) {
  try {
    const value = JSON.parse(raw);
    if (value?.task_id === expectedTaskId && value?.status === "ready") return { status: "accepted", value };
  } catch {}
  return { status: "rejected" };
}

export function createStore(initialCanonicalRaw = null) {
  let canonicalRaw = initialCanonicalRaw;
  const rejected = [];
  return {
    get canonicalRaw() {
      return canonicalRaw;
    },
    get rejected() {
      return [...rejected];
    },
    publish(taskId, raw) {
      canonicalRaw = raw;
      const result = parse(taskId, raw);
      if (result.status === "rejected") rejected.push(raw);
      return result;
    },
  };
}
