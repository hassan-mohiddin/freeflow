import { isObject } from "./types.js";
const string = (maxLength = 32768, description) => ({
  type: "string",
  minLength: 1,
  maxLength,
  ...(description ? { description } : {}),
});
const object = (properties, required = Object.keys(properties), description, title) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
  ...(description ? { description } : {}),
  ...(title ? { title } : {}),
});
const operation = (value, description) => ({
  type: "string",
  enum: [value],
  ...(description ? { description } : {}),
});
const evidenceRefs = (description) => ({
  type: "array",
  maxItems: 64,
  items: string(512),
  description,
});
const worker = {
  type: "string",
  enum: ["helper", "executor"],
  description: "Worker for this assignment. Required when delegation mode enables both workers.",
};
const report = (name) =>
  object(
    {
      operation: operation(name),
      report: string(),
      outcome: { type: "string", enum: ["completed", "partial", "blocked"] },
      limitations: { type: "array", maxItems: 32, items: string(2048) },
    },
    ["operation", "report", "outcome"],
  );
export const ROUTING_SCHEMAS = {
  freeflow_delegate: {
    oneOf: [
      object({ operation: operation("assign"), contract: string(), worker }, ["operation", "contract"]),
      object({ operation: operation("replace"), contract: string(), reason: string(2048), worker }, [
        "operation",
        "contract",
        "reason",
      ]),
    ],
  },
  freeflow_return: { oneOf: [report("submit"), report("supplement"), object({ operation: operation("retry") })] },
  freeflow_unit: {
    oneOf: [
      object(
        {
          operation: operation("inspect"),
          view: { type: "string", enum: ["current", "history", "detail"] },
          ref: string(128),
          cursor: string(128),
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
        ["operation"],
      ),
      object({ operation: operation("assess") }),
      object(
        {
          operation: operation("recover"),
          request: string(),
          paths: { type: "array", maxItems: 32, items: string(4096) },
          results: { type: "array", maxItems: 32, uniqueItems: true, items: string(256) },
        },
        ["operation", "request"],
      ),
      object({ operation: operation("cancel-recovery"), reason: string(2048) }),
      object({
        operation: operation("close"),
        outcome: { type: "string", enum: ["accepted", "cancelled", "deferred"] },
        assessment: string(),
      }),
    ],
  },
  freeflow_project: {
    oneOf: [
      object(
        {
          operation: operation("inspect", "Read current selection and offered evidence candidates."),
          scope: {
            type: "string",
            enum: ["selected", "assignment", "active", "history"],
            description: "Optional candidate scope; omit to inspect the current assignment.",
          },
          cursor: string(128, "Use the nextCursor returned by a previous inspection."),
        },
        ["operation"],
        "Inspect selection and candidates without changing evidence state.",
        "Inspect evidence selection",
      ),
      object(
        {
          operation: operation("add", "Select eligible worker task-evidence refs; do not include reason."),
          refs: evidenceRefs(
            "Exact eligible visible refs for worker task evidence. Add known eligible refs directly; inspect when identity, eligibility, representation, or selection state is unclear. Never add a ref marked not offered for new evidence selection.",
          ),
        },
        ["operation", "refs"],
        "Add evidence refs. This shape has no reason field.",
        "Add evidence",
      ),
      object(
        {
          operation: operation("remove", "Withdraw selected or unresolved refs; reason is required."),
          refs: evidenceRefs(
            "Currently selected or unresolved refs to withdraw. A non-selectable ref may be removed with a reason to clear its unresolved request.",
          ),
          reason: string(2048, "Required only for remove; explain why the selection is being withdrawn."),
        },
        ["operation", "refs", "reason"],
        "Remove evidence refs. This is the only operation that accepts reason.",
        "Remove evidence",
      ),
    ],
  },
};
// Provider function schemas require an object root. Keep operation-specific branches
// for runtime validation without leaving the provider-facing root untyped.
for (const schema of Object.values(ROUTING_SCHEMAS)) {
  schema.type = "object";
  schema.additionalProperties = false;
  schema.required = ["operation"];
  schema.properties = Object.assign({}, ...schema.oneOf.map((branch) => branch.properties));
  schema.properties.operation = {
    type: "string",
    enum: schema.oneOf.flatMap((branch) => branch.properties.operation.enum),
    description: "Choose exactly one operation; each operation has a strict shape and rejects unknown fields.",
  };
  if (schema.properties.refs)
    schema.properties.refs = {
      ...schema.properties.refs,
      description:
        "For add, use exact eligible visible refs directly when their identity and eligibility are clear; inspect when identity, eligibility, representation, or selection state is unclear. Never add refs marked not offered for new evidence selection. For remove, use currently selected or unresolved refs; a non-selectable ref may be named to clear its unresolved request and requires reason.",
    };
}
export function matches(value, schema) {
  if (schema.oneOf) return schema.oneOf.filter((branch) => matches(value, branch)).length === 1;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object")
    return (
      isObject(value) &&
      Object.keys(value).every((k) => schema.properties[k]) &&
      schema.required.every((k) => Object.hasOwn(value, k)) &&
      Object.entries(value).every(([k, v]) => matches(v, schema.properties[k]))
    );
  if (schema.type === "string")
    return (
      typeof value === "string" &&
      value.length >= (schema.minLength ?? 0) &&
      value.length <= (schema.maxLength ?? Infinity) &&
      (!schema.pattern || new RegExp(schema.pattern).test(value))
    );
  if (schema.type === "array")
    return Array.isArray(value) && value.length <= schema.maxItems && value.every((v) => matches(v, schema.items));
  if (schema.type === "integer")
    return Number.isSafeInteger(value) && value >= schema.minimum && value <= schema.maximum;
  return false;
}
export function schemaForProfile(name, coordinator) {
  const schema = ROUTING_SCHEMAS[name];
  if (name !== "freeflow_unit" || coordinator) return schema;
  const branches = schema.oneOf.filter((b) => b.properties.operation.enum[0] === "inspect");
  const properties = Object.assign({}, ...branches.map((b) => b.properties));
  return { ...schema, properties, oneOf: branches };
}
