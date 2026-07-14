# Deterministic Delegation Workflow

> **Doc ID:** SPEC-2026-07-09-deterministic-delegation-workflow
> **Date:** 2026-07-09
> **Last Updated:** 2026-07-11
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** Live delegation implementation and tests; `AGENTS.md`; `CONTEXT.md`; `skills/delegation-harness/`; prior delegation specs; 2026-07-11 architecture, security, migration, and artifact reviews; explicit owner decisions in the current workflow.

## Intended Outcome

Freeflow's Pi/cmux delegation harness should provide deterministic workflow ownership around probabilistic agents.

```text
Models reason inside assigned roles.
The harness owns admission, authority, materialization, lifecycle evidence, communication, retention, and recovery.
```

A parent should request an outcome without coordinating store writes, lease transitions, layout allocation, cmux startup, result parsing, alert publication, cleanup, or retry order.

## Decision Status

### Settled

- Freeflow retains exactly three modes: `conversation`, `workflow`, and `strict-workflow`.
- Delegation is an optional capability inside those modes, not a fourth mode system.
- `delegate_apply_route` owns actual parent and child spawn/reuse.
- `delegate_result` is a pure read. Reading does not consume, acknowledge, close, or change lifecycle state.
- Parent consumption/acceptance and pane closure are explicit later transitions.
- `delegate_spawn` remains a compatibility/recovery API during migration but cannot bypass routed authority when workflow enforcement applies.
- Legacy `FFRESULT`, `PLANNING_REPORT`, and `EXECUTION_REPORT` parsing remains until supported consumers migrate and removal evidence exists.
- Execution authorization is causal and predecessor-bound, not reconstructed from matching strings.
- The owner-facing authorization surface is exactly `delegate_request_execution_authorization({ taskId })`; host-owned TUI/RPC confirmation supplies owner authority.
- Lease IDs are monotonic after terminal transitions.
- The first accepted terminal outcome is immutable. Identical retries reconcile; conflicting retries cannot overwrite it.
- No hidden/headless fallback is allowed when visible cmux delegation is unavailable.

### Open Implementation Decisions

These do not change the settled behavior above:

- which legacy direct-spawn options remain supported during the adapter window: alternate checkout/cwd, custom command authority, integrator role, retention, direction, focus, and saved-session behavior;
- initial `maxBytes` defaults for result views;
- concrete internal filenames for startup and terminal publication journals, provided the canonical evidence and recovery contracts below hold.

A new public approval surface or narrowing of observable direct-spawn compatibility requires an owner checkpoint before registration or contraction.

### Deferred

- optional direct wake packets without a proven idle signal;
- multi-worktree automation;
- learned routing;
- dashboards and expanded settings;
- automatic commit or push;
- contraction of direct spawn or legacy result parsing.

## Current Evidence

The current implementation provides useful candidate foundations:

- a pure route kernel;
- stored route decisions and applications;
- deterministic layout planning;
- routed worker/reviewer/verifier/researcher materialization;
- delegated lease-aware edit and command policy;
- fail-closed active lease views;
- priority-aware parent alerts;
- queue-first wake-attempt evidence;
- bounded unread summaries for delegated and root Pi sessions;
- file-backed child packets and visible cmux startup.

The current implementation does not yet satisfy this spec because:

- planning/execution-parent route applications can be marked applied without starting a parent;
- concurrent route/apply or direct-spawn calls can pass check-before-side-effect gates together;
- authorization can be accepted out of order;
- exhausted or revoked lease IDs can be reactivated;
- terminal results can be overwritten and are published through duplicated orchestration paths;
- `delegate_result` currently closes panes and rewrites assignment status;
- direct spawn remains an independent authority path and defaults to focus-taking behavior;
- root/non-delegated callers can select child lifecycle identity through parameters when delegated environment identity is absent;
- alert acknowledgement/global scope relies too heavily on caller-provided IDs and flags;
- already-written layout-only parent applications and unversioned running assignments lack an adoption contract;
- route/apply does not yet replace verifier command authority, integrator, alternate-checkout, and other protected direct-spawn cohorts;
- role-aware result projection is not yet owned by the core result-view module.

