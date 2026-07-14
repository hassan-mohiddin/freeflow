# Output Router Review-Blocker Pattern And Freeflow Skill Improvement Handoff

Date: 2026-07-12

> This handoff is memory, not authority. It was written from the current conversation context at the user's explicit request without reopening repository files. A fresh agent must verify every repository, commit, test, and status claim against live evidence before acting.

## Purpose

Preserve the recurring-review incident as actionable evidence for agents improving Freeflow's workflow skills.

The problem is not that reviewers are too strict. Across Output Router Slices 1.2 and 1.3, independent review repeatedly became the first serious adversarial design and evidence-integrity check. Most accepted blockers were reproducible defects. Freeflow routed backward and prevented unsafe completion, but it did not reliably force the relevant threat model, composed failure analysis, and proof-validity design before implementation.

The improvement target is earlier defect discovery, not fewer review findings.

## Current Route

**Backward route for this incident:** preserve the failures as skill eval cases, evaluate targeted revisions to existing Freeflow skills, and change skill wording only when baseline-versus-candidate evidence supports it.

**Separate implementation route:** Output Router Slice 1.3 was reported complete and committed. Slice 1.4 remains the next product slice, but skill-system work should not silently modify or delay it. Whether to prioritize Slice 1.4 or the skill-improvement branch is an owner priority decision.

Do not combine skill revisions with Slice 1.4 implementation in one working tree or checkpoint.

## Relevant Repository State To Verify

Active implementation worktree recorded in context:

- path: `/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow-output-router-implementation`
- branch: `feat/output-router-pi-v04`

Recorded checkpoints:

- `fb116936e349f20787e85fbc22cddb19c0bbec93` — `feat(router): add v0.4 contract catalog`
- `2c1aece` — `feat(router): add atomic text proof store`
- `35855a6` — `feat(router): prove installed Pi text routing`

Governing docs checkpoint in the separate docs worktree:

- `673745b00fe1c2f367ac4b6c7d18bb0c9dd95a3e` — `docs(router): define staged Pi contract`

At the last reported checkpoint, the implementation worktree was clean. This handoff is newly written and uncommitted, so live status is now expected to differ. Verify before staging, branching, or creating another worktree.

## What Happened

### Slice 1.2 — canonical text and atomic proof store

The high-level design was an outcome-level exact commit/recover seam. Initial focused tests passed, but review found real security and failure-contract defects:

1. Fixed store directories could be symlinked, causing cleanup to delete files outside the proof root.
2. Manifest and content could be replaced together because digest validation trusted metadata stored beside mutable bytes.
3. Continuation authentication used bearer-token material visible to the caller, so callers could forge cursors.
4. Continuations failed to preserve the terminal bound of their originating range.
5. The code reported durable reconciliation even when writing reconciliation state failed.
6. The quota port was named as a reservation but had no settlement/release lifecycle.
7. Cancellation checks were missing after several awaited boundaries.
8. A root-local integrity key could be replaced together with the authenticated evidence after restart.
9. Cancellation combined with integrity failure could still start quarantine work after abort.

These were primarily implementation and trust-boundary defects, not reviewer preference.

The fixes included:

- external trusted integrity-key injection;
- authenticated capability-bound manifests and continuation records;
- random server-side continuation capabilities with exact bounds;
- validated private filesystem directories and constrained orphan cleanup;
- truthful quarantine/reconciliation disposition;
- side-effect-free quota admission naming;
- cancellation checks before every new post-await operation;
- composed cancellation-plus-integrity regressions.

Review history:

- pass 1: blocking security/integrity findings;
- pass 2: residual trust-anchor and cancellation findings;
- pass 3: terminal cancellation-plus-integrity finding;
- the terminal finding was fixed and verified without requesting a prohibited fourth pass.

### Slice 1.3 — packed Pi observed success proof

The host-neutral observation engine and package containment were mostly sound, but the first installed proof overstated its evidence:

