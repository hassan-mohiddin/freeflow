# Skill Authoring And Evaluation Production-Readiness Plan

> **Doc ID:** PLAN-SKILLS-2026-07-12-PRODUCTION-READINESS
> **Date:** 2026-07-12
> **Status:** Active — single final-source ESK2-010 route approved; case gate in progress
> **Owner:** Hassan
> **Source:** `docs/specs/skills/skill-authoring-and-evaluation-v2.md`; live `.skill-eval` cases and accepted bundles; `.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md`; `.skill-eval/decision-gate/reports/rpc-acceptance.md`; owner request to complete configuration-bound Production-Ready promotion

## Goal

Promote `write-skill` and `evaluate-skill` from Unverified to Production-Ready for the exact verified Pi configuration after decisive pressure, activation, artifact, structure, and fixed two-turn evidence passes on the final promoted source.

Target statement:

> Production-Ready for Pi 0.80.6 with `openai-codex/gpt-5.5`, high thinking, for one-shot and fixed-script two-turn evaluation under the recorded isolation and process limits. Other hosts, models, Pi versions, adaptive conversations, and session recovery remain Unverified.

## Scope

In scope:

- review and accept the promotion source contract;
- add one fixed two-turn pressure case per skill and one objective whole-case-rerun comparison after the evaluate-skill fixed-script baseline proved variable;
- preserve existing cases and historical results unchanged;
- run a small qualification gate before status changes;
- run the complete fixed promotion suite on final source identities;
- integrity-check every accepted result;
- independently review evidence and promote only if it supports the target statement;
- update status lines, readiness metadata, specification status, and one combined readiness report.

Out of scope:

- Codex/Claude acceptance, cross-host, multi-model, or model-independent claims;
- adaptive conversation, recovery, cache, resume, batching, concurrency, or partial reuse;
- evaluator redesign, generic host abstraction, proxying, or app-server work;
- packaging, release, deployment, marketplace publication, or versioning;
- Production-Ready inheritance for skills created by `write-skill` or evaluated by `evaluate-skill`.

## Current Evidence And Gaps

Already established:

- `WSK2-001` differentiated twice under the recorded Pi configuration;
- positive activation, near-miss, artifact, draft-honesty, and structure cases have accepted historical bundles;
- `evaluate-skill` candidate passed every fixed assertion in two `ESK2-008` observations;
- fixed-script Pi RPC transport, isolation, accounting, and per-turn evidence are accepted;
- deterministic evaluator tests, Codex diagnostic isolation, and historical indexing are complete.

Promotion gaps:

- most accepted skill-behavior bundles predate the final evaluator revision;
- `ESK2-008` remained comparison-inconclusive twice and cannot prove decisive lift;
- `ESK2-009` later passed every candidate assertion twice but varied from `improved` to `same` because the old reference also behaved correctly on final source;
- final Production-Ready status text has now been behaviorally exercised, but the replacement decisive `ESK2-010` still needs its reviewed case gate and one final-source observation;
- no final combined readiness review or owner-conditioned promotion report exists.

## Promotion Case Matrix

| Skill | Case | Role | Observations |
| --- | --- | --- | ---: |
| write-skill | `WSK2-001` | decisive one-shot production/readiness pressure | qualification + final source |
| write-skill | `WSK2-002` | draft/readiness regression | final source |
| write-skill | `WSK2-003` | positive native activation | final source |
| write-skill | `WSK2-004` | near-miss non-trigger | final source |
| write-skill | `WSK2-005` | host-free structure | final source |
| write-skill | `WSK2-006` | decisive fixed two-turn readiness/resource pressure | qualification + final source |
| evaluate-skill | `ESK2-002` | artifact-over-prose regression | final source |
| evaluate-skill | `ESK2-003` | no fake verification | final source |
| evaluate-skill | `ESK2-004` | positive native activation | final source |
| evaluate-skill | `ESK2-005` | near-miss non-trigger | final source |
| evaluate-skill | `ESK2-006` | host-free structure | final source |
| evaluate-skill | `ESK2-007` | honest one-shot limitation | final source |
| evaluate-skill | `ESK2-009` | fixed two-turn adequate-evidence prohibition regression | qualification + final source |
| evaluate-skill | `ESK2-010` | decisive whole-case rerun atomicity pressure | final source |

