# Skill Authoring And Evaluation V2 Bootstrap Acceptance

Date: 2026-07-11
Current tooling revision: `fd46d3b4a4f5cf7c97ba6eb8fb7f20c4d4621c54`
Behavioral result revision: `7e6767e5ce12c297097c46680873b994bab11e21`

## Decision

Tooling accepted for constrained Pi-first dogfooding. `write-skill` and `evaluate-skill` remain Unverified v2 candidates.

This report does not claim Production-Ready status, batching, cache, resume, concurrency, multi-turn execution, cross-host support, or migration of prototype evidence.

## Public Interface

`skill-eval` exposes only:

- `doctor`
- `init --skill <name>`
- `evaluate --skill <name> --case <id> --timeout-ms <n> --output-limit-bytes <n>`

Model work additionally requires provider, model, thinking, and per-process turn limits. `--plan-only` makes zero provider requests. Model execution requires `--owner-approved`; `--expect-plan` binds execution to the approved fingerprint.

One invocation evaluates one whole case. Variants and semantic adjudication run serially. There is no cache, batching, resume, retry command, concurrency, adaptive repeat, partial reuse, caller-managed grading, or standalone report lifecycle.

A trustworthy behavioral failure may publish `complete`. Infrastructure failure publishes no result and may publish diagnostics. Successful atomic rename is the publication commit point. Whole-case reruns start from the beginning.

## Retained Trust Boundaries

- Every settled subject and semantic process enters an append-only accounting ledger once.
- Usage, requests, turns, tool calls, tokens, and cost derive only from settled executions.
- Subject resources and fixtures are fingerprint-bound and revalidated before provider work.
- Only declared subject resources are materialized.
- Nested symlinks and evidence-path traversal are rejected.
- Result bundles are inventoried, integrity-checked, and atomically published.
- Case-source, fixture, subject, evaluator, and semantic identities participate in the plan fingerprint and result provenance.
- Pi JSON cumulative update snapshots are compacted before the retained-evidence output limit. Raw transport has a separate 128 MiB safeguard.
- Retained-output and raw-transport failures remain distinct and both make the case incomplete.

## Deleted Or Deferred Prototype Scope

Deleted from the v2 public/runtime path:

- cache and cache-age policy;
- waves, scheduler, concurrency, resume, retry, and partial reuse;
- adaptive repeats and candidate-only reruns;
- standalone `plan`, `run`, `grade`, and `report` commands;
- unenforced wave/run schemas.

Deferred:

- stateful multi-turn execution;
- Pi RPC;
- cross-host support;
- output-router composition;
- batching, cache, resume, concurrency, and historical-evidence migration.

Historical prototype runs remain documentary only.

## Deterministic Verification

Commands and outcomes:

- `node --test .skill-eval/write-skill/tests/*.test.mjs .skill-eval/evaluate-skill/tests/*.test.mjs` — 87 tests passed, zero failures/skips.
- `node skills/write-skill/scripts/skill-author.mjs validate skills/write-skill` — valid, no warnings.
- `node skills/write-skill/scripts/skill-author.mjs validate skills/evaluate-skill` — valid, no warnings.
- Author `init`, `validate`, and `inspect` temporary-root smoke tests — passed.
- Evaluator `doctor`, `init`, and host-free `evaluate` temporary-root smoke tests — passed.
- Legacy lifecycle absence, syntax, diff, and `.freeflow/config.json` checks — passed.

Review history:

- Rebuilt implementation pass 1: four trust-boundary blockers, accepted and fixed.
- Narrow pass 2: all four closed; one non-blocking overlapping-resource declaration edge case remains fail-closed.
- Terminal transport pass 3: one accounting blocker, fixed by parent deterministic verification; no fourth implementation review requested.
- A later acceptance-review attempt exposed an off-by-one provider-limit guard defect. `fd46d3b` fixed it and the full 87-test deterministic suite passed. Successful behavioral results predate this fix; none reached the hard turn limit.
- Two broad direct-Pi acceptance reviews produced invalid evidence: one reached its turn limit and one timed out. Their partial outputs were not adjudicated as reviews.
- A bounded no-tool interface/security review requested five specific source seams; one evidence-only follow-up closed them and passed.
- A bounded no-tool raw-evidence/readiness review passed and accepted the constrained Pi-first readiness statement.