## Scope

### In Scope

- route admission and route application;
- visible parent/child startup and reuse;
- deterministic layout allocation;
- plan approval and execution authorization evidence;
- role, action, command, and write-scope leases;
- terminal result/report ingestion;
- parent alerts and conservative wake delivery;
- pure role-aware result views;
- separate assignment, assessment, pane, consumption, and alert state;
- retained-worker review/fix routing;
- migration of direct spawn, legacy result producers, legacy parent applications, and unversioned running assignments;
- scoped lifecycle and parent-alert ownership;
- targeted serialization of canonical layout, registry, execution-map, startup, and terminal writers;
- failure and recovery contracts for each consequential operation.

### Out of Scope

- new Freeflow modes;
- hidden/headless child execution;
- arbitrary user-defined roles;
- cross-host delegation;
- local-model delegation;
- broad Output Router redesign;
- generalized event-sourcing or store-wide transaction frameworks;
- broad file decomposition based only on module size;
- removal of compatibility paths without migration evidence.

## Actors And Ownership

### Orchestrator

Owns user-facing continuity, owner decisions, final closeout, and final commit/push choice. It starts planning or execution only through stored route and authorization evidence.

### Planning Parent

Owns discovery, research synthesis, spec/plan artifacts, artifact-review loops, and `PLANNING_REPORT`. It does not implement product/runtime work.

### Execution Parent

Owns the execution map, work-package assignment, review/verification adjudication, integration, planned intermediate checkpoints, and `EXECUTION_REPORT`. Broad implementation belongs to workers.

### Leaf Children

- Researcher: evidence gathering; no mutation.
- Worker: scoped implementation under leases.
- Reviewer: independent judgment; no fixes.
- Verifier: allowed checks and claim-to-evidence assessment; no fixes.
- Integrator: bounded mechanical integration when explicitly assigned.

Leaf children do not own product decisions, source-truth changes, child spawning, final closeout, or push.

## Capability And Mode Contract

Delegation effectiveness is derived from existing Freeflow state:

| Freeflow mode | Delegation capability | Behavior |
| --- | --- | --- |
| `conversation` | disabled or enabled | Read-only discussion and inspection. No mutating route application, direct spawn, or lifecycle mutation. |
| `workflow` | disabled | Normal single-agent workflow. Delegation tools do not create authority. |
| `workflow` | enabled | Consequential delegation uses route then apply. Compatibility spawn may execute only a stored routed or recovery assignment. |
| `strict-workflow` | disabled | Strict single-agent workflow. |
| `strict-workflow` | enabled | Same routed authority as workflow plus hard role, lease, write, and command gates. |

There is no separate `off`, `suggest`, `on`, or `strict` delegation-mode taxonomy.

A recovery route is still a route. In workflow enforcement, recovery authority is stored route/application evidence with a new assignment or attempt identity; it is not an independently issued direct-spawn bypass.

## Core Workflow

```text
intent
-> delegate_route
-> stored route decision
-> delegate_apply_route
-> startup/materialization outcome
-> child lifecycle result or parent report
-> canonical terminal outcome
-> parent alert
-> pure delegate_result projection
-> explicit parent adjudication/consumption
-> retention, fix route, close, or next phase
```

### Route Admission

`delegate_route` is a deterministic admission controller. The model proposes intent and bounded facts; the harness decides the valid workflow move from role, current mode, task state, stored authorization, active leases, config, and route history.

Initial outcomes:

```text
inline_allowed
route_required(targetRole)
ask_user
blocked
```

Caller hints such as `hasApprovedPlan` are never authority.

### Route Application

`delegate_apply_route(routeId)` materializes the stored decision. It does not trust caller-provided target role, profile, scope, command, or layout substitutions.

A successful parent or child application includes:

- validated route and caller relationship;
- required approval/authorization evidence;
- assignment and startup-attempt identity;
- compiled file-backed packet;
- role/profile/tool policy;
- required leases;
- deterministic layout allocation;
- visible cmux pane/surface and launch command evidence;
- running assignment state;
- parent inbox/result expectations;
- committed route application.

`applied` means the required workflow object exists. A parent route cannot be `applied` while waiting for a report from a parent that was never started.

Ask-user and blocked routes produce no lease, layout, registry, pane, startup, or applied-state mutation.

## Canonical Identities

### Task And Route

- `taskId` identifies the delegation task.
- `routeId` identifies one stored admission decision.
- `routeApplicationId` identifies materialization of that route.

### Assignment And Startup Attempt

- `assignmentId` identifies one role assignment and normally matches the agent ID.
- `attemptId` identifies one startup attempt for that assignment and exists before startup or terminal publication can occur.
- The canonical startup and terminal ownership key is `(taskId, assignmentId, attemptId)`.

Assignment/attempt identity is a prerequisite shared by startup and terminal publication; it is not created only when a pane starts. Task packets, manifests, lifecycle environment, accepted outcomes, leases, and recovery evidence carry or resolve the same attempt identity.

For routed application, `attemptId` is deterministically derived from the route/application. For compatibility calls, the adapter must resolve an existing routed/recovery assignment and attempt. A new logical attempt requires a new attempt identity; a new assignment requires a new assignment identity.

Known unversioned legacy assignments may receive a deterministic synthetic legacy attempt identity derived from immutable stored manifest facts. That identity permits the already-running assignment to finish under existing authority only; it cannot widen authority, restart, receive a fix, or become a new routed attempt. New work requires a new versioned routed attempt.

A startup fingerprint contains the immutable facts that define equivalence:

```text
role/profile
parent assignment
cwd/worktree
write scopes
allowed commands or approved verifier checks
packet objective/source identity
layout and retention intent
route or recovery authority
protocol/profile schema versions
```

Same key and same fingerprint is an idempotent retry or reuse. Same key and different fingerprint is a conflict and fails closed.

### Execution Identity

Before execution authorization, the harness creates a minimal execution envelope:

```text
executionId
schemaVersion
canonical taskId
canonical execution-map path
approved plan artifact identity
planning-ready event ID
plan-approved event ID
createdAt
```

Authorization binds this immutable tuple. The execution map may initially contain no work packages. The execution parent populates and revises packages under the same `executionId` after authorization.

Changing package content or revision does not invalidate authorization. Changing task, schema version, canonical map path, approved plan identity, or predecessor event IDs requires a new execution envelope and authorization chain.

### Terminal Outcome

- `terminalOutcomeId` identifies the accepted terminal outcome for one assignment attempt.
- A normalized content hash supports identical-retry detection; it is not caller authority.

### Lease

Every lease includes `taskId`, `agentId`, role, actions, resource authority, source, and expiry contract. A replacement/fix lease has a new ID and may link to its predecessor for audit.

## Plan Approval And Execution Authorization

Canonical order:

```text
planning_report.ready
-> plan.approved
-> execution envelope created
-> execution.authorized
-> task ready_for_execution
```

`plan.approved` records:

- planning-ready predecessor ID;
- plan artifact identity;
- approver (`user` or authorized orchestrator acting on explicit user approval);
- constraints;
- timestamp.

`execution.authorized` records:

- planning-ready and plan-approved predecessor IDs;
- execution ID;
- canonical task and execution-map identity;
- approved plan identity;
- authorization constraints;
- timestamp.

Write-time and reconstruction-time validation require the same causal order and bindings. A later approval cannot retroactively authorize an earlier execution event. Matching paths without predecessor references are insufficient.

The normal user/orchestrator workflow records approval and authorization through `delegate_request_execution_authorization({ taskId })`. The caller cannot supply approver or execution identity. Host-owned TUI/RPC confirmation is the owner-authority boundary; delegated sessions and unsupported no-UI modes fail closed before prompting or mutation.

## Failure Unit: Planning-Report Publication

