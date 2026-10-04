# Working Record Format

This reference owns the exact Schema 4 shape: sections, fields, states, lifecycle transitions, and the command contract. Read it before editing structure or preparing input for a command. It defines format, not what is worth recording; [Track Work](../SKILL.md) owns that judgment.

## Task Directory

Each task has one directory:

```text
.freeflow/tasks/task-NNN-<short-name>/
  record.md    the Working Record
  specs/       task-local Specs
  plans/       task-local Plans
  sources/     saved copies of material that exists only in conversation
  scratch/     temporary work: throwaway scripts, saved output, downloads
```

`NNN` is three or more digits. A new task takes the next number after the highest existing one; numbers are never reused. `specs/`, `plans/`, and `sources/` are created only when needed; `init` creates `scratch/`. Nothing in `scratch/` is part of the record unless the record points to it, and it may be deleted when the task ends. The directory must be ignored by Git and untracked.

A Spec or Plan may instead live in the repository's own documentation; the record points to it either way.

## Skeleton

`init` creates every structural heading:

```markdown
# Working Record: <task name>

Schema: 4
State: active
Last updated: <UTC ISO-8601 timestamp>

## Current Context

### Goal

### What defines this task

### Settled

### Tentative

### Open

### Current direction

### Boundaries

## Current Work

### Current Slice

None

### Recovery sources

### Next useful action

## Future Work

## History

### Decisions

### Checkpoints

### Slices

## Notes
```

The five top-level sections are fixed, in this order: Current Context, Current Work, Future Work, History, Notes. `### Recovery sources` is optional; records created before it existed remain valid without it.

The header holds the task name, `Schema`, task `State`, and `Last updated`. `init` and every successful lifecycle command set `Last updated`; views, validation, failed commands, and direct edits do not. It records recency only, not validity or truth.

## Field Syntax

Structured entities use compact field rows:

```markdown
- Field: one-line value
- Field:
  - first item
  - second item
```

- Multi-line values are indented two spaces under their field.
- The older expanded style (`Field: value` without the leading dash) is still read. Do not mix the two styles within one entity; commands rewrite entities they change in compact style.
- Use only the fields defined for the entity. Omit an optional field that has no value; never write an empty label such as `- Type:`.
- Every line inside a structured entity belongs to a field or a permitted nested heading. Stray text is invalid.
- Durable IDs are assigned by commands: `S-NNN` Slices, `C-NNN` Checkpoints, `D-NNN` Decisions. They appear in headings and never change or get reused. They follow recording order, not the order work happened.
- Proposed Slices and proposed Checkpoints have no ID. Their titles must be unique across Future Work.

## Current Context

Present understanding, as bullets under exactly these seven headings:

| Heading | Holds |
| --- | --- |
| Goal | The outcome or central question; not the current mechanism. |
| What defines this task | Pointers to the artifacts that define the task, such as its Spec, Plan, issue, or user-supplied brief. Every entry is read on each recovery. |
| Settled | Facts and accepted understanding that still affect the work. |
| Tentative | Hypotheses and provisional approaches. |
| Open | Unresolved questions that could change the work. |
| Current direction | The remaining approach and why; not a history of completed work. |
| Boundaries | Scope exclusions, constraints, evidence limits, user-facing return conditions, and separately controlled actions. |

Keep only pointers under `What defines this task`; accepted choices go in Decisions and constraints in Boundaries. Change Current Context only when present meaning changes; a lifecycle transition alone does not require it. Remove narration once its consequence is recorded elsewhere.

## Current Work

Current Work holds one Current Slice or `None`, optional Recovery sources, and one Next useful action.

### Current Slice

```markdown
#### S-004 — Draft the migration guide
- State: in_progress
- Type: delivery
- Intended result: A guide existing users can follow to move to v2.
- Authority source: User request in this conversation.
- Scope: docs/migration.md only.
- Expected evidence: Every v1 option maps to a v2 option or a stated removal.
- Stop condition: A v1 option with no v2 equivalent and no accepted removal.
- Starting state: docs/migration.md does not exist.

##### Material updates

- Evidence — claim: all 14 options mapped; observer/boundary: diff against v1 option list; result: supported; proves: coverage of listed options; does not prove: undocumented options; pointer: docs/migration.md
```

