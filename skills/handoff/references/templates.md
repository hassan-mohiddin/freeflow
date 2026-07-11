# Handoff Templates

Use these only after choosing temporary versus repo memory. Include only fields needed for the current continuation risk.

Handoffs are memory, not authority. Live repo evidence overrides stale handoff text.

## Temporary Handoff

Use for immediate continuation after pause, compaction, context pressure, or session change.

```md
# Temporary Handoff

Date: YYYY-MM-DD

## Goal And Accepted Outcome

## Current Route
- Phase / slice:
- Route: continue | review | verify | commit | diagnose | discover/design | revise spec/plan | decide | stop

## Completed And Verified

## Current Worktree / Process Watchouts

## Decisions And Source Authority

## Invalidated Assumptions

## Open Decisions Or Evidence

## Evidence To Reopen

## Next Executable Action

## Stop Conditions
```

Keep worktree details narrow: only paths or processes whose omission could cause loss, overwrite, duplicate work, or an unsafe claim.

## Repo Memory Handoff

Use for durable project continuation under the repo's established handoff location.

```md
# Project Handoff

Date: YYYY-MM-DD

## Purpose

## Stable Context

## Decisions And Source Authority

## Evidence And Current Status

## Current Executable Horizon

## Directional Later Work

## Invalidated, Superseded, Or Deferred

## Open Decisions And Evidence Gaps

## Next Route

## Stop Conditions
```

Do not freeze provisional later phases. Point to the owning spec, plan, decision, review, or verification artifact instead of copying it.

## Learning-Slice Addendum

Include when a prototype, benchmark, or experiment changed the route:

```md
Question:
Competing hypotheses or designs:
Evidence captured:
Discard-or-promote result:
Exploratory artifacts retained:
Affected spec / plan / later phases:
Next route:
```

## Review-Loop Addendum

Include when review history must survive a context change:

```md
Review pass: 1 | 2 | 3
Prior findings:
Parent adjudication: accepted | rejected | question | needs evidence
Owner clarifications:
Changed areas:
Residual risk:
```

A fresh reviewer continues this history; it does not restart at pass 1.

## Resume Checklist

- Reopen named source truth and live worktree state.
- Verify completion, review, commit, and test claims.
- Check whether assumptions, interfaces, scope, or later phases changed.
- Preserve valid evidence; route only invalidated work backward.
- Reconstruct the next slice contract before editing.
- Use the decision gate for user-owned or source-truth conflicts.