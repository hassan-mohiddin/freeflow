---
name: design-for-depth
description: "Use during coding and software design to keep boundaries, interfaces, ownership, state, dependencies, and failure behavior simple and proportionate."
---

# Design For Depth

Hide coherent, likely-changing decisions behind small, stable, outcome-level interfaces. Reduce the knowledge and coordination callers need without changing the accepted outcome.

A module is anything with an interface and implementation. Its interface includes every fact a caller needs for correct use: operations, decisions, inputs, state, ordering, effects, errors, dependencies, timing, and recovery. Depth is useful coherent behavior and hidden complexity per unit of caller knowledge—not fewer methods or more responsibilities.

Use this lens under the current activity. It is not a mandatory phase, architecture owner, permission to refactor, or reason to make a local task larger.

## Start With The Required Outcome

Understand enough material breadth to identify the caller's complete outcome, accepted constraints, current interface, dependencies, canonical state, and relevant success/failure boundary. Do not survey the entire system or settle future variations without a present question.

Ask:

1. What outcome is changing?
2. What must callers currently know or coordinate?
3. Does the change spread policy, state, dependency choices, or lifecycle knowledge?
4. Would the current boundary make correct use or the next likely change materially harder?

For a local, source-backed, reversible change that leaves these boundaries sound, apply the lens silently and continue. Do not load additional references, generate alternatives, or introduce an abstraction merely because another shape is imaginable.

A large mechanical change may need no design escalation. A one-line change may need it when it changes permissions, public behavior, canonical state, or consequential failure semantics.

## Intervene Where The Decision Can Still Change

Use the lens early when interface, ownership, state, or failure choices could harden into caller contracts. It can support discussion, a Spec or Plan, implementation preparation, or selecting a test seam.

Once a boundary is supported, do not reopen it merely because the skill remains in context. Re-enter when evidence shows growing caller coordination, scattered policy, exposed internal states, fragile test choreography, unclear dependency/failure ownership, or an invalidated design assumption.

Ordinary bugs, duplication, test awkwardness, finding count, and preference do not establish structural pressure. Use [Diagnose Failure](../diagnose-failure/SKILL.md) first when repeated or unexplained failures lack a supported cause. This lens consumes the structural finding rather than inventing one.

## Bound Success And Failure Proportionately

Before selecting classes, services, packages, flags, or states, name:

- the caller and complete accepted outcome;
- caller-owned decisions and observable success/failure;
- the likely-changing coordination the module could hide;
- the failure unit: what must be treated as one coherent success, failure, and recovery boundary.

Where effects or partial state are consequential, establish the material failure contract: observer, canonical/diagnostic state, forbidden outcomes, stop/degrade/fail/retry behavior, and supported recovery. Include cancellation, concurrency, or reconciliation only where required behavior or observed reachability makes them material.

Distinguish required correctness and safety from optional stronger guarantees. Do not remove required behavior to make the design smaller, or turn hypothetical lifecycle completeness into a production requirement. A module owning a failure unit does not automatically need durable replay, rollback, universal provenance, or every possible recovery mechanism.

Use [Decision Gate](../decision-gate/SKILL.md) when the proposed boundary changes product behavior, public interfaces, compatibility, permissions, security, privacy, billing, data-loss behavior, migration direction, or another user-owned outcome. Explain concrete consequences and supported alternatives, not only an architectural label.

## Hide Coordination Without Hiding Caller Choices

Prefer operations through which callers request an outcome and the module owns the internal protocol.

Before exposing a flag, path, state, ordering rule, retry, provider detail, or recovery step, ask whether the caller genuinely owns it, whether it makes correct use easier, and whether it is stable enough to become a supported contract.

Keep public:

- caller-owned outcomes and decisions;
- necessary inputs and stable invariants;
- observable success/failure;
- information required for correct recovery.

Keep internal unless callers genuinely control it:

- sequencing, storage layout, dependency construction, and provider mechanics;
- retries, cleanup, temporary states, caches, and optimization machinery;
- diagnostic implementation details.

A seam permits behavior, dependency, or observation changes without coordinated surrounding edits. An enabling point admits the adapter, clock, provider, or probe at that seam. Add one for demonstrated variation, a known migration, a required observer, or a dependency needing control—not imagined flexibility.

Do not centralize unrelated responsibilities merely to reduce interface count or scatter an old protocol into callers while claiming an abstraction was removed.

## Load Only The Depth The Question Needs

Read [Design Pressure Signals](references/design-pressure-signals.md) when observed coordination could change the route, unless an equivalent classification is already supported.

Read [Software Design Philosophy](references/software-design-philosophy.md) when structural pressure is supported but the likely-changing decision or missing information-hiding boundary cannot yet be named.

Read [Interface Design Loop](references/interface-design-loop.md) before comparing materially different interfaces, choosing consequential ownership, freezing an important correctness boundary, or choosing among real seam placements.

Read [State And Failure Boundaries](references/state-and-failure-boundaries.md) when correctness materially depends on canonical state, partial effects, atomic visibility, concurrency, cancellation, retries, idempotency, recovery, reconciliation, or failure evidence.

Read [Module And Dependency Design](references/module-and-dependency-design.md) for decomposition, cohesion, dependency direction, cycles, layering, shared ownership, policy versus infrastructure, or ports/adapters.

Read references one at a time while each distinct question remains. Do not convert their checklists into obligations unrelated to the accepted result.

## Learn Without Building The Future System

When existing evidence cannot distinguish viable boundaries, frame a bounded prototype or observation through the current owner: question, alternatives, adequate observer, permitted effects, evidence, return condition, and disposition.

The experiment must answer the design question. If its next prerequisite is actually future production infrastructure, reassess before building it. One failed extension or matching technique is not proof that every in-scope approach is impossible.

Return a supported boundary or an explicit limitation. Working exploratory code is evidence, not automatic production architecture. Promotion requires deliberate selection and authority, and a negative answer does not require another increasingly broad prototype.

## Check Through The Intended Interface

The intended interface should normally be the behavior and test surface. Question test machinery when callers or tests must bypass it, coordinate private lifecycle steps, replace many internals, or know dependency construction the module should own.

An internal test inspecting internals is not itself a design defect. The concern is callers requiring knowledge the module should hide, or a fixture manufacturing the behavior it claims to observe.

Architecture-bearing checks should protect accepted behavior, visible failures, required state invariants, forbidden partial outcomes, settled recovery, and real dependency or observation seams. Tests that protect accidental machinery do not justify keeping that machinery.

Test order is not a design criterion. Choose boundaries for the actual caller and supported variation, not to satisfy a formal implementation sequence.

## Return The Smallest Supported Change

Return to [Workflow](../workflow/SKILL.md) when ownership, scope, authority, or the route changes. Otherwise return to the current activity with the structural evidence, affected outcome, boundary, likely-changing decision, assumptions, and remaining evidence or user-owned choice.

Compare alternatives only when real. Recommend the simplest supported boundary that preserves required behavior; explain the principal cost and what would invalidate the recommendation.

Possible results include keeping the existing design, a local correction, diagnosis, an artifact revision, a bounded learning action, an accepted deepening, explicit deferral, or a stop for owner direction. Use [Simplify Code](../simplify-code/SKILL.md) when the selected result is behavior-preserving reduction.

Freeze a sufficiently supported boundary instead of pursuing architectural completeness. A recommendation is not implementation authority, and a new dependency must earn its place through the accepted outcome or demonstrated need.
