# Cognitive Routing

Cognitive Routing places work across configured **Coordinator**, **Helper**, and **Executor** compute profiles inside one active Freeflow agent and one canonical Pi session. It is designed to balance task quality, reasoning continuity, responsiveness, and total cost without creating a second agent, a second Workflow, or a new source of authority.

This page is the public operating reference for the current `cognitive-routing-v2` contract. It describes user-visible behavior, configuration, controls, evidence flow, continuity, and failure boundaries. Internal implementation sketches and historical design proposals are not part of this contract.

## Current status

Cognitive Routing is an experimental native-Pi capability.

- The native Pi entrypoint is wired in the source tree.
- Local SDK, bundled-CLI, and deterministic request fixtures exercise named source and request boundaries.
- Source and fixture evidence do not establish installation into a user's Pi host, universal provider behavior, model quality, or production readiness.
- The redesigned PiFlow adapter is explicitly unavailable in the current source entrypoint.
- Cognitive Routing is not delivered to the non-Pi hosts that consume only Freeflow's shared skill surface.

Installing Freeflow or writing a valid configuration does not prove that routing is effective. Use `/freeflow status` on the target host and treat an unavailable capability as unavailable rather than impersonating a profile or bypassing its gate.

## What Cognitive Routing changes

Cognitive Routing changes **where the next computation runs**. It does not change:

- the user's authority over goals and consequential decisions;
- the current Workflow owner or work agreement;
- repository instructions, host permissions, or tool safety;
- the evidence required to support a result;
- the distinction between verification, self-review, and independent review;
- Track Work task or Slice state;
- commit, integration, release, or publication authorization.

Coordinator, Helper, and Executor are sequential compute profiles, not independent agents. They share one canonical session and ordinary history according to the active projection policy. They do not share private reasoning. Switching profiles does not create independent review.

## Mental model

### Terms

| Term | Meaning |
| --- | --- |
| **Profile** | A configured provider, model, and thinking-level combination used as Coordinator, Helper, or Executor. |
| **Coordinator** | Owns user-facing interpretation, governing direction, delegation, assessment, and acceptance. |
| **Worker** | Helper or Executor while carrying one accepted assignment. |
| **Helper** | Normal delegate for supporting work when enabled. |
| **Executor** | Producer commissioned for substantive or consequential work. |
| **Delegation mode** | Which workers are enabled for automatic routing: `helper`, `executor`, or `both`. |
| **Automatic control** | Coordinator receives new user direction and assigns bounded worker responsibilities. |
| **Manual control** | One selected profile runs the ordinary unsplit Workflow until the user releases the hold. |
| **Unit** | One runtime outcome under Coordinator judgment. A unit may contain multiple sequential assignments. |
| **Assignment** | One saved contract for one worker. Only one worker assignment executes at a time. |
| **Handoff** | A saved assignment request, worker report, recovery request, or recovery supplement plus its transfer state. |
| **Assessment** | Coordinator judgment of a returned result and its supporting evidence. |
| **Projection** | Optional worker-to-Coordinator evidence selection. It is not a separate transcript or privacy boundary. |
| **Recovery** | A bounded lookup attached to an existing returned assessment; it is not a new implementation assignment. |

### Ownership nesting

```text
Interaction Lifecycle
└─ Workflow Feedback Loop
   ├─ establishes authority, current owner, and required result
   └─ Cognitive Routing — when effective
      ├─ Coordinator selects the next producer
      │  ├─ Helper: support, preparation, checks, settled mechanics
      │  └─ Executor: substantive or consequential results
      ├─ selected worker executes one bounded assignment
      └─ Coordinator assesses evidence and continues, corrects, or closes
```

Cognitive Routing operates inside the current Workflow owner. A routing unit is not a Track Work Slice. Closing a unit does not complete a Slice, task, commit, release, or launch.

## Profiles and responsibilities

### Coordinator

Coordinator:

- interprets new user direction and material changes;
- keeps outcome, scope, constraints, and return boundary coherent;
- chooses Helper or Executor according to responsibility and consequence;
- writes a usable assignment contract without pre-solving the worker's work;
- assesses returned claims against actual evidence;
- decides whether to continue, correct, replace, defer, cancel, or close;
- authorizes completed Track Work Slice closure only after supported assessment under automatic control.

