> **Doc ID:** SPEC-2026-07-10-skill-authoring-evaluation-v2
> **Date:** 2026-07-10
> **Revised:** 2026-07-11
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Ready for commit — calibrated confirmation adjudicated
> **Source:** Live prototype, saved evidence, `docs/handoffs/workflow-and-skills/2026-07-11-implementation-scope-drift-and-replanning.md`, architecture-skill comparison, bounded Pi Design It Twice review, parent review-delta audit, and controlled cmux reviewer calibration
> **Implementation:** Frozen until this spec and plan are committed and the pre-code report is delivered

# Skill Authoring And Evaluation V2

## Status And Authority

This document defines the proposed reduced bootstrap for Freeflow's `write-skill` and `evaluate-skill` developer skills.

The previous design exposed manifests, attempts, retries, grades, comparisons, waves, cache, budgets, and reporting as caller-managed operations. Repeated review kept finding lifecycle edge cases because the public seam was too low.

The owner selected a deeper outcome-level design:

> One command evaluates one case. It performs deterministic preflight internally, stops before provider execution when unsafe or unresolved, otherwise runs the complete case and publishes one trusted result bundle.

The parent review-delta audit and narrow calibrated confirmation are complete. One accepted contradiction was corrected in the plan. This revision becomes implementation authority only after the spec, plan, and updated handoff are committed. Until then:

- no runtime or skill code changes;
- no paid subject or semantic evals;
- no bootstrap acceptance claim;
- current v2 skills remain Unverified candidates.

The durable failure and design context lives in:

- `docs/handoffs/workflow-and-skills/2026-07-11-implementation-scope-drift-and-replanning.md`
- commits `21f33e1` through `84a44f6`
- saved `.skill-eval/` runs and reports.

Handoffs and prototype artifacts are evidence, not current implementation authority.

## Problem

Freeflow needs a self-contained way to author and evaluate later skill changes without depending on external skill packs or the legacy eval harness.

The bootstrap must prove one trustworthy Pi-first evaluation without becoming a mature evaluation platform.

The prototype overexposed internal protocol and mixed trust with operational efficiency:

- cache and candidate-only reuse;
- resumable waves;
- concurrency;
- adaptive repeats;
- cross-job request/spend scheduling;
- caller-managed attempts and retries;
- mutable grading and aggregate reporting;
- broad fingerprint and schema machinery.

Most features were artifact-approved, not random implementation drift. Partial implementation showed that the artifact boundary itself was wrong.

## Fixed Outcome

Deliver two self-contained Unverified developer skills and a minimal Pi-first evaluator suitable for constrained dogfooding.

`write-skill` must:

- create the smallest agent-first skill candidate;
- define trigger and non-trigger behavior;
- preserve user authority and source truth;
- distinguish Draft, Unverified, and Production-Ready;
- use bundled deterministic structure tooling;
- route measured behavior questions into evaluation.

`evaluate-skill` must:

- evaluate exactly one case per invocation;
- preflight deterministically before any provider request;
- require explicit approved execution settings for model-driven work;
- run all variants declared by the case serially;
- isolate subject inputs and writable fixtures;
- capture objective evidence and usage;
- grade objective evidence before semantic judgment;
- use a fresh semantic context only when fixed assertions require it;
- publish one complete, immutable result bundle or no accepted result;
- report unsupported claims and residual uncertainty honestly.

Bootstrap acceptance means:

> Tooling accepted for constrained Pi-first dogfooding. Both skills remain Unverified v2 candidates.

It does not prove Production-Ready behavior, batching, cache, resume, concurrency, multi-turn, cross-host, or portability.

## Design Principles

### Outcome-level public interface

Caller asks for one case result. Caller does not coordinate variants, attempts, retries, grades, comparison assembly, integrity, or storage protocol.

### Internal deterministic preflight

Every execution begins with a no-provider phase. Invalid, unsafe, unsupported, over-budget, changed, or owner-unresolved work stops before provider execution.

### Whole-case atomicity

Complete case result is atomic success unit. Partial control/candidate work is diagnostic only.

