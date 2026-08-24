---
name: "cognitive-routing"
description: "Use when an automatic cognitive boundary must be opened, delegated, acted within, closed, reopened, or recovered, or when manual profile control or a failed switch needs interpretation."
---

# Cognitive Routing

Use one active agent and one shared visible context while selecting between Standard and Reasoning compute. Cognitive Routing changes compute only; it never changes Workflow ownership, mode, authority, admissible effects, or evidence requirements.

## Read Current State

Read the latest extension-generated `Control` and `Profile`. They are authoritative. Earlier profile state, model identity, and transition attempts are history. Natural-language profile suggestions are advisory unless deterministic control changes the runtime state.

- **Standard** is the ordinary workhorse.
- **Reasoning** handles one material cognitive boundary.
- **Think** means analyze, decide, diagnose, review, ask, or write a compact control note.
- **Act** means invoke task tools or produce a substantive artifact.
- A **cognitive boundary** is one material uncertainty or judgment that Standard should not resolve alone.

Profile switching and compact transition contracts are control operations, not task Act.

| Runtime state | Route |
| --- | --- |
| Automatic · Standard | Think and Act; continue ordinary work or open a material boundary. |
| Automatic · Reasoning | Think; apply the Reasoning Act Gate before task Act. |
| Manual · Standard | Think and Act with Standard; model-requested switching is blocked. |
| Manual · Reasoning | Think and Act with Reasoning; the automatic Act Gate does not apply. |

## Keep Ownership Separate

The user owns manual versus automatic control. Cognitive Routing owns only compute selection. Workflow and valid user authority own real actions.

A profile change never:

- widens authority or permitted effects;
- resolves a user-owned decision or source conflict;
- changes the active Workflow owner;
- selects review;
- proves a claim or overrides evidence.

## Respect Manual Control

Under manual control, use the held profile for authorized work. Do not call the profile-switch tool.

A manual hold survives turns, compaction, same-session resume, and reload until the user changes it, returns to automatic control, or disables Cognitive Routing.

Recommend another profile or `/freeflow profile auto` once only when it would materially improve reliability or efficiency. If the held profile cannot continue reliably, state the blocker and exact control needed.

## Route Automatic Control

Boundary state decides the route before the shape of the remaining work:

- Standard with no open boundary owns ordinary work.
- Reasoning owns one `OPEN` cognitive boundary.
- Standard may execute a bounded delegation while Reasoning keeps that boundary open.
- Standard owns continuation after a `CLOSED` Boundary Handoff.
- New evidence that defeats a closed conclusion reopens the same judgment boundary.

A closed boundary may leave routine or mechanical work. That work belongs to Standard because Reasoning leadership has ended.

### Standard: Work Or Transfer

Continue in Standard when work is clear, bounded, observable, reversible, and directly verifiable. Standard owns routine tool volume, known edits, accepted patterns, mechanical integration, builds, tests, and clear local correction.

Continue through local uncertainty when a wrong attempt is cheap, observable, reversible, and easy to correct. Do not manufacture speculative work merely to avoid a transfer.

Transfer before Standard makes a material judgment when:

- materially different valid approaches remain;
- architecture, interfaces, ownership, state, or failure behavior remain unresolved;
- evidence invalidates an important assumption or closed conclusion;
- a causal failure is unclear or repeats;
- difficult synthesis is itself consequential work;
- error could be latent, irreversible, or expensive to recover;
- a selected reasoning review is due.

Classify the boundary:

- **NEW:** a material judgment appears.
- **REOPEN:** changed intent or new evidence defeats a closed conclusion.

Write:

```text
Reasoning Boundary
Boundary operation: NEW | REOPEN
What changed:
Decisive evidence or pointer:
Why Standard should not choose:
Judgment required:
```

Then switch to Reasoning. Reuse shared context instead of repeating task history. Do not perform speculative work whose validity depends on the transferred judgment.

### Reasoning: Lead One Open Boundary

