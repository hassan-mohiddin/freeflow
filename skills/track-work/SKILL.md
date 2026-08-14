---
name: track-work
description: Use when deciding whether proposed or ongoing work needs a durable Working Record, or when creating, resuming, and maintaining one through deterministic views and transitions.
---

# Track Work

Use Track Work when forgetting the task's decisions, evidence, authority, current slice, or next action could cause misalignment. It owns living task memory. It does not own discussion, implementation authority, semantic truth, review adjudication, or task completion.

A Working Record is memory, not authority. User decisions, live evidence, repository instructions, and accepted source truth win over a stale record.

## Decide Whether To Track

Track work when continuity has material value:

- the task spans turns, context loss, or ownership transfer;
- decisions, evidence, blockers, or authority need durable recovery;
- one outcome will contain several implementation, verification, review, or correction iterations;
- proposed future outcomes need to remain visible without becoming authorized work.

Do not create a record for a short discussion or disposable local action when forgetting it would not risk misalignment. Ask before creating one when continuity value or task ownership is unclear.

Use one local directory per task:

```text
.freeflow/tasks/task-NNN-<short-name>/record.md
```

Everything under `.freeflow/tasks/**`, including task-local Specs and Plans, is ignored local memory. Write Spec or Write Plan separately owns promotion to tracked documentation. Track Work never stages, commits, publishes, or synchronizes duplicates.

## One Canonical Record

Schema-v2 `record.md` remains readable Markdown and is the only canonical task state. It contains, in order:

1. header and user-owned task state;
2. Current Context;
3. Current Work and at most one Current Slice;
4. unselected Proposed Slices;
5. History of decisions, selected checkpoints, and settled slices;
6. inert Notes.

Current Context is present state, not a transcript. Keep Goal, source pointers, Settled understanding, Tentative hypotheses, route-changing Open questions, Current direction, Boundaries, and short active-decision summaries. Replace stale summaries instead of appending events.

Current Work owns the route, one current slice or `None`, blockers, selected upcoming boundaries, and one next useful action. History owns settled detail. Historical slices never own the current next action. Notes do not authorize, prioritize, block, prove, or require follow-up.

Only the user changes task state: `Active`, `Paused`, `Completed`, or `Abandoned`. A Paused task may retain its reconciled slice but rejects `start` and `resume`. Completed and Abandoned records must have `Current Slice: None`.

## Discuss And Track Work Compose

Discuss owns exploration, alternatives, assumptions, and direction. Track Work persists material state and returns to Discuss:

```text
Discuss -> material state change -> Track Work update -> Discuss
```

A record update does not end discussion, select a proposal, start work, create a review checkpoint, or change the owning route. Routine maintenance may preserve an accepted decision, changed understanding, proposal, question, evidence pointer, blocker, or explicitly retained Note when the record is already approved. It does not authorize implementation.

## Slices Are Outcomes

A slice is one coherent Learning, Delivery, or Deepening result. Keep implementation milestones, plan steps, tests, verification, reviews, accepted corrections, focused follow-up, required documentation, and local commits inside that slice while the result, authority boundary, and evidence boundary remain the same.

A proposal is an unselected, unnumbered candidate. It has no `S-` ID, execution state, or implied authority. Select it only at the last responsible moment when execution is explicitly authorized. Starting a slice records the authority source; the record does not create that authority.

Use a new slice only for a distinct intended result, authority boundary, evidence boundary, independently useful outcome, or explicit abandonment of the original result. If feedback changes scope, stop condition, evidence boundary, or intended result, reconcile the accepted extension before executing it.

Closure means settlement, not merely finished code or green tests:

- `Completed` requires the intended result, evidence boundary, supported self-review, selected review/checkpoint route, accepted corrections, and required in-scope work to be settled;
- historical `Blocked` deliberately parks a currently blocked attempt while preserving the unresolved blocker and required resolution;
- `Abandoned` requires explicit authority, reason, residual effects, and useful evidence without implying success.

Do not invent `Completed pending review`, review slices, correction slices, or automatic next slices.

## Read And Maintain Safely

After compaction, summarization, clear, resume, or session navigation:

1. run `view --view resume`;
2. compare its confirmed projection with the conversation and live repository;
3. retrieve an exact entity only when rationale, chronology, supersession, authority, or evidence is material;
4. return to the owning route.

