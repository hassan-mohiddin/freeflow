---
name: track-work
description: Use when ongoing work needs durable task memory, or existing task memory must be created, recovered, reconciled, updated, or closed, so current understanding, active work, future outcomes, decisions, evidence, and the next action survive execution, feedback, pauses, or context loss.
---

# Track Work

Maintain one living Working Record without turning it into a transcript, fixed Plan, or authority over live evidence and user decisions.

A **Working Record** is ignored local Markdown that preserves task state across execution, feedback, pauses, and context loss. A **Proposed Slice** is an unselected future outcome with stable identity but no execution state or authority. A **Current Slice** is the one selected outcome whose state must survive ongoing work. `block`, `resume`, `park`, and `reopen` preserve that Slice's identity across different continuation conditions.

Track Work owns the Working Record and its lifecycle. It does not decide whether durable memory is needed, authorize implementation, settle product intent, judge review findings, complete the task, commit, publish, or promote local artifacts.

A Working Record is memory, not authority. Current user direction, live evidence, repository instructions, and accepted source truth override stale record content.

## Enter With A Record Need

Enter when [Workflow](../workflow/SKILL.md) routes a durable-memory need, [Discuss](../discuss/SKILL.md) establishes state worth preserving, the user explicitly requests a record operation, or an existing record needs recovery, reconciliation, or a lifecycle transition.

Use a Working Record when losing current context, decisions, authority boundaries, one active outcome, future outcomes, evidence, blockers, checkpoints, or the next useful action could cause later misalignment. Do not create one for a short disposable result merely because work occurred.

If record need, task ownership, or mutation authority is unresolved, return to Workflow or Discuss. Reading this skill never authorizes record creation or mutation.

Use one ignored local directory per task:

```text
.freeflow/tasks/task-NNN-<short-name>/record.md
```

Everything under `.freeflow/tasks/**` is local task memory. Track Work never stages, commits, publishes, promotes, or synchronizes it. [Write Spec](../write-spec/SKILL.md) and [Write Plan](../write-plan/SKILL.md) separately own tracked durable artifacts.

## Follow The Lifecycle

```text
Record need established
-> create or recover the record
-> reconcile memory with conversation and live evidence
-> preserve material state in its canonical owner
-> select one authorized outcome or wait
-> maintain one coherent Current Slice through feedback and checkpoints
-> settle the outcome and reconcile present state
-> return to Workflow or the owning route
```

Do not reduce this to `start -> close`. Decisions, Proposals, Checkpoints, Evidence, Blockers, Notes, Current Context, and the next action remain part of maintenance whenever their underlying state materially changes.

## Preserve One Canonical Markdown Record

Schema-v3 `record.md` is the sole canonical semantic state. JSON may carry command input and structured results; semantic state is readable Markdown and never a serialized JSON object or escaped lifecycle event. Canonical rendering omits empty optional fields, null optional references, empty optional collections, and empty view sections; it retains required structure and meaningful state such as `Current Slice: None`. The parser accepts existing verbose `[empty]` and `[none]` markers so `compress canonical-markdown` can normalize them without semantic change.

The record has one ordered top-level structure:

```text
# Working Record: <task name>

Task ID: T-NNN
Schema: 3
State: active | paused | completed | abandoned
State source: <user direction or source pointer>
Created at: <UTC timestamp>
Last updated: <UTC timestamp>

## Current Context
## Current Work
## Proposed Slices
## History
## Notes
```

Its semantic owners are:

1. **Current Context:** present understanding needed to interpret or route the task.
2. **Current Work:** recorded route, one Current Slice or none, upcoming Checkpoints, and one next useful action.
3. **Proposed Slices:** ordered future outcomes that have not started.
4. **History:** Decision lifecycle, terminal Checkpoints, Evidence, Blockers, corrections, and completed, parked, or abandoned Slices.
5. **Notes:** inert retained context with no active task effect.

Give each detailed fact one owner. Other sections use stable references or derived views rather than copies. Omit optional content when it carries no useful state. Compactness removes repetition, transcripts, and raw output—not continuity.

