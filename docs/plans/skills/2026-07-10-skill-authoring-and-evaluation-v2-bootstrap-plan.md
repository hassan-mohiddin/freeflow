> **Doc ID:** PLAN-2026-07-10-skill-authoring-evaluation-v2-bootstrap
> **Date:** 2026-07-10
> **Revised:** 2026-07-11
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Revised during implementation — risk-first re-entry required
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

The outcome-level spec, plan, and review-reliability handoff were committed in `2d4cb62`. Portable reviewer contracts were calibrated and committed in `719b268`.

The first Slice 1 implementation remains uncommitted. It cut the public surface to `doctor|init|evaluate`, removed mature lifecycle machinery, and passed deterministic tests, but three bounded `review-work` passes exposed a repeated failure-contract seam:

1. settled process usage was reconstructed too late;
2. post-process and cleanup failures could replace that usage or the primary failure;
3. diagnostic publication could still suppress write/rename failure and advertise a nonexistent path.

Every accepted implementation finding was source-backed. Pass 3 reached the hard review cap and routed backward. No fourth review is authorized for the same work and scope.

Diagnosis: the public one-command architecture remains valid, but the plan combined execution, accounting, grading, publication, diagnostics, CLI cutover, and legacy deletion in one slice while deferring publication hardening to Slice 2. The implementation therefore grew a shallow coordinator and example-by-example failure patches instead of deep internal outcome and publication boundaries.

Until the risk-first plan is applied:

- stop feature work and model review;
- do not commit the current evaluator cutover as complete;
- do not run paid subject or semantic evals;
- preserve the uncommitted implementation as diagnostic evidence;
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

## Slice 1: Outcome And Failure Contracts

### Purpose

Define the internal invariants that must survive every later execution and publication failure before changing the public CLI.

### Work

- Define a normalized settled execution record containing process status, turns, provider requests, tool calls, tokens, cost, and unavailable fields.
- Define an append-only evaluation ledger. A process is recorded exactly once immediately after it settles; later code cannot reconstruct or erase it.
- Define `complete|incomplete` internal operation outcomes with value, settled execution, primary failure, and secondary cleanup/publication failure.
- Define result and diagnostic publication outcomes. A path exists only after confirmed publication.
- Define the fault matrix for every operation after a process settles.
- Keep these contracts internal and dependency-free.
- Do not change the public CLI or delete prototype lifecycle code in this slice.

### Checks

Pure deterministic tests prove:

- recording order and exactly-once accounting;
- unavailable cost/tokens remain unavailable rather than zero;
- primary failure survives secondary cleanup failure;
- later failure cannot mutate prior ledger entries;
- publication failure cannot manufacture a path;
- public usage derives only from the ledger.

### Stop Conditions

- A contract needs a new public command, recovery token, or persistent scheduler.
- Usage remains attached to ad hoc exceptions or reconstructed from artifacts.
- Primary and cleanup/publication failures cannot coexist without overwriting each other.

### Checkpoint

Commit the internal contracts and tests while the existing public CLI remains unchanged.

Tentative commit:

```text
refactor(evals): add evaluation outcome ledger
```

## Slice 2: Process Outcomes

### Purpose

Make subject and semantic process boundaries return the same deep outcome shape.

### Work

- Adapt subject execution so settled execution is captured before persistence, parsing, grading, or cleanup.
- Adapt semantic execution to the same outcome contract.
- Disable automatic provider retries in isolated Pi settings.
- Apply the approved per-process turn, timeout, and output limits to both process types.
- Preserve raw evidence for process, persistence, parse, protocol, grading, and cleanup failure.
- Keep setup failures with no provider work distinct from post-settlement failures.

### Checks

Fault-injection tests cover:

- process startup failure before a request;
- hard-limit and malformed-output failure after settlement;
- subject and semantic evidence-write failure;
- objective and semantic grading failure;
- subject and semantic cleanup failure;
- primary plus cleanup failure;
- exact settled usage in every returned outcome.

No paid provider request occurs.

### Stop Conditions

- Subject and semantic paths require different accounting contracts.
- A post-settlement path can throw without returning its execution record.
- Cleanup can replace a primary failure.

### Checkpoint

Commit both adapters only after they satisfy the same deterministic contract.

Tentative commit:

```text
refactor(evals): return settled process outcomes
```

## Slice 3: Publication Transaction

### Purpose

Prove result and diagnostic publication before the coordinator or CLI depends on them.

### Work

- Implement no-overwrite result publication as an explicit transaction.
- Build and verify the integrity inventory before atomic result rename.
- Implement diagnostic publication as an explicit best-effort outcome.
- Keep command stdout as the guaranteed incomplete-outcome fallback.
- Return a diagnostic path only after write, directory creation, rename, and existence confirmation succeed.
- Preserve original failure and ledger usage when diagnostic publication also fails.
- Keep diagnostics non-gradeable and non-comparable.

