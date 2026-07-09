> **Doc ID:** PLAN-2026-07-09-deterministic-delegation-workflow
> **Date:** 2026-07-09
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft
> **Source:** `docs/specs/delegation/2026-07-09-deterministic-delegation-workflow-spec.md`

# Deterministic Delegation Workflow Implementation Plan

## Goal

Implement the deterministic workflow layer described in `docs/specs/delegation/2026-07-09-deterministic-delegation-workflow-spec.md` so the Pi/cmux delegation harness stops relying on model memory for routing, state, communication, review loops, and role enforcement.

The target outcome is:

```text
Models reason inside roles.
The harness routes, applies routes, stores state, enforces leases, queues alerts, wakes parents, renders compact results, and manages review/fix loops.
```

This plan is intentionally staged. The first implementation should prove the deterministic kernel before broad UX/settings/dashboard work.

## Source Authority

Primary source:

- `docs/specs/delegation/2026-07-09-deterministic-delegation-workflow-spec.md`

Supporting sources:

- `docs/specs/delegation/freeflow-pi-pane-delegation-harness-spec.md`
- `docs/specs/delegation/2026-07-04-delegation-harness-dogfood-fixes-spec.md`
- `skills/delegation-harness/SKILL.md`
- `delegation/src/*`
- `pi-extension/src/delegation/*`
- `delegation/tests/*`
- `pi-extension/tests/*`

## Current Baseline

The repo already has:

- core delegation types/store/protocol/policy/packet/cmux/execution modules under `delegation/src/`;
- Pi tool registration and execution under `pi-extension/src/delegation/tools.ts`;
- delegated runtime policy hooks under `pi-extension/src/delegation/runtime.ts`;
- parent alerts and inbox storage through `DelegationStore`;
- readable Markdown task packets;
- `delegate_finish`, `delegate_attention`, `delegate_progress`, `delegate_inbox`, and `delegate_update_execution_map`;
- role/profile policy that blocks leaf parent-control delegation tools and scoped writes/commands;
- execution-map metadata with one-writer-per-checkout validation.

Key gaps this plan addresses:

- no `delegate_route` admission controller;
- no `delegate_apply_route` idempotent route materializer;
- no persisted route/apply/lease model;
- no first-class layout manager for deterministic visible cmux placement;
- policy is profile/task-policy based, but not yet route-lease based;
- result retrieval lacks progressive `view`/`maxBytes` rendering and compact non-JSON defaults;
- child chat/manual report files are still substitutes for authoritative stored result transport;
- wake behavior and unread-alert context injection are not yet a complete communication system;
- terminal assignment state is coupled too closely to whether follow-up/fix packets can be sent;
- review/fix scheduling is not yet a deterministic loop primitive.

## Non-Goals

Do not implement in this plan:

- expanded settings UI;
- full delegation dashboard;
- learned/smart routing;
- multi-worktree automation;
- automatic commits or pushes;
- cross-host delegation;
- local model delegation;
- hidden/headless fallback when cmux is unavailable;
- arbitrary user-defined roles;
- broad redesign of Output Router or unrelated Freeflow skills.

## Pre-Implementation Gate

Before code changes beyond docs/plans begin:

1. Inspect `git status --short` and current diff.
2. Confirm which existing dirty files are user/other-agent work and avoid touching unrelated changes.
3. Decide whether the new spec and this plan should be committed separately before runtime changes.
4. Run at least:
   - `npm run build`
   - `npm run test:delegation`
   - `npm run test:pi-extension`
5. If current dirty work prevents reliable tests, record the blocker and isolate the deterministic workflow work on a clean branch/worktree before implementation.

Stop if unrelated modified files would be overwritten or if generated dist files are inconsistent with source in a way not owned by this task.

## Architecture Decisions

### A1. Add a route kernel to the core `delegation` package

Implement route decision logic in `delegation/src/`, not only in Pi adapter code. Pi tools should expose and render the route kernel, but route decisions should be testable without Pi/cmux.

### A2. Persist route/apply/lease/layout state in the delegation store

Add canonical files under each task directory:

```text
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
```

`leases.jsonl` is the append-only audit log. `active-leases.json` is the materialized policy lookup view and must be rebuildable from the log. Its V1 shape is the `version`/`rebuiltFrom`/`leasesById`/`activeLeaseIdsByAgent` shape defined in the spec.

