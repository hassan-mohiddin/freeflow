# ADR 0007: Handoffs Are Memory, Not Authority

## Status

Accepted. Promoted from `.deprecated/project-docs/adr/0002-handoffs-are-memory-not-authority.md` during ADR consolidation.

## Decision

Handoffs are compact continuation memory for future sessions, not a source of truth or authority. Live repository evidence, accepted documentation, tests, specs, policies, current ADRs, and explicit user decisions override stale handoff text.

## Rationale

A handoff can be written under incomplete context or before later changes. Treating it as authority can preserve a superseded direction or silently widen the next action. Handoffs should preserve what a future reader needs to re-enter safely while requiring comparison with live state.

## Consequences

- Handoffs preserve continuity without authorizing implementation, release, or another controlled boundary.
- Workflow and Track Work compare recovered memory with the current conversation and repository before proceeding.
- Contradictory handoff content is evidence for reconciliation, not an instruction to overwrite live source truth.
