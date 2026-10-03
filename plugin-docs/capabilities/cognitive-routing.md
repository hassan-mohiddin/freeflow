# Cognitive Routing

Cognitive Routing places work across configured **Coordinator**, **Helper**, and **Executor** compute profiles inside one active Freeflow agent and one canonical Pi session. It is designed to balance task quality, reasoning continuity, responsiveness, and total cost without creating a second agent, a second Workflow, or a new source of authority.

This page is the public operating reference for the current `cognitive-routing-v2` contract. It describes user-visible behavior, configuration, controls, evidence flow, continuity, and failure boundaries. Internal implementation sketches and historical design proposals are not part of this contract.

## Current status

Cognitive Routing is an experimental native-Pi capability.

- The native Pi entrypoint is wired in the source tree.
- Local SDK, bundled-CLI, and deterministic request fixtures exercise named source and request boundaries.
- Source and fixture evidence do not establish installation into a user's Pi host, universal provider behavior, model quality, or production readiness.
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

Coordinator, Helper, and Executor are sequential compute profiles, not independent agents. They share one canonical session and ordinary history according to the active projection policy. A profile receives another profile's private reasoning only where both would send the same request: the turn was produced on the receiving profile's own model and under the same view (projection off, or Helper and Executor sharing worker history). Otherwise each profile sees only its own reasoning, and the Coordinator never receives worker reasoning under projection. Switching profiles does not create independent review.

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

The runtime reports the reason rather than partially enabling routing or silently choosing another model.

## Configuration

Configure Cognitive Routing in shared `.freeflow/config.json` or personal `.freeflow/local.json`:

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": true,
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
| `projection` | Enables explicit worker-evidence selection for Coordinator. | `true` |
| `profiles.<name>.provider` | Provider identifier known to Pi. | Required for configured profile |
| `profiles.<name>.model` | Model identifier known to that provider. | Required for configured profile |
| `profiles.<name>.thinking` | Exact thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. | Required for configured profile |

### Configuration precedence

```text
session delegation/profile override
-> personal .freeflow/local.json
-> shared .freeflow/config.json
-> built-in default
```

Personal configuration may override `enabled`, `delegation`, `projection`, or complete profiles. Omitted values inherit from the repository layer.

Session settings may override delegation mode and complete Coordinator, Helper, or Executor presets, including a worker not yet enabled by the current mode. Choose its preset before enabling that worker if it has no configured preset. Session overrides are stored on the selected Pi session ancestry, take precedence over personal/repository values, and can be reset or set to inherit without changing either file. A mode change affects future assignments; an accepted assignment retains its recorded worker. The footer shows the active profile, automatic/manual control, and current delegation mode.

Profile changes made while Pi is idle, such as manual holds, releases, and session presets for the active profile, are validated immediately but reach Pi's model and effort when the next prompt is submitted; the footer shows the pending model until then, and a model picked in Pi's own picker cancels the pending change. Only the net change is recorded in the session at that prompt, not every intermediate switch. Changing an inactive profile stores the preset for its next transition. Direct native `/model` or thinking changes are external changes; they do not rewrite a Freeflow preset and may require reconciliation or release automatic control.

### Unsupported legacy configuration

Only the v2 `enabled` / `delegation` / `projection` / `profiles` shape is accepted. Earlier experimental names or fields such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are not migrated. Rewrite legacy configuration manually.

## Settings and user controls

### Settings scopes

| Command | Scope |
| --- | --- |
| `/freeflow settings` | Opens personal overrides for the current repository. |
| `/freeflow settings local` | Same personal/local settings scope. |
| `/freeflow settings repo` | Edits shared `.freeflow/config.json`. |
| `/freeflow settings session` | Edits temporary session enablement/context settings, delegation mode, and complete profile presets. |
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

## How work moves between profiles

Coordinator opens a unit for one outcome and assigns work to a worker; the worker returns a saved report, and Coordinator assesses it, assigns more, or closes the unit. Workers select the tool results that support their report as evidence, and Coordinator can ask the same worker to recover missing evidence without redoing the work. Routing state is recorded in the session, so it survives reloads and compaction. The developer doc [Cognitive Routing](../../dev-docs/subsystems/cognitive-routing.md) describes the lifecycle, tools, evidence selection, recovery, persistence, and the design decisions behind them.

