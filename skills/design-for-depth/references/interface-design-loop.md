# Interface Design Loop

Use this when structural pressure makes the current interface suspect. The goal is to choose an outcome-level module shape, not add detail to the first plausible design.

## 1. Frame The Outcome

State:

- caller and complete outcome;
- source-backed behavior and non-goals;
- decisions the caller genuinely owns;
- dependencies and current constraints;
- why the current seam is under pressure.

Do not begin from existing flags, storage paths, or lifecycle states. Those may be symptoms of the current shape.

## 2. Choose The Failure Unit

Name the atomic unit before designing retries or resume:

- operation;
- slice;
- comparison;
- session;
- published result;
- another outcome specific to the domain.

Define:

- terminal states;
- observers;
- state or evidence written;
- forbidden partial outcomes;
- safe restart unit;
- recovery proof;
- whether partial reuse is a requirement or only an optimization.

Retry, resume, caching, continuation, and partial reuse are separate capabilities. Durability does not automatically require them.

## 3. Inventory Caller Knowledge

List every fact a caller, test, reviewer, or future agent must know to use the module correctly:

```text
commands / methods
parameters and flags
ordering
states and transitions
paths and filenames
roles and ownership
retries and cleanup
configuration
errors and failure semantics
compatibility and migration
cost and performance expectations
recovery
```

For each fact ask:

- Does the caller own this decision?
- Could the module own it instead?
- Is it stable enough to expose?
- Would changing it force surrounding edits?
- Did a recent fix or review add this knowledge?

A growing list is direct evidence of a shallow interface.

## 4. Classify Maturity

Classify proposed capabilities:

- **Trust:** needed to know the outcome is valid.
- **Safety:** prevents damage, leakage, or runaway work.
- **Efficiency:** saves time, requests, or money.
- **Scale:** supports concurrency or volume.
- **Portability:** supports additional hosts, providers, or environments.

A bootstrap normally implements trust and minimum safety. Efficiency, scale, and portability need observed pressure and an approved milestone.

## 5. Design It Twice

Produce two or three materially different interfaces. Change seam placement or ownership, not only names.

Useful design constraints:

- **Outcome-first:** caller asks for one complete result; module owns sequencing.
- **Minimal contract:** expose the fewest stable decisions possible.
- **Common-case:** make the primary caller path trivial while preserving failure honesty.
- **Real variation:** design around two concrete adapters or environments when variation actually exists.

For each design show:

1. interface and usage;
2. caller-owned decisions;
3. hidden internal protocol;
4. failure unit and behavior;
5. dependency/adapters strategy;
6. evidence needed to trust it;
7. costs and limitations.

Do not force multiple designs when the change is local, reversible, and source-backed.

## 6. Compare

Compare designs by:

- depth: behavior gained per interface fact;
- locality: where future changes land;
- correct-use ergonomics;
- misuse and hidden-decision risk;
- failure behavior and recoverability;
- contract stability under Hyrum's Law;
- test surface quality;
- reversibility;
- maturity fit;
- implementation and evidence cost.

Prefer the design that removes concepts and coordination, not the one that centralizes the same choreography behind more terminology.

## 7. Learn Before Freezing

If evidence cannot distinguish the designs, define one bounded learning slice:

```text
Question:
Competing designs:
Prototype boundary:
Evidence to capture:
Time / cost boundary:
Discard-or-promote rule:
Backward checkpoint:
```

The experiment should answer the design question, not quietly implement the whole subsystem.

## 8. Route

End with one route:

- continue with the selected interface;
- ask an owner decision;
- revise spec;
- revise plan or later phases;
- run the learning slice;
- propose a bounded deepening refactor;
- defer with the pressure recorded;
- stop because no safe design fits the current scope.

Do not edit merely because one design is recommended. Recommendation is direction; execution still follows the owning workflow and approval boundaries.
