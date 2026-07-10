> **Doc ID:** SPEC-2026-07-10-skill-authoring-evaluation-v2
> **Date:** 2026-07-10
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** Shared skill-pack review, live Freeflow skills/evals/docs, and current Pi/Codex/Claude CLI capability inspection
> **Implementation:** Planned through bootstrap acceptance after joint spec/plan review
> **Review:** Bootstrap review completed 2026-07-10; repeat during final cross-skill synthesis

# Skill Authoring And Evaluation V2

## Status And Authority

This document preserves the current design direction for Freeflow's `write-skill` and `evaluate-skill` developer skills.

This spec now authorizes implementation planning for the foundational bootstrap scope. Implementation starts only after this spec and its plan are reviewed together and blocking findings are adjudicated.

Later skill reviews may change the broader design. After bootstrap acceptance, resume the skill-pack comparison and re-review this spec during final cross-skill synthesis before implementing deferred portability work.

The current Freeflow eval harness is prior art and evidence only. It is not the baseline architecture defined here.

## Problem

Current `write-skill` and `evaluate-skill` capture useful rules but do not form a complete, portable skill-development system.

A user installing only these two skills cannot reliably:

- design agent-first skill instructions;
- distinguish a draft skill from a production-ready skill;
- create a portable eval workspace;
- choose the cheapest eval that preserves behavioral accuracy;
- run fair controls and candidates across Pi, Codex, or Claude;
- isolate subject agents from eval answers and grading criteria;
- capture normalized evidence, token usage, and cost;
- combine deterministic and model-based grading safely;
- revise wording, placement, structure, or activation from measured failures;
- run multi-turn conversational evals without using parent-agent delegation;
- know when stronger acceptance evidence is required.

The current skills also depend conceptually on external authoring references. The replacement must be self-contained and must not require Anthropic `skill-creator`, Matt Pocock skills, Obra/Superpowers, or another installed skill at runtime.

## Intended Outcome

Ship two self-contained developer skills that behave as one skill-development system:

- `write-skill` creates the smallest agent-first skill candidate and defines its behavioral contract.
- `evaluate-skill` creates and runs the smallest accurate eval, grades evidence, diagnoses failures, and determines whether a production-ready claim is supported.

The active `SKILL.md` files remain compact. Conditional depth lives in bundled references. Deterministic, repeated operations live in bundled scripts. Project-specific eval definitions and evidence live under one repo-local `.skill-eval/` workspace.

## Goals

- Teach agents to write instructions for model behavior, not human-facing manuals.
- Make wording, ordering, trigger descriptions, stop conditions, examples, and progressive disclosure explicit design variables.
- Make eval-first iteration practical without forcing a large harness for every skill.
- Reduce model usage by stripping irrelevant context, reusing valid controls, grading mechanically where possible, and escalating only when cheaper evidence is inconclusive.
- Preserve realistic activation and host behavior when those are the eval question.
- Support multiple skills, variants, hosts, models, and repeats through bounded direct-process concurrency.
- Keep subject, grader, analyzer, and author roles distinct.
- Make evidence quality and fallback limitations visible.
- Keep the architecture portable across Pi, Codex, and Claude without reducing all hosts to their lowest common denominator.

## Non-Goals

- Do not merge the two skills into one skill.
- Do not create a broad engineering encyclopedia.
- Do not copy external skill-authoring manuals into Freeflow.
- Do not use the current Freeflow `evals/` registry or runner as the new baseline.
- Do not migrate legacy Freeflow evals in the first implementation.
- Do not require subagents for ordinary eval execution or grading.
- Do not require every eval to run across every host, model, or repeat count.
- Do not make deterministic phrase checks the sole measure of semantic behavior.
- Do not auto-install Node, agent CLIs, packages, or system dependencies.
- Do not add cmux/delegation execution until a real full-fidelity eval requires it and the delegation contract is stable.

## Settled Design Decisions

### Runtime

Bundled tooling uses:

- Node.js 22 or newer;
- plain ECMAScript modules (`.mjs`);
- JSDoc where contracts need type clarity;
- Node standard-library APIs only by default;
- no build step;
- no npm dependencies.

If Node is missing or unsupported, the skill or `doctor` command reports the requirement and presents installation options. It does not install Node automatically.

### Ownership

`write-skill` owns:

- skill purpose and behavioral contract;
- trigger and non-trigger boundaries;
- instruction wording and priority;
- stop and exit conditions;
- degrees of freedom;
- progressive disclosure;
- reference, script, and asset decisions;
- draft versus production-ready status;
- the handoff into evaluation.