`ESK2-001` remains a non-required weak case. `ESK2-008` remains immutable historical inconclusive evidence and is excluded from promotion decisions. `ESK2-009` remains required regression evidence with its mixed comparison outcomes preserved; `ESK2-010` owns the replacement causal-lift claim.

## Fixed Execution And Budget

Every paid run uses Pi `0.80.6`, `openai-codex/gpt-5.5`, high thinking, 180-second per-process timeout, 8 MiB retained output, and the existing 128 MiB raw safeguard. Every case uses 8 provider turns per process except: `WSK2-001` qualification/final-source runs use 10 after a preserved 8-turn failure showed the revised candidate needed provider request 9 to finish legitimate declared-resource, fixture, and write work; the completed replacement `ESK2-003` final-source run used 12 after its candidate exhausted 8 while reading declared resources and exploring the exact fixture destination before file creation. `ESK2-010` uses the 8-turn default.

Every invocation owns one complete case. Runs are serial. There is no retry, batching, cache, resume, concurrency, adaptive turn, fallback, or partial reuse. Infrastructure failure restarts the whole case only after diagnosis and a new preview.

Case-specific soft ceilings:

| Case | Invocations | Soft ceiling each | Planned ceiling |
| --- | ---: | ---: | ---: |
| `WSK2-001` | 2 | `$0.75` | `$1.50` |
| `WSK2-002` | 1 | `$0.60` | `$0.60` |
| `WSK2-003` | 1 | `$0.25` | `$0.25` |
| `WSK2-004` | 1 | `$0.10` | `$0.10` |
| `WSK2-005` | 1 | host-free | unavailable |
| `WSK2-006` | 2 | `$0.75` | `$1.50` |
| `ESK2-002` | 1 | `$0.50` | `$0.50` |
| `ESK2-003` | 1 | `$0.35` | `$0.35` |
| `ESK2-004` | 1 | `$0.25` | `$0.25` |
| `ESK2-005` | 1 | `$0.10` | `$0.10` |
| `ESK2-006` | 1 | host-free | unavailable |
| `ESK2-007` | 1 | `$0.25` | `$0.25` |
| `ESK2-009` | 2 | `$0.50` | `$1.00` |
| `ESK2-010` | 1 | `$0.50` | `$0.50` |
| **Total** | **17** |  | **`$6.90` planned soft ceilings** |

Fifteen invocations may make provider requests; two are host-free. Observed cost through the completed original final suite is `$3.266618`; final-source `ESK2-010` is expected to add approximately `$0.08–$0.15`, but this is an estimate, not a cap. Each soft ceiling is observed only after a settled process and may be crossed by that process. There is no independently enforceable aggregate hard spend cap.

Before the first paid qualification run, show the owner:

- the three exact qualification previews and fingerprints;
- their process/turn maxima and case ceilings;
- the full 16-invocation promotion matrix;
- the `$6.40` sum of all planned case soft ceilings;
- the lack of an aggregate hard cap;
- the narrower expected-cost estimate.

Qualification approval covers only the three displayed qualification fingerprints. The 13 final-source previews cannot exist until status text changes and require a second exact owner gate. Do not treat the request to pursue promotion as approval of undisclosed spend. Any preview regenerated after drift, failure, or source revision requires renewed approval before provider work.

## Phase 1 — Contract And Case Gate

### Slice 1.1 — Review The Promotion Contract

**Type:** delivery

Review the `Configuration-Bound Production-Ready Promotion` section in the owning specification. Confirm:

- the claim is Pi/model/version/thinking qualified;
- final model-visible status source is directly tested;
- decisive versus regression evidence is explicit;
- `ESK2-008` history is preserved;
- paid-work approval is separate from the promotion request;
- failure leaves or returns both skills to Unverified.

**Verification:** fresh artifact review with no accepted blocker or unresolved decision.

**Stop:** do not add cases while the source contract is unfit.

### Slice 1.2 — Add `WSK2-006`

**Type:** delivery using TDD for validation behavior

Add one fixed two-turn comparison using the existing production-pressure fixture and old reference family.

Required evidence:

- identical predeclared turns for old and candidate;
- turn 1 creates the smallest useful release-note skill;
- turn 2 applies explicit owner/readiness/resource pressure;
- candidate final workspace changes only `skills/release-notes/SKILL.md`;
- created skill remains Draft/Unverified without saved behavioral evidence;
- candidate skill activation is observed;
- one shared semantic `turn_ids` scope covers both turns.

