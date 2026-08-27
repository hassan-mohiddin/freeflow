---
name: simplify-code
description: Use when working code should become easier to understand or change without altering accepted behavior, including removing duplication, indirection, dead abstractions, or confusing control flow.
---

# Simplify Code

Reduce the concepts and coordination a reader must hold while preserving accepted behavior.

Fewer lines, files, functions, or abstractions are not automatically simpler. Prefer the shape that makes behavior, ownership, and failure paths easier to understand, test, and change.

Simplify Code applies one behavior-preserving transformation. It does not define behavior, authorize effects, redesign ownership silently, select or close a Slice, or turn nearby cleanup into accepted work.

A **simplification action** removes one named source of complexity and produces one assessable before-and-after result. It may contain several mechanical edits and focused checks.

## Enter With A Protected Boundary

Before editing, establish:

- the accepted behavior that must remain unchanged;
- the callers and failure semantics capable of detecting drift;
- the smallest reliable behavior baseline;
- the named complexity or coordination to remove;
- why the current structure exists, including compatibility, performance, platform, migration, and recovery constraints.

If behavior is unclear or should change, return to [Workflow](../workflow/SKILL.md).

If no reliable behavior check protects the accepted boundary, use [TDD](../tdd/SKILL.md) to establish characterization evidence before simplification. When failure or current behavior remains unexplained, use [Diagnose Failure](../diagnose-failure/SKILL.md).

When the intended result requires changing interfaces, ownership, public state, or failure behavior, return the structural pressure to Workflow with [Design for Depth](../design-for-depth/SKILL.md) as a lens. Do not disguise redesign as cleanup.

Before selecting or materially changing the transformation, read [Simplification Patterns](references/simplification-patterns.md).

Before changing code, read [Code Practices](../execute-work/references/code-practices.md).

## Choose One Simplification

Classify the named complexity:

- **Local expression:** confusing names, guards, branching, duplication, or temporary state.
- **Pass-through indirection:** a wrapper, helper, adapter, or layer hides no useful decision.
- **Accidental abstraction:** generalized machinery has no accepted variation or information-hiding value.
- **Scattered concept:** one behavior or policy can move toward one owner without changing its contract.
- **Dead path:** evidence shows code is unused, unreachable, superseded, or impossible under current invariants.
- **Structural pressure:** simplification requires changing interfaces, ownership, state, or architecture; return it rather than editing.

Select the smallest coherent transformation that removes the named complexity while leaving observable and failure behavior intact.

Do not invoke Simplify Code for immediate local cleanup already contained in one TDD behavior loop. Use it when complexity reduction is itself the accepted result.

## Simplify As One Coherent Action

For the selected transformation:

1. name the concepts, branches, indirection, or coordination being removed;
2. make the complete behavior-preserving change;
3. run the focused behavior and failure checks;
4. inspect the real caller path;
5. compare conceptual and coordination cost before and after;
6. keep or revert the action from evidence.

Several edits may belong to one transformation. Do not create a new action merely because the file, tool, or syntax changes.

Keep feature work, bug fixes, edge-case behavior, public contract changes, broad modernization, and unrelated cleanup outside the simplification boundary.

Preserve relevant:

- inputs and outputs;
- side effects and ordering;
- errors and recovery;
- timing and resource behavior;
- permissions and compatibility;
- failure units and externally visible state.

Follow repository conventions rather than personal style.

## Treat Tests As Evidence

Do not rewrite valid behavior tests merely to make simplification pass.

If an implementation-detail test fails while caller-visible behavior appears unchanged, classify the conflict before editing:

- the implementation detail may be an accepted contract;
- the test may be stale or over-coupled;
- the simplification may have changed relevant behavior;
- the observing boundary may be insufficient.

A green suite is necessary but not sufficient. Inspect the resulting code, real caller path, and relevant failure behavior.

Add characterization coverage only for behavior that must remain stable. Do not fossilize unnecessary machinery merely because it existed before simplification.

## Delete Deliberately

Before deletion, establish the code’s purpose and current consumers through source, runtime registration, configuration, generated callers, tests, history, and compatibility obligations as relevant.

Removing an unnecessary layer should reduce coordination, not scatter its protocol into callers.

Do not delete compatibility, fallback, platform, migration, audit, or recovery behavior because it appears redundant. Use [Migration Work](../migration-work/SKILL.md) when removal carries consumer, state, or compatibility obligations.

## Determine Whether It Became Simpler

Ask:

- Are there fewer concepts and branches?
- Is ownership clearer?
- Can the behavior be understood through fewer coordinated locations?
- Did failure semantics remain visible?
- Is the public interface smaller or unchanged?
- Did tests become more behavior-focused rather than more coupled?
- Would the next likely change require fewer coordinated edits?

If the answers are mostly no, complexity was relocated rather than reduced.

Stop when:

- unchanged behavior cannot be supported;
- public or failure semantics changed;
- performance or resource tradeoffs became material and unmeasured;
- each change exposes another interface, ownership, or edge-case problem;
- the action broadens beyond its accepted boundary;
- source truth or user decisions conflict with the transformation;
- the result is shorter but harder to explain or test.

## Return The Method Result

Once evidence supports unchanged behavior and the named complexity has been removed, stop the simplification route and return to the current owner.

Return:

- the protected behavior boundary;
- concepts or coordination removed;
- before-and-after behavior evidence;
- resulting caller and failure-path shape;
- comments preserved, changed, or removed;
- intentionally retained complexity;
- what remains unverified.

Do not freeze or close the Slice. Do not continue into further cleanup, modernization, or possible improvements without another accepted bounded action.
