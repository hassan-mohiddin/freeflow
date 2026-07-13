# Freeflow Post-Overhaul Evaluation Plan

> **Doc ID:** PLAN-SKILLS-2026-07-12-POST-OVERHAUL-EVAL
> **Date:** 2026-07-12
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Paused during Phase 5 for evaluator v3 optimization
> **Current route:** Resume paid skill qualification only after `docs/plans/skills/2026-07-13-freeflow-evaluator-v3-plan.md` reaches accepted Pi v3 evidence
> **Source:** `docs/specs/skills/2026-07-12-freeflow-composition-evaluation-extension.md`; `docs/specs/skills/skill-authoring-and-evaluation-v2.md`; current 26-skill inventory and evidence registry; Output Router and Delegation review-loop incident handoffs; owner-approved evaluation campaign

## Goal

Add the minimum trustworthy evaluator support for declared Freeflow compositions and fixed scripts longer than two turns, qualify that support, then use incident-derived pressure cases to diagnose and improve the current post-overhaul skill system.

The plan separates evaluator infrastructure evidence, skill behavior evidence, and skill readiness. Passing one does not imply another.

## Scope

In scope:

- additive Pi composition execution with shared base stack, one target difference, optional canonical kernel/Workflow runtime, and exact identities;
- one-shot and two-to-four fixed scripted turns;
- deterministic and paid qualification of the changed evaluator;
- sanitized fixtures extracted from the two incident worktrees;
- a four-case incident pilot;
- a rolling qualification campaign for the 24 currently Unverified skills;
- one measured skill revision at a time.

Out of scope:

- adaptive/model-generated follow-ups;
- more than four accepted scripted turns;
- uncapped execution;
- cache, retry, resume, partial reuse, batching, concurrency, or suite execution inside the evaluator;
- Codex/Claude or cross-host readiness;
- direct execution against either live incident worktree;
- package publication, release, deployment, or production rollout.

## Source State

Freeze before implementation:

- intended Freeflow source commit and tree;
- evaluator source identity;
- active local package commit only as environment evidence, not fixture authority;
- Pi, provider, model, and thinking configuration;
- 26-skill inventory and `evals/registries/skill-evidence.json` status;
- both incident repository HEADs, dirty-state summaries, and selected-file hashes without modifying those repositories.

Current registry boundary:

- Production-Ready: `write-skill`, `evaluate-skill` under their recorded configuration;
- explicitly Unverified: 23 skills;
- `bypass`: missing a current status field and treated as Unverified for this campaign until normalized;
- no current grouped evals: `decision-gate`, `migration-work`, `finish-branch`, `release-work`, `launch-work`, `simplify-code`, `tdd`.

Historical reports remain documentary only.

## Phase 1 — Contract And No-Provider Architecture

### Slice 1.1 — Review And Accept The Composition Contract

**Type:** delivery

Review `docs/specs/skills/2026-07-12-freeflow-composition-evaluation-extension.md` against the accepted v2 evaluator spec, implementation, host behavior, and incident requirements.

Acceptance:

- composition is opt-in and backward compatible;
- shared base plus one target preserves attribution;
- runtime delivery is exact and non-ambient;
- identity, activation, limits, failure, and readiness contracts are explicit;
- fixed two-to-four turns cover the incident horizon;
- no rejected lifecycle machinery re-enters scope.

Stop before implementation on any accepted blocker or unresolved owner question.

### Slice 1.2 — Amend Owning Source Truth

**Type:** delivery

After the extension spec passes review:

- mark it Approved;
- amend `docs/specs/skills/skill-authoring-and-evaluation-v2.md` to link the extension and remove composition from the undifferentiated deferred list;
- preserve all existing one-skill and fixed-RPC contracts;
- record that adaptive prompts, more than four accepted turns, and other deferred milestones remain deferred;
- normalize `bypass` to explicit `status: "unverified"` in the evidence registry.

Verification: artifact links, registry shape, internal consistency, and diff check.

### Slice 1.3 — Transition The Changed Evaluator Candidate To Unverified

**Type:** delivery

Before the first behavior-changing evaluator source edit:

- change current `evaluate-skill` registry status from Production-Ready to Unverified;
- preserve the prior accepted report as exact historical evidence for the earlier evaluator source, not current readiness;
- add a transition note to the readiness report or a successor report naming the last accepted source and the composition-extension candidate;
- keep `write-skill` readiness unchanged because its promoted skill source and accepted evidence remain unchanged;
- verify status/report/registry consistency before implementation.

The transition may occur conservatively before the first source edit. It must not occur after changed evaluator code already exists under a current Production-Ready claim.

