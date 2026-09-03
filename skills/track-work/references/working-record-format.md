# Working Record Format

This is the canonical Markdown shape for a Schema 4 Working Record. Read it before directly editing structured content or preparing Markdown for a lifecycle command. It defines format and mechanical invariants; it does not authorize work or settle task meaning.

The record is a compact current-state projection with append-oriented Slice history. It is not a transcript, a second Spec, a Plan, or a source of truth for the live environment.

## Canonical Skeleton

Initialization creates every structural heading, including empty headings:

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

### Next useful action

## Future Work

## History

### Decisions

### Checkpoints

### Slices

## Notes
```

The header contains the task name, `Schema`, task `State`, and script-maintained `Last updated`. `init` creates the timestamp and every successful lifecycle mutation refreshes it. Views, validation, failed commands, no-ops, and direct Markdown edits do not refresh it. It is advisory recency metadata, not proof of validity, freshness, authority, or semantic truth.

The five top-level sections and their order are fixed:

```text
Current Context
Current Work
Future Work
History
Notes
```

Do not create another top-level section or remove an empty structural heading. The `Notes` section is last and opaque to structured parsing; ordinary Markdown inside it is retained as inert content.

## General Rules

- Known structured blocks use only the field names defined here.
- Omit optional fields when they carry no useful information; do not emit empty labels or `[empty]` markers.
- `Current Slice` uses the literal `None` when no Slice is current.
- Field values may be multiline. Use ordinary Markdown bullets for concise lists.
- Proposed Slices and proposed Checkpoints have no durable ID. Their titles must be unique across all Future Work items.
- Current and historical Slices use script-assigned `S-NNN` IDs.
- Accepted Checkpoints use script-assigned `C-NNN` IDs.
- Decisions use script-assigned `D-NNN` IDs.
- Durable IDs appear in headings and are never changed by direct edits.
- A lifecycle command either publishes one complete valid transition or leaves the source unchanged. If publication is uncertain, stop and inspect `full` before retrying.

## Current Context

Current Context is present understanding, not an event stream. Keep it concise and use bullets under exactly these seven headings:

```markdown
## Current Context

### Goal

- The durable outcome or central question.

### What defines this task

- Accepted artifacts, user decisions, constraints, and source pointers that determine interpretation.

### Settled

- Supported facts or accepted choices that still affect the task.

### Tentative

- Provisional hypotheses or assumptions.

### Open

- Unresolved questions capable of changing the next action.

### Current direction

- The remaining strategy, not a completed-work narrative.

### Boundaries

- Scope exclusions, evidence limits, stop conditions, and separately controlled actions.
```

`Settled` should not copy Decision rationale. `What defines this task` may point to accepted artifacts and sources without copying their content. Remove completed Slice narration, test inventories, hashes, stale failures, and live-run detail once their active consequence has an owner elsewhere.

Change Context only when its present meaning changes. A Slice or Checkpoint transition alone does not require a Context rewrite. Concise does not mean lossy: retain detail when removing it could change the next valid action.

## Current Work

Current Work contains only one Current Slice and one next useful action:

```markdown
## Current Work

### Current Slice

#### S-001 — <title>

State: in_progress
Type: delivery
Intended result:
- The accepted outcome.
Authority source:
- The request or approval covering this Slice.
Scope:
- The permitted work boundary.
Expected evidence:
- The evidence required before closure.
Stop condition:
- The condition requiring pause or return for direction.
Reopened from: S-004

##### Material updates

- Extension — authority: user request; added scope: legacy adapter; added evidence: integration check.
- Evidence — claim: adapter preserves the response shape; observer/boundary: focused integration test; result: supported; proves: local compatibility; does not prove: production behavior; pointer: file:test/compatibility.test.mjs
- Paused — reason: compatibility policy is unresolved; resume when: the user selects a policy.
- Resumed — resolution source: user selected backward compatibility.

### Next useful action

