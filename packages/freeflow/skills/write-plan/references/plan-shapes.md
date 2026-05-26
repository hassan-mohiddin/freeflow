# Plan Shapes

Use this for strict-workflow, high-risk, durable, or delegated plans.

## Durable Plan Identity

When saving a plan that future agents or teammates will rely on, start with a compact header:

```md
> **Doc ID:** PLAN-001-billing-webhook-api
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready
> **Source:** docs/specs/billing-webhook-api.md
```

Rules:

- `Doc ID`: stable and readable. Prefer `PLAN-###-slug` when no repo convention exists.
- `Owner`: use the spec/product owner when known. In normal workflow, use `User` only when the requester is the only known owner.
- `Status`: use `Draft` when decisions/checks are still incomplete; use `Ready` when the plan is executable.
- `Source`: cite the approved spec, clarified context, issue, ADR, or docs used as authority.

In strict-workflow for security, billing, privacy, public API, migration, data-loss, or architecture work, stop and ask if owner/status/source would be guessed.

Do not add a changelog on first creation.

## Lightweight Plans

Use for low-risk context-backed work:

- goal
- source context
- files likely touched
- short slices
- checks

Mention that a spec is preferred when no approved spec exists, but do not add artifact pressure for tiny reversible work.

## Normal Plans

Use for spec-backed feature work:

- goal
- source context
- non-goals if the spec has them
- files likely touched
- vertical slices, each with tests/checks
- stop conditions
- final verification

Each slice should produce a reviewable state, not just a list of files to edit.

## Strict Or Delegated Plans

Use for high-risk work or work another agent will execute:

- durable plan identity
- goal and source authority
- explicit assumptions from source truth
- likely files/modules, with "find existing pattern first" when unknown
- vertical slices with expected red/green checks
- review checkpoints before risky behavior lands
- stop conditions for source-truth conflicts or owner-owned decisions
- final verification and handoff criteria

Call out sensitive boundaries directly: auth, public API shape, billing behavior, privacy/security, data loss, migrations, compatibility, and rollback.

Do not hide ambiguity as implementation detail. If endpoint shape, auth semantics, payload fields, billing behavior, or rollback expectations are missing, stop and ask before writing an executable plan.
