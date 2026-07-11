# Decision Records

Read this when deciding whether a tradeoff deserves a durable decision note or ADR.

Record a decision only when future work is likely to reopen it and the reason is not obvious from code, tests, policy, or the owning spec.

## ADR-Worthy Signals

A decision is usually worth recording when it is:

- hard or expensive to reverse;
- surprising relative to common or repo practice;
- a real tradeoff between materially different options;
- cross-cutting across modules, teams, or operational boundaries;
- likely to be challenged again without the original evidence;
- a deliberate rejection whose reason future reviewers must preserve.

Do not create an ADR for ordinary local choices, meeting summaries, temporary constraints, implementation progress, or decisions already owned clearly by another artifact.

## Compact Shape

```md
# Decision: [title]

Status: Proposed | Accepted | Rejected | Superseded
Date:
Owner:
Source:

## Context
[Problem, constraints, and evidence that made a decision necessary.]

## Decision
[What was decided and its scope.]

## Alternatives
[Only materially different options and why they were not chosen.]

## Consequences
[Benefits, costs, risks, compatibility, operations, and what could reopen it.]

## Supersession
[Prior or later decision links when relevant.]
```

Use the repo's convention when one exists. Keep volatile inventories and implementation status elsewhere.

## Authority

An accepted ADR can own a durable architecture or policy decision within its scope. It does not override a later explicit owner decision automatically, and a handoff or reviewer cannot supersede it.

When live evidence conflicts with an ADR, use the Decision Gate to choose whether the implementation is wrong, the ADR is outdated, or a new decision should supersede it.

Never edit an old accepted ADR to make history appear consistent. Mark it superseded and link the new decision when the repo follows immutable decision records.
