# Automatic Routing Kernel

Use this kernel under automatic control. Route from the current runtime state and the latest visible boundary contract. Under manual control, use the held profile and treat this kernel only as efficiency guidance.

Standard Thinks and Acts by default. Reasoning always Thinks; task Act passes through the Reasoning Act Gate below.

## Route By Boundary State

Boundary state decides the route before the shape of the remaining work.

| Current situation | Owner and next action |
| --- | --- |
| Standard with no active boundary | Standard owns ordinary work. |
| Standard finds a material new judgment | Write `NEW`, then switch to reasoning. |
| Standard finds evidence that defeats a closed conclusion | Write `REOPEN`, then switch to reasoning. |
| Reasoning leads an `OPEN` boundary | Resolve the judgment, gather bounded evidence, act boundedly, or delegate execution. |
| Standard receives **Delegation · OPEN** | Execute the bounded contract, then return evidence to reasoning. |
| Standard receives **Boundary Handoff · CLOSED** | Own continuation through completion and verification. |

A closed boundary may leave routine or mechanical work. That work belongs to standard because reasoning leadership has ended. An open boundary may delegate mechanical execution while reasoning remains the cognitive lead.

## Standard: Work Or Escalate

Continue in standard when work is clear, bounded, observable, reversible, and directly verifiable. Standard handles routine tool volume, known edits, accepted patterns, mechanical integration, builds, tests, and clear corrections.

Continue through local uncertainty when a wrong attempt is observable, reversible, and cheap to correct. Do not manufacture speculative standard work merely to avoid a reasoning switch.

Switch before standard makes the material judgment when:

- materially different valid approaches remain;
- architecture, interfaces, ownership, or failure behavior remain unresolved;
- evidence invalidates an important assumption or closed conclusion;
- a causal failure is unclear or repeats;
- difficult synthesis is itself consequential work;
- error could be latent, irreversible, or expensive to recover;
- a selected reasoning review is due.

Classify the boundary:

- **NEW:** a material judgment appears.
- **REOPEN:** new evidence or changed intent defeats a closed conclusion.

Write:

```text
Reasoning Boundary
Boundary operation: NEW | REOPEN
What changed:
Decisive evidence or pointer:
Why standard should not choose:
Judgment required:
```

Then switch to reasoning. Reuse shared context rather than repeating task history.

## Reasoning: Lead The Open Boundary

Reasoning owns one `OPEN` cognitive boundary. Choose the next route in this order:

1. Missing authority or user direction returns to Workflow.
2. A supported governing judgment closes and hands off the boundary.
3. Otherwise use the smallest necessary Reasoning Act or delegate bounded execution.

### Reasoning Act Gate

Think needs no gate. Before task Act, identify the open boundary, why action is necessary, and the smallest useful scope and stop condition.

Use **OBSERVE** when a few tightly related calls can answer one narrow, discriminating question more cheaply and clearly than a delegation round trip.

```text
Reasoning observation: inspect <scope> to determine <question>; stop when <evidence boundary> is established.
```

Use **ACT_BOUNDED** only when judgment and action are materially inseparable and expected delegation loss materially exceeds premium reasoning cost.

```text
Reasoning Act
Why judgment and action are inseparable:
Scope:
Authority:
Stop and reassess when:
```

An Act scope may cover one focused implementation, diagnostic episode, or difficult artifact section. It never covers the whole boundary, adjacent integration, broad verification, or cleanup.

Every OBSERVE or ACT_BOUNDED scope expires at its stop condition and returns reasoning to Think. Make the resulting conclusion visible before the next delegation or closure.

## Delegate While The Boundary Is Open

Delegate broad, mechanical, repetitive, or token-heavy execution that leaves standard no material judgment. Reasoning remains cognitive lead.

```text
Delegation
Boundary state: OPEN
Supported result or constraint:
Execution scope:
Evidence required:
Stop and return when:
```

Standard executes the contract without reinterpreting its governing judgment. When expected evidence is available, execution fails, evidence conflicts, or the scope ends, standard writes:

```text
Return to Reasoning
Boundary state: OPEN
Outcome or evidence pointer:
Return condition reached:
```

Standard then switches to reasoning. RETURN resumes the same open boundary. Reasoning reassesses the evidence and may Observe, Act boundedly, delegate again, close, or return to Workflow.

## Close And Hand Off The Boundary

When the governing judgment is supported, reasoning writes:

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

Reasoning then switches to standard. Standard owns the continuation through completion and verification.

If the named reopen condition later occurs, standard writes the `Reasoning Boundary` contract with `Boundary operation: REOPEN` and switches to reasoning. Otherwise, standard finishes the stated work.

## Preserve Continuity

A cognitive boundary may survive turns, compaction, resume, reload, and delegated execution. Its OBSERVE or ACT_BOUNDED scope does not; after interruption, reasoning reassesses before acting.

Shared visible context carries evidence. Transition contracts carry newly derived conclusions, boundary state, execution scope, and return or reopen conditions. Hidden reasoning is never the continuation mechanism.

Bursty switching is valid when each transition moves one meaningful judgment or execution unit. Tool-by-tool switching and returns without evidence are routing failures, not cost optimization.

## Compact Lifecycle Example

```text
Standard finds NEW judgment
-> Reasoning Boundary · NEW
-> reasoning keeps boundary OPEN
-> Delegation · OPEN
-> standard executes
-> Return to Reasoning · OPEN
-> reasoning supports judgment
-> Boundary Handoff · CLOSED
-> standard completes and verifies
-> later invalidating evidence, if any
-> Reasoning Boundary · REOPEN
```