Review evidence:

- `/tmp/freeflow-re-review-20260711/final.md`
- `/tmp/freeflow-re-review-20260711/pass2/final.md`
- `/tmp/freeflow-transport-review-20260711/final.md`
- `/tmp/freeflow-acceptance-reviews/bounded-interface/final.md` — initial bounded review, Needs evidence
- `/tmp/freeflow-acceptance-reviews/bounded-interface-followup/final.md` — evidence follow-up, Pass
- `/tmp/freeflow-acceptance-reviews/bounded-readiness/final.md` — readiness review, Pass

Bounded review SHA-256 values:

- interface: `3bbda63d6776daa1a92422e4ca6210c1033e5bafcd88353b872f6ba209f3f707`
- interface follow-up: `6ba21b77209c3fed0b5b441144524339b5ccbce935b2641041ba421021ec7cbf`
- readiness: `d930b72c0830c128397c52ba390f3fb66ac513cf10706d236eceee6a4bdf6c2a`

## Selected Case Evidence

All result bundles below passed integrity verification.

### `write-skill`

| Case | Category | Verdict | Requests | Cost USD | Result |
|---|---|---:|---:|---:|---|
| WSK2-001 | differentiating pressure/readiness | improved | 16 | 0.255613 | `.skill-eval/write-skill/runs/evaluations/20260711134834793-wsk2-001-ed4b40ed38/result.json` |
| WSK2-002 | Draft/Unverified behavior | same | 13 | 0.190445 | `.skill-eval/write-skill/runs/evaluations/20260711135238464-wsk2-002-823671448e/result.json` |
| WSK2-003 | positive activation | pass | 2 | 0.040575 | `.skill-eval/write-skill/runs/evaluations/20260711135617179-wsk2-003-e45efca4c5/result.json` |
| WSK2-004 | near-miss activation | pass | 1 | 0.005340 | `.skill-eval/write-skill/runs/evaluations/20260711135701485-wsk2-004-310642b837/result.json` |
| WSK2-005 | self-contained structure | improved | 0 | unavailable | `.skill-eval/write-skill/runs/evaluations/20260711132605043-wsk2-005-d56d6ffa8d/result.json` |

WSK2-001 differentiated on readiness honesty: reference failed and candidate passed. WSK2-002 was not differentiating because both variants behaved honestly; it still provides valid Draft/Unverified behavior evidence.

### `evaluate-skill`

| Case | Category | Verdict | Requests | Cost USD | Result |
|---|---|---:|---:|---:|---|
| ESK2-002 | artifact over prose | same | 15 | 0.145037 | `.skill-eval/evaluate-skill/runs/evaluations/20260711135732789-esk2-002-72261749a3/result.json` |
| ESK2-003 | no fake verification | pass | 7 | 0.081583 | `.skill-eval/evaluate-skill/runs/evaluations/20260711140109712-esk2-003-334f36b2a1/result.json` |
| ESK2-004 | positive activation | pass | 3 | 0.051598 | `.skill-eval/evaluate-skill/runs/evaluations/20260711140216603-esk2-004-33aeebfad8/result.json` |
| ESK2-005 | near-miss activation | pass | 1 | 0.006985 | `.skill-eval/evaluate-skill/runs/evaluations/20260711140304885-esk2-005-0a35ddea72/result.json` |
| ESK2-006 | self-contained structure | improved | 0 | unavailable | `.skill-eval/evaluate-skill/runs/evaluations/20260711132621331-esk2-006-affd0b4add/result.json` |
| ESK2-007 | unsupported multi-turn honesty | pass | 4 | 0.055540 | `.skill-eval/evaluate-skill/runs/evaluations/20260711140335887-esk2-007-0193049280/result.json` |
| ESK2-008 | user authority/eval reuse | inconclusive | 12 | 0.172828 | `.skill-eval/evaluate-skill/runs/evaluations/20260711140448436-esk2-008-486fd8c1e3/result.json` |

