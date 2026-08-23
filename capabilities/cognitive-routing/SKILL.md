# Cognitive Routing

Use one active agent, one shared visible context, and two compute profiles. Cognitive Routing changes compute—not task ownership, Workflow route, mode, authority, or evidence requirements.

## Read Current State

Before routing, read the runtime’s current `Control` and `Profile`. They are authoritative; earlier transitions and model identity are history, not current state.

- **Control:** `automatic` or `manual`.
- **Profile:** `standard` or `reasoning`.

**Standard** is the default workhorse. **Reasoning** is higher-cognition premium compute.

**Think** means analyze, decide, diagnose, review, ask, or write a compact control note. **Act** means invoke task tools or produce a substantive artifact. Profile switching and compact control notes are control operations, not task Act.

A **cognitive boundary** is one material uncertainty or judgment that standard should not resolve alone.

## Keep Ownership Separate

1. **Control ownership:** the user selects a manual hold or delegates profile selection through automatic control.
2. **Profile capability:** Cognitive Routing determines which profile may Think and Act.
3. **Workflow authority:** the user or another valid source determines which real actions may happen.

A profile change never widens authority.

| Runtime state | Capability and route |
| --- | --- |
| Automatic · Standard | Think and Act; apply the automatic routing kernel. |
| Automatic · Reasoning | Think; apply the kernel’s Reasoning Act Gate before task Act. |
| Manual · Standard | Think and Act; model-requested switching is blocked. |
| Manual · Reasoning | Think and Act without the automatic Act Gate; model-requested switching is blocked. |

Natural-language profile suggestions are advisory under automatic control. Deterministic profile controls create or release manual holds.

Under automatic control, apply the [Automatic Routing Kernel](references/automatic-routing-kernel.md).

## Respect Manual Control

Use the held profile for authorized work. A manual hold survives turns, compaction, same-session resume, and reload until the user changes it, returns to automatic control, or disables Cognitive Routing.

Recommend another profile or `/freeflow profile auto` once when it would materially improve reliability or efficiency. If the held profile cannot continue reliably, state the blocker and exact control needed.

## Switch Profiles Safely

Every automatic transition uses:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="<one-sentence audit label>"
)
```

The reason is required and capped at 160 characters. The switch must be the only tool call in that assistant response.

Before switching, write the applicable visible contract from the automatic kernel. Shared context carries existing evidence; the contract carries the boundary state, supported conclusion or open judgment, and the target profile’s role.

If a switch fails, preserve the supported state and return the blocker through Workflow. Standard must not resolve a boundary it could not transfer, and reasoning must not absorb delegated or post-closure execution after a failed handoff.

A switch never authorizes action, resolves a user-owned choice or source conflict, selects review, or overrides evidence.
