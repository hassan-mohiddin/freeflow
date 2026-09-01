# Module And Dependency Design

Read this when module decomposition, cohesion, dependency direction, cycles, layering, policy-versus-infrastructure ownership, or change propagation materially affects the design.

Do not use this reference merely because the codebase has many files or dependencies.

## Decompose Around Coherent Decisions

A module should own one coherent outcome, policy, state boundary, or failure unit.

Do not split only by:

- processing step;
- technical file type;
- framework convention;
- arbitrary size;
- desire for more abstractions.

Ask:

- Which behavior changes together?
- Which decision has one reason to change?
- Which state and failure behavior belong together?
- What should callers stop coordinating?

## Prefer Cohesion Over Convenience

High cohesion means related behavior, invariants, state, and failure handling live together.

Pressure exists when:

- one module owns unrelated policies;
- one policy is spread across many modules;
- state transitions are separated from their invariants;
- failure handling is detached from the operation it protects;
- callers assemble the real behavior from helpers.

Do not centralize unrelated behavior merely to reduce duplication.

## Direct Dependencies Toward Stable Policy

Policy should not depend directly on volatile infrastructure details when those details can change independently.

Prefer:

```text
stable outcome or policy
-> small dependency interface
-> infrastructure adapter
```

Use dependency inversion only when it hides real variation, provider mechanics, migration, or testing control.

Do not add interfaces around every concrete implementation.

## Detect Dependency Cycles

A dependency cycle often indicates:

- responsibilities are divided incorrectly;
- shared policy has no owner;
- state is jointly owned;
- interfaces expose implementation details;
- modules must know each other’s lifecycle.

Do not break a cycle by moving imports or creating a neutral-looking utility while preserving the same conceptual cycle.

Name the shared decision and assign ownership.

## Preserve Honest Layering

A layer is useful when it hides a distinct level of decision.

A layer is shallow when it:

- forwards calls;
- renames types;
- exposes lower-layer errors and states;
- requires callers to understand both layers;
- exists only to satisfy a pattern.

Allow a higher-level module to request outcomes. Keep infrastructure details below the boundary.

## Use Ports And Adapters Proportionately

A port is an outcome or capability required by policy. An adapter supplies concrete infrastructure.

Use when:

- provider variation exists;
- migration is known;
- infrastructure details leak into policy;
- tests require safe dependency control.

Avoid when:

- one stable implementation exists;
- the wrapper hides no decision;
- the generic interface preserves provider quirks;
- caller complexity does not decrease.

## Keep Shared Code From Becoming Shared Ownership

A shared helper may centralize syntax while leaving policy ownership scattered.

Before extracting shared code, ask:

- Is this one concept that should evolve together?
- Who owns its behavior and failure contract?
- Are callers still making the same decision independently?
- Does extraction remove coordination or merely relocate code?

Some duplication is cheaper than a shared abstraction with unclear ownership.

## Test Through Module Contracts

Module tests should protect:

- coherent behavior;
- invariants;
- public failure semantics;
- dependency contracts;
- real seams.

Question module shape when tests must:

- construct many internals;
- reproduce dependency ordering;
- mock several owned collaborators;
- inspect states callers should not know.

Do not make production architecture imitate the test framework.

## Return

Return:

- affected modules and responsibilities;
- policy, state, or failure ownership;
- dependency direction;
- cycle or layering pressure;
- proposed boundary and caller contract;
- variation or migration justifying seams;
- evidence and unresolved decisions;
- narrowest supported route.

Stop when dependencies support the selected outcome without unnecessary coordination. Do not reorganize the entire codebase for conceptual purity.