### Slice 1.4 — Add Composition Case Validation

**Type:** delivery using TDD

Outcome: valid composition cases parse; unsafe or multi-dimensional cases fail before provider work.

RED/GREEN behaviors:

1. optional composition does not change existing cases;
2. shared ordered base and one target comparison parse;
3. duplicate names, collisions, mixed old/new shape, unsafe paths/resources, runtime overrides, and non-Pi composition fail;
4. one-shot and two-to-four fixed scripts parse;
5. composition scripts above four turns fail closed;
6. fixed-script turn limits below declared user-turn count fail preflight.

Likely seam: `skills/evaluate-skill/scripts/lib/workspace.mjs` and case tests.

Backward checkpoint: if validation requires complete-stack duplication in each variant, return to design rather than exposing a shallow contract.

### Slice 1.5 — Resolve And Fingerprint Complete Composition

**Type:** delivery using TDD

Outcome: the approved plan identity changes for every active composition byte and remains stable for inactive files.

Behaviors:

- resolve shared base, runtime, and target sources;
- record per-resource and aggregate hashes;
- bind order, source kind/path/revision, runtime adapter/kernel/Workflow, turns, host/model/tools/limits, fixture, evaluator, and grader;
- preserve legacy singular identities for old cases;
- reject drift before provider work.

Likely seams: `hash.mjs`, `plan.mjs`, plan tests.

Backward checkpoint: a second identity bug at this seam triggers design review before more hashing fields are added.

### Slice 1.6 — Materialize Immutable Multi-Skill Inputs

**Type:** delivery using TDD

Outcome: each variant receives a fresh read-only declared stack with no collisions or ambient paths.

Behaviors:

- materialize each base and target skill under a unique named directory;
- materialize runtime resources separately;
- support working-tree and git sources;
- reject traversal, symlink, duplicate, and collision cases;
- verify source/materialized hashes before execution and after every turn;
- keep existing one-skill materialization unchanged.

Likely seams: `materialize.mjs`, `evaluate.mjs`, path/materialization tests.

### Slice 1.7 — Deliver Exact Pi Composition And Runtime

**Type:** delivery using TDD

Outcome: Pi receives only the declared skills plus the exact kernel and one active Workflow bootstrap marker.

Behaviors:

- adapter accepts ordered skill snapshots and emits repeated explicit `--skill` arguments;
- ambient extensions, skills, context files, templates, and themes remain disabled;
- explicit evaluator runtime extension reproduces the deterministic production runtime context, exact system-prompt append, exact `freeflow-workflow-bootstrap` custom-message envelope, and active-context duplicate suppression;
- subject runs keep compaction disabled and require initial Workflow delivery followed by active-marker suppression;
- separate compaction-aware tests prove the same envelope is re-delivered when active context loses the marker even if persisted entries retain it;
- runtime implementation, envelope, kernel, Workflow, and skill delivery identities are recorded;
- legacy singular invocation remains byte-for-byte equivalent where practical;
- undeclared delivery or runtime duplication fails closed.

Likely seams: `pi-adapter.mjs`, `evaluate.mjs`, `capabilities.mjs`, one new explicit runtime-extension module, adapter/evaluate tests.

Backward checkpoint: if production config discovery becomes necessary, revise the spec; do not import the installed plugin as a shortcut.

### Slice 1.8 — Add Per-Skill And Multi-Turn Evidence

**Type:** delivery using TDD

Outcome: composition evidence distinguishes declaration, materialization, delivery, observed read/activation, and followed behavior.

Behaviors:

- per-skill, per-turn activation/read records;
- named component activation and non-activation assertions;
- ordered transcript and workspace evidence through four turns;
- one shared semantic turn scope per variant;
- mutation, missing evidence, timeout, output, transport, or turn exhaustion publishes diagnostics only;
- no later variant starts after infrastructure failure.

Likely seams: `grade.mjs`, `semantic.mjs`, `evaluate.mjs`, Pi RPC and grading tests.

### Slice 1.9 — Deterministic Qualification And Implementation Review

**Type:** verification/review

After implementation behavior and schema settle while `evaluate-skill` remains Unverified, update `skills/evaluate-skill/SKILL.md`, `references/evaluation-architecture.md`, and `references/portable-execution.md` to the exact implemented capability and unsupported boundary.

Run with zero provider work:

- complete evaluator tests;
- complete author tests;
- structural validation for `write-skill` and `evaluate-skill`;
- Pi doctor;
- syntax, JSON, link, whitespace, and diff checks;
- fake one-shot, two-turn, three-turn, and four-turn composition cases;
- fault injection for identity drift, mutation, duplicate runtime delivery, missing activation evidence, limit exhaustion, and atomic publication;
- source-consistency checks confirming `evaluate-skill` active instructions and architecture references match the implemented capability and unsupported boundary.

