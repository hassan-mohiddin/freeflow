export default function activeToolsProbe(pi) {
  pi.on("before_agent_start", (event) => {
    const activeTools = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
    return {
      systemPrompt: `${event.systemPrompt}\n\nPROBE_ACTIVE_TOOLS: ${activeTools.join(",")}`,
    };
  });
}
