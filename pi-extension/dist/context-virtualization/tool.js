export const CONTEXT_VIRTUALIZATION_TOOL_NAME = "freeflow_context";
export const CONTEXT_VIRTUALIZATION_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    operation: {
      type: "string",
      enum: ["archive", "restore"],
      description: "Context operation to perform.",
    },
    targets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ref: {
            type: "string",
            minLength: 1,
            description: "Current-session context reference, such as ctx:abcd1234.",
          },
          retained: {
            type: "string",
            minLength: 1,
            description: "Optional model-authored meaning to keep active after the raw result is archived.",
          },
        },
        required: ["ref"],
      },
      description: "Targets for operation=archive. Omit retained for a reference-only archive.",
    },
    refs: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
      description: "Current-session references for operation=restore.",
    },
  },
  required: ["operation"],
};
function resultText(result) {
  const lines = [`${CONTEXT_VIRTUALIZATION_TOOL_NAME}|${result.operation}`, `status|${result.status}`];
  if (result.changed.length > 0) lines.push(`changed|${result.changed.join(",")}`);
  if (result.message) lines.push(`message|${result.message}`);
  if (result.availability) {
    for (const [ref, availability] of Object.entries(result.availability)) {
      lines.push(`availability|${ref}|${availability}`);
    }
  }
  return lines.join("\n");
}
function rejected(operation, message) {
  return { status: "rejected", operation, changed: [], message };
}
function parseOperation(params) {
  return params.operation === "archive" || params.operation === "restore" ? params.operation : undefined;
}
export function registerContextVirtualizationTool(pi, getRuntime) {
  pi.registerTool({
    name: CONTEXT_VIRTUALIZATION_TOOL_NAME,
    label: "Virtualize Context",
    description:
      "Control which consumed tool-result content remains in future context. Archive a result with optional retained meaning, or restore an archived result to its full projection. Canonical session history is preserved.",
    promptSnippet: "Archive consumed tool results from future context while preserving exact session history.",
    promptGuidelines: [
      "Archive only a tool result whose context-ref appeared in the request you just consumed.",
      "Archive without retained meaning when nothing from the result needs to remain active.",
      "Include concise retained meaning when conclusions, constraints, identifiers, or unresolved failures remain necessary.",
      "Keep a result full while exact inspection, comparison, quotation, derivation, or verification may still be needed.",
      "Use restore to reverse projection; it does not retrieve history removed by Pi compaction.",
      "Batch related archive or restore decisions when useful.",
    ],
    parameters: CONTEXT_VIRTUALIZATION_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const operation = parseOperation(params ?? {});
      let result;
      if (operation) {
        const runtime = getRuntime();
        if (!runtime) {
          result = { status: "unavailable", operation, changed: [], message: "context_virtualization_unavailable" };
        } else if (operation === "archive") {
          result = await runtime.archive(params.targets);
        } else {
          result = await runtime.restore(params.refs);
        }
      } else {
        result = rejected("archive", "operation_must_be_archive_or_restore");
      }
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: { result },
      };
    },
  });
}
