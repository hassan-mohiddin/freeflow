# Eval Patterns

Choose the smallest repeatable case that preserves the failure and can be graded later.

## Case Shapes

- **Case/prompt:** conversational behavior with fixed semantic criteria.
- **Fixture:** files, commands, repo state, or generated artifacts matter.
- **Saved-run grade:** existing output, diff, logs, events, or reports already answer the question.
- **Stateful transcript:** ordered turns and retained behavior matter.

Do not build a harness when one case source is enough. Do not create a new eval artifact when an adequate case already exists.

## Variants

- no skill versus candidate for a new skill;
- exact old snapshot versus candidate for a revision;
- old versus new description with the same body for routing changes;
- explicit body with and without guaranteed base context for first-read claims;
- base stack versus base stack plus target for composition.

Freeze prompt, fixture, criteria, tools, host, model, and thinking settings across paired variants. Snapshot every declared subject resource before execution.

## Description Routing

Use the earliest natural prompt where the skill should become useful. Native events must prove which exact snapshot was read.

For a close nearby prompt, choose the intended boundary before running:

- **Non-trigger case:** activation itself is wrong.
- **Safe-read case:** activation is acceptable, but the skill must exit or defer without hijacking behavior.

Do not weaken the positive prompt merely to make a near-miss non-trigger easier.

## First-Read Body

Deliver the exact body with only guaranteed prior context. Grade whether the subject can identify the job, understand necessary terms, follow the normal method, and recognize stop conditions without opening optional references.

A body that succeeds only because ambient package context supplied missing vocabulary has not proved first-read comprehension.

## Boundary Examples

- A description was broadened → use native activation on the earliest natural positive prompt and one nearby prompt; body injection cannot prove routing.
- A body now defines a previously missing term → deliver the exact body with only guaranteed prior context; an ambient installed package would invalidate the claim.
- A skill should guide a later turn after loading once → use a stateful multi-turn case; repeated explicit delivery cannot prove retained use.
- A task creates or edits files → grade the resulting artifacts and checks before the final response.

## Dependency Composition

Materialize the exact ordered base stack and target resources. Vary only the target snapshot. Grade dependency delivery separately from target behavior.

Use composition only when the skill actually claims a dependency; standalone behavior should not receive a hidden base stack.

## Retained Use

Use stateful multi-turn execution when the claim is that a skill loaded on an earlier turn remains available later. The first turn should activate naturally; later turns should exercise the method without telling the subject to reread it.

One-shot injection or repeated explicit delivery cannot prove retained use.

## Strong Pressure

A useful case:

- creates a real temptation to violate the rule;
- keeps expected answers outside the natural prompt;
- exposes objective artifacts when possible;
- distinguishes old/no-skill behavior from the candidate.

If both sides pass, the case may be weak or the old behavior sufficient. If both fail, classify the candidate, fixture, host, dependency, or grader before editing.
