# ADR 0005: Discuss And Track Work Replace Discover

## Status

Accepted.

## Decision

Freeflow separates collaboration from durable task memory:

- `discuss` owns open-ended exploration, option shaping, evidence-backed conversation, and direction revision;
- `track-work` owns the living Working Record, current slice, proposed work, task-local decisions, evidence pointers, and continuity across context loss.

`/discuss` is the canonical direct command. Pi preserves `/discover` as a compatibility alias to `/discuss`; Codex and Claude use canonical language. No separate `discover` model skill remains.

## Rationale

The earlier `discover` skill correctly combined evidence gathering, brainstorming, targeted questions, and checkpointing, but it still mixed two jobs with different lifecycles:

- collaboration can stay in conversation and end without durable state;
- ongoing task memory must survive slices, reviews, pauses, compaction, and session navigation.

Separating those owners reduces hidden state and lets each method remain small. Discuss can route to a Working Record only when continuity value exists. Track Work can require discussion without becoming the discussion method.

## Consequences

- `research-brief`, `grill-context`, and `capture-decisions` remain deprecated historical skills.
- ADR 0004 is superseded but retained as decision history.
- `/discover` remains Pi-only compatibility metadata and does not restore a deleted skill.
- Plans preserve stable ordered strategy; Working Records preserve evolving execution state.
- Plugin docs and routing maps use `discuss` and `track-work` as the canonical owners.
