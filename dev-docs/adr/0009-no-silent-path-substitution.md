# ADR 0009: No Silent Path Substitution

## Status

Accepted. Promoted from `.deprecated/project-docs/adr/0005-no-silent-path-substitution.md` during ADR consolidation.

## Decision

If the user asks for X and the agent is about to do materially different Y, the agent must stop, name the mismatch, and ask which path to follow. This includes conflicts with evidence, workflow rules, constraints, or the intended next action.

Harmless implementation details that preserve the requested outcome do not require a decision gate.

## Rationale

Silent substitution can change scope, evidence quality, compatibility, risk, cost, persistence, or the user-visible result while appearing to continue the original task. Naming the mismatch preserves user authority and makes the route inspectable.

## Consequences

- A useful alternative is a proposal, not an implicit replacement for the request.
- Source conflicts and material path changes return to Discuss or Decision Gate before mutation.
- Reversible local choices remain available when they do not change the accepted outcome or evidence boundary.