All direct report submission, structured planning-parent finish, and compatible runtime-parser paths publish planning reports through one semantic operation.

### Validation And Evidence Classes

The operation validates report structure and status before accepted-state mutation. A ready or ready-with-open-questions report must also identify one effective plan artifact. It classifies each submission as:

- **accepted publication:** immutable report evidence eligible to become current accepted planning source truth;
- **rejected diagnostic:** immutable malformed/conflicting evidence that never creates, replaces, or mutates accepted planning-report state.

Rejected diagnostics use distinct evidence identities and paths. They may create malformed-report events and alerts, but cannot create `planning_report.ready`, overwrite accepted raw/JSON evidence, or block a later corrected publication.

### Commit And Visibility

The accepted publication record is the commit point and trust anchor for report content. The latest accepted publication is current planning state regardless of whether its status is ready, ready-with-open-questions, or blocked.

A ready or ready-with-open-questions publication creates `planning_report.ready` only after its immutable accepted evidence exists. The readiness event binds the publication identity, exact plan-artifact identity, and accepted evidence pointers. A blocked publication creates no readiness event. Once committed, it supersedes any earlier ready publication and invalidates execution authorization derived from that earlier readiness event. Execution remains unavailable until a later ready publication receives fresh owner confirmation and authorization.

Fixed legacy planning-report paths may remain compatibility projections during migration. They are not authority and may be repaired from the latest accepted publication record, including a blocked publication. Projection failure cannot make an accepted publication falsely absent, replace it with rejected evidence, or authorize evidence that was not committed.

### Retry, Replacement, And Recovery

- An identical retry returns or reconstructs the same accepted publication and readiness identity.
- A conflicting malformed retry is retained only as rejected diagnostic evidence.
- A later valid ready replacement creates a new accepted publication and readiness predecessor; prior authorization no longer authorizes the replacement plan.
- A later valid blocked publication becomes current accepted planning state, creates no readiness predecessor, and invalidates authorization bound to every earlier ready publication.
- An identical blocked retry reconciles the same accepted blocked publication. A later corrected ready publication creates a new readiness predecessor and requires fresh owner confirmation.
- Authorization write and reconstruction require the bound ready publication to remain the latest accepted planning publication, not merely the latest readiness event.
- Interruption after accepted commit reconciles missing projections/events from the accepted publication identity without accepting a second conflicting publication.
- Source assignment/attempt identity is bound when publication comes from a delegated planning parent; root direct submission cannot impersonate delegated lifecycle identity.

Forbidden outcomes:

- malformed input creating a canonical-looking accepted report;
- rejected evidence overwriting or mutating prior accepted evidence;
- readiness authority pointing to missing or uncommitted accepted evidence;
- execution remaining authorized after a later accepted blocked planning publication;
- different adapters applying different acceptance, retry, supersession, or preservation semantics;
- a returned rejection hiding an accepted commit that may have occurred.

## Failure Unit: Startup And Materialization

The startup coordinator hides route/direct compatibility choreography behind one outcome-level operation.

### Claim

Before leases, layout mutation, registry mutation, pane creation, or command delivery, the coordinator serializes on the startup key and records a claim containing its fingerprint and authority source.

Authority sources:

```text
routed
routed_recovery
direct_compat_adapter
```

`direct_compat_adapter` identifies transport, not independent authority. It must reference a routed or routed-recovery claim when workflow enforcement applies.

### Commit

Startup commits `running` only after durable evidence exists for:

- assignment/manifest;
- packet path and policy;
- lease identity/state;
- layout allocation;
- visible pane/surface refs;
- launch command identity;
- successful command delivery attempt;
- running status and startup event.

Only then may route application commit `applied`.

### Retry And Recovery

- Concurrent equivalent callers observe the same claim.
- An identical completed call returns the existing result.
- A conflicting fingerprint fails without mutation.
- A failed pre-delivery attempt revokes authority and cleans up owned pane state when safe.
- If delivery may have occurred before a crash, recovery inspects stored manifest/surface evidence. It adopts or raises parent attention; it never blindly sends a second startup command.
- A stale claim may be adopted only through stored ownership and liveness evidence.
- If safe adoption or cleanup cannot be proved, the assignment becomes attention-required/failed and the parent chooses a new attempt.

