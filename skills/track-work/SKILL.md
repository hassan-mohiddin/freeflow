---
name: track-work
description: Use when ongoing work needs durable task memory, or existing task memory must be created, recovered, reconciled, updated, or closed, so current understanding, active work, future outcomes, decisions, evidence, and the next action survive execution, feedback, pauses, or context loss.
---

# Track Work

Maintain living task memory without turning it into a transcript, fixed Plan, or authority over live evidence and user decisions.

A **Working Record** is ignored local Markdown that preserves current task state across execution, feedback, pauses, and context loss. A **Current Slice** is the durable representation of the active Slice when task memory is needed. A **Proposed Slice** is an unselected future Slice with no ID, execution state, or authority. `block`, `resume`, and `reopen` preserve one Slice's identity across different continuation conditions.

Track Work owns the Working Record and its lifecycle. It does not decide whether durable memory is needed, authorize implementation, settle product intent, judge review findings, complete the task, commit, publish, or promote local artifacts.

A Working Record is memory, not authority. Current user direction, live evidence, repository instructions, and accepted source truth override stale record content.

## Enter With A Record Need

Enter when [Workflow](../workflow/SKILL.md) routes a durable-memory need established by current context or [Discuss](../discuss/SKILL.md), the user explicitly requests a record operation, or an existing record needs recovery, reconciliation, or a lifecycle transition.

If record need, task ownership, or mutation authority is unresolved, return to Workflow or Discuss. Reading this skill never authorizes record creation or mutation.

Use one ignored local directory per task:

```text
.freeflow/tasks/task-NNN-<short-name>/record.md
```

Everything under `.freeflow/tasks/**` is local task memory. Track Work never stages, commits, publishes, promotes, or synchronizes it. [Write Spec](../write-spec/SKILL.md) and [Write Plan](../write-plan/SKILL.md) separately own tracked artifacts.

## Follow The Lifecycle

```text
Record need established
-> create or recover the record
-> reconcile memory with conversation and live evidence
-> preserve material state changes in their canonical owners
-> select one authorized outcome or wait
-> maintain one coherent Current Slice through feedback and checkpoints
-> settle the outcome and reconcile affected current state
-> return to Workflow or the owning route
```

Do not reduce this lifecycle to `start -> close`. Decisions, proposals, checkpoints, evidence, blockers, Notes, Current Context, and the next action remain part of record maintenance whenever their underlying state materially changes.

## Preserve One Living Record

Schema-v2 `record.md` is readable Markdown and the only canonical task state. Its semantic owners are:

1. **Current Context:** what remains necessary to understand the task now.
2. **Current Work:** route, one Current Slice or `None`, blockers, selected upcoming boundaries, and one next useful action.
3. **Proposed Slices:** ordered, revisable outcomes that have not started.
4. **History:** decision records, resolved checkpoint outcomes, and completed, parked, or abandoned Slices.
5. **Notes:** inert retained context with no active task effect.

Omit optional content when it carries no useful state. Preserve detail when forgetting it could cause a later reader to choose the wrong route. Compactness removes repetition, transcripts, and raw output—not continuity.

Give each detailed fact one owner. Other sections use a compact pointer or derived view rather than copying it.

Only the user changes task state: `Active`, `Paused`, `Completed`, or `Abandoned`. Paused tasks reject `start` and `resume`. Completed and Abandoned tasks require `Current Slice: None`.

## Create Or Recover

### Start Honestly

A minimal record contains:

- user-owned task state;
- goal or central question;
- supported current understanding;
- important route-changing open questions;
- `Current Slice: None` when no work is selected;
- one next useful action.

A record may begin without decisions, proposals, checkpoints, Notes, or a Current Slice. Do not invent content to fill sections.

If discussion already produced decisions, proposals, checkpoint selections, or explicitly retained Notes, create the minimal record and preserve those related facts in the first authorized atomic update before returning to Discuss or execution. Do not let `init` erase state that justified creating the record.

If context is too thin, return to Discuss. If the user still requests a record, create an honest minimal one and wait.

