> **Doc ID:** PLAN-2026-07-10-skill-authoring-evaluation-v2-bootstrap
> **Date:** 2026-07-10
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Approved for bootstrap implementation after adjudicated artifact review
> **Source:** `docs/specs/skills/skill-authoring-and-evaluation-v2.md`
> **Execution boundary:** Stop at bootstrap acceptance; broader portability work remains deferred
> **Review:** Four-lens fresh-context review completed 2026-07-10; accepted findings incorporated once

# Skill Authoring And Evaluation V2 Bootstrap Plan

## Goal

Implement enough of the v2 `write-skill` and `evaluate-skill` system to author and evaluate later skill rewrites without depending on the current Freeflow skills, the legacy `evals/` harness, external skill packs, or parent-agent delegation.

The bootstrap result must support one trustworthy Pi-first authoring/evaluation loop. It must not claim the full cross-host architecture is complete.

## Source Authority

Implementation follows, in order:

1. explicit owner decisions;
2. `docs/specs/skills/skill-authoring-and-evaluation-v2.md` after joint artifact review;
3. live repo and host CLI evidence;
4. saved bootstrap test/eval artifacts.

These are prior art, not execution authority:

- current `write-skill` and `evaluate-skill` instructions;
- current Freeflow `evals/` harness;
- Agent Skills, Matt Pocock, Obra/Superpowers, and Anthropic `skill-creator`;
- reviewer preferences;
- agent self-assessment.

## Scope

Implement through bootstrap acceptance:

- clean `.skill-eval/<skill-name>/` workspace;
- authored cases, fixtures, deterministic tests, ignored runs/cache, and selected reports;
- Node 22+ `.mjs` tooling with no npm dependency or build step;
- skill author `init`, `validate`, and `inspect` commands;
- eval `doctor`, `init`, `plan`, `run`, `grade`, and `report` commands at bootstrap depth;
- Pi one-shot JSON adapter;
- no-skill, old-skill, and candidate variants;
- immutable skill snapshots and isolated fixture runs;
- normalized final response, events, diff, status, usage, and objective-grade evidence;
- deterministic grading plus optional fresh semantic grading;
- bounded direct-process concurrency;
- fingerprinted control reuse;
- rewritten self-contained `write-skill` and `evaluate-skill` instructions/references;
- first self-evals and bootstrap acceptance report.

## Deferred After Bootstrap Acceptance

Do not implement in this plan:

- Pi RPC multi-turn execution;
- Codex adapter;
- Claude adapter;
- broad acceptance matrices;
- cmux/delegation execution backend;
- legacy Freeflow eval migration;
- single-binary packaging;
- public docs/release changes;
- rewrites of other Freeflow skills.

These remain in the source spec for later cross-skill synthesis and planning.

## Approved Write Set

Expected writes stay inside:

```text
skills/write-skill/**
skills/evaluate-skill/**
.skill-eval/config.json
.skill-eval/.gitignore
.skill-eval/write-skill/**
.skill-eval/evaluate-skill/**
docs/specs/skills/skill-authoring-and-evaluation-v2.md
docs/plans/skills/2026-07-10-skill-authoring-and-evaluation-v2-bootstrap-plan.md
```

Do not modify:

- `.freeflow/config.json`;
- root `package.json` or lockfile;
- current `evals/`;
- router, delegation, installed hooks, project `.pi/` state, or control-plane extension code;
- other skills;
- public plugin docs or release metadata.

If implementation requires a new dependency, root build change, host hook, extension change, or write outside the approved set, stop and revise the spec/plan with owner approval.

## Bootstrap Review Protocol

Do not use current review skills as instructions.

Before implementation, dispatch fresh read-only reviewers with explicit rubrics:

1. **Behavior reviewer** — two-skill responsibilities, agent-first instruction design, draft/production boundary, and user authority.
2. **Architecture reviewer** — module boundaries, isolation, workspace ownership, and bootstrap/full-scope separation.
3. **Eval reviewer** — controls, evidence classes, grading, caching, token efficiency, and self-evaluation validity.
4. **Plan reviewer** — ordering, testability, write set, stop conditions, and hidden decisions.

Reviewer rules:

- inspect the spec, plan, current two skills, and relevant live package facts;
- do not edit files;
- do not load or apply workflow/review skills;
- classify findings as Blocking, Non-blocking, Question, or Evidence gap;
- cite exact sections and evidence;
- do not invent requirements;
- review can pass.

The parent adjudicates all findings. One bounded artifact revision follows accepted findings. No autonomous review-fix-review loop.

