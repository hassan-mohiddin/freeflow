export const EFFICIENCY_OBSERVATION_ENTRY = "freeflow-efficiency-observation-v1";
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function identity(value, maximum = 4096) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
function optionalIdentity(value, maximum = 4096) {
  return value === undefined || identity(value, maximum);
}
function nonnegative(value) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}
function exact(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function responsibility(value) {
  return (
    record(value) &&
    exact(value, ["profile", "control", "assignmentId", "executionId", "provider", "modelId", "thinking"]) &&
    ["solo", "coordinator", "helper", "executor", "unknown"].includes(value.profile) &&
    ["inactive", "manual", "automatic", "unknown"].includes(value.control) &&
    ["assignmentId", "executionId", "provider", "modelId", "thinking"].every((key) => optionalIdentity(value[key], 512))
  );
}
function usage(value) {
  if (value === undefined) return true;
  if (
    !record(value) ||
    !exact(value, [
      "input",
      "output",
      "reasoning",
      "cacheRead",
      "cacheWrite",
      "cacheWrite1h",
      "totalTokens",
      "cost",
      "source",
    ]) ||
    !["host-normalized", "tool-reported"].includes(value.source) ||
    !["input", "output", "reasoning", "cacheRead", "cacheWrite", "cacheWrite1h", "totalTokens"].every((key) =>
      nonnegative(value[key]),
    )
  )
    return false;
  return (
    value.cost === undefined ||
    (record(value.cost) &&
      exact(value.cost, ["input", "output", "cacheRead", "cacheWrite", "total"]) &&
      ["input", "output", "cacheRead", "cacheWrite", "total"].every((key) => nonnegative(value.cost[key])))
  );
}
const COMMON = ["version", "id", "kind", "sessionId", "basisEntryId", "responsibility", "coverage"];
export function isEfficiencyObservation(value) {
  if (
    !record(value) ||
    value.version !== 1 ||
    !identity(value.id) ||
    !identity(value.kind) ||
    !responsibility(value.responsibility) ||
    !["complete-at-boundary", "partial", "unknown"].includes(String(value.coverage)) ||
    !optionalIdentity(value.sessionId) ||
    !optionalIdentity(value.basisEntryId)
  )
    return false;
  if (value.kind === "prepared-request")
    return (
      exact(value, [
        ...COMMON,
        "attemptId",
        "provider",
        "model",
        "api",
        "requestedEffort",
        "payloadHash",
        "inputPrefixHash",
        "envelopeHash",
        "payloadBytes",
        "inputBytes",
        "instructionBytes",
        "toolSchemaBytes",
      ]) &&
      identity(value.attemptId) &&
      ["provider", "model", "api", "requestedEffort"].every((key) => optionalIdentity(value[key], 512)) &&
      ["payloadHash", "inputPrefixHash", "envelopeHash"].every(
        (key) => value[key] === undefined || (typeof value[key] === "string" && /^[a-f0-9]{64}$/.test(value[key])),
      ) &&
      ["payloadBytes", "inputBytes", "instructionBytes", "toolSchemaBytes"].every((key) => nonnegative(value[key]))
    );
  if (value.kind === "response-headers")
    return (
      exact(value, [...COMMON, "attemptId", "status", "headerNames", "headerBytes"]) &&
      optionalIdentity(value.attemptId) &&
      Number.isInteger(value.status) &&
      value.status >= 0 &&
      Array.isArray(value.headerNames) &&
      value.headerNames.length <= 64 &&
      value.headerNames.every((name) => identity(name, 256)) &&
      Number.isSafeInteger(value.headerBytes) &&
      value.headerBytes >= 0
    );
  if (value.kind === "assistant-complete")
    return (
      exact(value, [
        ...COMMON,
        "attemptId",
        "assistantEntryId",
        "provider",
        "model",
        "responseModel",
        "api",
        "responseId",
        "providerThinkingLevel",
        "stopReason",
        "usage",
      ]) &&
      [
        "attemptId",
        "assistantEntryId",
        "provider",
        "model",
        "responseModel",
        "api",
        "responseId",
        "providerThinkingLevel",
        "stopReason",
      ].every((key) => optionalIdentity(value[key])) &&
      usage(value.usage)
    );
  if (value.kind === "tool-complete")
    return (
      exact(value, [
        ...COMMON,
        "toolEntryId",
        "toolCallId",
        "toolName",
        "isError",
        "argumentBytes",
        "resultBytes",
        "programSourceBytes",
        "emittedBytes",
        "capturedBytes",
        "recoveredBytes",
        "runId",
        "operation",
        "programStatus",
        "effectState",
        "coverageBoundary",
        "childOperations",
        "usage",
      ]) &&
      optionalIdentity(value.toolEntryId) &&
      identity(value.toolCallId, 512) &&
      identity(value.toolName, 256) &&
      typeof value.isError === "boolean" &&
      ["argumentBytes", "resultBytes", "programSourceBytes", "emittedBytes", "capturedBytes", "recoveredBytes"].every(
        (key) => nonnegative(value[key]),
      ) &&
      optionalIdentity(value.runId, 512) &&
      optionalIdentity(value.operation, 256) &&
      optionalIdentity(value.programStatus, 256) &&
      optionalIdentity(value.effectState, 256) &&
      optionalIdentity(value.coverageBoundary, 1000) &&
      (value.childOperations === undefined ||
        (Array.isArray(value.childOperations) &&
          value.childOperations.length <= 256 &&
          value.childOperations.every(
            (child) =>
              record(child) &&
              exact(child, ["operation", "status", "effectState"]) &&
              identity(child.operation, 256) &&
              identity(child.status, 256) &&
              identity(child.effectState, 256),
          ))) &&
      usage(value.usage)
    );
  return false;
}
function nativeIdentity(observation) {
  if (observation.kind === "assistant-complete" && observation.assistantEntryId) {
    return `assistant:${observation.assistantEntryId}`;
  }
  if (observation.kind === "tool-complete" && observation.toolEntryId) {
    return `tool:${observation.toolEntryId}`;
  }
  return undefined;
}
export class EfficiencyLedger {
  byId = new Map();
  native = new Map();
  append(observation) {
    if (!isEfficiencyObservation(observation) || this.byId.has(observation.id)) return false;
    const occurrence = nativeIdentity(observation);
    if (occurrence && this.native.has(occurrence)) return false;
    const copy = structuredClone(observation);
    this.byId.set(copy.id, copy);
    if (occurrence) this.native.set(occurrence, copy.id);
    return true;
  }
  recover(entries) {
    for (const entry of entries) {
      if (entry?.type !== "custom" || entry.customType !== EFFICIENCY_OBSERVATION_ENTRY) continue;
      if (isEfficiencyObservation(entry.data)) this.append(entry.data);
    }
  }
  all() {
    return [...this.byId.values()].map((observation) => structuredClone(observation));
  }
}
