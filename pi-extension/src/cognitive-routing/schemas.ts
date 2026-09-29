import { isObject } from "./types.js";
const string = (maxLength = 32768, description?: string) => ({
  type: "string",
  minLength: 1,
  maxLength,
  ...(description ? { description } : {}),
});
const object = (
  properties: Record<string, any>,
  required = Object.keys(properties),
  description?: string,
  title?: string,
) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
  ...(description ? { description } : {}),
  ...(title ? { title } : {}),
});
const operation = (value: string, description?: string) => ({
  type: "string",
  enum: [value],
  ...(description ? { description } : {}),
});
const evidenceRefs = (description: string) => ({
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
const report = (name: "submit" | "supplement") =>
  object(
    {
      operation: operation(name),
      report: string(),
      outcome: { type: "string", enum: ["completed", "partial", "blocked"] },
      limitations: { type: "array", maxItems: 32, items: string(2048) },
    },
    ["operation", "report", "outcome"],
  );
export const ROUTING_SCHEMAS: Record<string, any> = {
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
  schema.properties = Object.assign({}, ...schema.oneOf.map((branch: any) => branch.properties));
  schema.properties.operation = {
    type: "string",
    enum: schema.oneOf.flatMap((branch: any) => branch.properties.operation.enum),
    description: "Choose exactly one operation; each operation has a strict shape and rejects unknown fields.",
  };
  if (schema.properties.refs)
    schema.properties.refs = {
      ...schema.properties.refs,
      description:
        "For add, use exact eligible visible refs directly when their identity and eligibility are clear; inspect when identity, eligibility, representation, or selection state is unclear. Never add refs marked not offered for new evidence selection. For remove, use currently selected or unresolved refs; a non-selectable ref may be named to clear its unresolved request and requires reason.",
    };
  // The provider sees one flattened root, so each field names the operations whose strict shape accepts it.
  const operations = schema.oneOf.map((branch: any) => branch.properties.operation.enum[0]);
  for (const [field, property] of Object.entries<any>(schema.properties)) {
    if (field === "operation") continue;
    const accepting = operations.filter((_op: string, i: number) => Object.hasOwn(schema.oneOf[i].properties, field));
    if (accepting.length === operations.length) continue;
    const scope = `Only for operation: ${accepting.join(", ")}.`;
    schema.properties[field] = {
      ...property,
      description: property.description ? `${property.description} ${scope}` : scope,
    };
  }
}

const expected = (schema: any): string =>
  schema.enum
    ? `one of ${schema.enum.join(", ")}`
    : schema.type === "string"
      ? `a non-empty string of at most ${schema.maxLength} characters`
      : schema.type === "array"
        ? `an array of at most ${schema.maxItems} items`
        : schema.type === "integer"
          ? `an integer from ${schema.minimum} to ${schema.maximum}`
          : `type ${schema.type}`;

/** Explain why routing arguments match no strict operation shape, naming what to change. */
export function explainRoutingArguments(name: string, input: unknown): string {
  const schema = ROUTING_SCHEMAS[name];
  const operations = schema.oneOf.map((branch: any) => branch.properties.operation.enum[0]);
  const operation = isObject(input) ? input.operation : undefined;
  const branch = schema.oneOf.find((b: any) => b.properties.operation.enum[0] === operation);
  if (!isObject(input) || !branch)
    return `Invalid ${name} arguments: operation must be one of ${operations.join(", ")}. No operation was accepted.`;
  const allowed = Object.keys(branch.properties);
  const problems: string[] = [];
  const unknown = Object.keys(input).filter((field) => !allowed.includes(field));
  if (unknown.length) problems.push(`remove field${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}`);
  const missing = branch.required.filter((field: string) => !Object.hasOwn(input, field));
  if (missing.length) problems.push(`missing required field${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`);
  for (const field of allowed)
    if (Object.hasOwn(input, field) && !matches(input[field], branch.properties[field]))
      problems.push(`${field} must be ${expected(branch.properties[field])}`);
  if (!problems.length) problems.push("arguments do not match this operation's shape");
  return `Invalid ${name} arguments for operation ${operation}: ${problems.join("; ")}. Allowed fields: ${allowed.join(", ")}. No operation was accepted.`;
}

export function matches(value: any, schema: any): boolean {
  if (schema.oneOf) return schema.oneOf.filter((branch: any) => matches(value, branch)).length === 1;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object")
    return (
      isObject(value) &&
      Object.keys(value).every((k) => schema.properties[k]) &&
      schema.required.every((k: string) => Object.hasOwn(value, k)) &&
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