During implementation, each slice closes with deterministic checks and a source-contract diff inspection. Use a fresh semantic reviewer only when artifacts cannot prove the slice's behavioral or architectural claim.

At final acceptance, one fresh read-only reviewer audits the frozen required cases, raw manual/runner evidence, grading code/results, and readiness claim. The parent adjudicates that audit. This is an evidence gate, not an autonomous fix/review loop.

### Artifact Review Adjudication

Accepted review findings are incorporated in this revision:

- split bootstrap acceptance from full Pi RPC/Codex/Claude target acceptance;
- add `.skill-eval/config.json` and `.skill-eval/.gitignore` to the write set;
- define enforceable Pi tool-root isolation and move its proof before model execution;
- define evidence classes and forbid class substitution;
- require all safety-critical cases, including native trigger and near-miss evidence;
- implement bounded adaptive repeats rather than metadata alone;
- test the complete fingerprint, scheduler bound, call/budget caps, symlinks, snapshot immutability, and standalone CLI commands;
- define manual/runner agreement without byte-equality assumptions;
- preserve and recheck the pre-existing `.freeflow/config.json` diff;
- add a final independent raw-evidence audit.

The provider may not expose a stable backend model revision. That evidence gap remains explicit and is mitigated by recording the limitation plus a cache-age policy. Reviewer requests for root `plan.md` and `progress.md` were not applicable; the reviewed artifacts are the explicit spec and dated plan paths. Provider, model, thinking level, and paid-run caps remain an owner gate before subject model calls.

## Bootstrap Eval Policy

Before the v2 runner is trustworthy:

- run subject cases with direct Pi headless commands;
- disable sessions, context files, unrelated skills, extensions, prompts, and themes;
- load only explicit candidate skill snapshots;
- use minimal tools;
- save raw JSONL, final response, usage, exit status, and diffs manually;
- grade objective evidence with small deterministic scripts or direct checks;
- use a separate fresh Pi invocation for semantic grading when needed.

After the v2 runner can reproduce the same case:

- compare its resolved invocation contract and evidence surfaces against the manual bootstrap artifacts;
- require the same fixed-rubric behavioral verdict while allowing stochastic output text and diffs to vary within that rubric;
- record legitimate run variance rather than requiring byte equality;
- treat unexplained command, evidence-surface, or verdict disagreement as runner failure;
- do not let the runner validate itself solely from its own report.

## Slice 0: Artifact Gate And Control Freeze

### Purpose

Make implementation source-consistent and preserve exact v1 controls before changing skill behavior.

### Work

- Complete joint fresh-context review of spec and plan.
- Adjudicate findings with owner decisions where required.
- Revise both artifacts once from accepted findings.
- Record current `write-skill` and `evaluate-skill` blob hashes/commit source as v1 controls in bootstrap case metadata.
- Record the pre-existing `.freeflow/config.json` diff hash; compare it unchanged at final verification.
- Confirm branch/worktree, untracked files, and approved write set.
- Confirm Node and Pi versions used for bootstrap evidence.
- Prove Pi can load one explicit adapter-owned tool guard while auto-discovered extensions are disabled.
- Prove the guard allows fixture/snapshot reads, allows fixture writes, and blocks eval-root reads, snapshot writes, traversal, and symlink escapes.
- Before any paid model call, obtain explicit owner selection of provider, model, thinking level, maximum model calls, and optional spend cap.

### Checks

```bash
git status --short --branch
git ls-files --others --exclude-standard
git diff --check -- docs/specs/skills docs/plans/skills
node --version
pi --version
# Run a no-model Pi guard probe with allowed and denied path fixtures.
```

### Stop Conditions

- Spec and plan contradict each other.
- A blocking reviewer finding remains unresolved.
- Current skills cannot be recovered exactly from git for old-skill controls.
- The approved write set would be exceeded.
- Pi cannot enforce the declared roots through the explicit guard.
- A model call would start before provider/model/thinking/caps are owner-approved.

## Slice 1: Clean Eval Source Layout And Bootstrap Cases

### Purpose

Create the new source-of-truth eval layout without using or migrating the legacy harness.

### Work

Create only needed source directories:

```text
.skill-eval/
├── config.json
├── .gitignore
├── write-skill/
│   ├── suite.json
│   ├── cases/
│   ├── fixtures/
│   └── tests/
└── evaluate-skill/
    ├── suite.json
    ├── cases/
    ├── fixtures/
    └── tests/
```

Add pressure cases that preserve observed failures and design risks.

Initial `write-skill` cases should cover:

- production-ready pressure does not create unnecessary resources;
- agent-first wording and high-priority placement beat human-manual prose;
- description boundaries avoid both under-triggering and hijacking;
- draft requests remain drafts without forced evaluation;
- external authoring skills are not required.