### Restart instead of continuation

Bootstrap reruns the whole case after infrastructure failure. Partial reuse, resume, and cache are deferred efficiency features.

### Concrete Pi implementation

Pi is only host. Use concrete Pi behavior. Do not create host registries or generalized adapter architecture before second real host exists.

### Internal seams

Security, process execution, evidence capture, objective grading, semantic adjudication, and publication may remain separate internal modules. They are not separate public lifecycle operations.

### External composition

Evaluator does not batch cases. Future output-router or shell composition may invoke multiple independent evaluations. Evaluator remains standalone and owns no batch semantics.

## Non-Goals

Bootstrap does not provide:

- multi-case batching;
- suite scheduling;
- output-router integration or dependency;
- cache or control reuse;
- resume or partial continuation;
- public attempt/retry/orphan operations;
- concurrency;
- adaptive repeats;
- provider rate scheduling;
- cross-job soft budget scheduling;
- public manifest, grade, comparison, or report commands;
- arbitrary historical-run import;
- runtime schema framework;
- Pi RPC or multi-turn execution;
- Codex or Claude adapters;
- cross-host acceptance;
- legacy eval migration;
- delegation or cmux execution;
- npm dependencies, build step, or automatic dependency installation.

## Terms

**Case**: versioned source containing one natural prompt, fixture, evaluation kind, variants, explicit subject resources, execution requirements, evidence classes, objective assertions, and optional semantic rubrics.

**Single case**: one `subject` variant evaluated against fixed assertions without a comparative claim.

**Comparison case**: exactly two variants, `reference` then `candidate`, evaluated against the same fixed assertion IDs.

**Variant**: one subject configuration declared by the case. Variant roles are case-owned, not caller-selected at runtime.

**Preflight**: deterministic no-model phase that validates, resolves, freezes, bounds, and reports one case execution.

**Plan fingerprint**: stable identity of resolved case, variants, sources, execution settings, evidence requirements, and evaluator implementation used to detect change after `--plan-only`.

**Evaluation**: one invocation covering one case and all declared variants.

**Result bundle**: immutable published evidence and decision record for one complete evaluation.

**Diagnostic bundle**: incomplete infrastructure evidence that cannot support acceptance.

**Pi process**: one isolated subject or semantic invocation. One Pi process may contain multiple turns.

**Pi turn**: one model response plus resulting tool calls. The root guard can abort before a turn's provider call, making turns the bootstrap's enforceable model-work unit.

**Provider request**: one observed `before_provider_request` event from Pi. It is recorded as usage evidence, not promised as an independently enforceable global cap.

**Tool call**: one subject tool invocation. Tool calls are neither turns nor provider requests.

## Ownership

Human owner owns:

- public behavior and milestone scope;
- disputed semantic judgments;
- provider, model, thinking, per-process turn, timeout, output, and spend choices;
- acceptance and Production-Ready promotion.

Case owns:

- natural prompt;
- fixture;
- variants and their roles;
- subject resources;
- tools;
- evidence classes;
- objective assertions;
- semantic rubrics;
- unsupported-claim effects.

Evaluator owns:

- source and case validation;
- deterministic preflight;
- plan fingerprint;
- serial variant order;
- isolated fixture and subject materialization;
- concrete Pi invocation;
- raw evidence capture;
- objective grading;
- optional fresh semantic adjudication;
- usage accounting;
- single-case or comparison decision and readiness limitations;
- integrity and atomic publication.

Caller owns only:

- skill and case selection;
- approved model/execution limits;
- optional preview request;
- whether to invoke another independent case later.

## Runtime Constraints

Bundled tooling uses:

- Node.js 22 or newer;
- plain ECMAScript modules;
- Node standard-library APIs only;
- no npm install;
- no build step;
- argument-array process spawning, never shell interpolation.

Missing tools or capabilities are reported. Nothing installs automatically.

## Public Interface

The evaluator exposes only:

```text
skill-eval doctor
skill-eval init
skill-eval evaluate
```

