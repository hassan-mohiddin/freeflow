# Execute Work Edges

Read this after [Execute Work](../SKILL.md) when work resumes from prior state, crosses a Slice boundary, reaches a selected checkpoint, or reveals separately controlled follow-on work. Execute Work owns the normal action, evidence, method, and continuation loop; this reference covers exceptional transitions.

## Resume Safely

Reopen the source that established the work and inspect live state. When durable task memory exists, request the bounded `resume` view through [Track Work](../../track-work/SKILL.md), then retrieve exact entities only when the next decision needs them.

Re-establish authority from the current conversation and still-valid approval. A summary, Plan, Handoff, Working Record, or another conversation branch preserves context but does not create current authority or prove progress.

Preserve supported work and resume the same Slice only while its intended result, authority, evidence boundary, and stop condition remain coherent. Otherwise return the changed boundary to [Workflow](../../workflow/SKILL.md).

## Cross A Slice Boundary Deliberately

Before beginning a distinct result, independently useful evidence boundary, uncovered effect, changed strategy, or separately controlled action:

1. stop the current action stream;
2. preserve the supported result and live evidence;
3. return the boundary change to Workflow;
4. reconcile the current Slice through Track Work when one exists;
5. begin another Slice only after its outcome and authority are established.

A verification run, self-review, review report, method change, or pause does not create or close a Slice by itself.

## Route A Selected Checkpoint

When an approved checkpoint becomes due, stop before dependent work, use its owner, and return the result to Workflow. If its condition no longer holds, return the deviation instead of forcing the checkpoint.

A checkpoint result may support continuation, correction, another route, deferment, or stopping. It does not authorize the next lifecycle stage. Track Work preserves selected and resolved checkpoint state when durable memory exists.

## Separate Follow-On Work

Use the owning method only after Workflow confirms its boundary and authority:

- [Commit Work](../../commit-work/SKILL.md) for an authorized local checkpoint or simple push;
- [Migration Work](../../migration-work/SKILL.md) for accepted consumer, state, or traffic movement;
- [Finish Branch](../../finish-branch/SKILL.md) for integration, preservation, discard, or cleanup;
- [Release Work](../../release-work/SKILL.md) for versioned publication;
- [Launch Work](../../launch-work/SKILL.md) for production exposure or recovery;
- [Handoff](../../handoff/SKILL.md) for point-in-time continuation transfer.

A useful follow-on result is not implicit authority. Return to Workflow when its scope, evidence, destination, or stop condition is not already covered.