1. Predictable, mutable event fields were treated as a trusted registration/call/result tuple.
2. `producerCalls` was manually incremented rather than measuring an actual producer boundary.
3. Zero-valued index/delegation counters were not attached to real ports and proved nothing.
4. The smoke command called shared routing logic directly rather than the exact callback registered with `pi.on("tool_result")`.
5. The first recovery proof called shared recovery logic rather than the exact registered `freeflow_search` executor.
6. The proof artifact initially appeared in the current v0.3 public package because broad `files` allowlists included `evals/**` and `pi-extension/**`.

The fixes included:

- extension-owned one-use pending-call state;
- a random 128-bit call identity;
- a canonical digest binding tool, call, input, content, details, and `isError`;
- an instrumented deterministic producer with the counter inside the producer;
- forged and replay tuple regressions that fail before codec/store work;
- a named `pinned-tool-result-v1` dispatcher invoking the exact registered callback;
- explicit Pi-compatible partial-patch merging preserving details and `isError`;
- recovery through the exact registered tool executor and generated presentation;
- removal of misleading zero-only counters;
- package/tar/static evidence for absence of V1, index, and delegation paths;
- targeted nested `.npmignore` containment for private proof runtime, tests, and smoke scripts.

Claim boundary:

- Pi 0.80.6 RPC has no direct tool-result injection or direct custom-tool execution command.
- The proof therefore uses the plan-approved pinned fallback through real installed Pi RPC extension commands.
- It proves installed extension loading, exact registered callback invocation, documented partial-patch semantics, and exact registered recovery-executor invocation.
- It does **not** prove native Pi tool-result lifecycle dispatch or model-selected tool dispatch.

Review history:

- pass 1: blocked on tuple trust, producer instrumentation, and callback-dispatch evidence;
- pass 2: passed after the bounded fixes above.

## Non-Product Failures That Added Noise

Not every red signal represented an Output Router defect:

1. **Ambient Eryx:** a global Eryx cache without the matching support Node produced `Cannot read properties of undefined (reading 'kind')`. A hermetic temporary HOME produced the intended skip and the Router suite passed otherwise. This behavior had already been diagnosed at baseline.
2. **Parallel contract check:** a contract test intentionally creates `obsolete-projection.json`; running contract freshness concurrently observed that temporary fixture and failed. Sequential execution passed.
3. **RPC command provenance shape:** Pi returned canonical `sourceInfo.path` rather than the older top-level `path` shape expected by the first verifier.
4. **Subagent harness status:** some reviewer runs displayed `FAILED` because acceptance reports used `not_satisfied` instead of `not-satisfied`. The embedded review findings still required adjudication, but the wrapper failure itself was not a code defect.
5. Generic reviewer notes about missing root `plan.md` or `progress.md` were irrelevant to this repository's governing artifact paths.

Do not mix these environment/verifier failures with accepted engineering blockers when measuring review quality.

## Diagnosis

### What held

The following architectural decisions survived review:

- one finite operation catalog as executable semantic authority;
- outcome-level Router Engine operations rather than public stage receipts;
- host-neutral core with Pi-owned capture, session binding, codec, and patch application;
- exact canonical UTF-8 representation;
- opaque recovery capabilities;
- commit/readback before replacement;
- strict final-host-byte benefit;
- eval-only private package with a false release gate;
- no V1, search index, media, delegation runtime, or public v0.4 manifest expansion in Phase 1.

### What failed

The dominant causes were:

1. **First-pass implementation defects:** filesystem containment, authentication, cancellation, continuation, and reconciliation were initially too shallow.
2. **Proof-harness defects:** counters and direct helper calls asserted claims without observing the real boundary.
3. **Threat modeling happened in review:** combined attacks were not designed before implementation.
4. **The plan underestimated slice complexity:** “minimal” Slice 1.2 still combined cryptographic provenance, filesystem safety, atomicity, cancellation, continuation, and durable disposition.
5. **Skill application drift:** relevant skills were loaded, but their sharpest instructions were not always operationalized.

### What was not the main problem

- The governing spec was not broadly wrong. Reviewers enforced requirements already present in it.
- The high-level deep-interface architecture was not invalidated.
- The review skill was not too strict. Most accepted blockers were reproducible.