ESK2-008 is complete but comparison-inconclusive: two objective pairs improved, the candidate semantic result passed, and the reference semantic result remained inconclusive. It is not evidence that the candidate regressed.

ESK2-001 was intentionally non-required after it failed to differentiate the accepted behavior and was not rerun.

## Diagnostic Evidence And Reruns

Three incomplete attempts were retained only as diagnostics:

- WSK2-001 at 1 MiB retained/raw conflated output cap: `.skill-eval/write-skill/runs/diagnostics/20260711132904755-wsk2-001-0e4865c2fa/diagnostic.json`
- WSK2-001 at 8 MiB before transport compaction: `.skill-eval/write-skill/runs/diagnostics/20260711133151957-wsk2-001-9eaeadc0b3/diagnostic.json`
- ESK2-003 at the 8-turn hard limit: `.skill-eval/evaluate-skill/runs/diagnostics/20260711135909215-esk2-003-be7ec41075/diagnostic.json`

No partial evidence was resumed or reused. Each valid result came from a complete whole-case rerun with a new approved fingerprint.

The repeated WSK2-001 transport failures exposed cumulative Pi JSON snapshots. The adapter was corrected in `a276b96` and accounting was corrected in `7e6767e`. The successful WSK2-001 run observed 12.8 MiB and 23.7 MiB raw subject transport while retaining only 179 KiB and 232 KiB canonical evidence, respectively.

## Manual Direct Pi Calibration

A direct isolated Pi run matched ESK2-007 using `openai-codex/gpt-5.5`, high thinking, read-only skill access, an 8-turn limit, a 180-second timeout, an 8 MiB retained-evidence limit, and a 128 MiB transport safeguard.

Evidence: `/tmp/freeflow-manual-calibration-esk2-007/`

Outcome:

- 2 provider requests and turns;
- 1 tool call;
- no parse, timeout, turn, output, or transport failure;
- 1.80 MiB raw transport and 53 KiB retained evidence;
- cost `$0.027900`;
- skill read observed;
- final response explicitly said one-shot evidence cannot prove multi-turn memory, labeled the claim unsupported, and named RPC/interactive stateful execution as the next valid step.

This agrees with the evaluator case result.

## Usage And Spend

Selected successful paid case cost: `$1.005544`.

Incomplete diagnostic attempts: `$0.146624`.

Manual calibration: `$0.027900`.

Invalid broad acceptance-review attempts: `$1.255817`.

Bounded acceptance reviews and evidence follow-up: `$0.546045`.

Total observed cost for this acceptance sequence: `$2.981930`.

Host-free case cost is unavailable rather than reported as zero. Every paid case used a `$2.00` soft per-case ceiling; no case reached it.

## Unsupported And Deferred Capabilities

- Multi-turn evidence is unsupported in the one-shot bootstrap.
- Cross-host claims are unsupported.
- Provider requests are observed; no independent global request cap is claimed.
- The spend ceiling is checked between settled processes and may be crossed by a final process because cost arrives afterward.
- Raw transport is internally bounded; the owner-controlled output limit applies to retained canonical evidence.

## Residual Risks

- ESK2-008 remains comparison-inconclusive because the reference semantic result was unresolved, although the candidate passed every fixed assertion.
- Ancestor/descendant overlap in declared subject resources fails closed with an identity mismatch instead of a preflight validation error.
- Real evidence covers one Pi provider/model combination only.
- No stateful multi-turn or cross-host behavior was exercised.
- High-thinking Pi JSON transport remains large before compaction and relies on the 128 MiB internal safeguard.

## Readiness Effect

The evidence supports constrained Pi-first dogfooding of the reduced one-case evaluator and the two v2 skill candidates. It does not support Production-Ready status.

Proposed readiness statement:

> Tooling accepted for constrained Pi-first dogfooding. `write-skill` and `evaluate-skill` remain Unverified v2 candidates.