### Recover From Current Evidence

After compaction, summarization, clear, resume, session navigation, or ownership transfer:

1. run `view --view resume`;
2. confirm task identity, task state, Current Slice, route, next action, and record SHA;
3. compare memory with the current conversation and live repository or environment;
4. retrieve an exact entity only when its rationale, lineage, authority, chronology, or evidence affects the next decision;
5. reconcile only state contradicted or changed by supported current evidence;
6. return to the route that owns the next activity.

A record from another conversation branch is memory, not authority. Do not import branch-local approval merely because it is recorded.

Before an expected compaction, pause, clear, or transfer, reconcile the record only when material task state changed. The boundary itself is not an event, checkpoint result, or reason to append a status update.

## Maintain Current Context

Current Context is present state, not chronology:

- **Goal:** the durable outcome or central question.
- **What defines this task:** accepted source pointers or governing artifacts.
- **Settled:** supported understanding that still affects interpretation or action.
- **Tentative:** live hypotheses that remain provisional.
- **Open:** unresolved questions capable of changing the route.
- **Current direction:** remaining strategy, not completed phases.
- **Boundaries:** accepted scope, exclusions, evidence limits, and stop conditions that remain relevant.

Replace a summary when its meaning changes. Do not append update paragraphs, discussion turns, completed-Slice narration, test inventories, hashes, review findings, or live-run detail.

Decision rationale and lineage belong in History. Active decision summaries in views are derived from History; do not store a second decision summary in Current Context.

When a Slice settles, rewrite Current Context from what remains true. Remove event detail now owned by History while preserving consequences that still affect later work.

## Preserve Discussion Without Taking It Over

Discuss owns exploration, alternatives, assumptions, and direction:

```text
Discuss -> material accepted state -> Track Work update -> Discuss
```

Persist only supported changes that could affect later interpretation or action. One atomic update may reconcile related context, decisions, proposals, checkpoint selections, Notes, blockers, or next action.

A record update does not end discussion, authorize implementation, select a proposal, choose a checkpoint, settle a user-owned decision, or claim evidence or readiness. Return to Discuss after preservation unless Workflow established another route.

## Propose, Select, Or Wait

### Preserve Future Outcomes

Create a Proposed Slice when an unselected future outcome, evidence boundary, dependency, or ordering must survive context loss.

A proposal:

- remains unnumbered and has no execution state;
- carries no authority;
- names one Learning, Delivery, or Deepening result;
- states intended result and expected evidence;
- records real dependencies and selected checkpoints when they exist;
- remains revisable until selected.

Use exact proposal titles rather than ordinal references such as “proposal 2.” Preserve an external Plan phase or identifier only when one exists.

Do not create a proposal merely to start it immediately when one already-authorized direct result is clear and no future queue needs preservation. When several outcomes, dependencies, or ordering constraints matter, preserve them first and select one by exact title.

### Select With Write-Ahead Authority

Select a Slice only when its concrete work is requested or approved. If only record creation is approved, keep `Current Slice: None`, preserve proposals when needed, set the next useful action, and wait.

Before [Execute Work](../execute-work/SKILL.md) begins, record:

- assigned Slice ID and type;
- intended result;
- authority source;
- reason and scope;
- expected evidence;
- stop condition;
- relevant starting state;
- dependencies;
- selected checkpoints and pending boundaries.

Save this write-ahead state before execution. It preserves intent; it does not claim execution occurred.

Approval cadence and reporting cadence are separate. A decision approval, tentative proposal, nearby instruction, or permission to discuss does not authorize implementation.

## Maintain One Current Slice

### Keep The Outcome Coherent

Current Slice states are:

- `In progress`: active work, including in-scope discussion, implementation, feedback, verification, self-review, selected review, correction, and checkpoints.
- `Blocked`: safe continuation is unavailable because a required decision, dependency, capability, evidence source, stop condition, or other condition is missing.

Waiting for ordinary feedback, discussing, reviewing, correcting, or gathering in-scope evidence does not make a Slice Blocked.