Use independent implementation review. Any accepted trust, identity, activation, isolation, or publication blocker routes backward before paid previews.

### Phase 1 Checkpoint

Continue only when:

- the extension spec is Approved and owning v2 source truth is aligned;
- all deterministic checks pass;
- implementation review passes;
- the changed `evaluate-skill` source is explicitly Unverified pending behavioral qualification;
- no provider request has occurred.

Commit the reviewed no-provider checkpoint before qualification.

## Phase 2 — Configuration-Bound Evaluator Qualification

### Slice 2.1 — Add Qualification Cases

**Type:** delivery

Add:

1. one synthetic one-shot composition case;
2. one synthetic four-turn composition case with kernel, Workflow, two base skills, and one target difference;
3. exact-source regression suite membership for all previously accepted `write-skill` and `evaluate-skill` promotion cases.

The four-turn case should expose a second same-invariant pressure at a sibling seam and grade whether the candidate routes backward without broad rewriting or owner-policy invention.

Case review must confirm natural prompts, hidden later turns, fixed criteria, objective evidence where possible, one semantic scope, and no answer leakage.

### Slice 2.2 — Preview Exact Paid Plans

**Type:** learning

Run `evaluate --plan-only` for every qualification invocation. Record:

- fingerprint;
- exact subject and grader identities;
- process count;
- scripted user turns;
- maximum approved provider turns;
- timeout and output limits;
- case soft ceiling and expected cost range;
- absence of an independently enforceable aggregate hard spend cap.

No preview authorizes execution.

### Slice 2.3 — Owner Paid-Run Gate

Present exact fingerprints and limits. Require explicit approval before `--owner-approved` execution. A changed source, fixture, case, model, host, limit, or evaluator identity invalidates approval.

### Slice 2.4 — Run Qualification Serially

**Type:** evidence

For each approved case:

- execute one complete case;
- integrity-check its accepted bundle immediately;
- classify infrastructure, case, grader, or behavioral failures;
- stop the wave on infrastructure failure or trustworthy evaluator behavior failure;
- never reuse a settled reference or partial evidence.

After composition cases pass, rerun the complete accepted `write-skill` and `evaluate-skill` promotion suites on the changed evaluator source.

### Slice 2.5 — Evidence Review And Readiness Decision

Review exact-source bundles and update:

- `.skill-eval/evaluate-skill/reports/production-readiness.md` or a successor report;
- `evals/registries/skill-evidence.json`;
- owning spec implementation/readiness status.

The accepted claim must name the exact Pi/model/thinking boundary and one-shot/two-to-four-turn composition support. Other hosts, adaptive prompts, more than four turns, and recovery remain Unverified.

### Phase 2 Checkpoint

Do not begin incident provider runs until composition delivery, four-turn evidence, exact-source evaluator regressions, integrity, and independent evidence review pass.

Phase 2 passed on 2026-07-12:

- `WFC2-001` and `WFC2-002` improved with every candidate assertion passing;
- the complete accepted `write-skill` and `evaluate-skill` regression suites passed on exact current source;
- all 16 bundles passed fresh integrity verification;
- provider-backed qualification used 137 requests, 428,580 tokens, and `$1.917456`;
- independent evidence review passed without findings;
- configuration-bound evaluator acceptance is recorded in `.skill-eval/evaluate-skill/reports/composition-extension-readiness.md`.

## Phase 3 — Incident Fixture Extraction

### Slice 3.1 — Freeze Forensic Source Manifests

**Type:** learning

For each incident repository, record without mutation:

- repository path and HEAD;
- tracked dirty-state summary;
- selected tracked blob/diff hashes;
- selected untracked file hashes when unavoidable;
- source review/handoff provenance outside the subject fixture;
- excluded paths and sanitization rules.

Current source locations:

- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow-output-router-implementation`
- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow`

Stop if the pre-failure state cannot be reconstructed exactly enough to support the intended claim.

### Slice 3.2 — Build Small Attribution Fixtures

**Type:** delivery

Create isolated synthetic fixtures for:

1. an oversized plan that defers proof of the registered host boundary;
2. rejected replacement preserving empty and existing canonical state;
3. helper/caller counter failing to prove registered integration;
4. cancellation combined with integrity failure;
5. shared verification mutation footprint;
6. replaceable trust anchor;
7. repeated same-invariant finding across sibling adapters.