- Inspect the named adapter before changing it.
```

Required active Slice fields:

- `State: in_progress | paused`;
- `Intended result`;
- `Authority source`;
- `Scope`;
- `Expected evidence`;
- `Stop condition`;
- `Starting state`.

Optional active Slice fields:

- `Type: learning | delivery | deepening`;
- `Dependencies`;
- `Reopened from: S-NNN`.

`Material updates` is optional and bullet-only. It is append-oriented, not a second entity schema. Add an entry only when losing it could affect safe continuation or truthful closure. Useful forms are:

```text
- Extension — authority: ...; added scope: ...; added evidence: ...; stop-condition change: ...
- Evidence — claim: ...; observer/boundary: ...; result: supported | contradicted | inconclusive | unavailable; proves: ...; does not prove: ...; pointer: ...
- Paused — reason: ...; resume when: ...
- Resumed — resolution source: ...
- Blocker — why unsafe: ...; required resolution: ...; resume when: ...
- Blocker resolved — resolution source: ...
- Contradiction — ...
- Review — judgment and task effect: ...
- Correction — ...
```

These prefixes make important information recoverable without creating global Blocker or Evidence entities. They are compact conventions; the whole update remains ordinary Markdown prose. If an attempt fails, is rolled back, or leaves residual effects that change the next decision, preserve the attempt, reason, Evidence, and residual state here or in the historical Slice summary.

When there is no active Slice:

```markdown
### Current Slice

None
```

`Next useful action` is one concise action or an honest wait/stop condition. It is not a progress log. Slice lifecycle and task-state commands replace it atomically with agent-supplied text; Checkpoint commands may replace it when their transition changes the route.

Before any consequential action, especially after recovery, confirm the task State, Current Slice, active Decisions, pending or deferred Checkpoints, Next useful action, applicable authority/scope/stop condition, unresolved Evidence, and contradictions. Reconcile the projection from the Working Record, selected exact History, accepted artifacts under `What defines this task`, the live environment, and current human intent and authority. Do not act from the Working Record alone.

Do not begin Slice work until the start transition has successfully persisted and validated the Current Slice and Next useful action. Record an accepted extension before executing its expanded scope.

A Current Slice may be `in_progress` or `paused` only. `paused` means the same outcome remains current but safe continuation is suspended; a turn boundary or ordinary feedback is not a pause. To remove an unresolved paused attempt from Current Work, close it historically as `blocked`. Close as historical `blocked` only from a paused Current Slice; close as `abandoned` only with explicit authority and a reason; close as `completed` only after required Evidence and applicable Checkpoints are settled.

### Direct Start

When an immediately authorized outcome does not need Future Work ordering or recovery, `slice start-direct` may create a detailed Current Slice without consuming or changing any Future Work item:

```markdown
#### S-001 — Immediate outcome

State: in_progress
Intended result:
- The immediate accepted outcome.
Authority source:
- The request or approval covering this Slice.
Scope:
- The permitted work boundary.
Expected evidence:
- The evidence required before closure.
Stop condition:
- The condition requiring pause or return for direction.
Starting state:
- The relevant starting code or artifact state.
```

Direct start requires the same authority and write-ahead contract as proposal start. Its title must not conflict with a Future Work item; if a proposal should be selected, use proposal start instead.

## Future Work

Future Work is one ordered mixed sequence of proposed Slices and non-terminal Checkpoints. Order recommends a sequence; it is not fixed execution order or authority.

All Future Work titles are unique across both kinds of item. A proposed item may be edited, reordered, or removed. A proposed item has no authority and cannot be selected merely because it exists.

### Proposed Slice

```markdown
### Slice — <unique title>

State: proposed
Type: learning
Intended result:
- The candidate outcome.
Expected evidence:
- The evidence that would settle it.
Dependencies:
- A prerequisite or ordering constraint.
```

Required:

- unique title in the heading;
- `State: proposed`;
- `Intended result`.

Optional:

- `Type: learning | delivery | deepening`;
- `Expected evidence`;
- `Dependencies`.

Starting removes this block from Future Work and creates a detailed Current Slice with a new `S-NNN`. The start operation must resolve any Checkpoint `Applies to` reference that named this proposed Slice.

### Checkpoint

A Checkpoint belongs to one Slice. Its state is explicit even though its storage location remains Future Work until terminal:

```text
proposed -> pending <-> deferred
pending | deferred -> completed | cancelled | replaced
```

A proposed Checkpoint has no ID:

```markdown
### Checkpoint — <unique title>

