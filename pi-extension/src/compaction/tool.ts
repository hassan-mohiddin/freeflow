import type { CompactionController } from "./controller.js";

export const FREEFLOW_COMPACT = "freeflow_compact";

const DESCRIPTION =
  "Compact the conversation into a new cycle. Use only when Freeflow says compaction is due or the user asks, and read the compaction skill first. Pass your summary and what to carry; compaction happens at the end of this turn, and the run continues from the summary, the carried context and a recovery message.";

/** Registered once, declared only while Freeflow compaction is effective (see applyCompactionTools). */
export function registerCompactionTool(pi: any, controller: CompactionController): void {
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
          description:
            "The next cycle's working state, for a reader with none of this conversation. The compaction skill says what it must keep.",
        },
        carry: {
          type: "array",
          description:
            "What to carry into the next cycle, within the budget the notice gives: files by path (read fresh at compaction, optional line ranges) and tool results by id from the notice's index.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              file: { type: "string" },
              lines: { type: "array", items: { type: "integer" }, description: "[first, last], 1-based" },
              result: { type: "string", description: "A result id from the index, such as r12" },
            },
          },
        },
      },
      required: ["summary"],
    },
    // A compaction is an assistant-issued boundary: codemode scripts must not call it.
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id: string, params: unknown, _signal: AbortSignal, _update: unknown, ctx: any) {
      return { content: [{ type: "text", text: await controller.request(params, ctx) }] };
    },
  });
}

/** Declare or withdraw freeflow_compact when compaction's effective state changes, keeping other tools in place. */
export function applyCompactionTools(pi: any, effective: boolean): void {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
  const current: string[] = pi.getActiveTools();
  const present = current.includes(FREEFLOW_COMPACT);
  if (effective && !present) pi.setActiveTools([...current, FREEFLOW_COMPACT]);
  if (!effective && present) pi.setActiveTools(current.filter((name) => name !== FREEFLOW_COMPACT));
}
