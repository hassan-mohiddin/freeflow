> **Doc ID:** PLAN-2026-07-10-skill-authoring-evaluation-v2-bootstrap
> **Date:** 2026-07-10
> **Revised:** 2026-07-11
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready for commit — calibrated confirmation adjudicated
> **Source:** `docs/specs/skills/skill-authoring-and-evaluation-v2.md`
> **Failure/design context:** `docs/handoffs/workflow-and-skills/2026-07-11-implementation-scope-drift-and-replanning.md`
> **Execution boundary:** Constrained Pi-first dogfooding; stop before batching or mature evaluator operations

# Skill Authoring And Evaluation V2 Outcome-Level Bootstrap Plan

## Goal

Replace the mature prototype and uncommitted attempt-toolkit artifacts with one deep evaluator operation:

```text
evaluate one case
-> deterministic preflight
-> stop before spending when invalid/blocked/unapproved
-> otherwise run all case variants serially
-> publish one complete trusted result bundle
```

Caller must not coordinate manifests, attempts, retries, grades, comparisons, integrity, or reports.

## Current State

Committed context:

- `3cc7d04` — Freeflow workflow skills disabled in `.freeflow/config.json`;
- `82139d8` — initial scope-drift handoff;
- `7e5efd3` — design-for-depth and architecture-skill lessons added to handoff.

Prototype implementation exists through `84a44f6`. It includes cache, waves, concurrency, adaptive repeats, candidate-only reuse, broad lifecycle CLI, and saved evidence.

Current spec and plan are modified and uncommitted. This revision replaces their attempt-toolkit architecture and removes review-induced contract inflation.

Generic subagent review produced both valid trust findings and later false contract pressure. A controlled cmux-hosted, no-session Pi JSON reviewer was calibrated on clean, source-conflict, and local-detail fixtures before this revision. It is advisory evidence, not authority.

One narrow calibrated confirmation then found a real unsupported-evidence contradiction in this plan. Parent adjudication accepted it and the wording was corrected. No further artifact review is authorized.

Until the spec, plan, and updated handoff are committed and reported:

- no evaluator or skill code changes;
- no paid subject or semantic evals;
- no acceptance claim;
- current skills remain Unverified.

## Source Authority

Implementation follows:

1. explicit owner decisions recorded in revised spec;
2. revised spec after parent review-delta audit and narrow calibrated confirmation;
3. this plan after the same audit and confirmation;
4. live repo and Pi behavior;
5. saved deterministic and behavioral evidence.

Handoff, prototype code, previous artifact revisions, reviewer findings, and saved runs are evidence—not authority to preserve old interfaces.

## Fixed Public Boundary

Keep:

```text
skill-eval doctor
skill-eval init
skill-eval evaluate
```

Remove public:

```text
plan
run
grade
report
resume
candidate-only
cache
concurrency
wave/budget lifecycle
attempt/retry/orphan operations
```

`evaluate` handles exactly one case. It may run one or multiple case-declared variants, but never multiple cases.

Future output-router or shell composition may invoke multiple independent `evaluate` commands. That is outside evaluator contract and not part of this implementation.

## Approved Write Set After Artifact Review

Writes may occur only inside:

```text
skills/write-skill/**
skills/evaluate-skill/**
.skill-eval/write-skill/**
.skill-eval/evaluate-skill/**
docs/specs/skills/skill-authoring-and-evaluation-v2.md
docs/plans/skills/2026-07-10-skill-authoring-and-evaluation-v2-bootstrap-plan.md
```

Do not modify:

- `.freeflow/config.json` after `3cc7d04`;
- scope-drift handoff after `7e5efd3` unless owner requests another durable update;
- root package or lockfiles;
- legacy `evals/`;
- other skills;
- output router;
- delegation harness;
- plugin control plane;
- hooks, installed extensions, or public release docs.

New dependency, second host, new public lifecycle command, write outside set, or changed batching scope requires owner-backed artifact revision.

## Planned Deletions

Delete mature runtime machinery:

```text
skills/evaluate-skill/scripts/lib/cache.mjs
skills/evaluate-skill/scripts/lib/scheduler.mjs
skills/evaluate-skill/scripts/lib/wave.mjs
skills/evaluate-skill/schemas/eval-case.schema.json
skills/evaluate-skill/schemas/run-evidence.schema.json
skills/evaluate-skill/schemas/wave.schema.json
.skill-eval/evaluate-skill/tests/scheduler-cache.test.mjs
.skill-eval/evaluate-skill/tests/wave-resume.test.mjs
```

