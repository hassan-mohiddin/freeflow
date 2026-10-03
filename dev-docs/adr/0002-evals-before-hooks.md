# ADR 0002: Evals Before Enforcement Hooks

## Status

Accepted. Runtime delivery amended by [ADR 0006: Prompt Fragments And Discoverable Skills](0006-prompt-fragments-and-discoverable-skills.md); the evals-before-enforcement decision remains.

## Decision

Freeflow ships context-loading runtime: Codex/Claude lifecycle hooks and a Pi extension that remain inert until shared repository activation is valid and any personal core layer is missing or valid.

When effective, adapters may deliver the applicable static prompt fragments, current Runtime State, and discoverable skills or tools from one effective-state snapshot. The Interaction Contract remains prompt-only. Workflow and capability bodies are discoverable methods, not one-time bootstrap messages. Codex and Claude lifecycle hooks exclude Pi-only capabilities from discovery, status, and injected context.

Freeflow still ships without enforcement hooks or CLI policy enforcement. Mechanical enforcement requires baseline-vs-with-skill evidence showing a repeated concrete failure that concise guidance and routing do not solve.

## Rationale

Context loading addresses a lifecycle delivery gap: interaction guidance and Workflow routing may otherwise be unavailable after start, resume, clear, or compaction. Pi's extension separately restores enabled Pi capability context.

Enforcement is different. Early blocking machinery can hide weak skill wording, create false safety, and turn the package into brittle workflow infrastructure before behavior is understood.

## Consequences

- Runtime adapters load context but do not block tools, grant permissions, or enforce policy.
- Setup handles the same-turn case through direct reads and reports those separately from automatic delivery.
- Static prompt fragments and discoverable skills replace the deleted duplicate compact-guidance architecture; no one-time Workflow or Cognitive Routing bootstrap is required.
- Enforcement remains future work until measured failure justifies it.