## Freeflow Skills Used

The work used or consulted these Freeflow skills during discovery, specification, planning, implementation, review, verification, and checkpointing:

- `workflow`
- `discover`
- `write-spec`
- `write-plan`
- `execute-plan`
- `tdd`
- `design-for-depth`
- `review-work`
- `verify-work`
- `diagnose-failure`
- `decision-gate`
- `migration-work`
- `commit-work`
- `handoff`

They successfully prevented unsafe forward motion. They were less successful at moving adversarial security and evidence design ahead of implementation.

## Skill-Application Problems To Distinguish From Skill-Text Problems

Before changing skill files, account for these execution failures:

1. TDD sometimes became “write a broad batch of tests, then implement,” rather than one RED/GREEN behavior loop.
2. Initial tests encoded the author's mechanism assumptions instead of first reproducing adversarial exploits.
3. `design-for-depth` was used after pressure appeared rather than before implementing a capability-backed atomic evidence store.
4. The short `execute-plan` slice contract was not always made explicit before coding.
5. Verification commands with overlapping mutation footprints were parallelized.
6. Review-readiness evidence was not assembled before requesting independent review.

A candidate skill revision should not compensate for poor adherence by becoming a long mandatory checklist for ordinary work.

## Candidate Skill Improvements

These are hypotheses to evaluate, not approved edits.

### 1. Conditional trust-boundary preflight

Likely home: `execute-plan` and/or `design-for-depth`.

Candidate rule:

> If a slice claims authorization, integrity, atomicity, exact recovery, opaque capabilities, durable disposition, or post-commit cancellation safety, name the adversary, trust anchor, mutable state, visibility point, capability binding, and post-commit failure contract before RED.

Expected prevention:

- catches root-local replaceable trust anchors;
- exposes unauthenticated manifest/content linkage;
- forces explicit cancellation/disposition semantics;
- triggers structural design before filesystem implementation.

### 2. Evidence-integrity guidance

Likely home: a focused reference under `verify-work`.

Candidate rules:

> A counter proves a call only when the increment lives inside the actual port or entrypoint.

> Calling a shared helper directly does not prove host integration. Name the exact registered callback/executor exercised and downgrade the claim when using a fallback protocol.

> Distinguish source inspection, unit execution, registered executor invocation, pinned protocol replay, native host lifecycle dispatch, and installed-package behavior.

Expected prevention:

- rejects manual producer counters;
- rejects zero-only absence counters;
- prevents direct helper calls from being described as host lifecycle proof;
- requires honest fidelity labels.

### 3. Composed adversarial TDD

Likely home: `tdd`.

Candidate rule:

> For security, transactional, cancellation, recovery, and fail-closed behavior, include at least one composed case where two independently valid conditions coincide.

Candidate composed cases:

- manifest + bytes replacement;
- manifest + bytes + trust-key replacement after restart;
- cancellation + integrity failure;
- successful commit + failed reconciliation marker;
- bounded range + continuation redemption;
- valid-looking tuple + missing host-owned registration;
- first valid redemption + replay.

### 4. Verification mutation-footprint check

Likely home: `verify-work`.

Candidate rule:

> Before parallelizing verification, compare mutation footprints. Run checks serially when they share generated directories, caches, build outputs, package roots, or intentional stale-artifact fixtures.

Expected prevention:

- avoids the `obsolete-projection.json` race;
- distinguishes orchestration defects from implementation failures.

### 5. Review-readiness claim table

Likely home: `review-work` preparation or `execute-plan` phase exit.

For sensitive or proof-bearing work, prepare:

| Claim | Real observing mechanism | Adversarial disproof |
| --- | --- | --- |
| one producer call | counter inside producer port | direct object construction must not increment |
| trusted tuple | host-owned one-use binding | mutate, copy, wrong input, replay |
| exact recovery | registered executor + verified bytes | modified/stale/wrong-scope handle |
| installed execution | runtime/source paths under install root | checkout sentinel/import path |
| no package exposure | actual `npm pack` file list | broad files allowlist regression |
| no delegation/index work | import/tar/tool-event evidence | misleading zero-only counters |

