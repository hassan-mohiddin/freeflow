# Cognitive Routing

Splits one Pi session between a **Coordinator** profile, which talks to the user and judges the work, and **worker** profiles (Helper, Executor), which do delegated work, usually on a cheaper model or lower effort. Routing switches Pi's model and effort per profile, and with **projection** on, gives the Coordinator a reduced view of the worker's history: the report plus the evidence it selected.

How it works and why, including behavior that looks wrong but is intended: [`dev-docs/subsystems/cognitive-routing.md`](../../../dev-docs/subsystems/cognitive-routing.md). User-facing behavior: [Cognitive Routing](../../../plugin-docs/capabilities/cognitive-routing.md). The model-facing contract lives in `capabilities/cognitive-routing/`.

## Concepts

- **Unit**: one piece of user-facing work the Coordinator owns. The Coordinator inspects, assesses, recovers, and closes it with `freeflow_unit`.
- **Assignment**: delegated work inside a unit, created or replaced with `freeflow_delegate` and finished by the worker with `freeflow_return` (submit, supplement, or retry).
- **Handoff**: the switch from one profile to another when a delegation or return is accepted.
- **Source / ref**: an attributed piece of session history (a tool result, a message) with a stable reference and content hash. Evidence selection works on refs (`freeflow_project`).
- **Event journal**: every routing decision is an event stored in the Pi session. Routing state is rebuilt by replaying the events, so it survives reloads, resume, and compaction.

## Files

**Wiring**

| File | Owns |
|---|---|
| [`runtime.ts`](runtime.ts) | Routing as the extension sees it: binds to the session, follows ancestry and configuration changes, handles `/freeflow profile` and `/freeflow resume`, and forwards each host hook to its owner. |
| [`tools.ts`](tools.ts) | Registers the routing tools and keeps them out of codemode scripts. |
| [`schemas.ts`](schemas.ts) | Argument schemas for the routing tools, and messages explaining why arguments match no operation. |
| [`render.ts`](render.ts) | How routing tool calls and results are drawn in Pi's terminal. |

**State**

| File | Owns |
|---|---|
| [`types.ts`](types.ts) | Shared types and constants: profiles, delegation modes, entry and message type names. |
| [`event-schema.ts`](event-schema.ts) | Validates stored routing events. |
| [`event-store.ts`](event-store.ts) | Appends events to the session and reads them back. |
| [`state.ts`](state.ts) | The reducer: event list → routing state. |
| [`session.ts`](session.ts) | State shared by every part of routing for one bound session: the journal, the current turn, blocking errors, control mode, and the queue that orders control changes. |

**Control**

| File | Owns |
|---|---|
| [`model-control.ts`](model-control.ts) | The only code that changes Pi's model and effort: manual holds, presets, delegation mode, switches staged until the next prompt. |
| [`config.ts`](config.ts) | Routing configuration: enabled, delegation mode, projection, and the model and effort of each profile. |
| [`economics.ts`](economics.ts) | Advisory warnings when a preset is unlikely to save money or keep the prompt cache. |
| [`status.ts`](status.ts) | Routing's status line, its part of the Runtime State, and the detailed view used by unit status and diagnostics. |

**Requests and tool calls**

| File | Owns |
|---|---|
| [`assembler.ts`](assembler.ts) | Builds each routed request: finds the latest delivered user input, opens the execution, and prepares the profile's view. |
| [`projection.ts`](projection.ts) | Prepares a profile's view. Only the Coordinator's view under projection is selective; workers see the full history. Renderings are cached per entry and variant (`ViewCache`) and reused across requests. |
| [`sources.ts`](sources.ts) | Turns session history into sources with refs and hashes, and associates request messages with them. |
| [`provenance.ts`](provenance.ts) | Notes that name each exchange's attributed sources. |
| [`budget.ts`](budget.ts) | A local planning estimate of request size (not a provider token count). |
| [`gate.ts`](gate.ts) | What each profile may do while it runs: which tools a worker may call, what an assessment permits, handoff batching. |
| [`handlers.ts`](handlers.ts) | Runs the routing tools one at a time. Each accepted call is recorded once, so a repeated call returns the saved result. |
| [`handoffs.ts`](handoffs.ts) | Finishes each routed turn and moves work between profiles, including resuming an assignment after an interruption. |

## Rules

- Only `model-control.ts` changes Pi's model or effort.
- State changes go through events; never mutate routing state directly.
- A refused routing call returns a blocked result that names what to reconcile; it never half-applies.
- Projection must never send a worker's full history to the Coordinator, even on failure. A projection error blocks the request instead.
- Cached view renderings are shared across requests: never mutate a message in a view. Tests set `FREEFLOW_FREEZE_VIEWS` to catch it.

Tests: [`tests/cognitive-routing/`](../../tests/cognitive-routing/README.md).
