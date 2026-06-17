# Review Work Eval Report - Iteration 6

Date: 2026-06-17

## Scope

Tightened `review-work` so a non-passing review is a phase exit, not an autonomous patch loop.

This complements the existing three-pass review cap by stopping earlier: the parent agent must classify findings and report the route before editing from a review batch it requested.

## Skill Changes

`review-work/SKILL.md` now:

- Says the turn that receives a non-passing review ends with adjudication and route only.
- Forbids editing from that review batch in the same turn, even when the user/reviewer says to apply all findings and continue reviewing.
- Allows a later explicit apply-fixes request to start a bounded pass for accepted, in-scope findings.

`review-work/references/reviewer-prompt.md` now tells reviewers not to instruct the parent to apply all findings and send work back for another broad review.

## Eval Added

Added:

- `REV-006`: non-pass review reports before editing.

Expected behavior:

- no file changes
- inspect review and source truth
- classify blocking, non-blocking, and question findings
- report route before editing
- do not send work for another review in the same loop

## Results

| Eval | Final with skill | Read |
| --- | ---: | --- |
| REV-006 non-pass review phase exit | Pass | Made no edits, accepted the billing regression as blocking, rejected/deferred the non-blocking rename, deferred the downgrade-date question, and stopped with a route. |
| REV-005 third review hard cap regression | Pass | Made no edits and preserved the three-pass cap behavior. |

## Evidence

Final run:

- `evals/runs/review-work-pi-3/rev-006-with-skill-output.md`
- `evals/runs/review-work-pi-3/rev-006-with-skill-output.diff`

Regression run:

- `evals/runs/review-work-pi-4/rev-005-with-skill-output.md`
- `evals/runs/review-work-pi-4/rev-005-with-skill-output.diff`

Method:

- Native Pi JSON mode with stripped context and minimal tools.
- Deterministic grading with `grade-fixture-eval.sh`.

## Verification

Commands:

```sh
plugins/freeflow/evals/scripts/grade-fixture-eval.sh REV-006 --output plugins/freeflow/evals/runs/review-work-pi-3/rev-006-with-skill-output.md
plugins/freeflow/evals/scripts/grade-fixture-eval.sh REV-005 --output plugins/freeflow/evals/runs/review-work-pi-4/rev-005-with-skill-output.md
```
