# ADR 0002: Evals Before Hooks

## Status

Accepted.

## Decision

Freeflow v0.1 ships without hooks or CLI enforcement. Behavior must first be proven with baseline-vs-with-skill evals.

## Rationale

Hooks can prevent expensive mistakes, but early hook machinery can hide weak skill wording and turn the package into brittle workflow infrastructure.

## Consequences

Native enforcement remains future work. Hooks should be added only when a repeated failure is concrete, deterministic, and not solved by concise skill wording.
