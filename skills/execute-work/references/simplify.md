# Simplify

Read this when behavior-preserving cleanup, refactoring or deletion is the agreed result.

This reference is judgment: adapt it to the code in front of you. It supplies a behavior-preserving transformation under Execute Work; it does not define behavior, authorize redesign, or turn nearby cleanup into accepted work.

Remove one named source of complexity while preserving accepted behavior. Judge simplicity by the concepts and coordination a reader must hold, not by line, file, or abstraction count.

## Establish What Must Stay True

Before editing, identify:

- the accepted behavior, relevant callers, and failure semantics;
- a reliable baseline that would detect a change;
- the complexity or coordination to remove;
- why the current structure exists, including compatibility, platform, performance, migration, and recovery constraints.

If expected behavior is unclear or should change, settle it through [Agree Work](../../agree-work/SKILL.md); if current behavior or a failure is unexplained, [diagnose](diagnose.md) first. Do not characterize an invented expectation. When protection is missing, establish the smallest useful observation of behavior before transforming it ([Test Design](../../verify-work/references/test-design.md) when you design that check). Characterization protects required stable behavior, not every accidental implementation detail.

Take a change to interfaces, ownership, public state, or failure behavior to Agree Work, with [design](design.md) as the lens. Do not disguise a redesign as cleanup.

## Select One Coherent Transformation

Name the actual complexity: a confusing expression, name, branch or temporary state; a pass-through wrapper that hides no decision; generalized machinery with no accepted variation; a scattered concept that can have one owner without changing its contract; an unused, superseded, unreachable or impossible path; or structural pressure that needs a separately agreed boundary change.

Choose the smallest complete transformation that removes it, and keep related edits together even across files. Incidental local cleanup inside implementation needs no separate method; this one applies when reducing complexity is itself the agreed result. Fewer helpers are not better if their removal spreads lifecycle or error-handling knowledge into callers.

Candidate patterns, to compare against the named complexity rather than to apply because they exist:

- **Control flow:** guard clauses where exits are truly equivalent; one named path for duplicate branches; an explicit model or dispatcher when the same shape is branched on across callers; a named intermediate for a dense expression. Keep straightforward branching when a lookup table or hierarchy would add concepts.
- **Locality:** move behavior toward the state or policy it owns; gather scattered validation, normalization or failure handling behind one stable seam; separate orchestration from business rules when each then reads and tests on its own; reuse a canonical helper instead of a near-duplicate. Do not centralize unrelated behavior because its syntax looks alike.
- **Indirection:** question pass-through wrappers, one-use factories and strategy layers, aliases that no longer protect compatibility, helpers whose interface is as complex as their body, extension points with no accepted variation, and adapters that outlived a migration. Keep indirection that hides a volatile dependency, enforces policy, preserves a real compatibility contract, or creates real test and change locality.
- **Names and types:** rename generic or misleading terms to the domain's language; make an invariant explicit at a type or interface boundary when that removes downstream checks; remove casts, optionality and silent fallbacks only after proving the stronger invariant.
- **Duplication:** harmful when one behavior must change in several places and can drift. First confirm two snippets are the same concept that should evolve together; a little explicit repetition can be simpler than an abstraction with flags, callbacks or hidden coupling.

## Apply And Observe

Within the existing agreement:

1. State which concepts or coordination will disappear.
2. Make the complete behavior-preserving change.
3. Run focused behavior and failure checks.
4. Inspect the real caller path and the resulting code.
5. Compare the required coordination before and after.
6. Keep the supported result, or return a failed transformation for correction or covered rollback.

Preserve inputs and outputs, side effects and ordering, errors and recovery, relevant timing and resources, permissions, compatibility, and externally visible state. Follow repository conventions, not personal style. Do not combine feature work, bug fixes, new edge-case behavior, public contract changes, broad modernization, or unrelated cleanup with the transformation.

## Read Checks Without Protecting Accidental Machinery

Use [Verify Work](../../verify-work/SKILL.md) for what the observations establish; a green suite cannot prove unchanged behavior it did not exercise. When an implementation-detail check fails while caller behavior looks unchanged, establish whether the detail is contractual, the check is stale or over-coupled, the transformation changed behavior, or the observer is inadequate. Do not infer the answer from the cleanup you want, and do not rewrite a valid behavioral assertion to make the refactor pass. Retain or add independent checks where needed, and inspect the changed behavior rather than report only test counts.

## Delete Only With Supported Absence

Before removing code, establish its purpose and current consumers through source, runtime registration, configuration, generated callers, tests, history, and compatibility obligations. An empty local search does not establish the absence of external or dormant consumers.

Truly dead local code may go within the agreed boundary. Supported legacy behavior, and compatibility, fallback, platform, migration, audit or recovery behavior that only looks redundant, needs consumer evidence first; read [migration](migration.md) when removal carries consumer, state or compatibility obligations. Historical docs and evidence are not dead code; do not delete them to make a search clean. Commented-out code normally belongs in version history, unless it is an intentional operational instruction.

## Judge The Result And Stop

Ask whether there are fewer concepts and branches to coordinate, clearer ownership, fewer related edit locations, visible failure semantics, a smaller or unchanged public interface, and tests focused on behavior rather than internal choreography. If the result is shorter but harder to understand, test, or change, complexity was relocated rather than reduced.

Stop and return the changed boundary when unchanged behavior is unsupported, public or failure semantics changed, a resource trade-off is unmeasured, source truth conflicts, or each correction exposes another ownership or edge-case problem. Do not extend cleanup to rescue a failing approach.

When the named complexity is gone and the behavior boundary is supported, report the protected behavior, the concepts removed, before and after evidence and its limits, comment changes, and complexity deliberately kept. Begin no further cleanup and claim no broader modernization from this result.