| Field | Required | Values |
| --- | --- | --- |
| State | yes | `in_progress`, `paused` |
| Intended result | yes | |
| Authority source | yes | |
| Scope | yes | |
| Expected evidence | yes | |
| Stop condition | yes | |
| Starting state | yes | The state of what this Slice will change. |
| Type | no | `learning`, `delivery`, `deepening` |
| Dependencies | no | |
| Reopened from | no | `S-NNN` of a historical Slice |

`in_progress` means the Slice's result is being pursued. `paused` means it is still current but safe continuation is suspended; an ordinary turn, feedback, or context boundary is not a pause.

`##### Material updates` is optional and holds bullets only. Use these prefixes when they fit; the rest of each line is prose:

```text
- Extension — authority: ...; added scope: ...; added evidence: ...
- Evidence — claim: ...; observer/boundary: ...; result: supported | contradicted | inconclusive | unavailable; proves: ...; does not prove: ...; pointer: ...
- Result — identity: ...  (for example a commit SHA, document version, or sent message ID)
- Paused — reason: ...; resume when: ...
- Resumed — resolution source: ...
- Blocker — why unsafe: ...; required resolution: ...
- Contradiction — ...
- Review — judgment and effect: ...
- Correction — ...
```

An Evidence entry identifies the state it observed well enough to tell it apart from later versions. When later edits leave a result's applicability unresolved, say so rather than carrying the earlier result forward. Append counterevidence as a new entry instead of rewriting the earlier one. A missing output is unavailable evidence, not proof the check never ran. Label a report you did not observe as a report.

When no Slice is current, the section contains the single line `None`.

### Recovery sources

What the next context must read to resume the current work, one bullet per source:

```markdown
### Recovery sources

- docs/api-v2.pdf — the accepted response shape; sections 3–4 govern the current Slice.
- .freeflow/tasks/task-007-report/sources/layout.png — the user's layout; the header spacing is binding.
- conversation:turn-42 — the user's exception for legacy clients.
- docs/benchmarks.md — baseline timings; read when measuring performance.
```

Each entry is a pointer, then what it establishes. An entry may end with a trigger, `read when <situation>`: recovery reads it only once that situation applies. Use one only when the source matters to part of the work, not to save reading what the next action needs. A pointer is a path relative to the repository root, an absolute path, a URL, or a host history reference when the host can retrieve it. Material that exists only in the conversation is saved under the task's `sources/` directory first. Recovery sources apply to Current Work only and do not carry into History.

### Next useful action

One concise action or an honest wait or stop condition, as a single bullet. Slice and task-state commands replace it with the `--next-action` text; Checkpoint commands replace it when `--next-action` is given.

## Future Work

One ordered sequence of proposed Slices and non-terminal Checkpoints. Order is a recommendation; it confers no authority and may be revised at any time.

### Proposed Slice

```markdown
### Slice — Add the CLI
- State: proposed
- Intended result: A CLI that exposes the parser.
- Expected evidence: CLI tests for each subcommand.
- Dependencies: Implement the parser.
```

Required: `State: proposed` and `Intended result`. Optional: `Type`, `Expected evidence`, `Dependencies`.

### Checkpoint

```markdown
### Checkpoint C-002 — Commit the parser
- State: pending
- Type: preserve
- Condition: The parser Slice's checks pass.
- Applies to: S-004
```

A proposed Checkpoint has no ID in its heading (`### Checkpoint — <title>`). Required fields: `State` (`proposed`, `pending`, `deferred`), `Type`, `Condition`, `Applies to`. `Applies to` names a proposed Slice by exact title until that Slice starts, then its `S-NNN`. Every Checkpoint belongs to one Slice; there are no task-wide Checkpoints.