Never edit `record.md` directly. Use the executable boundary so parsing, identity, invariants, SHA concurrency, and recovery remain enforceable.

### Preserve Stable Identity

The script assigns IDs and returns them in affected results:

- `T-NNN`: task record;
- `CTX-NNN`: settled, tentative, or open context statement;
- `BND-NNN`: active task boundary;
- `P-NNN`: Proposal;
- `S-NNN`: Slice;
- `X-NNN`: accepted Slice extension;
- `D-NNN`: Decision;
- `C-NNN`: Checkpoint;
- `E-NNN`: Evidence;
- `B-NNN`: Blocker;
- `N-NNN`: Note.

Creation commands never accept caller-chosen IDs. Supply an ID only where the current command schema declares a selector or reference. Titles remain human-readable labels; they do not replace identity.

The validator rejects unknown fields, duplicate identities, dangling or wrong-kind references, stale reciprocal links, impossible states, and more than one active Slice.

## Create Or Recover Honestly

### Start A Minimal Record

A minimal record contains:

- user-owned task state and its source;
- the goal or central question;
- supported current understanding;
- important route-changing open questions;
- `Current Slice: none` when no work is selected;
- one next useful action.

A record may begin without Decisions, Proposals, Checkpoints, Evidence, Blockers, Notes, or a Current Slice. Do not invent content to fill sections.

If discussion already produced Decisions, future outcomes, selected Checkpoints, or explicitly retained Notes, create the minimal record and preserve those facts through their canonical operations before returning to discussion or execution. Do not let initialization erase the state that justified creating the record.

If context is too thin, return to Discuss. If the user still requests a record, create an honest minimal one and wait.

### Reconstruct After Context Loss

After compaction, summarization, clear, resume, session navigation, handoff, or uncertain continuity:

1. run `view --view resume`;
2. confirm task identity, task state, Current Slice, recorded route, next action, and record SHA;
3. compare that memory with the current conversation, latest runtime state, and live repository or environment;
4. retrieve an exact entity by stable ID only when rationale, lineage, authority, chronology, supersession, or Evidence affects the next decision;
5. reconcile only state contradicted or changed by supported current evidence;
6. identify the current owner and return to the route that actually continues.

A record from another conversation branch remains memory. Do not import branch-local approval merely because it is recorded.

Before an expected pause or transfer, reconcile the record only when material task state changed. The boundary itself is not an event, Evidence item, Checkpoint result, or reason to append status prose.

## Maintain Current Context As Present State

Current Context owns:

- **Goal:** durable outcome or central question;
- **Source references:** accepted artifacts or evidence that define interpretation;
- **Settled:** supported understanding still affecting action;
- **Tentative:** live hypotheses that remain provisional;
- **Open:** unresolved questions capable of changing the route;
- **Direction:** remaining strategy, not completed chronology;
- **Boundaries:** active scope, exclusions, evidence limits, and stop conditions.

Schema-v3 gives context statements `CTX-NNN` IDs and task boundaries `BND-NNN` IDs so targeted edits, moves, and removal do not reconstruct whole collections. Preserve basis references when they explain why a statement is supported.

Use `update` only for the target and action declared by its current schema: Current Context, recorded route or next action, context statements, boundaries, source references, and Note maintenance. Preserve unspecified state.

Replace a summary when its meaning changes. Do not append discussion turns, completed-Slice narration, command logs, test inventories, hashes, or raw findings. Decision rationale belongs to the Decision entity; active Decision summaries in views are derived from History.

When a Slice settles, rewrite Current Context from what remains true. Remove event detail now owned by History while preserving consequences still needed to interpret later work.

## Preserve Discussion Without Taking It Over

Discuss owns exploration, assumptions, alternatives, and direction:

```text
Discuss -> accepted material state -> Track Work update -> Discuss
```

Persist only supported changes that could affect later interpretation or action. Batch related edits only when one current command schema accepts them atomically. Decision, Proposal, Slice, Evidence, Blocker, Checkpoint, correction, and task-state lifecycle remain in their dedicated operations.

A record update does not end discussion, authorize implementation, select a Proposal, choose a Checkpoint, settle a user-owned decision, or claim readiness. Return to Discuss after preservation unless Workflow established another route.

