# Plan Shapes

Read this when choosing the structure, destination, identity, or revision shape of an ordered Plan. Use only the sections the Plan needs.

## Destination And Durable Identity

Follow repository convention when one exists.

When [Track Work](../../track-work/SKILL.md) owns the task, store a task-local Plan in the `plans/` location it defines unless the Plan should become a canonical repository artifact.

When no convention exists and future readers need durable identity, begin with a compact title and header:

```md
# Billing Webhook Implementation Plan

> **Doc ID:** PLAN-001-billing-webhook
> **Type:** Implementation Plan
> **Status:** Draft
> **Owner:** <plan owner>
> **Source:** <spec, issue, Working Record, diagnosis, or accepted context>
```

Use one current status. Follow the repository or owner's vocabulary; useful states may include `Draft`, `Reviewed`, `Ready`, `Superseded`, and `Abandoned`. Writing or reviewing a Plan does not by itself make it `Ready`.

Add dates, supersession links, or approvers only when useful and reliable.

## Start With Source And Boundaries

Make the execution boundary and its dependencies clear:

```text
Goal:
Source and linked artifacts:
Scope:
Non-goals:
Accepted decisions:
Assumptions:
Dependencies:
Required order:
```

Link accepted behavior, architecture, and decisions instead of copying their rationale. Do not hide unsettled design or owner choices as assumptions. If an assumption could choose among materially different strategies, resolve it before treating the Plan as executable.

## Choose The Execution Shape

### Lightweight Ordered Plan

Use when the work is clear and short enough that phases add no value:

```text
Ordered actions or slices:
Checks:
Selected checkpoints, if any:
Completion condition:
```

A tiny reversible action may not need a saved Plan.

### Phased Implementation Plan

Use when execution has meaningful dependencies, integration points, or several coherent outcomes:

```text
## Phase 1 — <outcome>
Purpose:
Dependencies:
Selected checkpoints, if any:
Completion condition:

### Slice 1.1 — <result>
Scope or boundary:
Work:
Checks:
Completion condition:

### Slice 1.2 — <result>
...

## Phase 2 — <outcome>
...
```

Describe the whole intended strategy with enough detail to inspect and execute it. If later phases cannot yet be planned honestly, use a Working Record instead.

## Define Phases And Slices

A phase groups slices that produce one meaningful integrated outcome. State its purpose, dependencies, and completion condition.

For each slice, use only the fields needed to execute and check it:

```text
Intended result:
Source requirement:
Scope or write boundary:
Work:
Dependencies:
Tests or observations:
Verification claim and required boundary:
Selected independent review, if any:
Selected local commit, if any:
Other user or continuity checkpoint, if any:
Completion condition:
```

A slice is a coherent result, not a file list. Mention files, modules, or systems only when they clarify scope.

Consider checkpoints at meaningful slice, phase, integration, risk, and continuity boundaries. Record only useful additions; normal verification and silent self-review need no repeated fields.

A selected local commit names its coherent outcome and conditions, not merely “commit after this slice.” Plan approval authorizes listed local commits subject to live evidence and Commit Work inspection, but not push, integration, migration, deprecation, release, or launch. Record actual results and commit identities in the Working Record.

## Adapt For The Work Type

### Remediation

After evidence or diagnosis establishes the cause, include the observed problem, source requirement, affected scope, ordered corrections, regression checks, recovery or cleanup, and completion condition. Do not plan from a requested patch or plausible cause alone.

### Migration Or Operations

For an accepted migration, release, rollout, or operational contract, include the source and target states, prerequisites, ordered execution or cohorts, checks before/during/after, stop or recovery conditions, observation, completion, and cleanup.

The Plan implements accepted compatibility, safety, and recovery requirements; it does not invent them.

## Finish With Integration And Invalidation

End with the complete-result checks and conditions that would stop the Plan:

```text
Integration:
Final tests or observations:
Verification claims and required boundaries:
Selected independent review, if any:
Selected local commit, if any:
Other user or continuity checkpoint, if any:
Completion condition:

Plan invalidation conditions:
```

Useful invalidation conditions include:

- a source requirement or accepted decision changes;
- a material dependency behaves differently;
- the design or architecture cannot satisfy the contract;
- checks cannot establish the required claims;
- implementation requires materially different scope or order;
- accepted review items expose a Plan-level defect.

These conditions stop or revise the affected Plan. They are not alternate branches. Do not use a narrow final check to imply broader completion.

## Revise Or Supersede

A local implementation detail, expected result, or completed slice does not revise the Plan.

For a founded material change, update only the affected strategy and dependencies, record why it changed, preserve prior rationale, and update linked artifacts only when their content changed.

Use a superseding Plan when editing in place would obscure what was originally reviewed. Route a materially revised or superseding Plan through artifact review again.
