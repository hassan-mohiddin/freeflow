# Decision Records

This reference is judgment; its binding statements restate [Write Docs](../SKILL.md) Rules. Header, status and source trail follow Write Docs' [Header, Status And Sources](../SKILL.md#header-status-and-sources).

## Choose The Right Record

Use the smallest record that preserves the decision where future work will look for it.

- **Working Record decision:** task-local choice that affects later slices or current task direction. [Track Work](../../track-work/SKILL.md) owns its `D-` ID, state, rationale, and supersession.
- **Decision note:** durable product, policy, scope, compatibility, or technical choice that needs a separate document but does not require the repository's ADR process.
- **ADR:** surprising, cross-cutting, or hard-to-reverse architecture or operational decision whose alternatives and consequences must remain durable.
- **Owning spec:** keep a decision inside a PRD, API contract, technical design, or other spec when that artifact clearly owns the decision and a separate record would only duplicate it.

Do not create a separate decision artifact merely because a decision occurred.

## When A Separate Decision Artifact Helps

A separate record is useful when the decision is:

- hard or expensive to reverse;
- surprising relative to repository or domain practice;
- a real tradeoff among materially different paths;
- cross-cutting across systems, teams, or operational boundaries;
- likely to be challenged again without its original rationale;
- intentionally rejected or superseded in a way future work must understand;
- explicitly requested as a durable decision artifact.

Ordinary reversible implementation choices, task progress, temporary constraints, assumptions, and unanswered questions do not belong in a durable decision record.

## Write The Decision Clearly

Use the repository's ADR or decision format when one exists. Otherwise adapt this shape:

```md
# Decision: <title>

> **Doc ID:** DECISION-<stable-id>
> **Type:** Decision | ADR
> **Status:** Draft | Accepted | Rejected | Superseded | Retired
> **Owner:** <decision owner>
> **Source:** <accepted context and evidence>

## Context
<Decision question, constraints, and evidence.>

## Decision
<Chosen path, exact scope, and why.>

## Alternatives
<Only materially different alternatives and why they were not chosen.>

## Consequences
<Benefits, costs, risks, compatibility, operations, and follow-up obligations.>

## Revisit Or Supersession
<Evidence, conditions, or later decision that would reopen or replace it.>
```

For a consequential choice, identify the presented option, its disclosed consequences, and the acceptance source.

## Preserve Authority And History

Name who made or owns the decision when that matters. A reviewer can challenge a decision but cannot silently replace it. A Working Record, Plan, or Handoff cannot supersede a durable decision merely by describing a different path.

When a decision changes:

- preserve the old record as `Superseded` rather than rewriting it to match the present, or as `Retired`, with the date and the reason, when nothing replaces it;
- create or identify the replacement decision, if there is one, and link both directions;
- identify owning specs, plans, or policies whose current content depends on it and revise them when authorized;
- mark dependent work contingent when a required decision or source revision remains unresolved;
- preserve the evidence that justified the change.

Live evidence may show that implementation violates a decision or that the decision is no longer viable. Use Discuss Work when resolving that conflict requires user authority.

## Avoid Duplication

Reference the decision from dependent artifacts instead of copying its full rationale. When a durable decision shapes how existing software works, the owning subsystem doc's Decisions section states its current effect and points to the record, and is kept current with the code like the rest of that doc. Keep task-local decisions in the Working Record unless they become durable beyond the task.
