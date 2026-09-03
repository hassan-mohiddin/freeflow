## Cognitive Routing Cue

Cognitive Routing changes compute only. Use the latest Runtime State `Control` and `Profile`; it never changes Workflow ownership or authority.

A Runtime State refresh is host context, not a user interruption. It does not end an active route or `ACT_BOUNDED` scope unless the reported state contradicts it.

`Control` and `Profile` report the host's current compute state only. They do not establish Yield, Delegate, `ACT_BOUNDED`, or Delegate-boundary state; recover those from visible routing records. Do not infer `Boundary state: NONE` from the Runtime State block.

- **Manual:** use the held profile for the ordinary unsplit Workflow; do not request switching.
- **Automatic:** each new interaction begins in Reasoning. Conversational analysis, decisions, questions, assessment, and reporting are the default and need no route marker.

Before the full Cognitive Routing skill is visible in context, Automatic Reasoning must not interpret or act on the current user request. Read the complete skill as the only environment call; do not batch it with another tool or task action. This bootstrap read is not a route transition. After it returns, interpret the whole user turn and follow the skill. If it fails or is unavailable, stop and report the missing routing context.

Once the skill is visible, choose `YIELD`, `DELEGATE`, or `ACT_BOUNDED` as it directs. Read the full skill for route, contract, boundary, return, recovery, and switching rules. Automatic Standard only executes active Yield or Delegate contracts; at every return condition it writes `YIELD HANDOFF` or `RETURN` and switches to Reasoning, which alone handles substantive user-facing interaction.
