---
name: simplify-code
description: Use when working code should be made easier to understand, modify, test, or debug without changing accepted behavior; when removing accidental complexity, duplication, indirection, dead abstractions, or confusing control flow; or when review asks for behavior-preserving simplification.
---

# Simplify Code

> Status: Unverified candidate

Reduce the concepts a reader must hold while preserving accepted behavior exactly.

Fewer lines, files, functions, or abstractions are not automatically simpler. Prefer the version that makes behavior, ownership, and failure paths easier to understand and change.

## Route First

Use this only when behavior is intended to remain unchanged.

Before editing:

- read the affected code, callers, tests, docs, and repo conventions;
- establish the smallest verification baseline that protects observable behavior and error semantics;
- understand why the structure exists, including compatibility, performance, platform, history, and failure constraints;
- define a narrow simplification boundary.

If expected behavior is unclear, use `../decision-gate/SKILL.md` or Discover. If the interface or module ownership is wrong, use `../design-for-depth/SKILL.md`. If no reliable behavior loop exists, use `../tdd/SKILL.md` or `../diagnose-failure/SKILL.md` before refactoring.

## Classify The Opportunity

- **Local expression:** names, guard clauses, control flow, duplication, or unnecessary temporary state.
- **Pass-through indirection:** wrapper, adapter, helper, or layer adds no useful decision hiding.
- **Accidental abstraction:** generalized machinery has no accepted variation or useful decision-hiding value.
- **Scattered concept:** one behavior or policy is split across callers and can be localized without changing its contract.
- **Dead path:** evidence shows code is unreachable, unused, superseded, or impossible under current invariants.
- **Structural pressure:** simplification requires changing interfaces, ownership, state, or architecture; route to design-for-depth instead of presenting it as cleanup.

Read [simplification patterns](references/simplification-patterns.md) when choosing a transformation or deciding whether deletion really reduces complexity.

## Simplify In Bounded Steps

For each step:

1. name the complexity being removed;
2. make one behavior-preserving change;
3. run the focused behavior and failure checks;
4. inspect whether concepts, coordination, and diff surface actually decreased;
5. keep or revert the step based on evidence.

Keep feature work, bug fixes, public behavior changes, and broad modernization outside the simplification pass. Note adjacent opportunities rather than absorbing them.

Follow project conventions rather than importing stylistic preference. Preserve inputs, outputs, side effects, ordering, errors, timing obligations, permissions, compatibility, and resource behavior relevant to the contract.

## Tests And Source Truth

Existing tests are evidence, not permission to preserve accidental internals forever.

- Do not rewrite valid behavior tests merely to make the simplification pass.
- If an implementation-detail test fails while observable behavior remains unchanged, classify the test conflict before editing it.
- Add characterization or regression coverage when an important behavior lacks protection.
- Use independent expected values; do not copy the implementation into the test oracle.

A green suite is necessary but not sufficient. Inspect the resulting code and real caller path.

## Deletion Discipline

Apply Chesterton's Fence before deleting: understand the purpose and current consumers first.

Use the deletion test from `../design-for-depth/SKILL.md`: removing a useful module should concentrate complexity behind a better interface, not merely scatter it into callers.

Do not delete compatibility, fallback, platform, migration, audit, or recovery behavior because it appears redundant. Route through `../migration-work/SKILL.md` when consumers or removal obligations exist.

## Stop Conditions

Stop when:

- preserving behavior cannot be demonstrated;
- the “simpler” version changes public or failure semantics;
- performance or resource tradeoffs are material and unmeasured;
- each cleanup exposes another interface or ownership problem;
- the diff broadens beyond the accepted boundary;
- source truth or owner decisions conflict with deletion;
- the result is shorter but harder to explain or test.

Do not continue simplification to satisfy a line-count target or reviewer taste.

## Completion

Report:

- boundary simplified;
- concepts, branches, indirection, or duplication removed;
- behavior and failure evidence run before and after;
- tests or source conflicts adjudicated;
- intentionally preserved complexity and why;
- structural opportunities deferred to design or migration;
- remaining unverified behavior.

A successful simplification is a net reduction in reader and change coordination, not merely a smaller diff.