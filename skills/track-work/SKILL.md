---
name: track-work
description: Use when deciding whether proposed or ongoing work needs durable task memory, or when creating, resuming, and maintaining a Working Record through precise deterministic views and transitions.
---

# Track Work

Use Track Work when forgetting decisions, evidence, authority, proposed outcomes, the current slice, or the next action could misalign later work. It owns living task memory. It does not own discussion, implementation authority, semantic truth, review adjudication, or task completion.

A Working Record is memory, not authority. User decisions, live evidence, repository instructions, and accepted source truth override stale record content.

## Track Only When Continuity Matters

Use a Working Record when:

- work spans turns, context loss, pause, or ownership transfer;
- decisions, evidence, blockers, or authority need durable recovery;
- one outcome may contain several implementation, verification, review, or correction iterations;
- detailed future outcomes need to remain ordered and visible without becoming authorized work.

Do not create one for a short discussion or disposable local action when forgetting it would not risk misalignment. Ask before initialization when continuity value or task ownership is unclear.

Use one ignored local directory per task:

```text
.freeflow/tasks/task-NNN-<short-name>/record.md
```

Everything under `.freeflow/tasks/**`, including task-local Specs and Plans, is local memory. Write Spec or Write Plan separately owns promotion to tracked documentation. Track Work never stages, commits, publishes, or synchronizes duplicates.

## Store Each Fact Once

Schema-v2 `record.md` is readable Markdown and the only canonical task state:

1. task header and user-owned task state;
2. Current Context;
3. Current Work with at most one Current Slice;
4. detailed unselected Proposed Slices;
5. compact History of decisions, selected checkpoints, and settled slices;
6. inert Notes.

Current Context is present state, not a transcript. Keep the goal, source pointers, settled understanding, tentative hypotheses, route-changing open questions, current direction, and boundaries. Replace stale summaries instead of appending events. Active-decision references in views are derived from their historical owners; do not store a second summary.

Current Work owns the route, one rich Current Slice or `None`, task blockers, selected upcoming boundaries, and one next useful action. History owns settled outcomes and never owns the current next action. Notes do not authorize, prioritize, block, prove, or require follow-up.

Render only applicable state. Do not preserve empty lifecycle fields, copy accepted Specs or Plans, duplicate detailed evidence, or restate one fact across Context, Current Work, decisions, and History. Point to the canonical owner.

Only the user changes task state: `Active`, `Paused`, `Completed`, or `Abandoned`. A Paused task may retain its reconciled slice but rejects `start` and `resume`. Completed and Abandoned tasks require `Current Slice: None`.

## Persist Discussion Without Changing Its Route

Discuss owns exploration, alternatives, assumptions, and direction. Track Work persists material state and returns to Discuss:

```text
Discuss -> material state change -> Track Work update -> Discuss
```

A record update does not end discussion, select a proposal, start execution, create a checkpoint, or authorize work. Routine maintenance may preserve an accepted decision, changed understanding, detailed proposal, question, evidence pointer, blocker, or explicitly retained Note when the record is already approved.

## Move One Outcome Through Its Lifecycle

A slice is one coherent Learning, Delivery, or Deepening result. Keep plan steps, implementation milestones, tests, verification, selected review, accepted corrections, focused follow-up, required documentation, and local commits inside it while the intended result, authority boundary, and evidence boundary remain the same.

A Proposed Slice may contain plan-quality detail when the ordered proposal queue replaces a separate implementation Plan. It remains unnumbered, has no execution state, and carries no authority. Select it only when execution is explicitly authorized.

Selection moves one proposal into Current Work and assigns its `S-` ID. Do not retain a duplicate proposal. Keep the Current Slice rich enough to survive compaction: authority, reason and scope, expected evidence, stop condition, dependencies, live state, material extensions, blockers, and pending boundaries when applicable.

Use a new slice only for a distinct intended result, authority boundary, evidence boundary, independently useful outcome, or explicit abandonment of the original result. Reconcile accepted scope, evidence, or stop-condition changes before continuing the same slice.

Closure means settlement, not merely finished code or green tests:

- `Completed` requires the intended result, evidence boundary, supported self-review, selected checkpoints, accepted corrections, and required in-scope work to be settled;
- historical `Blocked` deliberately parks a blocked attempt while preserving its unresolved blocker and required resolution;
- `Abandoned` requires explicit authority, reason, residual effects, and useful evidence without implying success.

Closing compacts the rich Current Slice into an outcome-focused historical entry. Preserve the intended result, outcome, strongest evidence and proof limits, material review conclusion, and task effect. Do not retain temporary active fields or a full reopen snapshot.

Reopen a historical slice only when later authorized work still belongs to its original outcome. Keep the same ID, derive stable identity and outcome facts from compact history, and supply fresh authority, reason and scope, expected evidence, and stop condition. Preserve prior outcomes through compact reopen events rather than nested slice copies. Use `resume` only for a currently Blocked slice.