`evaluate-skill` owns:

- eval question classification;
- eval workspace creation;
- case, prompt, fixture, and variant design;
- host capability detection and execution mode selection;
- control and candidate execution;
- isolation, evidence capture, usage, and cost;
- deterministic and semantic grading;
- variance and repeat policy;
- failure classification;
- the measured revision handoff back to `write-skill`;
- acceptance evidence and residual uncertainty.

### Public Eval Profiles

Expose two user-facing profiles only:

- `iterate`: cheapest accurate feedback for the current failure or candidate.
- `acceptance`: broader evidence required before a production-ready or release claim.

Internal scheduling may have multiple steps. Users do not manage a generation taxonomy.

### Eval Workspace

All project-specific skill eval state lives under:

```text
.skill-eval/
```

Each skill owns one direct child directory:

```text
.skill-eval/<skill-name>/
```

Target skill directories contain only runtime instructions and resources. They do not contain eval prompts, expected outcomes, fixtures, reports, or generated run evidence.

### Legacy Boundary

The existing Freeflow `evals/` tree remains legacy evidence during this redesign. New tooling does not silently discover, adopt, mutate, or migrate it.

If `.skill-eval/` does not exist, `evaluate-skill` may create it after an explicit init or eval request. If a conflicting destination exists, stop and ask rather than merging conventions.

## Skill Package Shape

The target package shape is:

```text
skills/
├── write-skill/
│   ├── SKILL.md
│   ├── references/
│   │   ├── agent-first-instructions.md
│   │   ├── activation-and-boundaries.md
│   │   ├── structure-and-progressive-disclosure.md
│   │   └── skill-development-loop.md
│   ├── scripts/
│   │   └── skill-author.mjs
│   └── assets/
│       └── minimal-skill.md
│
└── evaluate-skill/
    ├── SKILL.md
    ├── references/
    │   ├── evaluation-architecture.md
    │   ├── eval-design-and-variants.md
    │   ├── portable-execution.md
    │   ├── token-efficient-evals.md
    │   └── grading-and-revision.md
    ├── scripts/
    │   ├── skill-eval.mjs
    │   └── lib/
    │       ├── case-loader.mjs
    │       ├── capability-resolver.mjs
    │       ├── planner.mjs
    │       ├── scheduler.mjs
    │       ├── fingerprint.mjs
    │       ├── evidence.mjs
    │       ├── grader.mjs
    │       ├── process-runner.mjs
    │       └── adapters/
    │           ├── pi.mjs
    │           ├── codex.mjs
    │           └── claude.mjs
    ├── schemas/
    │   ├── eval-case.schema.json
    │   └── run-evidence.schema.json
    └── assets/
        └── portable-eval-case.json
```

The public scripts and reference responsibilities are part of the target contract. Internal library filenames are tentative and may change if implementation evidence supports a simpler decomposition.

## Project Eval Workspace Shape

A developed project uses:

```text
.skill-eval/
├── config.json
├── .gitignore
├── discover/
│   ├── suite.json
│   ├── cases/
│   ├── prompts/
│   ├── fixtures/
│   ├── reports/
│   ├── tests/
│   ├── runs/
│   └── cache/
├── write-skill/
│   └── ...
└── evaluate-skill/
    └── ...
```

Only create optional directories when needed.

Version-controlled source evidence:

- `config.json`;
- `suite.json`;
- cases;
- long prompts that do not fit cleanly in a case;
- fixtures;
- deterministic script tests;
- selected durable reports.

Ignored generated state:

- runs;
- cache;
- transient skill snapshots;
- raw event streams unless deliberately promoted as durable evidence.

Default `.skill-eval/.gitignore`:

```gitignore
*/runs/
*/cache/
```

Do not add a shared fixture directory until real duplication demonstrates shared ownership. Prefer local duplication over premature cross-skill coupling.

## Skill Authoring Contract

### Draft Versus Production-Ready

A skill may exist as an unverified draft. It must be labeled honestly.

A production-ready claim requires eval evidence appropriate to the skill's behavior, activation model, risk, and target hosts.

`write-skill` must not force evaluation when the user explicitly asks for a draft only. It must not call an unevaluated skill production-ready.

### Agent-First Instruction Design

Every active sentence should earn context by routing, constraining, stopping, or guiding behavior.

The skill must address:

- what behavior should change;
- when the skill should and should not activate;
- what evidence or decision triggers each rule;
- rule priority and conflict resolution;
- what the agent must do instead of a prohibited behavior;
- exit conditions preventing endless application;
- which uncertainty should block, remain tentative, or wait for evidence.

Explanations are allowed when they measurably improve behavior. Concision is not a substitute for causality.

### Progressive Disclosure

Start with one `SKILL.md`. Add references, scripts, or assets only when they:

- prevent measured behavior failure;
- keep high-priority active instructions visible;
- provide conditional depth;
- avoid repeated deterministic work;
- supply output material the skill actually needs.

References must be linked directly from `SKILL.md` with conditions describing when to read them.

### Static Authoring Tool

`skill-author.mjs` should support, at minimum:

```text
init
validate
inspect
```

`init` creates the smallest valid skill candidate. `validate` checks structural facts. `inspect` reports advisory wording or organization signals but never claims behavioral success.

## Evaluation Contract

### Eval Questions

Every run must name the question it answers:

- structural validity;
- automatic activation;
- explicit invocation;
- active-body wording;
- conversational behavior;
- fixture/repo behavior;
- skill composition;
- multi-turn behavior;
- full host/runtime behavior.

Do not substitute one question for another and keep the same evidence label.

### Evidence Classes

A case must declare one or more evidence classes. The runner may support a claim only when it captures that class's required evidence:

- `structure`: deterministic file, metadata, schema, or command evidence; no subject model required.
- `explicit-instruction`: the exact skill snapshot is deliberately supplied or invoked, with prompt, events, final output, and usage retained. This can test active wording but cannot support an automatic-activation claim.
- `native-activation`: the host discovers the skill through its native mechanism, and events prove the exact snapshot was read or activated. Description-boundary acceptance also needs a near-miss case showing no target-skill read or activation.
- `artifact-outcome`: isolated before/after filesystem state, diff, status, command output, and exit evidence prove task effects.
- `multi-turn`: a stateful session transcript proves the ordered turns and retained state. One-shot injection is not equivalent.
- `cross-host`: the same case semantics and required evidence run through each named host adapter. One host cannot stand in for another.

Semantic grading is a grading method, not an evidence class. A case may combine classes, such as `native-activation` plus `artifact-outcome`.

`plan` must reject an acceptance job when a required class is unavailable. Iterate may run a labeled diagnostic only when it reports the changed question and makes no stronger claim.

### Iterate Profile

The default iterate path should:

1. run no-model structural checks;
2. choose one strong pressure case;
3. select the cheapest host mode that preserves the eval question;
4. run a valid control and candidate when no reusable control exists;
5. grade objective evidence first;
6. use a semantic grader only for unresolved assertions;
7. classify the failure;
8. recommend one wording, placement, structure, activation, fixture, or host change;
9. rerun the failed candidate side first after revision.

One decisive case is preferable to many clean prompts.

### Acceptance Profile

Acceptance should select only evidence relevant to the skill's declared support:

- native activation;
- high-value behavioral regressions;
- near-miss non-trigger cases;
- important skill compositions;
- target hosts;
- target models;
- repeated runs where observed variance requires them;
- one full-fidelity runtime path when release claims depend on it.

Acceptance must report what remains unsupported or untested.

### Variants

The architecture must support explicit variants rather than assuming every comparison is `baseline` versus `with-skill`:

- no skill;
- old skill snapshot;
- current release;
- candidate working copy;
- old description with unchanged body;
- new description with unchanged body;
- base skill stack;
- base stack plus target skill;
- installed runtime context.

Typical comparisons:

- new skill: no skill versus candidate;
- revision: exact old snapshot versus candidate;
- description change: same body with old versus new metadata;
- composition: base stack versus base stack plus target.

### Role Separation

Keep these roles separate:

- subject: performs the task under the selected variant;
- mechanical grader: proves objective facts;
- semantic grader: judges only assertions artifacts cannot prove;
- analyzer: identifies patterns, variance, and likely failure class;
- author: changes the skill from measured evidence;
- human owner: decides public behavior and disputed judgments.

A subject must not grade its own run in the same conversation.

Semantic graders should use fresh context, fixed criteria written before the run, blinded variant identity when practical, and evidence-backed verdicts.

### Deterministic And Probabilistic Grading

Use deterministic checks for:

- changed, created, or deleted files;
- diff content;
- exit status;
- JSON/schema validity;
- tool calls;
- skill activation evidence;
- command output;
- usage and cost;
- required or forbidden paths and protocol fields.

