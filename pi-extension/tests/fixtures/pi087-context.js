import assert from "node:assert/strict";

/** Exercise the Pi 0.87 full-transcript boundary while keeping older conversation-only assertions focused. */
export function contextHandler(handlers) {
  return async (event, ctx) => {
    const supplied = event.messages ?? [];
    const leading =
      supplied[0]?.role === "system"
        ? supplied[0]
        : { role: "system", content: "", sections: { preamble: "fixture system prompt" }, timestamp: 0 };
    const messages = supplied[0]?.role === "system" ? supplied : [leading, ...supplied];
    const result = await handlers.get("context_with_system")({ ...event, messages }, ctx);
    assert.equal(result.messages[0]?.role, "system", "full-transcript handler must retain Pi's leading prompt");
    return { ...result, fullMessages: result.messages, messages: result.messages.slice(1) };
  };
}

/** Pi 0.87 handlers mutate prompt sections; returning a forced systemPrompt would flatten history. */
export function beforeAgentStartHandler(handlers) {
  return async (input, ctx) => {
    const event = {
      ...input,
      systemPromptOptions: {
        ...(input.systemPromptOptions ?? {}),
        sections: { ...(input.systemPromptOptions?.sections ?? {}) },
        selectedTools: [...(input.systemPromptOptions?.selectedTools ?? ["read", "bash", "edit", "write"])],
      },
    };
    const result = await handlers.get("before_agent_start")(event, ctx);
    assert.equal(result?.systemPrompt, undefined, "Freeflow must not force an opaque replacement prompt");
    return { ...event, renderedGuidance: event.systemPromptOptions.sections.freeflow_guidance, handlerResult: result };
  };
}