Outside Helper-only mode, Coordinator normally delegates separable environment work. Direct Coordinator action in automatic `executor` or `both` mode is limited to routing controls, required instructional reads, effective view controls, explicitly user-selected Coordinator artifact authorship, or genuinely inseparable judgment and action under the documented ACT_BOUNDED exception.

### Helper

Helper is the normal delegate for supporting work when enabled. Suitable responsibilities include:

- bounded repository or source investigation;
- context gathering and discussion preparation;
- routine checks and validation;
- Working Record maintenance;
- separable follow-through;
- small, settled, low-risk mechanical changes with direct checks.

Helper is not restricted to copying facts. It may reason, compare evidence, choose local mechanics, and correct understood local errors within its assignment. It should return rather than turn a finding into unassigned substantive work.

### Executor

Executor owns commissioned substantive or consequential results, including:

- meaningful implementation;
- substantial artifacts;
- difficult diagnosis;
- broad audits or reviews;
- unfamiliar or branching execution;
- small changes whose failure consequences require substantive ownership.

Executor investigates and implements resourcefully within the assignment, runs applicable checks, self-reviews the result, and returns actual work, evidence, and limitations. A completed Executor report is not Coordinator acceptance.

### Placement rule

Choose a worker by the responsibility being transferred and the consequence of failure—not by file type, line count, read/write status, tool count, model identity, or price alone.

## Delegation modes

The JSON values remain `helper`, `executor`, and `both`. The labels below describe intended positioning, not measured guarantees.

| Mode | Positioning | Automatic behavior | Best fit | Main tradeoff |
| --- | --- | --- | --- | --- |
| `helper` | **Quality-first — maximum performance and output-quality potential** | Coordinator implements the authorized outcome and delegates bounded support to Helper. | Work where a strong Coordinator should retain the main implementation while receiving preparation, checks, and follow-through. | Additional support can improve continuity and quality, but also adds model work and latency. |
| `executor` | **Savings-first — maximum savings potential** | Coordinator directs and assesses; delegated environment work goes to Executor. | Work where an appropriately selected Executor preset can perform most execution at lower cost while preserving the required quality. | A preset that causes rework or weak evidence can cost more overall. |
| `both` | **Balanced** | Helper is the normal support delegate; Executor is commissioned for substantive or consequential work. Coordinator explicitly selects each assignment's worker. | Mixed tasks needing economical support plus substantive execution ownership. | Total cost depends on actual assignment mix; implementation-heavy work often trends toward the Executor preset. |

“Maximum” describes the intended optimization direction and potential. Freeflow does not guarantee that one mode is universally faster, cheaper, or higher quality than a solo agent or another mode. Evaluate total cost per supported outcome, including retries, handoffs, recovery, corrections, latency, and user intervention.

## Activation requirements

Routing becomes effective only when all required conditions hold:

1. Freeflow repository activation is valid and enabled.
2. Cognitive Routing is enabled.
3. The native host exposes the required model registry, authentication lookup, model/thinking controls, session entries, and ancestry APIs.
4. Coordinator and every worker enabled by the selected delegation mode have complete profiles.
5. Every required model is available and authenticated.
6. Every requested thinking level is supported exactly; silent clamping is rejected.
7. Coordinator differs from each enabled worker as a complete provider/model/thinking pair.

Helper and Executor may use the same pair. A well-formed unavailable profile that is not required by the selected mode does not block that mode. Malformed configuration still fails closed.

Common unavailable states include:

- missing or invalid repository activation;
- routing disabled;
- missing profile;
- unavailable or unauthenticated model;
- unsupported thinking level;
- identical Coordinator and enabled-worker pairs;
- unsupported host APIs;
- incompatible capability composition;
- deliberately unavailable PiFlow adapter.

The runtime reports the reason rather than partially enabling routing or silently choosing another model.

## Configuration