Forbidden outcomes:

- duplicate pane or child process;
- duplicate lease or registry entry;
- route marked applied before required startup;
- focus-stealing fallback;
- hidden/headless fallback;
- compatibility call widening routed authority.

## Lease Contract

Lease transitions are monotonic:

```text
issued -> active -> exhausted | expired | revoked
```

`active -> active` is allowed only as an identical idempotent observation. Exhausted, expired, or revoked lease IDs cannot become issued or active again.

A consequential delegated edit or command requires one same-task, same-agent, same-role active lease containing both the action and matching resource authority. Authority is not composed across leases.

Missing, malformed, stale, or irreconcilable active-lease views fail closed and alert the parent. A new route/fix/recovery attempt issues a new lease ID.

## Failure Unit: Terminal Outcome Publication

All direct lifecycle results, parent reports, and legacy parser results normalize through one assignment-scoped operation.

### Claim And Commit Point

The operation serializes on `(taskId, assignmentId, attemptId)` and records a terminal claim before publication.

The commit point is one immutable `terminal.accepted` record containing:

- terminal outcome ID;
- assignment/attempt identity;
- role and normalized outcome;
- normalized evidence and content hash;
- source transport;
- accepted timestamp.

That accepted record is canonical source truth. Result JSON, assignment status, lease exhaustion/revocation, agent/task events, and parent alerts are materialized effects derived from it.

### Before Claim And Commit

Envelope, identity, role, status vocabulary, and role-native evidence validation occur before a terminal claim can own the assignment attempt. A malformed submission is stored as rejected diagnostic evidence but creates no terminal claim and cannot block a later corrected submission.

After validation and claim creation:

- an identical caller may wait for or adopt a stale claim under the same lock and fingerprint;
- a conflicting valid payload cannot replace the claim; it is stored as rejected evidence and raises parent attention when consequential;
- a stale uncommitted claim may be adopted or abandoned only through stored ownership/liveness evidence;
- abandoning a claim preserves diagnostics and releases terminal ownership for a later valid submission;
- no accepted outcome exists until the immutable acceptance record is committed.

### After Commit

- An identical retry returns the accepted outcome and reconciles any missing materialized effects.
- A conflicting retry is rejected and cannot overwrite canonical evidence.
- Each materialized effect uses the terminal outcome ID as its idempotency key.
- Acknowledging the parent alert does not permit a later retry to create a second terminal alert.

### Interrupted Publication

If a process stops after acceptance but before all effects are materialized:

```text
terminal outcome: accepted
publication: incomplete
assignment/result view: pending reconciliation, never falsely absent or replaced
```

The next lifecycle call, startup reconciliation, status read, or explicit recovery operation may finish missing effects exactly once. Readers surface accepted outcome plus publication status/recovery pointers. They do not infer a conflicting failure or accept another outcome.

If publication repeatedly fails, the accepted outcome remains authoritative, authority stays exhausted/revoked when that effect can be completed safely, and a harness-invariant alert is queued through recoverable evidence.

Forbidden outcomes:

- accepted result overwritten;
- terminal assignment resurrected;
- two terminal alerts for one outcome;
- direct and legacy transports producing different state semantics;
- completion inferred from prose without accepted evidence.

## Result Views

`delegate_result` is a pure role-aware projector over accepted result/report evidence.

Supported views:

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

Default views include the evidence needed for the parent's next decision:

- researcher: findings, sources, unknowns, recommendation;
- worker: files, checks, deviations, risks, evidence;
- reviewer: assessment, findings, locations/evidence, recommendation;
- verifier: assessment, checks, output IDs, unverified areas, completion-claim support;
- parent: status, decisions, open questions, artifacts, risks, next route.

Rules:

- blocking findings and failed checks are never truncated out of the default view;
- byte limits truncate secondary detail with explicit recovery pointers;
- full/raw requires explicit request;
- raw transcript is never returned by default;
- child-authored fields are bounded, escaped, and labelled as untrusted evidence, not instructions;
- a malformed or incomplete projection fails honestly and points to canonical evidence;
- no result view acknowledges alerts, consumes evidence, closes panes, changes status, or changes leases.

## Communication And Alerts

Communication is durable events plus compact inboxes, not transcript monitoring or polling-first supervision.

Priorities:

```text
P0 user/safety or ownerless-parent attention
P1 parent action required
P2 terminal result/checkpoint
P3 progress/information
```

Alert queue mutation is concurrency-safe. Wake attempts are separate evidence and never imply delivery, acknowledgement, or resolution.

V1 wake behavior is queue-first:

- P0 escalates through configured user-attention paths;
- P1/P2 may wake only with a proven idle signal;
- P3 does not wake;
- busy/unknown parents receive no injected text;
- unread bounded summaries appear on the next parent/root turn;
- failed delivery leaves the alert queued and unread.

Child-authored alert text uses the same untrusted-evidence boundary as result views.

Inbox and acknowledgement scope comes from current stored/session identity, not caller flags alone. A delegated parent may read or acknowledge only alerts addressed to that parent. Task-global recovery is restricted to the root orchestrator or an explicitly authorized parent-recovery operation; `global=true`, task ID, parent ID, or alert ID parameters do not grant authority.

## Assessment, Consumption, Retention, And Closure

These states are separate:

```text
assignment lifecycle: running | completed | blocked | failed | cancelled
role assessment: pass | pass_with_non_blocking | fail | blocked | not_run | accepted_not_run
pane lifecycle: active | retained | stale | closing | closed | lost
parent consumption: unread | inspected | accepted | rejected
alert lifecycle: queued | delivered | acked | resolved | escalated
```

Assignment completion does not mean reviewer/verifier pass, package acceptance, parent consumption, or pane closure.

Defaults:

- parents remain until orchestrator/user closeout;
- workers remain retained through required review/verification and adjudication;
- blocking, failed, malformed, or disputed children remain retained;
- clean short-lived researcher/reviewer/verifier panes may close only after explicit parent acceptance/consumption;
- `delegate_result` never counts as that transition;
- close preserves canonical evidence.

A retained worker fix uses a new attempt and new/narrowed lease. Review/fix loops are capped at two before parent/orchestrator adjudication.

## Compatibility Migration

### Direct Spawn

**Old contract:** parent calls `delegate_spawn` with assignment details and the tool directly creates authority and starts a pane. Observable inputs include cwd/worktree, role/profile, command authority, packet metadata, retention, layout direction/focus, and session behavior.

**Replacement:** route admission plus route application owns authority, layout, startup, and reuse. Execution-map/work-package evidence supplies checkout, write scope, worker/integrator command authority, and approved verifier checks. Reviewer/researcher routes remain read-only.

**Expand:** keep the public tool, but implement it as an adapter to an existing routed or routed-recovery startup claim under workflow enforcement. Reach replacement parity for supported worker, reviewer, verifier, researcher, integrator, and alternate-checkout cohorts before narrowing old inputs. Routed startup preserves focus; focus-taking compatibility behavior is not carried into workflow-enforced startup.

**Migrate:** inventory every observable old option and caller, settle unsupported/narrowed behavior with the owner, then update runtime guidance, evals, internal callers, manual recovery instructions, and supported external callers in bounded groups. Record source as `routed`, `routed_recovery`, or `direct_compat_adapter`.

**Contract:** remove or narrow the old API only after supported consumers, dormant panes/packets, docs/evals, external callers, and old-path-disabled dogfood satisfy accepted removal evidence.

**Rollback/recovery:** retain the adapter while migration evidence is incomplete. Do not add new scheduling features to it.

### Legacy Stored Runtime State

Known current and unversioned records are compatibility inputs, not authority to preserve invalid behavior.

