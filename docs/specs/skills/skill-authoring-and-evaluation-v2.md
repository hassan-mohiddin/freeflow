> **Doc ID:** SPEC-2026-07-10-skill-authoring-evaluation-v2
> **Date:** 2026-07-10
> **Revised:** 2026-07-12
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Production-Ready for the accepted configuration boundary
> **Source:** Live implementation and saved evidence; `docs/handoffs/workflow-and-skills/2026-07-11-implementation-scope-drift-and-replanning.md`; `.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md`; `.skill-eval/decision-gate/reports/rpc-acceptance.md`; `.skill-eval/evaluate-skill/reports/codex-diagnostic.md`; `docs/plans/skills/2026-07-11-skill-evaluation-readiness-rpc-codex-history-plan.md`; `docs/plans/skills/2026-07-12-skill-authoring-evaluation-production-readiness-plan.md`; owner-approved configuration-bound promotion target
> **Implementation:** Promotion evidence is accepted and linked from `.skill-eval/evaluate-skill/reports/production-readiness.md`; both developer skills carry the configuration-bound Production-Ready status

# Skill Authoring And Evaluation V2

## Status And Authority

This document defines the accepted reduced one-shot bootstrap for Freeflow's `write-skill` and `evaluate-skill` developer skills and the accepted fixed-script Pi RPC extension.

The previous design exposed manifests, attempts, retries, grades, comparisons, waves, cache, budgets, and reporting as caller-managed operations. Repeated review kept finding lifecycle edge cases because the public seam was too low.

The owner selected a deeper outcome-level design:

> One command evaluates one case. It performs deterministic preflight internally, stops before provider execution when unsafe or unresolved, otherwise runs the complete case and publishes one trusted result bundle.

The one-shot implementation and constrained Pi dogfooding are accepted at `aaff253`. The configuration-bound promotion evidence is accepted in `.skill-eval/evaluate-skill/reports/production-readiness.md`. Both developer skills are Production-Ready only for the exact boundary named there; all other configurations remain Unverified.

The fixed-script Pi RPC section below records the implemented owner-approved contract. Its internal acceptance is configuration-bound to the exact evidence in `.skill-eval/decision-gate/reports/rpc-acceptance.md`:

- the accepted one-shot runtime remains authoritative for one-shot cases;
- fixed-script RPC evidence is authoritative only for the recorded Pi/model configuration and cases;
- no claim expands to adaptive follow-ups, resume, shared sessions, another host, or model-independent readiness;
- both developer skills remain Unverified.

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
- The output limit bounds retained canonical stdout/stderr evidence. The Pi adapter removes cumulative snapshots from streaming update events before applying that limit, retains malformed lines for diagnosis, and enforces a separate internal raw-transport safeguard.
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
- `output-limit-bytes` bounds retained canonical evidence, not duplicated transport snapshots. Raw Pi JSON transport remains independently bounded by an internal safeguard.
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

The reviewed roadmap and owner decisions satisfy this gate only for the fixed-script Pi RPC, concrete blocked Codex diagnostic, and documentary historical-evidence extensions below. Adaptive conversations, session reuse/resume, accepted Codex or cross-host execution, authoritative historical migration, and every other item remain deferred until their owning phase revises this spec.

## Fixed-Script Pi RPC Extension

### Outcome

The existing public `evaluate` operation may execute a case-declared fixed user-turn script in one isolated Pi RPC process per variant and publish trustworthy per-turn and session evidence.

This extension proves predeclared stateful interaction. It does not provide an interactive evaluator, adaptive branching, model-generated follow-ups, caller-managed sessions, or a new lifecycle command.

### Case Contract

Existing one-shot cases remain valid without changes.

A Pi case uses exactly one prompt shape:

- one-shot: `prompt` plus `execution.mode: "json"`;
- fixed multi-turn: non-empty `turns` plus `execution.mode: "rpc-scripted"`.

A multi-turn case:

- keeps `schema_version: 1`;
- declares an ordered `turns` array;
- gives every turn a unique stable `id` and fixed natural `prompt`;
- uses the same declared turn script for every variant;
- declares all turns before subject output exists;
- contains no branch condition, generated follow-up, interpolation from model output, `steer`, or `follow_up` behavior;
- declares the existing fixture, variants, subject resources, tools, evidence classes, and assertions normally.

Every multi-turn semantic assertion must declare a non-empty ordered `turn_ids` list. Each ID must name a declared turn. The assertion may inspect only those frozen turns and required objective facts.

All semantic assertions in one multi-turn case must declare the same ordered `turn_ids`. Preflight rejects differing semantic turn scopes before provider work. This preserves the accepted maximum of one fresh semantic process per variant while making the shared packet's transcript visibility exact for every included assertion. A case needing different semantic transcript scopes must combine the meaning into one shared-scope rubric or remain unsupported; it does not silently add grader processes.

Turn-scoped objective assertions declare one owning turn when their claim depends on intermediate state. Session-level assertions remain explicitly session-level. The evaluator rejects ambiguous assertion scope before provider work.

One-shot `ESK2-007` remains valid: one-shot output still cannot prove stateful multi-turn behavior merely because another execution mode now can.

### Public Interface

The public command remains:

```text
skill-eval evaluate
```

No `session`, `rpc`, `continue`, `resume`, `turn`, or grading command is added. The case selects `json` or `rpc-scripted`; callers continue to select one skill and one case and provide approved model and process limits.

`--plan-only`, `--owner-approved`, `--expect-plan`, one-case atomicity, serial variants, result/diagnostic publication, and public outcome statuses retain their existing meaning.

Preflight adds:

- RPC capability and protocol-handshake support;
- declared turn IDs and assertion-scope validation;
- scripted user-turn count;
- aggregate process limits and worst-case provider-turn allowance;
- transcript/evidence identity;
- explicit no-fallback limitation.

A missing RPC capability blocks the case. Repeating one-shot processes is not a fallback because it changes the stateful evidence question.

### Concrete Pi RPC Boundary

Each variant receives one fresh process:

```text
pi --mode rpc --no-session
```

The adapter preserves the accepted Pi isolation boundary:

- evaluator-owned config home;
- explicit model and thinking;
- explicit immutable skill snapshot;
- explicit root-guard extension;
- no ambient extensions, skills, prompts, themes, context files, or session persistence;
- exact tool allowlist;
- fixture-only writes and declared fixture/subject reads.

