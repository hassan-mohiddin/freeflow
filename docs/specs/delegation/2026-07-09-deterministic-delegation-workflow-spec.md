> **Doc ID:** SPEC-2026-07-09-deterministic-delegation-workflow
> **Date:** 2026-07-09
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** 2026-07-09 orchestration design discussion, `skills/delegation-harness/SKILL.md`, `docs/specs/delegation/freeflow-pi-pane-delegation-harness-spec.md`, and `docs/specs/delegation/2026-07-04-delegation-harness-dogfood-fixes-spec.md`.

# Deterministic Delegation Workflow Spec

## Objective

Improve the Freeflow Pi/cmux delegation harness so delegation becomes a deterministic workflow substrate instead of a model-memory burden.

The harness should let users benefit from parallelism, context isolation, efficiency, reliability, and better output quality compared with a single overloaded agent session. Models should reason about the assigned work inside role boundaries. The harness should own routing, state, leases, event delivery, inboxes, wakeups, result views, review loops, and recovery contracts.

North-star rule:

```text
Models reason. Harness schedules, stores, routes, wakes, and enforces.
```

## Assumptions

- The target harness is the visible Pi/cmux pane delegation harness, not local model delegation.
- Delegation may be disabled; when disabled, Freeflow works normally in a single-agent setup.
- When delegation is enabled, the harness owns routing decisions. Tiny tasks may still run inline if the harness grants an inline lease.
- Parent and child panes are visible Pi sessions managed through cmux.
- `.freeflow/delegation/` remains gitignored runtime state, not durable project truth.
- Raw transcripts remain recoverable evidence, not normal parent context.
- Existing low-level tools such as `delegate_spawn`, `delegate_finish`, `delegate_inbox`, `delegate_result`, `delegate_progress`, and `delegate_attention` may be reused, but this spec adds higher-level deterministic routing semantics.

## Problem

The current delegation failure mode is not only weak prompt wording. The deeper problem is that agents are asked to act as their own scheduler and state machine.

Observed or expected failures:

- Orchestrator forgets it is the orchestrator and starts implementing broad work inline.
- Planning-parent begins implementing instead of planning.
- Execution-parent sees a small first slice and becomes the main worker for a broad package.
- Parent agents manually manage too much spawn/wait/result/close state.
- Child communication depends on transcript inspection or repeated polling.
- Alerts can exist but not wake the right parent or user at the right time.
- Compact results may be too small, causing parents to read full JSON or raw transcripts.
- Terminal worker assignments may close too early, losing useful context for fixes.
- Review and verification loops depend on parent memory instead of a deterministic loop contract.

## Design Principles

### 1. Deterministic Harness Around Probabilistic Models

The harness owns:

- task and route state;
- role and lease state;
- pane/session state;
- event logs and alert queues;
- result parsing and result views;
- scheduler decisions;
- wakeup, escalation, retention, and autoclose rules.

The model owns:

- reasoning about product, code, research, review, and synthesis;
- proposing intent;
- producing compact structured reports inside its role.

### 2. Control Plane vs Data Plane

Parents are control-plane agents. Children are data-plane agents.

- Orchestrator: root continuity, user-facing routing, final synthesis.
- Planning-parent: user-guided planning, research synthesis, spec/plan artifacts.
- Execution-parent: execution map, worker assignment, review/verification adjudication.
- Researchers/workers/reviewers/verifiers: bounded evidence, implementation, review, and proof.

### 3. Inbox-Driven, Not Polling-Driven

Parents should not monitor children through repeated polling turns. Children emit durable events. The harness materializes inbox alerts and wakes the parent only when policy says the alert is actionable.

### 4. Progressive Result Views

Store full structured results, but return compact role-specific views by default. Raw transcripts are recovery/debug only.

### 5. Fail Closed With Recoverable Evidence

No hidden/headless fallback children. No ghost panes. No completion claim without stored terminal result evidence. Wake delivery failure must not lose the alert.

## User-Facing Modes

Settings can come later, but the workflow assumes a delegation mode exists.

Recommended eventual modes:

```text
off      normal single-agent workflow; no delegation pressure
suggest  agent may recommend delegation and asks before spawning
on       meaningful work routes through harness; harness may still allow tiny inline work
strict   role/tool policy blocks bypasses unless an explicit bypass lease exists
```

Mode controls the deterministic kernel. It is not just a model instruction.

V1 enforcement decision:

- `on`: consequential actions must route through the harness and use leases where route-aware policy is implemented; ambiguous or unsupported enforcement paths escalate to parent/orchestrator instead of silently proceeding.
- `strict`: role drift, out-of-lease writes, and out-of-lease mutating commands are hard-blocked by tool policy.

