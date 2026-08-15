---
name: "cognitive-routing"
description: "Guide the active agent in choosing between configured standard and reasoning profiles at cognitive boundaries while preserving workflow, authority, and evidence."
---

# Cognitive Routing

Cognitive Routing changes the compute used by one agent. It does not change task ownership, tools, mode, authority, accepted intent, evidence requirements, or Workflow's route.

- **Cognitive demand** is the capability needed to choose or perform the next action reliably given its uncertainty, branching, causal depth, and consequence—not whether the agent is thinking or acting.
- **Standard** is the default workhorse when no material cognitive boundary is active. It still reasons and may perform any currently authorized work.
- **Reasoning** is the configured higher-cognition profile: a more capable model, higher reasoning effort on the same model, or both.
- A **reasoning episode** begins when automatic control switches to reasoning for a declared cognitive boundary. It remains active until that boundary is resolved and the agent explicitly yields to standard.

Both profiles may discuss, inspect, edit, run tools, verify, and complete authorized work. Reasoning is not Conversation Mode, planning mode, review mode, or a read-only consultant.

## Obey The Control Owner

The runtime declares profile control as **automatic** or **manual**. Do not infer ownership from the active model.

Under **automatic control**:

- use standard when no unresolved cognitive boundary needs reasoning;
- switch to reasoning before attempting a material judgment that higher cognition could improve;
- keep the reasoning episode across response endings, user turns, tool calls, compaction, same-session resume, and reload while its boundary remains unresolved;
- reassess the active boundary whenever work resumes and yield only when standard is sufficient for what remains;
- treat natural-language profile suggestions as advisory evidence, not commands or holds;
- ask one focused question when a suggestion's meaning or target is unclear.

Technical idleness is not cognitive resolution. `agent_settled` means Pi has no automatic continuation; it does not end a discussion, diagnosis, decision, or reasoning episode.

Under **manual control**:

- use the profile held through `/freeflow profile standard`, `/freeflow profile reasoning`, or the equivalent settings selector;
- `freeflow_switch_profile` is inactive and runtime-blocked; do not attempt it or treat conversational agreement as a profile change;
- recommend `/freeflow profile reasoning`, `/freeflow profile standard`, or `/freeflow profile auto` once when another profile or automatic control would materially help;
- expose the blocker and exact control needed when reliable continuation is not possible through the held profile.

A manual hold persists until the user selects another hold, restores automatic control, or disables Cognitive Routing. User turns, compaction, same-session resume, and reload do not clear it. Reload replaces the process-local lease but does not itself change a valid semantic hold. A blocked stale or accidental switch leaves the hold and active profile unchanged.

`/freeflow profile auto` releases a hold without forcing a profile transition. Once automatic control returns, reassess the active profile. If a released reasoning hold no longer has a material boundary, yield before other work.

## Place Cognition Deliberately

Prefer standard for known inspections, accepted patterns, bounded edits, direct checks, clear results, and routine high-volume tool loops.

Consider reasoning when greater capability could materially improve the immediate decision or action, especially when:

- materially different valid approaches remain;
- architecture, interfaces, ownership, or failure behavior remain unresolved after user-owned outcomes are settled;
- evidence invalidates an important assumption or strategy;
- a causal failure is unclear or repeats without convergence;
- difficult synthesis has consequential downstream effects;
- the next authorized action requires sustained high-capability judgment.

These are cues, not automatic switches. Do not score demand after every thought, switch around individual tool calls, escalate because the whole task is complex, or map profiles to Workflow phases. A user-owned choice remains a Decision Gate.

The source of feedback does not determine the profile. Under automatic control, when new evidence leaves its validity, causal meaning, combined effects, or safe remedy materially unresolved, switch before resolving those judgments. Do not escalate merely because feedback arrived; standard is sufficient when the result and next action are clear and bounded.

Reasoning is the cognitive lead for the boundary, not a detached oracle. It may inspect evidence, run diagnostics, write difficult material, or perform authorized actions while observation and judgment must evolve together. Prefer yielding before long mechanical execution once the direction is supported, but do not force standard to gather or interpret evidence whose selection still depends on the unresolved judgment.

## Complete The Reasoning Episode

Yield only when:

- the episode's central uncertainty is resolved;
- material assumptions and evidence are explicit;
- the selected direction is supported;
- remaining work is bounded enough for standard.

Before switching to standard, place a visible handoff in context:

```text
Conclusion:
Important evidence and assumptions:
Bounded next action:
Reopen reasoning when:
```

Do not rely on hidden reasoning transferring between profiles. The visible handoff, ordinary session context, and preserved evidence are the continuation boundary.

Do not yield merely because the current response ends, Pi settles, a tool call begins, or the agent is waiting for the user. If the boundary remains unresolved while waiting, stay in reasoning for the next user turn or new evidence. If what arrives is unrelated or routine, reassess and yield before handling it when standard is sufficient.

## Switch Deliberately

Only automatic control permits model-requested switching:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="<one-sentence audit label>"
)
```

The switch must be the only tool call in that assistant response. Keep `reason` within 160 characters. It records the declared boundary or yield rationale, not chain-of-thought, a context handoff, or proof that the rationale is correct.

Switch to reasoning before attempting the material judgment. To yield, write the visible handoff before the switch call so standard can continue from explicit state. Do not call the tool merely to restate the already active profile. If switching fails, preserve the reported profile and continue only when it remains suitable; otherwise expose the blocker through Workflow.

## Example

A known adapter edit and direct test stay in standard. Evidence that several adapters may share one failure unit, with credible ownership boundaries unresolved, escalates to reasoning before choosing a remedy. Reasoning may inspect code, ask the user a focused question, and finish that response without yielding; Pi settlement does not reset it. On the next user turn, reasoning continues the same boundary. Once the direction is supported and any required user decision is settled, it writes the conclusion, assumptions, bounded implementation action, and reopen condition, then switches to standard for routine execution.

If standard is manually held, do not escalate through the tool. Recommend `/freeflow profile reasoning` or `/freeflow profile auto`; block only when standard cannot continue reliably. A conversational “yes, use reasoning” remains advisory, while `/freeflow profile reasoning` creates the persistent hold.

## Preserve Governing Boundaries

Evidence outranks either profile, and observation may invalidate a reasoning decision. A profile change never authorizes mutation, resolves a source conflict, supplies missing evidence, selects independent review, or approves a controlled boundary. Follow Workflow, effective mode, and current authority before and after every switch.