- A layout-only parent route application lacking manifest, pane, and running evidence is classified `legacy_incomplete`, never returned as successfully applied.
- Recovery creates an additive routed-recovery attempt or fails closed with parent attention; historical route/layout evidence is not rewritten.
- An already-running legacy direct assignment may finish under a synthetic legacy attempt and its existing active lease, but cannot widen authority or start new work.
- Unknown future schema/profile/protocol versions fail closed without mutation.
- New manifests, packets, startup claims, accepted outcomes, and execution envelopes carry explicit schema/protocol/attempt identity.
- Migration preserves raw evidence and uses additive journals or copy-on-migrate projections rather than destructive rewriting.

### Legacy Chat Results

**Old contract:** terminal meaning is parsed from child chat blocks.

**Replacement:** typed lifecycle tools feeding the canonical terminal-outcome operation.

**Expand:** both transports normalize to the same transport-neutral outcome. Direct submission wins only by being the first valid accepted outcome, not by a separate state path.

**Migrate:** prove lifecycle-tool availability across supported hosts/profiles and account for already-running or dormant packets.

**Contract:** parser removal requires replacement tests with the parser disabled, zero supported consumers by observation or owner attestation, and direct result storage no longer shaped around FFRESULT internals.

**Rollback/recovery:** keep raw chat as recoverable evidence; malformed/conflicting text cannot overwrite accepted outcomes.

Missing telemetry is unavailable evidence, not zero use.

## Security And Permissions

- Host permissions and sandboxing remain authoritative.
- Child lifecycle tools are available only to the current delegated task/assignment/attempt identity. A normal/root parent cannot impersonate a child by supplying task or agent parameters.
- Parent recovery uses a distinct parent-control operation with stored authority; it does not reuse child lifecycle submission.
- Leaf profiles do not receive parent-control tools.
- Read-only roles cannot acquire edit authority.
- Planning-parent product/runtime writes fail closed.
- Command authority is exact and lease-bound.
- Secret paths, credential dumping, push, destructive commands, and unplanned commit/publish/deploy remain denied by policy.
- Caller-provided role, approval, route, result, or lease claims are untrusted until matched to stored authority.
- Child text is untrusted evidence when promoted to parent context.

## Verification And Acceptance

### Mandatory Trust Scenarios

All must pass:

1. Every planning-report producer shares one acceptance contract: malformed evidence remains diagnostic, fresh tasks gain no accepted report, and prior accepted evidence remains unchanged.
2. Ready planning publications bind one exact plan identity and durable accepted evidence before creating `planning_report.ready`; identical retry and replacement-plan behavior are deterministic.
3. A later accepted blocked planning publication becomes current, creates no readiness event, and invalidates authorization from every earlier ready publication across all producers.
4. Out-of-order, missing-reference, cross-plan, wrong-task, wrong-map, and wrong-schema authorization chains fail closed.
5. Changing execution-map packages/revision under the same execution ID does not invalidate authorization; changing the bound identity does.
6. Revoked/exhausted/expired lease IDs cannot reactivate.
7. Concurrent equivalent route applies create one startup attempt and one child/parent.
8. Concurrent equivalent compatibility spawns resolve to the same stored startup attempt.
9. A mixed routed-apply versus compatibility-spawn race resolves to one startup claim and one child.
10. Conflicting startup fingerprints fail without side effects.
11. Fault injection across startup claim, lease, pane, packet, manifest, layout, delivery, running evidence, and application commit recovers without duplicate startup.
12. Malformed terminal submission creates no owning claim; a corrected submission can later succeed.
13. Identical terminal retries produce one accepted outcome and one terminal alert, including after alert acknowledgement.
14. Conflicting terminal retries preserve the first outcome and store rejected evidence.
15. Fault injection after terminal acceptance reconciles every materialized effect exactly once.
16. A late result from a superseded attempt cannot publish against the replacement attempt.
17. `delegate_result` produces no filesystem or lifecycle mutation for every view and error state.
18. Direct spawn cannot create independent authority in enabled `workflow` or `strict-workflow`.
19. Root callers cannot impersonate child lifecycle identity, and delegated parents cannot acknowledge another parent's alerts.
20. Concurrent layout, registry, route-application, and execution-map writes touched by the correction operations do not lose updates.
21. Legacy layout-only parent applications and running unversioned assignments follow the explicit adoption/fail-closed rules.

