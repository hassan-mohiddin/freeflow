const NOISE = "noise-token ".repeat(18);

const TOOL_REFS = {
  mcp_search: ["ctx:decision-mcp", "ctx:decision-mcp-2"],
  web_search: ["ctx:decision-web"],
  git_log: ["ctx:decision-git"],
  governing_context: ["ctx:governing-authority"],
  test_run: ["ctx:exact-test"],
};

function resultText(toolName, query) {
  const refs = TOOL_REFS[toolName] ?? [];
  const evidence =
    toolName === "test_run"
      ? "EXACT TEST: auth/refresh.test.ts:184; Expected refreshed token accepted; Received token rejected after rotation; repair: persist rotated token before retry."
      : `DECISION EVIDENCE: ${toolName} found that rotated credentials must be durable before retry; source=${String(query ?? "unknown")}.`;
  return [
    `${toolName} query: ${String(query ?? "")}`,
    `Context refs: ${refs.join(", ")}`,
    evidence,
    Array.from(
      { length: toolName === "test_run" ? 90 : 260 },
      (_, index) => `${toolName} noise ${index + 1} ${NOISE}`,
    ).join("\n"),
  ].join("\n");
}

function registerSearchTool(pi, name, description) {
  pi.registerTool({
    name,
    label: name,
    description,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: resultText(name, params?.query) }],
        details: { refs: TOOL_REFS[name] ?? [], query: params?.query ?? null },
      };
    },
  });
}

function registerContextTool(pi) {
  pi.registerTool({
    name: "freeflow_context",
    label: "Freeflow Context",
    description: "Archive or restore consumed context references returned by earlier tools.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        operation: { type: "string", enum: ["archive", "restore"] },
        targets: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              ref: { type: "string" },
              retained: { type: "string" },
            },
            required: ["ref"],
          },
        },
        refs: { type: "array", items: { type: "string" } },
      },
      required: ["operation"],
    },
    async execute(_toolCallId, params) {
      const changed =
        params?.operation === "archive" ? (params.targets ?? []).map((target) => target.ref) : (params.refs ?? []);
      return {
        content: [
          { type: "text", text: `${params?.operation ?? "unknown"} accepted for ${changed.length} reference(s).` },
        ],
        details: { status: "ok", changed },
      };
    },
  });
}

export default function contextProbe(pi) {
  let providerInjectionRequest = 0;
  registerSearchTool(pi, "mcp_search", "Search simulated decision-bearing MCP evidence.");
  registerSearchTool(pi, "web_search", "Search simulated decision-bearing web evidence.");
  registerSearchTool(pi, "git_log", "Search simulated repository history evidence.");
  registerSearchTool(pi, "governing_context", "Return the accepted authority and constraints for the current task.");
  registerSearchTool(pi, "test_run", "Run the simulated exact verification test.");
  registerContextTool(pi);

  if (process.env.PROBE_INJECT_CONTEXT === "true") {
    pi.on("before_agent_start", (event) => ({
      systemPrompt: `${event.systemPrompt}\n\nPROBE_EXTENSION_CONTEXT: injected by the declared runtime bundle.`,
    }));
  }

  if (
    process.env.PROBE_INJECT_PROVIDER_CONTEXT === "true" ||
    process.env.PROBE_INJECT_PROVIDER_CONTEXT_AFTER_FIRST === "true"
  ) {
    pi.on("context", (event) => {
      providerInjectionRequest += 1;
      if (process.env.PROBE_INJECT_PROVIDER_CONTEXT_AFTER_FIRST === "true" && providerInjectionRequest === 1) {
        return undefined;
      }
      return {
        messages: [
          ...(event.messages ?? []),
          {
            role: "user",
            content: [{ type: "text", text: "PROBE_PROVIDER_CONTEXT: injected by the context event." }],
            timestamp: Date.now(),
          },
        ],
      };
    });
  }
}
