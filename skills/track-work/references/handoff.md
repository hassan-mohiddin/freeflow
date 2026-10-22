# Handoff

This reference is judgment, with the Rules below. A handoff preserves the point-in-time information another context needs to continue the agreed work without restarting discovery or changing its goal.

The Working Record keeps living task state. A handoff identifies that record, the relevant sources, and the transfer-specific facts the recipient would otherwise miss. Neither is authority, proof of completion, or a replacement for current user direction and live evidence. A recipient resumes through Track Work's [Recover After Context Loss](../SKILL.md#recover-after-context-loss): the handoff points to the record and never replaces it.

## Rules

- When the destination would change durability, privacy, repository state, audience, or authority and the user has not chosen it, ask one question and wait. Never turn an ephemeral transfer into repository memory.
- If safe transfer would require inventing intent, approval, evidence, status, or destination, state what is missing instead. Use [Discuss Work](../../discuss-work/SKILL.md) when resolving it needs a user-owned choice.
- Exclude secrets, credentials, unrestricted personal data, and private payloads the continuation does not need. Do not promise access to unavailable sources or reconstruct their exact content from memory.
- A handoff changes no task or Slice state: it does not complete, block, abandon, or supersede either. Do not create a record merely because a handoff exists.

## Choose The Transfer Boundary

Identify the recipient, purpose, and available transfer mechanism before writing.

- **Ephemeral handoff:** use the response or host continuation mechanism for immediate transfer, including compaction. Use a temporary file only when the transfer needs it.
- **Repo-memory handoff:** use the repository's established destination when durable continuation documentation is requested or approved.
- **User-provided destination:** follow the requested safe location and format.

## Prepare From The Actual State

When a Working Record exists, make it sufficient first ([Prepare For A Context Boundary](../SKILL.md#prepare-for-a-context-boundary)). Then inspect only the relevant worktree, artifacts, processes, and evidence needed to describe what the recipient will encounter.

Preserve the execution agreement separately from the immediate assignment: what outcome remains authorized, what this unit covers, what is excluded, and when the user expects a return. Identify the assignment's source and any superseded instruction whose reuse would misdirect continuation. A recommendation to continue is not approval to finish the remaining task.

Use the host's safe boundary for ongoing operations; do not infer an unobserved result or interrupt a mutation to make a cleaner handoff. Partial work is a valid transfer state: preserve unverified edits, failing checks, unresolved causes, and residual effects honestly.

## Capture The Next Useful Continuation

Include only material information:

- the intended outcome, agreed scope, user-facing return condition, and defining sources;
- current task/Slice and route when present;
- completed and partial work, supporting evidence, and what remains unverified;
- relevant repository, worktree, artifact, configuration, or process identity;
- accepted decisions and their sources, later amendments, and remaining hypotheses;
- changed assumptions, consequential rejected approaches, and affected Spec or Plan sections;
- dependencies for remaining work and which are established versus unresolved;
- the next accepted action and the minimum sources needed for it, or a recommendation awaiting authority;
- blockers, selected checkpoints, and conditions requiring return rather than continuation.

Point to the current Working Record and accepted artifacts instead of duplicating their contents. A Plan preserves strategy; the record preserves actual work and deviations; the handoff preserves transfer-specific context, not a second mutable task narrative.

A newer summary is not necessarily a newer accepted decision. Distinguish source-backed changes from proposals; do not let "next" turn an optional follow-up into an obligation or carry a stronger claim than the evidence supports.

Include narrow dirty-state or process details when omission could cause loss, overwrite, duplicate execution, or false completion. Keep check outputs linked to the code or artifact and observer state they examined. Distinguish an actual prior observation from whether it still applies after later changes. A missing output is unavailable evidence, not a reason to invent or automatically repeat the run. Do not copy full diffs, logs, transcripts, or reviewer reports when exact recoverable pointers suffice.

## Templates

Use only the fields that change safe continuation; a template is not a requirement to create another document.

### Ephemeral Handoff

For the current response, a host continuation mechanism, or a temporary file.

```md
# Continuation Handoff

Generated: <optional reliable date or time>
Recipient / purpose:

## Goal And Owning Sources
- Agreed outcome and scope:
- User-facing return condition:

## Current State
- Route:
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

In Current State, preserve the current assignment and its source when older instructions could compete. In Completed Work And Evidence, distinguish the state actually checked from later changes whose verification remains unresolved.

### Repo-Memory Handoff

For durable project continuation in the repository's established location.

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

Do not copy living progress from a Working Record or turn directional Plan content into committed work.

### Learning Addendum

Include when an experiment, prototype, benchmark, or investigation changed the route. A recorded promotion does not grant production authority.

```md
Question:
Competing hypotheses or designs:
Evidence captured:
Result: discard | revise | promote | inconclusive
Exploratory artifacts retained:
Affected Working Record, Spec, Plan, or later work:
Next accepted action and authority, or recommended route:
```

### Review-Continuity Addendum

Include only when selected independent review state must survive the transfer. A new context or reviewer continues the existing review budget; local edits, renamed scope, or a different reviewer do not reset it.

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

Do not copy full reviewer output when a stable pointer exists.

## Report And Stop

Report the transfer shape and destination, sources preserved, actual state and evidence limits, next accepted action or pending recommendation, and material missing or intentionally omitted sensitive information.

At the selected pause or transfer boundary, stop after delivering the handoff.