## Core Workflow

### 1. Route

Before consequential action in harness mode, the active agent asks the harness what the next valid workflow move is.

```text
delegate_route
```

`delegate_route` is an admission controller, not a magic semantic classifier. The model proposes intent and scope. The harness applies deterministic rules using role, mode, task state, leases, config, and route history.

Initial route decisions:

```text
inline_allowed
route_planning_parent
route_execution_parent
route_worker
route_reviewer
route_verifier
ask_user
blocked
```

Example deterministic rules:

- Orchestrator + broad implementation + no stored execution authorization -> route planning-parent.
- Orchestrator + broad implementation + stored execution authorization -> route execution-parent.
- Caller-provided `hasApprovedPlan` may bias questions, but cannot authorize execution without stored evidence.
- Planning-parent + implementation/edit intent -> blocked or route execution-parent.
- Execution-parent + broad/multi-file implementation -> route worker.
- Leaf agent + spawn-child intent -> blocked.
- User-owned decision unresolved -> ask user or route to planning-parent.
- Tiny single-file reversible change -> inline lease may be granted.

### 2. Apply Route

A route decision should become a deterministic workflow object.

```text
delegate_apply_route(routeId)
```

V1 exposes `delegate_apply_route` as a separate public tool, backed by internal route-application helpers. Do not overload `delegate_route` with an `apply: true` mode in V1.

`delegate_apply_route` validates and materializes the route. It should be idempotent: applying the same route twice must not duplicate panes, layout allocations, leases, or alerts.

Responsibilities:

- validate harness/cmux/Pi readiness;
- validate stored plan approval and execution authorization before execution routing;
- initialize task state if needed;
- request deterministic visible placement from the layout manager;
- reuse or spawn the correct parent/child pane;
- compile a minimal readable Markdown task packet;
- issue role/action/write/command leases;
- wire parent inbox and alert routing;
- write route/application/layout events;
- return compact next state.

Example return:

```json
{
  "status": "applied",
  "taskId": "delegation-v2",
  "routeId": "route_123",
  "spawned": ["planning-parent-1"],
  "reused": [],
  "waitingFor": "PLANNING_REPORT",
  "nextAction": "parent_will_be_woken_on_report"
}
```

### Stored Plan Approval and Execution Authorization

Execution routing is authorized by stored task evidence, not by caller memory.

Canonical V1 events:

```text
planning_report.ready
plan.approved
execution.authorized
```

Minimum execution authorization evidence:

- a stored `PLANNING_REPORT` or equivalent plan artifact marked ready;
- a `plan.approved` event that records the approver (`user` or `orchestrator`), approved artifact ID/path, and any approval constraints;
- an `execution.authorized` event that binds the approved plan to the task/execution map and moves the task to `ready_for_execution`.

`hasApprovedPlan` from a route request is only a hint. If the store lacks the evidence above, `delegate_route` must route to planning or ask for approval instead of routing to execution. `delegate_apply_route` must revalidate this evidence before spawning/reusing an execution-parent or issuing execution leases.

### 3. Planning Phase

The orchestrator starts a planning-parent when work is broad, ambiguous, consequential, architectural, or lacks stored execution authorization.

Planning-parent owns:

- user interview and brainstorming;
- deciding what evidence is needed;
- writing spec and plan artifacts;
- synthesizing researcher/reviewer outputs;
- surfacing open decisions and risks;
- producing `PLANNING_REPORT`.

Planning-parent may perform only bounded orientation probes inline:

```text
max targeted reads/searches: 5
max small command: 1
max small web lookup: 1
no broad repo inventory
no noisy long output
no implementation edits
```

If the evidence need exceeds that budget, the scheduler routes to researcher children.

Researcher owns:

- broad codebase exploration;
- web/current-source research;
- source maps;
- evidence packets;
- comparison notes;
- citation/path-backed summaries.

### 4. Execution Phase

After stored plan approval and execution authorization, the orchestrator starts or reuses execution-parent.

Execution-parent owns:

- execution map;
- package dependency ordering;
- worker assignment;
- write-scope leases;
- review/verification scheduling;
- fix-loop adjudication;
- integration judgment and checkpoint recommendations;
- planned checkpoint commit proposals where explicitly allowed by the user/orchestrator;
- `EXECUTION_REPORT`.

V1 does not perform automatic commits or pushes. Any checkpoint commit remains a user/orchestrator-owned decision unless a later approved design adds explicit commit automation.

Execution-parent should not become the main implementer for broad work.

Workers own implementation within a write lease. Workers do not coordinate with other workers and do not talk to the user directly.

