---
name: design-for-depth
description: Use during coding and software design to keep boundaries, interfaces, ownership, state, dependencies, and failure behavior simple and proportionate.
---

# Design For Depth

Reduce coordination by hiding coherent, likely-changing decisions behind small, stable, outcome-level interfaces.

A **module** is anything with an interface and implementation. A **caller** is anything that uses it. The **interface** is every fact callers must know to use it correctly: operations, inputs, decisions, states, ordering, errors, side effects, dependencies, configuration, timing, and recovery.

**Depth** is useful coherent behavior and hidden complexity per unit of caller knowledge.

Use this as a compositional lens under the active activity. It is not a mandatory phase, authority source, architecture owner, or reason to refactor.

## Orient Broadly, Deepen Narrowly

Use breadth of understanding before depth of intervention.

Before deepening a design, understand only the material breadth:

- complete caller outcome;
- caller-owned decisions;
- existing interface and dependencies;
- canonical state and visible transitions;
- success, failure, and recovery boundary;
- current constraints and accepted non-goals;
- evidence capable of changing the design route.

Then deepen only the decision, seam, state boundary, or failure unit whose ownership could materially change the result.

Do not broaden the task merely to complete the survey. Do not discuss every design topic, inspect every dependency, generate every alternative, or design the whole system.

## Start Shallow

For any coding or design task, ask:

1. What complete outcome is changing?
2. What must callers currently know or coordinate?
3. Does this change add caller knowledge, spread policy, alter dependency direction, or change state or failure ownership?
4. Would keeping the current boundary make correct use or the next likely change materially harder?

When the change is local, source-backed, reversible, and leaves the interface, dependencies, state, and failure unit sound:

- apply this lens silently;
- preserve accepted behavior;
- do not load references;
- do not present architectural alternatives;
- do not widen the task.

A large mechanical change may need no design escalation. A one-line change may require it when permissions, canonical state, public behavior, compatibility, or consequential failure changes.

An abstraction is not required merely because code is duplicated, tests are awkward, or another design is imaginable.

## Enter Early Or Re-enter From Evidence

Use this lens early when ownership, interface, state, dependency, or failure decisions could harden into caller contracts before implementation.

Early design may support:

- discussion;
- a Spec or Plan;
- an API or module boundary;
- a state transition;
- a consequential integration;
- test-seam selection.

During implementation, testing, and review, preserve a supported boundary without reopening it merely because this lens remains in context.

Re-enter later only when direct evidence shows:

- caller coordination growing;
- policy or state spreading;
- repeated patches adding flags or lifecycle knowledge;
- tests reproducing internal choreography;
- dependencies or failures crossing unclear ownership;
- prior boundary assumptions becoming false.

When repeated or unexplained failure lacks a supported cause, use [Diagnose Failure](../diagnose-failure/SKILL.md) first. Diagnosis owns causal investigation. This lens consumes supported structural evidence without recreating the diagnosis.

## Establish The Outcome And Failure Unit

Before choosing classes, services, packages, adapters, or states, name:

- caller and complete outcome;
- caller-visible success and failure;
- decisions the caller genuinely owns;
- coordination or likely-changing policy the module could hide;
- the **failure unit**: the coherent outcome treated as one success, failure, and recovery boundary.

When the boundary has side effects, can leave partial state, or makes failure materially consequential, establish its **failure contract**:

- who observes failure;
- canonical and diagnostic state written;
- forbidden partial outcomes;
- stop, fail-open, fail-closed, degrade, retry, or escalation behavior;
- cancellation and concurrency behavior when relevant;
- safe restart, recovery, and reconciliation;
- evidence required to prove the outcome.

Failure behavior is part of the interface even when its mechanism remains private.

Depth is not breadth. A deep module owns one coherent decision or failure unit. It does not collect unrelated responsibilities merely to reduce method count.

Use [Decision Gate](../decision-gate/SKILL.md) when the boundary changes product behavior, public interfaces, compatibility, permissions, security, privacy, billing, data-loss behavior, migration direction, or another user-owned outcome.

## Hide Coordination And Likely-Changing Decisions

Prefer interfaces where callers request an outcome and the module owns its internal protocol.

Before exposing a flag, path, state, ordering rule, retry, provider detail, timing behavior, dependency choice, or recovery step, ask:

- Does the caller genuinely own this choice?
- Does exposing it make correct use easier?
- Is it stable enough to become a supported contract?
- Which surrounding edits would occur if it changed?
- Could one outcome-level operation hide it?

Keep public:

- caller-owned outcomes and decisions;
- stable invariants;
- necessary inputs;
- observable success and failure semantics;
- information required for correct recovery.

Keep private unless callers genuinely control them:

- sequencing;
- storage layout;
- provider mechanics;
- retries and cleanup;
- temporary states;
- cache and optimization machinery;
- diagnostic implementation;
- dependency construction.

A **seam** is a boundary where behavior, dependencies, or observation can change without forcing surrounding edits. An **enabling point** is where an adapter, test implementation, clock, probe, provider, or migration path enters that seam.

Add a seam for demonstrated variation, a known migration, a required observation boundary, or a dependency that must be controlled in tests—not imagined flexibility.

## Recognize Structural Pressure

Structural pressure is evidence that the current boundary is increasing coordination or hiding no useful decision.

Pressure may appear as:

- change amplification across unrelated callers;
- caller lifecycle choreography;
- scattered policy;
- unowned canonical state or failure behavior;
- growing flags, temporary states, retries, or recovery rules;
- tests coupled to machinery rather than accepted behavior;
- infrastructure details leaking into policy;
- edge-case patches revealing one shared contract gap;
- a bounded result unexpectedly requiring a subsystem.

Ordinary bugs, failed tests, duplicate code, broad mechanical edits, finding count, and personal design preference do not prove structural pressure.

When observed coordination could change the next route, read [Design Pressure Signals](references/design-pressure-signals.md). Skip it only when an equivalent route classification is already supported.

When structural pressure is supported but the likely-changing decision or missing information-hiding boundary cannot yet be named, read [Software Design Philosophy](references/software-design-philosophy.md).

Read the narrowest reference whose condition matches the current question. Read another only if its distinct question remains afterward.

## Choose The Required Design Depth

Read [Interface Design Loop](references/interface-design-loop.md) before:

- comparing materially different interfaces;
- selecting consequential ownership;
- freezing an important correctness boundary;
- choosing among real seam placements.

Read [State And Failure Boundaries](references/state-and-failure-boundaries.md) when correctness materially depends on:

- canonical state;
- partial effects;
- atomic visibility;
- concurrency or cancellation;
- idempotency and retries;
- recovery or reconciliation;
- failure evidence.

Read [Module And Dependency Design](references/module-and-dependency-design.md) when the question materially concerns:

- module decomposition;
- cohesion and conceptual integrity;
- dependency direction;
- cycles or layering;
- policy versus infrastructure;
- shared ownership;
- ports and adapters.

Several references may apply to one consequential boundary. Read them one at a time and only while each distinct condition remains.

## Test Through The Intended Interface

The intended interface is the normal behavior and test surface.

Question the design before adding test machinery when callers or tests must:

- bypass the intended interface;
- reproduce lifecycle choreography;
- mock many internals to verify one outcome;
- depend on private temporary states;
- know dependency construction callers should not own.

Do not redesign merely because an internal test observes internals. The problem is external callers requiring knowledge the module should hide.

Architecture-bearing tests should protect:

- accepted behavior;
- visible failure;
- state invariants;
- forbidden partial outcomes;
- settled recovery behavior;
- a real dependency or observation seam.

Tests that protect only accidental machinery do not justify that machinery.

Exploratory code can produce design evidence. It does not become production architecture without deliberate selection, authorized implementation, and verification at the required boundary.

## Return The Narrowest Supported Route

Return a changed ownership, scope, authority, or route boundary through [Workflow](../workflow/SKILL.md). Otherwise return to the active activity with:

- structural evidence;
- affected caller outcome;
- interface, module, dependency, state, and failure unit involved;
- likely-changing or currently unowned decision;
- materially different alternatives only when real;
- recommendation and assumptions;
- unresolved user-owned decisions;
- evidence still required;
- narrowest route.

Possible routes include:

- continue with the current boundary;
- make a local correction;
- diagnose an unsupported cause;
- revise a Spec or Plan;
- use [Simplify Code](../simplify-code/SKILL.md) for behavior-preserving reduction;
- run a bounded learning slice;
- propose bounded deepening;
- defer supported design pressure;
- stop for owner direction.

A design recommendation does not authorize implementation.

Freeze a supported boundary instead of pursuing architectural completeness. Retain the decision, not perpetual design activity.
