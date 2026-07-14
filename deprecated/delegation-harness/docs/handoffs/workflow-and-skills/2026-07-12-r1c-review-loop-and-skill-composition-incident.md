# Project Handoff

Date: 2026-07-12

## Purpose

Preserve the evidence and diagnosis from the Phase R Slice R1C review-loop incident so fresh agents can safely continue either of these connected problems:

1. repair the delegation harness's planning-report publication seam without another caller-level patch loop;
2. evaluate whether Freeflow's workflow, execution, TDD, design, review, and verification skills need composition or eval improvements to catch this pattern earlier.

This handoff is memory, not authority. Reopen the named spec, plan, code, reviews, skills, eval reports, and current worktree before acting. Live repo evidence and explicit owner decisions override this note.

## Incident At A Glance

R1C introduced the selected owner-bound public operation:

```text
delegate_request_execution_authorization({ taskId })
```

The operation is intentionally taskId-only. The model requests authorization; host-owned TUI/RPC confirmation is the authority. Delegated sessions, no-UI modes, and unsupported confirmation modes fail closed.

R1C repeatedly passed the full executable test suites but failed three independent review passes:

- pass 1 found six integration/failure-contract gaps;
- pass 2 found two residual branch and report-identity gaps;
- pass 3 found one remaining canonical-state corruption path.

The pass-3 blocker is still open. The three-pass review cap has been reached for the current R1C work/scope. Do not request a fourth review of the same shape or treat a fresh reviewer as pass 1.

Current route:

```text
R1C blocked
-> diagnose/design the failure unit and slice boundary
-> revise the narrow implementation route
-> add a regression/eval before further production or skill wording changes
```

R1D, R2-R5, Checkpoint R, and Phase 7 remain stopped.

## Source Authority To Reopen

Primary delegation source truth:

- `docs/specs/delegation/2026-07-09-deterministic-delegation-workflow-spec.md`
- `docs/plans/delegation/2026-07-09-deterministic-delegation-workflow-implementation-plan.md`
- `AGENTS.md`
- `CONTEXT.md`

Relevant settled behavior:

- execution authorization is causal and predecessor-bound;
- owner approval comes from host confirmation, not model assertions or slash-command invocation;
- the public API remains exactly `delegate_request_execution_authorization({ taskId })` unless the owner changes it;
- malformed submissions are rejected diagnostic evidence and must not own or corrupt canonical state;
- compatibility parsing remains until migration/removal evidence exists;
- Phase 7 cannot start before Checkpoint R passes.

Relevant implementation seams:

- `delegation/src/store.ts`
- `delegation/src/protocol.ts`
- `delegation/src/profiles.ts`
- `delegation/src/types.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/src/delegation/runtime.ts`
- `delegation/tests/delegation.test.js`
- `delegation/tests/store-phase2.test.js`
- `pi-extension/tests/pi-delegation-tools.test.js`
- `pi-extension/tests/pi-delegation-runtime.test.js`

## Review History

### Pass 1

Artifact:

- `.pi-subagents/artifacts/outputs/0267ab38/.tmp/delegation-phase-r/reviews/r1c-owner-approval-surface-review-pass1.md`

All six findings were accepted:

1. A newer `planning_report.ready` did not invalidate the public tool's older `already_authorized` shortcut.
2. A durable `execution.authorized` append followed by projection failure could be reported as if no authorization was accepted.
3. Normal public planning-report publication did not create the required readiness predecessor; tests bypassed the public path with direct store setup.
4. Confirmation sanitization omitted Unicode format/bidi controls.
5. RPC confirmation and unsupported-responder failure lacked focused evidence.
6. Delegated parent profiles advertised an authorization tool that delegated sessions were forbidden to use.

Fixes were implemented and verified before pass 2:

- authorization reuse now matches the latest planning identity;
- committed/reconciled/indeterminate outcomes were introduced;
- public planning-report paths create canonical readiness evidence;
- explicit and legacy plan-artifact extraction was added;
- confirmation text strips terminal and Unicode format controls and is bounded;
- RPC confirmation behavior was tested;
- the authorization tool became orchestrator-only while retaining runtime defense in depth.

### Pass 2

Artifact:

- `.pi-subagents/artifacts/outputs/e9dda95d/.tmp/delegation-phase-r/reviews/r1c-owner-approval-surface-review-pass2.md`

Both findings were accepted:

