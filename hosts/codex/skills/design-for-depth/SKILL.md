---
name: design-for-depth
description: "Use during coding and software design to keep boundaries, interfaces, ownership, state, dependencies, and failure behavior simple and proportionate."
---

# Design For Depth

Hide coherent, likely-changing decisions behind small, stable, outcome-level interfaces. Reduce the knowledge and coordination callers need without changing the accepted outcome.

A module is anything with an interface and an implementation. Its interface includes every fact a caller needs for correct use: operations, decisions, inputs, state, ordering, effects, errors, dependencies, timing, and recovery. A module is **deep** when it provides much useful, coherent behavior per unit of caller knowledge; depth is not fewer methods or more responsibilities.

Use this lens under the current activity. It is not a mandatory phase, an architecture owner, or permission to refactor.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- A design recommendation is not implementation authority, and this lens never enlarges a task by itself. A new dependency must earn its place through the accepted outcome or a demonstrated need.
- Never remove required correctness, trust, or safety to make a design smaller. Never turn hypothetical lifecycle completeness into a production requirement.
- Never design around an invented product or failure policy. When a boundary changes product behavior, public interfaces, compatibility, permissions, security, privacy, billing, data-loss behavior, migration direction, or another user-owned outcome, use [Decision Gate](../decision-gate/SKILL.md) with its concrete consequences and supported alternatives.
- Do not invent APIs, files, or stronger guarantees to make a design look complete; name the missing observation or choice instead.

## Start With The Required Outcome

Goal: know whether the change touches a boundary worth designing, before designing anything.

Understand enough breadth to identify the caller's complete outcome, accepted constraints, current interface, dependencies, canonical state, and relevant success and failure boundary. Do not survey the entire system or settle future variations without a present question.

Ask:

1. What outcome is changing?
2. What must callers currently know or coordinate?
3. Does the change spread policy, state, dependency choices, or lifecycle knowledge?
4. Would the current boundary make correct use or the next likely change materially harder?

For a local, source-backed, reversible change that leaves these boundaries sound, apply the lens silently and continue: load no references, generate no alternatives, add no abstraction because another shape is imaginable. A large mechanical change may need no design escalation; a one-line change may need it when it changes permissions, public behavior, canonical state, or consequential failure semantics.

## Intervene Where The Decision Can Still Change

Goal: settle consequential choices before they harden into caller contracts, and leave ordinary mechanics free.

Use the lens early when interface, ownership, state, or failure choices could harden. It can support discussion, a Spec or Plan, implementation preparation, or choosing a test seam.

Read [Implementation Decisions](references/implementation-decisions.md) when unresolved representation, identity, ownership, algorithm, dependency, or failure choices could materially change a technical recommendation or invalidate significant dependent work, before recommending a mechanism, writing its guiding design, or beginning substantial implementation.

Once a boundary is supported, do not reopen it because this skill remains in context. Re-enter when evidence shows growing caller coordination, scattered policy, exposed internal states, fragile test choreography, unclear dependency or failure ownership, or an invalidated design assumption. Ordinary bugs, duplication, test awkwardness, finding count, and preference do not establish structural pressure. Use [Diagnose Failure](../diagnose-failure/SKILL.md) first when repeated or unexplained failures lack a supported cause; this lens consumes a structural finding rather than inventing one.

## Bound Success And Failure Proportionately

Goal: the failure behavior that matters is owned, and nothing more is built.

Before choosing classes, services, packages, flags, or states, name:

- the caller and complete accepted outcome;
- caller-owned decisions and observable success and failure;
- the likely-changing coordination the module could hide;
- the **failure unit**: what must succeed, fail, and recover as one coherent boundary.

Where effects or partial state are consequential, establish the material failure contract: observer, canonical and diagnostic state, forbidden outcomes, stop/degrade/fail/retry behavior, and supported recovery. Include cancellation, concurrency, or reconciliation only where required behavior or observed reachability makes them material. Read [State And Failure Boundaries](references/state-and-failure-boundaries.md) when correctness depends on them.