### 5. Review and Verification

Reviewer = semantic judgment.

Verifier = executable/check evidence.

After worker completion, the scheduler decides whether to spawn reviewer, verifier, or both.

Default policy:

- Broad code/runtime changes -> reviewer + verifier.
- Artifact/spec/plan changes -> reviewer.
- Bug fix or completion claim -> verifier, plus reviewer when semantic risk exists.
- Expensive checks -> reviewer first, then verifier if still useful.
- Cheap read-only reviewer/verifier work -> may run in parallel.

A package is complete only when:

```text
worker terminal result accepted
AND required reviewer assessment is pass/pass_with_non_blocking
AND required verifier assessment is pass or accepted_not_run
AND parent adjudicated non-blocking findings, risks, and deviations
```

Assignment state tracks lifecycle (`running`, `completed`, `failed`, etc.). Role assessment tracks judgment (`pass`, `pass_with_non_blocking`, `fail`, etc.). Do not encode reviewer/verifier assessment as assignment state.

## State Machines

Do not collapse all state into a single `running` or `completed` flag. These labels are canonical for V1. Failure contracts may attach reason codes and evidence, but must not invent new state labels without updating this section.

### Task State

```text
created
routing
planning
awaiting_user_approval
ready_for_execution
executing
reviewing
needs_parent_adjudication
blocked
completed
failed
cancelled
```

### Assignment State

Applies to planning-parent, execution-parent, researcher, worker, reviewer, verifier, and post-V1 integrator assignments if integrator support is later approved.

```text
created
assigned
running
waiting_for_parent
attention_required
result_malformed
completed
completed_with_risks
blocked
failed
cancelled
```

### Role Assessment Status

Applies to reviewer/verifier/parent report judgment and is distinct from assignment lifecycle state.

```text
pass
pass_with_non_blocking
fail
blocked
not_run
accepted_not_run
```

Verifier check status may use `pass`, `fail`, `not_run`, or `skipped`; top-level verifier assignment state still uses assignment states above.

### Pane State

```text
not_started
opening
active
idle
retained
stale
closing
closed
open_failed
lost
```

Assignment completion is not pane closure.

Example:

```text
worker assignment = completed
worker pane = retained
```

### Route Application State

```text
pending
applied
already_applied
failed
cancelled
```

`already_applied` is an idempotent return state for duplicate `delegate_apply_route`; it must point to the existing route application, pane allocation, leases, and alerts.

### Alert State

```text
queued
delivered
seen
acked
resolved
escalated
```

Delivery does not imply acknowledgement. Acknowledgement does not imply resolution.

### Lease State

```text
issued
active
exhausted
expired
revoked
```

Every meaningful transition writes an event.

## Scheduler Rules

The scheduler uses task state, route state, registry, active panes, leases, unread alerts, execution map, and config.

Scheduler outputs:

```text
inline_allowed
spawn_agent
reuse_agent
send_followup
wait_for_dependency
block_overlap
escalate_to_parent_or_user
```

Defaults:

```text
max parent orientation probes: 5
max parallel workers: 2
max parallel read-only children: 4
overlapping write scopes: block unless separate worktree support is explicitly enabled
worker panes: retained until review + verification accepted
```

Parallelism is allowed when:

- packages have no dependency edge;
- write scopes do not overlap;
- commands are safe to run concurrently;
- max child/worker limits are not exceeded;
- parent can adjudicate results later.

Sequential execution is required when:

- write scopes overlap in the same checkout;
- one package changes APIs used by another;
- verification depends on prior integration;
- user decision or source-truth conflict is unresolved.

## Layout Manager

The layout manager is a first-class harness component between route application and the cmux adapter.

```text
delegate_route        decides the workflow move
delegate_apply_route  materializes the workflow object
layout manager        allocates visible panes/surfaces
cmux adapter          executes concrete cmux commands
```

The layout manager owns visible placement, not workflow routing. It receives a role/task/layout intent and returns a stored allocation.

Responsibilities:

- anchor all allocation to the caller workspace unless the user explicitly selected another workspace;
- allocate or reuse panes/surfaces for parents, workers, reviewers, verifiers, and scouts;
- keep role-to-pane placement deterministic and registry-backed;
- preserve user focus by default (`--focus false` where supported);
- choose file-backed launch/follow-up delivery paths, never raw multiline text injection into an active Pi TUI;
- record layout allocation, pane refs, surface refs, and prompt/report paths in task state;
- detect missing/stale/lost panes and surface recoverable state to the scheduler;
- make duplicate `delegate_apply_route` reuse the existing allocation instead of creating new panes.

V1 default layout:

