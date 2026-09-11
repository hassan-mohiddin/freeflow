# Execute Work Edges

Read this when execution resumes from uncertain prior state, changes the Slice boundary, reaches a selected checkpoint, or exposes separately controlled follow-on work.

The main skill owns the normal bounded-action loop. This reference covers transitions that leave, resume, or constrain that loop.

## Resume Safely

Recover the source that established the accepted work and compare it with relevant live state.

When durable memory exists, enter [Track Work](../../track-work/SKILL.md) and use its required recovery route before relying on or mutating the Working Record. Memory preserves context; it does not prove live state or recreate authority.

Resume the same Slice only while its intended result, authority, evidence boundary, and stop condition remain coherent. Otherwise preserve supported work and return the changed boundary to [Workflow](../../workflow/SKILL.md).

Recover the user-facing return condition separately from the next internal action. A supported record may preserve approval for the remaining task, but a proposed next action is not that approval. After reconstruction, continue covered work rather than returning solely because a context boundary occurred.

Do not restart discovery, repeat supported work, or infer progress from summaries, Plans, records, handoffs, staged files, or partial artifacts.

## Distinguish Adaptation From Boundary Change

Routine changes to local mechanics, implementation order, tools, and focused checks remain inside the current bounded action when they preserve:

- the accepted result;
- permitted effects;
- source truth;
- the required observing boundary;
- the stop condition.

A mechanical read of a known caller or a local correction may remain inside execution. If new evidence invalidates the implementation premise, stop dependent edits and re-establish the approach; do not hide renewed investigation inside a patch stream.

Before following a new prerequisite, identify whether it blocks the required outcome, the chosen approach, or only the current observer. Preserve acceptance, compare supported in-scope remedies, and return to Workflow when the remedy changes behavior, scope, persistence, compatibility, public interfaces, risk, evidence quality, or another user-owned outcome.

Keep an accepted extension in the current Slice only when its result remains coherent, explicit authority covers the added effects, and the combined boundary can still be verified as one unit. When a Working Record exists, Track Work records the extension before execution.

Use another Slice when the work has a distinct result, authority source, evidence boundary, independently useful outcome, or explicit abandonment of the original result. Context pressure may require an earlier safe continuation boundary without inventing a completed result or new Slice.

A whole-task agreement may already cover later Slices. Return their selection and lifecycle to Workflow and Track Work without requesting redundant user permission. A selected checkpoint or the agreed user-facing endpoint still stops dependent work.

## Route A Selected Checkpoint

A checkpoint is due only when Workflow, an approved Plan, repository policy, or explicit discussion selected it.

Stop before dependent work, use the checkpoint’s owner, and return its result to Workflow:

- [Decision Gate](../../decision-gate/SKILL.md) for a selected user decision;
- [Review Work](../../review-work/SKILL.md) for selected independent judgment;
- [Commit Work](../../commit-work/SKILL.md) for an authorized local commit;
- [Handoff](../../handoff/SKILL.md) for selected continuity transfer;
- [Finish Branch](../../finish-branch/SKILL.md), [Release Work](../../release-work/SKILL.md), or [Launch Work](../../launch-work/SKILL.md) for their separately authorized boundaries.

When durable memory exists, Track Work preserves the checkpoint’s selection, condition, result, and task effect.

Do not create a checkpoint merely because an action or Slice ended. Do not force a stale checkpoint when its condition, evidence, or protected boundary no longer holds; return the discrepancy for a supported cancellation, replacement, deferral, or revision before dependent work.

## Separate Follow-On Work

Useful follow-on work is not implied authority.

Return it to Workflow before using:

- Commit Work for an unselected commit or push;
- [Migration Work](../../migration-work/SKILL.md) for consumer, state, or traffic movement;
- Finish Branch for integration, preservation, discard, or branch cleanup;
- Release Work for versioned publication;
- Launch Work for production exposure, rollback, or recovery;
- Handoff for point-in-time continuation transfer.

Preserve the supported execution result before routing away. A follow-on owner does not retroactively change the completed action or Current Slice.
