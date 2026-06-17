# ADR 0004: Research Replaces Shallow Discovery Skills

## Status

Accepted.

## Decision

Freeflow uses one active `research` skill for discovery work before spec, plan, build, or durable memory.

The previous active skills `research-brief`, `grill-context`, and `capture-decisions` are deprecated and moved to root `deprecated/skills/`. They are no longer part of the runtime skill surface or direct command surface.

The active direct command is `/research`.

## Rationale

The three older skills were useful independently but shallow as a workflow module. In real use, research, brainstorming, targeted questions, and decision checkpointing need to interleave. Splitting them made the user or agent coordinate the sequence and made long grilling chains or uncaptured research decisions more likely.

The `research` skill uses the same module/interface/depth/seam/leverage/locality language as architecture review so discovery can shape deep modules from the beginning, not only rescue shallow code later.

## Consequences

- `/research-brief`, `/grill-context`, and `/capture-decisions` are removed from the current command surface.
- Historical evals and reports for the deprecated skills remain as development evidence.
- Current discovery eval evidence lives in `plugins/freeflow/evals/reports/by-skill/research-1-report.md`.
- Durable decisions now belong to the checkpoint destination chosen by `research`: spec, plan, handoff, decision note, ADR, domain memory, or chat.