## Context projection

Projection is on by default; set `projection: false` to turn it off. It is where routing's Coordinator saving comes from: the Coordinator, usually the most expensive model, sees selected evidence instead of every worker turn.

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

The legacy Context Virtualization and Conversation History transforms have been removed from the active runtime. Context Control v2 remains planned and unavailable; no current composition or compatibility contract is published.

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

A handoff can leave the Coordinator's earlier cache entry beyond the provider's lookback window even when its prefix is unchanged. On routes with documented explicit breakpoints, Freeflow places a breakpoint on that entry. While a delegated worker runs, Freeflow keeps the suspended Coordinator's cache warm on models that declare a cache lifetime and prices. See [Prompt caching](../prompt-caching.md) for both mechanisms, their limits, and the rules that keep Coordinator views append-only.

### Selected GPT-6 cache-aware effort history

For qualified `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol` requests on supported OpenAI Responses or OpenAI-Codex Responses routes, Freeflow can keep the original request-level effort as a stable baseline and insert trusted `configuration_update` items at validated historical positions when effective effort changes. Other models and unsupported request shapes retain native behavior.

The adapter:

- accepts only supported model, provider/API, endpoint, effort, storage, and request shapes;
- fingerprints the request envelope and complete serialized input prefix;
- records compact native attempt metadata rather than opaque reasoning bodies;
- isolates incompatible ancestry, compaction, branch-summary, and request-envelope changes;
- preserves compatible effort history across supported model round trips and reloads;
- returns the untouched request with its native requested effort when adaptation is unavailable or uncertain.

Local tests cover request construction for the selected models, Low/High transitions, branch and reload behavior, compaction boundaries, append uncertainty, and prefix preservation. Existing Astra live evidence is not a Luna/Sol cache-hit observation. The adapter writes `freeflow-openai-effort-v1`; older `freeflow-astra-effort-v1` entries remain in native session history but are ignored, with no migration. These checks do not establish a server cache hit, a billing discount, provider-wide support, model quality, or a universal cost saving.

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

Projection may reduce Coordinator's worker-history view, but evidence selection and handoff overhead are part of total cost. Turn projection off when debugging context behavior.

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
- the target host exposes the required native Pi APIs;
- no incompatible routing-projection and legacy-context-capability combination.

### A configured worker is not used

A worker must be enabled by the delegation mode. In `both`, Coordinator must choose the worker for each assignment. An unused well-formed profile does not force itself into the route.

### A session preset does not apply

Wait until Pi is idle. Confirm the profile is configured or has a complete session preset before enabling its delegation mode. Active-profile changes reach Pi's model at the next prompt; inactive-profile changes are stored for the next transition. Use session reset/inherit to return to personal or repository configuration.

### A worker returned but work did not close

This is expected. Worker return saves communication and ends worker task permission. Coordinator must assess the result and explicitly close the routing unit or continue with another assignment. Track Work Slice closure is separate.

### Evidence is missing from Coordinator

Determine whether projection is enabled. Confirm the worker selected the result body, not only the call envelope. Inspect selected-scope diagnostics for unavailable, target-representation, or ancestry problems. Recover existing evidence through the attached recovery path rather than rerunning historical effects.

### Resume is blocked

`/freeflow resume` works only at an idle, supported, reconciled boundary. It does not release a manual hold, consume unseen new input, guess an assignment after ancestry changes, or override an unavailable recorded worker.

### Cache status does not show savings

Request-prefix preservation and selected-GPT-6 effort-history adaptation are compatibility mechanisms. Provider expiry, eviction, minimum cacheable length, pricing, and actual cache hits remain provider-owned. Use provider-reported usage at a qualified boundary before making billing claims.

## Related documentation

- [Capabilities](README.md)
- [Workflow](../workflow.md)
- [System prompt architecture](../../dev-docs/subsystems/prompt-assembly.md)
- [Pi integration](../integrations/pi.md)
- [Getting Started](../getting-started.md)
- [Architecture](../../dev-docs/README.md)
- [Release evidence](../release-evidence/README.md)
