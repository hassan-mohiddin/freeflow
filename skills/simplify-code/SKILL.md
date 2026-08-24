---
name: simplify-code
description: Use when simplifying working code without changing behavior, including removing duplication, indirection, dead abstractions, or confusing control flow.
---

# Simplify Code

Reduce the concepts a reader must hold while preserving accepted behavior.

Fewer lines, files, functions, or abstractions are not automatically simpler. Prefer the shape that makes behavior, ownership, and failure paths easier to understand and change.

## Establish The Boundary

Before editing:

- understand the affected code, callers, tests, comments, and repository conventions;
- establish the smallest verification baseline that protects observable behavior and error semantics;
- understand why the current structure exists, including compatibility, performance, platform, history, and failure constraints;
- define one narrow simplification outcome.

Use this skill only when behavior should remain unchanged. If expected behavior is unclear or needs to change, return that evidence to [Workflow](../workflow/SKILL.md). If the interface or ownership is structurally wrong, use [Design for Depth](../design-for-depth/SKILL.md). If no reliable behavior loop exists, use [TDD](../tdd/SKILL.md) or [Diagnose Failure](../diagnose-failure/SKILL.md) first.

Before changing code, read [Code Practices](../execute-work/references/code-practices.md). Before choosing a transformation or deciding whether deletion really reduces complexity, read [Simplification Patterns](references/simplification-patterns.md).

## Classify The Opportunity

- **Local expression:** names, guards, control flow, duplication, or unnecessary temporary state.
- **Pass-through indirection:** wrapper, adapter, helper, or layer hides no useful decision.
- **Accidental abstraction:** generalized machinery has no accepted variation or decision-hiding value.
- **Scattered concept:** one behavior or policy can move toward one owner without changing its contract.
- **Dead path:** evidence shows code is unused, unreachable, superseded, or impossible under current invariants.
- **Structural pressure:** simplification requires changing interfaces, ownership, state, or architecture; return it to Workflow rather than presenting it as cleanup.

## Simplify In Bounded Steps

For each step:

1. name the complexity being removed;
2. make one behavior-preserving change;
3. run the focused behavior and failure checks;
4. inspect whether concepts, coordination, and change surface decreased;
5. keep or revert the step from evidence.

Keep feature work, bug fixes, edge-case handling, public behavior changes, and broad modernization outside the simplification slice. Report adjacent opportunities rather than absorbing them.

Follow project conventions rather than personal style. Preserve relevant inputs, outputs, side effects, ordering, errors, timing, permissions, compatibility, and resource behavior.

Preserve comments that explain non-obvious rationale, constraints, invariants, or workarounds. Update or remove comments that became stale. Do not add comments that merely narrate the simplified code.

## Treat Tests As Evidence

Do not rewrite valid behavior tests merely to make simplification pass.

If an implementation-detail test fails while observable behavior appears unchanged, classify the conflict before editing it. Add characterization coverage when important accepted behavior lacks protection. Use expected values independent from the implementation.

A green suite is necessary but not sufficient. Inspect the resulting code and real caller path.

## Delete Deliberately

Understand the purpose and current consumers before deleting code.

Removing a useful module should concentrate complexity behind a better interface, not scatter it into callers. Do not delete compatibility, fallback, platform, migration, audit, or recovery behavior because it appears redundant. Use [Migration Work](../migration-work/SKILL.md) when removal has consumer or compatibility obligations.

## Stop

Stop when:

- preserving behavior cannot be demonstrated;
- the simpler version changes public or failure semantics;
- performance or resource tradeoffs are material and unmeasured;
- each step exposes another interface, ownership, or edge-case problem;
- the diff broadens beyond the accepted boundary;
- source truth or user decisions conflict with deletion;
- the result is shorter but harder to explain or test.

Once evidence supports unchanged behavior and the accepted complexity has been removed, freeze the slice. Further cleanup, modernization, and possible improvements require another selected slice. Do not continue to satisfy a line-count target or reviewer taste.

## Report

Report the boundary simplified, concepts or coordination removed, behavior evidence run before and after, relevant comments preserved or changed, intentionally retained complexity, and remaining unverified behavior. A successful simplification reduces reader and change coordination, not merely diff size.