Distinguish required correctness and safety from optional stronger guarantees. Efficiency, scale, and portability need an accepted requirement or observed pressure before they shape the design. A module owning a failure unit does not automatically need durable replay, rollback, universal provenance, or every recovery mechanism.

## Hide Coordination Without Hiding Caller Choices

Goal: callers request outcomes; the module owns the protocol.

Before exposing a flag, path, state, ordering rule, retry, provider detail, or recovery step, ask whether the caller genuinely owns it, whether it makes correct use easier, and whether it is stable enough to become a supported contract.

Keep public: caller-owned outcomes and decisions, necessary inputs and stable invariants, observable success and failure, and information required for correct recovery. Keep internal unless callers genuinely control it: sequencing, storage layout, dependency construction, provider mechanics, retries, cleanup, temporary states, caches, optimization machinery, and diagnostic details.

A **seam** lets behavior, a dependency, or an observer change without coordinated surrounding edits; the adapter, clock, provider, or probe that plugs into it is what varies. Add one for demonstrated variation, a known migration, a required observer, or a dependency needing control, not for imagined flexibility.

Do not centralize unrelated responsibilities to reduce interface count, or scatter an old protocol into callers while claiming an abstraction was removed.

## Load Only The Depth The Question Needs

Goal: read the one reference that answers the open question, and stop.

- [Design Pressure Signals](references/design-pressure-signals.md): observed coordination could change the route, or pressure is supported but the missing boundary cannot yet be named.
- [Interface Design Loop](references/interface-design-loop.md): comparing materially different interfaces, choosing consequential ownership, freezing an important correctness boundary, or choosing among real seam placements.
- [State And Failure Boundaries](references/state-and-failure-boundaries.md): correctness depends on canonical state, partial effects, atomic visibility, concurrency, cancellation, retries, idempotency, recovery, reconciliation, or failure evidence.
- [Module And Dependency Design](references/module-and-dependency-design.md): decomposition, cohesion, dependency direction, cycles, layering, shared ownership, policy versus infrastructure, or ports and adapters.

Read references one at a time while each distinct question remains. Do not convert their lists into obligations unrelated to the accepted result.

## Learn Without Building The Future System

Goal: when evidence cannot choose between boundaries, answer that question cheaply.

Frame a bounded prototype or observation through the current owner: question, alternatives, adequate observer, permitted effects, evidence, return condition, and disposition. The experiment must answer the design question; if its next prerequisite is future production infrastructure, reassess before building it. One failed extension or technique does not prove every in-scope approach impossible.

Return a supported boundary or an explicit limitation. Working exploratory code is evidence, not production architecture; promotion needs deliberate selection and authority, and a negative answer does not require another, broader prototype.

## Check Through The Intended Interface

Goal: tests protect the behavior callers rely on, not the machinery.

The intended interface should normally be the behavior and test surface. Question the design when callers or tests must bypass it, coordinate private lifecycle steps, replace many internals, or know dependency construction the module should own. An internal test inspecting internals is not itself a defect; the concern is callers needing hidden knowledge, or a fixture manufacturing the behavior it claims to observe.

Architecture-bearing checks protect accepted behavior, visible failures, required state invariants, forbidden partial outcomes, settled recovery, and real dependency or observation seams. Tests that protect accidental machinery do not justify keeping it. Test order is not a design criterion.

## Return The Smallest Supported Change

Return to [Workflow](../workflow/SKILL.md) when ownership, scope, authority, or the route changes. Otherwise return to the current activity with the structural evidence, affected outcome, boundary, likely-changing decision, assumptions, and remaining evidence or user-owned choice.

Compare alternatives only when real. Recommend the simplest supported boundary that preserves required behavior, with its principal cost and what would invalidate it. Results include keeping the existing design, a local correction, diagnosis, an artifact revision, a bounded learning action, an accepted deepening, explicit deferral, or a stop for owner direction. Use [Simplify Code](../simplify-code/SKILL.md) when the selected result is behavior-preserving reduction.

Freeze a sufficiently supported boundary instead of pursuing architectural completeness.
