# Evaluate Skill Composition Extension Readiness

> **Status:** Accepted — configuration-bound Production-Ready evidence
> **Date:** 2026-07-12
> **Source revision:** `615397c745ebb00dd7e2c71b8d4ebf824831be02`
> **Evaluator implementation checkpoint:** `d0bf6ee1972222a10e302a5c63f9eb3dc0ef8a82`
> **Qualification-input checkpoint:** `622fabf`
> **Previous evidence:** `.skill-eval/evaluate-skill/reports/production-readiness.md`
> **Owning contract:** `docs/specs/skills/2026-07-12-freeflow-composition-evaluation-extension.md`

## Decision

The evidence supports this bounded statement:

> Production-Ready for Pi 0.80.6 with `openai-codex/gpt-5.5`, high thinking, for the previously accepted one-skill one-shot and fixed two-turn modes plus declared Freeflow composition with one ordered immutable base stack, exactly one differing target, optional exact kernel/Workflow runtime, and one-shot or fixed two-to-four-turn execution. Other hosts, models, Pi versions, adaptive conversations, more than four scripted turns, session recovery, cache, resume, batching, concurrency, partial reuse, and uncapped execution remain Unverified or unsupported.

This claim applies to the evaluator capability. It does not make Workflow, the synthetic qualification skills, or other included Freeflow skills Production-Ready.

## Composition Qualification

| Case | Observation | Verdict | Requests | Tokens | Cost | Bundle |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `WFC2-001` | one-shot exact kernel/Workflow plus declared base/target composition | improved; all candidate assertions pass | 6 | 20,612 | `$0.069947` | `.skill-eval/workflow/runs/evaluations/20260712132227851-wfc2-001-0a4a209cd2/` |
| `WFC2-002` | four-turn state continuity, two base skills, one target, and backward-route pressure | improved; all candidate assertions pass | 30 | 126,817 | `$0.325309` | `.skill-eval/workflow/runs/evaluations/20260712132336147-wfc2-002-47a1206ace/` |

Both cases used synthetic skills to prove evaluator delivery, identity, isolation, per-component reads, per-turn evidence, and bounded execution. They are not evidence that current Workflow independently discovers the same route.

## Exact-Source Regression Coverage

| Case | Verdict | Bundle |
| --- | --- | --- |
| `WSK2-001` | improved; candidate assertions pass | `.skill-eval/write-skill/runs/evaluations/20260712132852931-wsk2-001-f592181eee/` |
| `WSK2-002` | same; candidate assertions pass | `.skill-eval/write-skill/runs/evaluations/20260712133055081-wsk2-002-47d085d85a/` |
| `WSK2-003` | pass | `.skill-eval/write-skill/runs/evaluations/20260712133225243-wsk2-003-2889492ea0/` |
| `WSK2-004` | pass | `.skill-eval/write-skill/runs/evaluations/20260712133249089-wsk2-004-95e6793caa/` |
| `WSK2-005` | improved; host-free | `.skill-eval/write-skill/runs/evaluations/20260712132602056-wsk2-005-d1e34919a7/` |
| `WSK2-006` | improved; candidate assertions pass | `.skill-eval/write-skill/runs/evaluations/20260712133258921-wsk2-006-31806c2b70/` |
| `ESK2-002` | same; candidate assertions pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712133546226-esk2-002-67f668bb2b/` |
| `ESK2-003` | pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712133709407-esk2-003-f09400fd50/` |
| `ESK2-004` | pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712133822580-esk2-004-a29a819eda/` |
| `ESK2-005` | pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712133854793-esk2-005-748cd793d9/` |
| `ESK2-006` | improved; host-free | `.skill-eval/evaluate-skill/runs/evaluations/20260712132602363-esk2-006-0c6a928420/` |
| `ESK2-007` | pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712133903788-esk2-007-6962ff4135/` |
| `ESK2-009` | improved; candidate assertions pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712133936408-esk2-009-6089d6a810/` |
| `ESK2-010` | improved; candidate assertions pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712134024284-esk2-010-9d868e50cb/` |

Every candidate assertion passed. `same` verdicts retain valid regression evidence because both reference and candidate satisfied the fixed criteria; they are not claimed as new causal-lift observations.

## Accounting

Provider-backed composition plus regression qualification:

- provider requests / turns: `137`;
- tool calls: `129`;
- tokens: `428,580`;
- cost: `$1.917456`.

Two host-free cases made zero provider requests. Their unavailable usage and cost remain unavailable rather than zero in the bundles.

The approved per-case soft ceilings totalled `$7.15` across composition and regression cases. Observed cost was lower. Soft ceilings were checked only at supported process/turn boundaries and were not an independently enforceable aggregate hard cap.

## Deterministic And Review Evidence

Before provider qualification:

- 132 evaluator tests passed;
- 4 author tests passed;
- all 26 skill structures validated;
- skill-evidence validation passed;
- Pi extension TypeScript build passed;
- Pi doctor loaded two explicit skills and the evaluator runtime extension with zero model requests;
- composition implementation review pass 2 passed with no blocker, question, or required evidence gap.

All 16 accepted qualification/regression bundles passed fresh integrity verification.

## Evidence Boundary

Established:

- exactly two serial variants and whole-case atomicity remain intact;
- one-shot and fixed two-to-four-turn composition run through isolated Pi processes;
- ordered base skills and one target are materialized read-only and fingerprinted per resource;
- runtime extension, production helper, kernel, Workflow, prompts, tools, limits, host/model, and fixture are fingerprinted;
- runtime implementation and materialized resources are rechecked before, during, and after execution;
- runtime evidence distinguishes exact context/envelope delivery from component read behavior;
- automatic compaction remains disabled during qualification; deterministic tests prove production-equivalent re-bootstrap after active marker loss;
- ambient skills, extensions, context files, packages, retry, cache, resume, batching, concurrency, and partial reuse remain disabled.

Not established:

- adaptive or model-generated follow-up behavior;
- more than four scripted user turns;
- another host, model, or Pi version;
- session recovery or resumed evaluation;
- readiness of Workflow or any skill merely included in a composition;
- model-independent behavior;
- a hard aggregate provider-request or monetary cap.

## Independent Evidence Review

Fresh independent review passed with no blocker, non-blocking finding, unresolved question, or required evidence gap. The reviewer independently confirmed all 16 bundle identities and integrity records, every candidate assertion, exact fingerprints and configuration, accounting, synthetic-composition claim boundary, current `evaluate-skill` source identity, and unsupported limits.

Review artifact:

- `.pi-subagents/artifacts/708c4c40_reviewer_0_output.md`

The evidence supports promotion using the exact bounded statement in this report.
