# ADR 0002: Evals Before Enforcement Hooks

## Status

Accepted. Runtime delivery amended by [ADR 0006: Prompt Fragments And Discoverable Skills](0006-prompt-fragments-and-discoverable-skills.md); the evals-before-enforcement decision remains, amended 2026-10-13 to allow measured gates.

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

## Amendment (2026-10-13): measured gates

Evidence still comes before enforcement. An adapter may now refuse a tool call (a gate) when all of these hold:

1. Code can observe the violation at the call: the tool, its arguments, or session state Freeflow already holds.
2. Evidence shows the failure repeating while the guidance that asks for the behavior was in place: a baseline-against-guidance evaluation, or repeated live runs recorded in task evidence.
3. The refusal says what to do instead. The gate grants nothing: it never widens permissions or authority, and removing it restores the guidance-only behavior.
4. The gate is listed below with its evidence and what would retire it.

| Gate | Refuses | Evidence | Retire when |
| --- | --- | --- | --- |
| Cognitive Routing bootstrap read (`pi-extension/src/cognitive-routing/gate.ts`) | Under automatic control, a profile's commands and edits (`bash`, `bash_background`, `monitor`, `edit`, `write`, `apply_patch`) until its own view holds a complete read of the routing skill | Live Pi runs on Haiku 5.5: Coordinators skipped the always-loaded prompt's bootstrap read and ran commands themselves, and after a compaction neither profile re-read it; with the skill in view the Coordinator delegated as the skill says (Task 008 S-005; [Cognitive Routing](../subsystems/cognitive-routing.md), Decisions). Live runs, not yet a baseline-against-guidance evaluation. | An evaluation on the models in use shows the read happens without the gate. |

The first Consequence now reads: runtime adapters load context and grant no permissions or policy; they block a tool only through a gate listed here.
