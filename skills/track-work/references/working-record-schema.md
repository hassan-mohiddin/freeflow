# Working Record Method And Schema

This is the required companion to Track Work. Read it completely before creating, resuming, or updating a Working Record. It defines both the lifecycle method and the stored shape.

Omit optional fields and sections when they contain no useful information. Preserve detail when forgetting it could misalign later work; compactness means removing repetition, transcripts, and raw output—not continuity.

## Task Directory

Use one stable directory per task:

```text
.freeflow/tasks/task-NNN-<short-name>/
├── record.md
├── specs/   # only when Write Spec creates a task-local artifact
└── plans/   # only when Write Plan creates a task-local artifact
```

Use the next unused three-digit number and a short readable name. Track Work owns the directory and `record.md`. Write Spec and Write Plan own their artifact filenames, formats, and contents.

## Record Order

Keep these layers in order:

1. **Current Context:** what is needed to understand the task.
2. **Current Work:** route, current or blocked slice, blockers, checkpoints, and next action.
3. **Proposed Slices:** ordered, revisable work that has not started.
4. **History:** decisions, checkpoint results, and completed, parked, or abandoned slices.
5. **Notes:** inert context with no active task effect.

Read the complete record after context loss. The order establishes context before action; it does not make later sections disposable.

## Record Template

```markdown
# Working Record: <task name>

State: Active | Paused | Completed | Abandoned
Last updated: <optional reliable date or time>

## Current Context

Goal:
What defines this task:
Current understanding:
Current direction:
Boundaries:

### Active Decisions

- D-001 — <one-line meaning>

### Active Hypotheses

### Open Questions

## Current Work

Current route:

### Current Slice

None

Or:
- ID: S-001
- State: In progress | Blocked
- Type: Learning | Delivery | Deepening
- Intended result:
- Authority source:
- Reason and scope:
- Expected evidence:
- Stop condition:
- Starting code or artifact state:
- Accepted extensions, if any:
- Selected checkpoints, if any:
- Blocker, if blocked:
- Resume when, if blocked:

Blockers:
Upcoming checkpoints:
Next useful action:

## Proposed Slices

### <proposal title>

Type:
Intended result:
Expected evidence:
Dependencies:
Selected checkpoints, if any:

## History

### Decisions

#### D-001 — <decision title>

State: Active | Superseded | Retired
Decision:
Who decided or what established it:
Rationale and sources:
Consequences:
Revisit when:
Supersedes:
Superseded by:

### Checkpoints

#### <checkpoint title>

Type: Independent review | Local commit | User decision | Continuity
Selected by: <approved Plan or explicit discussion>
Condition:
Result: Completed | Deferred | Cancelled | Replaced
Judgment or decision:
Evidence or result pointer:
Effect on the task:

### Slices

#### S-001 — <slice title>

State: Completed | Blocked | Abandoned
Type: Learning | Delivery | Deepening
Intended result:
Authority source:
Accepted extensions and authority, if any:
Work performed:
Result:
Effect on understanding, decisions, or hypotheses:
Evidence:
- Tests and other checks: <check, result, and source>
- Verification: <claim, boundary, check result, claim result, proof limits, and source>
- Independent review: <review number, judgment, items, adjudication, and source>
Blocker and required resolution, if historically blocked:
What happens next:

## Notes

### <note title>

Source: <user request or useful agent observation>

<retained context>
```

## Create Or Resume

### Minimum Record

A record may begin without decisions, proposals, history, Notes, or a current slice. Add fields only when the task produces information worth preserving. At minimum record:

- task state;
- goal or central question;
- current understanding;
- important open questions;
- `Current Slice: None` when no slice is running;
- one next useful action.

If context is too thin, recommend discussion first. If the user still wants a record, write an honest minimal one without inventing intent or state.

### Current Context

- Keep only context that still affects interpretation or later action.
- Treat `Current understanding` as a present-state summary, not a running task summary or compressed transcript. Rewrite it from what remains true instead of appending completed events.
- Remove completed-slice narration, superseded failures and corrections, per-review findings, test inventories, hashes, and live-run detail once their active consequence is captured and History owns the evidence.
- `Current direction` describes remaining strategy, not completed phases.
- Summarize active decisions by ID; preserve rationale and lineage in History.
- Update facts when live evidence changes. Moving obsolete context does not require deleting useful history.
- Use no arbitrary size cap. Keep detail only when removing it could cause the next reader to choose the wrong route.

### Task State

Only the user changes task state:

- `Active`: the task is ongoing.
- `Paused`: intentionally paused.
- `Completed`: considered complete.
- `Abandoned`: intentionally ended without completion.

