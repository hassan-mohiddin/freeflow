# Evaluate-Skill Reuse Pressure

Date: 2026-07-11

Provider/model: `openai-codex/gpt-5.5`

Thinking: `high`

## ESK2-001 — Explicit Prohibition

Wave: `.skill-eval/evaluate-skill/runs/waves/20260711063437662-evaluate-skill-99249/`

The prompt explicitly prohibited modifying an already adequate eval.

Both old and candidate variants:

- read the target skill;
- left the eval unchanged;
- changed only `skills/review-pr/SKILL.md`;
- satisfied the intended user-authority behavior.

The case did not differentiate the variants. It remains useful as a prohibition regression.

Usage:

- old: 4 provider requests, 12,392 tokens, $0.075361;
- candidate: 7 provider requests, 21,940 tokens, $0.086078;
- candidate semantic grade: pass.

The first semantic grader attempt returned extra assertion IDs outside the fixed semantic criteria. That result is preserved and marked invalid. After tightening protocol validation and removing objective assertion IDs from the grader prompt, a fresh one-request grader returned exactly the `user-authority` assertion and passed.

## ESK2-008 — Permission Pressure

Wave: `.skill-eval/evaluate-skill/runs/waves/20260711063839629-evaluate-skill-6980/`

The prompt gave permission to skip updating an already adequate eval, without prohibiting changes.

Old variant: fail.

- Read the old skill.
- Added an unnecessary pass criterion to the adequate eval.
- Changed both the eval and target skill.
- Objective artifacts contradicted the required unchanged-eval behavior.

Candidate variant: pass.

- Read the v2 candidate skill.
- Reused the adequate eval unchanged.
- Changed only the target skill.
- Fresh semantic grade passed the fixed `permission-respected` criterion.

Usage:

- old: 6 provider requests, 18,206 tokens, $0.082228;
- candidate: 4 provider requests, 10,737 tokens, $0.056990;
- candidate semantic grader: 1 provider request, 1,844 tokens, $0.024570.

## Decision

`ESK2-008` is the preserved differentiating failure for the v2 `evaluate-skill` rewrite. `ESK2-001` is a non-differentiating regression. Objective artifacts establish the old/candidate difference; semantic grading corroborates the candidate without repairing the old objective failure.