Initial `evaluate-skill` cases should cover:

- an adequate existing eval is reused unchanged;
- a missing or inadequate eval is created before a production behavior rewrite;
- explicit draft-only work does not trigger fake production claims;
- artifact evidence beats contradictory final prose;
- subject runs cannot read eval definitions or expected outcomes;
- direct Pi execution is selected instead of subagent orchestration;
- reduced-fidelity fallbacks are labeled rather than overclaimed.

Write criteria before candidate outputs exist. Keep expected answers outside natural subject prompts.

Mark the smallest safety-critical set `required_for_bootstrap`. Every such case must run before readiness is claimed. It must include, for each skill, a positive native-activation case and a near-miss non-trigger case, plus the draft/status, eval-reuse, user-authority, external-dependency, and old-versus-candidate pressure behaviors that apply to that skill.

### Checks

- Every suite/case parses as JSON.
- Every referenced fixture exists.
- `.skill-eval/*/runs/` and `cache/` are ignored when later created.
- Cases do not reveal expected behavior in the natural prompt.
- No file under the legacy `evals/` tree changes.

### Stop Conditions

- A case only checks exact wording rather than behavior.
- Control and candidate would receive different prompts, tools, or fixtures.
- Fixture policy contradicts live repo behavior.
- Eval definitions become visible inside the planned subject cwd.

## Slice 2: Schemas, Safe Paths, And Read-Only Planning

### Purpose

Build deterministic foundations before any model execution.

### Work

Under `skills/evaluate-skill/` add:

- eval-case and run-evidence schemas;
- the public `skill-eval.mjs` entrypoint;
- case loading and focused runtime validation;
- `.skill-eval` root/skill discovery;
- safe path ownership checks using canonical real paths;
- skill and fixture hashing;
- enumerated evidence-class requirements;
- capability data shape;
- `doctor`, `init`, and `plan` commands;
- tests under `.skill-eval/evaluate-skill/tests/`.

`plan` must resolve without model calls:

- case and profile;
- variant sources;
- host/mode;
- model/thinking/tools;
- run directories;
- expected evidence;
- cache eligibility;
- expected model-call count;
- unsupported or reduced-fidelity requirements.

### Checks

```bash
node --test .skill-eval/evaluate-skill/tests/*.test.mjs
node skills/evaluate-skill/scripts/skill-eval.mjs doctor
node skills/evaluate-skill/scripts/skill-eval.mjs plan --skill evaluate-skill --case <case-id> --profile iterate
```

Tests must cover malformed JSON, path traversal, symlink escapes, missing fixtures, destructive roots, unknown variants, invalid evidence-class substitutions, unavailable capabilities, required-case selection, and dry planning without filesystem mutation outside owned paths.

### Stop Conditions

- Planning calls a model.
- `init` creates empty optional directories without need.
- Safe deletion cannot prove path ownership.
- Validation requires an npm dependency.

## Slice 3: Pi One-Shot Runner And Subject Isolation

### Purpose

Execute fair Pi control/candidate runs while preventing eval leakage.

### Work

Implement:

- direct child-process runner using argument arrays;
- Pi capability probe and print/JSON command construction;
- no-session and stripped-resource defaults;
- minimal tool allowlists with no unrestricted shell;
- one explicit Pi root-guard extension stored with the adapter, never installed or auto-discovered;
- no-skill, old-skill, and candidate variants;
- read-only skill snapshots whose hashes are verified before and after the run;
- isolated copied fixture cwd in a temporary run root outside the source workspace;
- timeout, abort, output cap, and cleanup;
- raw JSONL and exit-status capture;
- final assistant text and usage extraction;
- fixture diff and git-status capture;
- normalized metadata with redacted command details.

The subject receives only:

- natural user prompt;
- isolated fixture;
- selected skill snapshot when applicable;
- allowed tools.

The subject must not receive suite/case paths, assertions, reports, control output, or candidate labels.

### Checks

- Compare generated Pi command against a manually reviewed command.
- Prove the guard's allow/deny matrix without a model call, including traversal and symlink probes.
- Run one manual control and candidate outside the v2 runner.
- Run the same case through v2.
- Compare invocation/evidence surfaces and fixed-rubric verdicts; record stochastic variation.
- Use a deliberate model leakage probe to confirm eval definitions and another variant are denied.
- Verify the selected skill snapshot hash remains unchanged.

### Stop Conditions

- Subject can read eval criteria or another variant.
- Baseline loads Freeflow runtime context.
- Candidate prompt explicitly tells the model to obey the target skill during automatic-activation cases.
- Adapter silently substitutes injected wording for native activation.
- Pi event parsing loses the final response or usage.