Remove old CLI and runtime branches for:

- public plan/run/grade/report;
- resume/escalation;
- cache and candidate-only reuse;
- wave persistence;
- concurrency;
- adaptive repeats;
- arbitrary run discovery;
- mutable standalone grading;
- cross-job scheduler logic.

Do not delete saved runs, reports, fixtures, old-skill revisions, handoff, or git history. Prototype evidence remains documentary only.

## Internal Module Guidance

Internal decomposition is implementation detail, but each retained module must hide a distinct decision.

Likely internal responsibilities:

- case/source validation and preflight;
- concrete Pi execution;
- root isolation and path policy;
- fixture/subject materialization;
- raw evidence capture;
- objective grading;
- fresh semantic adjudication;
- result composition and atomic publication;
- process and canonical hash utilities.

Do not add:

- host interface or adapter registry;
- lifecycle state machine;
- cache abstraction;
- scheduler;
- public artifact store API;
- generic schema framework;
- batch coordinator.

Use deletion test before retaining a module: if deleting it spreads security, evidence, or policy complexity across evaluator stages, it earns depth. If complexity disappears, remove it.

## Requirement-Owned Test Surface

Tests must map to accepted interface or retained internal safety requirement.

Public-interface tests:

- only `doctor`, `init`, and `evaluate` accepted;
- old lifecycle commands/options rejected;
- one case per invocation;
- owner-approved and plan-only rules;
- valid operational outcomes emit concise JSON with only applicable fields;
- successful/planned outcomes exit zero and blocked/incomplete/invalid outcomes exit nonzero;
- subject stderr never contaminates command stdout;
- one result path on success, diagnostic path only on incomplete failure.

Preflight tests:

- zero provider requests;
- case/source/variant/resource validation;
- single case requires exactly one `subject`;
- comparison case requires exactly `reference`, then `candidate`, with matching assertion IDs;
- third or ambiguous variant rejected;
- capability and evidence support;
- plan fingerprint stability;
- changed preview detection;
- positive per-process turn/timeout/output limits;
- maximum Pi-process count and worst-case approved turns;
- host-free Pi-process count zero.

Execution tests:

- case variants serial in declared order;
- identical common settings across variants;
- only declared subject resources exposed;
- fresh writable fixture copy per variant;
- objective-first grading;
- semantic invocation only when fixed rubric requires it;
- every Pi process obeys turn, timeout, and output limits;
- automatic provider retries are disabled;
- provider requests, turns, tool calls, tokens, and cost are observed separately;
- single-case verdict precedence is deterministic;
- comparison assertion-pair and aggregate verdicts are deterministic.

Failure tests:

- invalid/blocked/unapproved/invalid-limit stops before provider execution;
- subject behavioral failure can publish complete result;
- infrastructure failure prevents result publication;
- later variants do not start after infrastructure failure;
- crash at each internal phase leaves diagnostics only;
- rerun starts complete case with no partial reuse;
- atomic publication exposes complete integrity-verified bundle or nothing.

Security tests:

- ambient Pi resources disabled;
- fixture reads/writes allowed;
- subject reads allowed and writes rejected;
- eval-source reads rejected;
- traversal and nested symlink escapes rejected by subject and coordinator;
- source subject and fixture remain immutable;
- malformed Pi output retained and reported honestly.

Evidence tests:

- objective artifacts outrank prose;
- semantic judgment cannot repair objective failure;
- malformed required semantic result makes evaluation incomplete;
- valid uncertainty can publish inconclusive result;
- missing cost unavailable, never zero;
- unsupported evaluator evidence cannot silently satisfy an unrelated claim;
- a case explicitly testing honest unsupported-capability reporting may pass;
- result/report derived from current complete bundle only;
- tampering invalidates integrity.

A test without an owning requirement is not bootstrap scope. Feature-owned tests leave with removed feature.

## Review Protocol

Generic Pi subagent verdicts are not acceptance authority for this bootstrap.

Artifact confirmation uses one calibrated, isolated Pi JSON reviewer launched visibly in a focus-neutral cmux helper pane:

- exact provider/model/thinking disclosed before launch;
- `--no-session`;
- no ambient context files, extensions, skills, prompts, or themes;
- read-only tools;
- exact Freeflow artifact-review contract;
- raw events and final output saved outside the repo;
- reviewer output treated as evidence for parent adjudication.

The reviewer was calibrated on clean, source-conflict, and local-implementation-detail fixtures. An initially “clean” fixture exposed a real billing ambiguity; after source truth was clarified, the reviewer passed it. This is evidence for keeping generator, reviewer, adjudicator, and verifier roles distinct.