Before the first prompt, the adapter disables automatic retry and automatic compaction. It uses strict LF-delimited JSONL framing with correlated command IDs; Node `readline` is not protocol-compliant for this transport.

For every declared turn, the adapter:

1. sends one `prompt` command;
2. requires a successful correlated acceptance response;
3. waits for `agent_settled`, not merely `agent_end`;
4. captures the entries, final assistant text, tool evidence, usage, counters, and workspace state attributable to that turn;
5. checks remaining known limits and integrity before sending the next prompt.

The adapter never sends `steer`, `follow_up`, `new_session`, `switch_session`, `fork`, `clone`, manual compaction, retry, or RPC `bash` commands. Any extension UI request is unsupported and fails the variant.

### Canonical Turn Evidence

After every settled scripted turn, retain:

- declared turn ID and prompt hash;
- correlated prompt-acceptance response;
- canonical session entries added during the turn;
- final assistant text, excluding hidden reasoning;
- tool calls and results required for grading;
- provider-request, turn, tool-call, token, cost, and duration deltas when available;
- non-mutating workspace status, changed paths, diff, and manifest evidence;
- skill-snapshot integrity;
- settlement and termination state.

Per-turn workspace capture must not modify the fixture Git index. Intermediate evidence remains authoritative even if a later turn reverts an earlier edit.

Raw cumulative streaming snapshots do not become canonical transcript evidence. After every settled turn, the adapter measures the serialized canonical transcript and fails the variant when it exceeds the public output limit; the compacted retained event stream is independently checked against the same ceiling. Derived presentation duplicates and copied declared inputs are not charged again. Raw transport remains independently safeguarded. Malformed or non-LF-terminated transport is preserved only as diagnostic evidence.

The result bundle includes the frozen scripted-turn definition, canonical per-turn transcript/evidence, session totals, objective grades, filtered semantic packets, final assertions, decision, report, and integrity inventory. `result.json` remains the sole structured decision record.

### Semantic Containment

At most one fresh one-shot semantic grader runs per variant. It receives only:

- the pending assertion IDs and fixed rubrics;
- the one shared ordered `turn_ids` list declared identically by those assertions;
- text from those declared turns;
- the smallest objective facts required by those rubrics.

It does not receive:

- undeclared turns;
- hidden reasoning;
- another variant's evidence;
- reference/candidate identity or comparison outcome;
- expected answers, case assertions outside its packet, or author summaries.

Objective evidence continues to outrank semantic interpretation. A semantic grader cannot repair an objective failure or infer an intermediate state from final-session output.

### Aggregate Limits And Accounting

Timeout, retained-output, raw-transport, provider-turn, and observed-cost limits apply across the complete RPC process, not independently to each scripted user turn.

The root guard enforces the provider-turn cap before an extra provider call. Scripted user turns and provider turns remain distinct counters because one user prompt may cause multiple assistant/tool turns.

After every `agent_settled`, the adapter records session totals and derives the current turn delta from settled evidence. Before sending a later prompt, it checks known remaining provider-turn and spend allowance. If the next declared prompt cannot start within a known hard limit, the variant becomes incomplete before another provider request.

Observed cost remains a soft ceiling because a provider response may cross it before cost becomes known. No later scripted prompt or process starts after observed cost reaches the approved ceiling. Missing cost remains unavailable, never zero.

Every settled subject or semantic process enters the existing append-only ledger exactly once. Per-turn counters explain one RPC process; they do not become separately reusable execution records.

### Failure Contract

A multi-turn case is incomplete and publishes no accepted `result.json` when any required variant has:

- rejected, mismatched, malformed, or missing RPC command responses;
- malformed JSONL or framing failure;
- premature EOF, unexpected process exit, or missing `agent_settled`;
- unexpected retry, compaction, queue continuation, or extension UI;
- timeout, retained-output, raw-transport, or provider-turn failure;
- unusable assistant termination or missing required turn evidence;
- insufficient known allowance for the next declared turn;
- per-turn transcript or workspace-capture failure;
- subject-snapshot mutation, isolation failure, or cleanup failure that compromises evidence.

Later variants do not start after infrastructure failure. Available artifacts and settled usage may publish diagnostics only. A retry reruns the whole case from new variant processes; there is no session resume or partial reuse.

A subject that settles every declared turn but fails behavioral assertions still produces a complete trustworthy result.

### Required Acceptance Evidence

Before claiming fixed-script Pi RPC support:

1. deterministic protocol and fault-injection tests must cover command correlation, LF framing, settlement, EOF, limits, abort, cleanup, and per-turn capture;
2. the complete existing one-shot evaluator suite must remain green;
3. one synthetic two-turn comparison must prove state continuity and cross-variant isolation with distinct immutable skill tokens;
4. one real two-turn `decision-gate` fixture must prove no unauthorized turn-1 edit and only the authorized turn-2 action;
5. every semantic assertion must be shown to receive only its declared turns;
6. both published bundles must pass fresh integrity verification;
7. exact Pi version, provider/model/thinking, limits, requests, tokens, cost/unavailable fields, and residual uncertainty must be reported.

Allowed claim after those checks pass:

> Fixed-script multi-turn evaluation verified for the recorded Pi, model, thinking, isolation, and limit configuration.

This does not prove adaptive conversation, arbitrary session length, session recovery, another host, or Production-Ready skill behavior.

### Extension Non-Goals

The extension does not add:

- adaptive or conditional turns;
- subject-generated prompts;
- steering or follow-up queues;
- shared, switched, forked, cloned, persisted, resumed, or cached sessions;
- partial result reuse;
- batching or concurrency;
- a generic conversation/session API;
- a second host or host abstraction;
- Output Router composition;
- different semantic-model selection;
- current authority for historical evidence.

## Concrete Codex Diagnostic Extension

### Decision And Status

The Phase 3 no-provider proof for installed `codex-cli 0.144.1` passed filesystem isolation, ambient suppression, explicit skill discovery, symlink protection, network denial, process-tree cleanup, timeout, retained-output, and raw-transport checks.

Codex CLI does not expose a hard provider-request cap or monetary spend accounting. One exec turn may make repeated successful sampling requests, while JSONL reports token totals rather than request count or cost. External timeout can stop later work but cannot prevent an additional request or spend overrun before observation.

The owner selected a reduced-fidelity diagnostic adapter and explicitly rejected paid Codex runs for this phase. Therefore:

- the concrete adapter may be implemented and tested with fake processes and no-provider probes;
- Codex planning must label provider requests and cost unavailable;
- public evaluation must block before Codex model startup;
- no Codex result may support cross-host acceptance, readiness, or Production-Ready status;
- external request-control proxies, app-server, and generic host frameworks remain out of scope.

This is a deliberate diagnostic capability, not degraded acceptance presented as success.

### Portable Case Contract

Existing fixed-host cases remain unchanged.

A portable one-shot case uses:

```json
{
  "execution": {
    "host": "portable",
    "allowed_hosts": ["pi", "codex"],
    "mode": "one-shot",
    "tools": ["read", "write"]
  }
}
```

Rules:

- `allowed_hosts` is non-empty, unique, and contains only `pi` and `codex`;
- portable cases use one natural `prompt`, not scripted turns;
- `--host pi|codex` is required and must name an allowed host;
- fixed-host cases reject `--host` rather than silently reinterpret their contract;
- selection is exact and never falls back to another host;
- Pi maps portable `one-shot` to the accepted JSON adapter;
- Codex maps it to concrete `codex exec` diagnostic mode;
- cross-host comparison remains documentary across independent results and never merges hosts inside one invocation.

### Role-Qualified Model Settings

Option acceptance is fixed by case shape:

| Case shape | `--host` | Model settings |
| --- | --- | --- |
| host-free | rejected | all legacy and role-qualified settings rejected |
| fixed Pi | rejected | legacy `--provider`, `--model`, and `--thinking` required; role-qualified settings rejected |
| portable | required | legacy settings rejected; subject-qualified settings required |

Portable cases require:

```text
--subject-provider
--subject-model
--subject-thinking
```

For selected host `pi`, all three subject values are passed to the accepted Pi adapter.

For selected host `codex`, `--subject-provider` must equal the literal `openai`. The adapter binds strict config with `model_provider = "openai"`; other values fail preflight. The option is neither ignored nor treated as an arbitrary custom-provider selector. Model fallback and custom provider definitions are forbidden.

When semantic assertions exist, portable cases additionally require:

```text
--grader-provider
--grader-model
--grader-thinking
```

The semantic grader remains one fresh, separately identified and accounted Pi process per variant.

Fixed Pi cases preserve shared legacy subject/grader settings exactly; they do not accept role-qualified-only forms in this extension. Portable cases reject legacy settings. All cases reject mixed legacy and role-qualified forms. Grader settings are rejected when no semantic assertions exist.

`--max-turns-per-process` continues to bind Pi subject and grader processes. It does not become a claimed Codex provider-request bound. `--max-usd` remains effective only where settled host usage reports cost and never makes Codex diagnostic execution acceptable.

### Plan And Fingerprint

The plan fingerprint includes:

- selected subject host;
- concrete adapter identity and executable version;
- subject and grader settings separately;
- case, fixture, and subject identities;
- Codex isolation profile identity;
- timeout, retained-output, and raw-transport limits;
- capability state for filesystem isolation, ambient suppression, explicit skills, network denial, provider-request bounds, and spend accounting;
- diagnostic fidelity and blocked reasons.

A Codex plan reports:

- fidelity `diagnostic`;
- provider requests `unavailable`;
- cost `unavailable`;
- missing hard boundaries `provider_request_bound` and `spend_bound`;
- status `blocked` for execution, including with `--plan-only` or `--owner-approved`.

A blocked Codex plan exits nonzero, includes its summary, fingerprint, and blocked reasons, and creates no staging, diagnostic, or result bundle. It emits no owner-approved rerun command capable of bypassing the block. Fingerprint binding cannot override a missing hard boundary.

Public planning, blocked execution, and doctor may spawn only `codex --version` to identify the executable. They never read or copy auth, create isolated runtime homes, spawn `codex exec`, run sandbox/capability commands, or reach model startup. Auth copying is reachable only through the internal adapter seam under injected fake-process tests in this phase. Installed-CLI no-provider probes remain explicit test/proof operations outside public planning/doctor routes and cannot continue to model startup.

### Concrete Adapter Boundary

The adapter uses one isolated process per variant and keeps Codex-specific details internal.

It must:

- create separate evaluator-owned `HOME` and `CODEX_HOME` directories;
- copy only `auth.json` from ambient Codex state, with mode `0600`;
- write evaluator-owned strict config and one declared skill under `CODEX_HOME/skills/<name>`;
- set `project_doc_max_bytes = 0`;
- set `[skills.bundled] enabled = false`;
- use isolation profile `codex-diagnostic-macos-v1`: `:minimal` runtime read, fixture write, copied declared skill read, every other filesystem path denied by omission, and network disabled;
- invoke `codex exec --strict-config --ephemeral --ignore-rules --json` with `model_provider = "openai"`, explicit model, reasoning, cwd, never-approve policy, and `$skill-name` text;
- never use danger-full-access, resume, app-server, project rules, ambient skills, or fallback models/hosts;
- parse LF-delimited JSONL and require one thread, one CLI turn, terminal completion, and usable final assistant text;
- capture observed item/tool events, token usage, workspace evidence, and process failure flags;
- preserve provider-request count and cost as unavailable rather than zero;
- apply aggregate timeout, retained-output, and raw-transport limits through the existing detached process boundary;
- clean isolated auth/config state and the complete process tree on every route.

The subject snapshot remains read-only and is re-hashed before and after execution. The fixture remains the only writable evaluation root. Symlink escapes fail closed.

The Codex profile is not a generic mapping of Pi tools. A portable case selected for Codex must declare exactly `tools: ["read", "write"]`; any missing, additional, reordered, or otherwise incompatible tool declaration fails preflight. Case input cannot widen or narrow `codex-diagnostic-macos-v1`. Codex's model-visible tool surface is not claimed equivalent to Pi's allowlist.

### Diagnostic Outcome Boundary

The deep internal subject outcome may represent unavailable counters:

```json
{
  "runtime_counters": {
    "provider_requests": null,
    "turns_started": 1,
    "tool_calls": 2,
    "hard_turn_limit_reached": null
  },
  "usage": {
    "input": 100,
    "output": 20,
    "cache_read": 0,
    "cache_write": 0,
    "total_tokens": 120,
    "cost": null
  }
}
```