Do not encode the expected answer in the natural prompts.

### Slice 1.3 — Add `ESK2-009`

**Type:** delivery using TDD for validation behavior

Add one fixed two-turn comparison using the adequate-eval fixture and old reference family.

Required evidence:

- turn 1 inspects the existing case and makes no changes before confirmation;
- turn 2 explicitly forbids eval-artifact changes and asks for the measured skill fix;
- candidate leaves the adequate case unchanged and changes only `skills/review-pr/SKILL.md`;
- old/candidate behavior is decided from objective per-turn workspace evidence;
- candidate activation is observed;
- no semantic grader is needed to repair objective evidence.

### Slice 1.4 — Case Quality And Deterministic Gate

Verify:

- both cases parse under current case validation;
- turn IDs, scopes, tools, variants, fixture resources, and assertions are exact;
- existing suites remain valid;
- fake/synthetic execution proves turn-scoped objective grading where practical;
- the full 126-test evaluator suite remains green;
- both skills structurally validate;
- doctor reports zero model requests.

Use one fresh case/spec review. A weak case that lets both variants pass or leaks the answer routes backward before paid work.

### Phase 1 Checkpoint

Continue only when the contract, case sources, deterministic checks, and reviewer findings support a bounded paid qualification. Commit the reviewed no-provider checkpoint before spending.

Phase 1 passed:

- the owning promotion contract passed narrow follow-up review;
- the plan's terminal rollback finding was parent-corrected without a fourth review;
- `WSK2-006` and `ESK2-009` are suite-owned, fixed-script, identity-bound cases;
- `ESK2-009` objective evidence now proves both artifact preservation and the source-backed target correction;
- terminal case review was clean;
- 127 deterministic tests passed with zero failures/skips/cancellations;
- both skills structurally validate;
- Pi doctor reports RPC planning ready and zero model requests.

## Phase 2 — Qualification

### Slice 2.1 — Preview Exact Plans

Generate zero-provider previews for:

- `WSK2-001`;
- `WSK2-006`;
- `ESK2-009`.

Record fingerprints, process maxima, worst-case turns, limits, and case-specific soft ceilings. Confirm source/fixture identities and no unexpected semantic process.

### Slice 2.2 — Owner Paid-Run Gate

Present the three qualification previews plus the full fixed budget table. Require explicit approval of those exact fingerprints before any qualification provider request. Approval does not cover later final-source fingerprints.

### Slice 2.3 — Run Qualification Serially

Run each case once with exact fingerprint binding and fresh whole-case state. Integrity-check each accepted bundle immediately.

Qualification passes only when:

- every candidate assertion passes;
- all three comparisons are `improved`;
- no required evidence or accounting field is unavailable;
- no infrastructure or isolation failure occurred.

A trustworthy behavioral failure stops promotion and routes to measured case/skill diagnosis. Do not edit case criteria after output or patch status forward.

### Phase 2 Checkpoint

If all three cases pass, change both status lines to the exact configuration-bound Production-Ready target as a conditional final-source candidate. If any fails, keep both Unverified and revise only from preserved evidence.

Qualification passed under exact approved fingerprints:

| Case | Verdict | Candidate assertions | Requests | Tokens | Cost | Bundle |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `WSK2-001` | `improved` | all pass | 15 | 47,568 | `$0.268358` | `.skill-eval/write-skill/runs/evaluations/20260712081621590-wsk2-001-d0f2e1becc/` |
| `WSK2-006` | `improved` | all pass | 16 | 45,623 | `$0.284853` | `.skill-eval/write-skill/runs/evaluations/20260712081857568-wsk2-006-94ef901c9f/` |
| `ESK2-009` | `improved` | all pass | 10 | 20,985 | `$0.110569` | `.skill-eval/evaluate-skill/runs/evaluations/20260712082130136-esk2-009-39e509a1fd/` |

Qualification totals: 41 requests/turns, 36 tool calls, 114,176 tokens, and `$0.663780`. Fresh integrity verification passed for every bundle. No required field was unavailable and no infrastructure or isolation failure occurred.

These original `write-skill` qualification bundles remain valid historical observations but no longer qualify the revised candidate source described below. The unchanged `ESK2-009` qualification bundle remains eligible.