State: proposed
Type: independent_review
Condition:
- The boundary that must be crossed or assessed.
Applies to: <proposed Slice title>
```

Required fields:

- unique title;
- `State: proposed | pending | deferred`;
- `Type: independent_review | local_commit | user_decision | continuity`;
- `Condition`;
- `Applies to`.

`Applies to` uses the exact proposed Slice title until that Slice receives an ID, then becomes `S-NNN`. A task-wide Checkpoint is not part of this format; use a Slice that owns the continuity boundary.

When the Checkpoint becomes accepted, activation requires explicit selection or authority, assigns `C-NNN`, and changes its state to `pending`. A proposal or recommendation is not acceptance. `pending` means the obligation is due and dependent work must not cross it. `deferred` means it remains accepted but dormant until its condition. An accepted Checkpoint cannot be removed by direct editing and cannot leave Future Work except through a lifecycle command.

A proposed Checkpoint can be removed without History. A pending or deferred Checkpoint cannot be silently dropped. A Slice cannot close while an applicable Checkpoint is pending or deferred; resolve it first or keep the Slice current/paused.

## History

History always has these subsections in this order:

```markdown
## History

### Decisions

### Checkpoints

### Slices
```

History is append-oriented, not strictly immutable: lifecycle commands may change an active Decision to a terminal state or move a current Slice/Checkpoint into History. Terminal content is never silently deleted, reactivated, or replaced. A clerical correction appends a correction record without erasing the prior value.

### Decisions

Decisions are accepted choices, not tentative hypotheses. Add one with a script-assigned `D-NNN`:

```markdown
#### D-001 — Keep the Markdown record canonical

State: active
Decision:
- `record.md` remains the canonical task projection.
Established by:
- The user’s accepted direction.
Rationale:
- Agents need a readable selective recovery surface.
Source references:
- file:...#...
Consequences:
- Views can project one record without duplicating state.
Revisit when:
- The storage boundary changes.
```

Fields:

- `State: active | superseded | retired` — required;
- `Decision` — required;
- `Established by` — required;
- `Rationale` — required;
- `Consequences` — required;
- `Revisit when` — required;
- `Source references` — optional;
- `Superseded by: D-NNN` — required when `superseded`;
- `Retired because` — required when `retired`.

Lifecycle:

```text
active -> superseded | retired
```

A clerical clarification may edit an active Decision directly without changing its meaning. A material change creates a new Decision and supersedes the old one. The old Decision names the replacement. Terminal Decisions are never reactivated; adopting an old choice again creates a new active Decision.

### Checkpoints

Only terminal Checkpoints appear in History:

```markdown
#### C-001 — Review the compatibility boundary

State: completed
Type: independent_review
Condition:
- Review the integrated result before dependent work proceeds.
Applies to: S-001
Result:
- Review completed; one non-blocking concern remains outside this Slice.
Evidence:
- review:compatibility-review
Task effect:
- The Slice may proceed.
```

Required terminal fields:

- `State: completed | cancelled | replaced`;
- `Type`;
- `Condition`;
- `Applies to`;
- `Result`;
- `Task effect`.

Conditional or optional fields:

- `Evidence` — required when the result depends on an observation or review;
- `Reason` — required when `cancelled` or `replaced`;
- `Replaced by: C-NNN` — required when `replaced`.

`completed` means the boundary occurred, not that its judgment was favorable. A failed or blocking review is a completed Checkpoint whose Result records the adverse judgment and effect.

### Historical Slices

Closure compacts the Current Slice and its Material updates into one historical entry:

```markdown
#### S-001 — Implement the compatibility layer

State: completed
Type: delivery
Intended result:
- Existing clients remain compatible.
Authority source:
- User request in the current conversation.
Result:
- The adapter was updated and the accepted behavior was verified locally.
Evidence and limits:
- Focused integration checks passed; production behavior was not observed.
Task effect:
- The next consumer can be migrated.
```

Required historical fields:

- `State: completed | blocked | abandoned`;
- `Intended result`;
- `Result`;
- `Evidence and limits`;
- `Task effect`.

Optional or conditional fields:

- `Type: learning | delivery | deepening`;
- `Authority source`;
- `Reopened from: S-NNN`;
- `Resume when` — required when `blocked`;
- `Reason` — required when `abandoned`;
- `Residual effects` — useful when abandonment or rollback leaves consequences.

A historical `blocked` Slice is the unresolved parked attempt that left Current Work. A historical `completed` Slice may be reopened only when later authorized work still belongs to the same original outcome. An abandoned outcome is normally followed by a new proposed Slice.

Before a `completed` result is accepted, every material completion claim must have supporting Evidence at its required boundary, the live state must not contradict the result, no authority conflict or material contradiction may remain unresolved, and all applicable Checkpoints must be terminal. These are semantic judgments for the agent; the command can enforce only structural preconditions.

Reopening creates a new Current Slice with a new ID and fresh:

- authority;
- scope;
- expected evidence;
- stop condition;
- starting state.

It adds `Reopened from: S-old` and leaves the historical entry unchanged. A Current paused Slice is resumed; historical work is reopened. These are different transitions.

### Historical Corrections

A correction does not replace an old value silently. Append this optional block inside the affected historical Decision, Checkpoint, or Slice:

```markdown
##### Corrections