Use additive store methods instead of having Pi tool code hand-edit files. Keep `delegation/src/paths.ts` and store helpers as the canonical task/report/result path authority; layout records path references and must not introduce a parallel path scheme.

### A3. Make plan approval and execution authorization explicit storage contracts

Implement exact V1 events from the spec:

```text
planning_report.ready
plan.approved
execution.authorized
```

`delegate_route` may accept `hasApprovedPlan` as a hint, but execution routing and `delegate_apply_route` must require stored evidence that moves the task to `ready_for_execution`.

### A4. Treat leases as the enforcement bridge

Route decisions issue or require leases. Tool policy consumes active leases alongside existing task policy/profile checks.

### A5. Make `delegate_apply_route` idempotent

V1 exposes `delegate_apply_route` as a separate public tool backed by internal application helpers. A duplicate apply must return existing route/application state and must not spawn duplicate panes, duplicate leases, or duplicate alerts.

### A6. Add a first-class layout manager

Route application should ask a layout manager for deterministic visible placement before invoking the cmux adapter. The layout manager owns pane/surface allocation, reuse, no-focus-stealing defaults, prompt/report paths, layout registry state, and lost/stale pane recovery. The scheduler still decides role/workflow routing.

### A7. Keep wake behavior conservative at first

Durable queued alerts plus next-turn runtime context injection are the required V1 wake mechanism. If reliable parent idle/busy detection is available, direct cmux wake packets may be added behind that proof gate. Never inject wake text into busy or unknown parent state. Parent/orchestrator unread summaries must be wired through the normal Pi runtime-context path, not only delegated-child runtime policy.

### A8. Result views are renderers, not separate source truth

Full structured result remains stored once. `delegate_result(view=...)` renders bounded views over that stored result/report. Model-visible outputs default to compact text, Markdown, or dense pipe-delimited rows; raw JSON/full transcript views require explicit request.

## Likely Files Touched

Core:

- `delegation/src/types.ts`
- `delegation/src/store.ts`
- `delegation/src/policy.ts`
- `delegation/src/packet.ts`
- `delegation/src/profiles.ts`
- `delegation/src/execution.ts`
- `delegation/src/index.ts`
- new `delegation/src/routing.ts`
- new `delegation/src/leases.ts`
- new `delegation/src/layout.ts`
- new `delegation/src/result-views.ts`
- `delegation/tests/delegation.test.js`
- possibly new `delegation/tests/routing.test.js`
- possibly new `delegation/tests/layout.test.js`

Pi extension:

- `pi-extension/src/delegation/tools.ts`
- `pi-extension/src/delegation/runtime.ts`
- `pi-extension/src/delegation/renderers.ts`
- `pi-extension/src/delegation/index.ts`
- `pi-extension/src/runtime-context.ts`
- `pi-extension/src/index.ts`
- `pi-extension/tests/pi-delegation-tools.test.js`
- `pi-extension/tests/pi-delegation-runtime.test.js`
- profile/tool registration tests touching `delegation/src/profiles.ts`

Docs/evals:

- `skills/delegation-harness/SKILL.md`
- `skills/delegation-harness/references/*.md`
- `evals/prompts/del-*.txt`
- `evals/registries/fixture-evals.json`
- `evals/registries/skill-evidence.json`
- `docs/specs/delegation/2026-07-09-deterministic-delegation-workflow-spec.md` only if implementation reveals needed spec corrections.

Generated outputs after build, if repo convention requires committing dist:

- `delegation/dist/**`
- `pi-extension/dist/**`

## Implementation Phases

### Phase 0: Baseline and test harness alignment

**Description:** Establish clean evidence, protect existing dirty work, and add placeholder eval IDs before runtime changes.

**Acceptance criteria:**

- [ ] Current worktree status is recorded in the implementation report.
- [ ] Existing build/test baseline is known.
- [ ] New planned eval IDs are reserved or listed in the plan/report.
- [ ] No unrelated dirty files are modified.

**Verification:**

- [ ] `git status --short`
- [ ] `npm run build`
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** None.

**Estimated scope:** S.

---

### Phase 1: Route, lease, layout, and result type contracts

**Description:** Add typed contracts for route requests, route decisions, route applications, leases, layout intents/allocations, alert priority, result views, role assessments, and separated assignment/pane/alert/lease state where needed.