## Propose, Select, Or Start Directly

### Preserve Future Outcomes

Use `propose` when an unselected future outcome, evidence boundary, dependency, ordering constraint, or selected Checkpoint must survive context loss.

A Proposal:

- receives a script-assigned `P-NNN` ID and state `proposed`;
- carries no execution authority;
- names one `learning`, `delivery`, or `deepening` result;
- states intended result and expected Evidence;
- references existing entity IDs for dependencies and selected Checkpoints;
- remains revisable through `proposal.update` or `proposal.move` while state is `proposed`;
- keeps state `selected` with reciprocal Slice lineage after selection;
- may become `withdrawn` without execution through `proposal.withdraw`, preserving authority and reason.

Use the stable ID for command selectors and the exact title for human continuity. Never use ordinal references such as “proposal 2.” Keep external Plan phases or source pointers in their proper fields rather than inventing entity references.

When several future outcomes are known, preserve the complete ordered queue before starting one. Do not leave later work only in Current Context, a Plan, or the next action.

### Select With Write-Ahead Authority

Proposal creation and execution authorization are separate. Select a Proposal only when its concrete work is requested or approved.

Use `start` in exactly one declared form:

- **Proposal start:** pass the stable `proposalId` plus fresh authority, reason and scope, stop condition, and starting state. The script preserves Proposal type, intended result, Evidence boundary, dependencies, selected Checkpoints, and reciprocal origin lineage.
- **Direct start:** provide the complete immediate outcome declaration when that outcome does not need a Proposal for future ordering or authorization recovery.

Never mix the two forms. A direct start must not consume or alter existing future Proposals. When the immediate outcome is one of several known outcomes, preserve and select it as a Proposal rather than bypassing the queue.

Before [Execute Work](../execute-work/SKILL.md) begins, the Current Slice must preserve:

- assigned `S-NNN` ID and type;
- intended result;
- authority source;
- reason and scope;
- expected Evidence;
- stop condition;
- starting state;
- dependencies;
- selected Checkpoint IDs;
- pending boundaries.

Save write-ahead state before execution. It preserves intent; it does not claim the work occurred.

## Maintain One Current Slice

### Keep The Outcome Coherent

A Current Slice has one of two active states:

- `in_progress`: active work, including in-scope discussion, implementation, verification, self-review, selected review, correction, and Checkpoints;
- `blocked`: safe continuation is unavailable and at least one Blocker records why.

Historical Slice states are:

- `completed`: intended result and required evidence boundary are settled;
- `parked`: the unresolved blocked attempt was deliberately removed from Current Work;
- `abandoned`: the outcome is no longer pursued under explicit authority.

Failure is Evidence or outcome, not a Slice state by itself.

Keep the same Slice while intended result, authority boundary, evidence boundary, and useful outcome remain coherent. Do not create activity-shaped Slices for implementation, tests, review, corrections, documentation, or commits that belong to the same result.

### Record Accepted Extensions Before Execution

When feedback adds work but the result remains coherent, use `extend` before executing the addition. The script assigns an `X-NNN` ID and preserves:

- current activation sequence;
- authority source and reason;
- added scope;
- added Evidence boundary;
- stop-condition change when applicable;
- extension starting state;
- acceptance time.

An extension preserves the original activation; it does not rewrite history to imply the added scope was always planned.

Use a new Slice when work needs a distinct result, authority source, evidence boundary, independently useful outcome, or explicit abandonment of the original result. First settle or park the Current Slice; never silently replace it.

Questions, criticism, review findings, and useful suggestions do not authorize extensions.

### Block, Resolve, Resume, Or Park

When safe continuation becomes unavailable:

1. use `block` for the Current Slice;
2. preserve why continuation is unsafe, required resolution, and the resume condition;
3. retain the script-assigned `B-NNN` Blocker;
4. stop.

When the blocking condition is actually resolved, use `blocker.resolve` with the real resolution source. Then use `resume` with the same Slice ID. All active Blockers for that Slice must resolve before resumption.

A resolved blocker does not authorize added scope. Record an extension first when the resolution expands the accepted result or evidence boundary.