- Field: Result; before: local checks passed; after: local checks passed but production remains unobserved; reason: clerical clarification; source: file:verification.md#production-boundary
```

A correction may change a displayed clerical value, but it cannot change the entity’s lifecycle state, erase prior meaning, settle a new Decision, or authorize work.

## Notes

Notes have no field schema. Everything after `## Notes` is retained ordinary Markdown:

```markdown
## Notes

The user prefers compact records and low-ceremony transitions.

This note is inert context, not an instruction or authority source.
```

Append or edit Notes directly. Remove a user-authored Note only on request; remove other Notes only when authorized maintenance clearly covers the correction. Do not use Notes as overflow History. If content affects scope, priority, completion, blockers, evidence, or the next action, move it to its structured owner.

## Task State

The header uses:

```text
active <-> paused
active | paused -> completed | abandoned
completed | abandoned -> active only by explicit user reopening
```

Only the user changes task state. A task-level `paused` state pauses its Current Slice first when one exists; reactivating the task does not automatically resume that Slice. A terminal task has no Current Slice and no pending or deferred Checkpoint. Proposed Future Work may remain only when it is clearly retained as non-obligating future material; otherwise reconcile or remove it before the terminal transition.

Task completion is not implied by a completed Slice. A task-level terminal transition does not select another Slice.

## Direct Edits And Lifecycle Commands

Direct edits are appropriate for:

- bullets in Current Context;
- allowed prose and optional fields in Future Work, Current Work, and active History blocks;
- proposed-item ordering or removal;
- Next useful action;
- appending Material updates;
- Notes;
- the defined correction block.

Use lifecycle commands for:

- initialization;
- creating proposed Slices or Checkpoints;
- assigning `S-NNN`, `C-NNN`, or `D-NNN`;
- moving a Slice between Future Work, Current Work, and History;
- changing Slice, Checkpoint, Decision, or task state;
- converting a proposed-title reference to `S-NNN`;
- creating a linked continuation Slice;
- atomically superseding a Decision.

A direct edit must not change a durable ID, lifecycle state, entity kind, or owning top-level section. It must not reactivate, silently delete, or replace terminal History. Unknown fields and invented headings are invalid inside structured blocks.

Prose-only bullet edits need no extra validation. After changing headings, fields, references, or other structured blocks, run `validate` before consequential work. Every lifecycle command validates both its source and candidate.

The lifecycle executable is [working-record.mjs](../scripts/working-record.mjs). Its grouped command help is the transport contract for the operations described here; it accepts agent-authored Markdown fragments and does not replace this format reference.

## View Contract

The canonical file is Markdown. Both public views render its content as human-readable text rather than JSON. `full` preserves the complete Markdown content and order; a host may render it visually. Neither view follows external pointers or mutates the record.

### `resume`

`resume` contains:

1. record name, Schema, and task State;
2. all seven Current Context headings and their bullets;
3. active Decisions derived from History/Decisions, without duplicating them in Current Context;
4. complete Current Work;
5. all Future Work in stored order, including proposed, pending, and deferred items;
6. all Notes.

It omits terminal History entries. Use it for normal continuation and recovery after context loss, compaction, session navigation, handoff, intentional pause, or uncertain continuity.

### `full`

`full` contains the entire canonical record in order:

1. header;
2. Current Context;
3. Current Work;
4. Future Work;
5. History with Decisions, Checkpoints, and Slices in that order;
6. Notes.

Use it for audit, dispute, migration, malformed-record inspection, or when `resume` is insufficient. Do not use it merely to find the next action.

## Legacy Records

A record with another schema version is not a Schema 4 record. Do not reinterpret or directly mutate it as Schema 4. Inspect it read-only, preserve its original source, and use a separately authorized migration operation that can report any unmapped or ambiguous content.
