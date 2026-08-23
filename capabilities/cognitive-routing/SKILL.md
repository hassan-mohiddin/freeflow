# Cognitive Routing

Use one active agent, one shared visible context, and two compute profiles. Cognitive Routing changes compute—not task ownership, Workflow route, mode, accepted intent, evidence requirements, or authority.

## Read Runtime State

Read the runtime’s current `Control` and `Profile` before routing. They are authoritative; never infer either from the active model or earlier transitions, and do not guess when unavailable.

- **Control:** `automatic` or `manual`.
- **Profile:** `standard` or `reasoning`.

**Standard** is the default workhorse. **Reasoning** is higher-cognition premium compute.

**Think** means analyze visible context, decide, diagnose, review, ask, or write a compact control note. **Act** means invoke task tools or produce a substantive artifact such as code or a specification. Profile switching and compact control notes are not task Act.

A **cognitive boundary** is one material uncertainty or judgment that standard should not resolve alone.

Keep three ownership boundaries separate:

1. **Control ownership:** the user selects a manual hold or delegates profile selection through automatic control.
2. **Profile capability:** Cognitive Routing determines which profile may Think and Act.
3. **Workflow authority:** the user or another valid authority source determines which real actions may happen; Workflow establishes and preserves that authority.

A profile switch or hold changes capability—not authority.

| Runtime state | Profile capability | Agent routing | User control |
| --- | --- | --- | --- |
| Automatic · Standard | Think + Act | May switch for a new, reopened, or returning boundary | Profile selector creates a manual hold; `auto` is unchanged |
| Automatic · Reasoning | Think + gated Act | May Observe, Act boundedly, delegate execution, or close and hand off | Profile selector creates a manual hold; `auto` is unchanged |
| Manual · Standard | Think + Act | Model-requested switching is blocked | User may hold reasoning or release to automatic at standard |
| Manual · Reasoning | Think + Act | Model-requested switching is blocked | User may hold standard or release to automatic at reasoning |

Natural-language profile suggestions are advisory evidence, not persistent holds. When their meaning or target is unclear, ask one focused question.

Under automatic control, apply the [Automatic Routing Kernel](references/automatic-routing-kernel.md).

## Respect Manual Control

If control is manual, use the held profile for authorized work and do not attempt model-requested switching. Manual reasoning may Think and Act without passing the automatic Reasoning Act Gate.

A manual hold survives turns, compaction, same-session resume, and reload until the user changes it, restores automatic control, or disables Cognitive Routing.

Recommend another profile or `/freeflow profile auto` once when it would materially improve reliability or efficiency. Releasing a hold returns profile choice to automatic control without forcing an immediate transition. If reliable continuation is impossible through the held profile, state the blocker and exact control needed.

## Switch Safely

Every profile transition uses one switch mechanism. Policy labels such as **NEW**, **REOPEN**, **RETURN**, **DELEGATE**, and **CLOSE + HANDOFF** explain the transition; they do not create different switch types.

Only automatic control permits model-requested switching:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="<one-sentence audit label>"
)
```

The switch must be the only tool call in that assistant response. Keep `reason` within 160 characters. It records an audit label; it does not replace visible transition state or store chain-of-thought.

Before requesting a switch, make the transition state explicit in visible context: the supported result or open boundary, decisive evidence or pointer, and next bounded action or judgment. Reuse shared context instead of repeating it; never rely on hidden reasoning.

If switching to reasoning fails, standard must not make the material judgment it identified. If switching to standard fails, reasoning must not silently absorb delegated high-volume work or post-closure continuation. Preserve supported state and expose the blocker through Workflow.

A profile transition never authorizes action, resolves a user-owned choice or source conflict, selects independent review, or overrides evidence. Follow Workflow before and after every switch.
