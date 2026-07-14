# Output Router Artifact Review-Loop Diagnosis Handoff

Date: 2026-07-12

## Purpose

Preserve the diagnosed workflow and skill failure after the Output Router governing-artifact rewrite continued to reveal blocking public-contract findings through four review passes.

This handoff is memory, not authority. Reopen live artifacts and worktree state before acting.

## Stable Context

- Worktree: `/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow-output-router-phase1`
- Branch: `fix/output-router-audit-phase1`
- Current recorded HEAD: `048f6ce`
- The original `Freeflow/` checkout contains unrelated delegation/Pi WIP and must not be edited or used to regenerate dist.
- No Output Router implementation, build, dist regeneration, or installed target smoke has occurred.
- The governing audit/spec/plan and two superseded snapshots remain uncommitted in this worktree.

Governing artifacts under revision:

- `docs/issues/output-router/2026-07-10-output-router-pi-completion-audit.md`
- `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
- `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`
- `docs/README.md`

Superseded snapshots intended for the eventual docs checkpoint:

- `docs/issues/output-router/2026-07-09-output-router-audit-issues.md`
- `docs/plans/output-router/2026-07-09-output-router-audit-fix-plan.md`

## Decisions And Source Authority

Owner-approved directions remain settled:

- `freeflow_search action="recover"` is the V2 recovery API;
- the Router Engine is outcome-level and receipts remain private;
- V1 recovery/export is owner-operated, offline, read-only, and never model-facing;
- the Pi manifest is the only supported v0.4 package entrypoint;
- all accepted P0/P1 audit findings remain in scope before Pi completion;
- malformed, modified, stale, unauthorized, wrong-role, and unknown recovery handles collapse to `invalid_recovery_handle` to avoid a validity oracle.

The specification owns target behavior. The audit owns evidence/findings. The rolling plan owns execution order. Live v0.3 source/tests/plugin docs remain current implementation truth until code lands.

## Evidence And Current Status

The artifact rewrite materially improved:

- public/internal result separation;
- opaque callable recovery;
- outcome/disposition ownership;
- typed-media private delivery;
- V1 offline isolation and downgrade semantics;
- package support boundary;
- installed-Pi vertical planning;
- migration/removal gates;
- audit evidence traceability.

Focused v0.3 characterization passed 133/133 tests. Structural checks passed for Markdown links, fences, whitespace, and P0/P1 traceability. The traceability table contains all 76 P0/P1 IDs exactly once.

Review history:

- **Pass 1:** found undefined public result branches, an ambiguous vault output selector, missing audit evidence traceability, and an under-specified installed proof.
- **Pass 2:** confirmed those corrections but found open recovery error codes, missing typed-media delivery, and incomplete Phase 1 partial-proof traceability.
- **Pass 3:** passed the contract residuals; found one mechanical duplicate traceability mapping. The owner authorized a bounded final correction.
- **Pass 4:** explicit owner exception to the normal three-pass cap. Audit/plan readiness passed, but the broad spec review found two remaining blockers:
  1. public summary/result types still permit vault `retrieve`, while the closed request union correctly restricts `retrieve` to repo/local and requires V2 vault evidence to use `recover`;
  2. `FreeflowRequest`, `BatchRequest`, `StatusRequest`, `Fidelity`, and `TransformOperation` are referenced but not fully defined.

No pass-4 finding has been edited into the governing artifacts. Do not treat the docs set as checkpoint-ready yet.

## Skill And Workflow Failure Diagnosis

### Primary failure: shallow artifact/public-interface design

The specification has multiple authorities for one public contract:

- tool summaries;
- normative request unions;
- result operation types;
- prose invariants;
- migration tables;
- plan slices.

Changing one surface did not update the others. This produced shotgun surgery, contract-surface explosion, and an edge-case review stream. The vault `retrieve` contradiction is direct evidence.

### Secondary failure: incorrect timing/application of design-for-depth

The complete interface-design loop was not applied before the large rewrite. Two exploratory engine designs were compared, but two materially different complete public API surfaces were not designed and compared. The rewrite began from existing contract machinery rather than first framing caller outcome, failure unit, and caller-owned decisions.

The design-for-depth references were read only after the repeated review failure:

- `interface-design-loop.md`
- `design-pressure-signals.md`
- `software-design-philosophy.md`

Their route-changing conclusion is that the current contract should not receive another sequence of local patches before its caller knowledge and normative authority are reconstructed.

### Compression/synthesis failure

The rewrite reduced the older spec's machinery but removed settled definitions such as transform, fidelity, batch, and status request shapes while leaving references to them. This was over-compression, not a newly unresolved product decision.

### Skill coverage gap

`write-spec` and `review-artifact` did not force a deterministic public-contract completeness gate before review. The missing check should establish:

- every referenced public type is defined;
- every tool/action maps to one request and result branch;
- summaries agree with the normative contract;
- required/forbidden fields close per branch;
- public selectors agree with capability/access rules;
- failure codes and typed-delivery paths are complete;
- one artifact section is the normative authority and other text derives from it.

This is a candidate skill/eval improvement for the separate skill-system work, not permission to edit that repository from this worktree.

### Review skill assessment

The review skill was not the primary failure. It surfaced blocking gaps, narrowed follow-ups, enforced parent adjudication, and routed to diagnosis after the cap. Pass 4 found more issues because it returned to a broad scope after narrow follow-up passes; that confirms the artifact/interface problem rather than proving that unlimited reviews are the solution.

## Current Route

- Phase/slice: pre-implementation governing-artifact design.
- Route: **backward to public-contract discovery/design**, not another review and not implementation.
- Failure unit: one complete public tool call or observed no-patch/replacement outcome.
- Immediate goal: establish one finite normative public contract that summaries, results, migrations, and plan slices can reference without duplicating meaning.

## Current Executable Horizon

Run a bounded contract-reconstruction learning slice before editing the governing artifacts again.

1. Frame callers and complete outcomes for search, run, batch, status, and observed routing.
2. Inventory every public fact callers must know and classify caller-owned versus internal protocol.
3. Build a finite matrix: tool/action → request → result → public failure → side effects → authority/capability.
4. Design two materially different complete public interfaces, not cosmetic variants.
5. Compare depth, locality, misuse risk, Hyrum surface, failure honesty, reversibility, and evidence cost.
6. Select or run a bounded prototype only if source evidence cannot distinguish them.
7. Define one normative authority and derive summaries/plan fixtures from it.
8. Add deterministic contract-completeness verification before any new artifact review.

The two pass-4 blockers become test cases for this loop; they are not the whole design task.

## Directional Later Work

After the contract loop succeeds:

- revise only affected audit/spec/plan sections;
- verify type/reference and action/result closure mechanically;
- run no additional broad review loop unless scope or source truth materially changes;
- seek owner acceptance for the docs-only checkpoint;
- commit the governing docs only with explicit authorization;
- create a fresh implementation worktree from that checkpoint and current main;
- begin the installed Pi text vertical proof.

All later V2, migration, search/index, producer, config/package, benchmark, and Pi completion work remains governed by the rolling plan and must stay directional until its phase becomes current.

## Invalidated, Superseded, Or Deferred

- Invalidated: patching each newly found contract inconsistency independently and sending the same artifact through another broad review.
- Invalidated: treating more review passes as the feedback loop for public-contract completeness.
- Deferred: changes to `write-spec`, `review-artifact`, or design-for-depth skills; preserve this case for separate skill evaluation.
- Deferred: implementation, builds, dist regeneration, commits, and implementation-worktree creation.

## Open Decisions And Evidence Gaps

No new owner decision currently blocks the contract-reconstruction slice. The missing public types derive from already settled tool behavior, but their complete interface must be compared rather than reconstructed tactically.

Evidence gaps:

- no deterministic contract matrix exists yet;
- no undefined-reference/public-branch checker has been run against the spec sketches;
- the complete public API has not been designed twice;
- pass-4 blockers remain present in the spec;
- no clean build or installed target smoke exists.

## Next Route

Start with the interface-design loop and produce a temporary contract matrix plus two complete interface alternatives. Do not edit the governing spec until that comparison yields a supported route.

## Stop Conditions

Stop and re-enter the decision gate if reconstruction changes:

- owner-approved recovery, V1, package, privacy, migration, or no-patch behavior;
- public API scope beyond settled actions;
- delegation ownership;
- security disclosure policy;
- the Pi-first completion boundary.

Stop and redesign again if caller knowledge grows, internal storage/authorization identities reappear publicly, or a second contradiction emerges at the same seam.
