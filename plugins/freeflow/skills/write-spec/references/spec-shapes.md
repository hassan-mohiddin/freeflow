# Spec Shapes

Use this when the requested artifact type is unclear, the spec is strict-workflow or future-agent-facing, or a concise shape would prevent bloated requirements.

These are shapes, not templates. Include only sections that help the next reader act.

## Product Spec

- Problem.
- Intended outcome.
- Users or actors.
- In scope.
- Out of scope.
- Requirements.
- Acceptance criteria.
- Decisions made.
- Open questions.

Use for product behavior, user-facing flows, and scope boundaries.

## Technical Design

- Problem.
- Current evidence.
- Proposed design.
- Alternatives considered.
- System boundaries.
- Data or API changes.
- Migration or rollout notes.
- Risks and verification.

Use when architecture or implementation structure matters more than user-facing requirements.

## Public API Spec

- Endpoint, command, event, or interface name.
- Auth and permission model.
- Request shape.
- Response shape.
- Error behavior.
- Compatibility constraints.
- Security, privacy, billing, or data-loss implications.
- Acceptance criteria.

Stop and ask before writing when auth, payload, compatibility, or sensitive behavior would be guessed.

## Migration Spec

- Current state.
- Target state.
- Data or config affected.
- Compatibility and rollback expectations.
- Step order.
- Verification before, during, and after.
- Failure handling.
- Owner decisions still required.

Use for migrations, backfills, destructive changes, or hard-to-reverse operational work.

## Decision Note

- Decision.
- Rationale.
- Alternatives rejected.
- Consequences.
- Evidence or source context.
- Follow-up needed.

Use for settled product, scope, compatibility, or workflow decisions that are not ADR-worthy.
