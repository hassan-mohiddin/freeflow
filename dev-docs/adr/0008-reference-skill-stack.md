# ADR 0008: Reference Skill Stack While Bootstrapping

## Status

Accepted. Promoted from `.deprecated/project-docs/adr/0004-reference-skill-stack.md` during ADR consolidation.

## Decision

Until Freeflow has sufficient behavioral evidence to guide its own development reliably, use:

- Matt Pocock skills as the primary style and behavior reference;
- Obra/Superpowers as the workflow lifecycle reference;
- Anthropic `skill-creator` as the skill-authoring and evaluation-methodology reference.

These references guide skill development but are not runtime dependencies and do not replace Freeflow’s accepted source truth, current skills, or user decisions.

## Rationale

An unfinished workflow plugin should not silently treat itself as the only authority for building or evaluating itself. A bounded reference stack provides outside comparison while preserving Freeflow’s own contracts and repository decisions.

## Consequences

- Reference-stack use applies when authoring or evaluating skills, not ordinary product work.
- Conflicts are resolved by current user direction, repository policy, accepted Freeflow docs/ADRs, and live source before external style preference.
- The reference stack does not grant readiness, authority, or permission to change the repository.