Old public `plan`, `run`, `grade`, `report`, `resume`, cache, candidate-only, concurrency, and wave operations are removed.

### `doctor`

```bash
skill-eval doctor [--root <repo>]
```

Runs deterministic environment, Pi capability, and root-policy checks. Makes no provider request.

### `init`

```bash
skill-eval init --skill <name> [--root <repo>]
```

Creates smallest case-source workspace and refuses conflicting destinations.

### `evaluate`

```bash
skill-eval evaluate \
  --skill <name> \
  --case <case-id> \
  --timeout-ms <integer> \
  --output-limit-bytes <integer> \
  [--provider <id> \
   --model <id> \
   --thinking <level> \
   --max-turns-per-process <integer> \
   --max-usd <number>] \
  [--plan-only] \
  [--owner-approved] \
  [--expect-plan <fingerprint>] \
  [--root <repo>]
```

Rules:

- `skill`, `case`, `timeout-ms`, and `output-limit-bytes` are always required.
- Timeout and output limits apply independently to each Pi process.
- Pi model-driven cases require `provider`, `model`, `thinking`, and `max-turns-per-process`.
- `max-usd` is optional because cost may be unavailable; missing cost is reported as unavailable, not zero.
- Host-free cases reject every model option and run zero Pi processes.
- `plan-only` and `owner-approved` are mutually exclusive.
- `expect-plan` is allowed only with `owner-approved`.
- Model-driven execution without `owner-approved` performs preflight, returns `needs_approval`, and makes zero provider requests.
- One-call execution uses `owner-approved`; preflight and execution occur in one evaluator process.
- A prior preview may bind execution with `expect-plan`; mismatch returns `needs_approval` and makes zero provider requests.
- `root` preserves existing CLI behavior: use the explicit root, otherwise discover from the current working directory.
- Unknown or old lifecycle flags fail before provider execution.

The runtime cannot prove conversational approval. `owner-approved` is an explicit caller attestation. `evaluate-skill` instructions must obtain real owner approval before invoking it.

## Preflight

Preflight always runs first and makes zero provider requests.

It:

1. validates case source and required fields;
2. validates evaluation kind, variant roles, sources, and explicit subject resources;
3. rejects traversal, symlinks, missing files, and undeclared resources;
4. validates fixture tree and source immutability;
5. checks Pi version and required one-shot capabilities;
6. checks evidence-class support;
7. resolves exact tools and isolation policy;
8. resolves variant count and serial order;
9. calculates required subject and potential semantic Pi-process count;
10. verifies positive per-process turn, timeout, and output limits;
11. calculates worst-case approved turns as potential Pi processes multiplied by `max-turns-per-process`;
12. records spend ceiling and that provider requests are observed rather than globally hard-capped;
13. resolves source, case, fixture, subject, evaluator, and semantic identities;
14. returns plan summary and fingerprint.

Preflight statuses:

- `ready`: all required inputs supported and approved;
- `planned`: `--plan-only` requested;
- `needs_approval`: model work lacks approval, preview fingerprint changed, or a new owner decision appears;
- `blocked`: required evidence/capability unavailable;
- `invalid`: malformed, unsafe, missing, or contradictory input.

Only `ready` continues into execution.

A plan summary includes:

- skill and case;
- variants;
- provider/model/thinking when applicable;
- subject and potential semantic Pi-process count;
- per-process turn, timeout, and output limits;
- worst-case approved turn count;
- spend ceiling or cost limitation;
- provider-request accounting limitation;
- evidence support and unsupported claims;
- plan fingerprint;
- exact rerun command when approval is needed.

## Public Outcome Contract

Valid operational outcomes write one concise JSON object to stdout:

```json
{
  "status": "complete|planned|needs_approval|blocked|incomplete",
  "plan": {},
  "decision": {},
  "result": ".skill-eval/.../result.json",
  "diagnostic": ".skill-eval/.../diagnostic.json",
  "usage": {},
  "limitations": []
}
```

Only applicable fields appear.

Rules:

- `ready` is internal and never terminal: approved ready work continues into execution.
- `complete`, `planned`, and `needs_approval` are valid outcomes and exit successfully.
- `blocked`, `incomplete`, invalid CLI input, and internal failure exit nonzero.
- Invalid command syntax may use concise stderr rather than a structured taxonomy.
- Subject stdout/stderr is captured inside evidence or diagnostics, never mixed with command stdout.
- Behavioral assertion failure may still return `complete` because evidence is trustworthy.
- `result` appears only for `complete`.
- `diagnostic` appears only for `incomplete` when diagnostic publication succeeded.
- `planned` and `needs_approval` include the deterministic plan summary.

Bootstrap does not freeze exhaustive machine error codes, phases, mandatory null fields, or distinct numeric exit codes before a real consumer requires them.

## Case Contract

Every case declares:

- case ID and target skill;
- evaluation kind `single` or `comparison`;
- natural prompt;
- fixture path or null;
- variants in required serial order;
- explicit ordered subject resources for each variant, defaulting to `SKILL.md`;
- tools;
- host `pi` or `none`;
- evidence classes;
- objective assertions;
- optional fixed semantic assertions;
- whether unsupported evidence blocks the case or becomes a limitation.

A `single` case has exactly one variant with role `subject`.

A `comparison` case has exactly two variants in order: `reference`, then `candidate`. Both use the same required assertion IDs. More than two variants are deferred.

The evaluator materializes only declared subject resources. No automatic reference discovery occurs.

Case criteria are fixed before candidate output exists. Adding or changing required assertions after execution invalidates that evidence.

## Internal Evaluation Flow

When preflight is `ready`, evaluator:

1. creates unique internal staging directory;
2. freezes case, fixture, variant, and subject inputs;
3. writes internal plan record;
4. runs variants serially in case order;
5. gives each variant a fresh writable fixture copy and read-only subject resources;
6. captures final response, events, tool events, diff, status, exit, usage, and runtime counters;
7. grades objective assertions;
8. invokes fresh semantic adjudication only for unresolved fixed assertions, as a fresh Pi process under the same approved per-process limits;
9. combines per-variant results into one case result;
10. renders concise report;
11. inventories and hashes complete bundle;
12. atomically publishes final result.

Internal plan, variant evidence, semantic packets, comparison assembly, integrity inventory, and publication details are not public lifecycle interfaces.

## Atomic Success And Failure Contract

Atomic success unit is one complete case result.

### Valid behavioral failure

A subject that completes normally but fails assertions produces valid evidence and may publish a complete result. Candidate failure is not evaluator failure.

### Before first provider request

Invalid source, unsafe path, unsupported required evidence, unavailable Pi capability, approval gap, or invalid hard limit stops with no provider request and no result bundle.

### During execution

If the reference or an earlier variant has infrastructure failure, later variants do not start.

If any variant times out, exceeds hard limits, fails process startup, produces unusable evidence, or breaks isolation/integrity:

- no result bundle is published;
- available partial artifacts remain diagnostic only;
- result status is `incomplete`;
- observed usage and unavailable fields are reported;
- caller reruns whole evaluation after owner decision.

### Semantic adjudication

Objective failure cannot be repaired semantically.

Malformed, missing, hard-limited, or infrastructure-failed required semantic adjudication makes evaluation incomplete. Valid `uncertain` judgment may publish an inconclusive complete result.

### Crash and publication

Crash before atomic publication leaves diagnostic staging only. It is never acceptance evidence, resumed, adopted, or reused.

Crash after atomic publication leaves complete result valid.

Restart means invoke `evaluate` again for whole case. There is no public retry, resume, orphan, or partial-reuse mechanism.

This may repeat completed reference work. Low-volume bootstrap accepts that cost to avoid lifecycle machinery.

## Decision Contract

Every gradeable fixed assertion resolves to `pass`, `fail`, or `inconclusive`.

Unsupported required evaluator evidence blocks in preflight unless the case explicitly treats unsupported capability as the behavior being tested. For example, a case can pass when it proves that a subject honestly reports multi-turn evidence as unsupported. Unsupported evidence is otherwise a limitation, not a top-level case verdict.

