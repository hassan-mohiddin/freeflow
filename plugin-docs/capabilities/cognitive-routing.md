# Cognitive Routing

Cognitive Routing changes compute placement for one active agent. It does not create another agent, transfer task ownership, widen authority, or replace Workflow.

## Host boundary and status

Cognitive Routing works in Pi and PiFlow when the host exposes the required model-state controls. Normal Pi uses its official model registry, model, thinking-level, and session-entry APIs; PiFlow uses its host-owned model-state lease.

The implementation is an experimental Pi/PiFlow capability. Deterministic runtime checks prove assembly, gating, host capability detection, persistence, and transition mechanics; behavioral model acceptance remains separate.

Cognitive Routing is effective only when:

1. Freeflow repository activation is valid;
2. Cognitive Routing is configured and enabled;
3. both profiles resolve to available, authenticated, distinct effective model/thinking pairs;
4. the host exposes the required model-state controls for its runtime.

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

Automatic control lets Cognitive Routing choose compute placement. Each new user interaction begins in Reasoning, and internal profile transitions are not user-selected cycles. For an authorized execution-bearing activity, Reasoning chooses one route:

- **Yield:** Standard temporarily leads a small, exact, directly verifiable result and hands it back when complete.
- **Delegate:** Reasoning remains responsible for the governing result while Standard executes an adaptive contract inside an open model-written boundary.
- **Task Act:** Reasoning performs a narrow direct observation or action when judgment and action are materially inseparable.

Automatic control always begins and returns to the Reasoning profile between routes. Standard is used automatically only through Yield or Delegate.

The target is cost-sensitive quality, not a claim of equivalence between profiles.

## Cognitive Execution Routes

```text
Workflow establishes authority, owner, and slice
-> Reasoning receives an authorized execution-bearing activity
   ├─ YIELD
   │  └─ switch to Standard; ordinary work; YIELD HANDOFF → Reasoning
   ├─ DELEGATE
   │  └─ open a model-written boundary; Standard executes
   │     └─ RETURN → Reasoning assessment; boundary remains open
   └─ TASK ACT
      └─ narrow direct OBSERVE or ACT_BOUNDED scope → Reasoning
```

Under automatic control, Yield has no Cognitive Routing execution boundary. Delegate opens one with `NEW` or `REOPEN`; `RETURN` leaves it open and only Reasoning closes it. Task Act creates no boundary. A closed boundary may be reopened only for the same authorized outcome.

Delegation transfers bounded execution, not the cognitive boundary. Standard must not reinterpret the governing judgment, expand scope, hide contradictory evidence, or continue after the return condition.

## Reasoning action gate

Reasoning Thinks by default. Under automatic control, it may choose Yield, Delegate, or direct Task Act for an authorized execution-bearing activity. Direct Task Act remains gated:

- `OBSERVE` is one narrow, discriminating evidence scope when direct observation is cheaper and clearer than delegation;
- `ACT_BOUNDED` is rare work where judgment and action are materially inseparable and delegation would create greater expected loss;
- direct Task Act may occur whenever Reasoning controls the activity, including while assessing an open delegated boundary, but not while Standard is actively executing.

Each Act scope expires at its stop condition and never authorizes adjacent work. Missing authority or a user-owned decision returns to Workflow outside the gate.

## Controls and history

While Pi or PiFlow is idle, use:

```text
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
/freeflow profile history
/freeflow profile history active
/freeflow profile history anomalies
```

- `standard` and `reasoning` create manual holds;
- `auto` releases the hold and returns automatic control to the Reasoning profile;
- history commands expose read-only transition evidence.

### Pi and PiFlow keyboard shortcuts

While either host is idle:

- `Ctrl+Shift+R` cycles the manual standard/reasoning hold. It switches to the other active profile and keeps manual control.
- `Ctrl+Shift+A` sets automatic control. It releases a manual hold and moves to Reasoning when necessary; repeating it while already automatic is idempotent.

Both hosts expose these controls when their required model-state APIs are available. Profile changes remain unavailable while the host is running.

The model-facing Runtime State contains only current `Control` and `Profile`. Provider/model/lease details remain internal. Transition history is evidence, not current-state authority.

Agents may request one bounded automatic transition through:

```text
freeflow_switch_profile(target="reasoning" | "standard", reason="...")
```

The request changes compute only and never authorizes a task action.

## Failure behavior

- Missing current state is unavailable; do not infer it from model identity or old transitions.
- A failed switch does not silently expand Reasoning or Standard’s role.
- A Yield handoff transfers the profile back to Reasoning without creating an execution boundary.
- A delegated return resumes the same open boundary; it is not a new boundary.
- Closing a delegated boundary leaves Reasoning active; it does not hand leadership to Standard.
- A closed boundary is reopened only by material new evidence, changed intent, or an invalidated assumption.
- Transition history reports unresolved or anomalous evidence instead of fabricating a cause.
- A native Pi model or thinking-level selection suspends routing until explicit reactivation; partial transitions roll back or remain blocked with persisted evidence.

## Evidence boundary

Cognitive Routing documentation and deterministic tests establish contracts and delivery mechanics. They do not establish that model behavior is universally improved, that every transition is optimal, or that the capability is production-ready.

## Related documentation

- [Capabilities](README.md)
- [System prompt architecture](../prompt-architecture.md)
- [Workflow](../workflow.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
- [Release evidence](../release-evidence/README.md)
