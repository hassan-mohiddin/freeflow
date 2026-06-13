# Eval Patterns

Choose the smallest repeatable artifact that preserves the failure and can be graded later.

## Common Shapes

Use a prompt/pass-criteria update when the failure is already captured and the missing piece is expected behavior.

Use a transcript note when the failure is conversational: answering vs artifact creation, clarification, refusal, routing, or command interpretation.

Use a fixture eval when files, repo evidence, commands, state files, installed memory, or generated artifacts affect the outcome.

Use saved-run grading when the job is to judge existing outputs, diffs, logs, or transcripts. Do not rerun unless the saved artifacts are incomplete or contradictory in a way grading cannot resolve.

Use separate baseline and with-skill fixtures when the tested behavior depends on installed memory, setup output, host config, or pre-existing state.

## Comparison Choices

Use no-skill baseline versus with-skill when proving the skill adds value over the ordinary agent or installed memory-free behavior.

Use previous skill version versus updated skill when testing a wording change, runtime context change, or regression fix for a skill that already exists.

For previous-version comparisons, save the exact old skill source, commit hash, plugin version, or temp copy path used as the control. Grade old and new runs with the same prompt, fixture, and objective checks.

## Harness Discipline

Use the repo's runner when one exists. Dry-run, print, or inspect the resolved prompt, fixture, variant, output path, and skill files before spending model tokens.

Do not build a harness because the user says "evaluate." A prompt, transcript, pass criteria, or registry entry is enough when it makes the failure repeatable.

"Do not add a harness" means avoid machinery. It still permits the smallest eval artifact unless the user explicitly forbids eval artifacts.

Save the final response and diff for fixture runs. Save command output or git status when those are the grading surface.

## Weak Eval Signs

- Baseline and with-skill both pass without meaningful behavioral difference.
- The prompt tells the agent the intended answer instead of creating pressure.
- The only grade is the agent's self-assessment.
- The eval cannot show whether files changed.
- The fixture forbids behavior the repo actually allows.