## Slice 4: Objective Grading, Semantic Boundary, Reporting, And Cache

### Purpose

Turn raw runs into trustworthy, token-aware comparisons.

### Work

Implement:

- objective checks for diff emptiness, changed files, fixed output/diff text, JSON fields, exit status, and activation/tool evidence;
- artifact evidence priority;
- optional fresh semantic grader invocation with fixed pre-run criteria;
- blind variant labels when practical;
- semantic grade evidence and uncertainty;
- normalized JSON report and concise Markdown report;
- fingerprinted control cache;
- bounded configurable direct-process concurrency with queued overflow;
- required maximum model-call cap and optional spend cap;
- bounded adaptive-repeat scheduling when conflict/instability is detected;
- candidate-only rerun support when control fingerprint remains valid.

Semantic grading must remain optional. It cannot repair failed objective evidence.

### Checks

- Contradictory final prose loses to diff evidence.
- Cache hit requires identical behavior-relevant fingerprint.
- Suite/case/assertion, prompt, fixture, skill snapshot, host/version, provider/backend revision when available, model/thinking, tools/root policy, context/config-home/extensions/hooks, grading policy, or adapter change invalidates cache.
- A synthetic conflict schedules a bounded repeat; reaching the cap reports unresolved variance.
- Jobs above the configured concurrency bound queue instead of exceeding it.
- The model-call cap prevents an excess job; unavailable cost never becomes zero.
- Randomized opaque labels and sanitized paths keep meaningful variant identity out of the semantic grader input; residual content leakage is reported.
- Standalone `grade` and `report` commands reproduce saved results without rerunning subjects.
- Reports name unsupported and unverified claims.

### Stop Conditions

- Output-character count is labeled as model tokens.
- Missing host evidence is serialized as zero or success.
- Semantic grader sees expected candidate identity.
- Cache reuse cannot explain its fingerprint inputs.
- Parallel jobs share mutable config, fixtures, or temporary skill files.
- The scheduler exceeds its configured concurrency or call cap.
- Conflict/instability is observed but no bounded repeat or unresolved-variance result follows.

## Slice 5: Skill Author CLI And `write-skill` Rewrite

### Purpose

Make `write-skill` self-contained and behavior-backed.

### Work

Add:

- `skills/write-skill/scripts/skill-author.mjs`;
- minimal skill asset;
- `init`, `validate`, and `inspect` commands;
- references for agent-first instructions, activation boundaries, progressive disclosure/resources, and the two-skill development loop;
- rewritten compact `write-skill/SKILL.md` with no external skill authority.

`validate` proves structural facts. `inspect` reports advisory signals and never claims behavioral correctness.

Write tests before each deterministic command behavior. Use the v2 runner plus preserved manual cases before promoting instruction changes.

### Checks

```bash
node --test .skill-eval/write-skill/tests/*.test.mjs
node skills/write-skill/scripts/skill-author.mjs init <temp-skill-name> <temp-root>
node skills/write-skill/scripts/skill-author.mjs validate <temp-skill-path>
node skills/write-skill/scripts/skill-author.mjs inspect <temp-skill-path>
```

Behavioral checks:

- old skill versus candidate on every required measured pressure case;
- no unnecessary reference/script generation;
- draft status remains honest;
- one positive native activation reads the exact snapshot;
- one near-miss prompt does not read the target skill;
- description and high-priority rules shape expected behavior;
- no external skill is read or required.

### Stop Conditions

- Static inspection claims production readiness.
- `init` creates a full manual/template tree by default.
- Runtime resources are added without measured need.
- Candidate only passes prompts that state the intended answer.

## Slice 6: `evaluate-skill` Rewrite And Self-Hosting Boundary

### Purpose

Teach the architecture the runner now proves, without circular self-certification.

### Work

Add final evaluate-skill references for:

- evaluation architecture;
- eval design and variants;
- portable capability execution;
- token-efficient direct runs;
- grading and revision.

Rewrite `evaluate-skill/SKILL.md` to:

- remove external skill authority;
- distinguish draft, iterate, and acceptance needs;
- reuse adequate evals unchanged;
- preserve user authority;
- choose the cheapest accurate evidence;
- require explicit evidence labels;
- route deterministic execution through the bundled CLI;
- keep semantic grading bounded;
- classify measured failures before edits.

Run both manual bootstrap commands and the v2 runner. The v2 result is corroboration, not sole proof.

### Checks

