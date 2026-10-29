# Fixture task

Schema: 5 · State: active
Cue: read when testing the Schema 5 record format
State as of: 2026-10-29T09:00:00.000Z

## Current Context

### Goal

- A task folder in every shape Schema 5 allows.

### Settled

- The parser reads all three files (S-001).

### Open

- Proposed: a second agreement after this one (2026-10-29).

## Current Work

### Agreement A-002 — Finish the fixture

- Opened: 2026-10-28
- Done when every file validates. You: "go" (2026-10-28)
- Without asking: the fixture's own files.
  The tests that read them too.
- Update: Narrowed to the parser: "parser first" (2026-10-29)

### Slice S-003 — Parse the fixture

- State: in_progress
- Opened: 2026-10-29
- Under: A-002
- Result wanted: The fixture parses.
- Scope: record.md, history.md and decisions.md.
- Done when: validate prints valid.
- Stop if: a shape the Spec does not settle.
- Started from: Nothing parsed.
- Waits on: D-004
- Evidence (observed): the record parses — record.md
- Review: none yet

### Delegations

- D-004 — Gather the shapes (gather, Haiku xhigh) · under A-002 · from S-003 · running · delegations/D-004-gather-the-shapes/brief.md

### Space

- github.com/acme/widget · schema-5 · 1a2b3c4d · not pushed

### Read on recovery

- record.md — this file.

### Read when

- history.md — closed work; read when the next action depends on it.

### Next action

- Run validate.

## Future Work

### Slice — Render the views

- Result wanted: The views of this fixture.
- Done when: each view prints.
