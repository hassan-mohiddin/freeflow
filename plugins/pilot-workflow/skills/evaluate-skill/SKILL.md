---
name: evaluate-skill
description: Use when testing whether a skill changes agent behavior, turning a real agent failure into an eval, comparing baseline versus with-skill runs, or deciding how to revise a skill from eval evidence.
---

# Evaluate Skill

Use Anthropic `skill-creator` as the general eval methodology authority when available.

Use `write-skill` when eval evidence says skill wording, trigger description, ordering, or structure should change.

Do not judge a skill by whether the prose sounds good. Judge behavior under pressure.

## Core Loop

1. Preserve the failing prompt or situation.
2. Build the smallest fixture or transcript that reproduces it.
3. Run baseline without the skill.
4. Run with the skill.
5. Grade artifacts before explanations.
6. Change wording only for measured failures.
7. Re-run the failed side first.

Baseline should usually fail and with-skill should pass. If both pass, the eval is weak. If both fail, either the skill is missing the behavior or the task needs a different skill.

## Pick The Eval Shape

Use a fixture eval when file edits, repo evidence, commands, or state files matter.

Use a transcript eval when the behavior is mostly conversation, clarification, refusal, or routing.

Use deterministic shell checks when the outcome can be proven mechanically:

- Changed or untouched files.
- Config fields.
- Created artifacts.
- Git status.
- Diff contents.
- Command exit codes.

Use model or human judgment only for reasoning that diffs cannot prove.

## Pilot Harness

In this repo, prefer registered fixture evals.

Dry-run before spending model tokens:

```sh
PILOT_WORKFLOW_DRY_RUN=1 plugins/pilot-workflow/evals/scripts/run-fixture-eval-by-id.sh ...
```

Use `baseline_fixture_root` when the baseline and with-skill fixtures must differ.

Save final response and diff. Do not review full transcripts unless debugging a surprising result.

## Grading Priority

Evidence order:

1. Filesystem and git diff.
2. Command output.
3. Final response.
4. Full transcript.
5. Agent self-assessment.

If the final response claims one thing and the diff shows another, the diff wins.

## Revision Rule

Do not add broad paragraphs after a failure.

First decide what failed:

- Trigger description.
- Rule wording.
- Rule placement.
- Missing stop condition.
- Fixture or prompt weakness.
- Wrong skill loaded.
- Host runtime limitation.

Then make the smallest change.

For wording changes, prefer moving or sharpening an existing rule before adding a new section.