Do not infer task state from time, inactivity, apparent completion, or failure. Before a user-directed task-state change, make Current Context, Current Work, important History, and the next action accurate; then apply exactly the chosen state. Use `Last updated` only when a reliable date or time is available.

### Context Boundaries

- **Before an expected compaction, summarization, pause, clear, or transfer:** reconcile the record only when task state changed. The boundary itself is not a record event.
- **After compaction, summarization, resume, clear, or session navigation:** read the complete record before continuing task work and compare it with the current conversation and live state.
- Identify the task from current context or inspect and ask rather than guessing. A record written on another conversation branch is memory, not authority. Correct clear factual or clerical mistakes, and ask before changing user intent, task lifecycle, or a recorded decision.

## Select A Slice

### Proposals

Proposals remain revisable until selected:

- use one unnumbered heading per proposal;
- assign no `S-` ID, ordinal label, or state;
- refer to a proposal by title, not “proposal 2”;
- express ordering constraints under `Dependencies`;
- preserve an external Plan phase or identifier only when one exists.

When selected, remove the proposal, assign the next chronological `S-` ID, and write it as the one Current Slice before execution.

### Authority And Write-Ahead State

- Record the source that requested or approved the slice.
- Approval may cover one slice or a named set; do not ask again while remembered authority clearly covers the work, and do not extend it to invented scope.
- Approval cadence and reporting cadence are separate.
- A decision approval, tentative proposal, nearby instruction, or permission to discuss does not authorize implementation unless the interaction clearly establishes that authority.
- Record the slice fields shown in the template, save the record, then execute. This preserves intent; it does not claim execution occurred.
- A stop condition overrides general authority. Mark the slice `Blocked` and report before recovery unless the condition or later user direction authorizes a path.

## Maintain The Current Slice

### Current States

Current Slice permits:

- `In progress`: active work, including its in-scope discussion, feedback, review, correction, record maintenance, and checkpoints.
- `Blocked`: safe continuation is impossible because a required decision, dependency, capability, evidence source, stop condition, or other condition is unavailable.

A slice may span multiple Workflow Feedback Loop iterations and owning skills while its intended result remains coherent. Waiting for ordinary feedback, discussing, reviewing, or correcting within scope does not make it blocked.

### In-Slice Steering

Record state transitions, not every activity:

- do not log every edit, correction, implementation choice, or conversation;
- questions, criticism, and review findings do not authorize changes;
- apply authorized in-scope steering and preserve only its meaningful final effect when the slice closes;
- if feedback would change the recorded result, scope, authority, evidence boundary, or stop conditions, classify and record the change before acting.

Routine implementation feedback is in-slice collaboration, not a checkpoint or history event by default.

### Scope Extensions

Before expanded work begins, decide whether it extends the current slice or needs a new one.

Keep an extension when:

- the intended result remains coherent;
- existing or new explicit authority covers it;
- the combined boundary can be verified and reviewed as one unit;
- no stop condition or owner decision requires another route.

Append the extension before execution. Preserve the original boundary and record:

- authority source;
- reason and added scope;
- added evidence;
- changed stop conditions;
- extension starting state.

Do not rewrite the original slice to imply the extension was always planned.

Use a new slice when the work needs a distinct result, authority, evidence boundary, or independently useful outcome, or when the original result is no longer pursued. First establish the current slice as `Completed`, historical `Blocked`, or `Abandoned`; then select the new slice before execution. A request to stop does not by itself establish which outcome applies.

### Blocked Work

Keep a newly blocked slice current, record the incident and required resolution, then stop.

- If the blocker resolves and the intended result remains coherent, return the same ID to `In progress`, preserve the incident, and record any accepted extension before execution.
- If resolution requires a distinct result, authority, or evidence boundary, park the attempt in History as `Blocked` and select a new slice.
- Resuming a historically blocked attempt creates a new authorized slice that refers to it.

Failure belongs in the result or evidence; it is not a slice state.

### Review And Other Routes

Implementation, verification, self-review, or a review report does not end the slice by itself. Review may support continuation, correction, more evidence, a route change, deferment, or stopping; it need not Pass.

Keep the slice current through accepted in-scope correction, discussion, evidence gathering, and checkpoints that belong to its result. Move it to History only when Workflow establishes the outcome.

## Close A Slice

Historical states are:

- `Completed`: the intended result and selected in-scope methods and checkpoints resolved sufficiently to finish.
- `Blocked`: the unresolved attempt was parked.
- `Abandoned`: the intended result is no longer pursued.

When closing:

