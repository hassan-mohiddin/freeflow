import type { ResponsibilitySnapshot } from "../contracts.js";

export const CAPTURE_DESCRIPTOR_ENTRY = "freeflow-tool-capture-v1";
export const CAPTURE_POLICY_REVISION = "bash-text-v1-pi-0.85.1";
export const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
export const MAX_READER_RESPONSE_BYTES = 32 * 1024;
export const DEFAULT_READER_RESPONSE_BYTES = 8 * 1024;

export type ExternalCoverage = "limited" | "unspecified";

export type CaptureDescriptorV1 = Readonly<{
  version: 1;
  id: string;
  originSessionId: string;
  assistantEntryId: string;
  toolCallId: string;
  toolName: "bash";
  producer: ResponsibilitySnapshot;
  policyRevision: typeof CAPTURE_POLICY_REVISION;
  capture: Readonly<{
    encoding: "utf-8";
    scope: "tool-result-hook";
    externalCoverage: ExternalCoverage;
    bytes: number;
    sha256: string;
  }>;
  emission: Readonly<{
    bytes: number;
    sha256: string;
    representation: "excerpt";
  }>;
  storageKey: string;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function identity(value: unknown, maximum = 4096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function responsibility(value: unknown): value is ResponsibilitySnapshot {
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

export function isCaptureDescriptor(value: unknown): value is CaptureDescriptorV1 {
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
    (value.capture.bytes as number) > 0 &&
    (value.capture.bytes as number) <= MAX_CAPTURE_BYTES &&
    digest(value.capture.sha256) &&
    exactKeys(value.emission, ["bytes", "sha256", "representation"]) &&
    Number.isSafeInteger(value.emission.bytes) &&
    (value.emission.bytes as number) > 0 &&
    (value.emission.bytes as number) <= 1_048_576 &&
    digest(value.emission.sha256) &&
    value.emission.representation === "excerpt"
  );
}

export type ResultGrant = Readonly<{ id: string; sha256: string }>;
