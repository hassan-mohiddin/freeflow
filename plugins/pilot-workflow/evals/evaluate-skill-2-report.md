# Evaluate Skill Eval 2

Date: 2026-05-26

Scope:

- `plugins/pilot-workflow/skills/evaluate-skill/`

## Change

Updated `evaluate-skill` for progressive disclosure:

- Kept `SKILL.md` focused on routing, hard stops, core loop, eval shape, run discipline, and revision rules.
- Updated the trigger description to cover eval conflicts, preserved failures, baseline-vs-with-skill comparison, and eval-evidence-based revisions.
- Added `references/eval-patterns.md` for fixture/transcript/saved-run patterns and harness discipline.
- Added `references/grading-priority.md` for artifact-first grading and rerun rules.

## Evals Added

Added fixture `evals/fixtures/tiny-eval-method-app`.

Added registry entries:

- `ESK-002`: grade saved artifacts where the final response claims eval-first discipline but the diff only shows a skill edit.
- `ESK-003`: improve a conversation-routing skill from a preserved failure without building a fixture app or harness.

## Baseline Results

`ESK-002` baseline: fail.

- Trusted the final response.
- Marked the run `Status: Pass`.
- Missed that the saved diff showed only `skills/review-pr/SKILL.md` changing and no eval artifact update.

`ESK-003` baseline: fail.

- Patched `skills/triage-question/SKILL.md` directly.
- Did not create or update an eval artifact first.
- Avoided a harness, but skipped the required repeatable artifact.

## Current-Skill Results Before Refactor

`ESK-002` with current skill: pass.

- Loaded `evaluate-skill`.
- Graded the diff over the final response.
- Marked the saved run failed for missing eval-first evidence.

`ESK-003` with current skill: pass.

- Updated a small eval artifact before editing the skill.
- Avoided fixture/harness machinery.
- Tightened `triage-question` so questions are answered before workflow action.

## Final Verification After Refactor

Final with-skill runs:

- `ESK-001`: `evals/runs/evaluate-skill-3/esk-001-with-skill-output.diff`
- `ESK-002`: `evals/runs/evaluate-skill-3/esk-002-with-skill-output.diff`
- `ESK-003`: `evals/runs/evaluate-skill-3/esk-003-with-skill-output.diff`
- `CMD-015`: `evals/runs/evaluate-skill-3/cmd-015-with-skill-output.diff`

Results:

- `ESK-001` passed: updated prompt pass criteria before tightening `review-pr`.
- `ESK-002` passed: graded the saved run as failed because diff evidence beat the final response.
- `ESK-003` passed: added a small pass-criteria artifact before tightening `triage-question`; no app or harness added.
- `CMD-015` passed: direct `/evaluate-skill` command still created prompt pass criteria before tightening `review-pr`.

The first sandboxed nested Codex eval attempt failed with app-server initialization permissions. The same approved fixture eval command was rerun outside the sandbox.