**Acceptance criteria:**

- [ ] `DelegationRouteRequest`, `DelegationRouteDecision`, `DelegationRouteApplication`, and `DelegationLease` types exist.
- [ ] `DelegationLayoutIntent` and `DelegationLayoutAllocation` types exist.
- [ ] Route decisions cover `inline_allowed`, `route_required`, `ask_user`, and `blocked`.
- [ ] Route application state covers `pending`, `applied`, `already_applied`, `failed`, and `cancelled`.
- [ ] Lease state covers `issued`, `active`, `exhausted`, `expired`, and `revoked`.
- [ ] Role assessment status is separate from assignment state.
- [ ] Result view type covers `alert`, `summary`, `default`, `findings`, `checks`, `files`, `evidence`, `risks`, `diff`, `full`, and `raw`.
- [ ] Compact model-visible output format contract is represented separately from stored JSON/JSONL.

**Verification:**

- [ ] `npm run build:delegation`
- [ ] Type-focused unit tests for route/lease/layout normalization.

**Dependencies:** Phase 0.

**Files likely touched:**

- `delegation/src/types.ts`
- new `delegation/src/routing.ts`
- new `delegation/src/leases.ts`
- new `delegation/src/layout.ts`
- `delegation/src/index.ts`
- `delegation/tests/routing.test.js`
- `delegation/tests/layout.test.js`

**Estimated scope:** M.

---

### Phase 2: Store route/apply/lease/layout state

**Description:** Extend `DelegationStore` with route, route-application, lease, active-lease rebuild, layout allocation, wake-attempt, approval/authorization, and alert-priority helpers.

**Acceptance criteria:**

- [ ] Store can append route decisions to `routes.jsonl`.
- [ ] Store can record route applications idempotently.
- [ ] Store can append `planning_report.ready`, `plan.approved`, and `execution.authorized` events.
- [ ] Store can rebuild `active-leases.json` from `leases.jsonl` using the spec shape.
- [ ] Store can upsert/read active leases.
- [ ] Store can mark leases exhausted/revoked.
- [ ] Store can record/read layout allocations in `layout.json`/registry state.
- [ ] Store can record wake attempts without marking alerts acked/resolved.

**Verification:**

- [ ] Unit tests prove duplicate route application returns existing application without duplicates.
- [ ] Unit tests prove active lease lookup filters expired/exhausted/revoked leases.
- [ ] Unit tests prove active lease view rebuild fails closed on stale/corrupt inputs.
- [ ] Unit tests prove stored execution authorization requires the exact event chain.
- [ ] `npm run test:delegation`

**Dependencies:** Phase 1.

**Files likely touched:**

- `delegation/src/store.ts`
- `delegation/src/paths.ts`
- `delegation/src/types.ts`
- `delegation/tests/delegation.test.js`
- `delegation/tests/routing.test.js`

**Estimated scope:** M.

---

### Phase 3: `delegate_route` deterministic admission controller

**Description:** Implement the route rule engine and expose it through a Pi tool.

Initial route inputs should include:

- task ID / optional route ID;
- current role/profile;
- requested action kind;
- breadth estimate;
- risk flags;
- caller-provided `hasApprovedPlan` hint plus stored approval/authorization lookup;
- target files/write scopes when known;
- tiny-inline facts when requested.

**Acceptance criteria:**

- [ ] Orchestrator + broad implementation without stored execution authorization routes to planning-parent.
- [ ] Orchestrator + broad implementation with stored execution authorization routes to execution-parent.
- [ ] Caller-provided `hasApprovedPlan` without stored evidence does not authorize execution routing.
- [ ] Planning-parent + implementation intent is blocked or routed to execution-parent.
- [ ] Execution-parent + broad/multi-file implementation routes to worker.
- [ ] Leaf + spawn-child intent is blocked.
- [ ] Tiny single-file reversible task can receive inline lease decision.
- [ ] Route decision is stored with reason codes.

**Verification:**

- [ ] Core unit tests for route matrix.
- [ ] Pi tool test for schema and compact renderer.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phase 2.

**Files likely touched:**

- `delegation/src/routing.ts`
- `delegation/src/types.ts`
- `delegation/src/profiles.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/src/delegation/renderers.ts`
- `pi-extension/tests/pi-delegation-tools.test.js`

**Estimated scope:** M.

---

### Phase 4a: Layout manager and cmux allocation adapter

