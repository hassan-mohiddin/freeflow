# Skill Authoring And Evaluation Production-Readiness Plan

> **Doc ID:** PLAN-SKILLS-2026-07-12-PRODUCTION-READINESS
> **Date:** 2026-07-12
> **Status:** Active — Phase 1 complete; Phase 2 previews and owner paid gate next
> **Owner:** Hassan
> **Source:** `docs/specs/skills/skill-authoring-and-evaluation-v2.md`; live `.skill-eval` cases and accepted bundles; `.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md`; `.skill-eval/decision-gate/reports/rpc-acceptance.md`; owner request to complete configuration-bound Production-Ready promotion

## Goal

Promote `write-skill` and `evaluate-skill` from Unverified to Production-Ready for the exact verified Pi configuration after decisive pressure, activation, artifact, structure, and fixed two-turn evidence passes on the final promoted source.

Target statement:

> Production-Ready for Pi 0.80.6 with `openai-codex/gpt-5.5`, high thinking, for one-shot and fixed-script two-turn evaluation under the recorded isolation and process limits. Other hosts, models, Pi versions, adaptive conversations, and session recovery remain Unverified.

## Scope

In scope:

- review and accept the promotion source contract;
- add one fixed two-turn pressure case per skill;
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
- neither developer skill has direct fixed two-turn pressure evidence;
- final Production-Ready status text is model-visible and has not been behaviorally exercised;
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
| evaluate-skill | `ESK2-009` | decisive fixed two-turn adequate-evidence prohibition | qualification + final source |

`ESK2-001` remains a non-required weak case. `ESK2-008` remains immutable historical inconclusive evidence and is excluded from promotion decisions.

## Fixed Execution And Budget

Every paid run uses Pi `0.80.6`, `openai-codex/gpt-5.5`, high thinking, 180-second per-process timeout, 8 MiB retained output, the existing 128 MiB raw safeguard, and 8 provider turns per process.

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
| **Total** | **16** |  | **`$6.40` planned soft ceilings** |

Fourteen invocations may make provider requests; two are host-free. Historical behavior suggests approximately `$1.50–$2.50` observed cost, but this is an estimate, not a cap. Each soft ceiling is observed only after a settled process and may be crossed by that process. There is no independently enforceable aggregate hard spend cap.

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

## Phase 3 — Final-Source Promotion Suite

### Slice 3.1 — Apply Conditional Status Source

Change only the two model-visible status lines. Do not write `skill-evidence.json` readiness/status metadata, publish the promotion report, or claim completion yet; durable readiness metadata belongs only to passing finalization in Slice 4.2.

Revalidate both skills and generate all 13 fresh final-source previews because source fingerprints changed.

### Slice 3.2 — Final-Source Owner Paid-Run Gate

Present all 13 exact final-source fingerprints, process/turn maxima, per-case limits, the 11 provider-capable final case ceilings, host-free previews, observed qualification cost, remaining planned exposure, and the lack of an aggregate hard cap.

Require explicit approval before any final-source provider request. Any regenerated preview requires renewed approval. Host-free cases remain zero-provider evidence but their fingerprints are still recorded.

### Slice 3.3 — Execute Final Suite

Run the 13 final-source cases serially with exact preview binding. Host-free cases make zero provider requests. Verify bundle integrity after each accepted result.

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
| evaluate-skill decisive pressure | two objective `ESK2-009` observations |
| artifact outcome | `WSK2-001`, `WSK2-006`, `ESK2-002`, `ESK2-003`, `ESK2-009` |
| fixed two-turn behavior | `WSK2-006`, `ESK2-009` |
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

Commit the reviewed no-provider Phase 1 checkpoint. Then generate the three exact zero-provider qualification previews for `WSK2-001`, `WSK2-006`, and `ESK2-009`.

Stop before paid qualification and present those fingerprints, process maxima, exact case ceilings, full `$6.40` planned soft-ceiling exposure, expected `$1.50–$2.50` cost, and lack of an aggregate hard cap for explicit owner approval.
