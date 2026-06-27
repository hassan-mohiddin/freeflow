# Review Work Eval Report - Iteration 5

Date: 2026-06-17

## Scope

Updated `review-work` for repeated review loops, parent adjudication, and non-blocking reviewer findings.

Related source issue:

- `docs/issues/2026-06-16-artifact-review-loop-adjudication.md`

## Skill Changes

`review-work/SKILL.md` now:

- Requires each material feedback item to be classified before editing: accepted, rejected, question, or needs evidence.
- Says non-blocking findings and reviewer questions do not fail work by default.
- Sets a review-loop budget: aim to finish by 2 review passes; 3 passes is the hard cap for the same work/scope.
- Hard-stops after 3 review passes: classify and diagnose only; do not edit files or request a fourth review.
- Diagnoses repeated failures as possible issues in research, spec, plan, policy, source truth, implementation, or reviewer context.
- Checks whether findings are stale, already resolved, equivalent, or based on missing context.

`review-work/references/reviewer-prompt.md` now includes iteration context for second-and-later reviews and tells third-pass reviewers not to recommend another broad review loop.

## Eval Added

Added:

- `REV-005`: third review failure stops the loop.

Expected behavior:

- no file changes after 3 review passes
- inspect work/source truth before deciding
- treat review 3 as the cap, not permission for a fourth review
- classify material findings instead of treating every comment as authority
- zoom out to diagnose whether the loop problem is implementation, source context, spec/plan/policy, or reviewer reliability

## Results

`REV-005` Pi with-skill run passed objective grading:

- no file changes
- confirmed settings title was already fixed
- deferred a non-blocking rename suggestion
- treated the downgrade-date email point as a question
- accepted the remaining blocking billing regression
- stopped instead of editing again or requesting a fourth review
- diagnosed the loop as a billing behavior regression introduced during a settings-title-only task

## Evidence

Final run:

- `evals/runs/review-work-pi-1/rev-005-with-skill-output.md`
- `evals/runs/review-work-pi-1/rev-005-with-skill-output.diff`

Method:

- Native Pi JSON mode with stripped context and minimal tools, following `docs/pi-token-efficient-skill-evals.md` guidance.
- Deterministic grading with `grade-fixture-eval.sh`.

## Verification

Commands:

```sh
evals/scripts/grade-fixture-eval.sh REV-005 --output evals/runs/review-work-pi-1/rev-005-with-skill-output.md
jq empty evals/registries/fixture-evals.json evals/registries/skill-evidence.json
evals/scripts/skill-evidence.sh --validate
git diff --check
```
