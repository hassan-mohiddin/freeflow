# Activation Boundaries

Read this when an activation boundary is unclear or evidence shows missed, late, early, or task-hijacking activation.

A description should make the skill available at the earliest useful moment without requiring language introduced by the skill itself.

## Diagnose The First Read

Identify:

- the earliest natural prompt or state where the method can change behavior;
- cues visible before the body is read;
- context guaranteed before activation;
- the consequence of missing that read;
- the consequence if a nearby prompt also loads the skill.

Do not optimize for repeated reads. Diagnose the first decision the skill should influence.

## Check The Cues

Useful cues include the skill’s job, natural user verbs, visible task situations, and distinctions from neighboring jobs.

Reject cues that depend on:

- vocabulary defined only in the body or an optional sibling;
- future-duration guesses;
- unexplained classifications or named phases;
- generic “help with” or “improve” language;
- marketing claims or exhaustive trigger catalogs.

Guaranteed base context may define a term. Otherwise use plain observable language.

## Test Nearby Behavior

A nearby case can pass in two ways:

- **Non-trigger:** the skill should not load.
- **Safe read:** loading is acceptable, but the body exits or defers without applying the wrong method.

Do not narrow a description solely to prevent harmless reads. Do not broaden it until the skill routinely overrides the actual owning job.

## Examples

Broad core trigger:

> Use when committing work.

Over-specified trigger that hides the job behind later workflow details:

> Use after final verification when a planned checkpoint requires a locally reviewable commit.

Broad safe-read trigger:

> Use when working with software design—especially boundaries, interfaces, ownership, state, and failure behavior.

The body can exit when the local interface remains sound; the description need not encode every structural-pressure case.

## Evidence Boundary

Natural activation proves the host read the exact skill snapshot from a natural prompt. Explicit body delivery tests first-read instructions, not activation. Composition tests declared dependencies. Multi-turn evidence tests later use. Artifact or transcript evidence shows whether the loaded skill helped or hijacked behavior.

Preserve the earliest useful positive prompt and at least one close nearby case before making a broad activation claim.
