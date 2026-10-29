# Working Record: Full record

Schema: 4
State: active
Last updated: 2026-10-20T10:00:00.000Z

## Current Context

### Goal

- Every shape a Schema 4 record can hold, for migrate.

### Work agreement

- Done when the parser ships. You: "go" (2026-10-18)
- Without asking: the parser and its tests.
  The fixtures too.

### What defines this task

- specs/parser.md — the accepted design.

### Settled

- The parser reads Markdown.
A line written without a bullet.

### Tentative

- A streaming parser may be faster.

### Open

- Whether errors stop the parse.

### Current direction

- Finish the parser, then its CLI.

### Boundaries

- No network.

## Current Work

### Current Slice

#### S-004 — Parse tables
- State: in_progress
- Intended result: Tables parse.
- Authority source: The work agreement.
- Scope: src/tables.mjs.
- Expected evidence: The table tests pass.
- Stop condition: A table shape the spec does not settle.
- Starting state: No table support.

##### Material updates

- Evidence — claim: two shapes parse; observer/boundary: unit tests; result: supported; pointer: specs/parser.md
- Extension — authority: the user; added scope: nested tables; added evidence: one more test
- Delegation — D-001 (gather, Haiku xhigh): running; delegations/D-001-tables/brief.md

### Recovery sources

- specs/parser.md — the design; sections 2 and 3 govern the Slice.
- sources/benchmarks.md — timings; read when measuring speed.

### Next useful action

- Finish nested tables.

## Future Work

### Slice — Add the CLI
- State: proposed
- Intended result: A CLI over the parser.
- Expected evidence: CLI tests.
- Dependencies: Parse tables.

### Checkpoint C-002 — Commit the tables
- State: pending
- Type: preserve
- Condition: The table tests pass.
- Applies to: S-004

### Checkpoint — Review the CLI
- State: proposed
- Type: review
- Condition: The CLI exists.
- Applies to: Add the CLI

## History

### Decisions

#### D-001 — Markdown input
- State: superseded
- Decision: Plain text input.
- Established by: The user, 2026-10-18.
- Rationale: Simplest.
- Consequences: One reader.
- Revisit when: Formats grow.
- Superseded by: D-002

#### D-002 — Markdown only
- State: active
- Decision: The parser reads Markdown only.
- Established by: The user, 2026-10-19.
- Rationale: The sources are Markdown.
- Consequences: No other readers.
- Revisit when: A source is not Markdown.

### Checkpoints

#### C-001 — Commit the reader
- State: completed
- Type: preserve
- Condition: The reader's tests pass.
- Applies to: S-001
- Result: Committed.
- Task effect: The reader is saved.

### Slices

#### S-001 — Read the input
- State: completed
- Intended result: Input is read.
- Authority source: The work agreement.
- Result: It reads files.
- Evidence and limits: The reader's tests; no large files tried.
- Task effect: The parser has input.
- Residual effects: A temp file is left behind.

##### Corrections

- Field: Result; before: reads; after: reads files; reason: clarity; source: the tests

#### S-002 — Parse headings
- State: blocked
- Intended result: Headings parse.
- Result: Two of three levels.
- Evidence and limits: The heading tests.
- Task effect: Headings partly parse.
- Resume when: The spec settles level three.

#### S-003 — Baseline timings
- State: completed
- Occurred: 2026-10-15 to 2026-10-16
- Recorded: retroactively on 2026-10-17
- Intended result: A baseline.
- Authority source: The user's request.
- Result: 40 ms a file.
- Evidence and limits: sources/benchmarks.md
- Task effect: The baseline is known.

## Notes

A free note: the parser was named on 2026-10-18.