```text
left:  orchestrator / user-facing root parent
right: delegation area
  top:    active planning-parent, execution-parent, or primary child
  bottom: secondary child, reviewer, verifier, or scout
```

Manual dogfood can use this directly:

```text
left: orchestrator
right top: read-only child A
right bottom: read-only child B
```

Parallel overflow policy for V1:

- The default visible preset has two child slots.
- If more than two read-only children are allowed by scheduler policy, the layout manager reuses the right-side delegation panes by adding additional surfaces/tabs in deterministic assignment order instead of creating unbounded splits.
- At most two child panes are visible simultaneously by default; additional children remain visible as surfaces in those panes.
- Write-capable workers still obey the scheduler's lower worker limit and write-scope conflict rules.

Later layouts may be configurable, but V1 should prefer one deterministic preset over a broad layout engine.

## Leases and Tool Policy

All consequential edits and mutating commands require an active lease.

Example lease:

```json
{
  "leaseId": "lease_worker_route_kernel",
  "taskId": "delegation-v2",
  "agentId": "worker-route-kernel",
  "role": "worker",
  "actions": ["read", "edit", "run_allowlisted"],
  "writeScopes": ["delegation/src/**", "pi-extension/src/delegation/**"],
  "allowedCommands": ["npm run test:delegation"],
  "maxFilesChanged": 8,
  "expires": "on_assignment_terminal"
}
```

### Lease Storage Contract

Lease storage is append-only plus materialized view:

```text
leases.jsonl          append-only lease events and transitions
active-leases.json    rebuildable policy lookup view
```

V1 `active-leases.json` shape:

```json
{
  "version": 1,
  "taskId": "delegation-v2",
  "rebuiltFrom": {
    "path": "leases.jsonl",
    "eventCount": 12,
    "lastEventId": "lease_evt_012"
  },
  "generatedAt": "2026-07-09T00:00:00.000Z",
  "leasesById": {
    "lease_worker_route_kernel": {
      "leaseId": "lease_worker_route_kernel",
      "state": "active",
      "agentId": "worker-route-kernel",
      "role": "worker",
      "actions": ["read", "edit", "run_allowlisted"],
      "writeScopes": ["delegation/src/**"],
      "allowedCommands": ["npm run test:delegation"],
      "expires": "on_assignment_terminal"
    }
  },
  "activeLeaseIdsByAgent": {
    "worker-route-kernel": ["lease_worker_route_kernel"]
  }
}
```

The policy path reads `active-leases.json` for speed and may rebuild it from `leases.jsonl` when needed. If the active view is missing, unreadable, stale, or fails rebuild validation, policy must fail closed for consequential edits and mutating commands and raise a parent alert. It must not silently fall back to profile prompts or broad allow rules.

Role defaults:

- Orchestrator: route, spawn parents, consume reports, final user-facing closeout. Broad implementation blocked.
- Planning-parent: interview, orientation probes, spawn researchers/reviewers, write spec/plan, submit planning report. Product/runtime implementation blocked.
- Execution-parent: execution map, worker/reviewer/verifier scheduling, fix packets, adjudication, execution report. Broad self-implementation blocked.
- Worker: scoped edits, allowlisted commands, result submission, parent attention requests. Child spawning and user alerts blocked.
- Reviewer: read/review/report. Edits blocked.
- Verifier: allowlisted checks/report. Edits blocked.

Policy blocks should explain the reroute:

```text
Blocked: execution-parent has no broad implementation lease.
Route this package to a worker or request an explicit integration lease.
```

## Communication Model

Communication is durable events plus compact inboxes, not chat transcript monitoring.

### Message Classes

Downward:

- task packet;
- follow-up/fix packet;
- cancel/close/retain lifecycle command.

Upward:

- progress;
- attention/blocker;
- capability gap;
- terminal result;
- planning/execution report.

Root/user-facing:

- user decision needed;
- checkpoint reached;
- task complete;
- harness failure or parent unreachable.

### Event Bus

The event bus is repo-local and file-backed.

```text
.freeflow/delegation/tasks/<taskId>/
  events.jsonl
  routes.jsonl
  route-applications.jsonl
  leases.jsonl
  active-leases.json
  wake-attempts.jsonl
  parent-alerts.json
  registry.json
  layout.json
  execution-map.json
  agents/<agentId>/events.jsonl
  agents/<agentId>/result.json
```

Events are append-only evidence. Alerts, status views, dashboards, wake packets, lease views, layout views, and retention decisions are derived from events and canonical state.

### Result Transport and Tool Output Format

Child chat is observational only. It is useful for visible progress, but it is not the authoritative result channel.

Normal result flow:

```text
child calls delegate_progress / delegate_attention / delegate_finish
-> harness stores structured event/result evidence
-> parent receives an inbox alert or next-turn summary
-> parent calls delegate_result(view=default)
-> harness returns a compact role-specific rendered view
```

Layering:

- Tool arguments/internal APIs may use structured JSON because the harness needs typed data.
- Durable store files may use JSON/JSONL because they are machine evidence and rebuild inputs.
- Model-visible tool output should default to compact text, Markdown, or dense pipe-delimited rows, not raw JSON.
- Full/raw JSON views require explicit request and are recovery/debug surfaces, not normal parent context.

Default compact row output may use pipe-delimited rows such as:

```text
ALERT|P1|reviewer-runtime|blocking finding|use delegate_result agent=reviewer-runtime view=default
RESULT|worker-route-kernel|completed_with_risks|checks=1 pass|risks=1|files=2
```

Literal `|` in fields should be escaped as `¦`; field newlines should collapse to spaces. Role-specific Markdown is preferred when the output needs short paragraphs or findings.

### Alert Priorities

```text
P0 user/safety attention
P1 parent action required
P2 terminal result or checkpoint
P3 progress/info
```

P0 examples:

- user decision needed;
- parent unreachable and task blocked;
- destructive/high-risk ambiguity;
- harness invariant violation.

P1 examples:

- child blocked;
- capability gap;
- blocking reviewer finding;
- verifier failed;
- malformed result.

P2 examples:

- worker completed;
- planning report ready;
- execution report ready;
- clean reviewer pass.

P3 examples:

- progress update;
- child spawned;
- child retained/closed.

Wake defaults:

- P0 always notifies/escalates.
- P1 queues an alert and wakes the parent only when a reliable idle signal is available.
- P2 batches alerts and wakes the parent only when a reliable idle signal is available and waking is useful.
- P3 never wakes by default.
- Never inject wake text into a busy, unknown, or active parent turn.
- Unread alert summary appears in the next runtime context for the direct parent, including normal orchestrator/root Pi sessions, not only delegated child sessions.
- If no reliable idle signal exists in V1, durable queued alerts plus next-turn runtime context are the accepted wake mechanism.

### Wake Packet

When the parent is known idle through a reliable signal, a wake packet may be sent into its pane:

```text
DELEGATION_WAKE
Task: delegation-v2
Priority: P1
Unread actionable alerts: 2
1. reviewer-runtime blocking finding
2. verifier-runtime failed npm run test:delegation
Required action: call delegate_inbox for task delegation-v2.
END_DELEGATION_WAKE
```

When the parent is busy, queue the alert and inject a compact summary on the next turn.

When the parent is lost, escalate upward to the parent’s parent or the user.

## Dynamic Result Views

`delegate_result` should support progressive views.

```json
{
  "taskId": "delegation-v2",
  "agentId": "worker-route-kernel",
  "view": "default",
  "maxBytes": 6000
}
```

Views:

```text
alert
summary
default
findings
checks
files
evidence
risks
diff
full
raw
```

Default rendering is role-specific and adaptive.

Researcher default:

- summary;
- key findings;
- source references;
- unknowns;
- recommended next reads;
- artifact paths.

Worker default:

- summary;
- files changed;
- checks run;
- risks/deviations;
- review recommendation;
- evidence pointers.

Reviewer default:

- assessment (`pass`, `pass_with_non_blocking`, `fail`, or `blocked`);
- findings with severity;
- evidence locations;
- recommendation.

Verifier default:

- assessment plus individual check statuses;
- checks run;
- output IDs;
- completion-claim support;
- next recommended check.

Parent report default:

- status;
- decisions;
- open questions;
- artifact paths;
- execution guidance;
- risks.

Rules:

- `delegate_inbox` returns alert/summary view only.
- `delegate_result` default should normally be enough for parent action.
- Default model-visible output is compact text/Markdown/rows, not raw JSON.
- Blocking findings and failed checks always appear in default view.
- Full/raw JSON views require explicit request.
- Raw transcript is never injected automatically.
- Child chat output is never sufficient completion evidence without a stored result/report event.

Metric to track:

```text
result_full_view_rate
```

If high, default result rendering is failing.

## Review and Fix Loop

Default loop:

```text
worker result
-> reviewer/verifier scheduled by policy
-> parent consumes compact results
-> parent adjudicates findings
-> accepted blocker sends fix packet to retained worker
-> loop repeats up to cap
```

Fix packet contains:

- original assignment ID;
- accepted finding IDs;
- narrowed instructions;
- unchanged or narrowed write scope;
- allowed commands;
- expected fix result;
- stop conditions.

