---
name: design-for-depth
description: Use during coding and software design to keep boundaries, interfaces, ownership, state, and failure behavior simple and proportionate.
---

# Design For Depth

Reduce coordination by hiding coherent decisions behind small, stable, outcome-level interfaces.

A **module** is anything with an interface and implementation. A **caller** is anything that uses it. The **interface** is every fact callers must know to use it correctly: operations, inputs, decisions, states, ordering, errors, side effects, configuration, timing, and recovery. **Depth** is useful behavior and hidden complexity per unit of interface knowledge.

Use this as a compositional lens under the current owner. It is not a separate phase, authority source, or reason to refactor.

## Start Shallow

For any coding or design task, establish:

1. the complete outcome being changed and the decisions callers genuinely own;
2. what callers must currently know or coordinate;
3. whether the proposed change adds caller knowledge, spreads policy, or changes state or failure ownership.

When the change is local, source-backed, reversible, and leaves the interface and failure unit sound, apply this lens silently and continue. Do not load references, present alternative architectures, or widen the task merely because deeper design is possible.

A large mechanical change may need no design escalation. A small change may require it when permissions, public behavior, canonical state, or consequential failure changes.

## Establish The Outcome And Failure Unit

Before choosing classes, services, states, or adapters, name:

- the caller and complete outcome;
- caller-visible success and failure;
- the coordination or likely-changing policy the module could hide;
- the **failure unit**: the coherent outcome treated as one success, failure, and recovery boundary.

When the boundary has side effects, can leave partial state, or makes failure materially consequential, define its **failure contract**:

- who observes failure;
- state or evidence written;
- forbidden partial outcomes;
- whether to stop, fail closed or open, degrade, retry, or escalate;
- safe restart and recovery;
- evidence required to prove the outcome.

Failure behavior is part of the interface even when its mechanism remains private.

Depth is not breadth. A deep module owns one coherent decision or failure unit; it does not collect unrelated responsibilities merely to give callers fewer methods.

Use [Decision Gate](../decision-gate/SKILL.md) when the boundary changes product behavior, public interfaces, compatibility, permissions, security, privacy, billing, data-loss behavior, migration direction, or another user-owned outcome.

## Hide Coordination

Prefer interfaces where callers request an outcome and the module owns its internal protocol.

Before exposing a flag, path, state, ordering rule, retry, timing behavior, provider detail, or recovery step, ask:

- Does the caller genuinely own this choice?
- Does exposing it make correct use easier?
- Is it stable enough to become a contract?
- Could one outcome-level operation hide it?

Keep caller-owned outcomes, decisions, and stable observable failure semantics public. Keep internal sequencing, storage, cleanup, provider mechanics, retries, temporary states, and optimization private unless correct use requires caller control.

A **seam** is a boundary where behavior, dependencies, or observation can change without forcing surrounding edits. An **adapter** is a concrete implementation supplied at that seam. Add a seam for demonstrated variation, a known migration, or a required testing or observation boundary—not imagined flexibility.

## Escalate Only From Evidence

Structural pressure exists when evidence shows that:

- each correction adds caller knowledge, flags, states, retries, or recovery rules;
- one policy change requires unrelated edits across callers;
- callers or tests reproduce lifecycle choreography;
- correctness depends on coordinated steps or failure behavior no module owns;
- a bounded outcome requires an unplanned subsystem because no current seam owns it.

Use [Diagnose Failure](../diagnose-failure/SKILL.md) when a failure or repeated correction lacks a supported cause, or when a boundary choice depends on an unsupported causal assumption. Diagnosis owns the causal investigation; this lens consumes its supported structural evidence without re-establishing it.

When observed coordination could change what the current owner should do next, read [design pressure signals](references/design-pressure-signals.md). Skip this read only when an equivalent design-route classification is already supported.

A supported diagnosis establishes the causal basis. It does not by itself select the design route.

When structural pressure is supported but the likely-changing decision or missing information-hiding boundary cannot yet be named, read [software design philosophy](references/software-design-philosophy.md).

Ordinary bugs, failed tests, and finding count do not prove structural pressure.

Read the narrowest reference whose trigger matches the current question. Read another only if its distinct condition remains afterward.

## Shape A Consequential Boundary

Before comparing materially different interfaces—or settling an important correctness boundary where ownership is consequential—read [the interface design loop](references/interface-design-loop.md).

Do not manufacture alternatives for an obvious, local, reversible, source-backed choice. Compare designs only when seam placement, ownership, failure behavior, reversibility, or evidence cost could materially change the result.

When evidence cannot distinguish viable boundaries, define a bounded learning slice rather than quietly implementing the whole subsystem.

## Test Through The Intended Interface

The intended interface is the normal test surface. If callers' tests must bypass it, reproduce lifecycle choreography, or mock many internals to verify one outcome, question the module shape before adding test machinery.

Architecture-bearing tests should protect accepted behavior, observable failure, or a settled failure contract. Tests that protect only unnecessary machinery do not justify that machinery.

Exploratory code can produce design evidence. It does not become production architecture without deliberate selection through [Workflow](../workflow/SKILL.md), authorized implementation, and verification at the required boundary.

## Return The Narrowest Route

Return to Workflow with:

- the structural evidence;
- the affected outcome, interface, and failure unit;
- materially different options only when they are real;
- the recommendation and its assumptions;
- unresolved owner decisions;
- the narrowest route: continue, correct locally, diagnose, revise a Spec or Plan, run a learning slice, propose bounded deepening, defer, or stop.

A design recommendation does not authorize implementation. Freeze a supported boundary instead of pursuing architectural completeness.
