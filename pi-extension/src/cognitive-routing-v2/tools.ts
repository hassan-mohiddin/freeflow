import { RoutingRuntime, ROUTING_TOOLS } from "./runtime.js";
import { isObject, requireCondition as check } from "./types.js";

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
      object({ operation: operation("status") }),
      object({ operation: operation("history"), limit: { type: "integer", minimum: 1, maximum: 100 } }, ["operation"]),
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
      object({ operation: operation("inspect") }),
      object(
        {
          operation: operation("list"),
          scope: { type: "string", enum: ["assignment", "active"] },
          cursor: { type: "string", pattern: "^[0-9]+$", maxLength: 16 },
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

function matches(value: any, schema: any): boolean {
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
const descriptions: Record<string, string> = {
  freeflow_delegate:
    "Save a supported assignment contract and request Executor execution. Explicit replace supersedes a quiescent outstanding assignment in the same unit.",
  freeflow_return:
    "Save or revise the actual assignment report, or retry its saved handoff without resubmitting text. Returning does not accept or close the unit.",
  freeflow_unit:
    "Inspect routing state, restore a suspended assessment, or record Coordinator's explicit unit disposition.",
  freeflow_project:
    "Select completed Executor evidence by exposed canonical refs. Valid items survive other item failures; native dependencies are retained automatically.",
};
const guidance: Record<string, string[]> = {
  freeflow_delegate: [
    "freeflow_delegate is Coordinator-only under Automatic control. Put the contract in the input. Use replace only for explicit same-unit replacement; do not supply IDs.",
  ],
  freeflow_return: [
    "freeflow_return submit saves/revises the actual report; retry completes the saved return without text. Stop ordinary task work after reportSaved. Keep the handoff last; do not batch it with new task tools.",
  ],
  freeflow_unit: [
    "freeflow_unit assess restores saved evidence only after readiness checks. close is Coordinator-only and does not complete a Working Record task or authorize delivery.",
  ],
  freeflow_project: [
    "freeflow_project selects actual result bodies, not merely calls. Correct or explicitly withdraw unresolved items with a limitation. Known previously exposed bodies resolve automatically; target-representation gaps are not successful delivery.",
  ],
};
export function registerRoutingTools(pi: any, runtime: RoutingRuntime): void {
  for (const name of ROUTING_TOOLS)
    pi.registerTool({
      name,
      label: name.replace("freeflow_", "Routing "),
      description: descriptions[name],
      parameters: ROUTING_SCHEMAS[name],
      executionMode: "sequential",
      promptGuidelines: guidance[name],
      async execute(id: string, input: unknown, signal: AbortSignal, _update: unknown, ctx: any) {
        if (!matches(input, ROUTING_SCHEMAS[name]))
          return {
            content: [{ type: "text", text: "Invalid routing arguments; no operation accepted." }],
            details: { status: "rejected", code: "invalid_arguments" },
            isError: true,
          };
        return runtime.invoke(name, id, input, signal, ctx);
      },
    });
}
export function applyRoutingToolVisibility(pi: any, runtime: RoutingRuntime, available: boolean): void {
  if (!pi.getActiveTools || !pi.setActiveTools) return;
  const current = new Set<string>(pi.getActiveTools());
  for (const name of ROUTING_TOOLS) {
    const enabled =
      available &&
      (name === "freeflow_unit" || (runtime.state().effective && runtime.state().controlMode === "automatic")) &&
      (name !== "freeflow_project" || runtime.projectionEnabled);
    if (enabled) current.add(name);
    else current.delete(name);
  }
  // Retired experimental tools must never remain available beside the replacement.
  current.delete("freeflow_switch_profile");
  current.delete("freeflow_cognitive_routing_history");
  const next = [...current];
  if (JSON.stringify(next) !== JSON.stringify(pi.getActiveTools())) pi.setActiveTools(next);
}