Default loop cap:

```text
maxReviewFixLoops = 2
```

After cap, escalate to execution-parent/orchestrator for adjudication.

## Retention and Autoclose

Completion does not imply closure.

Defaults:

- Parents retained until orchestrator/user closes task.
- Worker completed -> retained until review and verification are accepted.
- Worker blocked/failed/malformed -> retained until parent decides retry/cancel/respawn.
- Researcher clean result -> close after parent consumes result.
- Reviewer clean pass -> close after parent consumes result.
- Reviewer non-blocking findings -> close only after parent saves/adjudicates compact findings.
- Reviewer blocking findings -> retain until parent adjudicates.
- Verifier pass -> close after parent consumes output IDs.
- Verifier fail -> retain until parent consumes evidence.
- Debug mode -> retain all panes.

Autoclose only after parent consumption/ack. Do not close a terminal child before its direct parent has enough evidence.

## Failure Contracts

Every failure must define state, observer, forbidden behavior, and recovery path.

### Spawn Failed

State:

```text
assignment: failed
pane: open_failed
alert: parent P1
```

Must not happen:

- ghost child;
- fake running state;
- hidden/headless fallback.

Recovery:

- retry spawn;
- work inline if route allows;
- disable harness for task;
- ask user to repair cmux/Pi setup.

### Packet Delivery Failed

State:

```text
assignment: failed
pane: active or lost depending evidence
alert: parent P1
```

Recovery:

- retry once;
- cancel and respawn;
- mark failed with evidence.

### Child Stale

State:

```text
assignment: attention_required or failed after timeout
pane: stale if visible, lost if unavailable
alert: parent P1
```

Recovery:

- capture screen;
- send ping/follow-up;
- cancel/respawn;
- route work to new child.

### Malformed Result

State:

```text
assignment: result_malformed or attention_required
alert: parent P1
```

Must not happen:

- malformed prose treated as completion;
- autoclose before repair/adjudication.

Recovery:

- one repair request to retained child;
- if still malformed, parent reads full/raw recovery view and adjudicates.

### Alert Delivery Failed

State:

```text
alert: queued
deliveryAttempt: failed
```

Must not happen:

- alert deleted;
- alert marked acked;
- parent assumed to have seen it.

Recovery:

- unread summary in next runtime context;
- rebuild inbox from events/results if needed.

### Parent Pane Lost

State:

```text
parent pane: lost
children: retained/running depending state
alert: parent’s parent P0/P1
```

Recovery:

- orchestrator adopts task;
- respawn parent with compact task state;
- cancel child subtree if ownerless work is unsafe.

### Duplicate `delegate_apply_route`

State:

```text
routeApplication: already_applied
return existing application ids, layout allocation, lease ids, and alert ids
```

Must not happen:

- duplicate panes;
- duplicate leases;
- duplicate alerts.

### Worker Write Conflict

State:

```text
routeApplication: failed or route decision blocked
no lease issued
alert parent if attempted by child
```

Recovery:

- run sequentially;
- split scope;
- use separate worktree in a later feature.

### Review Loop Exceeded

State:

```text
task: needs_parent_adjudication
alert: execution-parent/orchestrator P1
```

Recovery:

- accept risk;
- revise plan;
- ask user;
- split package;
- open follow-up.

### Layout Allocation Failed

State:

```text
routeApplication: failed
pane: not_started or lost depending evidence
alert: parent P1
```

Must not happen:

- focus-stealing workaround;
- hidden/headless child fallback;
- duplicate panes created by retry without idempotency check.

Recovery:

- retry allocation from stored route/layout intent;
- choose an alternate visible placement in the same workspace;
- ask user to repair cmux layout/socket access;
- cancel route application if visible placement is unavailable.

### Lease Store or Policy Unavailable

State:

```text
assignment: attention_required or failed depending scope
alert: parent P1/P0 for safety-sensitive actions
```

Must not happen:

- consequential edit or mutating command allowed without active lease evidence;
- fallback to prompt-only enforcement;
- active lease view trusted after rebuild mismatch.

Recovery:

- rebuild `active-leases.json` from `leases.jsonl`;
- if rebuild succeeds, retry policy check;
- if rebuild fails, block action and escalate to parent/orchestrator.

### Expired or Out-of-Lease Action

State:

```text
assignment: attention_required
lease: expired, exhausted, or absent
alert: parent P1
```

Must not happen:

- out-of-scope write or mutating command proceeds;
- parent/execution-parent silently widens the lease.

Recovery:

- request a new route/application lease;
- narrow the action to the active lease;
- escalate capability gap to parent.