Use model or human judgment for:

- reasoning quality;
- user-authority preservation;
- architectural fitness;
- recommendation quality;
- semantic completeness;
- whether behavior reflects the intended rule rather than phrase matching.

A polished response cannot override contradictory filesystem or command evidence.

## Subject Isolation

Directory placement is not a security boundary. The runner must prevent subject access to eval answers through every tool it exposes.

For each subject run:

1. copy only the fixture into an isolated run directory outside the source workspace;
2. copy the target skill into a separate immutable snapshot in that run directory;
3. exclude `.skill-eval/` definitions, assertions, reports, controls, and candidate labels;
4. start the subject inside the isolated fixture;
5. expose only the natural user prompt, target skill, and allowed tools;
6. keep grading criteria coordinator-side;
7. enforce readable roots for the fixture and selected skill snapshot and writable roots for the fixture only;
8. resolve real paths and reject traversal and symlink escapes;
9. capture evidence after the subject settles and verify the snapshot hash did not change.

The subject must not see control output, expected outcomes, reports, or semantic grading rubrics.

An adapter may claim strict tool isolation only when every exposed filesystem or command tool enforces the declared roots. For Pi bootstrap runs, load one explicit adapter-owned root guard, expose no unrestricted shell, and prove allowed and denied paths before paid model execution. Auto-discovered extensions remain disabled. If the guard cannot enforce the required roots, stop; copied-directory isolation alone is only a reduced-fidelity diagnostic and cannot satisfy bootstrap acceptance.

## Portable Host Architecture

### Core And Adapters

Use one host-neutral case, planning, scheduling, fingerprint, evidence, and grading core. Use host-specific adapters only for capability probing, command construction, event parsing, usage extraction, and cleanup.

Each adapter reports capabilities such as:

- native automatic skill loading;
- explicit skill invocation;
- instruction injection;
- ephemeral sessions;
- context isolation;
- tool allowlists;
- structured events;
- usage and cost metrics;
- multi-turn control;
- sandboxing;
- plugin loading;
- safe parallel execution.

### Fallback Rule

Choose the cheapest available mode that satisfies the eval requirements.

If a fallback changes the eval question or evidence quality:

- do not call it equivalent;
- label it as a diagnostic or reduced-fidelity result;
- report the missing capability;
- stop when acceptance requires unavailable evidence.

Automatic activation cannot be proven by direct body injection. Multi-turn behavior cannot be replaced by one giant prompt. Pi behavior cannot prove Claude Code or Codex host behavior.

### Pi

Pi is the primary reference adapter and should support:

- print/JSON one-shot runs;
- native `--skill` loading;
- explicit skill invocation;
- stripped context and resources;
- exact tool allowlists;
- structured usage and cost capture;
- tiny fixture execution;
- RPC multi-turn conversation evals;
- automatic versus explicit activation evidence.

Use Pi print/JSON for most independent evals. Use Pi RPC for automated multi-turn evals. Do not use cmux or delegation merely to run ordinary cases.

### Codex

The Codex adapter should support proven one-shot capabilities:

- `codex exec`;
- ephemeral execution;
- isolated cwd/config where supported;
- JSON events;
- sandboxing;
- final-output capture.

Do not claim native skill activation until a capability probe demonstrates an isolated, realistic path.

### Claude

The Claude adapter should support proven one-shot capabilities:

- print mode;
- bare mode;
- no-session persistence;
- stream JSON;
- plugin loading;
- tool restrictions;
- budget caps.

`doctor` must detect bare-mode authentication limitations. Do not silently switch to a noisier startup mode when that changes evidence quality.

### Delegation And Interactive Agents

Direct child processes are the default execution shape. They avoid parent-agent orchestration tokens and make evidence easier to attribute.

Pi RPC handles automated multi-turn cases. A future cmux/delegation backend is allowed only when interactive panes, parent/child coordination, resume/steer behavior, or delegation contracts are themselves under test.

## Scheduling, Concurrency, And Cost

The deterministic scheduler may expand:

```text
cases x variants x hosts x models x repeats
```

It must not run the full cross-product by default.

Requirements:

- bounded configurable concurrency with queued overflow;
- isolated run directories and config homes;
- immutable skill snapshots during a wave;
- control and candidate launched from one resolved wave plan when both are needed;
- no skill edit while related runs remain active;
- explicit provider, model, and thinking selection before model calls;
- a required model-call cap and optional spend cap;
- provider-aware rate and budget limits where the host exposes the needed data;
- optional fail-fast when evidence is decisive or infrastructure is broken.

