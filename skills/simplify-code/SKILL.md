---
name: simplify-code
description: "Use when working code should become easier to understand or change without altering accepted behavior, including removing duplication, indirection, dead abstractions, or confusing control flow."
---

# Simplify Code

Remove one named source of complexity while preserving accepted behavior. Judge simplicity by the concepts and coordination a reader must hold—not line, file, or abstraction count alone.

This method supplies a behavior-preserving transformation under the current owner. It does not define behavior, authorize redesign, select or close a Slice, or turn nearby cleanup into accepted work.

## Establish What Must Stay True

Before editing, identify:

- the accepted behavior, relevant callers, and failure semantics;
- the reliable baseline capable of detecting change;
- the complexity or coordination to remove;
- why the current structure exists, including compatibility, platform, performance, migration, and recovery constraints.

If expected behavior is unclear or should change, return to [Workflow](../workflow/SKILL.md). If failure or current behavior is unexplained, use [Diagnose Failure](../diagnose-failure/SKILL.md). Do not characterize an invented expectation.

Use existing adequate checks. When protection is missing, establish the smallest useful observation of behavior before transforming it; read [Test Design](../verify-work/references/test-design.md) before designing or materially changing the check. Characterization protects required stable behavior, not every accidental implementation detail. It is evidence for a refactor, not a mandatory test-first implementation method.

Return changes to interfaces, ownership, public state, or failure behavior through Workflow with [Design for Depth](../design-for-depth/SKILL.md) as a lens. Do not disguise a material redesign as cleanup.

Read [Simplification Patterns](references/simplification-patterns.md) before selecting or materially changing the transformation. Read [Code Practices](../execute-work/references/code-practices.md) before changing code.

## Select One Coherent Transformation

Name the actual complexity:

- confusing expression, naming, branches, or temporary state;
- a pass-through wrapper that hides no useful decision;
- generalized machinery with no accepted variation;
- a scattered concept that can have one owner without changing its contract;
- an unused, superseded, unreachable, or impossible path;
- structural pressure requiring a separately selected boundary change.

Choose the smallest complete transformation that removes it. Keep related edits together even across files. Do not create another method activity for incidental local cleanup already contained in implementation; use Simplify Code when reducing complexity is itself the accepted result.

Fewer helpers are not better if their removal spreads lifecycle or error-handling knowledge into callers. Preserve useful information hiding and intentional constraints.

## Apply And Observe

Within the existing agreement:

1. State which concepts or coordination will disappear.
2. Make the complete behavior-preserving change.
3. Run focused behavior and failure checks.
4. Inspect the real caller path and resulting code.
5. Compare the required coordination before and after.
6. Keep the supported result or return a failed transformation for correction or covered rollback.

Preserve inputs/outputs, side effects and ordering, errors/recovery, relevant timing and resource behavior, permissions, compatibility, and externally visible state. Follow repository conventions rather than personal style.

Do not combine feature work, bug fixes, new edge-case behavior, public contract changes, broad modernization, or unrelated cleanup with the transformation.

## Interpret Checks Without Protecting Accidental Machinery

Use [Verify Work](../verify-work/SKILL.md) to determine what the observations establish. A green suite cannot prove unchanged behavior it did not exercise. Do not rewrite a valid behavioral assertion merely to make the refactor pass.

If an implementation-detail check fails while caller behavior appears unchanged, establish whether the detail is contractual, the check is stale or over-coupled, the transformation changed relevant behavior, or the observer is inadequate. Do not infer the answer from the desired cleanup.

Test sequencing alone is not assurance. Retain or add independent checks where needed, and inspect the changed behavior rather than report only test counts.

## Delete Only With Supported Absence

Before removing code, establish its purpose and current consumers through relevant source, runtime registration, configuration, generated callers, tests, history, and compatibility obligations. An empty local search does not establish the absence of external or dormant consumers.

Do not remove compatibility, fallback, platform, migration, audit, or recovery behavior merely because it looks redundant. Use [Migration Work](../migration-work/SKILL.md) when deletion carries consumer, state, or compatibility obligations.

Preserve historical evidence; do not delete it to make a reference search clean.

## Judge The Result And Stop

Ask whether there are fewer concepts to coordinate, clearer ownership, fewer related edit locations, visible failure semantics, a smaller or unchanged public interface, and tests focused on behavior rather than internal choreography.

If the result is shorter but harder to understand, test, or change, complexity was relocated rather than reduced.

Stop and return the changed boundary when unchanged behavior is unsupported, public/failure semantics changed, a material resource tradeoff is unmeasured, source truth conflicts, or each correction exposes another ownership or edge-case problem. Do not extend cleanup to preserve a failing approach.

When the named complexity is removed and the behavior boundary is supported, return to the current owner for applicable self-review and acceptance. Report the protected behavior, concepts removed, before/after evidence and limits, caller/failure-path shape, relevant comment changes, and intentionally retained complexity.

Do not close the Slice, begin further cleanup, or claim broader modernization from this result. Continue only through another covered action serving the agreed outcome.
