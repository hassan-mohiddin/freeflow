# Cognitive Routing

How Cognitive Routing works inside: the unit and assignment lifecycle, the routing tools, evidence selection and recovery, persistence, and the boundaries of what its evidence shows. What routing is, how to configure and control it, and how to choose a mode are in the user guide [Cognitive Routing](../../plugin-docs/capabilities/cognitive-routing.md).

## Unit and assignment lifecycle

A unit represents one outcome under Coordinator judgment. It may contain several assignments.

```text
no open unit
  -> assign: create unit U1 and assignment A1
  -> worker executes A1
  -> submit: save A1 report and return to Coordinator
  -> Coordinator assesses
       -> assign: create A2 in U1
       -> replace: supersede a quiescent outstanding assignment
       -> close: accept, cancel, or defer U1
```

### Assignment contract

A useful contract communicates:

- the required result and why it matters;
- established facts and remaining questions;
- scope, permitted effects, constraints, and local freedom;
- evidence needed for assessment;
- the return condition, including changed premises that require stopping.

A preparation assignment names what must be learned rather than guessing the patch. A production assignment transfers enough direction to act safely without turning the worker into a transcription step.

### Return and assessment

A worker report records actual work, evidence, limitations, changed assumptions, and partial effects. Once the report is saved, ordinary task work for that assignment ends. The worker may correct the handoff, but it cannot continue implementation merely because delivery is blocked.

Coordinator compares material completion claims with:

- the accepted property;
- the actual observer;
- decisive assertions;
- candidate identity;
- returned result and limitations.

A passing check or confident report cannot fill a missing evidence link. Coordinator may accept supported work, request focused evidence, commission correction, revise an invalidated approach, or return a user-owned choice.

### Replacement

`replace` supersedes a quiescent outstanding assignment in the same unit. It requires an explicit reason and preserves prior effects, evidence, and uncertainty. It is not a way to discard a returned report or disguise a changed objective.

### Closure

Coordinator may close a unit as accepted, cancelled, or deferred when its preconditions hold. Closure preserves communication and history. It does not:

- complete a Track Work Slice or task;
- create a commit;
- integrate a branch;
- authorize migration, release, or launch;
- delete admitted context.

## Routing tools

The model-facing routing tools have distinct responsibilities:

| Tool | Operations | Responsibility |
| --- | --- | --- |
| `freeflow_delegate` | `assign`, `replace` | Coordinator saves a worker contract and requests execution. In `both`, Coordinator supplies `worker`. |
| `freeflow_return` | `submit`, `supplement`, `retry` | The recorded worker saves or revises its report, returns a separate recovery supplement, or retries the unchanged saved handoff. |
| `freeflow_unit` | `inspect`, `assess`, `recover`, `cancel-recovery`, `close` | Reads saved work, manages attached recovery/assessment, or records Coordinator disposition. |
| `freeflow_project` | `inspect`, `add`, `remove` | Manages worker task-evidence selection when projection is effective. |

Routing tools are controls, not permission grants. The runtime checks capability state, control mode, assigned worker, current phase, and operation shape even if a definition remains visible.

The harness owns unit, assignment, handoff, and event identities. Models use returned work refs for inspection; they do not maintain a parallel ledger or invent IDs.

## Evidence selection

### Select known refs directly

When a worker already has a visible, eligible evidence ref, it may add that ref directly. Inspection is for a concrete question about identity, eligibility, representation, history, or current selection state—not a mandatory step before every addition.

A worker adds its evidence and submits its return in the same response, with the return last. The report is saved even when a selected source has a problem; the return receipt reports readiness, and the worker corrects the selection and uses `freeflow_return` retry instead of waiting for a separate selection receipt.

### Ref meanings

- `ctx:<entry>` selects a supported tool result.

Only tool results are evidence. A worker's own messages are not selectable; anything it would say belongs in the report. Select the result body for claims about what execution produced; the runtime keeps its call envelope automatically.

### Candidate scopes

Inspection can use:

- `assignment`: candidates from the current assignment;
- `active`: currently active eligible evidence;
- `history`: eligible exposed evidence from applicable history;
- `selected`: saved selections, including their diagnostics.

Normal candidate scopes show usable sources with identity metadata, not source-content previews. Selected scope preserves saved problem diagnostics. Pagination cursors bind to the inspection snapshot; changed ancestry, reload, or expiration requires a fresh inspection.

### Native dependencies and representations

For selected tool evidence, the runtime retains the native assistant call envelope and required call/result structure. Unselected sibling result bodies may appear as explicit omission placeholders. They are not fabricated evidence.

Every represented source carries stable producer provenance when known. Unknown/common history remains unknown rather than being assigned a profile from model identity or marker-shaped text.

### Readiness and limitations

A ref can be valid while delivery is not ready. Preparation also checks:

- canonical source availability and identity;
- required native exchanges;
- receiver configuration;
- target representation support;
- whole-request planning constraints.

Unsupported images, failed/aborted assistant sources, changed or missing bodies, and unqualified target conversion remain explicit limitations. Valid selections survive another item's failure. Do not remove adverse or unresolved evidence merely to obtain a clean receipt.

`ready: true` means the runtime found no known preparation problem at that boundary. It does not prove:

- semantic support for the worker's claim;
- current external truth;
- provider receipt or understanding;
- an actual cache hit;
- model quality;
- Coordinator acceptance.

## Attached evidence recovery

Attached recovery lets Coordinator request missing assessment evidence without replacing the assignment, revising the original report, or reopening ordinary worker execution.

```text
worker report returned
-> Coordinator identifies a material evidence gap
-> freeflow_unit recover saves a bounded request
-> the assignment's recorded worker receives recovery scope
-> worker selects exposed evidence and/or reads exact admitted files
-> freeflow_return supplement saves separate communication
-> Coordinator receives the supplement or cancels recovery
-> freeflow_unit assess may resume the original assessment
```

### Recovery scope

Recovery may use:

- previously exposed eligible evidence;
- exact task-file paths named by Coordinator;
- packaged Freeflow skill or reference Markdown required for the recovery method;
- routing and recovery-return controls.

It may not use broad search, edits, tests, builds, scripts, arbitrary wrappers, or resumed task work. Reads stop after the supplement is saved.

The worker recorded on the original assignment owns recovery even if configuration later selects another mode. If that worker is unavailable, continuation blocks rather than silently substituting another profile.

### Supplement and cancellation

A supplement is separate from the original report and preserves its identity, revision, outcome, and selection. Partial or blocked supplements may communicate an evidence gap without pretending full evidence arrived.

Fresh user attention does not settle recovery. Coordinator must receive the supplement or use `cancel-recovery` before resuming the assessment. Cancellation preserves the original report, recovery history, selections, and reason.

## Persistence and continuity

Routing state is stored in native `freeflow-routing-v2` session entries on the selected ancestry. It includes assignments, reports, selections, assessments, controls, profile overrides, recovery, and transition evidence. It is routing continuity—not a second task-memory system.

### Append and reconciliation boundary

The runtime validates transitions, appends native events, and checks readback. When state is existing or uncertain, it can use a strict read-only persisted-session snapshot with session identity, ancestry, UTF-8/JSONL, size, and divergence checks.

Current processing limits are:

- 512 MiB per session file;
- 128 MiB per entry;
- 250,000 JSONL records including the header.

These are accepted processing bounds, not latency or memory guarantees. Freeflow does not patch session files, claim `fsync`, or promise exactly-once arbitrary tool execution. An uncertain append or divergent snapshot blocks affected automatic work rather than permitting blind repetition.

### Compaction

Freeflow's [Compaction](../../plugin-docs/capabilities/compaction.md) and Pi's own compaction may remove active user or evidence bodies while canonical session history remains. Routing preserves the last observed delivered-user basis so stored-but-undelivered entries do not look like new input.

Under routing a worker compacts itself mid-assignment with `freeflow_compact` and continues; afterwards routing re-sends the assignment's contract with a note that the compaction it asks for is done. At "compact now" a worker compacts before returning, because the Coordinator and the next assignment continue the same history. A Coordinator under projection never compacts: its notices tell it to delegate an assignment that compacts and returns, folded into other work where possible. Compaction is measured on the full history the next worker request carries.

After a worker's compaction the Coordinator sees a version of the carried context that names the worker's copies instead of repeating them; selected evidence from before the compaction is rebuilt from its stored originals, and once delivered it stays in the Coordinator's view, through an evidence recovery and the unit's close, until the next compaction. The Coordinator's requests therefore keep extending each other, apart from the one rewrite any compaction costs. Runtime State tells the Coordinator which worker's summary opens its view.

A configured outstanding assignment can be resumed explicitly after compaction. Required selected evidence may be recovered from known canonical sources when available. Compaction is not task completion, permission renewal, or automatic restoration of every historical body.

### New user attention

New user attention belongs to Coordinator. During a returned assessment, it suspends the forced assessment-evidence obligation while retaining ordinary admitted history, the saved report, selections, and current responsibility. A later `assess` operation must re-establish readiness before the heavy assessment view resumes.

During outstanding worker execution, new direction requires the worker to stop ordinary task tools and return available partial state.

### Reload, navigation, and external changes

After reload, tree navigation, context loss, external model/thinking change, or uncertain transition, recover:

- current Runtime State;
- control mode and active profile;
- unit and assignment;
- saved report and partial effects;
- selected evidence and limitations;
- stopping condition.

Navigation replays only the selected ancestry and never re-executes historical environment tools. Manual holds survive navigation according to recorded/current control. External model or thinking changes are reconciled as external state, not silently written into presets.

## Planned Context Control boundary

Context Control v2 is planned source-aware residency and bounded recovery work. It is not implemented or available in this release, and this page does not define its future commands or settings.

The removed source, capability guidance, tests, and evaluation definitions are preserved in the [legacy context archive](../../.deprecated/legacy-context/README.md). Do not treat them as Context Control v2 or as a current runtime contract.

## Evidence boundary

Current deterministic source and fixture checks can establish:

- configuration and gating rules;
- assignment, report, assessment, recovery, and closure transitions;
- native-entry persistence and named recovery boundaries;
- projection structure and source identity;
- request construction and selected-model effort-adapter behavior at their observed boundaries.

They do not establish:

- installed-host delivery or behavior;
- universal provider or transport compatibility;
- independent review from a profile switch;
- optimal worker selection;
- provider cache hits or billing savings;
- universal model quality;
- production readiness.

