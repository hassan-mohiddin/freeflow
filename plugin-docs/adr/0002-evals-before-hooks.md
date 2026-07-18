# ADR 0002: Evals Before Enforcement Hooks

## Status

Accepted. Amended for the Interaction Contract runtime.

## Decision

Freeflow ships context-loading runtime: Codex/Claude lifecycle hooks and a Pi extension that remain inert until shared repository activation is valid and any personal core layer is missing or valid.

When effective, adapters may deliver:

- the compact Interaction Contract;
- one Workflow bootstrap while Skills are effective;
- compact mode and capability state;
- effective optional capability context.

Freeflow still ships without enforcement hooks or CLI policy enforcement. Mechanical enforcement requires baseline-vs-with-skill evidence showing a repeated concrete failure that concise guidance and routing do not solve.

## Rationale

Context loading addresses a lifecycle delivery gap: interaction guidance, Workflow routing, and enabled capability context may otherwise be unavailable after start, resume, clear, or compaction.

Enforcement is different. Early blocking machinery can hide weak skill wording, create false safety, and turn the package into brittle workflow infrastructure before behavior is understood.

## Consequences

- Runtime adapters load context but do not block tools, grant permissions, or enforce policy.
- Setup handles the same-turn case through direct reads and reports those separately from automatic delivery.
- The Interaction Contract and Workflow bootstrap replace the deleted duplicate compact-guidance architecture.
- Enforcement remains future work until measured failure justifies it.
