# Deterministic Delegation Workflow Implementation Plan

> **Doc ID:** PLAN-2026-07-09-deterministic-delegation-workflow
> **Date:** 2026-07-09
> **Last Updated:** 2026-07-13
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft
> **Source:** `docs/specs/delegation/2026-07-09-deterministic-delegation-workflow-spec.md`; live delegation/Pi code and tests; completed Phase R evidence; explicit owner decisions.

## Goal And Source Authority

Finish the deterministic delegation correction phase without discarding verified routing, layout, lease-policy, alert, or wake foundations.

The governing behavior comes from the source spec and explicit owner decisions. Live code and tests establish current facts. Handoffs, plans, and reviews are evidence rather than authority over either.

This is a rolling plan. R2 is complete. R3 is the next directional horizon and must be refined into executable slices before implementation. Later work remains provisional.

## Current Position

Completed and preserved:

- **R0:** versioned assignment/attempt identity, current-attempt binding, finish-only synthetic legacy attempts, and legacy parent-application classification.
- **R1A:** causal plan approval, immutable execution envelopes, authorization reconstruction, and tamper rejection.
- **R1C-P:** one semantic planning-report publisher with immutable accepted evidence, separate rejected diagnostics, blocked supersession, delegated source binding, and integrity validation.
- **R1C:** taskId-only owner authorization through host TUI/RPC confirmation. Delegated and unsupported no-UI callers fail closed.
- **R1D:** monotonic lease history, no terminal reactivation, no-clobber log initialization, globally unique physical lease event IDs, fail-closed replay, and new lease IDs for new attempts.
- **R2:** one assignment-attempt-scoped terminal publication operation with immutable claims and accepted outcomes, stale-claim adoption and evidence-backed dead-owner abandonment, separate rejected diagnostics, role-native validation, post-commit effect reconciliation, accepted-result reads during incomplete publication, typed/runtime/report adapter parity, and fail-closed root lifecycle identity.

Latest direct evidence after R2:

- delegation tests: **119/119**;
- Pi extension tests: **179/179**;
- `git diff --check`: pass;
- R1D follow-up review found no residual blocker.

Historical review artifacts remain evidence. They do not create future phase-review requirements or override the current workflow guidance.

## Scope

### In Scope Through Checkpoint R

- immutable terminal-outcome publication and exactly-once effect reconciliation;
- deterministic startup/materialization for routed and compatibility callers;
- visible planning/execution-parent startup before route application commits;
- compatibility adapters over routed/recovery authority;
- pure result reads and stored lifecycle/inbox ownership;
- removal of obsolete orchestration only after replacement evidence passes;
- serial direct verification and one final frozen-state assurance package.

### Non-Goals

- changing the three Freeflow modes;
- changing `delegate_request_execution_authorization({ taskId })`;
- hidden or headless delegation fallback;
- broad `DelegationStore` rewrite or generic transaction framework;
- compatibility removal before consumer/removal evidence;
- Phase 7 result-view expansion before Checkpoint R;
- Phase 8 consumption/retention/fix-loop behavior;
- Output Router, settings, dashboard, release, commit, or push work.

## Execution Contract

- One responsible writer owns implementation and local correction.
- Each meaningful slice closes sequentially: self-verification first, then bounded self-review only when evidence supports the outcome.
- Use TDD for changed observable behavior. Rejected operations prove both rejection and forbidden-mutation preservation.
- Run checks that share generated `dist` output serially.
- Failed, repeated, or unexplained signals route to diagnosis before redesign. Use design-for-depth only when evidence establishes structural ownership or interface pressure.
- Phase endings do not trigger independent review.
- After the final Phase R implementation self-check, freeze one source identity and dispatch one fresh verifier plus one different fresh reviewer in parallel against that same state.
- Completion requires verifier Pass and resolved review with no later code change. A code change stales both results; self-check the correction and ask before redispatch.
- Do not edit `.freeflow/config.json`, `freeflow.json`, or unrelated output-router/settings work.

# Phase 2 — Completed Horizon: Immutable Terminal Outcomes

## Outcome