Before implementation:

- parent audits review-induced artifact changes first;
- one narrow calibrated confirmation reviews only accepted changes and residual trust risk;
- findings are classified as Accepted, Rejected, Question, or Needs evidence;
- owner decides only new public or hard-to-reverse choices;
- no further broad artifact review runs.

During implementation:

- one sole writer;
- calibrated read-only review at outcome-level cutover and final acceptance only when named risk warrants it;
- findings classified as Blocking, Non-blocking, Question, or Evidence gap before parent adjudication;
- findings are not automatic permission to expand scope;
- repeated findings that add public concepts trigger backward route, not patch loop.

## Slice 0: Artifact Gate

### Purpose

Confirm outcome-level architecture is coherent and implementable before code.

### Work

- Review revised spec and plan with handoff context.
- Check one-command interface, internal preflight, owner gate, single/comparison decisions, enforceable per-process limits, concise operational outcomes, whole-case atomicity, no batching, failure/restart behavior, security, and result bundle.
- Confirm old attempt-toolkit concepts are absent from public contract.
- Adjudicate once.
- Commit accepted artifacts.
- Report before code changes.

### Checks

```bash
git diff --check -- docs/specs/skills docs/plans/skills
git status --short
git log -5 --oneline
```

### Stop Conditions

- Reviewer finds unresolved public interface or atomic failure-unit decision.
- Artifact requires partial reuse, continuation, cache, batching, or second host.
- Implementer would need to invent owner-owned behavior.
- Current finish path cannot be explained as preflight, execute, publish.

### Checkpoint

Commit:

```text
docs(skills): adopt outcome-level eval bootstrap
```

No code begins before owner receives artifact review result.

## Slice 1: Atomic Outcome-Level Cutover

### Purpose

Replace mature public lifecycle with working `evaluate` operation in one coherent cutover.

### Work

- Add exact `evaluate` CLI and reject old lifecycle commands/options.
- Keep `doctor` and `init` administrative commands.
- Implement internal deterministic preflight.
- Add optional `--plan-only`, explicit `--owner-approved`, and optional `--expect-plan` binding.
- Validate one case, its evaluation kind, fixed variant roles, assertion pairing, and declared resources.
- Resolve Pi-process count, per-process turn/timeout/output limits, spend ceiling, and evidence support before provider execution.
- Implement one internal evaluation coordinator.
- Run variants serially through concrete Pi executor.
- Give every subject and semantic process the same approved per-process hard limits.
- Disable automatic provider retries in isolated Pi settings.
- Capture raw evidence and objective grades.
- Run fresh semantic adjudication only when fixed rubric requires it.
- Compute kind-specific verdict: single-case or comparison, never both.
- Emit concise JSON for valid operational outcomes without freezing an exhaustive error protocol.
- Compose one `result.json` and `report.md`.
- Publish one complete integrity bundle atomically.
- Preserve incomplete infrastructure artifacts as diagnostics only.
- Delete cache, scheduler, wave, schemas, feature-owned tests, and old public lifecycle branches in same cutover.
- Update `evaluate-skill` instructions/references to describe one-case evaluation and remove cache/wave/retry/batching guidance.
- Keep `write-skill` model-facing content stable unless direct contradiction appears.
- Add explicit subject-resource declarations to case source.
- Mark non-differentiating `ESK2-001` non-required without deleting regression.

This slice may contain internal implementation checkpoints, but its commit occurs only when public CLI works and old lifecycle is gone.

### Checks

- `evaluate --plan-only` makes zero provider requests.
- Model-driven invocation without owner approval returns a successful `needs_approval` plan outcome and zero requests.
- One-call approved invocation preflights and executes in one process.
- `expect-plan` mismatch stops before provider requests.
- Host-free case rejects model options and reports zero Pi processes.
- One invocation accepts one case only.
- Single case accepts only one `subject` and publishes only `pass|fail|inconclusive` as `case_verdict`.
- Comparison case accepts only `reference` then `candidate` and publishes only `comparison_verdict`.
- Variants run serially.
- Every Pi process obeys its turn, timeout, and output limits.
- Provider requests are observed and reported without claiming a global hard cap.
- Valid operational outcomes use concise JSON; invalid and incomplete work exits nonzero.
- Complete result bundle published only after all required stages.
- Infrastructure failure publishes no result.
- No old lifecycle command or option works.
- Runtime creates no cache/wave/scheduler state.
- Saved prototype evidence remains untouched.

