# Handoff Templates

Read this after the transfer shape, recipient, and purpose are clear. Omit every field that does not change safe continuation.

Handoffs are memory, not authority. Live sources and repository state override stale handoff text.

## Ephemeral Handoff

Use in the current response, a host continuation mechanism, or a temporary file for immediate continuation.

```md
# Continuation Handoff

Generated: <optional reliable date or time>
Recipient / purpose:

## Goal And Owning Sources
- Agreed outcome and scope:
- User-facing return condition:

## Current State
- Workflow route:
- Working Record, Spec, or Plan pointers:
- Relevant source or artifact identity:

## Completed Work And Evidence
- Result:
- Evidence:
- Supports:
- Does not support:

## Decisions And Authority
- Decision:
- Established by:
- Scope:

## Deviations Or Invalidated Assumptions

## Worktree, Process, Or Environment Watchouts

## Review Continuity

## Open Decisions, Evidence, Or Blockers

## Next Action
- Accepted action:
- Authority source:
- Required dependencies and whether they hold:
- Sources needed for this action:

Or, when not approved:
- Recommended route:
- Approval or decision needed:

## Stop Conditions
```

Keep dirty-state details narrow. Include only paths, processes, environments, or artifacts whose omission risks loss, overwrite, duplicate work, or a false claim. In Current State, preserve the current assignment and source when older instructions could compete. In Completed Work And Evidence, distinguish the state actually checked from later changes whose verification remains unresolved.

## Repo-Memory Handoff

Use for durable project continuation in the repository's established location.

```md
# Project Handoff

Generated: <optional reliable date or time>
Recipient / purpose:

## Goal And Accepted Outcome
- Agreed scope and exclusions:
- User-facing return condition:

## Owning Sources

## Stable Context

## Current State And Evidence

## Working Record, Spec, And Plan Pointers

## Decisions, Authority, And Approval Scope

## Deviations, Invalidated Assumptions, Or Superseded Direction

## Review Continuity

## Open Decisions, Evidence Gaps, And Stop Conditions

## Next Accepted Action
- Action:
- Authority source:
- Required dependencies and whether they hold:
- Sources needed for this action:

Or:

## Recommended Next Route
- Route:
- Approval or decision needed:
```

Do not copy living progress from a Working Record or turn directional Plan content into committed work. Preserve only stable or transfer-critical context that belongs in the handoff.

## Learning-Slice Addendum

Include when an experiment, prototype, benchmark, or investigation changed the route:

```md
Question:
Competing hypotheses or designs:
Evidence captured:
Result: discard | revise | promote | inconclusive
Exploratory artifacts retained:
Affected Working Record, Spec, Plan, or later work:
Next accepted action and authority, or recommended route:
```

Promotion records a decision; it does not itself authorize production implementation.

## Review-Continuity Addendum

Include only when review state must survive the transfer:

```md
Review number: 1 | 2 | 3
Reviewed state identity:
Reviewer judgment: Pass | Non-blocking | Inconclusive | Blocking
Adjudicated judgment: Pass | Non-blocking | Inconclusive | Blocking
Material review items and evidence pointers:
Active-agent item adjudication:
- <item>: Accepted | Rejected | Open — <reason>
Accepted Blocking or Non-blocking Issues:
Material Open items:
Changed areas after review:
Follow-up review status and authority:
```

Do not copy full reviewer output when a stable pointer exists. A new context or reviewer continues the existing budget; local edits, renamed scope, or a different reviewer do not reset it.

## Resume Checklist

- After context loss or transfer into another context, read the complete Working Record through `view full` when one exists. A summary or `resume` projection is not a substitute. Use Track Work's bounded reads for intact-session continuation.
- Reconcile the record and handoff with current user direction and relevant live state; reopen named source truth where exact meaning or freshness matters.
- Confirm artifact, environment, commit, and configuration identity where claims depend on them.
- Check important completion and evidence claims before repeating them; distinguish that a run occurred from whether it applies to the current candidate. Reuse adequate evidence rather than rerun every check merely because a transfer occurred.
- Compare the execution agreement, current assignment and its source, return condition, decisions, dependencies, and review state with the next proposed action. Resolve superseded or conflicting directions before acting.
- Preserve valid and partial work; identify only the invalidated layer. Missing or incomplete recovery remains a reported limit.
- Return the supported route and authority state to Workflow before editing; do not require another user turn merely to continue an already-covered task.
- Use Decision Gate for user-owned choices or source conflicts.