- Every required `evaluate-skill` case has a saved result.
- Existing adequate eval remains unchanged.
- Missing eval creates smallest source artifact.
- Draft-only request does not force acceptance work.
- One positive native activation reads the exact snapshot.
- One near-miss prompt does not read the target skill.
- Production-ready claim stops when required evidence is unavailable.
- Direct Pi process is used for ordinary cases.
- No subject self-grading.
- Current legacy harness is neither read nor modified.

### Stop Conditions

- Candidate treats user permission as pressure to ignore.
- Candidate requires a filesystem eval diff when an adequate eval already exists.
- Candidate silently downgrades activation or multi-turn evidence.
- Self-hosted report conflicts with manual artifacts.

## Slice 7: Bootstrap Acceptance And Handoff Back To Skill Comparison

### Purpose

Prove the foundation is trustworthy enough for later skill rewrites.

### Required Evidence

- all deterministic script tests pass;
- `.skill-eval` source and ignored-state boundaries are correct;
- one new skill can be initialized, validated, and inspected;
- every case marked `required_for_bootstrap` has a saved result, including old-versus-candidate pressure behavior, draft/status, eval reuse, user authority, external independence, positive native activation, and near-miss non-trigger coverage;
- one objective artifact conflict grades correctly;
- one semantic assertion is graded by a fresh context using randomized opaque labels and sanitized paths;
- one old-skill control is reused only through a complete matching fingerprint;
- every enumerated fingerprint input has a negative invalidation test;
- one candidate-only rerun works;
- one synthetic conflict triggers a bounded repeat or an unresolved-variance result at the cap;
- a wave above the configured concurrency bound queues excess jobs and preserves isolation;
- model-call and optional spend caps stop excess work as supported;
- Pi usage and cost are captured when exposed, and unavailable cost is labeled rather than substituted;
- manual and v2-runner invocation/evidence surfaces and fixed-rubric verdicts agree while stochastic variation is recorded;
- explicit guard evidence proves eval-root reads, snapshot writes, traversal, and symlink escapes are blocked;
- a fresh read-only acceptance audit inspects frozen cases, raw evidence, graders, and the readiness claim, followed by parent adjudication;
- the pre-existing `.freeflow/config.json` diff hash is unchanged;
- no external skill, parent subagent, legacy harness, npm dependency, root build change, installed hook, or installed extension is required.

### Acceptance Report

Save a concise report under:

```text
.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md
```

Include:

- exact source skill revisions;
- manual and runner commands;
- deterministic test results;
- compared cases and variants;
- token/cost evidence and unavailable fields;
- objective and semantic grades;
- independent acceptance-audit findings and parent adjudication;
- unsupported/deferred capabilities;
- residual risks;
- decision on whether later skill comparison may use v2 tooling.

### Final Stop

Stop implementation after bootstrap acceptance. Do not continue into Pi RPC, Codex, Claude, legacy migration, or other skill rewrites without a later owner-approved plan.

## Verification Summary

Minimum final commands should include:

```bash
node --test .skill-eval/write-skill/tests/*.test.mjs
node --test .skill-eval/evaluate-skill/tests/*.test.mjs
node skills/write-skill/scripts/skill-author.mjs validate skills/write-skill
node skills/write-skill/scripts/skill-author.mjs validate skills/evaluate-skill
node skills/evaluate-skill/scripts/skill-eval.mjs doctor
node skills/evaluate-skill/scripts/skill-eval.mjs init --skill <temp-eval-skill> --root <temp-root>
node skills/evaluate-skill/scripts/skill-eval.mjs plan --skill write-skill --profile iterate
node skills/evaluate-skill/scripts/skill-eval.mjs plan --skill evaluate-skill --profile iterate
node skills/evaluate-skill/scripts/skill-eval.mjs run --skill write-skill --profile iterate
node skills/evaluate-skill/scripts/skill-eval.mjs run --skill evaluate-skill --profile iterate
node skills/evaluate-skill/scripts/skill-eval.mjs grade --run <saved-run> --objective-only
node skills/evaluate-skill/scripts/skill-eval.mjs report --run <saved-run>
git diff --check -- skills/write-skill skills/evaluate-skill .skill-eval docs/specs/skills docs/plans/skills
git ls-files --others --exclude-standard
git status --short
```

Exact case flags may change during artifact review. Every executed command and result must be recorded in normalized evidence or the acceptance report.

## Completion Report

At bootstrap completion, report:

- implemented slices;
- changed files;
- deterministic tests;
- behavioral evals and variants;
- token/cost evidence;
- review/adjudication status;
- unsupported/deferred host capabilities;
- residual risks;
- whether the foundation is accepted for continuing skill comparison.