Keep expected outcomes, incident handoffs, review artifacts, and grading keys outside subject-visible fixtures.

Verification: deterministic exploit/oracle reproduces each pressure before any skill candidate exists.

### Slice 3.3 — Build Realistic Replay Fixtures

**Type:** delivery

Only after small fixtures are stable, extract minimal allowlisted code preserving the original engineering pressure. Remove absolute paths, secrets, unrelated dirty work, `.git`, caches, generated noise, and hindsight artifacts.

Use independent fidelity/sanitization review.

Live-source refinement: both incident worktrees now contain post-fix oracle behavior, while no byte-exact pre-fix snapshot has been attested. Do not fabricate a historical replay from those bytes. Run the small attribution pilot first. Build a sanitized realistic replay only after pilot evidence identifies a skill revision that needs generalization, using the fixed worktrees as expected-outcome oracles and labelling any reconstructed failing source as synthetic rather than historical.

### Phase 3 Checkpoint

The synthetic pilot may continue when each small fixture is immutable, hashed, mechanically pressure-tested, sanitized, attribution-friendly, and independently reviewed. A fixture that reveals the answer or depends on live worktree state routes backward. Realistic replay remains required before any incident-generalization or skill-promotion claim, not before the attribution pilot.

Phase 3 synthetic checkpoint passed on 2026-07-12:

- both evolved incident worktrees are frozen as post-fix oracle sources with exact selected hashes; byte-exact pre-fix reconstruction remains unattested;
- seven small pressure fixtures and four pilot case sources are frozen in `.skill-eval/workflow/provenance/incidents.json`;
- `.skill-eval/workflow/scripts/verify-incident-fixtures.mjs` mechanically reproduces every pressure and verifies frozen bytes, no symlinks, and sanitization exclusions;
- independent fixture/provenance review and pilot case-source review passed;
- realistic replay is deferred under Slice 3.3 and remains required before generalization or promotion.

## Phase 4 — Four-Case Incident Pilot

### Pilot Cases

1. **Planning/failure-unit case:** oversized slice or deferred prerequisite; likely owners `write-plan`, `review-artifact`, `design-for-depth`.
2. **Rejected-state case:** visible rejection plus forbidden mutation and prior-state preservation; likely owner `tdd`.
3. **Proof-fidelity case:** helper call/manual counter versus real registered boundary; likely owner `verify-work`.
4. **Two-to-four-turn route case:** second same-invariant sibling defect; likely composition owners `workflow`, `execute-plan`, `design-for-depth`, `review-work`.

Skill ownership is a hypothesis, not subject-visible input.

### Diagnostic Comparisons

Use separate paired cases to distinguish:

- no/neutral skill versus current target;
- native current composition versus explicit target wording when activation needs isolation;
- current target versus one candidate revision after a preserved failure.

Interpretation:

- native fails, explicit passes → activation/routing;
- both fail → wording, placement, structure, or wrong owner;
- target alone passes, composition fails → precedence/context interaction;
- artifact passes but claim fails → verification/reporting;
- both variants pass → weak pressure or already sufficient behavior;
- both fail identically → case, host, grader, or missing behavior diagnosis.

### Pilot Gate

Before provider work:

- review all four case sources and criteria;
- generate exact previews and limits;
- obtain fingerprint-specific approval.

Run one case at a time, preserve every result, and stop on trustworthy evidence that changes the route.

### Phase 4 Checkpoint

Produce one pilot report separating:

- activation failures;
- active wording failures;
- placement/stop failures;
- composition failures;
- fixture/grader/host failures;
- overactivation or excess ceremony.

Do not edit several skills from one observation.

Phase 4 passed on 2026-07-12. Accepted evidence is recorded in `.skill-eval/workflow/reports/incident-pilot.md`:

- current `design-for-depth` activated and passed the planning pressure where the old target did not activate;
- current `tdd` improved rejected-state test design and canonical/diagnostic preservation;
- old and current `verify-work` both rejected fake host-boundary proof;
- current `design-for-depth` improved repeated-invariant routing to the shared canonical-publication failure contract;
- every final candidate assertion passed and every final bundle passed fresh integrity verification;
- case, grader, activation, and limit diagnostics remain preserved separately;
- independent evidence review passed after narrowing two claims to the recorded evidence boundary.

No immediate skill edit is justified. Continue to Phase 5 coverage design without promoting any pilot skill.

## Phase 5 — Post-Overhaul Skill Qualification

Directional until pilot evidence settles the campaign shape.

### Coverage Matrix

For each of 26 skills record:

- exact source hash;
- job and ownership boundary;
- positive trigger;
- near-miss non-trigger;
- adversarial pressure;
- observable artifact/route;
- stop or backward edge;
- composition neighbours;
- required evidence class;
- current result and supported configuration.

Existing accepted `write-skill` and `evaluate-skill` evidence remains bounded to exact source/configuration. The other 24 begin Unverified.

Coverage design checkpoint passed on 2026-07-12. `.skill-eval/coverage-matrix.json` records all 26 exact skill hashes, ownership, positive and near-miss boundaries, pressure, observable route, stop edge, neighbours, evidence class, current result, supported configuration, and intended evaluation configuration. Independent review passed after correcting configuration, delegation, diagnosis, Output Router, and verification case boundaries.

### Priority Families

1. Workflow routing and incident owners: `workflow`, `decision-gate`, `write-plan`, `review-artifact`, `execute-plan`, `design-for-depth`, `tdd`, `verify-work`, `review-work`, `diagnose-failure`.
2. Discovery and durable artifacts: `discover`, `write-spec`, `handoff`.
3. Conditional lifecycle: `commit-work`, `finish-branch`, `migration-work`, `release-work`, `launch-work`.
4. Modes and local methods: `mode-contract`, `bypass`, `simplify-code`.
5. Capability skills: `setup-freeflow`, `output-router`, `delegation-harness`.

Phase 5 routing Wave 1A passed its bounded evidence checkpoint on 2026-07-12. `.skill-eval/reports/phase5-routing-wave-1a.md` records final evidence for `workflow`, `decision-gate`, `write-plan`, `review-artifact`, and `execute-plan`. All final candidates passed. One measured `review-artifact` failure produced revision `64fe205` and an improved exact-source rerun. No skill is promoted; neutral-control ties and remaining current-stack/composition evidence are explicit.

Every skill needs activation and near-miss evidence plus at least one pressure case appropriate to its job. Core routing skills additionally need composition evidence. One composition pass cannot promote every included skill.

### Revision Loop

For a trustworthy failure:

1. preserve the entire failed bundle;
2. classify activation, wording, placement, missing stop, structure/resource, composition, fixture, host, or grader;
3. use `write-skill` for one measured change;
4. keep criteria and unaffected source stable;
5. preview fresh fingerprints;
6. obtain paid approval;
7. rerun the whole case and its non-trigger control;
8. run only affected composition regressions;
9. record exact-source evidence and remaining gaps.

## Dynamic Plan-Health Triggers

Route backward when:

- a second defect appears at identity, runtime delivery, activation, or publication seam;
- adding composition requires another public evaluator lifecycle command;
- shared/base attribution cannot be expressed without duplicating complete stacks;
- fixture extraction cannot exclude hindsight or unrelated dirty state;
- cases require adaptive prompts or more than four turns to make the intended claim;
- a candidate needs changes to multiple skills before one failure is attributable;
- baseline and candidate both pass because pressure is too weak;
- model spend, turn limits, or case count grows beyond the approved horizon;
- evaluator or skill source changes after preview;
- remaining work grows and the next bounded finish path is unclear.

Preserve valid evidence and revise only the affected contract, plan phase, case, or skill.

## Verification And Review Checkpoints

- Every implementation slice: focused RED/GREEN evidence, broader evaluator tests, and route check.
- End of Phase 1: independent implementation review and clean no-provider commit.
- Before every paid wave: exact preview and owner approval.
- End of Phase 2: integrity and independent evidence review.
- End of Phase 3: fixture fidelity and sanitization review.
- End of Phase 4: case/evidence adjudication before skill edits.
- Each skill revision: fixed case rerun, near-miss control, affected composition regression, and exact-source evidence review.

## Residual Risks

- Pi may not expose native per-skill activation events; delivery and observed reads may remain separate evidence classes.
- Fixed scripts cannot prove adaptive conversation behavior.
- Model behavior remains probabilistic even with objective artifacts.
- Soft spend ceilings are observed, not aggregate hard caps.
- Sanitized fixtures may remove pressure or retain hindsight; both require review.
- Extending evaluator source invalidates its current exact-source readiness until requalification.
- Cross-host portability remains Unverified.

## Immediate Executable Horizon

1. Complete artifact review and mark the composition contract Approved only if fit.
2. Amend the owning v2 spec and explicit `bypass` status.
3. Transition the changed evaluator candidate to Unverified before behavior-changing source edits.
4. Implement Slice 1.4 with RED composition-schema tests.
5. Continue one verified evaluator behavior slice at a time through Phase 1, then align active evaluator guidance before deterministic qualification.
6. Stop before provider-backed qualification and present exact previews, limits, and expected cost for approval.