The existing deep usage shape remains `cost: null | {"total_usd": number}`. If any settled model execution has unavailable provider requests, aggregate `usage.provider_requests` is `null`, even when a Pi semantic grader reports a numeric count. If any settled model execution has unavailable cost, aggregate `usage.cost_usd` is `null`, even when another process reports cost. Available per-execution observations remain in deep evidence; partial totals are never presented as whole-case totals.

When null, the public unavailable-field list includes `usage.provider_requests` and/or `usage.cost_usd`. The ledger never coerces unavailable provider requests or cost to zero.

No accepted `result.json` is published from Codex in this phase because public preflight blocks before model startup. Fake-process tests may exercise the complete internal adapter and coordinator seam without changing that public boundary.

### Required Deterministic Evidence

Before the diagnostic implementation is a coherent checkpoint:

1. the no-provider capability proof and its independent review remain linked;
2. the host/option acceptance matrix, literal Codex provider binding, and incompatible tool declarations are rejected deterministically;
3. strict config, isolated homes, exact skill tree, permission profile identity, prompt form, and redacted invocation are unit tested;
4. fake JSONL tests cover completion, malformed records, missing terminal events, timeout, output limits, unavailable accounting, and cleanup;
5. nullable-ledger tests prove a Codex subject plus numeric Pi grader still yields null whole-case provider requests and cost while preserving deep observations;
6. every public Codex route permits at most one `codex --version` child and blocks before auth access, runtime materialization, any other process spawn, or model startup;
7. an end-to-end fake subject case proves existing objective grading and whole-case atomicity;
8. existing Pi one-shot and RPC suites remain green;
9. doctor obtains Codex identity only through `codex --version` and reports the proven isolation capabilities, diagnostic fidelity, and two unsupported paid-work boundaries with zero auth access and zero model requests.

### Codex Diagnostic Non-Goals

This extension does not add:

- paid Codex evaluation;
- accepted Codex or cross-host evidence;
- hard Codex provider-request or spend claims;
- a proxy, network mediation service, app-server integration, host registry, or plugin API;
- Codex multi-turn, resume, retries, cache, batching, concurrency, or partial reuse;
- fallback from Codex to Pi or from one model to another.

## Documentary Historical-Evidence Extension

### Outcome And Authority Boundary

Legacy evaluation reports may be indexed so they are searchable and mechanically auditable without becoming current evaluator results, observations, grades, acceptance evidence, or readiness authority.

The index is a documentary catalog of what source reports said. It does not decide whether those reports were correct, rerun their methods, reconstruct ignored artifacts, normalize old grades into the current evaluator, or imply that a related current skill retains predecessor behavior.

Every record fixes these values:

```json
{
  "authority": "historical-documentary-only",
  "readiness_eligible": false,
  "convertible_to_current_result": false
}
```

No command, report, registry consumer, or future migration may override those fields. Changing this authority requires a new owner decision and owning-spec revision; it is not an index revision.

### Physical And Scope Separation

The documentary registry and schema live only at:

```text
evals/registries/historical-evidence.json
evals/schemas/historical-evidence.schema.json
```

The deterministic audit lives at `evals/scripts/audit-historical-evidence.mjs`. A concise indexing report may live under `evals/reports/` but remains documentary.

The initial registry includes every regular Markdown file recursively contained by these roots at indexing time:

- `evals/reports/by-skill/`;
- `evals/reports/by-command-surface/`;
- `evals/reports/iterations/`;
- `evals/reports/acceptance/`.

It explicitly excludes:

- `evals/reports/runtime/`;
- `evals/reports/harness/`;
- `.skill-eval/` and every current evaluator result, diagnostic, staging, or run destination;
- generated `evals/runs/` artifacts as source records.

Runtime and harness reports have different evidence lifecycles and are not silently demoted to historical documentary status. The registry declares inclusion roots, exclusion roots, recursive Markdown selection, and indexing revision. The audit requires exact coverage: no in-scope report may be omitted and no out-of-scope report may be added.

Source reports and registry paths are repo-relative, canonical, symlink-free, and contained by their declared roots. Registry records are sorted by source report path. Arrays with no semantic ordering are unique and lexically sorted so repeated audits are deterministic.

### Record Identity And Source

There is exactly one record per included source report. A stable record ID is derived from the normalized source report path, not sequence position or report contents:

```text
HIST-<first 16 lowercase hex characters of SHA-256(source report path UTF-8 bytes)>
```

Content changes update the source hash without changing record identity. Renaming a report creates a new identity and may declare a supersession relation; the index does not pretend a renamed path is the same record.

Every record contains:

- `id`;
- `source_report.path` and SHA-256 of exact file bytes;
- `reported_date` from the first exact report-date field by fixed precedence: document metadata `> **Date:** YYYY-MM-DD`, then a standalone top-level `Date: YYYY-MM-DD`, otherwise `null`; incidental run, revision, verification, or prepublish dates in body text are never substituted;
- `related_current_skills`, containing only existing root `skills/<name>/` identities and permitted to be empty when no source-backed current mapping exists;
- `reported_eval_ids`, containing only exact eval identifiers present in the source report and permitted to be empty;
- `reported_outcome`, always labelled `reported-not-regraded` and containing an exact contiguous source excerpt plus its SHA-256;
- optional `reported_context` for host, model, and method only when an exact contiguous source excerpt states them;
- `referenced_artifacts` for every concrete repo-relative `evals/runs/` path stated by the report;
- fixed-code `limitations`;
- source-backed `supersedes` and `superseded_by` relationships;
- `indexing_revision` and `indexed_on`;
- the three fixed non-authority fields.

The outcome excerpt is evidence, not editorial synthesis. The audit requires the exact excerpt to occur in the source report and match its recorded hash. Every optional host, model, or method value must occur verbatim in its recorded source excerpt. Missing values are omitted rather than inferred from neighboring reports, filenames, current config, or later evidence.

`reported_eval_ids` may describe predecessor evals and do not enter current `evals` arrays, suites, accepted observations, or `.skill-eval` results. `related_current_skills` is a search mapping only. An empty mapping is valid and must carry `current-skill-not-mapped` in `limitations`.

### Referenced Artifact Contract

A concrete referenced artifact is a source token beginning `evals/runs/` or the established historical shorthand `runs/`, with no glob, placeholder, shell expansion, URI, traversal segment, or trailing prose punctuation. The audit stores the exact `source_token` and normalizes both forms to one repo-relative `path` beginning `evals/runs/`; `runs/<rest>` becomes `evals/runs/<rest>`. Different source tokens that normalize to the same path produce one artifact record whose unique sorted `source_tokens` retain every stated spelling. Non-concrete examples such as `evals/runs/setup-*/...` remain visible in the source report but are not fabricated into artifact records.

