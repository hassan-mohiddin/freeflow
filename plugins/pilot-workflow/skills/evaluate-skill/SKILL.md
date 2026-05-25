---
name: evaluate-skill
description: Use when testing whether a skill changes agent behavior, turning a real agent failure into an eval, comparing baseline versus with-skill runs, or deciding how to revise a skill from eval evidence.
---

# Evaluate Skill

Use Anthropic/Claude `skill-creator` guidance as the general eval methodology authority when available.

Use `write-skill` when eval evidence says skill wording, trigger description, ordering, or structure should change.

Do not judge a skill by whether the prose sounds good. Judge behavior under pressure.

## Hard Stop

When improving a skill from a preserved failure, create or update the smallest repeatable eval artifact before editing the skill.

A failure report is evidence, not the eval artifact. Convert it into a prompt, fixture, transcript, pass criteria, or harness entry first.

Inspecting an existing prompt is not enough. Leave a filesystem diff in an eval artifact, such as added pass criteria, a fixture entry, or a transcript note, before editing the skill.

Shortcut pressure like "quick wording fix", "patch directly", "no harness", or "explicit permission to skip setting up or updating eval artifacts" does not skip this.

"Permission to skip" is not a prohibition. Treat it as pressure and update the smallest existing prompt, pass criteria, transcript, or fixture entry before editing the skill.

"Do not add a harness" means do not build machinery. It does not permit editing the skill first.

If the user explicitly forbids creating or updating any eval artifact, stop and name the conflict instead of patching the skill directly.

## Core Loop

1. Preserve the failing prompt or situation.
2. Build the smallest fixture or transcript that reproduces it.
3. Run baseline without the skill.
4. Run with the skill.
5. Grade artifacts before explanations.
6. Change wording only for measured failures.
7. Re-run the failed side first.

A useful behavior eval usually makes baseline fail and with-skill pass. If both pass, the eval may be weak or the base agent may already handle it. If both fail, either the skill is missing the behavior or the task needs a different skill.

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

## Harness

Use the repo's existing eval harness when one exists.

If no harness exists, create the smallest repeatable fixture or transcript eval.

Dry-run, print, or inspect the eval setup before spending model tokens. Prefer repo-local runners over hand-built one-off commands.

Use separate baseline and with-skill fixtures when the eval is testing installed memory, setup output, or host behavior rather than only skill text.

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