### Parent Runtime Context Injection Failed

State:

```text
alert: queued
runtimeContextDelivery: failed
```

Must not happen:

- alert marked seen/acked/resolved;
- alert dropped because direct wake is unavailable;
- parent assumed to have read child chat.

Recovery:

- keep alert queued;
- retry next-turn context injection;
- expose through `delegate_inbox`;
- escalate upward if parent is lost or repeatedly unreachable.

### cmux Unavailable Mid-Task

State:

```text
pane: lost
task state remains recoverable from store
```

Must not happen:

- silent hidden fallback.

Recovery:

- restore cmux;
- read stored results;
- capture if possible;
- respawn/adopt/cancel.

## Commands

Expected repo commands for implementation verification:

```bash
npm run build
npm run test:delegation
npm run test:pi-extension
npm run test:router
```

Focused tests should be added or updated under:

```text
delegation/tests/**
pi-extension/tests/**
evals/prompts/**
evals/registries/**
```

## Project Structure

Current relevant paths:

```text
delegation/src/                 core delegation store, protocol, policy, packet, cmux, layout, execution modules
delegation/tests/               core harness tests
pi-extension/src/delegation/     Pi tool surface and delegated runtime integration
pi-extension/src/runtime-context.ts normal parent/orchestrator runtime context injection path
pi-extension/tests/              Pi extension tests
skills/delegation-harness/       agent-facing behavioral guidance
docs/specs/                     specs
docs/plans/                     implementation plans
evals/prompts/                  behavior eval prompts
evals/registries/               eval metadata and skill evidence
.freeflow/delegation/            runtime task state, gitignored
```

## Code Style and Interface Shape

Prefer additive typed contracts. Use discriminated unions for route decisions and state transitions.

Example route result shape:

```ts
type RouteDecision =
  | { kind: "inline_allowed"; lease: InlineLease; reasonCodes: string[] }
  | { kind: "route_required"; routeId: string; targetRole: DelegationRole; reasonCodes: string[] }
  | { kind: "ask_user"; question: string; reasonCodes: string[] }
  | { kind: "blocked"; reason: string; suggestedReroute?: DelegationRole };
```

Do not expose internal file layout as the only interface. Parent agents should consume tool-returned compact envelopes and use JSON/full/raw paths only for recovery.

## Testing Strategy

Required eval/test families:

1. Role drift:
   - orchestrator does not broad-implement;
   - planning-parent does not implement;
   - execution-parent does not become broad worker.
2. Routing/apply idempotency:
   - duplicate apply does not duplicate panes, layout allocations, leases, or alerts.
3. Layout allocation:
   - apply route allocates deterministic visible panes/surfaces without focus stealing;
   - duplicate apply reuses existing layout allocation;
   - lost/stale pane state is recoverable.
4. Lease enforcement:
   - worker write-scope violation blocked;
   - leaf child cannot spawn children;
   - parent orientation budget enforced.
5. Alert/wake behavior:
   - idle parent receives wake packet when a reliable idle signal exists;
   - if no reliable idle signal exists, alert remains queued and next-turn runtime context includes the unread summary;
   - busy/unknown parent gets queued alert and next-turn summary, never unsafe injected text;
   - normal orchestrator/root sessions receive unread summaries through the normal runtime-context path;
   - lost parent escalates upward.
6. Dynamic result views and output format:
   - default view includes blocking findings/failed checks;
   - model-visible output defaults to compact text/Markdown/rows, not raw JSON;
   - full/raw are not returned unless requested.
7. Review/fix loop:
   - blocking reviewer finding sends fix packet to retained worker;
   - loop cap escalates.
8. Malformed result recovery:
   - one repair attempt;
   - no completion claim from malformed output.
9. Tiny inline escape hatch:
   - tiny task receives inline lease and spawns no parents.

Core behavior scenarios for v1 acceptance:

1. Orchestrator receives a broad implementation request and routes instead of editing.
2. Planning-parent is asked to patch during planning and does not implement.
3. Execution-parent receives a broad multi-slice plan and routes worker ownership instead of self-implementing.
4. Worker write-scope violation is blocked and surfaced as a parent alert/capability gap.
5. Child terminal result queues a parent alert and is visible through `delegate_inbox` without transcript scanning.
6. Busy or unknown parent state does not receive unsafe injected wake text.
7. Blocking reviewer finding routes a fix packet to the retained worker.
8. Verifier failure preserves output evidence and blocks package completion.
9. Malformed child result triggers repair/adjudication instead of completion.
10. Duplicate `delegate_apply_route` returns existing application state without duplicate panes/layout allocations/leases/alerts.
11. Lost parent pane escalates upward or becomes adoptable instead of leaving children ownerless.
12. Tiny reversible task receives an inline lease and spawns no parents.
13. Applying a parent/child route allocates or reuses a deterministic no-focus cmux layout.

