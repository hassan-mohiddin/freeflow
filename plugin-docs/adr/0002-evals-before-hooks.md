# ADR 0002: Evals Before Enforcement Hooks

## Status

Accepted.

## Decision

Freeflow ships plugin-bundled context-loading runtime: Codex/Claude hooks and a Pi extension that stay inert until repo config exists, parses, and matches the supported setup config shape, then load the canonical compact kernel and independently enabled capability context. It still ships without enforcement hooks or CLI enforcement. Behavior must first be proven with baseline-vs-with-skill evals before mechanical enforcement is added.

## Rationale

Context-loading runtime addresses a measured lifecycle gap: the compact workflow and decision contract plus enabled capability context may not be present at session start. The setup skill handles the same-session setup case by reading the canonical kernel plus any capability skill effective after setup following successful verification. Enforcement hooks can prevent expensive mistakes, but early enforcement machinery can hide weak skill wording and turn the package into brittle workflow infrastructure.

## Consequences

Native enforcement remains future work. Enforcement hooks should be added only when a repeated failure is concrete, deterministic, and not solved by concise skill wording.
