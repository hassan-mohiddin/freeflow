# Interface Design Loop

Read this before comparing materially different interfaces—or settling an important correctness boundary where ownership is consequential.

Use only facts and criteria that could distinguish the viable boundaries. Do not emit a full checklist unless the artifact itself requires one.

## 1. Frame The Outcome

State:

- caller and complete outcome;
- source-backed behavior and non-goals;
- decisions the caller genuinely owns;
- dependencies and current constraints;
- why the current seam requires attention.

Do not begin from existing flags, storage paths, or temporary states. They may be symptoms of the current design.

## 2. Define The Failure Unit

Name the coherent outcome treated as one success, failure, and recovery boundary.

Define material:

- terminal states and observers;
- state or evidence written;
- forbidden partial outcomes;
- safe restart and recovery;
- required proof;
- whether partial reuse is required or merely an optimization.

When authority, canonical persistence, integrity, or atomic visibility affects correctness, also define:

- trust anchor and who may replace it;
- canonical versus diagnostic state;
- authority or capability binding;
- commit and visibility point;
- replay scope;
- behavior after cancellation, integrity failure, or post-commit reconciliation failure.

Retry, resume, caching, continuation, and partial reuse are separate capabilities. Durability does not imply all of them.

## 3. Inventory Material Caller Knowledge

List only facts that callers must know and that could affect the boundary choice:

- operations and parameters;
- caller-owned decisions;
- ordering and lifecycle states;
- configuration and provider details;
- errors and failure semantics;
- compatibility and migration;
- recovery, cost, or performance expectations.

For each fact ask:

- Does the caller own it?
- Could the module own it?
- Is it stable enough to expose?
- Would changing it force surrounding edits?

The goal is not zero interface knowledge. It is the smallest honest contract.

## 4. Classify Capability Maturity

Separate:

- required trust and safety;
- accepted efficiency or scale requirements;
- demonstrated portability needs;
- speculative future flexibility.

Do not defer required correctness to obtain a simpler-looking interface. Do not promote hypothetical efficiency, scale, or portability into present architecture.

## 5. Produce Alternatives Only When Real

When materially different ownership choices remain viable, design two or three interfaces that change seam placement—not merely terminology.

For each show:

1. ordinary caller usage;
2. caller-owned decisions;
3. hidden internal protocol;
4. failure unit and observable behavior;
5. dependency and adapter strategy;
6. evidence needed;
7. material cost or limitation.

Do not manufacture alternatives for a local, reversible, source-backed choice.

## 6. Compare On Discriminating Criteria

Use only criteria that could change the recommendation:

- behavior per interface fact;
- locality of likely change;
- correct-use ergonomics;
- misuse and hidden-decision risk;
- failure honesty and recovery;
- contract stability;
- test surface;
- reversibility;
- maturity fit;
- implementation and evidence cost.

Prefer the design that removes concepts and coordination, not one that merely centralizes the same protocol behind additional terminology.

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

Return:

- structural evidence;
- selected boundary and hidden decision;
- caller-owned contract;
- failure unit and material failure behavior;
- rejected alternatives and the discriminating reason, when alternatives were real;
- unresolved owner decisions;
- assumptions and required evidence;
- the narrowest next route.

Stop once a boundary is supported or a bounded learning question is identified. Recommendation does not authorize implementation.
