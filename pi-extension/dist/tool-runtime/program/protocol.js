import { PROGRAM_LIMITS, ProgramLimitError } from "./limits.js";
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value, keys) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}
function id(value, maximum = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
function sequence(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function frameString(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= PROGRAM_LIMITS.frameBytes;
}
export function guestFrame(value) {
  if (!record(value) || value.v !== 1 || !id(value.type, 32) || !id(value.runId))
    throw new ProgramLimitError("invalid_frame", "Guest frame is invalid.");
  if (value.type === "call") {
    if (
      !exact(value, ["v", "type", "runId", "seq", "operation", "inputJson"]) ||
      !sequence(value.seq) ||
      !id(value.operation, 128) ||
      !frameString(value.inputJson)
    )
      throw new ProgramLimitError("invalid_frame", "Guest call frame is invalid.");
  } else if (value.type === "capture-read") {
    if (
      !exact(value, ["v", "type", "runId", "seq", "id", "rangeJson"]) ||
      !sequence(value.seq) ||
      !id(value.id, 256) ||
      !frameString(value.rangeJson)
    )
      throw new ProgramLimitError("invalid_frame", "Guest capture frame is invalid.");
  } else if (value.type === "emit") {
    if (
      !exact(value, ["v", "type", "runId", "seq", "valueJson"]) ||
      !sequence(value.seq) ||
      !frameString(value.valueJson)
    )
      throw new ProgramLimitError("invalid_frame", "Guest emit frame is invalid.");
  } else if (value.type === "finished") {
    if (!exact(value, ["v", "type", "runId", "detached"]) || typeof value.detached !== "boolean")
      throw new ProgramLimitError("invalid_frame", "Guest terminal frame is invalid.");
  } else if (value.type === "failed") {
    if (
      !exact(value, ["v", "type", "runId", "code", "message", "detached"]) ||
      !id(value.code, 128) ||
      !id(value.message, 2000) ||
      typeof value.detached !== "boolean"
    )
      throw new ProgramLimitError("invalid_frame", "Guest failure frame is invalid.");
  } else throw new ProgramLimitError("invalid_frame", "Unknown guest frame type.");
  return value;
}
export function hostFrame(value) {
  if (!record(value) || value.v !== 1 || !id(value.type, 32) || !id(value.runId))
    throw new ProgramLimitError("invalid_frame", "Host frame is invalid.");
  if (value.type === "reply") {
    if (
      !exact(value, ["v", "type", "runId", "seq", "outcomeJson"]) ||
      !sequence(value.seq) ||
      !frameString(value.outcomeJson)
    )
      throw new ProgramLimitError("invalid_frame", "Host reply frame is invalid.");
  } else if (value.type === "cancel") {
    if (!exact(value, ["v", "type", "runId", "reason"]) || !id(value.reason, 1000))
      throw new ProgramLimitError("invalid_frame", "Host cancellation frame is invalid.");
  } else throw new ProgramLimitError("invalid_frame", "Unknown host frame type.");
  return value;
}