Every direct lifecycle result, execution-parent report, and compatible parser result publishes through one assignment-attempt-scoped operation. The first valid accepted outcome is immutable; identical retries reconcile; malformed and conflicting submissions remain diagnostic; derived effects converge exactly once.

Planning-parent reports continue through the completed planning-report publication failure unit. R2 must not recreate or generalize that adapter choreography.

## Assumptions Under Test

- Existing assignment/attempt identity and task-local locking can support one terminal claim without a store-wide transaction framework.
- One immutable accepted record can be the authority for result projection, assignment state, lease ending, events, and parent alerts.
- Current role-native result/report requirements are sufficient to normalize typed and legacy transports without changing public behavior.
- Existing projection files can remain compatibility materializations rather than authority.

## Slice 2A — Claim And Immutable Acceptance

**Outcome and source requirement:** Implement the spec’s `Failure Unit: Terminal Outcome Publication` claim and commit boundary for one `(taskId, assignmentId, attemptId)`.

**Type:** Delivery/deepening using TDD.

**Likely seam:** One core store operation called with normalized role-native evidence and source transport. Keep public adapters out of claim sequencing.

**Semantic failure unit:**

- trust anchor: current stored task/assignment/attempt identity;
- mutable pre-commit state: one serialized terminal claim;
- commit point: immutable accepted terminal record;
- diagnostics: malformed, superseded, and conflicting evidence stored separately;
- forbidden outcomes: root impersonation, stale-attempt ownership, malformed claim ownership, accepted overwrite, or two accepted outcomes.

**Behavior and direct evidence:**

- malformed submission creates rejected evidence but no owning claim; corrected evidence can later succeed;
- first valid submission commits one accepted outcome;
- identical retry returns the same outcome identity;
- conflicting direct/direct, direct/legacy, and legacy/direct submissions preserve the first accepted outcome;
- superseded, cross-assignment, or role-mismatched evidence rejects before accepted-state mutation;
- concurrent equivalent submissions converge; concurrent conflicts produce one accepted and one rejected result.

Self-verify through focused core tests that inspect accepted/rejected bytes, identities, and forbidden mutations. Use process-level concurrency only if in-process locking cannot observe the real store boundary.

**Dependencies:** Completed R0 identity and R1D monotonic lease history.

**Stop conditions:**

- role evidence or terminal status meaning is behaviorally ambiguous;
- claim ownership needs a new public state or caller retry protocol;
- safe concurrency requires a generic transaction manager;
- an observed compatibility consumer requires mutable result files to remain authoritative.

## Slice 2B — Reconcile Materialized Effects

**Outcome and source requirement:** Every effect derived from an accepted terminal outcome is idempotent and recoverable after interruption.

**Type:** Delivery/deepening using TDD.

**Likely seam:** The same core terminal operation owns reconciliation; callers request the outcome and receive publication status/recovery pointers.

**Semantic failure unit:** Accepted terminal record remains authoritative while result projection, assignment status, lease exhaustion/revocation, agent/task events, and parent alert are derived effects.

**Behavior and direct evidence:**

- inject failure after acceptance and after each derived effect;
- retry reconstructs the same accepted outcome and completes only missing effects;
- each effect is keyed by terminal outcome identity;
- parent alert acknowledgement cannot permit a second terminal alert;
- repeated reconciliation failure remains visible without replacing the accepted outcome;
- readers never report an accepted outcome as absent merely because projection is incomplete.

Use controlled store/filesystem failure injection at existing owned seams. Do not add a generic transaction or production test hook merely to enumerate internal steps.

**Dependencies:** Slice 2A accepted record and R1D lease ending.

**Stop conditions:**

- effect ordering must become public caller knowledge;
- result readers must invent authority from projections;
- recovery needs independent bypass authority;
- another subsystem must commit atomically with terminal acceptance.

## Slice 2C — Thin Producer Adapters

**Outcome and source requirement:** Typed finish, execution-parent report, and compatible assistant parser paths share the core terminal semantics without duplicate state choreography.

**Type:** Delivery/simplification using TDD.

