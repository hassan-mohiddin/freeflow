export const CAPTURE_DESCRIPTOR_ENTRY = "freeflow-tool-capture-v1";
export const CAPTURE_POLICY_REVISION = "bash-text-v1-pi-0.85.1";
export const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
export const MAX_READER_RESPONSE_BYTES = 32 * 1024;
export const DEFAULT_READER_RESPONSE_BYTES = 8 * 1024;
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value, keys) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}
function identity(value, maximum = 4096) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
function digest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function responsibility(value) {
  if (!record(value)) return false;
  if (
    !exactKeys(value, [
      "profile",
      "control",
      ...(value.assignmentId !== undefined ? ["assignmentId"] : []),
      ...(value.executionId !== undefined ? ["executionId"] : []),
      ...(value.provider !== undefined ? ["provider"] : []),
      ...(value.modelId !== undefined ? ["modelId"] : []),
      ...(value.thinking !== undefined ? ["thinking"] : []),
    ])
  )
    return false;
  return (
    ["solo", "coordinator", "helper", "executor", "unknown"].includes(String(value.profile)) &&
    ["inactive", "manual", "automatic", "unknown"].includes(String(value.control)) &&
    ["assignmentId", "executionId", "provider", "modelId", "thinking"].every(
      (key) => value[key] === undefined || identity(value[key]),
    )
  );
}
export function isCaptureDescriptor(value) {
  if (!record(value)) return false;
  if (
    !exactKeys(value, [
      "version",
      "id",
      "originSessionId",
      "assistantEntryId",
      "toolCallId",
      "toolName",
      "producer",
      "policyRevision",
      "capture",
      "emission",
      "storageKey",
    ])
  )
    return false;
  if (
    value.version !== 1 ||
    !identity(value.id, 256) ||
    !identity(value.originSessionId) ||
    !identity(value.assistantEntryId) ||
    !identity(value.toolCallId) ||
    value.toolName !== "bash" ||
    !responsibility(value.producer) ||
    value.policyRevision !== CAPTURE_POLICY_REVISION ||
    !/^[a-f0-9]{64}\.txt$/.test(String(value.storageKey))
  )
    return false;
  if (!record(value.capture) || !record(value.emission)) return false;
  return (
    exactKeys(value.capture, ["encoding", "scope", "externalCoverage", "bytes", "sha256"]) &&
    value.capture.encoding === "utf-8" &&
    value.capture.scope === "tool-result-hook" &&
    ["limited", "unspecified"].includes(String(value.capture.externalCoverage)) &&
    Number.isSafeInteger(value.capture.bytes) &&
    value.capture.bytes > 0 &&
    value.capture.bytes <= MAX_CAPTURE_BYTES &&
    digest(value.capture.sha256) &&
    exactKeys(value.emission, ["bytes", "sha256", "representation"]) &&
    Number.isSafeInteger(value.emission.bytes) &&
    value.emission.bytes > 0 &&
    value.emission.bytes <= 1_048_576 &&
    digest(value.emission.sha256) &&
    value.emission.representation === "excerpt"
  );
}