Parallelism reduces wall-clock time, not model tokens. A missing cost metric cannot be treated as zero; use the model-call cap and report spend enforcement as unavailable.

### Adaptive Repeats

Start with one run per side. When results conflict, activation is unstable, or acceptance needs variance evidence, the scheduler must add a bounded repeat or stop at the configured cap and report unresolved variance. Do not require a fixed three-run rule for deterministic fixture behavior.

### Control Cache

A control is reusable only when its fingerprint matches all behavior-relevant inputs, including:

- eval ID, suite, case content, assertions, and grading policy;
- prompt;
- fixture;
- skill snapshot;
- host, host version, provider, and stable backend model revision when available;
- model and thinking level;
- tools and root-isolation policy;
- context, config-home, extension, and runtime-hook settings;
- adapter version.

Any relevant mismatch invalidates the control. When a provider does not expose a stable backend revision, record that limitation and apply an explicit cache-age policy rather than implying cross-time identity.

## Normalized Evidence

Every host adapter should normalize available evidence into a common run bundle:

```text
metadata.json
final.md
events.jsonl
diff
git-status.txt
exit-status.txt
usage.json
objective-grade.json
```

Omit unavailable artifacts explicitly in metadata rather than fabricating them.

Metadata must identify:

- eval and case;
- variant;
- skill snapshot hash;
- host, host version, and adapter version;
- model and thinking level;
- tools and context controls;
- command or invocation shape with secrets removed;
- evidence classes and whether each required artifact was captured;
- run fingerprint;
- start/end time;
- token usage, cache usage, and cost when available.

Full transcripts remain stored but are not loaded by default. Inspect them when objective evidence and final response cannot explain a surprising result.

## Eval Workspace Commands

`skill-eval.mjs` should expose one coherent CLI:

```text
doctor
init
plan
run
grade
report
```

Expected behavior:

- `doctor`: probe installed runtimes, hosts, auth viability, and capabilities without model calls unless an explicit smoke proof is requested.
- `init`: create the smallest `.skill-eval/<skill-name>/` source structure required by the first case.
- `plan`: resolve cases, variants, hosts, models, repeats, cache hits, evidence class, and expected model-call count without executing models.
- `run`: freeze snapshots, create isolated workspaces, execute bounded jobs, capture evidence, and run objective grading.
- `grade`: grade saved evidence, using a semantic model only for unresolved assertions when requested.
- `report`: summarize comparisons, token/cost deltas, variance, evidence quality, residual uncertainty, and production-readiness status.

Exact CLI flags remain tentative until implementation planning.

## Safety And Security

Bundled scripts must:

- spawn commands with argument arrays rather than shell interpolation;
- redact credentials and auth tokens from metadata;
- reject destructive run roots such as `/`, home, or repo root;
- delete only paths created and owned by the current run;
- keep fixture writes isolated;
- avoid automatic package/runtime installation;
- avoid loading untrusted project hooks or config unless the eval explicitly requires full-fidelity runtime behavior;
- treat subject output as untrusted data during grading and report generation;
- cap output, runtime, retries, recursion, concurrency, and optional model spend;
- record when a host cannot enforce requested read/write isolation.

## Two-Skill Development Loop

The intended loop is:

1. define the target behavior and failure;
2. write the smallest candidate skill;
3. label it Draft or Unverified;
4. create the smallest eval case that can expose the behavior;
5. run the iterate profile;
6. classify failure as activation, wording, placement, missing stop, structure, fixture, host, or grading weakness;
7. change one measured pressure point;
8. rerun the failed candidate side first;
9. run acceptance when a production-ready claim matters;
10. report evidence and residual gaps;
11. promote status only when supported.

A valid existing eval may be reused unchanged. Do not mutate an eval merely to prove eval-first ordering.

If the user explicitly requests an unevaluated draft, provide it and label it. If the user requests a production-ready change while forbidding required evidence, name the conflict and ask which claim should change.

## Bootstrap Entry Gate

Bootstrap implementation may begin after joint spec/plan review:

- resolves every blocking contradiction;
- confirms the approved write set and preserved v1 controls;
- proves a feasible Pi root-isolation guard before subject model calls;
- defines required bootstrap cases and pre-run criteria;
- leaves provider, model, thinking, and budget selection as an explicit owner gate before paid calls.