Use `park` only when the Current Slice is blocked and the unresolved attempt should leave Current Work. Preserve its active Blocker, required Evidence IDs, review summary, task effect, and current activation resolution. Parking does not delete the outcome or free its identity for reuse.

### Reopen Historical Work

Use `reopen` only when later authorized work still belongs to a historical Slice's original outcome. It retains the same `S-NNN` ID and appends a fresh activation with:

- authority source;
- reason and scope;
- expected Evidence;
- stop condition;
- starting state;
- opening time.

Prior activations, outcomes, Evidence, Blockers, review conclusions, and task effects remain immutable and readable. Reopening never restores a mutable copy of an old state.

### Keep Review And Correction Inside The Result

Implementation, verification, self-review, or an independent review report does not settle the Slice by itself. Review may support continuation, correction, more evidence, deferment, a route change, or stopping; it need not Pass.

Keep accepted in-scope correction and its verification inside the same Slice. Do not invent review or remediation Slices when the intended result remains coherent.

## Preserve Record-Worthy Entities

### Decisions

Use `decision.add` for an accepted task-local choice whose rationale could affect later interpretation, implementation, acceptance, or recovery. The script assigns `D-NNN`.

Preserve what was decided, who or what established it, rationale, source references, consequences, and a revisit condition when useful.

Decision states are:

- `active`: currently affects later work;
- `superseded`: replaced or narrowed by another Decision through reciprocal one-to-one links;
- `retired`: historically valid but no longer active, with retirement authority and reason.

Use `decision.update` only for an active Decision. Use `decision.supersede` or `decision.retire` for lifecycle changes. Never delete durable Decision history. A changed understanding is not automatically a Decision; keep it Tentative until accepted.

### Checkpoints

A Checkpoint is a deliberately selected `independent_review`, `local_commit`, `user_decision`, or `continuity` boundary. Ordinary feedback, self-review, a nearby question, status pause, or Slice ending is not a Checkpoint.

Use `checkpoint.select`; the script assigns `C-NNN` and preserves title, type, selected-by source, condition, target, and state `upcoming`.

- For a Current Slice, select the Checkpoint with that Slice as `appliesTo`; the operation links the ID to the Slice.
- For a future Proposal, select a task-level Checkpoint first, then reference its ID through `propose` or `proposal.update`.
- A task-level Checkpoint may remain upcoming while there is no Current Slice.

Use `checkpoint.resolve` with the stable ID to transition the same entity to `completed`, `deferred`, `cancelled`, or `replaced`. Preserve judgment, decision, Evidence IDs, task effect, reason, and replacement linkage when applicable. Resolution removes only that Checkpoint's upcoming reference.

A `completed` Slice cannot close until every selected Checkpoint is terminal. A Local commit Checkpoint never authorizes push or integration.

### Evidence

Use `evidence.add` only when an observation matters to recovery, closure, a Decision, a Checkpoint, or later interpretation. The script assigns `E-NNN`.

Preserve:

- claim and required observing boundary;
- observer;
- check result: `passed`, `failed`, `error`, or `unavailable`;
- claim result: `supported`, `contradicted`, `inconclusive`, or `unavailable`;
- what the result proves and does not prove;
- one real pointer;
- affected entity IDs.

Evidence is append-only. When fresh observation changes an earlier result, use `evidence.supersede`; preserve reciprocal lineage instead of rewriting the prior observation.

Use real pointers such as `file:<path>#<section>`, `commit:<sha>`, `output:<id>`, `review:<reference>`, or `session:<id>/turn:<id>`. Do not copy large raw output or create Evidence for routine self-review.

### Auditable Historical Corrections

Terminal Slices, terminal Checkpoints, and settled Decisions are immutable through ordinary update operations.

Use `history.correct` only for an established clerical correction to a field allowed by its current schema. The target must already be historical. Preserve exact prior and corrected values, reason, authority source, and supporting Evidence IDs.

Correction changes the current displayed value while appending an audit record. It does not erase history, change lifecycle state, settle a new decision, or authorize another outcome.

### Notes