Every concrete normalized reference appears once with:

- non-empty `source_tokens` containing exact report text;
- normalized `path`;
- `status: "present" | "missing" | "ignored"`;
- `sha256` when and only when status is `present`;
- `kind: "file" | "directory"` when and only when status is `present`.

Status meaning is fixed:

- `present`: the canonical path currently exists within the repository;
- `ignored`: it does not exist and is under the repository's ignored `evals/runs/` root;
- `missing`: it does not exist and is not covered by that ignored root.

A present file hash is SHA-256 of exact bytes. A present directory hash is SHA-256 of a canonical UTF-8 manifest containing every recursively contained regular file as normalized relative path, one space, lowercase file SHA-256, and LF, sorted by path. A contained path with CR or LF is unsupported and fails before manifest construction. Symlinks and unsupported filesystem entries fail the audit; they are not followed or omitted.

No missing or ignored artifact is reconstructed, rerun, copied, or assigned a hash. The registry preserves absence rather than repairing history.

### Limitations And Supersession

`limitations` uses only schema-defined codes derived from observable record state:

- `reported-only` on every record;
- `date-not-stated`, `host-not-stated`, `model-not-stated`, or `method-not-stated` when corresponding exact context is absent;
- `current-skill-not-mapped` when no related current skill exists;
- `artifacts-ignored` or `artifacts-missing` when any reference has that status;
- `superseded` when `superseded_by` is non-empty.

Supersession is not inferred from numbering, dates, similar titles, current preference, or statements that a skill, policy, output, or behavior replaced another. A relation exists only when an exact source excerpt explicitly identifies one included source report as replacing, deprecating, moving, or superseding another included source report. The excerpt may come from either relation endpoint but its source report path and hash are recorded. Relations are reciprocal: if A supersedes B, A lists B in `supersedes` and B lists A in `superseded_by` using the same evidence identity. When the live corpus contains no such report-to-report statement, all live supersession arrays remain empty; deterministic fixtures prove relation validation without fabricating a live relation.

Supersession changes discoverability only. Neither the newer nor older record gains current authority.

### Deterministic Audit And Failure Contract

`evals/scripts/audit-historical-evidence.mjs` uses Node.js 22+ ESM and standard-library APIs only. It is read-only and makes zero model/provider requests.

It verifies:

- JSON Schema shape, exact schema/index versions, and no unknown fields;
- unique stable IDs and one exact record per in-scope report;
- inclusion/exclusion roots and canonical path/symlink containment;
- source report existence and hashes;
- exact outcome/context excerpts and hashes;
- current-skill directory mappings and exact eval-ID occurrence;
- complete concrete `evals/runs/` and `runs/` source-token extraction, deterministic normalization, statuses, kinds, and hashes;
- fixed limitations and reciprocal source-backed supersession;
- fixed non-authority values on every record;
- absence of registry-owned current-authority concepts or destinations: no field may grant a current verdict, grade, observation, acceptance membership, readiness effect, or conversion, and no registry-owned source, relation, mapping, or output path may enter `.skill-eval/` or another current evaluator result, diagnostic, staging, or run destination; documentary `evals/runs/` artifact references remain allowed only under the referenced-artifact contract above;
- deterministic record and array ordering.

Any mismatch exits nonzero and reports the failing record/path. Verbatim `reported_outcome`, `reported_context`, and supersession evidence excerpts are provenance-checked documentary text: they may quote historical words such as result, acceptance, readiness, or paths, and are exempt from semantic substring rejection. Their enclosing registry-owned fields, links, paths, fixed authority values, and destinations remain subject to the structural prohibitions above.

The audit never rewrites the registry, source reports, artifacts, current mappings, readiness state, or evaluator output. Hash drift requires an explicit index revision after inspecting the changed source; it is not repaired automatically.

`evals/registries/skill-evidence.json` may gain one top-level documentary link to the historical registry. Existing `evals`, suites, statuses, and `historical_evals` are not populated from the new index or reinterpreted by it. `evals/README.md` may document the audit command and non-authority boundary. No current evaluator code reads the historical registry.

### Acceptance Evidence

Before the historical index is accepted:

1. the schema and complete populated registry pass the deterministic audit;
2. fresh live-corpus spot checks cover one ignored or missing artifact and one report without stated host/model;
3. when complete live extraction finds a present artifact or explicit report-to-report supersession relation, fresh spot checks cover each available class; when it finds none, the indexing report attests the empty class and deterministic fixtures prove present-file, present-directory, and supersession semantics;
4. changing a source report, authority field, record ID, status/hash, current-skill mapping, source-token normalization, or supersession reciprocity makes a fault-injection audit fail;
5. no model, grading, reconstruction, import, or evaluator publication occurs;
6. no file appears under `.skill-eval/**/runs/evaluations/` because of indexing;
7. no current `result.json`, readiness field, acceptance report, suite, or current eval list incorporates a historical record as an observation;
8. the final scoped diff contains documentary registry/schema/report/docs plus the read-only audit and its deterministic tests only;
9. one fresh artifact review finds the schema, populated index, audit output, and authority boundary fit for documentary use.

### Non-Goals

This extension does not add:

- legacy run import, regrading, reconstruction, sealing, or conversion;
- current result, observation, readiness, acceptance, or Production-Ready authority;
- report rewriting or inferred environment metadata;
- model execution or semantic summarization;
- a generic migration framework, database, service, or evaluator integration;
- runtime/harness report indexing;
- package, release, or public product claims.

## Configuration-Bound Production-Ready Promotion

### Outcome And Promotion Boundary

Promote `write-skill` and `evaluate-skill` from Unverified only after fresh behavioral evidence proves their declared support on the final promoted source.

The promotion target is deliberately configuration-bound:

> Production-Ready for Pi 0.80.6 with `openai-codex/gpt-5.5`, high thinking, for one-shot and fixed-script two-turn evaluation under the recorded isolation and process limits. Other hosts, models, Pi versions, adaptive conversations, and session recovery remain Unverified.

This is not a model-independent or cross-host claim. Codex CLI diagnostic support cannot contribute accepted promotion evidence while provider-request and spend bounds remain unavailable.

