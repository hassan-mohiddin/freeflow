---
name: write-skill
description: Use when creating or revising an agent skill.
---

# Write Skill

Write the smallest agent-first skill that changes the target behavior.

## Establish The First Read

Before writing, identify:

- the behavior and failure the skill must change;
- the earliest natural prompt or situation where its guidance becomes useful;
- the cues an agent can observe before reading the body;
- the context guaranteed to be loaded before this skill;
- a nearby case that should not be hijacked.

A description cannot rely on terminology or classifications taught only inside the skill. The body must work for an agent reading it for the first time with only declared guaranteed context.

## Write The Description

Optimize for the first useful activation, not repeated reads.

- State the broad core job in plain language.
- Use cues observable in the user request or immediate task state.
- Prefer broad recall when loading the skill is safe and the body can exit cleanly.
- Do not require the agent to predict an internal classification taught only after activation.
- Do not turn the description into an exhaustive trigger taxonomy or compressed summary of the body.

A nearby case may pass by not loading the skill or by loading it and exiting without changing the task incorrectly. Read [activation boundaries](references/activation-boundaries.md) when writing or diagnosing a description.

## Write For The Executing Agent

1. Establish the skill’s job immediately.
2. Define necessary terms before relying on them.
3. Put rules where the agent first makes the affected choice.
4. Keep the normal path executable from `SKILL.md` alone.
5. Say what to do, what not to do, and when to stop, exit, or route.
6. Lead with required behavior. Use a negative instruction only to block a plausible or observed failure, and pair it with the positive action, exit, or route. Do not introduce rejected mechanisms or hypothetical behavior merely to forbid them.
7. Use direct instructions that change action or judgment.
8. Include why only when it helps the agent generalize, choose correctly in an unseen case, or avoid a harmful literal reading.
9. Repeat a shared rule only when a local reminder prevents a real failure; do not copy the owning workflow.
10. Keep authoring status, evaluation caveats, evidence gaps, changelog notes, and readiness metadata out of the subject `SKILL.md`; they do not guide the executing agent.

Use discussion, research, and author reasoning to understand the target behavior. Do not copy conversation history, author debate, iteration notes, rejected drafts, or explanation written for collaborators into the skill. Translate that context into only the instructions, definitions, boundaries, and examples a first-time executing agent needs.

A skill may rely on guaranteed base context. Do not assume an optional sibling skill, reference, or accidental earlier read. Link conditional dependencies and state when to read them.

Read [agent-first instructions](references/agent-first-instructions.md) when wording, placement, undeclared context, or author explanation is obscuring execution.

## Use Examples Deliberately

Add a compact behavioral example when prose alone leaves a likely misclassification. Show the observable situation and the required action, stop, exit, or route.

Keep examples general enough to transfer beyond one fixture. Do not turn the body into a transcript, test suite, or scenario catalog. Inline examples teach; behavioral evals test whether the skill changes behavior under pressure.

## Add Resources Only When Needed

Start with one `SKILL.md`. Keep a new single-file skill at 120 lines or fewer unless a live repo rule or measured failure requires more. Remove repeated prose and low-value checklists before expanding the file set.

Add a reference only for conditional depth. Add a script only for repeated deterministic work that is risky or wasteful to retype. Link every resource from `SKILL.md` with an observable read or run condition.

Do not add README files, changelogs, example collections, references, or scripts merely to appear complete. Read [progressive disclosure](references/progressive-disclosure.md) before adding resources.

## Evaluate Before Claiming Readiness

Static validation proves structure, not behavior. Record unevaluated behavior as Draft or Unverified and name the missing evidence in the owning eval artifact, evidence report, release/current-state metadata, Working Record, tool result, or delivery response—not in the subject `SKILL.md`.

Read [Evaluate Skill](../evaluate-skill/SKILL.md) when testing activation, first-read behavior, nearby behavior, dependencies, retained use, artifact outcomes, or readiness. Preserve adequate existing evidence, revise one measured pressure point at a time, and rerun the complete fixed case after a behavioral change.

Do not claim activation from body injection, retained use from one turn, or dependency behavior from undeclared context. Read [the development loop](references/development-loop.md) when revising from measured failure or deciding whether evidence supports promotion.

## Bundled Tool

Use the bundled [skill author](scripts/skill-author.mjs) for deterministic structure work. Resolve the link relative to this skill directory, then run `node <resolved-path> init|validate|inspect`. Validation proves structure; inspection reports advisory signals. Neither proves behavior.

## Stop

Stop and ask when the requested public behavior, activation boundary, dependency, safety rule, or compatibility choice is unclear and cannot be settled from evidence. If required readiness evidence is unavailable or forbidden, keep the external claim Draft or Unverified and name the gap without annotating or weakening the active skill body.
