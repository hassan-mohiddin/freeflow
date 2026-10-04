# Interface Design Loop

Read this before comparing materially different interfaces or settling an important correctness boundary where ownership is consequential.

This reference is judgment. Use only evidence and criteria capable of distinguishing viable boundaries; the numbered steps are an order of thinking, not output to emit.

## 1. Frame The Complete Outcome

Orient broadly enough to state:

- caller and complete outcome;
- source-backed behavior and non-goals;
- decisions the caller genuinely owns;
- dependencies and current constraints;
- material state and failure boundaries;
- why the current seam requires attention.

Do not begin from existing flags, storage paths, classes, or temporary states. They may be symptoms of the current design.

## 2. Define The Failure Unit

Name the failure unit as Design for Depth's Bound Success And Failure describes, including whether partial reuse is required or merely an optimization. When correctness depends on canonical state, partial effects, atomic visibility, concurrency, cancellation, retries, recovery, reconciliation, or final-outcome evidence, read [State And Failure Boundaries](state-and-failure-boundaries.md).

## 3. Inventory Material Caller Knowledge

List only facts callers must know and that could affect the boundary:

- operations and inputs;
- caller-owned decisions;
- ordering and lifecycle states;
- configuration and provider details;
- dependencies;
- errors and failure semantics;
- compatibility and migration;
- recovery, cost, and performance expectations.

For each fact ask:

- Does the caller own it?
- Could the module own it?
- Is it stable enough to expose?
- Would changing it force surrounding edits?

The goal is not zero interface knowledge. It is the smallest honest contract.

## 4. Classify What Each Mechanism Is For

Separate required trust and safety from efficiency, scale, and portability, as [Design Pressure Signals](design-pressure-signals.md) describes. Do not defer required correctness for a simpler-looking interface, or promote hypothetical efficiency, scale, or portability into present architecture.

## 5. Produce Alternatives Only When Real

When materially different ownership choices remain viable, design two or three interfaces that change seam placement—not only terminology.

For each show:

1. ordinary caller usage;
2. caller-owned decisions;
3. hidden internal protocol;
4. failure unit and observable behavior;
5. dependency and adapter strategy;
6. evidence needed;
7. material cost or limitation.

When module decomposition, cohesion, dependency direction, cycles, layering, policy-versus-infrastructure ownership, or change propagation materially affects the design, read [Module And Dependency Design](module-and-dependency-design.md).

Do not manufacture alternatives for a local, reversible, source-backed choice.

## 6. Compare On Discriminating Criteria

Use only criteria that could change the recommendation:

- behavior per interface fact;
- locality of likely change;
- cohesion and ownership clarity;
- correct-use ergonomics;
- misuse and hidden-decision risk;
- dependency direction;
- failure honesty and recovery;
- contract stability;
- test surface;
- reversibility;
- maturity fit;
- implementation and evidence cost.

Prefer the boundary that removes concepts and coordination, not one that centralizes the same protocol behind additional terminology.

## 7. Learn Before Freezing

When evidence cannot distinguish viable boundaries, define one bounded learning slice:

```text
Question:
Competing boundaries:
Smallest prototype or observation:
Evidence required:
Time or cost boundary:
Discard-or-promote rule:
Return condition:
```

The learning slice answers the design question. It does not quietly implement the whole subsystem.

## 8. Return The Supported Boundary

Return the selected boundary with its structural evidence, hidden decision, caller-owned contract, failure behavior, the discriminating reason when alternatives were real, unresolved user-owned decisions, and the narrowest next route. Stop once a boundary is supported or a bounded learning question is identified.
