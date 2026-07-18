const EXECUTION_KINDS = new Set(["subject", "semantic"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function snapshot(value) {
  return deepFreeze(structuredClone(value));
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
}

function normalizeExecution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("settled execution must be an object");
  requireNonEmptyString(value.id, "settled execution id");
  if (!EXECUTION_KINDS.has(value.kind)) throw new Error(`unknown settled execution kind: ${value.kind}`);
  requireNonEmptyString(value.role, "settled execution role");
  if (!value.process || typeof value.process !== "object") throw new Error("settled execution process is required");
  if (!value.runtime_counters || typeof value.runtime_counters !== "object")
    throw new Error("settled execution runtime_counters are required");
  if (value.usage !== null && (typeof value.usage !== "object" || Array.isArray(value.usage))) {
    throw new Error("settled execution usage must be an object or null");
  }
  return snapshot(value);
}

function normalizeFailure(primary, secondary = null) {
  requireNonEmptyString(primary, "primary failure");
  if (secondary !== null) requireNonEmptyString(secondary, "secondary failure");
  return snapshot({ primary, secondary });
}

export function createEvaluationLedger({ modelDriven }) {
  if (typeof modelDriven !== "boolean") throw new Error("ledger modelDriven must be boolean");
  const records = [];
  const ids = new Set();

  return Object.freeze({
    record(value) {
      const execution = normalizeExecution(value);
      if (ids.has(execution.id)) throw new Error(`Settled execution already recorded: ${execution.id}`);
      ids.add(execution.id);
      records.push(execution);
      return execution;
    },

    entries() {
      return Object.freeze([...records]);
    },

    publicUsage() {
      let turns = 0;
      let providerRequests = 0;
      let providerRequestsAvailable = modelDriven;
      let toolCalls = 0;
      let tokensAvailable = modelDriven;
      let costAvailable = modelDriven;
      const tokens = { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 };
      let costUsd = 0;

      for (const execution of records) {
        const counters = execution.runtime_counters;
        turns += counters.turns_started ?? 0;
        if (typeof counters.provider_requests !== "number") providerRequestsAvailable = false;
        else providerRequests += counters.provider_requests;
        toolCalls += counters.tool_calls ?? 0;
        if (!modelDriven) continue;
        const usage = execution.usage;
        if (!usage) {
          tokensAvailable = false;
          costAvailable = false;
          continue;
        }
        tokens.input += usage.input ?? 0;
        tokens.output += usage.output ?? 0;
        tokens.cache_read += usage.cache_read ?? 0;
        tokens.cache_write += usage.cache_write ?? 0;
        tokens.total += usage.total_tokens ?? (usage.input ?? 0) + (usage.output ?? 0);
        const cost = usage.cost?.total_usd;
        if (typeof cost !== "number") costAvailable = false;
        else costUsd += cost;
      }

      return snapshot({
        turns,
        provider_requests: modelDriven && !providerRequestsAvailable ? null : providerRequests,
        tool_calls: toolCalls,
        tokens: tokensAvailable ? tokens : null,
        cost_usd: costAvailable ? costUsd : null,
      });
    },
  });
}

export function completeOperation({ execution = null, value }) {
  return snapshot({
    status: "complete",
    execution: execution === null ? null : normalizeExecution(execution),
    value,
  });
}

export function incompleteOperation({ execution = null, primary, secondary = null }) {
  return snapshot({
    status: "incomplete",
    execution: execution === null ? null : normalizeExecution(execution),
    failure: normalizeFailure(primary, secondary),
  });
}

export function publishedPath(path) {
  requireNonEmptyString(path, "published path");
  return snapshot({ status: "published", path });
}

export function failedPublication(primary, secondary = null) {
  return snapshot({ status: "publication-failed", failure: normalizeFailure(primary, secondary) });
}
