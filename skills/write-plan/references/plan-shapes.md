# Plan Shapes

Choose the smallest plan that lets the next execution horizon proceed safely. Plans are revisable paths, not frozen predictions.

## Lightweight Plan

Use for clear, low-risk, bounded work:

```text
Goal:
Source context:
Slice(s):
Checks:
Stop conditions:
```

No artifact identity, phase taxonomy, or checkpoint ceremony is required when one short slice is sufficient.

## Rolling Plan

Use for consequential multi-phase work:

```text
Goal and source authority:
Scope / non-goals:

Phase 1 — current executable horizon
- Outcome
- Assumptions under test
- Learning and delivery slices
- Verification
- Backward checkpoint
- Likely review / commit / handoff checkpoint

Phase 2 — directional
- Intended outcome
- Dependencies
- Likely slices
- Questions to resolve from Phase 1 evidence

Later phases — provisional
- Outcomes and major constraints only

Dynamic plan-health triggers:
Final acceptance and residual risks:
```

Detail decreases with distance. Refine a later phase only when it becomes the next executable horizon.

## Slice Shape

```text
Slice outcome:
Source requirement / acceptance:
Type: learning | delivery | deepening
Likely module / interface / write set:
Behavior, experiment, test, or benchmark:
Failure contract when relevant:
Verification:
Dependencies:
Stop conditions:
```

A slice is a proof-bearing unit, not a file list. It should be independently understandable and leave a clear route.

## Learning Slice

```text
Question:
Competing hypotheses or designs:
Prototype / benchmark boundary:
Evidence to capture:
Time, request, or cost boundary:
Discard-or-promote rule:
Backward checkpoint:
```

A learning slice ends in evidence and a route decision. Production code is not its default output.

## Backward Checkpoint

```text
Assumptions under test:
Continue if:
Re-enter Discover/design if:
Revise spec if:
Revise plan or later phases if:
Owner decision if:
```

Use after architecture-bearing or uncertainty-reducing work. Do not require one after every mechanical slice.

## Durable Plan Identity

When future agents or teammates will rely on the saved plan, use a compact header:

```md
> **Doc ID:** PLAN-001-billing-webhook-api
> **Date:** 2026-07-11
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready
> **Source:** docs/specs/billing-webhook-api.md
```

Use `Draft` when the next horizon is not executable and `Ready` when it is. In strict-workflow, stop rather than guessing owner, source, or sensitive behavior.

## Separate-Agent Guidance

A work package should give an executing role:

- one slice outcome and source requirements;
- relevant interfaces and constraints;
- expected evidence and output;
- write boundary;
- stop/escalation conditions.

Do not prescribe harness-specific agents, models, worktrees, timeouts, or transport. The active harness owns those mechanics.

## Checkpoint Selection

- **Route check:** after every slice; normally internal and lightweight.
- **Review:** architecture, sensitive behavior, integration risk, or accumulated change.
- **Commit:** coherent verified rollback point when authorized.
- **Handoff:** context or continuity boundary.
- **Backward:** evidence invalidates assumptions, interface, scope, spec, or later plan.

Checkpoint forecasts may change during execution. That is adaptation, not plan failure, when the evidence and route are reported.
