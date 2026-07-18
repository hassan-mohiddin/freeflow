# Phase 2 Plan Evidence-Dependency And Skill-Application Incident

Date: 2026-07-13

> This handoff is memory, not authority. It was written from the current conversation at the owner's request without reopening repository evidence beyond the `handoff` skill. Verify every repository, commit, file, status, test, and review claim against live evidence before acting.

## Purpose

Give an external agent enough context to review why Output Router work continued receiving review blockers after Freeflow's workflow skills were updated, and determine whether the latest incident demonstrates:

- a Freeflow skill-text or activation defect;
- an agent reasoning/application defect;
- reviewer calibration error;
- or a combination requiring measured skill evaluation.

The immediate objective is diagnosis, not another skill edit and not continued Output Router implementation.

## Current Route

Output Router Phase 1 was reported complete. Work moved to refining the immediate Phase 2 learning horizon in the rolling plan.

The current route is backward to **evidence-path design for the Phase 2 plan**, specifically a provenance-bearing v0.3 execution probe for V2 marker/forward-only learning.

Do not implement Phase 2 from the currently edited plan until the unresolved artifact-review finding is adjudicated and the plan is fit again.

## Repository State To Verify

Recorded implementation worktree:

- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow-output-router-implementation`
- branch: `feat/output-router-pi-v04`

Recorded committed HEAD before this planning incident:

- `0b5b584` — `fix(router): verify continuation capabilities`

Earlier Phase 1 checkpoints:

- `57e60cf` — `feat(router): prove Pi no-patch failures`
- `35855a6` — `feat(router): prove installed Pi text routing`
- `2c1aece` — `feat(router): add atomic text proof store`
- `fb11693` — `feat(router): add v0.4 contract catalog`
- `673745b` — governing docs checkpoint

Expected dirty state from conversation memory:

- modified rolling plan:
  `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`
- an older untracked incident handoff:
  `docs/handoffs/output-router/2026-07-12-output-router-review-blocker-pattern-and-freeflow-skill-improvement.md`
- this new handoff.

Do not stage, discard, or combine these files until live status and ownership are inspected.

## Phase 1 State Preserved For Context

Phase 1 was reported as complete and package-private/eval-only, not release-ready.

Recorded final Phase 1 evidence before Phase 2 planning:

- focused store/engine/Pi tests: 48/48;
- Router regressions: 390 passed and one deliberate hermetic Eryx skip;
- Pi regressions: 110/110;
- installed packed-Pi smoke passed;
- continuation recovery was verified through the registered executor without producer rerun;
- typechecks, contract freshness, public-package containment, and diff checks passed.

Latest recorded packed evidence at that checkpoint:

`/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-pi-text-proof-evidence.Pp4oiA`

That path is volatile and not release authority. Rerun instead of trusting its continued existence.

## Phase 2 Planning Incident

### Initial refinement

After Phase 1, the rolling plan still described Phase 2 directionally. The parent read the updated Freeflow workflow/planning/design skills and gathered three read-only planning reviews:

1. Pi lifecycle and authority-binding evidence;
2. V2 semantic transaction/store pressure;
3. V1 component and migration inventory.

The evidence indicated:

- Pi 0.80.6 supplies session identity/lifecycle reasons but no authenticated human principal, reusable claims/grants, task authority, or durable close/abandon event;
- Phase 1's deterministic generation cannot support destructive rotation;
- shutdown is teardown, fork lineage is not a grant, and cwd/session-path-only authority is unsafe;
- the Phase 1 file store must not be expanded horizontally into the final backend;
- authority, generation/lifecycle, quota, structural persistence, required-representation visibility, and disposition need one semantic transaction owner;
- V1 primary state, `index/v1`, config aliases, `ffout_` handles, and broad package paths are separate compatibility surfaces.

The parent revised Phase 2 into:

- **Slice 2.1:** installed Pi lifecycle/authority-binding probe;
- **Slice 2.2:** semantic transaction mechanism learning;
- **Slice 2.3:** read-only V1 component characterization/detector contract;
- a directional production Phase 2B after evidence and owner decisions.

### Artifact review pass 1

Independent artifact review found two accepted blockers:

1. Slice 2.3 deferred mixed/future detection until Slice 2.2 settled a V2 whole-root marker, but Slice 2.2 did not design or test any marker protocol.
2. Slice 2.3 had evidence and stop conditions but no affirmative detector-contract promote/discard threshold.

The parent correctly ended the turn without editing from that review batch.

### Revision pass

On the next turn, the parent:

- added explicit detector promote/discard gates;
- separated unsupported future V1 component versions from unsettled future V2 marker state;
- added **Slice 2.4 — V2 whole-root marker and forward-only learning**;
- kept final marker/namespace/backend/config/compatibility consequences at an owner gate.

Slice 2.4 proposed evidence across:

- first-commit crash barriers;
- valid V1 primary and derived-only roots;
- corrupt/unclassified roots;
- valid, mixed, malformed, and future V2 roots;
- concurrent openers/writers;
- actual v0.3 code/config behavior;
- old-code isolation versus resuming V2 scope/generation authority.

### Artifact review pass 2

The follow-up review found:

1. **Main valid blocker:** Slice 2.4 made actual v0.3 execution conditional with “where practical,” while promotion and owner decisions required observed v0.3 behavior. The plan did not identify an available, provenance-bearing v0.3 artifact or executable fallback. The immediate slice therefore claimed readiness while hiding an evidence dependency.
2. **Detector-limit finding:** Slice 2.3 required bounded limit outcomes for promotion but lacked an explicit discard/stop line for inability to enforce those bounds safely.
3. **Non-blocking typo:** the checkpoint said “three learning slices” after a fourth slice had been added.

Because pass 2 exposed another dependency of the same marker/forward-only invariant, `review-artifact` required a backward route rather than another local wording patch. No subsequent plan edit was made in this conversation before this handoff.

## Diagnosis Given To The Owner

The parent read the current versions of:

- `workflow`;
- `discover`;
- `write-plan` and `plan-shapes`;
- `design-for-depth` and design-pressure guidance;
- `review-artifact` and its reviewer contract.

The parent concluded that the main v0.3 blocker was an **agent reasoning/application failure**, not current evidence of a Freeflow skill defect.

### Why the current skills were sufficient

The current skills already require:

- inspect the highest unresolved evidence question before convergence;
- make the immediate planning horizon executable;
- avoid hiding uncertainty in detailed steps;
- give learning slices concrete evidence, promote/discard criteria, and backward checkpoints;
- design structural alternatives before selecting architecture;
- block artifact dead ends and hidden owner decisions;
- stop after pass 2 exposes another dependency of the same invariant.

### What the parent did wrong

The parent should have asked before declaring Slice 2.4 executable:

> What exact, provenance-bearing v0.3 artifact can run this probe?

Instead, it used “where practical” while making observed v0.3 behavior mandatory for promotion. That converted a missing evidence source into vague plan language.

The parent also failed to run every immediate promotion condition through:

```text
What concrete, currently available mechanism can produce this evidence?
```

### Reviewer-calibration nuance

The detector-limit finding may have been overclassified as blocking. The existing promotion condition already prevented promotion unless bounded limit classifications passed. Adding an explicit backward route would improve clarity, but omission may not by itself have caused unsafe implementation.

The v0.3 provenance/execution finding was considered substantive because it could dead-end the required marker/forward-only evidence.

## Current Position On Skill Changes

**Do not change Freeflow skills from this incident alone.**

The skills appear to have done their jobs:

- review found a real evidence dependency;
- the parent stopped rather than patching forward;
- pass history and the narrow backward route were preserved;
- owner decisions remained explicit.

A possible candidate rule for `write-plan` is:

> Every load-bearing promotion condition in the immediate horizon must have an available evidence producer. “Where practical,” “if possible,” or equivalent language makes that condition an open learning question, not an executable acceptance criterion.

However, current skills already imply this strongly. Adding the rule without behavioral evaluation could compensate for one agent's noncompliance by increasing ceremony for ordinary planning.

## External Review Questions

The external agent should answer from live skill text and incident evidence:

1. Did the current skills already require the missing v0.3 evidence-path check?
2. Was the miss caused by activation, interpretation, adherence, or insufficient wording?
3. Was the detector-limit finding actually blocking under `review-artifact`'s calibration standard?
4. Did reviewer prompting or defaults encourage exhaustive blocker production beyond the intended next-step fitness test?
5. Would one concise skill change materially alter behavior, or merely restate existing rules?
6. Can the proposed skill change pass an adversarial fixture where baseline fails, while a routine non-trigger plan remains low-ceremony?
7. Are the repeated Output Router blockers evidence that review is working, or evidence that structural discovery still happens too late?

## Proposed Adversarial Skill Eval

Treat this as a hypothesis, not an approved eval implementation.

### Case — mandatory historical-runtime evidence with unknown artifact

Prompt an agent to write an executable migration/forward-only learning slice requiring behavior from an old released binary. The repository contains current source and historical references, but the prompt does not establish whether a registry artifact, release tag, tarball, or clean historical checkout is available.

**Baseline failure:**

- writes “run the old binary where practical”;
- still makes observed old-binary behavior mandatory for promotion;
- declares the immediate phase ready;
- does not inspect artifact provenance or add an evidence-acquisition learning/stop route.

**Candidate pass:**

- inspects whether a provenance-bearing old artifact is available before claiming executability;
- if available, names the artifact identity and reproducible acquisition/probe path;
- if unavailable, makes artifact acquisition/provenance the learning question or stops the phase as not ready;
- does not silently substitute current code, an unverified package, or source inspection for old-runtime behavior.

**Non-trigger control:**

A routine bounded plan whose checks use already-present tests/build commands should not gain a historical-artifact checklist or extra ceremony.

## Next Safe Actions

1. Verify this handoff, the rolling-plan diff, branch/HEAD, and dirty state from live evidence.
2. Keep Output Router implementation paused; this is currently an evidence-design and external-review checkpoint.
3. Have the external agent review the current skill text and this incident without editing skills or the Output Router plan.
4. Adjudicate the external findings:
   - current skill sufficient / application failure;
   - candidate skill gap requiring eval;
   - reviewer-calibration issue;
   - mixed diagnosis.
5. If skill change is proposed, use `evaluate-skill` before `write-skill`; preserve baseline, candidate, and non-trigger artifacts.
6. Independently resolve the product planning fact: identify a provenance-bearing v0.3 artifact/probe route or mark Slice 2.4 not ready.
7. Only after that evidence path is settled should the rolling plan receive its bounded follow-up revision/review.

## Stop Conditions

Stop before skill edits when:

- the external review has not inspected the current skill text;
- the incident fixture has not been preserved;
- baseline behavior is unknown;
- a proposed change only repeats existing wording;
- several skills would change at once, preventing attribution;
- the objective becomes fewer blockers rather than earlier, better defect discovery;
- routine plans gain mandatory ceremony unrelated to the failure.

Stop before Output Router plan or implementation edits when:

- the v0.3 artifact/provenance route is still unknown;
- an old-runtime source inspection is being substituted for runtime evidence;
- final marker/backend/config/compatibility behavior would be silently decided;
- the artifact-review pass history is being reset;
- live evidence contradicts this handoff.

## Files The External Agent Should Reopen Later

Only after the user's no-new-read constraint for this handoff turn has ended:

- `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`
- `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
- `docs/issues/output-router/2026-07-10-output-router-pi-completion-audit.md`
- current `workflow`, `discover`, `write-plan`, `design-for-depth`, `review-artifact`, `evaluate-skill`, and `write-skill` skill files
- live package metadata, tags/history, and release evidence needed to identify an actual v0.3 artifact
- the current worktree diff and status

Live evidence wins over every statement in this handoff.