1. Post-commit reconciliation returning `undefined` or nonmatching evidence still fell through as an ordinary failure instead of `indeterminate`.
2. Unique plan identity was not enforced across conflicting explicit rows, ambiguous legacy rows, runtime fallback, and structured `delegate_finish`; `planArtifactPath` was absent from the strict finish schema.

The explicit fix pass added RED/GREEN coverage and implementation for:

- failed reconciliation returning no evidence -> `commitState: "indeterminate"`;
- ready planning reports requiring one effective plan identity;
- conflicting `PLAN_ARTIFACT_PATH` rows failing parsing;
- ambiguous legacy `ARTIFACT_PATHS` failing parsing;
- runtime parser fallback rejecting ambiguity before storing the report;
- one unique legacy plan path still creating readiness authority;
- `planArtifactPath` in the strict `delegate_finish` schema and structured parent-finish flow.

### Pass 3

Artifact:

- `.pi-subagents/artifacts/outputs/17f98222/.tmp/delegation-phase-r/reviews/r1c-owner-approval-surface-review-pass3.md`

One blocker was accepted:

> `delegate_record_report` writes malformed/ambiguous planning reports through `store.recordTaskReport`, which is the same last-write-wins canonical planning-report slot used by accepted reports.

Consequences:

- a malformed direct report on a fresh task creates a canonical-looking `planning-report.raw/json` slot;
- a malformed direct report can overwrite a previously valid canonical planning report;
- no new `planning_report.ready` event is created, but accepted report source truth is still corrupted;
- the focused direct-tool regression asserted the malformed result and absence of readiness authority, but not absence/preservation of canonical report state.

No pass-3 fixes were applied. This is the correct state under the review cap.

## Fresh Verification Before Pass 3

The last full verification after the pass-2 fix implementation was:

```text
npm run test:delegation   -> 91/91 passed
npm run test:pi-extension -> 173/173 passed
git diff --check          -> passed
```

These commands prove the covered behavior and build state only. They do not override the accepted pass-3 blocker.

No commit was created.

## Minimal Reproduction For The Open Blocker

The direct tool currently has this shape in `pi-extension/src/delegation/tools.ts`:

```text
parseModelText(rawText)
-> if malformed: store.recordTaskReport(... failureRecord ...)
-> append malformed event/alert
-> return report_malformed
```

`DelegationStore.recordTaskReport` in `delegation/src/store.ts` unconditionally writes the report-name's canonical raw and JSON files. It does not distinguish accepted canonical reports from rejected diagnostics.

A correct regression must cover both prior-state cases:

### Fresh task

1. Invoke `delegate_record_report` with a ready planning report containing conflicting explicit plan paths or ambiguous legacy plan paths.
2. Expect `report_malformed`.
3. Assert no accepted/canonical planning report exists.
4. Assert no `planning_report.ready` event exists.
5. Assert rejected diagnostic evidence is retained at a noncanonical location and referenced by malformed event/alert evidence.

### Existing valid report

1. Record one valid planning report through the public tool.
2. Capture the accepted report identity/content and readiness predecessor.
3. Submit an ambiguous malformed report through the same public tool.
4. Expect `report_malformed`.
5. Assert the accepted raw/JSON report and readiness evidence are byte-for-byte/identity unchanged.
6. Assert the malformed attempt is retained separately as diagnostic evidence.
7. Confirm a later corrected valid submission can still proceed under the settled replacement-plan rules.

Do not satisfy this only by changing a filename in one caller. The same accepted/rejected distinction exists across direct report, structured parent finish, and runtime legacy-parser adapters.

## Root-Cause Diagnosis

### Primary structural issue: shallow report-publication seam

The current interface:

```text
recordTaskReport(taskId, reportName, rawText, parsedReport)
```

is a file writer, not an outcome-owning operation. Callers must coordinate:

- parsing and identity validation;
- accepted versus rejected classification;
- canonical versus diagnostic storage;
- readiness-event creation;
- task/report events and alerts;
- prior accepted-state preservation;
- retry/idempotency behavior;
- attempt/source identity for delegated parser producers.

That coordination is duplicated across:

- `delegate_record_report`;
- planning-parent `delegate_finish`;
- runtime protocol fallback.

Review repeatedly found a sibling branch or adapter because the invariant was not owned by one semantic operation.

### Plan/slice issue

R1C grew to contain:

- owner confirmation UI;
- TUI/RPC handling;
- authorization recovery and partial-commit reporting;
- latest-plan invalidation;
- normal planning-report publication;
- legacy parser compatibility;
- plan-identity parsing;
- confirmation sanitization;
- profile exposure;
- routing integration.