Use `update` with target `note` to add or edit task-adjacent context with no active task effect. The script assigns `N-NNN`. Notes cannot be deleted through ordinary maintenance.

Add a Note when the user explicitly asks to note, remember, retain, or defer something that has no structured owner. During authorized maintenance, add an agent-originated Note only when it is concrete, worth preserving across context loss, not already represented, and has no effect on current scope, priority, completion, blockers, or next action.

Notes do not authorize, prioritize, schedule, block, unblock, prove, or require follow-up. If later user direction independently makes Note content active, create the appropriate structured state from that new direction. Preserve the original user-authored Note unless the user requests its change.

## Close And Reconcile

Before closing a Slice:

- obtain the Workflow-established outcome;
- add the required durable Evidence and use its IDs;
- resolve or deliberately route every selected Checkpoint and pending boundary;
- confirm there is no active Blocker;
- confirm accepted corrections are verified;
- confirm required in-scope work is settled.

Use `close` only for an `in_progress` Current Slice, with final state `completed` or `abandoned`. Preserve summary, Evidence IDs, review summary, and task effect. Abandonment additionally preserves authority, reason, and residual effects. Use `park`, not `close`, for a blocked attempt.

After settlement:

1. rewrite Current Context from what remains true;
2. reconcile Decisions, hypotheses, open questions, Proposals, Blockers, route, and next action only where the outcome changed them;
3. remove event detail now owned by History;
4. leave `Current Slice: none`;
5. do not select or start another Slice automatically.

Only explicit user direction changes task state through `task.set-state`: `active`, `paused`, `completed`, or `abandoned`. Preserve the authority source. A paused task rejects `start`, `extend`, `block`, `resume`, and `reopen`; settle or park any existing Current Slice only when current authority covers that effect. Completed and abandoned task states require no Current Slice. Reconcile misleading future Proposals and the next action before applying a terminal task state.

A green check or completed implementation alone does not establish closure. A Learning Slice may complete by disproving its hypothesis when the intended question and evidence boundary are settled.

## Read Through Purpose-Owned Views

Views are direct Markdown with task identity, task state, schema version, record SHA, and Current Slice summary. They omit empty optional fields and sections, retain active state needed by their purpose, do not mutate state, and do not fetch external pointers.

- `resume`: complete Current Context, active Decisions, Current Work, and ordered Proposals needed after context loss;
- `discuss`: Current Context, active Decisions, Proposals, and a compact Current Slice summary;
- `execute`: the complete Current Slice declaration plus relevant Decisions, Checkpoints, Evidence, Blockers, route, next action, and needed context;
- `recent`: a bounded number of settled Slices ordered deterministically by update time;
- `entity`: one exact Proposal, Slice, Decision, Checkpoint, Evidence, Blocker, or Note by stable ID;
- `full`: the complete canonical Markdown record for audit.

Do not normally read complete History. Retrieve the narrowest view or entity that can answer the current ownership or continuity question.

## Use The Deterministic Boundary

The executable entrypoint is:

```text
skills/track-work/scripts/working-record.mjs
```

The skill decides whether a record operation is semantically warranted. The command schema defines only how to express that selected operation.

Before the first use of a mutation command in the active context, after context loss, or after any failed operation, run:

```text
node skills/track-work/scripts/working-record.mjs schema --command <name>
```

Use only returned fields, selectors, operations, enums, references, CLI options, and conditional requirements. Do not inspect internal modules or reconstruct input from memory. The schema's `x-cli` metadata is the source for transport flags as well as its JSON input schema. In particular, `init` requires both `--name <short-name>` and `--input <json|->`; the JSON `name` field does not replace the CLI `--name` option. Its `--root`, `--dry-run`, and `--help` options are distinct transport controls.

Supply semantic JSON as the literal `--input` value or through stdin with `--input -`. JSON is transport, not canonical task state. Existing-record semantic mutations require `--record`, the exact `--expected-sha` from a confirmed view or result, and the command's current input. `migrate`, `compress`, and recovery commands have dedicated public shapes; do not force them through ordinary mutation options.

The public command surface is:

- creation and observation: `init`, `view`, `schema`, `validate`, `inspect`;
- targeted maintenance: `update`, `task.set-state`;
- Proposal lifecycle: `propose`, `proposal.update`, `proposal.move`, `proposal.withdraw`;
- Slice lifecycle: `start`, `extend`, `block`, `resume`, `park`, `close`, `reopen`;
- Decision lifecycle: `decision.add`, `decision.update`, `decision.retire`, `decision.supersede`;
- durable entities and correction: `evidence.add`, `evidence.supersede`, `blocker.resolve`, `checkpoint.select`, `checkpoint.resolve`, `history.correct`;
- recovery: `reconcile`, `unlock`;
- representation rewrites: `migrate`, `compress`.

Views emit direct Markdown. Schemas, validation, inspection, recovery, and mutation results use structured JSON transport. Successful initialization and ordinary mutation results may include full candidate Markdown for confirmation; treat it as sensitive local state, not a sanitized export or second canonical store. Migration, compression, and error envelopes remain bounded. Read the status and exit code; never infer success from output shape alone.

Unknown commands, CLI options, input fields, mixed forms, malformed values, invalid IDs or references, incompatible targets, ambiguous text matches, stale SHAs, unsafe paths, and invalid transitions fail closed.

A dry run validates the same candidate and round trip as application but does not persist, create locks or rewrite artifacts, consume IDs, or change timestamps. A no-op likewise preserves bytes and identity. Structural validity never proves semantic truth, readiness, migration effectiveness, or task completion.

## Recover Without Guessing

Ordinary context-loss reconstruction uses `view --view resume` and the reconciliation method above.

Before handling `committed-unconfirmed`, recovery evidence, a stale or invalid lock, a legacy or unsupported record, or an explicitly authorized migration or compression, read [Recovery And Representation](references/recovery-and-representation.md).

A failed, read-only, dry-run, or no-op operation does not change canonical bytes, SHA, timestamp, or allocated IDs. Preserve the exact failure evidence and use a fresh confirmed SHA after any uncertainty.

Never force-write, hand-edit, delete a lock, guess repair, bypass the script, silently change rewrite scope, or continue with stale state.

## Check Consistency

Before relying on or finishing a mutation, confirm:

- Current Context describes present state rather than accumulated events.
- Detailed facts have one canonical owner.
- Current Work identifies at most one active Slice with a clear authority source.
- Every entity retains the correct stable ID and every reference resolves to the right kind.
- Proposed Slices remain unselected, carry no authority, and preserve real order and dependencies.
- Proposal selection and Slice origin linkage are reciprocal.
- Accepted extensions preserve the original activation and were recorded before added execution.
- Discussion, review, correction, and Checkpoints did not replace a coherent Current Slice.
- `blocked` means safe continuation is unavailable, not that feedback is pending.
- active Blockers resolve through their actual source before resume.
- Decision and Evidence supersession links are reciprocal and acyclic.
- upcoming Checkpoints retain selection source, condition, target, and stable identity.
- terminal Checkpoints have no stale upcoming reference.
- terminal history changes only through auditable correction or its dedicated lifecycle.
- Notes remain inert and user-authored Notes preserve their meaning.
- settled evidence and event detail are not duplicated in Current Context.
- one next useful action exists and belongs only to Current Work.
- live evidence and current user direction override contradictory memory.

Correct a clear clerical inconsistency inside current authority through the proper operation. Return a material conflict to Workflow or Discuss. Do not force the next lifecycle transition.

## Return To The Owner

- unchanged discussion state: return to Discuss or wait;
- material accepted memory: update, then return to its owner;
- authorized execution: start or reopen, then Execute Work;
- unavailable continuation: block and stop;
- resolved current Blocker: resolve, resume, then Execute Work;
- deliberately parked work: leave Current Slice empty and return the effect to Workflow;
- settled outcome: close, reconcile present state, then return to Workflow;
- malformed, stale, locked, conflicting, or uncertain state: preserve evidence and return to Workflow or Discuss;
- point-in-time transfer: [Handoff](../handoff/SKILL.md).

Track Work ends when the record accurately preserves supported state and one next useful action. It does not claim implementation, review, migration, promotion, commit, release, or publication is complete.
