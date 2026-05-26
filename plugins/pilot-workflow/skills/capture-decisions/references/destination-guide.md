# Destination Guide

Use this when the durable-memory destination is not obvious.

## Destination Test

Before writing, answer:

- What settled decision is being recorded?
- Which existing artifact is already the source of truth for that kind of decision?
- Would this edit create a new documentation convention or source of truth?
- Would a future agent treat the target as authority for this decision?

If the owner is unclear, ask before writing.

## Common Destinations

| Decision type | Prefer | Do not use |
| --- | --- | --- |
| Domain term or glossary meaning | Existing `CONTEXT.md`, glossary, or domain doc; otherwise ask | README as a fallback glossary; creating `CONTEXT.md` without asking |
| Product behavior, scope, compatibility, billing, privacy, or policy | Existing product/spec/policy doc; otherwise ask where to capture | ADR unless the ADR test passes |
| Hard-to-reverse, surprising tradeoff chosen from alternatives | ADR | Product notes for architecture that needs rationale |
| Future build requirements | Existing or requested spec | Handoff or decision note as a hidden spec |
| Immediate continuation state, next steps, file inventory, commands, partial progress | Handoff or plan | Durable decision memory |
| Rejected approach | ADR if tradeoff-heavy; otherwise decision note or relevant spec section | Changelog or README by default |
| Workflow/process convention | Existing agent/process doc | New global standard without asking |

## Ambiguity Rules

- No destination convention means ask; it does not authorize `docs/decisions/`.
- A missing `CONTEXT.md`, glossary, ADR directory, spec directory, product doc, or decision-note folder is not a destination convention.
- The only existing doc is not automatically the right doc.
- `README.md` is a project overview unless the repo clearly treats it as the authoritative product/domain/process source.
- If `README.md` or another doc says there is no durable decision convention, do not edit it to create one implicitly.
- `CONTEXT.md` is for stable project language and domain meaning, not implementation summaries or task state.
- Handoffs preserve continuation memory. They are not authority for product, policy, or architecture.

Ask one focused question and recommend the narrowest durable destination supported by the repo. The final sentence should be the question, for example: `Should I create CONTEXT.md to record the RiskReview domain term and the automated retry scheduling scope boundary?`

## Decision Artifact Shape

For a new durable decision artifact, use the compact identity guidance in `../../write-spec/references/artifact-standards.md` when the artifact is team-facing, strict-workflow, or future-agent-facing.

Keep the note short:

```md
# Decision: ...

> **Doc ID:** DEC-001-short-slug
> **Date:** 2026-05-26
> **Owner:** User
> **Type:** Decision
> **Status:** Accepted
> **Source:** User-provided decision session

## Decision

## Rationale

## Consequences

## Not Captured
```

Do not add a changelog on first creation.
