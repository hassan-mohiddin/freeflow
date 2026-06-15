# ADR 0002: Evals Before Enforcement Hooks

## Status

Accepted.

## Decision

Freeflow v0.1 ships plugin-bundled context hooks that load existing workflow instructions. It still ships without enforcement hooks or CLI enforcement. Behavior must first be proven with baseline-vs-with-skill evals before mechanical enforcement is added.

## Rationale

Context-loading hooks address a measured lifecycle gap: skill context may not be present at session start. The setup skill handles the same-session setup case by reading runtime context after successful verification. Enforcement hooks can prevent expensive mistakes, but early enforcement machinery can hide weak skill wording and turn the package into brittle workflow infrastructure.

## Consequences

Native enforcement remains future work. Enforcement hooks should be added only when a repeated failure is concrete, deterministic, and not solved by concise skill wording.