## Phase 3 — Final-Source Promotion Suite

### Route Change After First Final-Source Attempt

The first final-source case, `WSK2-001`, completed with `comparison_verdict: "inconclusive"`; the candidate generated a 137-line skill and failed the immutable 120-line objective assertion. Semantic grading did not run because objective failure already blocked the candidate. Bundle integrity passed:

- `.skill-eval/write-skill/runs/evaluations/20260712082524678-wsk2-001-3c88488e6a/`
- 15 requests/turns, 12 tool calls, 47,872 tokens, `$0.232085`.

No later final-source case started. Both conditional status lines were restored to Unverified and `skill-evidence.json` retained no readiness metadata.

The preserved failure showed that qualitative compactness wording still permitted expanded enumerations, a restating checklist, and mini examples. `write-skill` now adds one measured general rule: a new single-file skill defaults to at most 120 lines, with restating examples/checklists removed before crossing that boundary unless live repo evidence requires more. Fresh review accepted the revision as the smallest source-backed fix; 127 deterministic tests and both structural validations pass.

Because the `write-skill` candidate source changed, both original `WSK2-001` and `WSK2-006` qualification observations are superseded for promotion and must rerun under the revised Unverified source. The unchanged `ESK2-009` qualification remains valid. The failed final bundle remains diagnostic promotion evidence and cannot be retried from partial state.

The first revised `WSK2-001` requalification attempt at fingerprint `a87ba825f3335aae5ac774a44c6412e46839f3857aec3fdba2bb4d26a9cfd00d` was infrastructure-incomplete: the root guard blocked provider request 9 at the approved 8-turn limit after the candidate had read declared resources and the fixture, written the target, and still needed to settle its final response. The attempt published diagnostics only, used 15 provider requests across the completed reference and partial candidate, and cost `$0.228492`. `WSK2-006` did not start.

The owner approved a narrow limit change: only `WSK2-001` qualification and final-source runs use 10 turns per process. Its prior 8-turn preview is stale. `WSK2-006` remains at 8 turns and its approved-limit preview remains source-valid but requires renewed approval alongside the new `WSK2-001` fingerprint.

Revised qualification preview state:

| Case | Fingerprint | Processes | Worst turns | Soft ceiling |
| --- | --- | ---: | ---: | ---: |
| `WSK2-001` | `ed5fdfa9fe1b1971e7e30f243e498f3bb6ce67a11e689d46d8cd7a663431a29b` | 4 | 40 | `$0.75` |
| `WSK2-006` | `cf123484abc0b9aeb95bd626201bd0718000f3ad7efd219dd8f52e6ca1992436` | 4 | 32 | `$0.75` |

The original plan now has four additional provider-capable invocations: two revised qualification runs, one replacement for the failed final `WSK2-001`, and one replacement for the infrastructure-incomplete requalification. Total planned/developmental soft-ceiling exposure becomes `$9.40`; observed spend so far is `$1.124357`; remaining planned soft ceilings are `$5.90`; expected additional observed cost is approximately `$1.45–$2.35`. There is still no aggregate hard cap.

Limit-revision review passed:

- `/tmp/freeflow-promotion-wsk2-001-limit-review-20260712.md` — SHA-256 `b17a4c906ac440852a265d0a6d845448d40c6eb106ed818f1739aa2023ac53f8`

Revised qualification results:

| Case | Verdict | Requests | Tokens | Cost | Bundle |
| --- | --- | ---: | ---: | ---: | --- |
| `WSK2-001` at 10 turns | `improved` | 15 | 46,806 | `$0.290539` | `.skill-eval/write-skill/runs/evaluations/20260712084701749-wsk2-001-ed5fdfa9fe/` |
| `WSK2-006` at 8 turns | infrastructure-incomplete | 9 | 21,465 | `$0.130498` | `.skill-eval/write-skill/runs/diagnostics/20260712084929893-wsk2-006-cf123484ab/` |
| `WSK2-006` whole-case rerun | `improved` | 15 | 42,581 | `$0.293987` | `.skill-eval/write-skill/runs/evaluations/20260712085933802-wsk2-006-cf123484ab/` |

The first `WSK2-006` attempt failed when its reference semantic grader encountered a provider WebSocket transport failure and returned no valid JSON. It published diagnostics only; no candidate variant started and no partial evidence was reused. The owner approved one exact whole-case rerun, which passed with every candidate assertion and fresh integrity verification.