### Checks

Deterministic fault injection covers every step:

- staging creation;
- result write;
- integrity write;
- destination directory creation;
- result rename;
- diagnostic write;
- diagnostic directory creation;
- diagnostic rename;
- no-overwrite collision;
- primary failure plus each publication failure;
- crash before and after atomic rename.

### Stop Conditions

- Publication success is inferred from attempted I/O instead of confirmed state.
- A suppressed filesystem error can produce a public path.
- Diagnostic publication failure loses in-memory usage or primary failure.
- Result and diagnostic storage require caller coordination.

### Checkpoint

Commit the publisher and fault matrix before wiring the full coordinator.

Tentative commit:

```text
fix(evals): make publication transactional
```

## Slice 4: Thin Evaluation Coordinator

### Purpose

Compose preflight, serial execution, grading, decisions, accounting, and publication without owning their low-level mechanics.

### Work

- Implement deterministic one-case preflight and plan fingerprint binding.
- Validate evaluation kind, ordered roles, declared resources, capabilities, and evidence support before provider work.
- Bind case, fixture, subject, evaluator, and semantic identities.
- Run variants serially through the process-outcome adapters.
- Append every settled execution to the ledger before interpreting status.
- Check the soft spend ceiling only between settled processes.
- Grade objective assertions first and semantic assertions only when unresolved and valid.
- Compute exactly one kind-specific decision.
- Compose complete provenance from frozen plan, ledger, grades, evidence support, unavailable fields, limitations, and residual uncertainty.
- Call the result publisher only after every required stage completes.
- Call the diagnostic publisher on incomplete work; preserve truthful stdout when publication fails.

The coordinator coordinates deep modules. It does not write evidence files, clean temporary roots, reconstruct usage, or implement rename transactions itself.

### Checks

- Synthetic single and comparison cases complete through the same coordinator.
- Variants remain serial.
- Exact spend boundary prevents a later process; a final process may cross softly and still complete.
- Behavioral assertion failure may publish a complete result.
- Infrastructure failure cannot publish a result.
- Every injected post-settlement failure preserves ledger usage and primary/secondary failures.
- Coordinator tests use real outcome adapters or fault-injection seams, not pre-annotated error mocks.

### Stop Conditions

- Coordinator grows a second persistence or cleanup path.
- Usage is read directly from exception metadata or generated files.
- Another orchestration state, scheduler, cache, or resume concept appears.
- Failure correctness requires listing coordinated steps across multiple shallow modules.

### Checkpoint

Parent audits the full failure-state graph. Do not request another model review for the capped Slice 1 review scope.

Tentative commit:

```text
refactor(evals): compose one-case evaluation
```

## Slice 5: Public CLI Cutover

### Purpose

Expose the already-proven engine through `evaluate` and remove the mature prototype lifecycle in one bounded public change.

### Work

- Add exact `evaluate` CLI and reject old lifecycle commands/options.
- Keep `doctor` and `init`.
- Add `--plan-only`, `--owner-approved`, and optional `--expect-plan` binding.
- Emit concise JSON for `planned`, `needs_approval`, `complete`, `blocked`, and `incomplete` outcomes.
- Add explicit subject-resource declarations and kind/role semantics to case sources.
- Mark non-differentiating `ESK2-001` non-required without deleting it.
- Delete cache, scheduler, wave, resume, unenforced schemas, feature-owned tests, and old public lifecycle branches.
- Update `evaluate-skill` instructions/references and only directly contradictory `write-skill` guidance.
- Preserve saved prototype evidence untouched.

### Checks

- `evaluate --plan-only` makes zero provider requests.
- Model-driven work without approval returns `needs_approval` and zero requests.
- `expect-plan` mismatch stops before provider work.
- Host-free cases reject model options and use zero Pi processes.
- One invocation accepts one case only.
- Single and comparison cases expose only their kind-specific verdict.
- No old command or option works.
- Runtime creates no cache/wave/scheduler state.
- Public `diagnostic` appears only for a confirmed existing publication.

```bash
node --test .skill-eval/write-skill/tests/*.test.mjs
node --test .skill-eval/evaluate-skill/tests/*.test.mjs
node skills/evaluate-skill/scripts/skill-eval.mjs --help
node skills/evaluate-skill/scripts/skill-eval.mjs doctor
```

### Stop Conditions

- The CLI needs a new lifecycle command or caller-managed state.
- Cutover changes the accepted public contract.
- Internal engine work is still required to make failure outcomes truthful.
- Old and new public lifecycles must coexist after this commit.

### Checkpoint

Commit only when the public cutover is deletion-heavy and internally boring.

Tentative commit:

```text
refactor(evals): adopt one-case evaluation
```

## Slice 6: Retained Isolation Hardening

### Purpose

Prove retained security and evidence seams independently of model behavior.

### Work

- Reuse and simplify explicit Pi root guard.
- Apply canonical containment to every coordinator evidence read.
- Reject nested symlink escapes.
- Materialize only declared subject resources.
- Preserve source subject and fixture immutability.
- Harden provider-request observation and malformed-output retention.
- Stream-compact cumulative Pi JSON update snapshots before applying the retained-evidence output limit, with a separate internal raw-transport safeguard.
- Verify integrity and tamper detection around the already-transactional publisher.

### Checks

Run focused deterministic tests for subject/coordinator path policy, traversal and nested symlinks, allowed fixture behavior, denied subject writes, source immutability, event/usage parsing, hard limits, tamper detection, and diagnostic/result separation.

No paid provider request occurs.

### Stop Conditions

- Fix needs a new sandbox, dependency, host hook, or public recovery concept.
- Result integrity requires caller-managed protocol.
- Diagnostic data is treated as acceptance evidence.

### Checkpoint

Focused parent security/evidence audit, then commit.

Tentative commit:

```text
fix(evals): harden evaluation evidence
```

## Slice 7: Deterministic Contract Verification

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
- Confirm the handoff contains only accepted architecture, review, and backward-route memory.

### Checks

```bash
node --test .skill-eval/write-skill/tests/*.test.mjs
node --test .skill-eval/evaluate-skill/tests/*.test.mjs
node skills/write-skill/scripts/skill-author.mjs validate skills/write-skill
node skills/write-skill/scripts/skill-author.mjs validate skills/evaluate-skill
node skills/evaluate-skill/scripts/skill-eval.mjs doctor
git diff --check -- skills/write-skill skills/evaluate-skill .skill-eval docs/specs/skills docs/plans/skills
git diff --exit-code 3cc7d04 -- .freeflow/config.json
git diff --check -- docs/handoffs/workflow-and-skills/2026-07-11-implementation-scope-drift-and-replanning.md
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

## Slice 8: Bounded Dogfooding Evidence

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

## Slice 9: Acceptance Audit And Stop

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
- second unexpected defect appears at the same retained seam;
- a third review pass retains a source-backed blocker;
- case criteria change;
- architecture changes after paid evidence;
- required reruns increase;
- remaining work grows after completed checkpoint;
- reviewer finding requires user-owned scope, security, compatibility, or hard-to-reverse architecture decision;
- remaining finish path cannot be stated as preflight, execute, publish.

Do not patch through trigger. Preserve evidence, name the failed assumption, and route to the owning plan or design boundary. A third-pass blocker is terminal for that review scope: do not edit from the batch and do not request a fourth review.

## Implementation Re-entry Handling

The current uncommitted cutover is diagnostic evidence, not the new implementation baseline.

Before resumed code work:

1. save the exact diff, status, deterministic results, and three review outputs outside generated acceptance storage;
2. confirm no paid subject or semantic process remains active;
3. choose one owner-approved re-entry route.

Recommended route:

- preserve a patch of the current work;
- restore evaluator and case-source paths to committed `719b268` state;
- rebuild through Slices 1–5 with small internal commits;
- use the preserved patch only as evidence and selective source material, never as authority to reapply the monolith.

Alternative route:

- salvage the current working tree in place;
- first extract and commit contracts, process outcomes, and publication transaction separately;
- do not commit the existing coordinator or CLI cutover until those boundaries are proven.

Resetting or discarding the working tree is destructive even when a patch exists. Do not choose either route silently.

## Expected Commit Checkpoints

Committed prerequisites:

1. `2d4cb62 docs(skills): adopt outcome-level eval design`
2. `719b268 refactor(review): calibrate reviewer contracts`

Risk-first implementation:

3. `refactor(evals): add evaluation outcome ledger`
4. `refactor(evals): return settled process outcomes`
5. `fix(evals): make publication transactional`
6. `refactor(evals): compose one-case evaluation`
7. `refactor(evals): adopt one-case evaluation`
8. `fix(evals): harden evaluation evidence`
9. `test(evals): verify outcome-level contract`
10. `docs(evals): record constrained bootstrap acceptance`

Commit messages are tentative. Each commit must remain coherent and independently reviewable. Generated run noise remains uncommitted.

## Re-entry Report Before Code

Before resumed implementation, report:

- terminal review finding and parent adjudication;
- root diagnosis: plan slicing and shallow coordinator;
- preserved working-tree evidence location and hash;
- selected reset-or-salvage route;
- deep internal contracts and fault matrix;
- deterministic checks that gate each slice;
- confirmation that no fourth review or paid subject/semantic run will occur.

No code edit resumes before the owner selects the re-entry route.