**Description:** Add deterministic layout allocation before route application starts spawning or reusing panes.

Initial supported allocations:

- current caller workspace as default anchor;
- inline route returns no pane allocation;
- planning/execution parent placement in the right-side delegation area;
- child/reviewer/verifier placement as right-side surfaces/panes according to the V1 preset;
- duplicate layout intent returns the existing allocation.

**Acceptance criteria:**

- [ ] `DelegationLayoutIntent` can be converted into a deterministic `DelegationLayoutAllocation`.
- [ ] Layout allocation records workspace, pane, surface, created/reused status, and prompt/report paths.
- [ ] Allocation preserves focus by default and never calls focus-changing cmux verbs speculatively.
- [ ] Duplicate allocation returns existing allocation without creating a pane/surface.
- [ ] Missing/stale/lost pane evidence is represented in registry/layout state.

**Verification:**

- [ ] Unit tests for layout allocation/reuse with fake cmux runner.
- [ ] Unit tests proving focus-changing verbs are not used by default.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phases 1-3.

**Files likely touched:**

- new `delegation/src/layout.ts`
- `delegation/src/store.ts`
- `delegation/src/types.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/tests/pi-delegation-tools.test.js`
- `delegation/tests/layout.test.js`

**Estimated scope:** M.

---

### Phase 4b: `delegate_apply_route` for inline and parent routes

**Description:** Implement the first route materializer slice: inline leases plus planning/execution-parent spawn/reuse.

Initial supported applications:

- inline lease;
- spawn/reuse planning-parent;
- spawn/reuse execution-parent;
- ask-user/blocked returns no spawn.

**Acceptance criteria:**

- [ ] Applying inline route issues an active lease and does not spawn a pane.
- [ ] Applying planning-parent route initializes task and spawns or reuses the parent through layout allocation.
- [ ] Applying execution-parent route requires stored execution authorization and spawns/reuses the parent through layout allocation.
- [ ] Duplicate apply does not duplicate panes, layout allocations, leases, alerts, or registry entries.
- [ ] Apply returns compact next state with spawned/reused/waitingFor fields.

**Verification:**

- [ ] Unit tests with fake cmux runner prove idempotency.
- [ ] Unit tests prove execution-parent apply fails without stored authorization.
- [ ] Unit tests prove apply fails closed on preflight/layout failure.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phase 4a.

**Files likely touched:**

- `delegation/src/routing.ts`
- `delegation/src/layout.ts`
- `delegation/src/store.ts`
- `delegation/src/packet.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/tests/pi-delegation-tools.test.js`

**Estimated scope:** M.

---

### Phase 4c: `delegate_apply_route` for worker/reviewer/verifier routes

**Description:** Extend route materialization to child assignments after inline and parent routes are stable.

Initial supported applications:

- spawn/reuse worker from execution-parent;
- spawn reviewer/verifier from parent;
- wire parent inbox and expected result role;
- write/reuse work package metadata where provided.

**Acceptance criteria:**

- [ ] Applying worker route writes/reuses work package metadata and spawns/reuses worker through layout allocation.
- [ ] Applying reviewer/verifier route wires parent inbox and expected role assessment/result shape.
- [ ] Duplicate apply does not duplicate panes, layout allocations, leases, alerts, or registry entries.
- [ ] Apply returns compact next state with spawned/reused/waitingFor fields.

**Verification:**

- [ ] Unit tests with fake cmux runner prove child/reviewer/verifier idempotency.
- [ ] Unit tests prove worker/reviewer/verifier apply fails closed on preflight/layout failure.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phase 4b.

**Files likely touched:**

- `delegation/src/routing.ts`
- `delegation/src/layout.ts`
- `delegation/src/store.ts`
- `delegation/src/packet.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/tests/pi-delegation-tools.test.js`

**Estimated scope:** M.

---

### Phase 5: Lease-aware policy enforcement

**Description:** Connect route leases to delegated runtime tool-call policy so role drift and write conflicts are blocked by executable policy, not prompts.

**Acceptance criteria:**

