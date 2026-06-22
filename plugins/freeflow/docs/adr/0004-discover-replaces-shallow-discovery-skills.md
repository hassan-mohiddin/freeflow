# ADR 0004: Discover Replaces Shallow Discovery Skills

## Status

Accepted.

## Decision

Freeflow uses one active `discover` skill for discovery work before spec, plan, build, or durable memory.

The previous active skills `research-brief`, `grill-context`, and `capture-decisions` are deprecated and moved to root `deprecated/skills/`. They are no longer part of the runtime skill surface or direct command surface.

The active direct command is `/discover`.

## Rationale

The three older skills were useful independently but shallow as a workflow module. In real use, evidence gathering, brainstorming, targeted questions, and decision checkpointing need to interleave. Splitting them made the user or agent coordinate the sequence and made long grilling chains or uncaptured decisions more likely.

The `discover` skill uses the `design-for-depth` lens when module/interface/seam/locality questions matter, so discovery can shape deep modules from the beginning, not only rescue shallow code later.

## Consequences

- `/research-brief`, `/grill-context`, and `/capture-decisions` are removed from the current command surface.
- Historical evals and reports for the deprecated skills remain as development evidence.
- Current discovery eval evidence lives in `plugins/freeflow/evals/reports/by-skill/discover-1-report.md`. Historical `research` eval reports remain development evidence only.
- Durable decisions now belong to the checkpoint destination chosen by `discover`: spec, plan, handoff, decision note, ADR, domain memory, or chat.