```bash
node --test .skill-eval/write-skill/tests/*.test.mjs
node --test .skill-eval/evaluate-skill/tests/*.test.mjs
node skills/evaluate-skill/scripts/skill-eval.mjs --help
node skills/evaluate-skill/scripts/skill-eval.mjs doctor
```

### Stop Conditions

- Cutover requires another public command or lifecycle state.
- Caller must select variants, attempts, grades, comparison paths, or integrity paths.
- Implementation requires cache, resume, partial reuse, batching, concurrency, or host abstraction.
- Semantic work cannot fit the approved Pi-process and per-process hard-limit model.
- Old and new public lifecycle must coexist beyond cutover.
- A new runtime subsystem appears.

### Checkpoint

Fresh interface-depth and correctness review. Commit one coherent cutover only after accepted fixes remain inside scope.

Tentative commit:

```text
refactor(evals): adopt one-case evaluation
```

## Slice 2: Retained Isolation And Publication Hardening

### Purpose

Prove retained security/evidence seams independently of model behavior.

### Work

- Reuse and simplify explicit Pi root guard.
- Apply canonical containment to every coordinator evidence read.
- Reject nested symlink escapes.
- Materialize only declared subject resources.
- Preserve source subject and fixture immutability.
- Harden per-process timeout/output/turn enforcement and provider-request observation.
- Define result integrity inventory and no-overwrite atomic publication.
- Make diagnostics clearly non-gradeable and non-comparable.
- Retain raw malformed output and unavailable usage honestly.

### Checks

Run focused deterministic tests for:

- subject and coordinator path policy;
- traversal/symlink rejection;
- allowed fixture behavior;
- denied subject writes;
- source immutability;
- event/usage parsing;
- hard limits;
- crash boundaries;
- atomic publication;
- tamper detection;
- diagnostic/result separation.

No paid provider request occurs in this slice.

### Stop Conditions

- Fix needs new sandbox, dependency, host hook, or public recovery concept.
- Result integrity requires caller-managed protocol.
- Diagnostic data is treated as acceptance evidence.

### Checkpoint

Fresh security/evidence review, then focused commit.

Tentative commit:

```text
fix(evals): harden evaluation evidence
```

## Slice 3: Deterministic Contract Verification

### Purpose

Prove complete reduced contract before dogfooding.

### Work

- Run full retained deterministic tests.
- Validate both active skills structurally.
- Smoke-test author `init`, `validate`, and `inspect` in temporary root.
- Smoke-test evaluator `doctor`, `init`, and host-free `evaluate`.
- Prove plan-only/approval/change/budget behaviors with fake Pi executor.
- Prove one complete synthetic multi-variant result.
- Confirm deleted files/options remain absent.
- Confirm legacy `evals/`, output router, and other skills unchanged.
- Confirm `.freeflow/config.json` matches `3cc7d04`.
- Confirm handoff matches `7e5efd3`.

### Checks

```bash
node --test .skill-eval/write-skill/tests/*.test.mjs
node --test .skill-eval/evaluate-skill/tests/*.test.mjs
node skills/write-skill/scripts/skill-author.mjs validate skills/write-skill
node skills/write-skill/scripts/skill-author.mjs validate skills/evaluate-skill
node skills/evaluate-skill/scripts/skill-eval.mjs doctor
git diff --check -- skills/write-skill skills/evaluate-skill .skill-eval docs/specs/skills docs/plans/skills
git diff --exit-code 3cc7d04 -- .freeflow/config.json
git diff --exit-code 7e5efd3 -- docs/handoffs/workflow-and-skills/2026-07-11-implementation-scope-drift-and-replanning.md
```

### Stop Conditions

- Any deterministic command starts a provider request.
- Tests preserve removed lifecycle instead of accepted interface.
- Public CLI contains more than doctor/init/evaluate.
- Complete-case success/failure cannot be explained through public interface.

### Checkpoint

Report deleted scope, retained modules, public interface, and fresh deterministic evidence before any paid run.

Tentative commit:

```text
test(evals): verify outcome-level contract
```

## Slice 4: Bounded Dogfooding Evidence

### Purpose

Test architecture and skill behavior with real Pi evidence after deterministic acceptance.

### Work