- [ ] Consequential writes require an active write lease.
- [ ] Mutating commands require an active command lease or allowed command policy.
- [ ] Orchestrator broad implementation without inline lease is blocked in harness mode.
- [ ] Planning-parent implementation writes are blocked.
- [ ] Execution-parent broad implementation writes are blocked unless an explicit narrow integration lease exists.
- [ ] Worker writes outside lease scope are blocked with reroute reason.
- [ ] Missing/stale/corrupt `active-leases.json` fails closed and raises a parent alert.
- [ ] Leaf agents remain unable to use parent-control delegation tools.

**Verification:**

- [ ] Policy unit tests for role drift.
- [ ] Runtime tool-call tests for edit/command blocks.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phases 4b-4c.

**Files likely touched:**

- `delegation/src/policy.ts`
- `delegation/src/leases.ts`
- `delegation/src/profiles.ts`
- `pi-extension/src/delegation/runtime.ts`
- `pi-extension/tests/pi-delegation-runtime.test.js`

**Estimated scope:** M.

---

### Phase 6: Event bus, inbox priority, and wake summaries

**Description:** Upgrade alerts from a stored queue to priority-aware communication with safe wake semantics.

**Acceptance criteria:**

- [ ] Alerts have priority P0/P1/P2/P3 or equivalent reason-coded priority.
- [ ] `delegate_attention` queues P1/P0 alerts as appropriate.
- [ ] `delegate_finish` queues terminal P2/P1 alerts depending status/findings/check failures.
- [ ] Wake attempts are recorded separately from alert ack/resolution.
- [ ] Busy/unknown parent state does not receive unsafe injected wake text.
- [ ] Next-turn runtime context includes compact unread alert summary for delegated parents and normal orchestrator/root sessions.
- [ ] If no reliable idle signal exists, queued alerts plus next-turn summaries satisfy V1 wake behavior.
- [ ] Lost/unavailable parent can escalate upward to parent’s parent or user attention path.

**Verification:**

- [ ] Store tests for alert priority/dedupe/ack.
- [ ] Runtime-context tests for unread summary injection into normal and delegated sessions.
- [ ] Tool tests for attention/finish priority mapping.
- [ ] `npm run test:pi-extension`

**Dependencies:** Phase 2; can start after Phase 3 but should integrate after Phases 4b-4c.

**Files likely touched:**

- `delegation/src/store.ts`
- `delegation/src/types.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/src/delegation/runtime.ts`
- `pi-extension/src/runtime-context.ts`
- `pi-extension/src/index.ts`
- `pi-extension/tests/pi-delegation-runtime.test.js`
- `pi-extension/tests/pi-extension.test.js` or a dedicated before-turn runtime-context test

**Estimated scope:** M.

---

### Phase 7: Dynamic result views and compact tool output

**Description:** Extend `delegate_result` with `view` and `maxBytes`, implement role-specific adaptive renderers, and make model-visible outputs compact text/Markdown/rows rather than raw JSON by default.

**Acceptance criteria:**

- [ ] `delegate_result` accepts `view` and `maxBytes`.
- [ ] Default view includes blocking findings and failed checks when present.
- [ ] Summary view is compact enough for inbox-driven parent decisions.
- [ ] Findings/checks/files/evidence section views work.
- [ ] Model-visible default output uses compact text, Markdown, or pipe-delimited rows.
- [ ] Full/raw JSON views require explicit request.
- [ ] Raw transcript is never returned by default.
- [ ] Child chat is treated as observational; stored `delegate_finish`/report evidence is authoritative.

**Verification:**

- [ ] Unit tests for each role’s default view.
- [ ] Tests proving maxBytes truncates with recovery pointers.
- [ ] Tests proving default output is not raw JSON and full/raw requires explicit request.
- [ ] Pi tool tests for `delegate_result` view parameter.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phase 2; independent of apply route once result shapes are stable.

**Files likely touched:**

- new `delegation/src/result-views.ts`
- `delegation/src/types.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/src/delegation/renderers.ts`
- `delegation/tests/delegation.test.js`
- `pi-extension/tests/pi-delegation-tools.test.js`

**Estimated scope:** M.

---

### Phase 8a: Retention and parent-consumption lifecycle

**Description:** Separate assignment-terminal state from pane-retention state before enabling fix sends.

**Acceptance criteria:**

- [ ] Worker completion retains pane until review/verification accepted.
- [ ] Clean reviewer/verifier can close after parent consumption.
- [ ] Blocking/malformed/failed child remains retained.
- [ ] Assignment state, pane state, role assessment, and parent consumption/ack state are stored separately.
- [ ] Package completion requires worker acceptance plus required review/verification/adjudication.

