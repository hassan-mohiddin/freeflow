# Review Artifact Eval Report - Iteration 4

Date: 2026-06-17

## Scope

Updated `review-artifact` for parent adjudication of reviewer findings and repeated review loops.

Source issue:

- `docs/issues/2026-06-16-artifact-review-loop-adjudication.md`

## Skill Changes

`review-artifact/SKILL.md` now:

- Treats reviewer findings as evidence, not commands.
- Requires parent classification before editing: accepted, rejected, question, or needs evidence.
- Says non-blocking findings and reviewer questions do not fail the artifact by default.
- Requires second-and-later reviewer prompts to include prior findings, owner clarifications, adjudication, changed sections, and remaining risk.
- Sets a review-loop budget: aim to finish by 2 review passes; 3 passes is the hard cap for the same artifact/scope.
- Hard-stops after 3 review passes: classify and diagnose only; do not edit files or request a fourth review.

`review-artifact/references/reviewer-prompt.md` now carries iteration context and tells reviewers not to re-raise rejected or already-resolved findings unless live evidence contradicts adjudication.

## Eval Added

Added:

- `RAR-004`: artifact-review loop parent adjudication.

Expected behavior:

- no file changes after 3 review passes
- classify material findings before editing
- do not treat non-blocking or question findings as automatic failure
- reject/question stale or out-of-scope findings
- do not run or request a fourth review

## Results

`RAR-004` first Pi with-skill run failed objective grading:

- It did not run a fourth review.
- It adjudicated findings.
- But it still edited `docs/specs/failed-payment-grace-period.md` to apply non-blocking/scope cleanup after the third review.

Skill wording was tightened with a top-level hard stop:

```text
if the artifact has already had three review passes, do not edit any files or request another review
```

`RAR-004` final Pi with-skill run passed objective grading:

- no file changes
- classified Review 1 as accepted/already resolved
- treated the diagram as non-blocking/deferred
- treated the email date as a product question
- treated webhook details as a question/scope conflict owned by the webhook draft
- diagnosed the loop as scope expansion from billing grace-period review into unresolved webhook API design

## Evidence

Final run:

- `evals/runs/review-artifact-pi-3/rar-004-with-skill-output.md`
- `evals/runs/review-artifact-pi-3/rar-004-with-skill-output.diff`

Failed tightening run:

- `evals/runs/review-artifact-pi-2/rar-004-with-skill-output.md`
- `evals/runs/review-artifact-pi-2/rar-004-with-skill-output.diff`

Method:

- Native Pi JSON mode with stripped context and minimal tools, following `docs/pi-token-efficient-skill-evals.md` guidance.
- Deterministic grading with `grade-fixture-eval.sh`.

## Verification

Commands:

```sh
plugins/freeflow/evals/scripts/grade-fixture-eval.sh RAR-004 --output plugins/freeflow/evals/runs/review-artifact-pi-3/rar-004-with-skill-output.md
jq empty plugins/freeflow/evals/registries/fixture-evals.json plugins/freeflow/evals/registries/skill-evidence.json
plugins/freeflow/evals/scripts/skill-evidence.sh --validate
git diff --check
```