For a `single` case, `result.json` contains `evaluation_kind: "single"` and exactly one `case_verdict`:

- `fail` when any required assertion fails;
- otherwise `inconclusive` when any required assertion is inconclusive;
- otherwise `pass`.

For a `comparison` case, `result.json` contains `evaluation_kind: "comparison"` and exactly one `comparison_verdict`. Required assertion IDs are paired between `reference` and `candidate`:

- `fail -> pass` is an improvement;
- `pass -> fail` is a regression;
- equal determinate outcomes are unchanged;
- any pair containing `inconclusive` is unresolved.

Aggregate comparison verdict:

- `improved`: at least one improvement and no regression or unresolved pair;
- `regressed`: at least one regression and no improvement or unresolved pair;
- `same`: every pair is unchanged;
- `inconclusive`: mixed improvement/regression or any unresolved pair.

There is no comparative verdict for a single case and no single-case verdict for a comparison case.

## Result And Diagnostic Bundles

Successful single-case evaluation returns:

```json
{
  "status": "complete",
  "decision": {
    "evaluation_kind": "single",
    "case_verdict": "pass"
  },
  "result": ".skill-eval/<skill>/runs/evaluations/<id>/result.json",
  "usage": {
    "turns": 0,
    "provider_requests": 0,
    "cost_usd": null
  },
  "limitations": []
}
```

A comparison result instead contains `evaluation_kind: "comparison"` and `comparison_verdict: "improved|regressed|same|inconclusive"` in `decision`.

Published bundle:

```text
<evaluation-id>/
├── plan.json
├── evidence/
│   └── <variant>/
│       ├── metadata.json
│       ├── final.md
│       ├── events.jsonl
│       ├── tool-events.json
│       ├── diff
│       ├── git-status.txt
│       ├── exit-status.txt
│       ├── usage.json
│       └── objective-grade.json
├── semantic/
│   └── <variant>.json
├── result.json
├── report.md
└── integrity.json
```

`result.json` is sole structured decision record. It includes:

- plan fingerprint;
- case and source identities;
- evaluator and semantic identities;
- variant identities;
- objective and semantic verdicts;
- final per-variant assertion results;
- evaluation kind and exactly one kind-specific verdict;
- evidence-class support;
- provider requests, tokens, and cost when available;
- unavailable fields;
- limitations and unsupported claims;
- residual uncertainty;
- readiness effects.

Diagnostic bundles live under generated incomplete/diagnostic storage and are never accepted by `result.json`, report, or future evaluation.

Historical prototype runs remain documentary evidence only. They are not imported, regraded, sealed, or compared through reduced runtime.

## Isolation And Security

Each variant receives only:

- natural prompt;
- isolated writable fixture copy;
- declared read-only subject resources;
- allowed tools.

Subject must not receive:

- suite/case source paths;
- assertions or semantic rubrics;
- another variant's evidence;
- reports;
- unrestricted shell;
- ambient Pi skills, prompts, extensions, themes, context files, or sessions.

Concrete Pi executor must:

- disable ambient resources;
- load one explicit root guard;
- allow fixture reads/writes;
- allow subject-resource reads;
- reject subject writes;
- reject eval-source reads;
- reject traversal and nested symlink escapes;
- enforce per-process timeout, output, and turn limits;
- preserve partial diagnostics on hard failure.

Every coordinator read derived from case, metadata, changed paths, semantic evidence, or bundle data applies same canonical containment and symlink policy.

## Evidence And Grading

Evidence priority:

1. filesystem state, diff, status, exit, events, and protocol fields;
2. deterministic derived facts;
3. final response;
4. semantic interpretation.

Semantic adjudicator:

- runs in fresh context;
- receives fixed assertion IDs and only required frozen evidence;
- uses opaque variant labels when practical;
- reports reasoning and uncertainty;
- cannot repair objective failure;
- uses same owner-approved model in bootstrap;
- counts as one potential Pi process under the same per-process hard limits and aggregate spend accounting.

