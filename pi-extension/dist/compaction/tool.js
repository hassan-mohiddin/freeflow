export const FREEFLOW_COMPACT = "freeflow_compact";
// Interim wording; the reviewed texts arrive with the compaction skill.
const DESCRIPTION =
  "Compact the conversation when Freeflow says compaction is due. Update the Working Record first, then pass your summary and any files to carry. Compaction happens at the end of this turn and the run continues from the summary.";
/** Registered once, declared only while Freeflow compaction is effective (see applyCompactionTools). */
export function registerCompactionTool(pi, controller) {
  pi.registerTool({
    name: FREEFLOW_COMPACT,
    label: "Compact",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
          description: "This cycle's working state for the next cycle: what the Working Record does not hold.",
        },
        carry: {
          type: "array",
          description: "Files to carry, read fresh at compaction. Optional line ranges keep it inside the budget.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              file: { type: "string" },
              lines: { type: "array", items: { type: "integer" }, description: "[first, last], 1-based" },
            },
            required: ["file"],
          },
        },
      },
      required: ["summary"],
    },
    // A compaction is an assistant-issued boundary: codemode scripts must not call it.
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id, params, _signal, _update, ctx) {
      return { content: [{ type: "text", text: await controller.request(params, ctx) }] };
    },
  });
}
/** Declare or withdraw freeflow_compact when compaction's effective state changes, keeping other tools in place. */
export function applyCompactionTools(pi, effective) {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
  const current = pi.getActiveTools();
  const present = current.includes(FREEFLOW_COMPACT);
  if (effective && !present) pi.setActiveTools([...current, FREEFLOW_COMPACT]);
  if (!effective && present) pi.setActiveTools(current.filter((name) => name !== FREEFLOW_COMPACT));
}
