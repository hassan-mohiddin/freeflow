import { ToolProgressReporter } from "./progress.js";
import { renderToolRuntimeCall, renderToolRuntimeResult } from "./renderers.js";
export const TOOL_RUNTIME_TOOL_NAMES = ["freeflow_tools", "freeflow_run", "freeflow_result"];
const string = (maxLength, description) => ({
  type: "string",
  minLength: 1,
  maxLength,
  ...(description ? { description } : {}),
});
const operationKey = {
  type: "object",
  additionalProperties: false,
  properties: { id: string(128), revision: string(64) },
  required: ["id", "revision"],
};
const branch = (properties, required) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const operation = (value) => ({ type: "string", enum: [value] });
const toolBranches = [
  branch({ operation: operation("search"), query: string(500), limit: { type: "integer", minimum: 1, maximum: 20 } }, [
    "operation",
    "query",
  ]),
  branch(
    {
      operation: operation("describe"),
      operations: { type: "array", minItems: 1, maxItems: 8, items: operationKey },
    },
    ["operation", "operations"],
  ),
  branch({ operation: operation("call"), operationKey, input: {} }, ["operation", "operationKey", "input"]),
];
export const TOOL_RUNTIME_SCHEMAS = {
  freeflow_tools: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...Object.assign({}, ...toolBranches.map((candidate) => candidate.properties)),
      operation: { type: "string", enum: ["search", "describe", "call"] },
    },
    required: ["operation"],
    oneOf: toolBranches,
  },
  freeflow_run: {
    type: "object",
    additionalProperties: false,
    properties: {
      code: string(65_536),
      description: string(500),
      operations: { type: "array", maxItems: 32, items: operationKey },
      captures: { type: "array", maxItems: 32, uniqueItems: true, items: string(256) },
      input: {},
      timeoutMs: { type: "integer", minimum: 100, maximum: 120_000 },
    },
    required: ["code", "description", "operations"],
  },
  freeflow_result: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: string(256),
      offsetBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      maxBytes: { type: "integer", minimum: 1, maximum: 32_768 },
    },
    required: ["id"],
  },
};
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value, required, optional) {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  );
}
function boundedString(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
function integer(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
function json(value, seen = new Set(), depth = 0) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 64 || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.length <= 100_000 && value.every((item) => json(item, seen, depth + 1))
    : Object.keys(value).length <= 100_000 &&
      Object.entries(value).every(([key, item]) => key.length <= 4096 && json(item, seen, depth + 1));
  seen.delete(value);
  return valid;
}
function validOperationKey(value) {
  return (
    record(value) &&
    exactKeys(value, ["id", "revision"], []) &&
    boundedString(value.id, 128) &&
    boundedString(value.revision, 64)
  );
}
export function validToolRuntimeInput(name, value) {
  if (!record(value)) return false;
  if (name === "freeflow_result") {
    return (
      exactKeys(value, ["id"], ["offsetBytes", "maxBytes"]) &&
      boundedString(value.id, 256) &&
      (value.offsetBytes === undefined || integer(value.offsetBytes, 0, Number.MAX_SAFE_INTEGER)) &&
      (value.maxBytes === undefined || integer(value.maxBytes, 1, 32_768))
    );
  }
  if (name === "freeflow_run") {
    return (
      exactKeys(value, ["code", "description", "operations"], ["captures", "input", "timeoutMs"]) &&
      boundedString(value.code, 65_536) &&
      boundedString(value.description, 500) &&
      Array.isArray(value.operations) &&
      value.operations.length <= 32 &&
      value.operations.every(validOperationKey) &&
      (value.captures === undefined ||
        (Array.isArray(value.captures) &&
          value.captures.length <= 32 &&
          new Set(value.captures).size === value.captures.length &&
          value.captures.every((capture) => boundedString(capture, 256)))) &&
      (value.input === undefined || json(value.input)) &&
      (value.timeoutMs === undefined || integer(value.timeoutMs, 100, 120_000))
    );
  }
  if (!boundedString(value.operation, 32)) return false;
  if (value.operation === "search") {
    return (
      exactKeys(value, ["operation", "query"], ["limit"]) &&
      boundedString(value.query, 500) &&
      (value.limit === undefined || integer(value.limit, 1, 20))
    );
  }
  if (value.operation === "describe") {
    return (
      exactKeys(value, ["operation", "operations"], []) &&
      Array.isArray(value.operations) &&
      value.operations.length >= 1 &&
      value.operations.length <= 8 &&
      value.operations.every(validOperationKey)
    );
  }
  if (value.operation === "call") {
    return (
      exactKeys(value, ["operation", "operationKey", "input"], []) &&
      validOperationKey(value.operationKey) &&
      json(value.input)
    );
  }
  return false;
}
const descriptions = {
  freeflow_tools:
    "Discover, describe, or directly call revisioned Freeflow operations through the stable operation facade.",
  freeflow_run: "Run bounded JavaScript with only explicitly granted operation and captured-result capabilities.",
  freeflow_result: "Read an exact bounded byte range from a verified captured Freeflow result.",
};
function initialProgress(name, input) {
  const activity =
    name === "freeflow_run"
      ? "Preparing restricted program"
      : name === "freeflow_result"
        ? "Verifying captured result"
        : input?.operation === "call"
          ? `Admitting ${input?.operationKey?.id ?? "operation"}`
          : input?.operation === "describe"
            ? "Loading operation contracts"
            : "Searching operation catalog";
  return { version: 1, tool: name, phase: "preparing", activity };
}
export function registerToolRuntimeTools(pi, state, handlers = {}) {
  for (const name of TOOL_RUNTIME_TOOL_NAMES) {
    pi.registerTool({
      name,
      label: name.replace("freeflow_", "Freeflow "),
      description: descriptions[name],
      parameters: TOOL_RUNTIME_SCHEMAS[name],
      executionMode: "sequential",
      renderCall: (args, theme, context) => renderToolRuntimeCall(name, args, theme, context),
      renderResult: (result, options, theme, context) => renderToolRuntimeResult(name, result, options, theme, context),
      async execute(_id, input, signal, update, ctx) {
        if (!validToolRuntimeInput(name, input)) throw new Error(`Invalid ${name} arguments; no operation accepted.`);
        const current = state();
        const progress = new ToolProgressReporter(update);
        try {
          progress.publish(initialProgress(name, input), true);
          if (name === "freeflow_tools" && current?.effective && handlers.invokeTools) {
            return await handlers.invokeTools(_id, input, signal, ctx, progress);
          }
          if (name === "freeflow_run" && current?.programs.effective && handlers.runProgram) {
            return await handlers.runProgram(_id, input, signal, ctx, progress);
          }
          if (name === "freeflow_result" && current?.effective && handlers.readResult) {
            return await handlers.readResult(input, signal, ctx, progress);
          }
          const reason = !current?.effective
            ? "Tool Execution is disabled."
            : name === "freeflow_run" && !current.programs.effective
              ? "Programs are disabled."
              : "This operation is not available in the current implementation phase.";
          throw new Error(`Freeflow ${name} unavailable: ${reason}`);
        } finally {
          progress.flush();
          progress.close();
        }
      },
    });
  }
}