This exceeded one coherent failure unit.

There is also an ordering tension:

- R1C needs trustworthy planning-report readiness evidence;
- R2 is intended to introduce canonical terminal/report publication;
- R1C connected planning reports to authorization through the pre-R2 mutable report writer.

A fresh agent should inspect whether the plan needs a small prerequisite slice for canonical planning-report acceptance before owner authorization can exit, or whether the minimal relevant part of R2 must move earlier. Do not silently absorb broad R2 terminal-publication work into R1C.

### Implementation/test issue

The immediate defects were real implementation omissions, not reviewer preference:

- stale authorization reuse;
- misleading post-commit result semantics;
- no public readiness producer;
- incomplete sanitization and RPC evidence;
- incomplete reconciliation branch coverage;
- incomplete identity-representation coverage;
- failure tests that asserted the returned error but not the forbidden mutation/preservation boundary.

The green suites did not include the missing state-transition combinations.

### Review-process issue

The reviews were precise and source-backed, but the loop discovered invariants serially because fixes were treated as caller-level residuals.

By pass 2, repeated branches across the same report/authorization seam were already design pressure. The correct route should have moved backward before pass 3 rather than treating the third pass as another ordinary confirmation opportunity.

## Freeflow Skill Usage During The Incident

Freeflow was active in `workflow` mode. The session used or loaded:

- `workflow`;
- `decision-gate`;
- `execute-plan`;
- `tdd`;
- `verify-work`;
- `review-work`;
- `design-for-depth` during prior architecture analysis;
- `diagnose-failure` after the three-pass loop failed.

The skills successfully prevented:

- silent owner selection of the public API;
- edits in the same turn as a non-passing review;
- reviewers fixing their own findings;
- a fourth review pass;
- completion claims based only on green tests;
- a broad rewrite of `DelegationStore`.

However, the active skills already contain route-change rules that were not applied strongly enough:

- `execute-plan`: route backward on a second unexpected defect at the same seam;
- `design-for-depth`: stop when review becomes an edge-case stream or correctness depends on cross-module choreography;
- `tdd`: use one vertical RED/GREEN loop and question the seam when tests spread across owned internals;
- `verify-work`: match each claim, including failure behavior, to evidence that can disagree.

Observed execution mistakes:

1. repeated findings were classified as bounded fixes after they had become cross-adapter design pressure;
2. several RED tests were batched before one minimal implementation instead of using one vertical behavior loop;
3. tests asserted rejection/no authority but not all forbidden durable writes or preservation of prior accepted state;
4. the pass-3 reviewer prompt explicitly required no canonical storage, but parent verification had no direct-tool assertion for that claim;
5. R1C slice health was not reassessed when its responsibilities expanded.

This means the incident is not evidence that Freeflow's ideas are absent. It is evidence that skill composition, activation/precedence, and eval coverage are too weak for a long stateful review loop.

## Skill And Eval Evidence To Reopen

Current repo skill sources:

- `skills/workflow/SKILL.md`
- `skills/execute-plan/SKILL.md`
- `skills/review-work/SKILL.md`
- `skills/design-for-depth/SKILL.md`
- `skills/verify-work/SKILL.md`
- `skills/diagnose-failure/SKILL.md`
- `evals/README.md`

Relevant reports:

- `evals/reports/by-skill/workflow-2-report.md`
- `evals/reports/by-skill/execute-plan-3-report.md`
- `evals/reports/by-skill/review-work-6-report.md`
- `evals/reports/by-skill/design-for-depth-1-report.md`
- `evals/reports/by-skill/verify-work-2-report.md`
- `evals/reports/by-skill/diagnose-failure-2-report.md`

Current evidence limitations:

- workflow evidence primarily covers scaling down a tiny typo task;
- execute/review evidence proves non-pass phase exit and the review cap, which worked here;
- design-for-depth has one notification-policy fixture, no baseline in that report, and no broad execution/review-spread eval;
- verify-work's report explicitly recommends a harder failed-verification eval;
- no saved multi-skill composition eval currently proves that workflow + execute + TDD + design + review + verify exits an edge-case stream before a third patch loop.

## Runtime/Repo Skill Drift

Live inspection during diagnosis found that the skills loaded by Pi from:

- `/Users/mohammedhassanmohiddin/.pi/agent/local-packages/freeflow/skills/`

differ from the repo copies under:

- `skills/`

for at least:

- `workflow`;
- `execute-plan`;
- `review-work`;
- `design-for-depth`;
- `verify-work`;
- `diagnose-failure`.

The active local package contains `tdd`; the repo skill directory currently does not. Both package manifests report version `0.3.0`, so semver does not reveal this drift.

Reproduce rather than trusting this snapshot:

```sh
for f in workflow execute-plan review-work design-for-depth verify-work diagnose-failure; do
  diff -q "skills/$f/SKILL.md" "$HOME/.pi/agent/local-packages/freeflow/skills/$f/SKILL.md" || true
done

find skills -maxdepth 2 -name SKILL.md | sort
find "$HOME/.pi/agent/local-packages/freeflow/skills" -maxdepth 2 -name SKILL.md | sort
```

This drift is not proven to have caused the code defects—the loaded package was in several places stricter than the repo copy—but it prevents repo eval reports from proving the exact skill text that guided the session. Treat runtime/source identity as a separate packaging/evidence problem.

## Candidate Skill Improvements — Hypotheses, Not Approved Changes

Do not edit skills directly from this list. Use `evaluate-skill` first and preserve a baseline-versus-candidate case.

### 1. Design pressure overrides bounded-fix routing

Candidate rule:

> If a second review exposes another branch, adapter, caller, or persisted-state consequence of the same invariant, do not classify it as another bounded fix. Re-evaluate the failure unit and slice boundary through design-for-depth.

### 2. Stateful failure-contract matrix

For authorization, persistence, canonical evidence, retries, and recovery, require a compact matrix:

```text
entry point
× valid/invalid input
× empty/existing canonical state
× pre/post-commit failure
× first call/retry
```

Each case should assert:

- returned result;
- allowed writes;
- forbidden writes;
- preservation of prior valid state;
- recovery/diagnostic evidence.

### 3. TDD rejected-operation rule

Candidate rule:

> A fail-closed RED test asserts both visible rejection and absence of forbidden mutation. When prior valid state may exist, it also asserts that state remains unchanged.

### 4. Review-readiness gate

Before dispatching review of a stateful operation, require the parent to name:

- canonical operation/failure unit;
- every producer/adapter;
- accepted and rejected evidence locations;
- committed/indeterminate outcomes;
- forbidden mutations;
- tests proving each claim.

### 5. Follow-up review routing

Candidate behavior:

- pass 1 reviews the full failure unit;
- pass 2 confirms accepted fixes;
- a new blocker class at pass 2 means the scope is unstable and routes to diagnosis/design before more code;
- pass 3 remains terminal evidence/adjudication, not a routine third patch opportunity.

### 6. Slice shape

Candidate planning rule:

> A vertical slice may cross layers, but should own one semantic failure unit. If it depends on canonicalization assigned to a later phase, revise phase order before implementing adapters over the old seam.

### 7. Runtime/eval identity

Investigate exposing the loaded skill source/version/hash in Freeflow status and checking that packaged skills match the artifacts evaluated before publication or dogfood claims.

## Recommended Eval Before Skill Revision

Preserve this incident as a generalized adversarial fixture rather than copying delegation-specific production code.

Suggested fixture shape:

- one canonical accepted-record slot;
- three producers/adapters;
- a valid first submission;
- an invalid replacement submission;
- rejected diagnostics required;
- prior canonical state must remain unchanged;
- one post-commit recovery branch returns `undefined` rather than throwing;
- a first review reports one adapter gap;
- a second review exposes another branch at the same seam.

Compare:

1. baseline without the candidate composition guidance;
2. current skill stack;
3. candidate skill wording/reference.

Useful objective checks:

- no caller-level patch after repeated same-seam findings;
- agent names the shallow failure unit;
- test asserts forbidden mutation and prior-state preservation;
- agent revises slice/design route before a third routine review;
- no broad rewrite or invented public API;
- no skill edits before eval evidence.

Use `skills/evaluate-skill/SKILL.md` and `skills/write-skill/SKILL.md` for any meaningful skill revision. Do not add hooks until wording and evals show a remaining enforcement gap.

## Current Executable Horizon

Do not resume with a one-line patch to `executeRecordReport`.

A safe next horizon is read-only design/eval work:

### Work package A — Delegation failure-unit design

Outcome:

- define one semantic planning-report publication operation that owns accepted versus rejected evidence, canonical preservation, readiness-event creation, retries, and all adapters;
- identify the smallest bounded change that does not become a broad terminal/store rewrite;
- state whether the implementation plan must reorder a prerequisite from R2 into R1C.