Keep the same Slice while intended result, authority boundary, evidence boundary, and useful outcome remain coherent. Do not create activity-shaped Slices for implementation, tests, review, corrections, documentation, or commits that belong to the same result.

### Reconcile Steering And Extensions

Do not log every edit, command, implementation choice, correction, or conversation.

When feedback remains inside the accepted result and authority, apply it and preserve its meaningful final effect. When feedback changes intended result, scope, authority, evidence boundary, or stop condition, classify and record the change before acting.

Keep an extension in the Current Slice when the intended result remains coherent, current or new explicit authority covers it, the combined result can still be verified as one unit, and no stop condition or owner decision requires another route.

Record an accepted extension before execution with its authority source, reason and added scope, added evidence boundary, changed stop condition when applicable, and extension starting state. Preserve the original boundary; do not rewrite it to imply the extension was always planned.

Use a new Slice when work needs a distinct result, authority source, evidence boundary, independently useful outcome, or explicit abandonment of the original result. First settle or park the Current Slice; do not silently replace it.

Questions, criticism, review findings, and useful suggestions do not authorize changes.

### Block, Resume, Or Reopen

When safe continuation becomes unavailable:

1. keep the Current Slice current;
2. record what blocks continuation, why it is unsafe, and what resolution is required;
3. set the resume condition;
4. stop.

Use `resume` when that current blocker resolves and the same outcome remains coherent. Preserve the blocker incident and resolution source. A resolution that expands scope follows the extension rule before execution.

Park the Slice as historical `Blocked` only when the attempt is deliberately removed from Current Work while its blocker remains unresolved.

Use `reopen` when later authorized work still belongs to a historical Slice's original outcome. Reopening keeps the same ID, preserves prior outcomes through compact reopen history, and requires fresh authority, reason and scope, expected evidence, and stop condition.

Failure belongs in evidence or outcome; it is not itself a Slice state.

### Keep Review And Correction Inside The Result

Implementation, verification, self-review, or an independent review report does not settle the Slice by itself. Review may support continuation, correction, more evidence, deferment, a route change, or stopping; it need not Pass.

Keep accepted in-scope correction and its verification inside the Current Slice. Do not invent review or correction Slices.

## Preserve Record-Worthy Entities

### Decisions

Record a task-local Decision when an accepted choice affects later interpretation, implementation, acceptance, or recovery and losing its rationale could cause misalignment.

Preserve what was decided, who decided or what established it, rationale and sources, consequences, and a revisit condition when useful.

Decision states are:

- `Active`: currently affects later work;
- `Superseded`: replaced or narrowed by another decision, with reciprocal links;
- `Retired`: historically valid but no longer active.

Retire or supersede decisions through their lifecycle. Do not delete durable decision history. A changed understanding is not automatically a decision; a tentative direction remains Tentative until accepted.

### Checkpoints

A checkpoint is an additional boundary selected by Workflow from an approved Plan or explicit discussion before dependent work. Types are Independent review, Local commit, User decision, and Continuity.

Ordinary feedback, self-review, a nearby question, a status pause, or temporal proximity is not a checkpoint.

When a checkpoint is selected before or during a Slice:

1. use one stable single-line title;
2. add that exact title to the affected proposal or Current Slice's selected checkpoints;
3. add a compact upcoming entry under Current Work that preserves the title, selection source, and condition;
4. keep the Current Slice `In progress` while the checkpoint belongs to its result.

When the checkpoint reaches `Completed`, `Deferred`, `Cancelled`, or `Replaced`:

1. add one History checkpoint with the exact selected title;
2. preserve type, selected-by source, condition, terminal result, judgment or decision, evidence pointer, and task effect when applicable;
3. remove its upcoming Current Work entry in the same atomic update;
4. return its outcome to Workflow.

A Completed Slice cannot close until each selected checkpoint title has a terminal History checkpoint with the exact same title and all other pending boundaries are reconciled.