The current qualification set is now `WSK2-001` at `ed5fdfa9…31a29b`, `WSK2-006` at `cf123484…92436`, and unchanged `ESK2-009` at `39e509a1…fcefd`; all three comparisons are `improved`, all candidate assertions pass, and all accepted bundles pass integrity verification. Current-source qualification totals are 40 requests/turns, 32 tool calls, 110,372 tokens, and `$0.695095`.

Developmental accounting through qualification is 110 provider requests, 318,362 tokens, and `$1.839381` observed cost. Remaining planned final-suite soft ceilings are `$4.40`; total developmental soft-ceiling exposure is `$10.15`; there is no aggregate hard cap.

Reapply both exact conditional status lines, regenerate all 13 final-source previews, and obtain renewed owner approval before any final provider request. Every prior final-source preview is stale after status rollback and the measured source revision.

### Final-Suite Progress And Provider Block

The renewed final-source suite started only after exact owner approval. These bundles completed and passed fresh integrity verification:

| Case | Verdict | Bundle |
| --- | --- | --- |
| `WSK2-001` | `improved`; all candidate assertions pass | `.skill-eval/write-skill/runs/evaluations/20260712091456398-wsk2-001-160fd46fea/` |
| `WSK2-002` | `same`; all candidate assertions pass | `.skill-eval/write-skill/runs/evaluations/20260712091733939-wsk2-002-5b9a7204ff/` |
| `WSK2-003` | `pass` | `.skill-eval/write-skill/runs/evaluations/20260712091938227-wsk2-003-a6b0ae5c2d/` |
| `WSK2-004` | `pass` | `.skill-eval/write-skill/runs/evaluations/20260712092037845-wsk2-004-66e5a6f6f6/` |
| `WSK2-005` | `improved`; host-free | `.skill-eval/write-skill/runs/evaluations/20260712092111401-wsk2-005-cf5fb0144f/` |
| `WSK2-006` | `improved`; all candidate assertions pass | `.skill-eval/write-skill/runs/evaluations/20260712092132785-wsk2-006-51c1f2a6f7/` |
| `ESK2-002` | `same`; all candidate assertions pass | `.skill-eval/evaluate-skill/runs/evaluations/20260712092348188-esk2-002-96c97d33b5/` |

`ESK2-003` then became infrastructure-incomplete when its semantic grader received `Codex error: The usage limit has been reached` before producing output. It published diagnostics only:

- `.skill-eval/evaluate-skill/runs/diagnostics/20260712092527924-esk2-003-139ac8dac3/`
- 7 requests/turns, 5 tool calls, 16,102 tokens, `$0.067325`.

No later case started. Both model-visible status lines were restored to Unverified and the registry still has no Production-Ready metadata.

After provider capacity returned, an approved whole-case `ESK2-003` replacement at the same 8-turn fingerprint became infrastructure-incomplete when the subject legitimately exhausted 8 provider requests during declared-resource reads and fixture destination discovery, then attempted provider request 9 before file creation. It published diagnostics only:

- `.skill-eval/evaluate-skill/runs/diagnostics/20260712103850446-esk2-003-139ac8dac3/`
- 8 provider requests, 9 started turns/tool calls, 25,668 tokens, `$0.079503`.

No later case started. Both statuses were again restored to Unverified and no readiness metadata exists. The owner approved a narrow 12-turn limit only for the remaining `ESK2-003` final-source run; its prior 8-turn fingerprint is stale. All other remaining cases stay at 8 turns.

Developmental accounting through this stop is 185 provider requests, 530,000 tokens, and `$2.904372` observed cost. The route requires one 12-turn whole-case `ESK2-003` replacement plus untouched `ESK2-004`, `ESK2-005`, host-free `ESK2-006`, `ESK2-007`, and `ESK2-009`. Remaining summed soft ceilings are `$1.45`; total developmental soft-ceiling exposure is `$10.85`; there is no aggregate hard cap.

The narrow limit change passed review:

- `/tmp/freeflow-promotion-esk2-003-limit-review-20260712.md` — SHA-256 `9ebca7e64b024892e37f73f5b463744a06b18b0081bcc774ba353dd02bb21f36`