Candidate conceptual interface only:

```text
publishPlanningReport(submission)
  -> accepted canonical report + exact readiness predecessor
  | rejected immutable diagnostic evidence
```

The exact name, file, and internal representation are not settled.

### Work package B — Skill-composition eval design

Outcome:

- create the baseline/current/candidate eval proposal described above;
- identify which existing skill owns each rule;
- prefer updating existing skills over creating a new skill;
- avoid overfitting wording to delegation-specific names.

### Work package C — Runtime/source drift investigation

Outcome:

- determine why repo and loaded skill files differ while both packages report `0.3.0`;
- identify which artifact is intended source truth;
- determine whether current evals ran against the packaged skills actually loaded by Pi;
- recommend a non-destructive status/release evidence check.

These packages are read-only and may be researched independently. One parent should synthesize them before any production, plan, spec, skill, or packaging writer begins.

## Directional Later Work

Only after the design/eval checkpoint:

- revise the narrow affected spec sentence if accepted/rejected planning-report storage needs sharper wording;
- revise R1C/R2 ordering if the canonical publication prerequisite moved;
- implement one semantic publication seam using TDD through the highest stable interface;
- keep direct, structured-finish, and runtime adapters thin;
- rerun focused and full delegation/Pi tests;
- determine the correct review checkpoint under the three-pass history—do not call it a fourth same-scope review;
- proceed to R1D only after R1C has an honest phase-exit route;
- keep Phase 7 stopped until all Checkpoint R criteria pass.

## Dirty Worktree And Preservation Warnings

The worktree contains extensive uncommitted delegation source, generated `dist`, tests, specs, and plans from Phase 0-R1 work. There are also unrelated output-router issue/plan files.

Before any edit or commit:

```sh
git status --short
git diff --check
```

Important boundaries:

- `.freeflow/config.json` is pre-existing dirty/user-owned; do not edit it.
- Do not edit `freeflow.json`.
- Do not absorb unrelated output-router/settings work.
- Do not discard or overwrite untracked Phase R source/tests.
- No commit or push has been authorized or created for this incident.
- Generated `dist` files reflect prior builds and are mixed with source changes; inspect ownership before staging.

## Open Decisions And Evidence Gaps

No owner decision currently authorizes:

- changing the taskId-only public authorization API;
- broadening R1C into all of R2;
- changing compatibility/removal policy;
- editing Freeflow skills without an eval;
- adding hooks or runtime enforcement;
- treating the installed package rather than repo root as source truth;
- committing or pushing the current worktree.

Evidence still needed:

- a complete accepted/rejected planning-report failure-unit design;
- RED evidence for fresh-task and existing-valid-state canonical preservation;
- a multi-skill composition eval reproducing the review-loop failure;
- an explanation of repo/package skill drift;
- a plan route that respects the three-pass review history.

## Stop Conditions

Stop and route backward if:

- the proposed fix leaves validation/publication policy in multiple adapters;
- rejected evidence can still replace accepted canonical state;
- a test asserts only an error code without durable-state preservation;
- the next implementation requires a broad `DelegationStore` rewrite;
- R1C silently absorbs unrelated terminal, lease, result-view, retention, startup, or direct-spawn work;
- an agent proposes a fourth same-scope R1C review;
- a reviewer finding changes public API, compatibility, security, or owner behavior without an owner checkpoint;
- skill wording is edited before baseline/current/candidate eval evidence;
- a hook is proposed before wording/eval evidence proves enforcement is needed;
- package/runtime drift is “fixed” by overwriting either copy without identifying source authority;
- live repo evidence conflicts with this handoff.

## Resume Checklist

1. Read `AGENTS.md`, `CONTEXT.md`, `docs/README.md`, the delegation spec, and the implementation plan.
2. Run `git status --short`; protect `.freeflow/config.json` and unrelated work.
3. Reopen all three R1C review artifacts and preserve their pass history.
4. Inspect `executeRecordReport`, `recordTaskReport`, planning-parent finish, and runtime report parsing in live code.
5. Reproduce the canonical overwrite before proposing production code.
6. Load `diagnose-failure`, `design-for-depth`, `evaluate-skill`, and the relevant workflow/review skills.
7. Compare repo and loaded skill files; do not assume the handoff snapshot is current.
8. Define the next slice as design/eval evidence, not another caller-level patch.
9. Ask the owner only if the route changes public behavior, compatibility, architecture authority, or package source truth.