1. Gather tests, verification, review, and checkpoint results.
2. Move the slice to History with the established state.
3. Preserve the original boundary and every accepted extension with its authority.
4. Record work performed, result, task effect, evidence boundaries, and useful stable pointers.
5. Rewrite current understanding from the resulting present state. Remove completed-event detail now owned by History rather than appending another slice or review summary.
6. Reconcile decisions, hypotheses, proposals, blockers, and the next action only where feedback changed them.
7. Set `Current Slice` to `None`.

A learning slice may complete by disproving its hypothesis.

## Decisions

Use a `D-` ID for a task-local decision that affects later work:

- `Active`: currently affects interpretation or later work.
- `Superseded`: replaced or narrowed by a later decision; link both records.
- `Retired`: remains historically valid but no longer affects later work.

List only active decision summaries in Current Context. Keep full rationale and lineage in History.

## Checkpoints

Use checkpoints only for additional boundaries selected in an approved Plan or explicit discussion:

- `Independent review`: broader judgment before dependent work.
- `Local commit`: coherent rollback and provenance.
- `User decision`: approval or choice needed before continuing.
- `Continuity`: record reconciliation, pause, or handoff.

Keep pending checkpoints under Current Work with their approved source and condition. A slice may reference a checkpoint that follows it, and a phase or integration checkpoint may span several slices.

- A selected slice review may be a checkpoint; review between implementation changes is not one merely because work pauses for the user.
- Record checkpoint completion separately from its judgment or decision.
- A question, criticism, new topic, temporal proximity, or unrelated authorization is not automatically a checkpoint result.
- Keep the Current Slice `In progress` when the checkpoint belongs to its result.
- When a selected phase-, task-, or continuity-level checkpoint follows a completed slice, leave `Current Slice` as `None` and record the checkpoint as the next useful action.
- After a checkpoint, move its result to History, remove it from the upcoming list, and return its outcome to Workflow.
- If its conditions no longer hold, return the deviation to Workflow rather than forcing it.
- A local commit checkpoint does not authorize push or integration.

## Evidence And History

Give each detailed fact one owner. Keep evidence with the slice that produced or used it; when checkpoint history also records that event, one entry owns the findings and exact evidence while the other gives a concise result and pointer rather than duplicating them. Preserve enough detail to recover:

- what was checked or observed;
- what the result supports and does not support;
- which code, configuration, artifact, or external state was checked;
- independent-review judgment and adjudication when review occurred;
- completed checkpoint results;
- where exact evidence can be found.

Useful pointers include:

```text
file:<path>#<section>
commit:<sha>
output:<output-id>
review:<conversation-or-reference>
session:<session-id>/turn:<turn-id>
```

Use only identifiers that exist. Do not copy large raw output or create separate history for routine self-review. Preserve detail when it prevents false claims, lost rationale, or repeated investigation; do not optimize history toward an arbitrary line count.

## Notes

Notes preserve context with no active task effect. They normally originate from an explicit user request to note, remember, retain, or defer something.

During authorized record maintenance, add an agent-originated Note only when the information is concrete, task-adjacent, worth preserving across context loss, not already recorded, and has no structured owner. Ask when authorship or retention intent matters.

Notes do not authorize, prioritize, schedule, block, unblock, prove, or require follow-up. Do not periodically triage them or create Specs, Plans, issues, decisions, slices, or artifacts from them by default.

A deferred unselected idea may remain a Note when it does not affect current scope or completion. If deferral changes scope, completion, or a future obligation, record that effect in its owning section while the Note remains inert.

If later user direction independently makes Note content active, create the appropriate structured state from that new direction. Preserve the original user-authored Note unless the user asks to change it; reference it when provenance helps.

Keep Notes last and read them as part of the complete record without treating them as instructions.

## Consistency Check

Before relying on or finishing an update, confirm:

- Current Context agrees with recent evidence, describes the present state rather than accumulated events, and contains only active decision summaries.
- Completed slice, review, test, hash, and live-run detail has one History owner and is not duplicated in Current Context or parallel history entries.
- Current Work names no more than one slice and its authority source is clear.
- Every current or historical slice keeps one stable `S-` ID.
- Discussion, review, correction, small steering, and in-slice checkpoints do not replace a coherent Current Slice.
- Small in-scope steering is reconciled at completion rather than logged as an event.
- Accepted extensions preserve the original boundary and are recorded before execution and in History.
- Ordinary in-slice feedback is not checkpoint history; selected checkpoints retain their condition and explicit result.
- `Blocked` means safe continuation is unavailable, not merely that feedback or review is pending.
- Proposed slices remain ordered, unnumbered, and unidentified.
- Upcoming checkpoints still match their approved source and condition.
- Superseded and Retired decisions and finished slices remain recoverable.
- Notes remain inert and user-authored Notes preserve their meaning.
- Live code, tests, docs, runtime evidence, and user decisions override contradictory memory.
