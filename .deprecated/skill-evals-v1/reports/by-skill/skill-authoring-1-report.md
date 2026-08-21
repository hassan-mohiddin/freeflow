# Skill Authoring Eval 1

Date: 2026-05-25

Scope:

- `write-skill`
- `evaluate-skill`

## Evals Added

Added fixture `evals/fixtures/tiny-skill-dev-app`.

Added registry entries:

- `WSK-001`: create one compact release-note skill from messy requirements.
- `ESK-001`: improve a weak review skill from a preserved failure under shortcut pressure.

## WSK-001 Result

Baseline: pass.

- Created one `skills/release-notes/SKILL.md`.
- No extra skill docs/resources.
- Stayed under 100 lines.

With `write-skill`: pass.

- Created one `skills/release-notes/SKILL.md`.
- No extra skill docs/resources.
- Stayed under 100 lines.

Assessment: weak differentiator. Useful as a regression check, not proof that `write-skill` changes behavior for this prompt.

Artifacts:

- `evals/runs/wsk-001-baseline-output.md`
- `evals/runs/wsk-001-baseline-output.diff`
- `evals/runs/wsk-001-with-skill-output.md`
- `evals/runs/wsk-001-with-skill-output.diff`

## ESK-001 Result

Baseline: fail.

- Patched `skills/review-pr/SKILL.md` directly.
- Did not create or update an eval artifact.
- Final response explicitly said no harness was added.

Initial with-skill: fail.

- Loaded `evaluate-skill` and `write-skill`.
- Still patched the skill directly and skipped the eval artifact.

Skill revision:

- Tightened `evaluate-skill` with a hard stop: when improving from a preserved failure, create or update the smallest repeatable eval artifact before editing the skill.
- Clarified that a failure report is evidence, not the eval artifact.
- Clarified shortcut pressure such as "quick wording fix", "patch directly", or "no harness" does not skip this unless the user explicitly forbids eval artifacts or file changes.

Fixed with-skill: pass.

- Updated the existing review prompt with pass criteria before changing the skill.
- Then tightened `skills/review-pr/SKILL.md`.
- Kept the revised skill short.

Artifacts:

- `evals/runs/esk-001-baseline-output.md`
- `evals/runs/esk-001-baseline-output.diff`
- `evals/runs/esk-001-with-skill-output.md`
- `evals/runs/esk-001-with-skill-output.diff`
- `evals/runs/esk-001-with-skill-fixed-output.md`
- `evals/runs/esk-001-with-skill-fixed-output.diff`
- `evals/runs/esk-001-with-skill-fixed-2-output.md`
- `evals/runs/esk-001-with-skill-fixed-2-output.diff`

## Follow-Up

Add a stronger `write-skill` eval later if a real failure appears. Current `WSK-001` is acceptable only as a no-regression fixture.