Do not invent `Completed pending review`, review slices, correction slices, or automatic next slices.

## Read Through Purpose-Owned Views

After compaction, summarization, clear, resume, or session navigation:

1. run `view --view resume`;
2. compare the confirmed projection with the conversation and live repository;
3. retrieve an exact entity only when rationale, chronology, supersession, authority, or evidence is material;
4. return to the owning route.

Operational views are:

- `resume`: recover complete active state after context loss;
- `discuss`: decide from current context, detailed proposals, and only a Current Slice summary;
- `execute`: act from the full Current Slice and only the context required for that outcome.

Retrieval views are:

- `recent`: inspect bounded recent outcomes;
- `entity`: inspect one exact proposal, slice, decision, checkpoint, or Note;
- `full`: audit the complete record.

There are no public `current` or `work` storage-section views. Successful views emit direct Markdown text with confirmed task identity and SHA metadata, not JSON-wrapped text. Do not normally read complete history.

## Edit Through The Deterministic Boundary

The executable entrypoint is:

```text
skills/track-work/scripts/working-record.mjs
```

The user and model own task meaning, authority, slice judgment, evidence interpretation, review selection, settlement, and task-state direction. The script owns schema structure, precise edits, views, IDs, timestamps, legal mechanical transitions, hashes, locks, validation, and atomic persistence. It cannot establish semantic truth.

Use `schema --command <name>` before an unfamiliar mutation. It is the mechanical source for accepted fields, target selectors, operation shapes, conditional state, and examples. Do not inspect implementation modules or guess an input shape.

Mutations receive semantic JSON through `--input <json-file>` or `--input -`. Existing-record mutations require the exact current SHA-256 from a confirmed text view or prior confirmed result.

Use `update` as a safer semantic editor, not a whole-record form. Target only the affected field, exact text, list member, entity, or ordering relation. Batch related edits atomically. Unspecified state must remain unchanged. Whole-object or whole-collection replacement must be explicit. Wrong types, ambiguous selectors, non-unique text matches, and unsupported operations must fail rather than coerce or partially write.

### Command Jobs

- `init`: create the next ignored task directory and minimal record.
- `view`: render `resume`, `discuss`, `execute`, `recent`, `entity`, or `full` as text without mutation.
- `schema`: expose the exact structured input contract without mutation.
- `update`: apply precise current-state, decision, proposal, Note, Current Slice, or explicit task-state edits without starting or settling a slice.
- `start`: move one authorized proposal or direct result into exactly one Current Slice.
- `block`: record why continuation is unsafe and what resolution is required.
- `resume`: continue the same currently Blocked slice after its blocker is resolved.
- `reopen`: return an authorized historical outcome to Current Work with the same ID and fresh active declarations.
- `close`: compact and settle one Current Slice as Completed, historical Blocked, or Abandoned.
- `validate`: report deterministic structural validity, not readiness.
- `inspect`: report sizes, duplication, legacy facts, advisory smells, and exact legacy/unsupported `sourceUnits` without fixing them.
- `migrate`: start from `inspect.sourceUnits`, copy each unit's ID, byte boundaries, hash, kind, and line into coverage, then explicitly convert legacy representation without hidden semantic compression.
- `compress`: explicitly compact a declared v2 scope while preserving protected state and recoverable source evidence.

Successful views return text. Other commands return compact structured results with confirmation state, before/after identity when applicable, and changed semantic paths rather than unchanged record content. Treat `candidate` and `unavailable` metadata as unconfirmed.

## Fail Without Guessing

The script fails closed before atomic rename. A failed, dry-run, read-only, or no-op operation does not consume IDs or change record bytes, SHA, or `Last updated`.

After a committed-but-unconfirmed result:

1. discard every held SHA;
2. fresh-read the actual path;
3. run `validate` and `inspect` when available;
4. establish a confirmed task projection;
5. only then discuss or mutate again.

When a record is malformed or legacy, inspect it read-only. Do not guess repair, force-write, use a stale SHA, or bypass the script after failure. Human manual editing remains possible; obtain a fresh confirmed view before the next scripted mutation.

## Route From The Result

- unchanged discussion state: return to Discuss or wait;
- material accepted memory: update, then return to its owning route;
- authorized execution: start, then Execute Work;
- unavailable continuation: block and stop;
- resolved current blocker: resume, then Execute Work;
- prematurely settled historical outcome: reopen with authority and fresh declarations;
- settled outcome: close, reconcile current state, and return to Workflow;
- malformed, stale, or conflicting state: preserve evidence and return to Workflow or Discuss;
- implementation: Execute Work;
- lifecycle or authority: Workflow;
- point-in-time transfer: Handoff.

Track Work ends when the record accurately preserves supported state and one next useful action. It does not claim implementation, review, migration, behavioral effectiveness, commit, release, or publication is complete.
