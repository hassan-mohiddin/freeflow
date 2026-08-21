---
name: handoff
description: Use when work must continue safely after a pause, context change, or ownership transfer.
---

# Handoff

Preserve the smallest point-in-time continuation package another context needs to orient safely.

A **handoff** transfers current context. A [Working Record](../track-work/SKILL.md) is living task memory. When a Working Record exists, reconcile changed task state through Track Work, reference it from the handoff, and add only transfer-specific context the recipient would otherwise miss.

A handoff is memory, not authority. It may record where approval or authority came from, but it does not create either, freeze a Plan, override live evidence, or prove completion.

## Choose The Transfer Shape

- **Ephemeral handoff:** use the current response, host continuation mechanism, or a temporary path for immediate transfer after a pause, compaction, session change, or short-lived ownership change. Do not create a file when the response or host mechanism is sufficient.
- **Repo-memory handoff:** use the repository's established handoff location when durable project continuation context is requested or approved.
- **User-provided destination:** follow the requested safe location and format.

Do not silently promote ephemeral context into repository memory. Ask one direct question when the destination changes durability, privacy, repository state, intended audience, or authority and the user has not chosen.

Read [Handoff Templates](references/handoff-templates.md) after the transfer shape and recipient are clear.

## Prepare From Live State

Before packaging the handoff:

1. Inspect the current worktree, active artifacts, and evidence needed for the transfer.
2. Reconcile an existing Working Record when its current state, slice, decisions, checkpoints, or next action changed.
3. Identify the recipient, purpose, and boundary being crossed.
4. Separate the next accepted action and its authority source from an unapproved recommendation.

Do not create a Working Record merely because a handoff exists. Do not change task lifecycle or slice state merely because continuation context is requested.

## Capture What Changes Continuation

Include only what the recipient needs to choose or perform the next sound action:

- goal, accepted outcome, and owning sources;
- current state and Workflow route, when one exists;
- completed work and what fresh evidence supports or does not support;
- relevant worktree, process, environment, or artifact identity needed to prevent loss or false claims;
- active decisions and the source that established them;
- invalidated assumptions, deviations, and affected Spec or Plan sections;
- unresolved owner decisions, missing evidence, blockers, and stop conditions;
- next accepted action with its authority source, or the recommended next route when not yet approved;
- exact pointers the recipient must reopen.

A Plan preserves stable strategy. Record live progress and deviations in the Working Record, then point to both rather than copying evolving state into the handoff.

For a learning slice, preserve the question, evidence, and discard, revise, or promote result. Exploratory output does not become production behavior through transfer.

For review continuity, preserve the review number, reviewed state identity, reviewer judgment, adjudicated judgment, active-agent item adjudication, material Accepted or Open items, changed state, and whether follow-up review remains selected. A new context or reviewer does not reset the review budget.

## Keep It Compact And Safe

Link to live sources instead of copying Specs, Plans, Working Records, diffs, logs, transcripts, or full reviewer output. Include a narrow dirty-state list only when omission risks loss, overwrite, duplicate work, or a false completion claim.

Do not include:

- unsupported completion, verification, review, commit, integration, release, or launch claims;
- volatile inventories or background that does not change continuation;
- secrets, credentials, tokens, unrestricted personal data, or unnecessary private payloads;
- instructions to trust the handoff without reinspection;
- unapproved work presented as the next executable action.

Stop when safe transfer would require inventing intent, authority, evidence, destination, or status. Use [Decision Gate](../decision-gate/SKILL.md) when the remaining choice belongs to the user.

## Boundary Examples

- A Working Record already contains current state → reference it and add only transfer-specific context.
- Compaction is immediate and the host can carry context → return an ephemeral handoff; do not create repository documentation.
- Durable repo continuation is approved → use the established handoff location and stable source pointers.
- The handoff conflicts with live code or evidence → live evidence wins; return the conflict to Workflow.

## Resume Safely

When resuming:

1. Reopen the named source truth, the Working Record's bounded `resume` view when present, and current worktree state.
2. Retrieve exact Working Record entities only when needed, then verify important completion, evidence, review, commit, and artifact-identity claims before repeating them.
3. Compare the recorded route, decisions, and assumptions with live evidence.
4. Preserve what still holds and identify only the invalidated layer.
5. Return the live state and supported next action to [Workflow](../workflow/SKILL.md).

Do not edit merely because the handoff names a next action. Workflow confirms the route and authority; Execute Work establishes any next slice.

## Report And Stop

State the transfer shape and destination, evidence and sources preserved, current route, next accepted action and authority or recommended route, and material gaps or intentionally omitted sensitive context.

At a selected pause or transfer boundary, stop after delivering the handoff. Creating continuity memory by itself does not complete, block, abandon, or supersede the active slice or task.