Human owner may independently adjudicate disputed semantics during acceptance. Human review does not mutate published bundle.

Missing evidence states remain distinct:

- `supported`: required fidelity captured;
- `unavailable`: normally supported but absent in this execution;
- `unsupported`: bootstrap cannot produce required class;
- `inconclusive`: evidence exists but cannot decide claim.

## Budget Contract

Model-driven `evaluate` requires hard limits for each Pi process.

- `max-turns-per-process`, `timeout-ms`, and `output-limit-bytes` apply independently to every subject and potential semantic Pi process.
- Preflight reports the maximum Pi-process count and worst-case approved turns.
- Root guard aborts a process before the provider call for a turn beyond `max-turns-per-process`.
- Isolated Pi configuration disables automatic provider retries so hidden retries do not expand the approved work silently.
- A process that reaches a hard limit without valid evidence makes the whole evaluation `incomplete` and publishes diagnostics only.
- Provider requests, turns, tool calls, tokens, and cost are observed and reported separately.
- Bootstrap does not claim an independently enforceable global provider-request cap.
- Tool calls have no separate public budget in bootstrap.
- `max-usd`, when supplied and cost available, is a soft aggregate ceiling checked after each settled serial Pi process.
- A process may cross the soft spend ceiling because cost arrives afterward; no later process starts after observed cost reaches the ceiling.
- Missing cost remains unavailable, never zero.
- No persistent or cross-evaluation budget scheduler exists.

## Administrative Workspace

Project source remains:

```text
.skill-eval/
├── config.json
├── .gitignore
└── <skill>/
    ├── suite.json
    ├── cases/
    ├── fixtures/
    ├── reports/
    ├── tests/
    └── runs/
```

Cases and fixtures are version-controlled. Runs and staging are generated/ignored unless deliberately promoted as durable reports.

## Required Bootstrap Cases

Required `write-skill` evidence:

- differentiating authoring pressure/readiness honesty;
- Draft/Unverified behavior;
- positive activation;
- near-miss non-trigger;
- self-contained structure.

Required `evaluate-skill` evidence:

- artifacts outrank contradictory prose;
- no fake verification;
- positive activation;
- near-miss non-trigger;
- self-contained structure;
- unavailable multi-turn evidence remains unsupported;
- differentiating user-authority/eval-reuse pressure.

Existing case IDs may remain. Non-differentiating `ESK2-001` remains regression but is not required for bootstrap.

No batching command runs these together. Each accepted case uses independent `evaluate` invocation and result bundle.

## Readiness

Skill statuses:

- **Draft**: source exists; owner did not require behavioral evidence.
- **Unverified**: candidate and some checks exist; promotion evidence incomplete.
- **Production-Ready**: behavior/activation evidence matches declared support and owner approves promotion.

Bootstrap acceptance does not promote either skill automatically.

Allowed statement:

> Tooling accepted for constrained Pi-first dogfooding. `write-skill` and `evaluate-skill` remain Unverified v2 candidates.

## Prototype Migration

Retain and harden useful implementation:

- Pi argument-array execution;
- isolated config and explicit root guard;
- per-process timeout/output/turn enforcement;
- event/final/tool/usage/activation parsing;
- fixture and subject materialization;
- objective assertion semantics;
- semantic result validation;
- hashing and canonical containment.

Delete active mature machinery:

- cache;
- scheduler;
- wave state;
- resume/escalation;
- candidate-only reuse;
- adaptive repeats;
- concurrency;
- public plan/run/grade/report lifecycle;
- arbitrary run discovery;
- unenforced schemas.

Do not mutate or migrate prototype runs. Git history and saved evidence preserve them as historical context.

## Bootstrap Acceptance

Acceptance requires:

- active public interface limited to `doctor`, `init`, and `evaluate`;
- one-case-per-invocation enforced;
- preflight makes zero provider requests;
- invalid, blocked, changed-preview, invalid-limit, and unapproved work stops before provider execution;
- host-free cases use zero Pi processes and reject model flags;
- preflight reports maximum Pi-process count and worst-case approved turns;
- every subject and semantic Pi process obeys the approved turn, timeout, and output limits;
- automatic provider retries are disabled and provider requests are reported honestly;
- variants run serially in case order;
- only declared subject resources are exposed;
- source fixture and subject inputs remain immutable;
- root guard and coordinator reject traversal and symlink escapes;
- objective evidence outranks prose and semantic judgment;
- required semantic work uses fresh context under the approved per-process hard limits;
- behavioral assertion failure can publish valid complete result;
- infrastructure failure never publishes accepted result;
- crash before publication leaves diagnostics only;
- complete bundle is atomic, immutable, and integrity-verified;
- rerun starts whole case and never reuses partial work;
- usage/cost unavailable fields are honest;
- historical prototype runs stay documentary only;
- single cases publish only `pass|fail|inconclusive` case verdicts;
- comparison cases have exactly `reference` and `candidate` variants and publish only comparative verdicts;
- public operational outcomes are concise JSON and exact error taxonomy remains deferred;
- both skills structurally validate and remain Unverified;
- one manual direct Pi calibration agrees with one reduced evaluator result;
- required activation, near-miss, pressure, readiness, and unsupported-evidence cases have saved accepted results;
- concise bootstrap acceptance report names exact revisions, commands, evidence, limits, unsupported claims, and residual risks;
- two fresh read-only reviewers inspect final code and evidence;
- parent adjudicates findings once;
- no external skill, legacy harness, npm dependency, root build change, ambient extension, or output-router dependency is required.

## Re-entry Triggers

Freeze implementation and return to owner-backed artifact revision when:

- another public lifecycle command, state, or storage concept appears necessary;
- evaluator needs cache, resume, partial reuse, concurrency, batching, or second host;
- caller must understand internal manifests, variants, attempts, grades, integrity, or publication;
- second unexpected defect appears at same retained seam;
- case criteria change after implementation begins;
- architecture changes after paid evidence;
- remaining work grows after completed checkpoint;
- required reruns increase beyond accepted evidence plan;
- reviewer finding requires owner-owned scope, security, compatibility, or hard-to-reverse architecture decision;
- remaining finish path cannot be stated in a few steps.

At trigger:

1. stop edits and paid execution;
2. preserve current evidence;
3. name failed assumption;
4. classify local fix, plan defect, spec gap, owner decision, bounded refactor, or defer;
5. do not patch public interface before alternatives are considered.

## Deferred Milestones

Observed need and separate owner-approved plan are required for:

- output-router case composition;
- suite batching;
- cache and control reuse;
- resume/partial continuation;
- concurrency;
- adaptive repeats;
- different semantic model selection;
- provider/host adapters;
- Pi RPC and multi-turn;
- Codex/Claude;
- cross-host acceptance;
- legacy migration;
- aggregate reporting.

## Confirmed Owner Decisions

Confirmed 2026-07-11:

1. one public `evaluate` operation owns one complete case;
2. deterministic preflight and execution may occur inside one call;
3. `--plan-only` remains optional for preview;
4. model execution requires explicit owner-approved settings;
5. no batching in evaluator;
6. output router may compose independent commands later but evaluator does not depend on it;
7. complete case result is atomic success unit;
8. infrastructure failure reruns whole case; no partial reuse;
9. Pi is concrete only host;
10. prototype runs remain documentary evidence;
11. both skills remain Unverified after constrained bootstrap acceptance;
12. single cases have one `subject` and a `pass|fail|inconclusive` non-comparative verdict;
13. comparison cases have exactly `reference` and `candidate` with deterministic assertion-pair comparison;
14. turn, timeout, and output limits apply per Pi process; provider requests are observed, not promised as a global hard cap;
15. automatic provider retries are disabled in isolated evaluation processes;
16. valid operational outcomes use concise JSON without freezing exhaustive machine-code, phase, null-field, or numeric exit taxonomies;
17. explicit `--root` preserves existing root selection and otherwise discovery begins at cwd.
