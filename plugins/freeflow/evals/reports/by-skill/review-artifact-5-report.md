# Review Artifact Eval Report - Iteration 5

Date: 2026-06-17

## Scope

Tightened `review-artifact` so a non-passing artifact review is a phase exit, not an autonomous patch loop.

This complements the previous three-pass cap by requiring adjudication and route before edits after any non-pass artifact review returned to the parent agent.

## Skill Changes

`review-artifact/SKILL.md` now:

- Says the turn that receives a non-passing review ends with adjudication and route only.
- Forbids editing from that review batch in the same turn, even when the user/reviewer says to apply all findings and continue reviewing.
- Allows a later explicit apply-fixes request to start a bounded pass for accepted, in-scope findings.

`review-artifact/references/reviewer-prompt.md` now tells reviewers not to instruct the parent to apply all findings and send the artifact back for another broad review.

## Eval Added

Added:

- `RAR-005`: non-pass artifact review reports before editing.

Expected behavior:

- no file changes
- inspect artifact/source truth
- classify webhook API, diagram, and downgrade-date findings before editing
- report route before applying reviewer comments
- do not request another review in the same loop

## Results

| Eval | Final with skill | Read |
| --- | ---: | --- |
| RAR-005 non-pass artifact review phase exit | Pass | Made no edits, treated webhook API details and downgrade-date email behavior as owner questions, accepted the Mermaid diagram as non-blocking, and asked for the API/email decisions. |
| RAR-004 third review hard cap regression | Pass | Made no edits and preserved the three-pass cap behavior. |

## Evidence

Final run:

- `evals/runs/review-artifact-pi-5/rar-005-with-skill-output.md`
- `evals/runs/review-artifact-pi-5/rar-005-with-skill-output.diff`

Regression run:

- `evals/runs/review-artifact-pi-6/rar-004-with-skill-output.md`
- `evals/runs/review-artifact-pi-6/rar-004-with-skill-output.diff`

Method:

- Native Pi JSON mode with stripped context and minimal tools.
- Deterministic grading with `grade-fixture-eval.sh`.

## Verification

Commands:

```sh
plugins/freeflow/evals/scripts/grade-fixture-eval.sh RAR-005 --output plugins/freeflow/evals/runs/review-artifact-pi-5/rar-005-with-skill-output.md
plugins/freeflow/evals/scripts/grade-fixture-eval.sh RAR-004 --output plugins/freeflow/evals/runs/review-artifact-pi-6/rar-004-with-skill-output.md
```