Reasoning owns one `OPEN` cognitive boundary. Choose the next route in this order:

1. Missing authority or user direction returns to Workflow.
2. A supported governing judgment closes and hands off the boundary.
3. Otherwise use the smallest bounded Reasoning observation or action, or delegate mechanical execution while keeping the boundary open.

Thinking needs no gate. Before task Act under Automatic · Reasoning, identify why action is necessary to resolve the open judgment and set the smallest useful scope and stop condition.

Use **OBSERVE** when a few tightly related calls can answer one narrow, discriminating question more cheaply and clearly than delegation:

```text
Reasoning observation: inspect <scope> to determine <question>; stop when <evidence boundary> is established.
```

Use **ACT_BOUNDED** only when judgment and action are materially inseparable and expected delegation loss materially exceeds premium reasoning cost:

```text
Reasoning Act
Why judgment and action are inseparable:
Scope:
Authority:
Stop and reassess when:
```

An Act scope may cover one focused implementation, diagnostic episode, or difficult artifact section. It does not cover the whole boundary, adjacent integration, broad verification, or cleanup.

Every Reasoning observation or bounded Act expires at its stop condition and returns Reasoning to Think. Make the resulting conclusion visible before another action, delegation, or closure.

### Delegate While The Boundary Remains Open

Delegate broad, mechanical, repetitive, or token-heavy execution only when Standard has no material judgment to make. Reasoning remains the cognitive lead.

Write:

```text
Delegation
Boundary state: OPEN
Supported result or constraint:
Execution scope:
Evidence required:
Stop and return when:
```

Standard executes the bounded contract without reinterpreting its governing judgment. When the evidence is available, execution fails, evidence conflicts, or scope ends, Standard writes:

```text
Return to Reasoning
Boundary state: OPEN
Outcome or evidence pointer:
Return condition reached:
```

Then switch to Reasoning. Reasoning reassesses the same boundary and may observe, act boundedly, delegate again, close, or return to Workflow.

### Close And Hand Off

When the governing judgment is supported, write:

```text
Boundary Handoff
Boundary state: CLOSED
Continuation owner: STANDARD
Conclusion:
Important evidence and assumptions:
Standard completes:
Standard verifies:
REOPEN only if:
```

Then switch to Standard. Standard owns continuation through completion and verification.

If the named reopen condition occurs, Standard writes a `Reasoning Boundary` with `Boundary operation: REOPEN` and transfers the judgment back. Otherwise Standard must not reopen a closed conclusion merely because routine execution continues.

## Switch Profiles Safely

Every automatic transition uses:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="<one-sentence audit label>"
)
```

The reason is required and capped at 160 characters. The switch must be the only tool call in that assistant response.

Write the applicable visible transition contract before switching. Shared context carries existing evidence; the contract carries the boundary state, newly supported conclusion or open judgment, and the target profile's role.

If a switch fails, preserve the supported boundary state and return the blocker through Workflow. Standard must not resolve an untransferred material judgment, and Reasoning must not absorb delegated or post-closure execution.

## Preserve Continuity

A cognitive boundary may survive turns, compaction, resume, reload, and delegated execution. Its Reasoning observation or bounded Act scope does not; after interruption, Reasoning reassesses before acting.

Visible context carries evidence. Transition contracts carry newly derived conclusions, boundary state, execution scope, and return or reopen conditions. Hidden reasoning is never the continuation mechanism.

Bursty switching is valid when each transition moves one meaningful judgment or execution unit. Tool-by-tool switching, premium execution after closure, and returns without evidence are routing failures rather than optimization.

## Stop

Stop entirely when runtime state marks Cognitive Routing inactive or unavailable. Under manual control, stop the automatic method and continue with the held profile. After a successful closed handoff, end the detailed boundary method until a supported NEW or REOPEN condition appears.

Do not create boundaries for ordinary reversible uncertainty, switch merely because premium compute is available, or keep Reasoning active for work Standard can complete directly.
