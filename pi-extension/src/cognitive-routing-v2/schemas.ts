import { isObject } from "./types.js";
const string = (maxLength = 32768) => ({ type: "string", minLength: 1, maxLength });
const object = (properties: Record<string, any>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const operation = (value: string) => ({ type: "string", enum: [value] });
const submit = object(
  {
    operation: operation("submit"),
    report: string(),
    outcome: { type: "string", enum: ["completed", "partial", "blocked"] },
    limitations: { type: "array", maxItems: 32, items: string(2048) },
  },
  ["operation", "report", "outcome"],
);
export const ROUTING_SCHEMAS: Record<string, any> = {
  freeflow_delegate: {
    oneOf: [
      object({ operation: operation("assign"), contract: string() }),
      object({ operation: operation("replace"), contract: string(), reason: string(2048) }),
    ],
  },
  freeflow_return: { oneOf: [submit, object({ operation: operation("retry") })] },
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
          operation: operation("inspect"),
          scope: { type: "string", enum: ["selected", "assignment", "active", "history"] },
          cursor: string(128),
        },
        ["operation"],
      ),
      object({ operation: operation("add"), refs: { type: "array", maxItems: 64, items: string(512) } }),
      object({
        operation: operation("remove"),
        refs: { type: "array", maxItems: 64, items: string(512) },
        reason: string(2048),
      }),
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
  };
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

export function schemaForProfile(name: string, coordinator: boolean): any {
  const schema = ROUTING_SCHEMAS[name];
  if (name !== "freeflow_unit" || coordinator) return schema;
  const branches = schema.oneOf.filter((b: any) => b.properties.operation.enum[0] === "inspect");
  const properties = Object.assign({}, ...branches.map((b: any) => b.properties));
  return { ...schema, properties, oneOf: branches };
}
