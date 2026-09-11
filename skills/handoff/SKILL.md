---
name: handoff
description: "Use when work must continue safely after a pause, context change, or ownership transfer."
---

# Handoff

Preserve the point-in-time information another context needs to continue the agreed work without restarting discovery or changing its goal.

A [Working Record](../track-work/SKILL.md) maintains living task state. A handoff identifies that record, the relevant sources, and transfer-specific facts the recipient would otherwise miss. Neither is authority, proof of completion, or a replacement for current user direction and live evidence.

## Choose The Transfer Boundary

Identify the recipient, purpose, and available transfer mechanism before writing.

- **Ephemeral handoff:** use the response or host continuation mechanism for immediate transfer, including compaction. Use a temporary file only when the transfer needs it.
- **Repo-memory handoff:** use the repository's established destination when durable continuation documentation is requested or approved.
- **User-provided destination:** follow the requested safe location and format.

Do not turn an ephemeral transfer into repository memory. If the destination materially changes durability, privacy, repository state, audience, or authority and the user has not chosen it, ask one question and wait.

Read [Handoff Templates](references/handoff-templates.md) after the shape, recipient, and purpose are clear. Use only fields that change safe continuation; the template is not a requirement to create another document.

## Prepare From The Actual State

Inspect only the relevant worktree, artifacts, processes, and evidence needed to describe what the recipient will encounter. Reconcile an existing Working Record through Track Work when its understanding, current work, dependencies, evidence, or next action changed.

Preserve the execution agreement separately from the immediate assignment: what outcome remains authorized, what this unit covers, what is excluded, and when the user expects a return. Identify the assignment's source and any superseded instruction whose reuse would misdirect continuation. A recommendation to continue is not the same as approval to finish the remaining task.

Do not create a record merely because a handoff exists or change task/Slice state merely because context will be transferred. Use the host's safe boundary for ongoing operations; do not infer an unobserved result or interrupt a mutation to make a cleaner handoff.

Partial work is a valid transfer state. Preserve unverified edits, failing checks, unresolved causes, and residual effects honestly. Do not rush to completion because compaction is near.

## Capture The Next Useful Continuation

Include only material information:

- the intended outcome, agreed scope, user-facing return condition, and defining sources;
- current task/Slice and Workflow route when present;
- completed and partial work, supporting evidence, and what remains unverified;
- relevant repository, worktree, artifact, configuration, or process identity;
- accepted decisions and their sources, later amendments, and remaining hypotheses;
- changed assumptions, consequential rejected approaches, and affected Spec or Plan sections;
- dependencies for remaining work and which are established versus unresolved;
- the next accepted action and the minimum sources needed for it, or a recommendation awaiting authority;
- blockers, selected checkpoints, and conditions requiring return rather than continuation.

Point to the current Working Record and accepted artifacts instead of duplicating their full contents. A Plan preserves strategy; the record preserves actual work and deviations. The handoff preserves transfer-specific context, not a second mutable task narrative.

For learning, preserve the question, evidence and limits, the discard/revise/promote/inconclusive result, exploratory-artifact disposition, and consequence for dependent work. A recorded promotion does not grant production authority.

For selected independent review, preserve review number, reviewed state, reviewer and adjudicated judgments, material Accepted or Open findings, changed areas, and whether follow-up remains selected. A new context or reviewer does not reset the budget.

## Preserve Scope And Evidence

A newer summary is not necessarily a newer accepted decision. Distinguish source-backed changes from proposals; do not let "next" turn an optional follow-up into an obligation or carry a stronger claim than the evidence supports.

Include narrow dirty-state or process details when omission could cause loss, overwrite, duplicate execution, or false completion. Keep check outputs linked to the code/artifact and observer state they examined using available identities or source pointers. Distinguish an actual prior observation from whether it still applies after later changes. A missing output is unavailable evidence, not a reason to invent or automatically repeat the run. Do not copy full diffs, logs, transcripts, or reviewer reports when exact recoverable pointers suffice.

Exclude secrets, credentials, unrestricted personal data, and private payloads unnecessary for continuation. Do not promise access to unavailable sources or reconstruct their exact content from memory.

If safe transfer would require inventing intent, approval, evidence, status, or destination, state the missing information. Use [Decision Gate](../decision-gate/SKILL.md) when resolving it needs one user-owned choice.

## Reconstruct Before Resuming

Follow current core and capability recovery guidance before task action. A handoff's earlier route or profile description is not current runtime state.

1. Read the complete Working Record through `view full` when resuming after context loss or into another context. Do not substitute its `resume` view or the handoff's summary. With intact context, follow Track Work's bounded in-session read guidance.
2. Reconcile the record and handoff with current user direction, defining sources, and the relevant live environment. Follow supersession and corrections without silently reviving historical decisions.
3. Check important completion, verification, review, commit, and artifact-identity claims against their evidence before repeating them. Reuse adequate current evidence; a transfer alone does not require rerunning every check.
4. Establish the actual partial state, remaining dependencies, accepted work agreement, current assignment, and next useful action. Resolve contradictory old/new instructions from their sources before acting; do not resume editing when the current unit permits inspection only. Reopen only additional sources whose exact content or freshness changes that action.
5. Return the recovered state to [Workflow](../workflow/SKILL.md) for the supported route and authority check. Continue covered work through its owner; stop for a genuine blocker or uncovered choice.

Without a Working Record, use the available transfer and exact sources to reconstruct enough state; report any missing boundary rather than inventing it. If a required full-record read is incomplete or unavailable, follow Track Work's stop condition instead of claiming recovery succeeded.

Do not edit merely because a handoff names a next action. Do not restart the whole task or ask for another "continue" solely because an already-authorized task crossed a context boundary. Slice selection and lifecycle remain with Workflow and Track Work, not the handoff.

## Report And Stop

Report the transfer shape and destination, sources preserved, actual state and evidence limits, next accepted action or pending recommendation, and material missing or intentionally omitted sensitive information.

At the selected pause or transfer boundary, stop after delivering the handoff. It does not complete, block, abandon, or supersede the task or Slice. On recovery, end Handoff once the next owner can continue with coherent scope, authority, and evidence.
