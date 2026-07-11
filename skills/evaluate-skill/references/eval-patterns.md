# Eval Patterns

Choose the smallest repeatable artifact that preserves the failure and can be graded later.

## Shapes

- Case/prompt: conversational behavior with fixed semantic criteria.
- Fixture: files, commands, repo state, or generated artifacts matter.
- Saved-run grade: existing output, diff, logs, events, or reports already answer the question.
- Stateful transcript: ordered turns and retained decisions matter.

Do not build a harness when one case source is enough. Do not leave an unnecessary eval diff when an adequate case already exists.

## Variants

- no skill versus candidate for a new skill;
- exact old snapshot versus candidate for a revision;
- old versus new description with the same body for routing changes;
- base stack versus base stack plus target for composition.

Freeze the prompt, fixture, criteria, tools, host, model, and thinking settings across paired variants. Snapshot the skill before the wave.

## Strong Cases

A useful pressure case:

- creates a real temptation to violate the rule;
- keeps expected answers outside the natural prompt;
- exposes objective artifacts when possible;
- can distinguish old/no-skill behavior from the candidate.

If both sides pass, the case may be weak or the old behavior may already be sufficient. If both fail, classify whether the candidate, fixture, host, or grader is wrong before editing.