Do not normally read or paste complete history. Use `discuss`, `execute`, `current`, and `work` views for bounded decisions. Use `recent`, `entity`, or `full` for audit and dispute.

When an existing record is malformed or legacy, inspect it read-only. Do not guess a repair or mutate it. Explicit migration is a separate boundary.

## Deterministic Script Boundary

The executable entrypoint is:

```text
skills/track-work/scripts/working-record.mjs
```

The user and model own task meaning, authority, slice judgment, evidence interpretation, review selection, settlement, task-state direction, and promotion. The script owns task numbering, schema parsing/rendering, bounded views, IDs, timestamps, allowed mechanical transitions, hashes, locks, validation, and atomic persistence. It cannot prove semantic truth.

Mutations receive semantic JSON through `--input`; do not encode prose through fragile shell arguments. Existing-record mutations require the exact current SHA-256 from a confirmed view or prior result:

```text
node skills/track-work/scripts/working-record.mjs view \
  --record .freeflow/tasks/task-NNN-name/record.md --view resume

node skills/track-work/scripts/working-record.mjs update \
  --record .freeflow/tasks/task-NNN-name/record.md \
  --expected-sha <confirmed-sha256> --input update.json
```

### Commands

- `init`: create the next ignored task directory and minimal schema-v2 record. It checks Git ignore/tracked state and never edits `.gitignore`.
- `view`: render `resume`, `discuss`, `execute`, `current`, `work`, `recent`, `entity`, or `full`. Views do not mutate or update timestamps.
- `update`: atomically maintain current context, route, decisions, proposals, Notes, current-slice meaning/evidence, or an explicitly directed task-state change. It does not start or close a slice.
- `start`: select a proposal or direct authorized result and create exactly one Current Slice.
- `block`: record why safe continuation is unavailable and what is required.
- `resume`: return the same blocked slice to progress only after its blocker is resolved.
- `close`: settle one Current Slice as Completed, historical Blocked, or Abandoned and clear it atomically. It may apply an explicitly authorized terminal task state in the same transaction.
- `validate`: report deterministic structural validity; it is not a readiness or quality judgment.
- `inspect`: report sizes, counts, legacy facts, and advisory smells without auto-fixing.

Every command emits one JSON envelope. Confirmed results expose `schemaVersion`, `taskState`, `currentSlice`, `lastUpdated`, and record SHA-256. Confirmation is `confirmed`, `candidate`, or `unavailable`; never treat candidate or unavailable metadata as current confirmed state.

Exit meanings:

- `0`: viewed, updated, no-change, dry-run, valid, or inspected;
- `1`: failed before commit, including invalid input/state, missing or stale SHA, lock conflict, malformed record, or rejected transition;
- `2`: `committed-unconfirmed` after atomic rename but failed publication confirmation.

A no-op, read, dry run, or failed operation does not change bytes, IDs, SHA, or `Last updated`. Dry-run output is prospective only and must be rechecked before a real mutation.

## Failure And Recovery

The script fails closed before rename. It preserves the original record, does not consume IDs, does not update timestamps, and does not begin a dependent transition.

After exit `2`, assume the record may have changed:

1. discard every previously held expected SHA;
2. fresh-read the actual path;
3. run `validate` and `inspect` when available;
4. establish a confirmed task projection and SHA;
5. only then discuss or perform another transition.

Do not bypass the script with manual edits, force-write flags, stale hashes, or guessed repair. A human edit requires a fresh confirmed SHA before the next scripted mutation. No automatic stale-lock breaking or legacy migration exists in v1.

## Route From Results

- unchanged discussion state: return to Discuss or wait;
- material accepted memory: `update`, then return to its owning route;
- authorized execution: `start`, then Execute Work;
- unavailable safe continuation: `block` and stop;
- resolved blocker: `resume` and return to Execute Work;
- settled outcome: `close`, reconcile the record, and return to Workflow;
- validation or transition conflict: preserve evidence and return to Workflow or [Discuss](../discuss/SKILL.md);
- implementation: use [Execute Work](../execute-work/SKILL.md);
- lifecycle routing and authority: use [Workflow](../workflow/SKILL.md);
- point-in-time transfer: use [Handoff](../handoff/SKILL.md).

Track Work ends when the record accurately preserves the supported state and one next useful action. It does not claim that implementation, review, migration, behavioral effectiveness, commit, release, or publication is complete.