## Bootstrap Acceptance Criteria

The Pi-first foundation is accepted for later skill rewrites only when saved evidence confirms:

- Both skills are self-contained and have no runtime dependency on external skills.
- Active `SKILL.md` files stay compact and route conditional depth to direct references.
- Node scripts run without npm installation or a build step.
- Project eval source and generated state follow the `.skill-eval/<skill-name>/` ownership contract.
- The Pi adapter enforces fixture/snapshot read roots and fixture-only write roots, including traversal and symlink checks, with no unrestricted shell.
- All cases marked `required_for_bootstrap` have recorded results; this set includes draft/status behavior, eval reuse and user authority, old-versus-candidate pressure behavior, and positive native activation plus near-miss non-trigger evidence for both skills.
- `iterate` runs one fair old/candidate comparison through Pi without subagents, and the resolved paired plan differs only by variant inputs.
- Manual bootstrap and runner executions agree on invocation/evidence surfaces and fixed-rubric verdicts; stochastic text need not match exactly and observed variance is reported.
- Every claimed evidence class has its required artifacts; unavailable classes are unsupported rather than substituted.
- Mechanical evidence outranks contradictory prose.
- One fresh blinded semantic grade is evidenced and optional semantic grading can be omitted when objective evidence settles the case.
- Adaptive-repeat scheduling adds a bounded repeat for conflict or reports unresolved variance at the cap.
- Cache reuse succeeds only for a complete matching fingerprint and rejects every behavior-relevant mismatch.
- Concurrency queues work above the configured bound, run state remains isolated, and model-call/budget caps stop excess work.
- Pi usage and cost are captured when exposed; unavailable cost is not serialized as zero.
- An independent fresh-context acceptance audit inspects frozen cases, raw evidence, graders, and the readiness claim; the parent adjudicates its findings.
- No automatic Node or host installation occurs.
- No external skill, parent subagent, legacy Freeflow eval harness, root build change, or installed hook/extension is required.
- Pi RPC, Codex, Claude, legacy migration, and broader portability are labeled deferred.

## Full Target Acceptance Criteria

After final cross-skill synthesis, broader implementation acceptance additionally requires:

- Pi RPC multi-turn evals with `multi-turn` evidence;
- Codex and Claude adapters that report real capabilities and do not overclaim native activation;
- acceptance profile selection across declared target hosts/models without forcing a full cross-product;
- full capability, isolation, cache, and evidence conformance for every shipped adapter;
- explicit, owner-approved legacy Freeflow eval migration if migration is still useful.

## Tentative And Evidence-Gated Decisions

Tentative:

- exact internal JavaScript module decomposition;
- exact CLI flags and output formatting;
- whether selected durable reports default to Markdown, JSON, or both.

Evidence-gated:

- default concurrency, initially expected to be conservative;
- whether Codex can prove native automatic skill activation in an isolated run;
- whether Claude bare mode can prove automatic plugin skill activation under supported auth;
- when repeated model grading materially improves verdict reliability;
- whether a future single binary is worth replacing the Node runtime requirement;
- whether cmux/delegation adds value beyond Pi RPC for any eval not explicitly testing delegation.

## Bootstrap And Final Synthesis

Before bootstrap implementation:

1. write the bootstrap implementation plan;
2. review this spec and the plan together with fresh, read-only reviewers using explicit rubrics rather than the current workflow skills;
3. adjudicate blocking, non-blocking, question, and evidence-gap findings;
4. revise the artifacts once from accepted findings;
5. implement vertical, evidence-producing slices until bootstrap acceptance.

After bootstrap acceptance:

1. resume the remaining skill-group comparisons using the accepted Pi-first tooling where appropriate;
2. read all candidate specs together;
3. reconcile shared workflow, artifact, review, execution, and eval contracts;
4. revise or supersede this draft where later evidence changes direction;
5. perform one formal architecture/artifact review across the final set;
6. write a master implementation plan or coordinated plan set for deferred work;
7. implement remaining portability and acceptance scope in vertical slices.

## Change Log

- 2026-07-10: Incorporated the bounded four-lens bootstrap review. Split bootstrap from full-target acceptance, defined evidence classes, required enforceable Pi tool-root isolation, tightened caching/repeats/budgets, and expanded independent bootstrap evidence.
- 2026-07-10: Changed implementation timing after owner decision. Foundational bootstrap implementation now precedes the remaining skill-pack comparison; broader portability work remains subject to final cross-skill synthesis.