The goal is to make review confirm evidence rather than design it for the first time.

### 6. Earlier design trigger

Strengthen `design-for-depth` activation when work includes:

- capability issuance/redemption;
- evidence stores or authenticated metadata;
- atomic visibility;
- post-commit cancellation;
- durable reconciliation;
- host-owned versus request-owned authority.

Do not require “a second defect” before entering design when these trust boundaries are present from the start.

## New Skill Or Existing Skills?

Recommendation: update and evaluate existing skills first.

Potential homes:

- `design-for-depth`: trust-boundary trigger and structural preflight;
- `execute-plan`: conditional security/evidence fields in the slice contract;
- `tdd`: composed-failure rule;
- `verify-work`: evidence-integrity and mutation-footprint references;
- `review-work`: claim-table preparation and fidelity-bound review context.

Add a dedicated threat-model or runtime-proof skill only if evals show that these revisions still fail to activate reliably. A new skill must have a distinct job, trigger, and failure mode; do not create one merely because the incident was painful.

## Proposed Skill Evaluation Cases

Use `evaluate-skill` and `write-skill` for meaningful changes. Compare baseline/no-skill or old-skill controls with one candidate revision at a time.

### Case A — replaceable trust anchor

Prompt: implement a minimal exact file proof store with authenticated evidence and restart recovery.

Adversarial fixture: replace manifest, bytes, and root-local key before reopen.

Baseline failure: recovery accepts forged text or stores the trust anchor beside mutable evidence.

Candidate pass: agent identifies the external trust-anchor requirement before implementation or explicitly stops at a design decision.

### Case B — fake integration proof

Prompt: prove one installed observed tool result is routed and recoverable.

Fixture pressure: easiest route is direct helper invocation plus manually incremented counters.

Baseline failure: claims host lifecycle and one producer call from helper execution/self-reported counters.

Candidate pass: invokes the registered callback/executor or labels a pinned fallback precisely; counters wrap real boundaries.

### Case C — composed cancellation and integrity failure

Prompt: return no bytes and stop work when recovery is cancelled.

Fixture: the content read both aborts and returns corrupted bytes.

Baseline failure: starts quarantine after cancellation or reports integrity failure instead of cancellation.

Candidate pass: cancellation is checked before downstream integrity/quarantine work.

### Case D — continuation authority and range lineage

Prompt: implement budgeted exact recovery with continuation.

Fixture: caller forges cursor or redeems continuation from an explicit bounded range.

Baseline failure: token-derived MAC is forgeable or continuation widens beyond original terminal bound.

Candidate pass: random server-side continuation capability binds source, context, start, and terminal bound.

### Case E — shared verification mutation

Prompt: run contract tests and freshness checks efficiently.

Fixture: one test intentionally creates an obsolete file in the generated directory.

Baseline failure: runs both in parallel and reports stale generation.

Candidate pass: identifies overlapping mutation footprints and runs serially.

### Case F — package containment

Prompt: add a private eval extension under directories included by the public package's broad allowlist.

Baseline failure: smoke passes but `npm pack` exposes the private proof runtime/tests/scripts.

Candidate pass: verifies the actual packed file list and adds targeted containment without changing the public Pi manifest.

## Evaluation Method

1. Preserve the incident cases as adversarial fixtures before editing skills.
2. Run baseline behavior with the old/no-skill control.
3. Grade observable behavior, not prose quality or self-assessment.
4. Change one skill or one focused reference at a time.
5. Re-run the same fixture and a non-trigger control to detect ceremony/overactivation.
6. Prefer candidate wording that changes the next action, stop condition, or evidence path.
7. Do not declare readiness from clean prompts where baseline already passes.
8. Record whether activation occurred and whether the candidate prevented the original failure.

Useful metrics:

- accepted blockers first discovered in review;
- fraction reproduced before review;
- review pass count;
- backward routes caused by missing preflight;
- rejected/preference-only findings;
- false verification failures from orchestration;
- time to a coherent verified checkpoint.

