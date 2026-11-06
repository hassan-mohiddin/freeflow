// Recorded inputs for Codex's driver (SPEC-012, section 7): one per hook event Freeflow uses, with every field Codex's
// generated input schema requires, shaped as openai/codex 079e17a422347e49d02501304f79fade7e569362 writes them
// (codex-rs/hooks/schema/generated/*.command.input.schema.json, copied beside this file at that commit). Codex was not
// run here: no live session produced them, so a field Codex sends that its schema leaves out is not exercised.

/** The schema file each event's input follows. */
export const SCHEMAS = {
  SessionStart: "session-start.command.input.schema.json",
  UserPromptSubmit: "user-prompt-submit.command.input.schema.json",
  PreToolUse: "pre-tool-use.command.input.schema.json",
  PostToolUse: "post-tool-use.command.input.schema.json",
  PostModelRequest: "model-request.command.input.schema.json",
  PreCompact: "pre-compact.command.input.schema.json",
  PostCompact: "post-compact.command.input.schema.json",
  SubagentStart: "subagent-start.command.input.schema.json",
  SubagentStop: "subagent-stop.command.input.schema.json",
  Stop: "stop.command.input.schema.json",
  SessionEnd: "session-end.command.input.schema.json",
};

/** The output schema each event's additionalContext (and PreToolUse's deny) answers in. */
export const OUTPUT_SCHEMAS = {
  SessionStart: "session-start.command.output.schema.json",
  UserPromptSubmit: "user-prompt-submit.command.output.schema.json",
  PreToolUse: "pre-tool-use.command.output.schema.json",
  PostToolUse: "post-tool-use.command.output.schema.json",
};

/**
 * One event's input for a session in `cwd`, with `fields` over the recorded values.
 * @param {string} event
 * @param {{ session: string, cwd: string }} where
 * @param {Record<string, unknown>} [fields]
 */
export function recorded(event, { session, cwd }, fields = {}) {
  const common = { session_id: session, transcript_path: null, cwd, hook_event_name: event, model: "gpt-5-codex" };
  const turn = { turn_id: "turn-1", permission_mode: "default" };
  const byEvent = {
    SessionStart: { permission_mode: "default", source: "startup" },
    UserPromptSubmit: { ...turn, prompt: "Fix the failing test." },
    PreToolUse: { ...turn, tool_name: "Bash", tool_use_id: "call_1", tool_input: { command: "npm test" } },
    PostToolUse: {
      ...turn,
      tool_name: "Bash",
      tool_use_id: "call_1",
      tool_input: { command: "npm test" },
      tool_response: "1 passing",
    },
    PostModelRequest: {
      turn_id: "turn-1",
      status: "completed",
      error: null,
      token_usage: {
        input_tokens: 1200,
        cached_input_tokens: 1000,
        cache_write_input_tokens: 0,
        output_tokens: 80,
        reasoning_output_tokens: 20,
        total_tokens: 1280,
      },
    },
    PreCompact: { turn_id: "turn-1", trigger: "auto" },
    PostCompact: { turn_id: "turn-1", trigger: "auto" },
    SubagentStart: { ...turn, agent_id: "agent-1", agent_type: "default" },
    SubagentStop: {
      ...turn,
      agent_id: "agent-1",
      agent_type: "default",
      agent_transcript_path: null,
      last_assistant_message: "Done.",
      stop_hook_active: false,
    },
    Stop: { ...turn, last_assistant_message: "Fixed it.", stop_hook_active: false },
    SessionEnd: { reason: "other" },
  };
  const input = { ...common, ...byEvent[event], ...fields };
  // SessionEnd's schema has no model.
  if (event === "SessionEnd") delete input.model;
  return input;
}