When a task-, phase-, or continuity-level checkpoint follows a settled Slice, leave `Current Slice: None`, keep the checkpoint as upcoming, and make it the next useful action. A Local commit checkpoint never authorizes push or integration.

### Evidence And History

Keep detailed evidence with the Slice or checkpoint that produced or used it. When two History entities refer to the same event, one owns the detailed findings and the other stores a concise result and pointer.

Preserve what was checked, what the result supports and does not support, which state or artifact was observed, selected independent-review judgment and adjudication, completed checkpoint results, and where exact evidence can be found.

Use only real pointers such as `file:<path>#<section>`, `commit:<sha>`, `output:<id>`, `review:<reference>`, or `session:<id>/turn:<id>`. Do not copy large raw output or create History for routine self-review.

### Notes

A Note preserves task-adjacent context with no active task effect. Add one when the user explicitly asks to note, remember, retain, or defer something that has no structured owner.

During authorized maintenance, add an agent-originated Note only when the information is concrete, worth preserving across context loss, not already represented, and has no effect on current scope, priority, completion, blockers, or next action. Ask when authorship or retention intent matters.

Notes do not authorize, prioritize, schedule, block, unblock, prove, or require follow-up. Do not periodically triage them or create decisions, Slices, Specs, Plans, issues, or artifacts from them by default.

If later user direction independently makes Note content active, create the appropriate structured state from that new direction. Preserve the original user-authored Note unless the user requests its change.

## Close And Reconcile

Historical Slice states are:

- `Completed`: the intended result and required in-scope methods, evidence, corrections, and checkpoints are settled;
- `Blocked`: the unresolved attempt was deliberately parked;
- `Abandoned`: the intended result is no longer pursued under explicit authority.

Before closing, obtain the Workflow-established outcome, gather strongest evidence and proof limits, resolve or deliberately route every selected checkpoint and pending boundary, confirm accepted corrections are verified, and confirm required in-scope work is settled.

When closing:

1. settle the Current Slice with its intended result, outcome, authority, accepted extensions, strongest evidence, review conclusion and task effect when applicable, and state-specific blocker or abandonment reason;
2. rewrite Current Context from what remains true;
3. reconcile decisions, tentative hypotheses, open questions, proposals, blockers, route, and next useful action only where the outcome changed them;
4. clear Current Work blockers that belonged to the settled Slice;
5. set `Current Slice: None`;
6. do not select or start another Slice automatically.

A Learning Slice may complete by disproving its hypothesis. A green test or finished implementation alone does not establish closure.

Before applying a user-directed task-state change, reconcile Current Context, Current Work, important History, and the next action; then apply exactly the chosen state.

## Read Through Purpose-Owned Views

After context loss, begin with `view --view resume`, compare the confirmed projection with conversation and live evidence, and retrieve an exact entity only when rationale, authority, chronology, supersession, or evidence is material.

- `resume`: complete active state needed to continue safely;
- `discuss`: Current Context, proposals, and a Current Slice summary;
- `execute`: the full Current Slice and only context needed for that outcome;
- `recent`: bounded recent settled Slices;
- `entity`: one exact proposal, Slice, Decision, checkpoint, or Note;
- `full`: complete record audit.

Views emit direct Markdown with task identity and SHA metadata. There are no public `current` or `work` storage-section views. Do not normally read complete History.

## Use The Deterministic Boundary

The executable entrypoint is:

```text
skills/track-work/scripts/working-record.mjs
```

This skill decides whether a Decision, proposal, checkpoint, Note, extension, or closure is semantically warranted. The command schema never makes that judgment; it only defines how to express the selected operation.

Once the semantic operation is selected, and before the first use of its mutation command in the active context, after context loss, or after any failed operation, run:

```text
node skills/track-work/scripts/working-record.mjs schema --command <name>
```

Use only the returned fields, selectors, operations, and conditional requirements. Do not inspect internal modules or reconstruct inputs from memory.

Supply semantic JSON with `--input <json-file>` or `--input -`. Existing-record mutations require the exact SHA-256 from a confirmed view or prior confirmed result.