Acceptance bar for v1:

```text
11/13 core scenarios pass
0 role-drift regressions in strict harness mode
0 duplicate child spawn on repeated apply_route
0 completion claims without stored terminal result/report evidence
0 raw JSON/full transcript returned by default result or inbox views
```

## Boundaries

### Always

- Store meaningful state transitions as events.
- Return compact parent-facing envelopes before raw JSON/transcript.
- Treat child chat as observational; stored result/report events are authoritative.
- Allocate delegation panes through the layout manager, not model memory.
- Enforce leases on consequential edits and mutating commands.
- Keep final user-facing completion claim with orchestrator.
- Treat user-owned decisions as user/orchestrator decisions, not child choices.
- Fail closed when cmux/Pi/delegation preflight is unavailable.

### Ask First

- Changing public command/tool names.
- Adding new slash command surface beyond existing delegation command/settings direction.
- Enabling automatic commits or pushes.
- Adding multi-worktree automation.
- Changing retention defaults that could close panes earlier.
- Turning advisory route decisions into stricter blocking behavior outside strict mode.

### Never

- Run hidden/headless child fallback when visible cmux delegation is unavailable.
- Treat raw transcript as normal completion evidence.
- Let leaf children spawn children.
- Let two workers write overlapping scopes in the same checkout.
- Mark alert delivered/acked/resolved merely because wake delivery was attempted.
- Claim task completion without stored terminal result/report evidence.

## MVP Scope

V1 includes:

- `delegate_route` contract and deterministic rule engine;
- `delegate_apply_route` idempotent route materialization;
- deterministic layout manager for visible cmux pane/surface allocation;
- role leases and tool policy enforcement;
- event bus + inbox alert priority model;
- proof-gated idle-parent wake packet behavior and required busy/unknown-parent queued-alert behavior;
- dynamic `delegate_result` views with compact non-JSON default output;
- authoritative stored result/report transport through delegation tools, not child chat scraping;
- basic worker -> reviewer/verifier -> fix loop;
- retention/autoclose defaults;
- evals for role drift, idempotency, layout, lease enforcement, alerts, result views, fix loop, malformed recovery, and tiny inline routing.

V1 explicitly excludes:

- expanded settings UI;
- full dashboard;
- multi-worktree automation;
- learned/smart routing;
- advanced scheduling optimization;
- user-custom role definitions;
- automatic commits/pushes;
- cross-host delegation;
- local model delegation.

## Success Criteria

A real broad task should demonstrate:

- orchestrator routes instead of implementing;
- planning-parent plans instead of implementing;
- execution-parent coordinates instead of self-implementing;
- workers do bounded implementation under leases;
- reviewer/verifier work happens when policy requires it;
- blocking review loops back to retained worker;
- parent/orchestrator consume compact inbox/result views;
- no raw transcript is needed for normal operation;
- final completion claim includes stored terminal result/report evidence.

## Resolved V1 Decisions

- `delegate_apply_route` is a separate public tool backed by internal route-application helpers.
- `on` mode requires harness routing/leases where implemented; unsupported or ambiguous enforcement paths escalate to the parent/orchestrator instead of silently proceeding. `strict` mode hard-blocks role drift, out-of-lease writes, and out-of-lease mutating commands.
- Direct cmux wake packets are optional and proof-gated; durable queued alerts plus next-turn runtime context are the required V1 wake path.
- Approved-plan authority comes from stored state. Caller-provided `hasApprovedPlan` is only a hint. Execution routing requires `planning_report.ready`, `plan.approved`, and `execution.authorized` evidence that moves the task to `ready_for_execution`.
- Lease storage uses an append-only `leases.jsonl` audit log plus the V1 `active-leases.json` view defined in this spec. The active view can be rebuilt from the log, and policy fails closed if it cannot be trusted.
- Layout allocation is harness-owned. Route application must use the layout manager and stored registry/layout state rather than asking models to remember pane placement.
- Child chat is not authoritative result transport. Delegation tools store result/report evidence, and parent-facing tool outputs default to compact text/Markdown/rows rather than raw JSON.

## Open Questions

- What exact parent idle/busy signal, if any, can Pi/cmux expose reliably enough for optional direct wake packet delivery after queued-alert behavior is working?
- What are the initial exact `maxBytes` defaults for each result view?
- Should malformed result repair remain exactly one attempt after V1, or become configurable?
- Which existing tests/evals should be superseded versus extended?
