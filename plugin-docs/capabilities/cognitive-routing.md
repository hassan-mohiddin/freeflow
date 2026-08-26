# Cognitive Routing

Cognitive Routing changes compute placement for one active agent. It does not create another agent, transfer task ownership, widen authority, or replace Workflow.

## Host boundary and status

Cognitive Routing requires the PiFlow host contract because it owns session model-state control and the model lease used for profile transitions. Normal Pi can display the configuration for inspection but keeps routing runtime-disabled.

The implementation is an experimental PiFlow-hosted MVP. Deterministic runtime checks prove assembly, gating, host capability detection, persistence, and transition mechanics; behavioral model acceptance remains separate.

Cognitive Routing is effective only when:

1. Freeflow repository activation is valid;
2. Cognitive Routing is configured and enabled;
3. both profiles resolve to available, authenticated, distinct effective model/thinking pairs;
4. the host exposes the required PiFlow model-state controls.

Missing profiles, unavailable or unauthenticated models, invalid thinking levels, identical effective profiles, or host limitations leave routing unavailable rather than partially active.

## One agent and shared context

The `standard` and `reasoning` profiles are two compute profiles for one persistent agent. They share:

- visible conversation and tool history;
- Workflow owner and route;
- authority envelope and accepted intent;
- task memory and evidence requirements;
- review independence.

A profile is not a task owner and a transition is not an authorization source.

## Manual and automatic control

### Manual control

A manual hold lets the user keep `standard` or `reasoning` active. The held profile runs the ordinary unsplit Workflow and model-requested switching is blocked.

### Automatic control

Automatic control lets Cognitive Routing choose compute placement. Reasoning leads material execution boundaries; Standard executes decision-complete delegated contracts when no material judgment remains.

The target is cost-sensitive quality, not a claim of equivalence between profiles.

## Cognitive Execution Loop

```text
Workflow establishes authority, owner, and slice
-> material execution boundary appears
-> Reasoning establishes the governing contract
-> DELEGATE bounded execution to Standard
-> Standard uses the Environment Interaction Loop
-> RETURN evidence to Reasoning
-> Reasoning self-reviews and closes, corrects, delegates again, or returns to Workflow
```

Under automatic control, the boundary may be opened with `NEW`, invalidated with `REOPEN`, returned to with `RETURN`, or closed with `CLOSE + HANDOFF`. `YIELD` moves routine work to Standard only when no boundary is open.

Delegation transfers bounded execution, not the cognitive boundary. Standard must not reinterpret the governing judgment, expand scope, hide contradictory evidence, or continue after the return condition.

## Reasoning action gate

Reasoning Thinks by default. Direct task Act is gated under automatic control:

- `OBSERVE` is one narrow, discriminating evidence scope when direct observation is cheaper and clearer than delegation;
- `ACT_BOUNDED` is rare work where judgment and action are materially inseparable and delegation would create greater expected loss;
- `DELEGATE` is not Reasoning Act; it is the transfer of a decision-complete execution contract to Standard.

Each Act scope expires at its stop condition and never authorizes adjacent work. Missing authority or a user-owned decision returns to Workflow outside the gate.

## Controls and history

While PiFlow is idle, use:

```text
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
/freeflow profile history
/freeflow profile history active
/freeflow profile history anomalies
```

- `standard` and `reasoning` create manual holds;
- `auto` releases the hold;
- history commands expose read-only transition evidence.

### PiFlow keyboard shortcuts

While PiFlow is idle:

- `Ctrl+Shift+R` cycles the manual standard/reasoning hold. It switches to the other active profile and keeps manual control.
- `Ctrl+Shift+A` cycles the automatic standard/reasoning profile. If a manual hold is active, the first press releases the hold and returns to automatic control without forcing a profile transition.

These shortcuts are PiFlow-only; normal Pi does not register them. Profile changes remain unavailable while the host is running.

The model-facing Runtime State contains only current `Control` and `Profile`. Provider/model/lease details remain internal. Transition history is evidence, not current-state authority.

Agents may request one bounded automatic transition through:

```text
freeflow_switch_profile(target="reasoning" | "standard", reason="...")
```

The request changes compute only and never authorizes a task action.

## Failure behavior

- Missing current state is unavailable; do not infer it from model identity or old transitions.
- A failed switch does not silently expand Reasoning or Standard’s role.
- A delegated return resumes the same open boundary; it is not a new boundary.
- A closed boundary is reopened only by material new evidence, changed intent, or an invalidated assumption.
- Transition history reports unresolved or anomalous evidence instead of fabricating a cause.

## Evidence boundary

Cognitive Routing documentation and deterministic tests establish contracts and delivery mechanics. They do not establish that model behavior is universally improved, that every transition is optimal, or that the capability is production-ready.

## Related documentation

- [Capabilities](README.md)
- [System prompt architecture](../prompt-architecture.md)
- [Workflow](../workflow.md)
- [PiFlow integration](../integrations/piflow.md)
- [Release evidence](../release-evidence/README.md)