Configure Cognitive Routing in shared `.freeflow/config.json` or personal `.freeflow/local.json`:

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": false,
    "profiles": {
      "coordinator": {
        "provider": "provider-id",
        "model": "coordinator-model-id",
        "thinking": "high"
      },
      "helper": {
        "provider": "provider-id",
        "model": "helper-model-id",
        "thinking": "low"
      },
      "executor": {
        "provider": "provider-id",
        "model": "executor-model-id",
        "thinking": "medium"
      }
    }
  }
}
```

### Fields

| Field | Meaning | Default |
| --- | --- | --- |
| `enabled` | Enables Cognitive Routing when the host and required profiles qualify. | `false` |
| `delegation` | Enables `helper`, `executor`, or `both`. | `executor` |
| `projection` | Enables explicit worker-evidence selection for Coordinator. | `false` |
| `profiles.<name>.provider` | Provider identifier known to Pi. | Required for configured profile |
| `profiles.<name>.model` | Model identifier known to that provider. | Required for configured profile |
| `profiles.<name>.thinking` | Exact thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. | Required for configured profile |

### Configuration precedence

```text
session profile override
-> personal .freeflow/local.json
-> shared .freeflow/config.json
-> built-in default
```

Personal configuration may override `enabled`, `delegation`, `projection`, or complete profiles. Omitted values inherit from the repository layer.

Session settings may override complete profiles enabled for that session. They do not mutate personal or repository files and can be reset or set to inherit. Delegation mode has no session override.

Changing the active profile's session preset applies at an idle boundary. Changing an inactive profile stores the preset for its next transition. Direct native `/model` or thinking changes are external changes; they do not rewrite a Freeflow preset and may require reconciliation or release automatic control.

### Unsupported legacy configuration

Only the v2 `enabled` / `delegation` / `projection` / `profiles` shape is accepted. Earlier experimental names or fields such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are not migrated. Rewrite legacy configuration manually.

## Settings and user controls

### Settings scopes

| Command | Scope |
| --- | --- |
| `/freeflow settings` | Opens personal overrides for the current repository. |
| `/freeflow settings local` | Same personal/local settings scope. |
| `/freeflow settings repo` | Edits shared `.freeflow/config.json`. |
| `/freeflow settings session` | Edits temporary session enablement/context settings and complete enabled-profile overrides. |
| `/freeflow status` | Shows effective Freeflow and capability state. |

Settings that change routing profiles require an idle host. Repository or personal changes may require `/reload` before every surface reflects the new effective state.

### Profile controls

While the qualified host is idle:

```text
/freeflow profile coordinator
/freeflow profile helper
/freeflow profile executor
/freeflow profile auto
/freeflow profile history
/freeflow profile history diagnostics
/freeflow resume
```

- `coordinator`, `helper`, and `executor` create a manual hold when that profile is enabled.
- `auto` releases a manual hold and returns to automatic Coordinator reconciliation.
- `history` shows work-oriented routing history.
- `history diagnostics` shows the raw routing-event tail.
- `resume` reconciles and resumes the one supported saved responsibility; it does not create a new assignment or release manual control.

When native controls are available:

- `Ctrl+Shift+R` cycles Coordinator and workers enabled by the delegation mode.
- `Ctrl+Shift+A` releases a manual hold to automatic Coordinator control.

Source wiring for a command or shortcut is not proof that an installed host dispatches it.

## Automatic and manual control

### Automatic control

Automatic control starts and returns through Coordinator. Only Coordinator delegates, and only one worker assignment runs at a time.

```text
Coordinator accepts new direction
-> Coordinator defines the next useful result
-> Coordinator assigns Helper or Executor
-> assigned worker executes and checks the bounded responsibility
-> worker saves a report and prepares evidence
-> Coordinator assesses the actual result
-> Coordinator continues, corrects, replaces, defers, cancels, or closes
```

In `both`, every assignment identifies its worker. A unit may use Helper for preparation, Executor for production, and Helper for follow-through, but these are available routes rather than required phases.

New user input always belongs to Coordinator. If it reaches a worker request that was already prepared, the worker stops ordinary task tools and returns available partial state instead of adopting the new direction.

### Manual control

A manual hold runs the ordinary unsplit Workflow in the selected profile. Automatic delegation and projection are bypassed. The held profile is not restricted to its automatic worker role, and the hold remains until the user releases it.

Manual control does not grant additional task authority or erase outstanding routing history. Returning to automatic control first reconciles current direction, saved responsibility, and partial effects.

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

## Context projection

Projection is optional and disabled by default.

### Projection off

With `projection: false`:

- enabled profiles receive Pi's ordinary active context;
- routing still records responsibility and saved communication;
- `freeflow_project` is unavailable;
- a report can return without an evidence-selection ceremony.

### Projection on

With `projection: true` under automatic control:

- Helper and Executor share ordinary active worker history;
- Coordinator receives common context plus selected worker evidence;
- accepted reports and required native dependencies are retained automatically;
- omitted worker result bodies are not copied merely to create a cache match;
- selections and saved reports survive profile changes and reload according to current ancestry.

Projection is evidence selection, not an isolated security boundary, transcript deletion, or proof that a model understood the evidence.

The current routing projection is not qualified together with legacy Context Virtualization or Conversation History transforms. Keep those capabilities standalone, or keep routing projection disabled. This limit does not describe the planned Context Control v2 architecture, which remains in development and is unavailable in this release.

## Evidence selection

### Select known refs directly

When a worker already has a visible, eligible evidence ref, it may add that ref directly. Inspection is for a concrete question about identity, eligibility, representation, history, or current selection state—not a mandatory step before every addition.

### Ref meanings

- `ctx:<entry>` selects the whole supported native occurrence.
- `ctx:<entry>#text` selects exact visible assistant text as a distinct representation.

