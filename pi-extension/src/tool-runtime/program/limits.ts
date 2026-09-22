import type { Json, OperationKey } from "../contracts.js";
import { canonicalJson, freezeJson } from "../schema.js";

export const PROGRAM_LIMITS = Object.freeze({
  sourceBytes: 64 * 1024,
  inputBytes: 256 * 1024,
  heapBytes: 64 * 1024 * 1024,
  stackBytes: 512 * 1024,
  defaultTimeoutMs: 30_000,
  maximumTimeoutMs: 120_000,
  frameBytes: 4 * 1024 * 1024,
  pendingCalls: 32,
  totalCalls: 256,
  parallelReads: 4,
  transferBytes: 32 * 1024 * 1024,
  emissionBytes: 32 * 1024,
  resultBytes: 40 * 1024,
  settleGraceMs: 250,
});

export type ProgramRequest = Readonly<{
  code: string;
  description: string;
  operations: readonly OperationKey[];
  captures: readonly string[];
  input: Json;
  timeoutMs: number;
}>;

export class ProgramLimitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ProgramLimitError";
  }
}

function identity(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

export function validateProgramRequest(value: any, defaultTimeoutMs = PROGRAM_LIMITS.defaultTimeoutMs): ProgramRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProgramLimitError("invalid_program", "Program request must be an object.");
  const code = value.code;
  if (!identity(code, PROGRAM_LIMITS.sourceBytes) || Buffer.byteLength(code, "utf8") > PROGRAM_LIMITS.sourceBytes)
    throw new ProgramLimitError("source_limit", "Program source exceeds 64 KiB.");
  if (!identity(value.description, 500))
    throw new ProgramLimitError("invalid_program", "Program description is invalid.");
  const operations = Array.isArray(value.operations) ? value.operations : [];
  if (
    operations.length > 32 ||
    !operations.every(
      (key: any) =>
        key &&
        typeof key === "object" &&
        !Array.isArray(key) &&
        Object.keys(key).length === 2 &&
        identity(key.id, 128) &&
        identity(key.revision, 64),
    ) ||
    new Set(operations.map((key: OperationKey) => JSON.stringify([key.id, key.revision]))).size !== operations.length
  )
    throw new ProgramLimitError("invalid_program", "Program operation allowlist is invalid.");
  const captures = Array.isArray(value.captures) ? value.captures : [];
  if (
    captures.length > 32 ||
    !captures.every((id: unknown) => identity(id, 256)) ||
    new Set(captures).size !== captures.length
  )
    throw new ProgramLimitError("invalid_program", "Program capture allowlist is invalid.");
  const input = freezeJson(value.input ?? null);
  if (Buffer.byteLength(canonicalJson(input), "utf8") > PROGRAM_LIMITS.inputBytes)
    throw new ProgramLimitError("input_limit", "Program input exceeds 256 KiB.");
  const timeoutMs = value.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > PROGRAM_LIMITS.maximumTimeoutMs)
    throw new ProgramLimitError("timeout_limit", "Program timeout must be 100-120000 ms.");
  return Object.freeze({
    code,
    description: value.description,
    operations: Object.freeze(operations.map((key: OperationKey) => Object.freeze({ ...key }))),
    captures: Object.freeze([...captures]),
    input,
    timeoutMs,
  });
}