| State | Meaning |
| --- | --- |
| `proposed` | Anticipated only. It has no ID and no authority, and may be removed directly. |
| `pending` | Authorized or selected and due. Work that depends on it must not cross it, and its Slice cannot close until it is closed. |
| `deferred` | Accepted but dormant until its condition. It is not cancelled, and it still blocks its Slice's closure. |

An accepted Checkpoint leaves Future Work only through `checkpoint close`; never drop one by editing.

| Type | Boundary | Earlier name, still read |
| --- | --- | --- |
| `preserve` | Save a recoverable point: commit, draft version, snapshot. | `local_commit` |
| `publish` | Make work available beyond the workspace: push, pull request, publication, sending. | |
| `review` | Independent judgment of the work. | `independent_review` |
| `decision` | A user-owned choice that later work depends on. | `user_decision` |
| `continuity` | A planned pause, handoff, or transfer. | |

## History

Three subsections in this order: Decisions, Checkpoints, Slices. History is append-oriented: commands add entries and move terminal state into it; terminal entries are never deleted, reactivated, or rewritten.

### Decisions

```markdown
#### D-001 — Keep the Markdown record canonical
- State: active
- Decision: record.md remains the canonical task memory.
- Established by: The user's accepted direction on 2026-09-25.
- Rationale: Agents need one readable recovery surface.
- Consequences: Views project the same file.
- Revisit when: The storage boundary changes.
```

Required: `State` (`active`, `superseded`, `retired`), `Decision`, `Established by`, `Rationale`, `Consequences`, `Revisit when`. Optional: `Source references`. `Superseded by: D-NNN` is required when superseded; `Retired because` when retired.

- Record only what the user actually accepted. When the difference matters, keep a source reference that distinguishes the accepted choice from the proposal.
- A clerical clarification may edit an active Decision directly. A change in meaning is a new Decision that supersedes the old one.
- Retire a Decision that no longer governs, with the reason. Adopting a superseded or retired choice again is a new Decision.

### Checkpoints

A closed Checkpoint keeps its future fields and adds `Result` and `Task effect`. `State` is `completed`, `cancelled`, or `replaced`. `Evidence` is optional; `Reason` is required for cancelled and replaced; `Replaced by: C-NNN` for replaced, naming a Checkpoint that is still pending or deferred.

`completed` means the boundary happened, not that its judgment was favorable.

### Slices

A closed Slice keeps `Intended result` and, when present, `Type`, `Authority source`, and `Reopened from`. It adds `Result`, `Evidence and limits`, and `Task effect`. `State` is `completed`, `blocked`, or `abandoned`; `Resume when` is required for blocked and `Reason` for abandoned. `Residual effects` is optional.

Closing does not keep Scope, Stop condition, Starting state, Dependencies, Material updates, or Recovery sources. Anything among them that still matters belongs in `Evidence and limits` or `Task effect` before closing.

| State | Meaning |
| --- | --- |
| `completed` | The intended result and its required evidence are settled. |
| `blocked` | A paused attempt that could not continue left Current Work; `Resume when` says what would allow it. |
| `abandoned` | Explicit authority ended the pursuit; `Reason` says why. |

A Slice that finished before it could be recorded, such as work done before the record existed, enters History through `slice record` with the same fields plus two more:

```markdown
#### S-006 — Baseline on the easy tasks
- State: completed
- Occurred: 2026-09-26 to 2026-09-27
- Recorded: retroactively on 2026-09-28
- Intended result: ...
```

`Occurred` is when the work happened: `YYYY-MM-DD` or `YYYY-MM-DD to YYYY-MM-DD`. `Recorded` is written by the command, so a retroactive entry is never mistaken for live bookkeeping. The two appear together or not at all. A retroactive result is reconstructed, not observed at recording time: `Evidence and limits` points to where the exact history lives, such as a session, log, or commit.

Reopen a completed or blocked Slice only when the new work still belongs to the same intended result; reopening creates a new Slice and leaves the historical entry unchanged. After an abandoned Slice, propose a new one instead.

### Corrections

A clerical fix to a terminal entry is appended inside it, never applied by overwriting:

```markdown
##### Corrections

- Field: Result; before: checks passed; after: local checks passed, production unobserved; reason: clarification; source: file:notes.md#run-3
```