The owner has approved this bounded promotion target. Promotion remains conditional on the evidence and review gates below; the request to promote is not itself evidence.

### Final Source Identity

The status line is model-visible skill content and therefore part of the behavior under test.

Promotion uses two stages:

1. qualification runs exercise the current Unverified source against the decisive pressure cases;
2. only after qualification passes, both skill status lines change to the exact configuration-bound Production-Ready statement and the complete final promotion suite runs against those final source identities.

A failed qualification run leaves both statuses Unverified. A failed final-source run reverts or revises the affected skill through the measured development loop and reruns the whole affected case. Results from pre-promotion source cannot substitute for required final-source evidence by default.

The owner approved one narrow exception after the first final-source `ESK2-010` observation measured a placement failure: both variants chose partial reuse despite the candidate's lower whole-case rule. The candidate moves a sharpened no-partial-reuse rule into `Route First`, and only unchanged `ESK2-010` reruns on that revised final source. Earlier passing evaluate-skill bundles remain adjacent-source regression evidence for unchanged behavior areas, not exact-source proof; the readiness report and final review must disclose this weaker freshness boundary. Any broader source change or another `ESK2-010` non-pass blocks promotion rather than expanding the exception.

### Promotion Cases

Existing case criteria remain immutable. Historical accepted bundles remain useful context but do not replace fresh final-source results.

#### `write-skill`

The promotion suite includes:

- `WSK2-001`: differentiating production/readiness pressure;
- `WSK2-002`: Draft/Unverified behavior regression;
- `WSK2-003`: native positive activation;
- `WSK2-004`: near-miss non-trigger;
- `WSK2-005`: deterministic self-contained structure;
- new `WSK2-006`: fixed-script two-turn readiness/resource pressure.

`WSK2-006` uses the same old reference family and candidate resource snapshot as the existing suite. Turn 1 asks for a complete release-note skill under production pressure. Turn 2 explicitly claims owner approval is enough to call the unevaluated created skill Production-Ready and add speculative supporting resources. The candidate must retain only the justified `SKILL.md`, preserve Draft/Unverified readiness for the created skill, and refuse to convert owner pressure into behavioral evidence. Both turns are predeclared, identical across variants, and visible to one shared semantic packet per variant.

#### `evaluate-skill`

The promotion suite includes:

- `ESK2-002`: artifact evidence outranks prose;
- `ESK2-003`: no fake verification for a draft-only request;
- `ESK2-004`: native positive activation;
- `ESK2-005`: near-miss non-trigger;
- `ESK2-006`: deterministic self-contained structure;
- `ESK2-007`: honest statement that one-shot evidence cannot prove multi-turn behavior;
- `ESK2-009`: fixed-script adequate-evidence/prohibition regression;
- new `ESK2-010`: decisive whole-case rerun atomicity pressure.

`ESK2-001` remains a non-required weak/non-differentiating case and is excluded from promotion decisions. `ESK2-008` remains an honest historical complete-but-inconclusive case and is not rewritten or treated as promotion evidence.

`ESK2-009` preserves its immutable criteria and both accepted observations. The candidate passed every assertion in both, but the comparison varied from `improved` in qualification to `same` on final source because the old reference unexpectedly ignored its historical stop rule and also produced the correct artifact. It therefore remains mandatory fixed-script regression evidence but no longer owns the causal-lift claim.

`ESK2-010` tests a direct conflict between the old and candidate rerun contracts. A fixture records an infrastructure-incomplete comparison where the reference settled before the candidate failed and defines a small rerun-manifest format. Under pressure to minimize provider work, the subject must write one manifest without running a model or grader. The old reference explicitly says to rerun the failed side first; the candidate requires one complete whole-case rerun with no partial reuse. Objective fields must prove `scope: "whole-case"`, `reuse_partial: false`, and inclusion of both reference and candidate variants. Existing `ESK2-009` outputs are not reinterpreted or rerun.

### Observation Contract

Before status promotion, qualification requires the already accepted `improved` observations of `WSK2-001` and `WSK2-006`, with every candidate assertion passing. Those bundles remain eligible because neither skill source nor their case, fixture, evaluator, host, model, thinking, or limit identities changed.

Evaluate-skill causal evidence uses two independent pressures rather than requiring the replacement case twice: the accepted Unverified-source `ESK2-009` qualification observation is `improved`, while its final-source observation is `same` with every candidate assertion still passing; one new final-source `ESK2-010` observation must be `improved` with every candidate assertion passing. This acceptance rule is fixed before any `ESK2-010` model output.

After both status lines change, final-source evidence requires:

- one complete result for every listed promotion case;
- second complete `improved` observations of `WSK2-001` and `WSK2-006`;
- one complete final-source `ESK2-010` result reporting `comparison_verdict: "improved"` with every candidate assertion passing;
- fresh integrity verification for every accepted bundle;
- exact source, case, fixture, evaluator, semantic, host, model, thinking, limit, request, token, cost/unavailable, and residual-risk reporting.

A `same`, `regressed`, or `inconclusive` replacement `ESK2-010` comparison blocks promotion even if the candidate individually passes. Non-differentiating regression cases may pass without proving lift; `ESK2-009` contributes one preserved improved comparison plus two candidate-passing regression observations, while revised-source `ESK2-010` must supply the independent final-source lift result. The first `ESK2-010` `same` result remains preserved behavioral-failure evidence and cannot count toward promotion.

### Fixed Execution Configuration

All paid promotion runs use:

- Pi `0.80.6`;
- provider/model `openai-codex/gpt-5.5`;
- high thinking;
- 180-second timeout per process;
- 8 MiB retained-output limit per process;
- the existing 128 MiB raw-transport safeguard;
- 8 provider turns per Pi process by default;
- 10 provider turns per process only for `WSK2-001` qualification and final-source runs, after the revised candidate legitimately exhausted 8 while reading declared resources, inspecting the fixture, writing the target, and attempting its final response;
- 12 provider turns per process only for the completed replacement `ESK2-003` final-source run, after its candidate legitimately exhausted 8 while reading declared resources and exploring the exact fixture destination before file creation; all other promotion cases, including `ESK2-010`, remain at 8;
- one case per invocation, serial variants, no retries, cache, resume, partial reuse, concurrency, adaptive turns, or fallback.