**Likely seam:** Existing Pi tool/runtime entrypoints become normalization and presentation adapters. Planning-parent publication remains on its existing semantic operation.

**Behavior and direct evidence:**

- `delegate_finish` submits current delegated identity and normalized role evidence to the core operation;
- normal/root callers cannot parameter-select or impersonate delegated child lifecycle identity;
- runtime parsing preserves raw evidence and submits only valid current-attempt terminal evidence;
- assistant prose after a typed accepted result remains diagnostic and cannot overwrite it;
- execution-parent reports, worker/reviewer/verifier results, and legacy FFRESULT paths produce equivalent terminal semantics;
- malformed or missing required output remains honest and repairable under the accepted failure contract;
- adapter responses expose accepted/rejected/incomplete/reconciled outcomes without claiming a commit did not occur.

Self-verify through registered Pi executor/runtime callback tests plus focused core assertions. Preserve legacy parsing; no migration contraction occurs in R2.

**Dependencies:** Slices 2A and 2B.

**Stop conditions:**

- an adapter still owns claim, commit, lease, alert, or retry ordering;
- planning-report behavior would be pulled back into generic terminal publication;
- transport differences require a public behavior decision;
- test setup must duplicate the implementation protocol instead of observing outcomes.

## Phase 2 Sequential Self-Check

Run the smallest focused checks after each slice. After Slice 2C, run serially:

```bash
npm run test:delegation
npm run test:pi-extension
git diff --check
```

Then self-review once against the terminal-publication spec:

- one accepted outcome per assignment attempt;
- accepted/rejected evidence separation;
- identical/conflicting retry behavior;
- interruption and reconciliation claims;
- lease, event, alert, and projection idempotency;
- producer parity and compatibility preservation;
- no caller-owned sequencing or R3 startup work.

Correct clear local defects and rerun affected checks. Do not dispatch an independent reviewer merely because R2 ends.

## Backward Checkpoint

**Continue to R3 if:** direct evidence supports immutable acceptance, every specified recovery boundary, producer parity, and serial full checks.

**Diagnose if:** failures repeat, differ without explanation, or reveal another consequence with no supported common cause.

**Re-enter design if:** diagnosis or direct evidence establishes that the store interface cannot own claim, commit, and reconciliation without caller coordination.

**Revise the spec if:** terminal status meaning, public failure behavior, compatibility, or recovery semantics must change.

**Revise this plan if:** the slices, evidence boundary, or dependency order no longer describes the bounded finish path.

**Owner decision if:** compatibility must narrow, a new public operation/state is required, or a hard-to-reverse storage identity changes.

# Phase 3 — Next Directional Horizon: Startup And Parent Materialization

## Intended Outcome

Routed and compatibility startup share one assignment-attempt claim and recovery contract. Parent routes start or reuse a visible planning/execution parent before route application becomes `applied`.

## Dependencies

- immutable assignment/attempt identity;
- causal execution authorization;
- monotonic lease authority;
- terminal outcome semantics stable enough for startup recovery.

## Likely Slices

- claim and immutable startup fingerprint before consequential side effects;
- routed leaf and parent materialization through one coordinator;
- pre-delivery cleanup, ambiguous post-send recovery, and visible-state adoption;
- compatibility spawn over stored routed/recovery authority;
- mixed routed/direct concurrency, protected-cohort parity, and focused fault evidence.

## Questions To Resolve From Phase 2 Evidence

- whether startup and terminal recovery can share only low-level lock/file primitives without sharing lifecycle policy;
- which direct-spawn option differences are observable and need owner adjudication;
- which existing layout-only parent applications are safely adoptable.

# Later Phases — Provisional

## Pure Reads And Scoped Control

Make result/recovery reads observational, bind child lifecycle identity to the current delegated attempt, and derive parent inbox acknowledgement from stored authority. Do not implement future consumption semantics here.

## Simplification And Checkpoint R

Remove obsolete startup/terminal choreography only after replacement evidence passes. Preserve compatibility adapters without independent authority. Run one reproducible Phase R verification package and final assurance against a frozen source identity.

