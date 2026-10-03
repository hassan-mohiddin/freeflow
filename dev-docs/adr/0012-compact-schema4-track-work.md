# ADR 0012: Compact Schema 4 Track Work

## Status

Accepted.

## Decision

Track Work uses a compact Schema 4 Markdown Working Record as the current projection of one task:

- the fixed sections are Current Context, Current Work, Future Work, History, and Notes;
- Current Context uses concise present-state bullets;
- one Current Slice carries active authority, scope, evidence, stop conditions, and material updates;
- History keeps Decisions, terminal Checkpoints, and settled Slices in that order;
- `resume` exposes active state and `full` exposes the complete canonical record;
- agents may edit ordinary Markdown content directly, while deterministic commands own identity, lifecycle transitions, movement, and safe persistence;
- lifecycle-created structured entities use compact field-list rows for visual density, while expanded Schema 4 records remain accepted for backward reads.

This is an intentional breaking change from the prior Schema 2/3 representations. Existing ignored records are not modified or automatically migrated. Later compatibility work must select records explicitly and preserve copy-first recovery evidence.

## Rationale

The prior runtime normalized too much task meaning into entity maps, command-specific schemas, public concurrency protocols, and multiple retrieval views. That increased caller coordination and made ordinary record maintenance harder than direct Markdown editing.

The compact projection preserves the state-before-action boundary: recover current state, reconcile it with selected provenance, accepted artifacts, live evidence, and current human intent, write the active Slice before execution, and require evidence before closure. It keeps only deterministic structural work behind the executable boundary.

## Consequences

- The next release may contain a breaking Track Work format change; migration and compatibility are separate work.
- The production package keeps one executable entrypoint with two views and lifecycle-focused commands; ordinary prose remains agent-maintained Markdown.
- Existing Schema 2/3 task records remain local historical state until a later per-record migration decision.
- Public documentation and test consumers must describe and exercise Schema 4 without claiming behavioral readiness that has not been evaluated.
