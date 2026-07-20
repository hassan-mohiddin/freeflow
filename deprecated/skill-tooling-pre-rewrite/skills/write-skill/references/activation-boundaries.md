# Activation Boundaries

A description should make the skill available at the earliest useful moment without requiring the agent to know language introduced by the skill itself.

## Decide The First Read

Before writing the description, identify:

- the earliest natural prompt or state where the method can change behavior;
- what the agent can observe at that moment;
- what context is guaranteed to exist before activation;
- the cost of missing that first read;
- the cost if a nearby prompt also loads the skill.

Do not optimize for repeated reads. The description’s main job is to make the method available before the first decision it should influence.

## Use Observable Cues

Include:

- the skill’s job;
- verbs and phrases users naturally use for that job;
- concrete situations visible in the prompt or immediate context;
- distinguishing cues when neighboring skills are similar.

Avoid:

- vocabulary defined only in the body or an optional sibling skill;
- future-duration guesses such as “sustained”;
- unexplained classifications such as “consequential” or named workflow phases;
- generic “help with” or “improve” language;
- marketing claims and exhaustive trigger taxonomies.

If guaranteed base context defines a term, the description may use it. Otherwise prefer plain observable language.

## Prefer Recall Without Hijacking

A broad description is useful when the body can quickly recognize a nearby case and return control without adding ceremony or changing the task.

Test two kinds of nearby behavior:

- **Non-trigger:** the skill should clearly not load.
- **Safe read:** loading is acceptable, but the body must answer, defer, or exit without applying the wrong method.

Do not narrow a description solely to prevent harmless reads. Do not broaden it so far that the skill routinely overrides the actual owning job.

## Boundary Examples

Broad core trigger:

> Use when committing work.

Over-specified trigger that hides the same job behind workflow details:

> Use after final verification when a planned checkpoint requires a locally reviewable commit.

Broad safe-read trigger:

> Use when working with software design—especially boundaries, interfaces, ownership, state, and failure behavior.

The body can exit for a local change whose interface remains sound. The description does not need to encode every structural-pressure case.

## Evidence

Separate delivery from behavior:

- native activation proves the host read the exact skill snapshot from a natural prompt;
- explicit body delivery tests whether first-read instructions are understandable;
- composition tests declared dependencies;
- multi-turn evidence tests retained use after activation;
- artifact or transcript evidence shows whether activation helped or hijacked behavior.

Before a readiness claim, preserve the earliest useful positive prompt and at least one close nearby case. The nearby case may pass through non-activation or safe behavior, depending on the intended boundary.
