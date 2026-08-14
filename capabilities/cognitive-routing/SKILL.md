---
name: "cognitive-routing"
description: "Guide the active agent in choosing between configured standard and reasoning profiles at cognitive boundaries while preserving workflow, authority, and evidence."
---

# Cognitive Routing

Cognitive Routing changes the compute used by one agent. It does not change task ownership, tools, mode, authority, accepted intent, evidence requirements, or Workflow's route.

- **Cognitive demand** is the capability needed to choose or perform the next action reliably given its uncertainty, branching, causal depth, and consequence—not whether the agent is thinking or acting.
- **Standard** is the normal profile. It still reasons and may perform any currently authorized work.
- **Reasoning** is the configured higher-cognition profile: a more capable model, higher reasoning effort on the same model, or both. It is not Conversation Mode, planning mode, review mode, or a read-only role.

Both profiles may discuss, inspect, edit, run tools, verify, and complete authorized work.

## Obey The Control Owner

The runtime declares profile control as **automatic** or **manual**. Do not infer ownership from the active model.

Under **automatic control**:

- begin in standard and choose the profile needed at each cognitive boundary;
- treat natural-language profile suggestions as advisory evidence, not commands or holds;
- switch when the immediate cognitive demand supports the suggestion; otherwise stay and explain briefly;
- ask one focused question when the suggestion's meaning or target is unclear;
- remain automatic after switching, so the agent may switch back; when the run settles, the host returns to standard.

Under **manual control**:

- use the profile held through `/freeflow profile standard`, `/freeflow profile reasoning`, or the equivalent settings selector;
- `freeflow_switch_profile` is inactive and runtime-blocked; do not attempt it or treat conversational agreement as a profile change;
- recommend `/freeflow profile reasoning`, `/freeflow profile standard`, or `/freeflow profile auto` once when another profile or automatic control would materially help;
- expose a blocker and the exact control needed when reliable continuation is not possible through the held profile.

A blocked stale or accidental model switch leaves the manual hold and active profile unchanged and is not a successful switch. A manual hold persists across turns and resume until the user changes it, restores automatic control, or disables Cognitive Routing. Deterministic selection is the trusted hard-control surface; conversation supplies soft input only.

## Route Cognitive Demand

Stay in standard under automatic control while evidence supports the route and standard is sufficient for what comes next—for example, a known inspection, accepted pattern, bounded edit, direct check, clear result, or obvious local correction.

Consider reasoning when greater capability could materially improve the immediate decision or action, especially when:

- materially different valid approaches remain;
- an architecture or interface judgment remains after user-owned outcomes are settled;
- evidence invalidates an important assumption or strategy;
- a causal failure is unclear or repeats without convergence;
- the next authorized action requires sustained high-capability judgment.

These are cues, not automatic switches. Do not score demand after every thought or tool call, switch because the whole task is complex, or map profiles to Workflow phases. A user-owned choice remains a Decision Gate.

While reasoning, resolve the boundary that justified escalation, gather evidence, and perform authorized actions when they still benefit from higher cognition. Return only when standard is sufficient—not merely because implementation or tool use begins.

## Switch Deliberately

Only automatic control permits model-requested switching:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="<one-sentence audit label>"
)
```

The switch must be the only tool call in that assistant response. Keep `reason` within 160 characters. It records the model's declared rationale, not chain-of-thought, a context handoff, or proof that the rationale is correct.

Switch to reasoning before attempting the material judgment. Before returning to standard, state the supported conclusion, important assumptions, and bounded next action in visible context. If switching fails, preserve the reported profile and continue only when it remains suitable; otherwise expose the blocker through Workflow.

When reasoning reaches an answer, wait, deferment, stop, or other Supported Exit with no immediate continuation, finish normally. Do not create a redundant standard response solely to reset; the host handles automatic settled reset.

## Example

Suppose standard uses a general model at medium effort and reasoning uses that model at max effort or a more capable model. A known adapter edit and direct test stay in standard.

The user says, “I think reasoning would be better here, right?” Under automatic control, assess rather than comply reflexively. If the failure is a clear formatting mismatch, explain that standard is sufficient and continue. If the result contradicts a migration invariant and several causes remain plausible, switch with an agent-sourced reason naming both the suggestion and the causal uncertainty. Reasoning may inspect code, run diagnostic tests, or make an authorized experimental edit; it is not read-only. Once the cause is supported and correction bounded, expose that state and switch to standard. Automatic control remains active throughout.

If standard is manually held, do not switch. Recommend `/freeflow profile reasoning` or `/freeflow profile auto`; block if standard cannot continue reliably. `/freeflow profile reasoning` creates a user-sourced hold across later turns, while a conversational “yes” does not. `/freeflow profile auto` releases the hold and returns control to the agent. A settled automatic reset is system-sourced.

## Preserve Governing Boundaries

Evidence outranks either profile, and observation may invalidate a reasoning decision. A profile change never authorizes mutation, resolves a source conflict, supplies missing evidence, selects independent review, or approves a controlled boundary. Follow Workflow, effective mode, and current authority before and after every switch.
