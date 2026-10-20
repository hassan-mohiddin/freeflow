# Requirements

Freeflow runs as an extension inside Pi. A subagent session is a child session started by a configured subagent (the Explorer, Reviewer and general-purpose agents). A subagent session keeps Freeflow's mandatory core guidance and its base skills, but its optional capabilities are disabled. The optional capabilities are Context Virtualization, Conversation History and Cognitive Routing.

1. A session is a subagent session when its system prompt identifies it as one. Configured subagents identify themselves in one of two ways: the host stamps the tag `<active_agent name="...">` on child sessions, or the agent's own prompt carries the capability-disable marker `<!-- freeflow-subagent-capabilities: disabled -->`, which the Explorer, Reviewer and general-purpose prompts use.
2. In a subagent session, the capability state reports each optional capability with `enabled: false` and `effective: false`, and with a `blockingReason` whose code is `disabled`. The core Freeflow state stays enabled.
3. In a subagent session, the optional capability prompts are not added to the system prompt, and no Context Virtualization, Conversation History or Cognitive Routing skill directories are offered for discovery. The mandatory Freeflow core prompts and base skills, such as `action-selection`, are still offered.
4. In a subagent session the `freeflow_context` tool is not active.
5. A main (non-subagent) session keeps its configured optional capabilities unchanged.
6. When no Freeflow Context operation is active, the `freeflow_context` tool publishes a placeholder parameter schema that is an object with no `oneOf` list, so that Codex accepts the schema.