## Phase 7 — Role-Aware Result Projection

Only after Checkpoint R, deepen the result projector with role-specific defaults, explicit full/raw recovery, byte bounds, mandatory blockers/failed checks, escaped untrusted evidence, and read purity.

## Phase 8 — Consumption, Assessment, Retention, And Fixes

Separate assignment outcome, role assessment, pane state, parent consumption, and alert state. Define explicit consume/accept behavior before automatic closure. Fixes use a new attempt and narrowed authority.

## Compatibility Migration And Visible Dogfood

Use expand–migrate–contract for direct spawn and legacy chat results. Gather consumer evidence before contraction. After deterministic runtime evidence passes, run visible cmux dogfood and baseline-versus-with-skill evals. Live smoke supplements tests rather than replacing them.

# Checkpoint R Acceptance

Direct evidence must prove:

- assignment/attempt identity and legacy adoption fail closed;
- planning publication, owner confirmation, execution envelope, and authorization remain causally bound;
- terminal lease IDs cannot reactivate and lease history cannot be lost or ambiguously replayed;
- one immutable terminal outcome owns each assignment attempt and all effects reconcile exactly once;
- routed, compatibility, and mixed startup produce one attempt and no duplicate pane/process;
- parent routes have visible running evidence before `applied`;
- direct spawn cannot create independent workflow authority;
- result reads are pure and lifecycle/inbox authority is identity-scoped;
- valid route, layout, policy, alert, wake, and compatibility behavior remains green;
- generated output, serial relevant suites, and `git diff --check` pass.

Phase 7 remains stopped until all conditions are supported.

# Final Direct Checks And Independent Assurance

After the final Phase R implementation slice:

1. run the complete serial verification package and bounded self-review;
2. freeze and record the exact source/diff identity under test;
3. dispatch one fresh verifier and one different fresh reviewer in parallel against that same state;
4. collect both before adjudication;
5. claim Phase R completion only with verifier Pass, resolved review, and no later code change.

The final verifier checks executable claims and evidence boundaries. The final reviewer checks correctness, source alignment, regressions, failure behavior, and unjustified complexity. Neither depends on the other’s output.

Any code change stales both results. Preserve unaffected diagnostic evidence, self-check the correction, and ask before another independent dispatch.

# Dynamic Plan-Health Triggers

Route backward when:

- failures repeat or remain unexplained: diagnose before redesign;
- diagnosis shows ownership, interface, state, or failure-unit pressure: use design-for-depth;
- callers or tests must coordinate internal publication/startup order;
- a bounded slice requires a generic scheduler, transaction manager, or store rewrite;
- compatibility behavior changes without consumer/removal evidence;
- a public API, mode, security, permission, recovery, or data-loss decision appears;
- remaining work grows after a completed slice;
- evidence invalidates a completed claim or later dependency.

Preserve verified work and revise only the affected horizon.

# Verification Notes And Residual Risks

- Delegation and Pi checks both regenerate `dist`; run them serially.
- Distinguish source inspection, direct store/public-executor evidence, process/filesystem concurrency, fake-cmux behavior, and native visible cmux evidence.
- Current generated output and unrelated worktree changes complicate diff ownership.
- Known legacy running assignments and layout-only parent applications may exist outside fixtures.
- Some direct-spawn compatibility consumers are not observable yet.
- cmux delivery remains ambiguous after process interruption until Phase 3 proves recovery.
- host RPC confirmation is proved at the registered Pi executor/fake-host boundary, not every external host.
- No commit, push, release, or deployment is authorized by this plan.

# Change Note

- **2026-07-13:** Updated for the revised Freeflow feedback philosophy. R2 became the executable horizon; intermediate phase-review mandates were removed; slices close through sequential self-verification and bounded self-review; repeated failure routes to diagnosis before design; one parallel verifier/reviewer pair is reserved for final frozen-state assurance.
- **2026-07-13:** Closed R2 after immutable terminal acceptance, effect fault/retry evidence, producer migration, root impersonation rejection, and serial delegation/Pi verification. Returned the plan to Draft because R3 remains directional.