### Workflow Scenarios

- orchestrator routes broad work instead of implementing;
- planning-parent plans instead of implementing;
- execution-parent assigns broad implementation to workers;
- parent routes start/reuse visible parents before returning applied;
- worker scope violations fail closed and alert the parent;
- busy/unknown parents receive queued alerts and next-turn summaries, not injected wake text;
- parent acts from inbox/default result views without transcript loading;
- reviewer/verifier assessment remains separate from assignment completion;
- accepted blockers route a retained-worker fix with new authority;
- malformed results trigger repair/adjudication, not completion;
- tiny reversible work may receive an inline lease without spawning;
- lost parents escalate or become adoptable without orphaning authority.

### Required Evidence Classes

- core unit tests for pure routing, authorization, leases, projection, and state normalization;
- public Pi tool tests for route/apply/spawn/result/lifecycle behavior;
- barrier-controlled concurrency tests;
- process-level store tests where cross-process mutation matters;
- fault-injection tests for startup and terminal publication;
- runtime policy tests for root/parent/leaf identities and corrupt/missing views;
- live visible cmux smoke only after deterministic tests pass;
- baseline-versus-with-skill evals after runtime contracts are implemented.

Passing existing tests does not prove the mandatory trust scenarios until those scenarios are directly exercised.

## Plan-Health And Backward Triggers

Route backward when:

- a second unexpected defect appears at startup or terminal-publication seams;
- tests require callers to coordinate internal states or ordering;
- the bounded coordinators expand into a generic scheduler/store framework;
- a new public mode or compatibility behavior appears;
- approval capture requires an owner-unapproved public interface or remains unimplemented after owner selection;
- migration reveals unknown supported consumers or route/apply lacks parity for a protected cohort;
- legacy state cannot be adopted without widening or fabricating authority;
- fault evidence cannot prove safe adoption or exactly-once reconciliation;
- remaining work grows after a correction slice;
- Phase 7 would need to interpret mutable or ambiguous source evidence.

Preserve valid route, layout, lease-policy, alert, and wake work when routing backward.

## Source Evidence

- `AGENTS.md`
- `CONTEXT.md`
- `docs/freeflow-current-state.md`
- `plugin-docs/architecture.md`
- `skills/delegation-harness/SKILL.md`
- `skills/delegation-harness/references/task-packets-and-results.md`
- `skills/delegation-harness/references/execution-and-integration.md`
- `delegation/src/{routing,layout,leases,store,types}.ts`
- `pi-extension/src/delegation/{tools,runtime,renderers}.ts`
- `delegation/tests/**`
- `pi-extension/tests/pi-delegation-*.test.js`
- `.tmp/delegation-dogfood-2026-07-09/reports/delegation-architecture-depth-reviewer.md`
- independent 2026-07-11 design, migration, security, and artifact-review evidence under `.pi-subagents/artifacts/outputs/`

## Change Log

- **2026-07-11:** Rewritten after architecture review. Replaced the additive phase-era draft with outcome-level contracts for existing Freeflow modes, causal authorization, execution identity, startup and terminal failure units, pure result views, explicit retention transitions, and expand-migrate-contract compatibility.
- **2026-07-11:** Revised after artifact and multi-agent implementation review. Added prerequisite attempt identity, malformed-claim recovery, approval-surface delivery, mixed startup races, lifecycle/alert ownership, direct-spawn parity, legacy state adoption/versioning, and targeted canonical-writer evidence.
- **2026-07-12:** Revised after the R1C review-loop incident and owner route decision. Settled the taskId-only host-confirmed approval surface and added a bounded planning-report publication failure unit separating immutable accepted evidence from rejected diagnostics before authorization can exit.