A correction cannot change an entry's state, ID, or meaning.

## Task State

```text
active <-> paused
active | paused -> completed | abandoned
completed | abandoned -> active
```

Only the user changes task state. A new record starts `active`. Pausing a task pauses its Current Slice; reactivating the task does not resume the Slice. A completed or abandoned task has no Current Slice and no pending or deferred Checkpoint. Completing a Slice never completes the task.

Before completing or abandoning a task, keep a proposed Future Work item only if it is clearly non-binding; otherwise reconcile it first. Reactivating a task selects no work.

## Lifecycle Commands

Run `working-record.mjs <group> <operation> --help` for each command's options and input fields. `--input -` reads the input fragment from stdin. An input fragment holds only the fields its help lists; commands set `State` and IDs themselves. Commands that change the Current Slice or task state require `--next-action`. `--record` resolves against `--root`, which defaults to the current directory; an absolute `--record` path finds its own root.

| Transition | Command |
| --- | --- |
| Create the record | `init --name <task name> --input <fragment>` (Goal and Next useful action required) |
| Propose a Slice | `slice propose` |
| Start a proposed Slice → `in_progress`, assigns `S-NNN` | `slice start --title <proposal title>` |
| Start a Slice that was never proposed | `slice start-direct` |
| `in_progress` → `paused` | `slice pause` |
| `paused` → `in_progress` | `slice resume` |
| Current → History `completed` / `blocked` (from paused) / `abandoned` | `slice close --state <state>` |
| Continue a completed or blocked historical Slice as a new Slice | `slice reopen --id <S-NNN>` |
| Record a Slice that already finished directly into History | `slice record --state <completed|blocked|abandoned>` |
| Propose a Checkpoint | `checkpoint propose` |
| `proposed` → `pending`, assigns `C-NNN` | `checkpoint activate` |
| `pending` ↔ `deferred` | `checkpoint defer`, `checkpoint resume` |
| `pending` / `deferred` → History | `checkpoint close --state <completed|cancelled|replaced>` |
| Add, supersede, or retire a Decision | `decision add`, `decision supersede`, `decision retire` |
| Change task state | `task set-state --state <state>` |

Use `slice start` for a proposed Slice and `slice start-direct` only for work that was never proposed. Starting any Slice records it before its first effect; it does not authorize the work. `slice record` is only for work whose effects already happened; it leaves the Current Slice, Future Work, and Next useful action unchanged, so it can run while a Slice is live.

Every command validates the record before and after the change and publishes one complete valid result or nothing.

| Exit code | Meaning |
| --- | --- |
| 0 | The change was published, or there was nothing to change. |
| 1 | Nothing was written. The error says why. |
| 2 | The outcome is uncertain: the write may have happened. Read `view full` before retrying or editing. |

## Direct Edits

Edit directly:

- Current Context bullets;
- optional fields and wording in active entities;
- Material updates, Recovery sources, and the Next useful action;
- the order, wording, or removal of proposed items;
- Notes;
- Corrections blocks in History.

Never edit directly: IDs, `State` fields, which section an entity is in, or any terminal History entry apart from Corrections. `validate` checks structure only; it cannot detect a hand-made state change or a deleted entry, so those edits are forbidden rather than checked.

After editing headings, fields, or entity structure, run `validate --record <record.md>`. Prose-only edits need no validation.

## Views

Both views are plain Markdown and change nothing.

- `view full` returns the file exactly as stored. It does not require the record to be valid, so use it to inspect malformed or unsupported records.
- `view resume` returns the header, Current Context, active Decisions, Current Work, Future Work, and Notes. It omits terminal History and is not sufficient after context loss.

## Notes

Everything under `## Notes` is ordinary Markdown with no structure. Notes do not authorize, prioritize, block, or prove anything. Anything that affects scope, evidence, or the next action belongs in its structured section instead. Remove a user-written Note only when the user asks.

## Legacy Records

A record with another `Schema` value is not a Schema 4 record. Read it through `view full` only; do not edit or transition it. Migration is a separate, authorized operation.