Use `update` for precise state and entity edits. Choose one accepted input mode; do not mix `edits` with direct semantic fields. Within `edits`, use exactly one operation per field, entity, or collection edit and batch related edits for one atomic write. Use dedicated commands for Slice transitions and the direct Decision lifecycle form for Decision state transitions.

Wrong types, unknown fields, mixed forms, multiple operations, malformed titles, multiline list members, ambiguous selectors, and missing or non-unique text matches fail closed. `replaceText` compares normalized line endings and still requires one exact semantic match.

The command families are:

- `init`, `view`, `validate`, and `inspect` for creation and observation;
- `update` for precise context, work, proposal, Decision, checkpoint, Note, and task-state maintenance;
- `start`, `block`, `resume`, `reopen`, and `close` for Slice lifecycle;
- `unlock` for explicitly authorized stale-lock recovery;
- `migrate` and `compress` for explicit representation rewrites.

Dry runs validate the same candidate structure and round trip as applied operations but do not persist, create snapshots, consume IDs, or change timestamps. Structural validity never proves semantic truth, readiness, migration effectiveness, or task completion.

## Recover Without Guessing

A failed, dry-run, read-only, or no-op operation does not change record bytes, SHA, or `Last updated` and does not consume IDs.

After `committed-unconfirmed`, discard held SHAs, fresh-read the actual record, run `validate` and `inspect` when available, establish a confirmed projection, and only then discuss or mutate again.

Never delete a lock manually. Use `unlock` only after the script reports a stale lock, the user authorizes recovery, and the exact observed lock selectors are available. Live, malformed, changed, replaced, or concurrently removed locks fail closed. Recovery never confirms record content; fresh-read afterward.

Legacy and unsupported records remain read-only until explicit migration. Migration begins from exact `inspect.sourceUnits` and may not summarize, consolidate, drop, retitle, reorder, or move semantic entities to incompatible owners. Compression is a separate authorized operation with explicit scope and preservation declarations. Use each command's current schema; do not infer rewrite coverage.

For malformed, stale, locked, or conflicting state, preserve the exact evidence. Do not force-write, guess repair, bypass the script, silently change scope, or continue with a stale SHA.

## Check Consistency

Before relying on or finishing a record mutation, confirm:

- Current Context describes present state rather than accumulated events.
- Detailed facts have one canonical owner.
- Current Work names no more than one Slice with a clear authority source.
- Every current or historical Slice keeps one stable ID.
- Proposed Slices remain unnumbered, unselected, and ordered by real dependencies.
- Accepted extensions preserve the original boundary and were recorded before execution.
- Discussion, review, correction, and checkpoints did not replace a coherent Current Slice.
- `Blocked` means safe continuation is unavailable, not that feedback is pending.
- active Decisions remain recoverable through History and lifecycle links are consistent.
- upcoming checkpoints retain their selection source and condition.
- resolved checkpoint titles exactly match their selected references.
- Notes remain inert and user-authored Notes preserve their meaning.
- settled evidence and event detail are not duplicated in Current Context.
- one next useful action exists and belongs only to Current Work.
- live evidence and current user direction override contradictory memory.

Correct a clear clerical inconsistency inside current authority or return a material conflict to Workflow or Discuss. Do not force the next lifecycle transition.

## Return To The Owner

- unchanged discussion state: return to Discuss or wait;
- material accepted memory: update, then return to its owner;
- authorized execution: start, then Execute Work;
- unavailable continuation: block and stop;
- resolved current blocker: resume, then Execute Work;
- authorized continuation of a settled outcome: reopen;
- settled outcome: close, reconcile affected state, then return to Workflow;
- malformed, stale, locked, or conflicting state: preserve evidence and return to Workflow or Discuss;
- point-in-time transfer: [Handoff](../handoff/SKILL.md).

Track Work ends when the record accurately preserves supported state and one next useful action. It does not claim implementation, review, migration effectiveness, commit, release, or publication is complete.
