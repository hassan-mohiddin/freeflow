# Schema 4

A Working Record whose header says `Schema: 4` keeps this shape and method. On Pi with Task Memory on, every record is Schema 4 until Pi moves to Schema 5: the `task_memory` tool and the task-memory skill say how a session holds them, and `init --schema 4 --root <repository> --name <task name> --input -` creates one in a repository. Elsewhere, a Schema 4 record is one made before Schema 5 that has not been converted: keep it working with the commands below, offer the user to convert it with `migrate`, and convert it only on their word.

[Track Work](../SKILL.md)'s judgment holds for a Schema 4 record as for any other: what is worth tracking and when, Slices, the rolling route, recovery, closing. Its Rules hold too, apart from what names Schema 5's parts. This reference says where a Schema 4 record differs; then its Record Format and its Projects And Child Records are binding as written.

## How A Schema 4 Record Differs

The record is one file with five sections:

- **Current Context:** present understanding, including the optional `Work agreement` (what the user agreed you may do, and until when) and `What defines this task`, which points to the task's defining artifacts such as its Spec and Plan.
- **Current Work:** the Current Slice (the unit of work in progress, with its `Material updates` log), `Recovery sources` to read when resuming, and one Next useful action.
- **Future Work:** the rough route ahead, as proposed Slices and Checkpoints.
- **History:** accepted Decisions, closed Checkpoints, and closed Slices.
- **Notes:** free-form context with no authority.

| A Schema 5 record has | A Schema 4 record has instead |
| --- | --- |
| Settled and Open | Settled, Tentative, Open, Current direction and Boundaries, changed directly whenever present meaning changes |
| The agreement, `A-NNN`, through `agreement` commands | Current Context's `Work agreement`, edited directly |
| `decisions.md` | `sources/decisions.md`, a Recovery source; each item the user answered also becomes a Decision |
| A Slice's update lines | its `Material updates` |
| Defined by | `What defines this task` |
| Read on recovery and Read when | `Recovery sources`, each with an optional trigger |
| The Next action | the Next useful action |
| The agreement's `Back at` lines | Checkpoints, in Future Work until they close into History |
| `history.md` and its index | History in the record, indexed by `view resume` |
| In flight, `checkpoint`, the bundle and the budget | the record updated before the boundary; on Pi, Freeflow's compaction summary |
| The store, `sessions.md` and holds | a registry of projects and owners, with child records (Projects And Child Records, below) |

### What Goes Where

| When this happens | Record it in |
| --- | --- |
| Understanding changes: a fact is settled, a hypothesis forms, a question opens | Current Context |
| The user accepts a choice | a Decision |
| The user agrees to a route or part of one, or changes it | the Work agreement |
| Work with partial state is about to begin | a Slice |
| You learn something needed to resume: a file, attachment, message, or section | Recovery sources |
| A Spec, Plan, or other defining artifact is created or accepted for the task | What defines this task |
| The next step or rough route becomes clear | Next useful action and Future Work |
| Work produces a result, an identity (commit, document version, sent message), or evidence | the Slice's Material updates, then its closure |

Keep hypotheses and proposals in Tentative until they are accepted. Permission to investigate an option does not accept it.

While discussing, record a Decision when the user makes a choice; put options under consideration in Tentative and unanswered questions in Open; use Open to choose what to ask next, and check Settled and Decisions before asking the user something again. When you propose a route and the user has not answered, put it under Open as a bullet starting `Proposed:` with its date. When the user supplies material that governs the work, point to it from Recovery sources, or from `What defines this task` if it defines the task. While executing, record the Slice before its first effect, its Authority source naming the Work agreement line, or the user's reply, it rests on; add Material updates at boundaries; close Checkpoints as their boundaries happen, then close the Slice with a distilled result.

### The Work Agreement