Visible text excludes private reasoning and native tool calls. It does not claim to transfer signed reasoning.

A tool-call envelope and its result are different sources. Select the result body for claims about what execution produced. Selecting a call proves only the captured call content, not the result of every sibling operation.

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

Native compaction may remove active user or evidence bodies while canonical session history remains. Routing preserves the last observed delivered-user basis so stored-but-undelivered entries do not look like new input.

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

## Request planning and cache-aware reuse

Cognitive Routing plans the entire receiving request rather than counting only selected bodies. The local estimate includes text, tool schemas, message framing, routing communication, selected dependencies, and an approximate image allowance. Output allocation and final image tokenization remain provider-dependent.

A large estimate produces a planning warning; it does not alone prove provider overflow. Unknown model capacity and concrete source/representation gaps can still block preparation. Pi retains ownership of provider overflow, retry, and native compaction. Freeflow does not silently truncate required evidence or start a competing retry loop.

### Prefix stability

Freeflow keeps stable reference definitions and tool schemas while execution gates determine availability. RequestHistory preserves compatible Freeflow-generated runtime-state and communication occurrences at their historical positions and appends changed current state at the tail. It never imports excluded evidence merely to preserve an older prefix.

Compatible prefixes may shorten or restart when:

- model, provider, API, or unsupported effort route changes;
- earlier projected content changes;
- evidence is archived, restored, selected, or withdrawn;
- tool schemas or instructions change;
- compaction or navigation changes active history;
- capability configuration changes permitted content.

A matching local prefix is not proof of a provider cache hit.

### Astra cache-aware effort history

For qualified `gpt-6-astra` requests on supported OpenAI Responses or OpenAI-Codex Responses routes, Freeflow can keep the original request-level effort as a stable baseline and insert trusted `configuration_update` items at validated historical positions when effective effort changes.

The adapter:

- accepts only supported model, provider/API, endpoint, effort, storage, and request shapes;
- fingerprints the request envelope and complete serialized input prefix;
- records compact native attempt metadata rather than opaque reasoning bodies;
- isolates incompatible ancestry, compaction, branch-summary, and request-envelope changes;
- preserves compatible effort history across supported model round trips and reloads;
- returns the untouched request with its native requested effort when adaptation is unavailable or uncertain.

Local tests cover request construction, Low/High transitions, branch and reload behavior, compaction boundaries, append uncertainty, and prefix preservation. They do not establish a server cache hit, a billing discount, provider-wide support, model quality, or a universal cost saving.

## Practical mode recipes

### Quality-sensitive implementation

Use Helper-only when Coordinator should retain the main implementation and a second profile can gather context, run checks, or maintain task memory.

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "helper",
    "projection": false,
    "profiles": {
      "coordinator": { "provider": "provider-id", "model": "primary-model", "thinking": "high" },
      "helper": { "provider": "provider-id", "model": "support-model", "thinking": "medium" }
    }
  }
}
```

### Cost-sensitive delegated execution

Use Executor-only when an appropriate Executor preset can own most environment work while Coordinator retains direction and assessment.

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "executor",
    "projection": true,
    "profiles": {
      "coordinator": { "provider": "provider-id", "model": "coordinator-model", "thinking": "high" },
      "executor": { "provider": "provider-id", "model": "executor-model", "thinking": "low" }
    }
  }
}
```