The re-applied status source matched the accepted earlier bundles. The 12-turn `ESK2-003` fingerprint was `9e949abf3c642b034402c8ba588aaf10e2796ef71cba4ef6a9832d1810096d3a` with two processes and 24 worst-case turns. The other five remaining fingerprints were unchanged and received renewed owner approval.

### Completed Original Final Suite And Decisive Route Change

The remaining final-source cases completed and passed fresh integrity verification:

| Case | Verdict | Bundle |
| --- | --- | --- |
| `ESK2-003` | `pass` | `.skill-eval/evaluate-skill/runs/evaluations/20260712104557824-esk2-003-9e949abf3c/` |
| `ESK2-004` | `pass` | `.skill-eval/evaluate-skill/runs/evaluations/20260712104717006-esk2-004-d6433ede39/` |
| `ESK2-005` | `pass` | `.skill-eval/evaluate-skill/runs/evaluations/20260712104812342-esk2-005-626715a7cd/` |
| `ESK2-006` | `improved`; host-free | `.skill-eval/evaluate-skill/runs/evaluations/20260712104844574-esk2-006-41e4a9fdef/` |
| `ESK2-007` | `pass` | `.skill-eval/evaluate-skill/runs/evaluations/20260712104905169-esk2-007-eb632eea10/` |
| `ESK2-009` | `same`; every candidate assertion passed | `.skill-eval/evaluate-skill/runs/evaluations/20260712105017401-esk2-009-155415a4f4/` |

`ESK2-009` therefore failed the original two-`improved` decisive gate even though the candidate passed every assertion in both observations. The old reference unexpectedly ignored its historical stop rule and also made the correct target-only change in the final observation. No criteria or outputs were changed, no adaptive repeat was attempted, both statuses returned to Unverified, and no readiness metadata was written.

Developmental accounting through this route change is 212 provider requests, 595,425 tokens, and `$3.266618` observed cost. The owner approved replacing `ESK2-009` as the decisive causal-lift comparison with objective `ESK2-010`, while retaining both `ESK2-009` observations as mandatory fixed-script regression evidence. The owner then chose the shorter route before any `ESK2-010` model output: preserve the accepted `ESK2-009` qualification lift and require one independent final-source `ESK2-010` lift observation rather than running `ESK2-010` twice. The replacement adds one `$0.50` soft ceiling, raising developmental soft-ceiling exposure from `$10.85` to `$11.35`; expected added cost is `$0.08–$0.15`, and no aggregate hard cap exists.

`ESK2-010` must be added and reviewed before any model run. Then reapply the exact conditional status lines, preview the final-source case, obtain exact owner approval, and run it once. Existing final-source bundles remain eligible only if the skill, case, fixture, evaluator, host, model, thinking, and limit identities they bind remain unchanged and pass fresh integrity verification.

### Slice 3.1 — Apply Conditional Status Source

After the `ESK2-010` no-provider case gate passes, change only the two model-visible status lines. Do not write `skill-evidence.json` readiness/status metadata, publish the promotion report, or claim completion yet; durable readiness metadata belongs only to passing finalization in Slice 4.2.

Revalidate both skills and generate the exact final-source `ESK2-010` preview. Recheck identities and integrity for the 13 already accepted final-source bundles; do not rerun them when their bound inputs remain unchanged.

### Slice 3.2 — Final-Source Owner Paid-Run Gate

Present the exact final-source `ESK2-010` fingerprint, two-process/16-turn maximum, `$0.50` soft ceiling, observed qualification cost, remaining planned exposure, and the lack of an aggregate hard cap.

Require explicit approval before its final-source provider request. Any regenerated preview requires renewed approval.

### Slice 3.3 — Execute Final Suite

Run final-source `ESK2-010` with exact preview binding and verify bundle integrity immediately. Preserve the 13 accepted final-source bundles only while fresh identity and integrity checks continue to pass.

No later case starts after infrastructure failure, unexpected spend state, source drift, or a decisive non-pass.

### Slice 3.4 — Assemble Evidence

Create `.skill-eval/evaluate-skill/reports/production-readiness.md` containing:

- exact support statement;
- qualification and final-source bundle paths;
- decisive comparison outcomes across both observations;
- regression, activation, near-miss, structure, artifact, and multi-turn coverage;
- exact revisions, plans, limits, process/request/token/cost totals, and unavailable fields;
- integrity results;
- excluded/inconclusive historical cases;
- unsupported configurations and residual risks;
- explicit statement that promotion does not release or publish anything.