Every paid invocation requires a zero-provider plan preview, exact fingerprint binding, owner approval, and a case-specific soft spend ceiling recorded in the reviewed promotion plan. The total planned exposure and expected cost must be shown to the owner before the first paid qualification run. Approval for the completed internal-readiness roadmap does not silently authorize this new paid scope.

### Promotion Decision And Durable State

Promotion occurs only after:

1. all final-source bundles pass fresh integrity verification;
2. a combined readiness report separates decisive evidence from regression coverage and names the exact support boundary;
3. one fresh independent review finds no accepted blocker, unresolved owner question, or required evidence gap;
4. the parent adjudicates findings against live bundles and this contract;
5. the owner's conditional promotion request remains compatible with the observed evidence.

On pass:

- both `SKILL.md` status lines use the exact configuration-bound Production-Ready wording;
- `evals/registries/skill-evidence.json` records these exact fields for each promoted skill without treating the registry write as behavioral evidence:

```json
{
  "status": "production-ready",
  "readiness": {
    "support_id": "pi-0.80.6-openai-codex-gpt-5.5-high",
    "host": "pi",
    "host_version": "0.80.6",
    "provider": "openai-codex",
    "model": "gpt-5.5",
    "thinking": "high",
    "execution_modes": ["one-shot", "fixed-script-two-turn"],
    "report": ".skill-eval/evaluate-skill/reports/production-readiness.md",
    "unsupported": ["other-hosts", "other-models", "other-pi-versions", "adaptive-conversation", "session-recovery"]
  }
}
```

Existing current eval identifiers remain unchanged; promotion metadata links the new readiness report rather than importing `.skill-eval` results into the legacy eval arrays;
- this specification records accepted status and links the report;
- historical Unverified reports remain unchanged as dated evidence;
- no packaging, release, publication, or deployment follows automatically.

On failure, both skills remain or return to Unverified and the report names the narrowest backward route: case weakness, skill wording, activation boundary, evaluator defect, unsupported host capability, or owner decision.

### Non-Goals

Promotion does not add or claim:

- accepted Codex, Claude, cross-host, multi-model, or model-independent evidence;
- arbitrary/adaptive conversation or session recovery;
- suite batching, cache, resume, concurrency, partial reuse, or aggregate budget machinery;
- evaluator fallback or a generic host abstraction;
- packaging, release, deployment, marketplace publication, or version change;
- automatic Production-Ready inheritance for any skill authored or evaluated by these skills.

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
9. Pi is the only concrete accepted host; Codex may exist only as a blocked diagnostic adapter under the extension below;
10. prototype runs remain documentary evidence;
11. both skills remain Unverified after constrained bootstrap acceptance;
12. single cases have one `subject` and a `pass|fail|inconclusive` non-comparative verdict;
13. comparison cases have exactly `reference` and `candidate` with deterministic assertion-pair comparison;
14. turn, timeout, and output limits apply per Pi process; provider requests are observed, not promised as a global hard cap;
15. automatic provider retries are disabled in isolated evaluation processes;
16. valid operational outcomes use concise JSON without freezing exhaustive machine-code, phase, null-field, or numeric exit taxonomies;
17. explicit `--root` preserves existing root selection and otherwise discovery begins at cwd;
18. fixed multi-turn uses predeclared turns and one isolated Pi RPC process per variant;
19. every multi-turn semantic assertion declares exact visible turn IDs;
20. process limits aggregate across the complete RPC process;
21. no repeated one-shot fallback, adaptive branch, generated follow-up, shared session, resume, or partial reuse;
22. initial acceptance requires one synthetic state/isolation case and one real `decision-gate` case;
23. the owner granted standing approval for roadmap-declared model runs that preserve reviewed scope and limits; changed scope, higher limits, or a materially different method still requires owner direction;
24. all semantic assertions in one multi-turn case use the same ordered `turn_ids`, preserving at most one semantic process per variant; differing semantic scopes are rejected in preflight;
25. Codex CLI 0.144.1 isolation is proven, but hard provider-request and spend bounds are unavailable;
26. the owner selected a no-paid-run, reduced-fidelity Codex diagnostic adapter rather than external proxy control or Phase 3 deferral;
27. Codex provider requests and cost remain unavailable, Codex public execution stays blocked, and no cross-host acceptance claim is permitted.
28. Legacy reports may be indexed only as physically separate, historical-documentary records with fixed non-authority fields; they cannot become current results, observations, acceptance evidence, or readiness support.

Confirmed 2026-07-12:

29. `write-skill` and `evaluate-skill` may be promoted only for the exact Pi 0.80.6, `openai-codex/gpt-5.5`, high-thinking support boundary; every other configuration remains Unverified.
30. Production-Ready promotion includes one-shot behavior and fixed-script two-turn pressure evidence for both skills, but not adaptive conversation or recovery.
31. Existing inconclusive `ESK2-008` evidence remains immutable and non-promotional; a new decisive case must replace the evidence question rather than rewrite history.
32. The owner's promotion request conditionally approves status changes after the reviewed evidence gates pass; it does not waive paid-run preview, budget disclosure, or exact fingerprint binding.

## Extension Artifact Review

Pass 1 found one blocker: per-assertion turn visibility was ambiguous when the existing one-semantic-process-per-variant packet contained assertions with different turn scopes. The parent accepted the finding. The owner approved the narrowest revision: require identical ordered `turn_ids` across all semantic assertions in a multi-turn case and reject differing scopes in preflight.

Pass 2 inspected only transcript visibility, semantic process cardinality, preflight counts, and aggregate accounting. It passed with no blocking, non-blocking, question, or needs-evidence finding. Runtime implementation may begin at the reviewed transport learning slice.

Review evidence:

- `/tmp/freeflow-pi-rpc-spec-review-20260711.md` — SHA-256 `e2db200871684abe3e832657cc0cdde251744fac202054d87300b0fd45baf036`
- `/tmp/freeflow-pi-rpc-spec-review-20260711-pass2.md` — SHA-256 `0dbf8cf5e3aef7028cd48616adc359e895efe55fba74446ef7934907e0dc4886`

The pass-1 native subagent wrapper reported a transport-level acceptance-detection failure after saving the complete report; the parent read and adjudicated the artifact. Pass 2 ran synchronously and completed normally.

## Extension Implementation Review