Write the Work agreement section when something is agreed, at `init` if it is known then; never as a placeholder, and never ask the user for it just because a record is being created. When the agreement grows or changes, replace the lines it changes, as a direct edit: the user's message that changed it covers the edit, so do not ask first or wait for a command. When the user narrows it for now ("just diagnose first", "don't edit yet"), add that line at once, in their words: it governs over the rest of the section until the user lifts it, and a later context sees only what is written. When a `Proposed:` item is answered, move it into the Work agreement, record it as a Decision if it decided something about the work, or drop it. A change to the agreement is not a Decision; a choice about the work is.

For a long or unattended run, or once the agreement has changed several times, also keep `sources/work-agreement-log.md`: one dated, numbered entry per exchange that set or changed the agreement, the proposal in one line and the user's reply verbatim, append-only. It holds only those exchanges, not discussion. List it under Recovery sources with the trigger "read when changing the Work agreement or when its wording is in question".

[Discuss Work](../../discuss-work/SKILL.md)'s decision list lives in `sources/decisions.md` in the task folder, listed under Recovery sources with the trigger "read when deciding, self-reviewing, or handing over"; update it directly as items change. Each item the user answered also becomes a Decision quoting their words; the rest are what you assumed, never what the user accepted.

### Checkpoints

A **Checkpoint** is a boundary on the route that is not itself a unit of work: a commit, a publication, a review, a decision, a continuity point. It belongs to the Slice it follows. Do not make a Checkpoint into a Slice.

```text
User: "Implement the parser, then commit, then do the CLI."
Future Work:
  Slice — Implement the parser
  Checkpoint — Commit the parser        (preserve, applies to: Implement the parser)
  Slice — Add the CLI
Not: a separate "Commit the parser" Slice.
```

| Type | Code | Other work | Owner when due |
| --- | --- | --- | --- |
| `preserve` | local commit | save a draft version or snapshot | Deliver Work (commit) |
| `publish` | push, pull request | publish, send to a client | Deliver Work (push, pull request or release) |
| `review` | independent code review | editor or reviewer sign-off | Review Work |
| `decision` | owner chooses a design | owner chooses between options | Discuss Work |
| `continuity` | pause or handoff point | pause or handoff point | Track Work ([handoff](handoff.md)) |

When a pending Checkpoint is due, stop dependent work, use its owner, and continue from the result. Do not force a Checkpoint whose condition, evidence or protected boundary no longer holds; return the discrepancy for cancellation, replacement, deferral or revision.

Propose a Checkpoint only where it protects a dependency, decision, rollback, transfer, integration, or delivery; self-review is not one. A Checkpoint is `proposed` while it is only anticipated and `pending` once the user authorizes or selects it. Activate it as soon as authority exists. A pending or deferred Checkpoint must be closed before its Slice closes; `completed` means the boundary happened, even when its judgment was adverse. On long tasks, a `preserve` Checkpoint every few Slices keeps a recoverable point without a Slice of its own. A study run with Research Work names its plan as a defining artifact and its lock as a decision Checkpoint.

### Recover A Schema 4 Record

Recover only a record that the context you still have ties to the current work, such as the user's direction, or a summary or handoff that names it. A recent change does not show that a record belongs to the current work. When a record's task and the current work disagree, report it instead of recovering the record.

After context loss, recover in this order before any task action:

1. `view recover`: the `resume` view (the record's present state and a one-line index of closed History), then each defining artifact and Recovery source with its trigger, whether it resolves and its size, then where live Git state disagrees with the record. If output is truncated, keep reading until complete. Do not open `record.md` itself for this: it loads the whole History, which the index lets you read only where needed. A summary is not recovery.
2. Every artifact listed under `What defines this task`, such as the task's Spec and Plan.
3. Every entry under `Recovery sources`, except one whose stated trigger ("read when …") does not apply yet; read that one when it does.
4. The History entries the next action depends on, through `view entry <ID>`: closed work on the same result or area, a blocked or abandoned attempt at what you are about to do, a superseded Decision behind a current one, and any entry the record or a source names by ID.

If any of them cannot be read completely, report that and stop affected work. Then reconcile as Track Work says, with active Decisions and pending Checkpoints among what you establish. With the conversation still in context, use `view resume` or read the relevant section.

### Before A Context Boundary

When a context limit is near or a pause or transfer is coming, make the record sufficient before stopping:

- Record partial effects, unverified work, failed approaches that would otherwise be repeated, and anything running whose result is unknown.
- Update `Recovery sources` with what the next context must read, and why each matters. Drop entries the current work no longer needs; give a source needed only in some situation a trigger ("read when …").
- Material that exists only in the conversation, such as a pasted image, file, or long message, will not survive. Save a copy under the task's `sources/` directory and point to it, or point to host-retrievable history when the host provides it.
- Leave one Next useful action that a fresh context can act on.

A context boundary is not a Slice transition or a Checkpoint. Use a `continuity` Checkpoint only for a planned pause or handoff, not for every compaction.

### Maintain And Close

If `init` reports that the task directory is not ignored by Git, ask the user before changing ignore rules. Records must stay out of version control. If a record uses another schema or fails validation, read it through `view full` and stop before edits or transitions; repair or migration needs separate authorization.

Close a Slice as `completed` only when its result is supported by evidence, live state agrees, no material contradiction or authority conflict remains, and no Checkpoint on it is pending or deferred. Closing keeps only the historical fields; Material updates and Recovery sources do not carry over. Before closing, put every evidence pointer, residual effect, and limit that still matters into `Evidence and limits` or `Task effect`, and remove Recovery sources that no longer apply.

## Record Format

### Task Directory

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

A registered task's directory lives in its project's store instead (`<Freeflow home>/projects/<project>/tasks/task-NNN-<short-name>/`, outside any repository; the store is marked by its `store.json`), with the same contents; see [Projects And Child Records](#projects-and-child-records).

A Spec or Plan may instead live in the repository's own documentation; the record points to it either way.

### Skeleton

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

The five top-level sections are fixed, in this order: Current Context, Current Work, Future Work, History, Notes. `### Recovery sources` is optional; records created before it existed remain valid without it. `### Work agreement` is optional and not in the skeleton: `init` writes it, directly after Goal, only when its input has one.

The header holds the task name, `Schema`, task `State`, and `Last updated`. `init` and every successful lifecycle command set `Last updated`; views, validation, failed commands, and direct edits do not. It records recency only, not validity or truth.

### Field Syntax

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

### Current Context

Present understanding, as bullets under these seven headings, plus an optional Work agreement directly after Goal:

| Heading | Holds |
| --- | --- |
| Goal | The outcome or central question; not the current mechanism. |
| Work agreement (optional) | The current work agreement, as far as it is known: what done looks like, what the agent does without asking, what needs the user's yes first, where it comes back, and how long it holds. |
| What defines this task | Pointers to the artifacts that define the task, such as its Spec, Plan, issue, or user-supplied brief. Every entry is read on each recovery. |
| Settled | Facts and accepted understanding that still affect the work. |
| Tentative | Hypotheses and provisional approaches. |
| Open | Unresolved questions that could change the work. |
| Current direction | The remaining approach and why; not a history of completed work. |
| Boundaries | Scope exclusions, constraints, evidence limits, user-facing return conditions, and separately controlled actions. When the record has a Work agreement, return conditions and separately controlled actions belong there, and Boundaries keeps the rest. |

Start each line with the lead words for the part it states: `Done when`, `Without asking:`, `Ask first:`, `Back`, `Holds until`. Write only the parts that are known; one line is often enough, and `validate` does not check the lead words. Each line that rests on the user's reply quotes it, beside what it answered:

```markdown
### Work agreement

- Done when the reported bug is fixed and its PR is open.
- Without asking: fix it, commit on a branch, open the PR. You said "yeah, do that" to that route (2026-10-12).
- Ask first: merging, anything outside the bug.
- Back at the PR.
- Holds until the PR merges.
```

The heading is never empty: omit it until something is agreed. `validate` rejects it when it is empty or anywhere but directly after Goal.

Keep only pointers under `What defines this task`; accepted choices go in Decisions and constraints in Boundaries. Change Current Context only when present meaning changes; a lifecycle transition alone does not require it. Remove narration once its consequence is recorded elsewhere.

### Current Work

Current Work holds one Current Slice or `None`, optional Recovery sources, and one Next useful action.

#### Current Slice

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
- Review gate — mode: auto | off | always; tier: ...; because: <trigger> | no trigger; result: dispatched | proposed | skipped
- Review — round: R1 | R2 | R3; reviewer: <model> (<family>); judgment: ...; Accepted: <n>; Rejected: <n>; Open: <n>; reviewed: <commit or version>; report: <path>; effect: ...
- Correction — ...
```

A Review entry is written after adjudication, one per independent review, so outcomes and rounds can be counted later; its report and brief live in the task's `scratch/reviews/` (`R1-brief.md`, `R1-report.md`). Self-review writes no Review entry.

An Evidence entry identifies the state it observed well enough to tell it apart from later versions. When later edits leave a result's applicability unresolved, say so rather than carrying the earlier result forward. Append counterevidence as a new entry instead of rewriting the earlier one. A missing output is unavailable evidence, not proof the check never ran. Label a report you did not observe as a report.

When no Slice is current, the section contains the single line `None`.

#### Recovery sources

What the next context must read to resume the current work, one bullet per source:

```markdown
### Recovery sources

- docs/api-v2.pdf — the accepted response shape; sections 3–4 govern the current Slice.
- .freeflow/tasks/task-007-report/sources/layout.png — the user's layout; the header spacing is binding.
- conversation:turn-42 — the user's exception for legacy clients.
- docs/benchmarks.md — baseline timings; read when measuring performance.
```

Each entry is a pointer, then what it establishes. An entry may end with a trigger, `read when <situation>`: recovery reads it only once that situation applies. Use one only when the source matters to part of the work, not to save reading what the next action needs. A pointer is a path relative to the repository root, an absolute path, a URL, or a host history reference when the host can retrieve it. Material that exists only in the conversation is saved under the task's `sources/` directory first. Recovery sources apply to Current Work only and do not carry into History.

#### Next useful action

One concise action or an honest wait or stop condition, as a single bullet. Slice and task-state commands replace it with the `--next-action` text; Checkpoint commands replace it when `--next-action` is given.

### Future Work

One ordered sequence of proposed Slices and non-terminal Checkpoints. Order is a recommendation; it confers no authority and may be revised at any time.

#### Proposed Slice

```markdown
### Slice — Add the CLI
- State: proposed
- Intended result: A CLI that exposes the parser.
- Expected evidence: CLI tests for each subcommand.
- Dependencies: Implement the parser.
```

Required: `State: proposed` and `Intended result`. Optional: `Type`, `Expected evidence`, `Dependencies`.

#### Checkpoint

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

`Type` is one of the five in Track Work's Checkpoint table: `preserve`, `publish`, `review`, `decision`, `continuity`. Earlier names are still read: `local_commit` as `preserve`, `independent_review` as `review`, `user_decision` as `decision`.

### History

Three subsections in this order: Decisions, Checkpoints, Slices. History is append-oriented: commands add entries and move terminal state into it; terminal entries are never deleted, reactivated, or rewritten.

#### Decisions

```markdown
#### D-001 — Keep the Markdown record canonical
- State: active
- Decision: record.md remains the canonical task record.
- Established by: The user's accepted direction on 2026-09-25.
- Rationale: Agents need one readable recovery surface.
- Consequences: Views project the same file.
- Revisit when: The storage boundary changes.
```

Required: `State` (`active`, `superseded`, `retired`), `Decision`, `Established by`, `Rationale`, `Consequences`, `Revisit when`. Optional: `Source references`. `Superseded by: D-NNN` is required when superseded; `Retired because` when retired.

- Record only what the user actually accepted. When the difference matters, keep a source reference that distinguishes the accepted choice from the proposal.
- A clerical clarification may edit an active Decision directly. A change in meaning is a new Decision that supersedes the old one.
- Retire a Decision that no longer governs, with the reason. Adopting a superseded or retired choice again is a new Decision.

#### Checkpoints

A closed Checkpoint keeps its future fields and adds `Result` and `Task effect`. `State` is `completed`, `cancelled`, or `replaced`. `Evidence` is optional; `Reason` is required for cancelled and replaced; `Replaced by: C-NNN` for replaced, naming a Checkpoint that is still pending or deferred.

`completed` means the boundary happened, not that its judgment was favorable.

#### Slices

A closed Slice keeps `Intended result` and, when present, `Type`, `Authority source`, and `Reopened from`. It adds `Result`, `Evidence and limits`, and `Task effect`. `State` is `completed`, `blocked`, or `abandoned`; `Resume when` is required for blocked and `Reason` for abandoned. `Residual effects` is optional.

Closing does not keep Scope, Stop condition, Starting state, Dependencies, Material updates, or Recovery sources. Anything among them that still matters belongs in `Evidence and limits` or `Task effect` before closing; Review entries always do, copied whole, so review outcomes stay countable.

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

#### Corrections

A clerical fix to a terminal entry is appended inside it, never applied by overwriting:

```markdown
##### Corrections

- Field: Result; before: checks passed; after: local checks passed, production unobserved; reason: clarification; source: file:notes.md#run-3
```

A correction cannot change an entry's state, ID, or meaning.

### Task State

```text
active <-> paused
active | paused -> completed | abandoned
completed | abandoned -> active
```

Only the user changes task state. A new record starts `active`. Pausing a task pauses its Current Slice; reactivating the task does not resume the Slice. A completed or abandoned task has no Current Slice and no pending or deferred Checkpoint. Completing a Slice never completes the task.

Before completing or abandoning a task, keep a proposed Future Work item only if it is clearly non-binding; otherwise reconcile it first. Reactivating a task selects no work.

### Lifecycle Commands

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

### Direct Edits

Edit directly:

- Current Context bullets;
- optional fields and wording in active entities;
- Material updates, Recovery sources, and the Next useful action;
- the order, wording, or removal of proposed items;
- Notes;
- Corrections blocks in History.

Never edit directly: IDs, `State` fields, which section an entity is in, or any terminal History entry apart from Corrections. `validate` checks structure only; it cannot detect a hand-made state change or a deleted entry, so those edits are forbidden rather than checked.

After editing headings, fields, or entity structure, run `validate --record <record.md>`. Prose-only edits need no validation. `validate` also lists Material updates pointers (paths from the repository root or the task folder, and commits) that do not resolve, as warnings, since a line may name a planned path or a commit not fetched yet; `--strict` fails on those an Evidence or Result line names. Pointers outside the repository are listed, not checked.

### Views

Views are plain Markdown and change nothing.

- `view resume` returns the header, Current Context, active Decisions, Current Work, Future Work, a History index, and Notes. The index has one line per closed History entry (superseded and retired Decisions, closed Checkpoints, closed Slices) in record order: ID, state, `by D-NNN` for a superseded Decision, `recorded retroactively` for a `slice record` entry, the title, and `(corrected)` when the entry has Corrections. It is the view to use while the conversation is still in context.
- `view recover` returns the `resume` view, then each `What defines this task` artifact and Recovery source with its trigger, whether its pointer resolves and its size, then live Git state (branch, HEAD, uncommitted paths, commits since `Last updated`) and where it disagrees with the record: a branch the record names that HEAD is not on, or a commit the Current Slice names that HEAD's history lacks. It is the recovery view after context loss.
- `view entry <ID> [<ID> ...]` returns the named `S-NNN`, `C-NNN`, or `D-NNN` entries exactly as stored, in the order given. An unknown ID prints nothing and fails.
- `view full` returns the file exactly as stored. It does not require the record to be valid, so use it to inspect malformed or unsupported records, after an uncertain write, or for an audit.

`view resume`, `view recover` and `view entry` require a valid Schema 4 record.

### Notes

Everything under `## Notes` is ordinary Markdown with no structure. Notes do not authorize, prioritize, block, or prove anything. Anything that affects scope, evidence, or the next action belongs in its structured section instead. Remove a user-written Note only when the user asks.

### Other Schemas

A record whose header says `Schema: 5` follows Track Work's working record format. A record with another `Schema` value is neither: read it through `view full` only, and do not edit or transition it.

## Projects And Child Records

A registered Schema 4 task: a task ID such as `my-project/task-003`, a child record, a project in the registry, or the user asking to group tasks, split a task across parallel sessions, or move a record out of a repository. On Pi, Task Memory's `task_memory` actions do these through the same registry. Its Rules are binding.

### Rules

- Create or link a project, import a record into one, and change a task's directories, only when the user asks, when the user confirms your proposal in a harness dialog, or when the user's auto-approve setting covers that change (Pi Task Memory).
- Write a record only from the session that owns it. A parent task's record is written by the parent's session; a child's record by the child's session.
- A child has no children.
- Remove a task or a project only when the user asks for it to be removed, or confirms your proposal in a harness dialog. Removal moves records to the trash under the Freeflow home; never empty the trash or delete records another way: that is the user's.

### What A Project Is

A project groups related tasks, possibly across several repositories. Its records live in a store under the Freeflow home (`FREEFLOW_HOME`, default `~/.freeflow`), at `projects/<project>/tasks/task-NNN-<short-name>/record.md`, outside any repository, so removing a worktree does not delete them. A registered record is not in the repository's `.freeflow/tasks/`, and that is expected. Each registered task has an ID, `<project>/task-NNN`, and every command that takes `--record` also takes the ID. The registry also records which session owns each record and which task is a child of which.

```text
working-record.mjs project new --name <name> [--worktrees <dir>]     create; link this repository
working-record.mjs project link --name <name> [--worktrees <dir>]    link another repository
working-record.mjs project show [--name <name>]                     a project's tasks (default: this repository's)
working-record.mjs project list                                      every project
working-record.mjs task create --title <t> --goal <g> [--parent <id>] a registered task, or a child
working-record.mjs task fanout --parent <id> --title <t> --goal <g> --agent <cmd>  a child with its own worktree
working-record.mjs task here                                         the task this directory belongs to
working-record.mjs task env --id <id>                                where a task's work happens
working-record.mjs task import --record <record.md> --project <name> move an existing record in
working-record.mjs task search --query <q> --id <id> --scope task|tree|project
working-record.mjs task remove --id <id>                             a task and its children, to the trash
working-record.mjs project remove --name <name>                      a project and its tasks, to the trash
```

Run each command with `--help` before preparing its input. A record that is not registered keeps working where it is.

### Other Tasks In The Project

Each task keeps its own record. Read another task's record (`view resume --record <id>`, `task search --id <id> --scope project --query <words>`) when it bears on what you are about to decide or build; record what matters to this task in this task's own record, never in the other one.

### Where A Task's Work Happens

A registered task records its primary directory (the repository or worktree where its effects belong) and any additional directories; `task env` shows them with the current Git branch. When a session starts with no task in hand, `task here` names the task the directory belongs to: recover that one. Make the task's changes in its primary directory; work in another directory belongs to another workstream unless the user says otherwise.

### Child Records

Goal: parallel work on one task, each workstream with its own memory, and one writer per record.

A child is a record for one workstream of a task that runs in parallel in another interactive session the user starts. When the child will change files, create it with `task fanout`, which also creates its Git worktree on a branch named for it and copies the repository's personal Freeflow config. Pass `--agent` with the command that starts this host's agent (such as `claude` or `codex`); the output ends with a command for a new terminal. Give the user that command exactly. A child that only reads or researches needs no worktree: use `task create --parent <id>`. Most tasks never need a child. A subagent is not a child: it works inside its session, on that session's task, and needs no record.

After creating a child, record the delegation in the parent's record (for example as a Slice whose result is the child's). Read a child's progress with `view resume --record <child-id>` or `task search --scope tree`; when its result matters to the parent, record it in the parent as you would a finished Slice. The child's own session writes the child's record.

Owners are recorded on every host, but only a harness that gates writes enforces them. Without one, check `project show` before writing a registered record another session owns, and ask the user.