Projection may reduce Coordinator's worker-history view, but evidence selection and handoff overhead are part of total cost. Start with projection off when debugging context behavior.

### Mixed support and substantive execution

Use Both when the task benefits from economical preparation/follow-through and a separate substantive producer.

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": true,
    "profiles": {
      "coordinator": { "provider": "provider-id", "model": "coordinator-model", "thinking": "high" },
      "helper": { "provider": "provider-id", "model": "helper-model", "thinking": "low" },
      "executor": { "provider": "provider-id", "model": "executor-model", "thinking": "medium" }
    }
  }
}
```

Both mode does not require a Helper preparation assignment before every Executor assignment. Coordinator uses the producer that matches the next coherent result.

### Debugging with a manual hold

Use a manual hold to run an unsplit Workflow in one enabled profile while inspecting behavior. Release it with `/freeflow profile auto`. A manual hold is not an alternative automatic policy and does not erase the saved assignment.

## Troubleshooting

### Routing reports unavailable

Check `/freeflow status`, then verify:

- valid `.freeflow/config.json` activation;
- `cognitiveRouting.enabled: true`;
- selected delegation mode;
- complete required profiles;
- exact supported thinking levels;
- model authentication;
- distinct Coordinator/worker pairs;
- native Pi rather than the currently unsupported PiFlow adapter;
- no incompatible routing-projection and legacy-context-capability combination.

### A configured worker is not used

A worker must be enabled by the delegation mode. In `both`, Coordinator must choose the worker for each assignment. An unused well-formed profile does not force itself into the route.

### A session preset does not apply

Wait until Pi is idle. Confirm the profile is enabled for the session. Active-profile changes apply immediately at the supported idle boundary; inactive-profile changes are stored for the next transition. Use session reset/inherit to return to personal or repository configuration.

### A worker returned but work did not close

This is expected. Worker return saves communication and ends worker task permission. Coordinator must assess the result and explicitly close the routing unit or continue with another assignment. Track Work Slice closure is separate.

### Evidence is missing from Coordinator

Determine whether projection is enabled. Confirm the worker selected the result body, not only the call envelope. Inspect selected-scope diagnostics for unavailable, target-representation, or ancestry problems. Recover existing evidence through the attached recovery path rather than rerunning historical effects.

### Resume is blocked

`/freeflow resume` works only at an idle, supported, reconciled boundary. It does not release a manual hold, consume unseen new input, guess an assignment after ancestry changes, or override an unavailable recorded worker.

### Cache status does not show savings

Request-prefix preservation and Astra effort-history adaptation are compatibility mechanisms. Provider expiry, eviction, minimum cacheable length, pricing, and actual cache hits remain provider-owned. Use provider-reported usage at a qualified boundary before making billing claims.

## Planned Context Control boundary

Context Control v2 is planned source-aware residency and bounded recovery work. It is not implemented or available in this release, and this page does not define its future commands or settings.

The existing Context Virtualization and Conversation History capabilities remain separate legacy capabilities. They must not be described as Context Control v2, and their transforms are not qualified together with Cognitive Routing projection.

## Evidence boundary

Current deterministic source and fixture checks can establish:

- configuration and gating rules;
- assignment, report, assessment, recovery, and closure transitions;
- native-entry persistence and named recovery boundaries;
- projection structure and source identity;
- request construction and Astra adapter behavior at their observed boundaries.

They do not establish:

- stock-Pi or PiFlow installed-host behavior;
- universal provider or transport compatibility;
- independent review from a profile switch;
- optimal worker selection;
- provider cache hits or billing savings;
- universal model quality;
- production readiness.

## Related documentation

- [Capabilities](README.md)
- [Workflow](../workflow.md)
- [System prompt architecture](../prompt-architecture.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
- [Getting Started](../getting-started.md)
- [Architecture](../architecture.md)
- [Release evidence](../release-evidence/README.md)
