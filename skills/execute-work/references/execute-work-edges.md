# Execute Work Edges

Read this after [Execute Work](../SKILL.md) when work spans multiple actions or slices, resumes from prior state, needs a specialized method, reaches a checkpoint, or reveals follow-on work. Execute Work owns the normal action-and-evidence loop; this reference covers continuation edges.

## Continue Or Return

Continue the current slice only when:

- the intended result remains coherent;
- the authority envelope covers the next action;
- the combined boundary can still be verified as one unit;
- evidence supports the execution basis;
- no checkpoint or stop condition is due.

A bounded action, verification run, self-review, review report, or owning-skill call does not create or close a slice by itself. Record an accepted boundary extension write-ahead when a Working Record exists.

Return to [Workflow](../../workflow/SKILL.md) before beginning:

- a distinct result or independently useful evidence boundary;
- uncovered active evidence, mutation or delivery, or follow-on work;
- a changed execution strategy, source requirement, or authority envelope;
- a separately controlled action;
- work whose cause or expected behavior is unresolved.

Preserve supported work when returning. Do not continue because implementation began or split a coherent result merely because its method changed.

## Select One Method

Use only the method the current action needs:

- [TDD](../../tdd/SKILL.md) for test-first behavior work.
- [Simplify Code](../../simplify-code/SKILL.md) for behavior-preserving simplification.
- [Design for Depth](../../design-for-depth/SKILL.md) when evidence shows design-bearing ownership, interface, state, failure-unit, or coordination pressure; use its deeper references only for that pressure.
- [Diagnose Failure](../../diagnose-failure/SKILL.md) when a cause is unsupported.

Do not stack methods because several descriptions match. Keep Execute Work as owner while a method supplies one bounded technique.

## Route Selected Checkpoints

When an approved checkpoint becomes due, stop before the next bounded action, use its owner, and return the result to Workflow. If its conditions no longer hold, return the deviation instead of forcing the checkpoint.

Separately controlled routes include:

- [Commit Work](../../commit-work/SKILL.md);
- [Migration Work](../../migration-work/SKILL.md);
- [Finish Branch](../../finish-branch/SKILL.md);
- [Release Work](../../release-work/SKILL.md);
- [Launch Work](../../launch-work/SKILL.md);
- [Handoff](../../handoff/SKILL.md).

A checkpoint result may support continuation, correction, another route, deferment, or stopping. It does not authorize the next lifecycle stage.

## Resume Or Return

When resuming, reopen the source that established the work and inspect live state. If a Working Record exists, request its bounded `resume` view through [Track Work](../../track-work/SKILL.md), then retrieve exact entities only when the next decision needs them.

Re-establish the authority envelope from the current conversation and still-valid approval. Do not reconstruct authority or progress from a summary, Plan, Handoff, record, or another conversation branch alone.