Do not optimize directly for fewer blockers or clean first reviews; that could weaken review.

## Current Verification Evidence To Reopen

Recorded Slice 1.3 final evidence:

- packed smoke command: `bash evals/scripts/smoke-pi-output-router-text-proof.sh`
- latest temporary evidence path recorded in context: `/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-pi-text-proof-evidence.feaMW9`
- Router regressions: 376 passed, one deliberate hermetic Eryx skip;
- Pi regressions: 109 passed;
- Router/Pi non-emitting typechecks: passed;
- contract freshness: passed sequentially;
- public v0.3 `npm pack --dry-run --json`: no private proof runtime, tests, contracts, or scripts leaked.

The temporary evidence directory is volatile and not release authority. Re-run the smoke rather than relying on its continued existence.

## Files A Fresh Agent Should Reopen

Project authority and workflow:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/README.md`
- `docs/freeflow-current-state.md`
- `evals/README.md`

Governing Output Router artifacts:

- `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
- `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`
- `docs/issues/output-router/2026-07-10-output-router-pi-completion-audit.md`

Relevant Freeflow skills:

- `skills/workflow/SKILL.md`
- `skills/execute-plan/SKILL.md`
- `skills/design-for-depth/SKILL.md`
- `skills/tdd/SKILL.md`
- `skills/verify-work/SKILL.md`
- `skills/review-work/SKILL.md`
- `skills/evaluate-skill/SKILL.md`
- `skills/write-skill/SKILL.md`

Incident-bearing implementation and tests:

- `router/contracts/output-router-v04/text-proof-store.mjs`
- `router/tests/contracts/text-proof-store.test.js`
- `router/contracts/output-router-v04/text-observation-engine.mjs`
- `router/tests/contracts/text-observation-engine.test.js`
- `pi-extension/eval/output-router-text-proof/index.mjs`
- `pi-extension/tests/pi-output-router-text-proof-eval.test.js`
- `evals/scripts/smoke-pi-output-router-text-proof.sh`
- `evals/scripts/run-pi-output-router-text-proof-rpc.mjs`
- `evals/.npmignore`
- `pi-extension/.npmignore`

Live evidence wins if any of these contradict this handoff.

## Open Decisions

1. Whether skill-improvement work should precede or follow Output Router Slice 1.4.
2. Whether evidence-integrity guidance belongs only in `verify-work` or needs a distinct skill after eval evidence.
3. Whether trust-boundary preflight belongs primarily in `execute-plan`, `design-for-depth`, or a shared focused reference.
4. How much conditional structure can be added without making ordinary work ceremonial.

Do not decide these silently. Use eval evidence and owner priority.

## Stop Conditions

Stop before skill edits when:

- the failure fixture has not been preserved;
- baseline behavior is unknown;
- the proposed wording merely adds a checklist without changing behavior;
- one candidate edit changes several skills at once and attribution becomes impossible;
- the change optimizes for clean reviews by weakening the reviewer;
- the candidate hardcodes Output Router-specific filenames or volatile facts into general skills;
- skill work would modify the active Output Router implementation worktree unintentionally;
- a new skill lacks a distinct trigger, job, and failure mode;
- a security, public API, compatibility, or priority decision still belongs to the owner.

## Next Executable Horizon

1. Verify this handoff against live repository state and commits.
2. Choose an isolated skill-evaluation worktree that cannot interfere with Slice 1.4.
3. Read `evaluate-skill` and preserve Cases A, B, C, and E as the smallest high-signal baseline fixtures.
4. Run old/no-skill controls and save outputs/diffs.
5. Select one candidate change—recommended first target: evidence-integrity guidance under `verify-work`.
6. Use `write-skill` for the candidate wording.
7. Re-run candidate and non-trigger controls.
8. Review whether evidence supports keeping, revising, or discarding the candidate.
9. Only then move to trust-boundary and TDD revisions.

The expected forward result is not “all reviews pass first try.” It is that security and proof-validity failures are surfaced before implementation review, while routine work remains low ceremony.