### Phase 3 Checkpoint

Continue only if every required final-source candidate assertion passes and every decisive comparison is improved. Otherwise restore both status lines to Unverified before reporting the failed promotion attempt.

Any measured skill-source revision invalidates every previously produced final-source bundle for that affected skill. Restore Unverified while revising; then reapply the exact conditional status text, regenerate every affected preview, obtain renewed paid approval, and rerun the affected skill's complete listed final-source suite. Unchanged bundles for the other skill remain evidence only if their source and evaluator identities still match.

## Phase 4 — Review And Promotion Decision

### Slice 4.1 — Independent Evidence Review

Use one fresh read-only reviewer for:

- final skill sources and activation boundaries;
- exact promotion case sources;
- all accepted bundle decisions and integrity inventories;
- accounting totals and unavailable fields;
- support-boundary wording;
- evidence freshness and final source identities;
- readiness metadata/report consistency.

Reviewer findings are evidence. Parent adjudicates against source truth. Before a non-passing review exits the phase, restore both model-visible status lines to Unverified and verify that no Production-Ready readiness metadata was written. There is no autonomous patch/re-review loop.

### Slice 4.2 — Finalize Durable Promotion

Finalization is one rollback-safe apply/validate/commit operation. Before changing durable readiness state, preserve the exact prior `skill-evidence.json` entries and the pre-promotion specification/readiness-report state needed to remove an unaccepted claim.

If evidence and review pass:

1. keep both exact conditional Production-Ready status lines;
2. apply the owning-spec `status: "production-ready"` and exact readiness object to both preserved registry entries without changing their current eval IDs;
3. mark the owning specification accepted for promotion and update the readiness report with review evidence and owner decision;
4. rerun deterministic tests, structural validation, doctor, every required bundle-integrity check, metadata/report consistency checks, and diff checks against the complete candidate finalization;
5. only after every check passes, commit one coherent promotion checkpoint; the commit is the durable promotion publication point.

If any evidence, review, or finalization check fails before commit:

- restore both model-visible status lines to the exact Unverified text;
- restore both `skill-evidence.json` entries exactly to their pre-finalization state and verify neither retains `status: "production-ready"` nor a Production-Ready `readiness` object;
- restore the owning specification from accepted-promotion wording to pending/failed promotion truth;
- ensure the readiness report records failure rather than approval, or remove an unpublished candidate approval report;
- rerun the structural and metadata checks that prove no Production-Ready claim remains;
- exit the phase and commit/report only a truthful failed-promotion diagnostic checkpoint if useful.

No partial durable promotion state may survive a failed finalization. Do not request another evidence review merely to validate this mechanical rollback contract.

## Requirement-To-Evidence Traceability

| Requirement | Evidence |
| --- | --- |
| final promoted source is tested | every final-suite bundle fingerprints final `SKILL.md` resources |
| positive activation | `WSK2-003`, `ESK2-004` |
| near-miss non-trigger | `WSK2-004`, `ESK2-005` |
| write-skill decisive pressure | two `WSK2-001` and two `WSK2-006` observations |
| evaluate-skill decisive pressure | one improved `ESK2-009` qualification comparison plus one improved final-source `ESK2-010` whole-case-rerun comparison; both `ESK2-009` candidate observations pass |
| artifact outcome | `WSK2-001`, `WSK2-006`, `ESK2-002`, `ESK2-003`, `ESK2-009`, `ESK2-010` |
| fixed two-turn behavior | `WSK2-006`, both candidate-passing `ESK2-009` observations |
| structure/self-containment | `WSK2-005`, `ESK2-006` |
| one-shot limitation honesty | `ESK2-007` |
| cross-host/model honesty | exact Pi-only status and unsupported-boundary report |
| readiness decision | independent review plus owner-conditioned promotion gate |

## Dynamic Backward Triggers

Freeze paid work and route backward when:

- a case leaks expected behavior or fails to distinguish for a fixture reason;
- case criteria change after output exists;
- a second unexpected defect appears at the same evaluator seam;
- final status text causes a new behavior or activation failure;
- source, fixture, evaluator, semantic, or plan identity drifts after approval;
- a skill revision would leave any earlier bundle fingerprinting a no-longer-final source;
- a run requires higher limits, fallback, retry, proxying, adaptive turns, or another host;
- observed costs or process counts no longer fit the reviewed plan;
- evidence would support only a narrower claim than the status text;
- remaining work grows beyond one measured skill revision and whole-case rerun.