- Keep prototype runs documentary only.
- Select minimum required cases from accepted matrix.
- For each case, present exact command, evaluation kind, variants, provider/model/thinking, maximum Pi-process count, per-process turn/timeout/output limits, worst-case approved turns, spend ceiling, and unsupported claims.
- Notify owner immediately before each paid invocation.
- Run one case per `evaluate` call; no batching.
- Use output router only in a later separate plan if composition becomes useful.
- Run one manual direct Pi calibration matching one evaluator case.
- Preserve each complete result bundle and report.
- Stop on architecture change, ambiguous evidence, or unplanned rerun.

### Minimum evidence categories

`write-skill`:

- differentiating pressure/readiness;
- Draft/Unverified behavior;
- positive activation;
- near-miss;
- self-contained structure.

`evaluate-skill`:

- artifact-over-prose;
- no fake verification;
- positive activation;
- near-miss;
- self-contained structure;
- unsupported multi-turn honesty;
- differentiating user-authority/eval-reuse pressure.

Host-free structural cases spend zero provider requests. Provider-driven cases require independent owner approval.

### Checks

- Every invocation evaluates exactly one case.
- Preflight result matches execution plan fingerprint.
- Pi-process count and worst-case approved turns include potential semantic work; every process obeys its hard limits.
- Complete bundles pass integrity.
- Infrastructure failure creates diagnostics only.
- No prototype artifact is imported into new result.
- Skill behavior claims use required evidence class.
- True spend excludes unavailable cost and says so.

### Stop Conditions

- Case criteria change after seeing output.
- A rerun is proposed without ambiguous or invalid evidence.
- More cases become required without named acceptance claim.
- Batching, cache, resume, or partial reuse appears useful enough to change architecture.
- Any paid run follows an implementation change without deterministic re-verification.

### Checkpoint

Commit only selected durable reports/evidence indexes, never generated noise.

## Slice 5: Acceptance Audit And Stop

### Purpose

Decide whether tooling is safe for constrained Pi-first dogfooding.

### Work

Create:

```text
.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md
```

Include:

- exact source revisions;
- public interface and failure contract;
- deleted/deferred prototype scope;
- deterministic commands/results;
- selected case commands and result bundles;
- manual calibration;
- objective/semantic verdicts;
- usage/cost and unavailable fields;
- unsupported/deferred capabilities;
- residual risks;
- proposed readiness statement.

Launch calibrated isolated Pi JSON reviews from a focus-neutral cmux helper pane with exact prompts and read-only tools:

1. interface/security/minimality;
2. raw evidence/readiness.

Preserve raw events and outputs outside generated acceptance evidence. Parent adjudicates once; reviewer count does not decide truth.

### Allowed outcome

> Tooling accepted for constrained Pi-first dogfooding. `write-skill` and `evaluate-skill` remain Unverified v2 candidates.

### Forbidden claims

- Production-Ready;
- batch evaluator;
- cache/resume/concurrency support;
- multi-turn support;
- cross-host support;
- historical prototype evidence imported into new trust model.

### Final Stop

Stop after acceptance decision. Do not continue into:

- batching or output-router integration;
- additional cases or semantic polish;
- cache/resume/concurrency;
- Pi RPC;
- Codex/Claude;
- legacy migration;
- other Freeflow skill rewrites.

Those require later owner-approved work.

## Plan-Health Re-entry Triggers

At every checkpoint, freeze and return to artifact discussion when:

- another public lifecycle command, state, or storage concept appears;
- caller must coordinate variants, attempts, retries, grades, comparison, integrity, or report;
- batching enters evaluator;
- cache, resume, partial reuse, concurrency, or second host appears;
- second unexpected defect appears at same retained seam;
- case criteria change;
- architecture changes after paid evidence;
- required reruns increase;
- remaining work grows after completed checkpoint;
- reviewer finding requires user-owned scope, security, compatibility, or hard-to-reverse architecture decision;
- remaining finish path cannot be stated as preflight, execute, publish.

Do not patch through trigger. Preserve evidence, name failed assumption, generate alternatives if public interface is affected, and ask owner.

## Expected Commit Checkpoints

After artifact approval:

1. `docs(skills): adopt outcome-level eval bootstrap`
2. `refactor(evals): adopt one-case evaluation`
3. `fix(evals): harden evaluation evidence`
4. `test(evals): verify outcome-level contract`
5. `docs(evals): record constrained bootstrap acceptance`

Commit messages tentative. Each commit must remain coherent and independently reviewable. Generated run noise remains uncommitted.

## Completion Report Before Code

After artifact review, report:

- reviewer verdicts;
- agreed public interface;
- atomic success/failure contract;
- planned deletions;
- retained internal responsibilities;
- slices and stop conditions;
- owner decisions still open;
- artifact commit hash.

No code edit begins before this report.