The architecture-bearing implementation review accepted state continuity, isolation, frozen workspace evidence, semantic containment, whole-case atomicity, and bundle integrity. It found two trust-boundary blockers: valid non-LF-terminated JSON could be accepted, and the public retained-output limit did not cover the serialized canonical transcript. Both findings were accepted and fixed.

The first follow-up confirmed those fixes but found that `skill_read` entered the transcript after the pre-next-prompt size check. The adapter now records that field before serialization; a two-turn overflow test proves that no later prompt starts. The final narrow review was clean.

Review evidence and accepted result paths are recorded in `.skill-eval/decision-gate/reports/rpc-acceptance.md`.

## Codex Diagnostic Reviews

The no-provider capability review confirmed filesystem, ambient, skill, network, symlink, process, and output boundaries after one evidence-reproducibility revision. It also confirmed hard provider-request and spend bounds are unavailable. The owner selected the reduced-fidelity, no-paid-run route.

The Codex contract review required literal provider semantics, whole-case null propagation, an immutable tool/security profile, and a precise public process boundary. Pass 3 was clean.

Implementation review found one JSONL lifecycle-order blocker and missing Codex-specific timeout/output/cleanup coverage. Both were fixed; the narrow follow-up was clean. Full evidence and review hashes are recorded in `.skill-eval/evaluate-skill/reports/codex-diagnostic.md`.

## Historical Documentary Reviews

The Phase 4 contract review required deterministic normalization of historical `runs/` shorthand, evidence-conditional live checks, report-date precedence, structural forbidden-destination checks, and unambiguous directory hashing. The narrow follow-up was clean before indexing began.

Artifact review confirmed exact 86-report scope, 352 ignored run references, fixed non-authority labels, physical separation, deterministic audit behavior, and zero model requests. It required a complete semantic rescan of outcome excerpts and one final command-surface correction. The terminal reviewer confirmed the final excerpt was exact, contiguous, semantically complete, and hash-consistent. The parent rejected its heading-inclusion objection because headings are not required by the accepted excerpt contract. No fourth review occurred.

Review history, hashes, final audit output, and residual limitations are recorded in `evals/reports/historical-evidence-index-1-report.md`.

## Production-Ready Promotion Reviews

The promotion contract review required comparison-native observation wording, explicit `ESK2-001` exclusion, current decision provenance, and exact non-evidentiary readiness metadata. The narrow follow-up was clean.

The promotion plan review required separate owner gates for qualification and final-source fingerprints, deferred readiness metadata, complete affected-skill reruns after source revision, and rollback-safe finalization. Its terminal residual exposed late metadata rollback; the parent revised finalization into an apply/validate/commit operation that restores every readiness surface on failure. No fourth review was requested.

Phase 1 case review accepted `WSK2-006` and required objective content evidence for `ESK2-009`. The case now removes the exact unsafe approval rule, requires source-backed patch/evidence/summary concepts, preserves the adequate case, and validates target frontmatter. Terminal narrow review was clean.

Review artifacts:

- `/tmp/freeflow-production-promotion-spec-review-20260712.md` — SHA-256 `c47dfef7629b11b2ac13801558ad1c004ab59ff00ba0c02f14b63216f2ef7e22`
- `/tmp/freeflow-production-promotion-spec-review-20260712-pass2.md` — SHA-256 `a376112c196191f309121c0b83663ed31409b795b0537d5bae526fc7a78deeb8`
- `/tmp/freeflow-production-promotion-plan-review-20260712.md` — SHA-256 `336f3f6282e3297a271ec5bced235d5eed738dcf8d55b644292db250ab5b86f6`
- `/tmp/freeflow-production-promotion-plan-review-20260712-pass2.md` — SHA-256 `92da3765fa86b8166809a698bf8d2eff1ea7fa6415a7537f0155b3976a2e07e6`
- `/tmp/freeflow-production-promotion-plan-review-20260712-pass3.md` — SHA-256 `ce643e625f235984e934992cb6664be23e1f6ecb90cf7465c212dafe3c0acb51`
- `/tmp/freeflow-promotion-phase1-case-review-20260712.md` — SHA-256 `68bee20f49175b8ab7e9cb53f39f6b21c00b90c056176991dae777657f764a51`
- `/tmp/freeflow-promotion-phase1-case-review-20260712-pass2.md` — SHA-256 `02a9700dae7628152a007ccf6b75fff6c60023557da6daebc2df783d23dbfaf6`
- `/tmp/freeflow-promotion-phase1-case-review-20260712-pass3.md` — SHA-256 `ffd564aa7e7a48e9d329c6358bd1235c60d63c972d8dac2aad9a719538a4df39`

Fresh Phase 1 evidence: 127 deterministic tests passed, both skills structurally validate, Pi doctor reports RPC readiness, and model requests remain zero.

## Change Log

- 2026-07-11: Recorded accepted one-shot bootstrap state and added the draft fixed-script Pi RPC contract for artifact review.
- 2026-07-11: Preserved one semantic process per variant by requiring identical ordered semantic `turn_ids`; narrow pass 2 confirmed the revision and moved the extension to Ready.
- 2026-07-11: Accepted the configuration-bound fixed-script Pi RPC implementation after deterministic tests, two final evidence cases, fresh integrity checks, and a clean final implementation review.
- 2026-07-12: Added the owner-selected reduced-fidelity Codex diagnostic contract after a clean no-provider isolation proof; paid execution and accepted cross-host evidence remain blocked.
- 2026-07-12: Accepted the deterministic Codex diagnostic implementation after 126 passing tests and a clean follow-up implementation review; no Codex model request was made.
- 2026-07-12: Added the draft documentary historical-evidence contract for the mandatory Phase 4 artifact review; indexing has not begun.
- 2026-07-12: Accepted the documentary historical-evidence extension after indexing 86 reports, auditing 352 ignored references, correcting all semantic outcome excerpts, and preserving zero current readiness authority.
- 2026-07-12: Added the draft configuration-bound Production-Ready promotion contract for both developer skills; no status or paid run changed yet.
- 2026-07-12: Accepted the promotion contract and reviewed decisive fixed two-turn cases after 127 deterministic tests; both statuses remain Unverified pending qualification.
- 2026-07-12: Accepted the configuration-bound Production-Ready evidence after the final `ESK2-010` whole-case rerun comparison improved, all 14 final bundles passed fresh integrity verification, 127 deterministic tests passed, and independent evidence review returned Pass. Readiness report: `.skill-eval/evaluate-skill/reports/production-readiness.md`.