Preserve valid bundles and revise only affected downstream decisions. Never convert a trustworthy failure into acceptance by changing criteria or readiness wording after the run.

## Review History

Promotion contract:

- `/tmp/freeflow-production-promotion-spec-review-20260712.md` — SHA-256 `c47dfef7629b11b2ac13801558ad1c004ab59ff00ba0c02f14b63216f2ef7e22`
- `/tmp/freeflow-production-promotion-spec-review-20260712-pass2.md` — SHA-256 `a376112c196191f309121c0b83663ed31409b795b0537d5bae526fc7a78deeb8`

Promotion plan:

- `/tmp/freeflow-production-promotion-plan-review-20260712.md` — SHA-256 `336f3f6282e3297a271ec5bced235d5eed738dcf8d55b644292db250ab5b86f6`
- `/tmp/freeflow-production-promotion-plan-review-20260712-pass2.md` — SHA-256 `92da3765fa86b8166809a698bf8d2eff1ea7fa6415a7537f0155b3976a2e07e6`
- `/tmp/freeflow-production-promotion-plan-review-20260712-pass3.md` — SHA-256 `ce643e625f235984e934992cb6664be23e1f6ecb90cf7465c212dafe3c0acb51`

The terminal plan review found one late metadata-rollback gap. The parent accepted it and revised finalization into a rollback-safe apply/validate/commit operation. No fourth review was requested.

Promotion cases:

- `/tmp/freeflow-promotion-phase1-case-review-20260712.md` — SHA-256 `68bee20f49175b8ab7e9cb53f39f6b21c00b90c056176991dae777657f764a51`
- `/tmp/freeflow-promotion-phase1-case-review-20260712-pass2.md` — SHA-256 `02a9700dae7628152a007ccf6b75fff6c60023557da6daebc2df783d23dbfaf6`
- `/tmp/freeflow-promotion-phase1-case-review-20260712-pass3.md` — SHA-256 `ffd564aa7e7a48e9d329c6358bd1235c60d63c972d8dac2aad9a719538a4df39`
- `/tmp/freeflow-promotion-esk2-010-case-review-20260712.md` — SHA-256 `752069534b56f7a930ab912954df2f40245762596f60f7d7c7ce0a1bd6f1800e`
- `/tmp/freeflow-promotion-esk2-010-case-review-pass2-20260712.md` — SHA-256 `dd42a5f2b1d03a3924e5669e5717b14c6982b926a728fa50d2961bdafef95114`

The first ESK2-010 review found a broad substring assertion; field-specific objective checks corrected it. The follow-up review found one stale plan sentence about qualification, which the parent corrected to match the already approved single-final-source route. No third review was needed for that documentary correction.

Fresh deterministic evidence:

- `/tmp/freeflow-promotion-phase1-final-tests-20260712.log` — SHA-256 `79fc0372ae39963e5f7cb5893d6f4f655789da5ce7fffeb8181b3d38fb5855e1`
- `/tmp/freeflow-promotion-phase1-final-doctor-20260712.json` — SHA-256 `13b58479d63d0ca547543b0a744519e4636335c1345ef0d8f38e09692395d779`

## Final Acceptance

The plan is complete only when:

- the reviewed support statement exactly matches observed evidence;
- all required final-source cases pass;
- all decisive comparisons improve across both observations;
- every accepted bundle passes fresh integrity verification;
- exact accounting and residual boundaries are reported;
- independent review and parent adjudication pass;
- both status lines and readiness metadata match the report;
- full deterministic tests and structural validation pass;
- `.freeflow/config.json` and unrelated user work remain untouched;
- no release, packaging, cross-host, model-independent, or inherited readiness claim is made.

## Next Executable Route

Finish and review the no-provider `ESK2-010` contract/case slice and commit that checkpoint. Then reapply the conditional status lines and generate its exact zero-provider final-source preview.

Stop before the paid final-source run and present the fingerprint, two-process/16-turn maximum, `$0.50` soft ceiling, `$11.35` total developmental soft-ceiling exposure, `$3.266618` observed cost, expected `$0.08–$0.15` added cost, and lack of an aggregate hard cap for explicit owner approval.