**Verification:**

- [ ] Unit tests for retention policy decisions.
- [ ] Tests proving assignment completion does not imply pane closure.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phases 4c, 5, and 7.

**Files likely touched:**

- `delegation/src/types.ts`
- `delegation/src/store.ts`
- `delegation/src/execution.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/tests/pi-delegation-tools.test.js`

**Estimated scope:** M.

---

### Phase 8b: Retained-worker fix route and review/fix loop

**Description:** Add the safer terminal follow-up path only after retention state works.

Current behavior blocks `delegate_send` to terminal agents. This phase should replace that with a safer rule:

```text
terminal assignment + retained pane + parent-approved fix route -> new attempt/fix lease may send fix packet
terminal assignment + closed/lost pane -> spawn fix-worker with compact context
```

**Acceptance criteria:**

- [ ] Parent can send a fix packet to a retained terminal worker through an explicit fix route/application.
- [ ] Fix route issues a new or narrowed lease; it does not silently reuse broad expired scope.
- [ ] Fix loop count is tracked and capped at 2.
- [ ] Exceeding loop cap escalates to parent/orchestrator.
- [ ] Tests prove unrestricted sends to terminal agents remain blocked.

**Verification:**

- [ ] Tool tests for fix packet to retained worker.
- [ ] Tests proving unrestricted sends to terminal agents remain blocked.
- [ ] Unit tests for loop cap escalation.
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`

**Dependencies:** Phase 8a.

**Files likely touched:**

- `delegation/src/types.ts`
- `delegation/src/store.ts`
- `delegation/src/execution.ts`
- `delegation/src/routing.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/tests/pi-delegation-tools.test.js`

**Estimated scope:** M.

---

### Phase 9: Skill guidance and behavior evals

**Description:** Update agent-facing guidance only after runtime contracts exist, and add eval coverage that proves behavior changed.

**Acceptance criteria:**

- [ ] `skills/delegation-harness/SKILL.md` describes route/apply/layout/lease/inbox/result-view defaults.
- [ ] References explain communication, result transport, tool output format, and failure contracts without overloading the main skill.
- [ ] Evals cover role drift, apply idempotency, layout allocation, lease enforcement, alert/wake behavior, result views/output format, review/fix loop, malformed recovery, and tiny inline routing.
- [ ] Skill evidence registry references the new evals.

**Verification:**

- [ ] JSON parse eval registries.
- [ ] Existing fixture eval runner or targeted script for new prompts.
- [ ] `git diff --check`

**Dependencies:** Runtime behavior at least through Phase 7; review/fix evals depend on Phases 8a-8b. Some evals may be drafted earlier.

**Files likely touched:**

- `skills/delegation-harness/SKILL.md`
- `skills/delegation-harness/references/*.md`
- `evals/prompts/del-*.txt`
- `evals/registries/fixture-evals.json`
- `evals/registries/skill-evidence.json`

**Estimated scope:** M.

---

### Phase 10: Dogfood and acceptance run

**Description:** Run a real broad task through the new workflow and compare against the current failure modes.

**Acceptance criteria:**

- [ ] Orchestrator routes instead of implementing.
- [ ] Planning-parent plans instead of implementing.
- [ ] Execution-parent coordinates instead of broad self-implementing.
- [ ] Worker performs bounded scoped work.
- [ ] Layout manager allocates/reuses visible panes without focus-stealing or model-memory placement.
- [ ] Reviewer/verifier run according to policy.
- [ ] Blocking issue loops back to retained worker.
- [ ] Parent/orchestrator consume compact inbox/result views, not child chat or raw JSON.
- [ ] Final completion claim cites stored terminal result/report evidence.

**Verification:**

- [ ] `npm run build`
- [ ] `npm run test:delegation`
- [ ] `npm run test:pi-extension`
- [ ] `npm run test:router` if router/tool routing code is touched.
- [ ] Live cmux dogfood smoke after local reload/update.

**Dependencies:** Phases 1-9, including Phases 4a-4c and 8a-8b.

**Estimated scope:** M.

## Suggested Task Checklist

### Foundation

- [ ] Task 1: Add route/lease/layout/result-view type contracts.
- [ ] Task 2: Add store support for route decisions, route applications, approval/authorization events, leases, layout, and wake attempts.
- [ ] Task 3: Add route rule engine with unit tests.

### Route application

- [ ] Task 4: Expose `delegate_route` Pi tool and compact renderer.
- [ ] Task 5: Implement layout manager and fake cmux allocation tests.
- [ ] Task 6: Implement idempotent `delegate_apply_route` for inline lease and parent routes.
- [ ] Task 7: Extend `delegate_apply_route` for worker/reviewer/verifier routes.

### Enforcement and communication

- [ ] Task 8: Wire leases into runtime policy enforcement.
- [ ] Task 9: Add priority-aware alerts and unread runtime-context summaries through the normal parent runtime-context path.
- [ ] Task 10: Add conservative wake-attempt recording and lost-parent escalation.

### Results and loops

- [ ] Task 11: Implement dynamic result views and compact non-JSON default output.
- [ ] Task 12: Implement retention policy and parent-consumption-based autoclose.
- [ ] Task 13: Implement retained-worker fix route and review-loop cap.

### Guidance and proof

- [ ] Task 14: Update delegation-harness skill/reference docs.
- [ ] Task 15: Add behavior eval prompts/registry entries.
- [ ] Task 16: Run focused tests and live dogfood smoke.

## Checkpoints

### Checkpoint A: Route kernel works

After Tasks 1-4:

- [ ] Route matrix tests pass.
- [ ] Stored approval/authorization tests pass.
- [ ] `delegate_route` returns compact deterministic decisions.
- [ ] No pane spawning behavior has changed yet except new tool availability.

### Checkpoint B: Route application works

After Tasks 5-7:

- [ ] Layout allocation is deterministic and no-focus by default.
- [ ] Applying a route is idempotent.
- [ ] Parent/worker/reviewer/verifier spawns are deterministic.
- [ ] Duplicate applies do not duplicate panes/layout allocations/leases/alerts.

### Checkpoint C: Drift is blocked

After Tasks 8-10:

- [ ] Orchestrator/planning-parent/execution-parent drift is blocked in strict harness conditions.
- [ ] Worker write-scope violations are blocked.
- [ ] Lease store/view failures fail closed.
- [ ] Parent unread alerts surface without polling loops through normal runtime context.

### Checkpoint D: Compact evidence loop works

After Tasks 11-13:

- [ ] Parent can act from `delegate_inbox` + `delegate_result(default)`.
- [ ] Default parent-facing result output is compact text/Markdown/rows, not raw JSON.
- [ ] Blocking review can route a fix to retained worker.
- [ ] Full/raw views are unnecessary for happy path.

### Checkpoint E: Ready for dogfood

After Tasks 14-16:

- [ ] Tests pass.
- [ ] Skill/evals reflect runtime behavior.
- [ ] Live cmux smoke proves the workflow enough for broader dogfood.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Route rules over-block useful tiny work | Medium | Keep tiny inline lease path and eval it. |
| Route rules under-block drift | High | Start with hard role-drift tests before UX work. |
| `delegate_apply_route` becomes too large | High | Split layout, parent-route, and child-route application into separate internal helpers. |
| Layout manager steals focus or loses panes | High | Use caller workspace, `--focus false`, fake cmux tests, and stored layout registry/recovery state. |
| Lease enforcement conflicts with existing task policy | High | Layer leases additively and test existing policy behavior before changing defaults. |
| Lease view corruption causes fail-open behavior | High | Rebuild `active-leases.json` from `leases.jsonl`; fail closed on mismatch/unreadable view. |
| Wake injection disrupts busy parent panes | High | Require queued alerts + next-turn context for V1; gate direct wake packets behind proven idle signal. |
| Parent alert summaries only reach delegated children | High | Wire unread summaries through normal `runtime-context`/before-turn path and test root sessions. |
| Result views omit needed detail | Medium | Track full-view fallback rate and include blocking findings/failed checks by default. |
| Tool output defaults to noisy JSON | Medium | Test compact text/Markdown/row defaults and require explicit full/raw JSON request. |
| Retained terminal worker fix path reopens unsafe scope | High | Require explicit fix route/application and new/narrowed lease. |
| Current dirty worktree causes accidental overwrite | High | Pre-implementation gate and isolated branch/worktree if needed. |
| Live cmux behavior differs from tests | Medium | Require post-build local reload and live smoke before final completion claim. |

## Open Questions Before Implementation

Resolved for V1:

- `delegate_apply_route` is a separate public tool, not an `apply: true` mode on `delegate_route`.
- `on` mode requires harness routing/leases where implemented; `strict` mode hard-blocks role drift, out-of-lease writes, and out-of-lease mutating commands.
- V1 wake behavior relies on queued alerts plus next-turn runtime context; direct wake packets are optional and proof-gated on a reliable idle signal.

Additional V1 decisions:

- Approved-plan authority comes from stored planning/execution authorization state. Caller-provided `hasApprovedPlan` is only a hint.
- Plan approval/execution authorization events are `planning_report.ready`, `plan.approved`, and `execution.authorized`, with task state `ready_for_execution` as the routeable execution state.
- Lease storage uses append-only `leases.jsonl` plus materialized `active-leases.json`; the active view must be rebuildable from the log.
- `active-leases.json` uses the spec-defined `version`, `rebuiltFrom`, `generatedAt`, `leasesById`, and `activeLeaseIdsByAgent` shape.
- Layout management is a first-class harness component and should be implemented before pane-spawning route application.
- Child chat is observational. Stored result/report events are authoritative, and parent-facing tool output defaults to compact text/Markdown/rows rather than raw JSON.
- Parent unread-alert summaries must use the normal Pi runtime-context path for orchestrator/root sessions as well as delegated sessions.

Still open before implementation:

- What exact parent idle/busy signal, if any, is reliable enough for optional direct wake packets?
- What exact `maxBytes` defaults should each result view use?

## Manual Cmux Dogfood Before Runtime Implementation

Before runtime implementation starts, run a manual cmux dogfood review of this spec/plan if a visible cmux workspace is available. This is a planning/review activity, not implementation.

Use the prior manual dogfood lessons from `docs/handoffs/delegation/2026-07-02-manual-cmux-delegation-harness-dogfood.md`:

- The current orchestrator acts as manual orchestrator/parent.
- Spawn only read-only children unless the user explicitly approves implementation.
- Do not use direct child-to-orchestrator `cmux send` as a communication channel.
- Initial child prompts should be passed as launch-time prompt files/arguments, not multiline text sent into an active TUI.
- Substantive follow-ups should be file-backed; active-TUI short prompts are only for small steering notes.
- Children should use `cmux notify` only as a manual user-visible bridge; the parent consumes written/compact reports.
- Keep child panes open until their reports are consumed and follow-up chance is over.

Recommended manual children before coding:

1. **Spec adversarial reviewer** — read-only review of `docs/specs/delegation/2026-07-09-deterministic-delegation-workflow-spec.md` for contradictions, missing failure contracts, over-broad scope, and implementation ambiguity.
2. **Plan feasibility reviewer** — read-only review of `docs/plans/delegation/2026-07-09-deterministic-delegation-workflow-implementation-plan.md` against current `delegation/src/*` and `pi-extension/src/delegation/*`, focusing on task sizing, dependency order, and risk.
3. Optional **cmux transport scout** — read-only check of current cmux/Pi command behavior and prior manual dogfood notes, focused only on whether wake/packet assumptions remain valid.

Each child should return a compact role-native report with:

```text
STATUS
SUMMARY
BLOCKING
NON_BLOCKING
QUESTIONS
RECOMMENDATION
EVIDENCE
```

The orchestrator/parent then adjudicates findings before any runtime implementation begins.

2026-07-09 dogfood adjudication accepted these blockers before implementation:

- normalize canonical state/result vocabularies;
- wire stored plan approval and execution authorization into route/apply;
- define lease storage shape and fail-closed policy contracts;
- make layout management first-class before cmux pane spawning;
- make stored result/report evidence authoritative instead of child chat;
- keep model-visible tool output compact by default, not raw JSON;
- wire unread parent alerts through the normal runtime-context path;
- split route application and review/fix phases before assignment.

## Completion Criteria

This plan is complete when:

- route/apply/layout/lease/event/result-view/fix-loop runtime behavior exists and is tested;
- behavior evals demonstrate no orchestrator/planning-parent/execution-parent drift on representative broad tasks;
- parent communication is inbox-driven rather than polling-driven;
- normal parent action uses compact result views rather than child chat or raw JSON/transcript;
- stored result/report evidence supports completion claims;
- a live dogfood task proves the broad workflow end to end or records concrete blockers for the next plan.
