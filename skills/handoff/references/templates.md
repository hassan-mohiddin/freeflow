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

Or, when not approved:
- Recommended route:
- Approval or decision needed:

## Stop Conditions
```

Keep dirty-state details narrow. Include only paths, processes, environments, or artifacts whose omission risks loss, overwrite, duplicate work, or a false claim.

## Repo-Memory Handoff

Use for durable project continuation in the repository's established location.

```md
# Project Handoff

Generated: <optional reliable date or time>
Recipient / purpose:

## Goal And Accepted Outcome

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

- Reopen named source truth, the Working Record when present, and live worktree state.
- Confirm artifact, environment, commit, and configuration identity where claims depend on them.
- Verify important completion and evidence claims before repeating them.
- Compare decisions, approval scope, review state, and the proposed route with live evidence.
- Preserve valid context and identify only the invalidated layer.
- Return the supported route and authority state to Workflow before editing.
- Use Decision Gate for user-owned choices or source conflicts.
