---
name: write-skill
description: Use when creating or revising an agent skill.
---

# Write Skill

Write the smallest agent-first skill that changes one named behavior.

## Establish The First Read

Before writing, identify:

- the behavior and failure the skill must change;
- the earliest natural prompt or situation where its guidance becomes useful;
- the cues an agent can observe before reading the body;
- the context guaranteed to be loaded before this skill;
- a nearby case that should not be hijacked.

A description cannot rely on terminology or classifications taught only inside the skill. The body must work for an agent reading it for the first time with only declared guaranteed context.

If public behavior, dependencies, safety, or compatibility remain unsettled, stop and resolve that boundary before encoding it.

## Preserve Before Substantial Revision

Before rewriting or substantially editing an existing skill, snapshot the complete current package—`SKILL.md`, references, scripts, and other owned resources—and record an exact identity. Use a recoverable Git ref or task evidence outside the active package so the rewrite cannot replace its own baseline.

A small local wording correction does not need an extra snapshot when the exact prior state is already recoverable and the change does not alter behavior, dependencies, or package structure.

## Write The Description

Optimize for the first useful read, not repeated reads.

- State the broad core job in plain language.
- Use cues observable in the user request or immediate task state.
- Prefer broad recall when loading the skill is safe and the body can exit cleanly.
- Do not require the agent to predict an internal classification taught only after activation.
- Do not turn the description into an exhaustive trigger taxonomy or compressed summary of the body.
- Treat “Use when…” as useful advice, not required grammar.

A nearby case may pass by not loading the skill or by loading it and exiting without changing the task incorrectly. Do not narrow a description solely to prevent harmless reads, and do not broaden it until the skill routinely overrides the actual owning job.

Read [activation boundaries](references/activation-boundaries.md) when the boundary is unclear or evidence shows missed, late, early, or task-hijacking activation.

## Write For The Executing Agent

1. Establish the skill’s job immediately.
2. Define necessary terms before relying on them.
3. Put rules where the agent first makes the affected choice.
4. Keep the normal route understandable from `SKILL.md`; when it requires another resource, name that dependency and its read condition before relying on it.
5. Say what to do, what not to do, and when to stop, exit, or route.
6. Lead with required behavior. Use a negative instruction only to block a plausible or observed failure, and pair it with the positive action, exit, or route.
7. Use direct instructions that change action or judgment.
8. Include why only when it helps the agent generalize, choose correctly in an unseen case, or avoid a harmful literal reading.
9. Repeat a shared rule only when a local reminder prevents a real failure; do not copy the owning workflow.
10. Keep authoring status, evaluation summaries, evidence gaps, changelog notes, and readiness prose out of the executing skill.

Use discussion, research, and author reasoning to understand the target behavior. Do not copy conversation history, author debate, iteration notes, rejected drafts, or explanation written for collaborators into the skill. Translate that context into only the instructions, definitions, boundaries, and examples a first-time executing agent needs.

A skill may rely on guaranteed base context. Do not assume an optional sibling skill, reference, or accidental earlier read. Link dependencies and state when to read them.

Read [agent-first instructions](references/agent-first-instructions.md) when wording, placement, undeclared context, or author explanation is obscuring execution.

## Use Examples Deliberately

Add a compact behavioral example when prose alone leaves a likely misclassification. Show the observable situation and the required action, stop, exit, or route.

Keep examples general enough to transfer beyond one fixture. Do not turn the body into a transcript, test suite, or scenario catalog. Inline examples teach; behavioral evals test whether the skill changes behavior under pressure.

## Add Resources Only When Needed

Read [progressive disclosure](references/progressive-disclosure.md) before adding or reorganizing references and scripts.

Start with one `SKILL.md`. Remove repeated prose and low-value checklists before expanding the file set.

- Add a required reference when normal execution genuinely needs separately owned depth; link it before the dependency is used.
- Add a conditional reference when a distinct branch needs depth that would obscure the normal route; state the observable condition for reading it.
- Add a script for repeated deterministic work or a feature the skill owns when automation is safer, clearer, or materially less wasteful than retyping it.
- Link every agent-facing reference, asset, declared dependency, and executable entrypoint from `SKILL.md`; internal implementation modules need not be linked.
- Keep owned resources inside the skill package unless a declared package dependency is required.
- Treat unlinked-file inspection as factual inventory, not an automatic defect.
- Do not add resources merely to make the package look complete.

There is no universal body template, section inventory, wording rule, file-count target, or requirement that a script follow an earlier failure.

## Evaluate The Behavioral Claim

Static validation proves structure, not activation or behavior. Name the exact claim being tested: description activation, first-read body behavior, nearby behavior, dependency composition, retained use, or artifact outcome.

Use [Evaluate Skill](../evaluate-skill/SKILL.md) to compare exact baseline and candidate environments under fixed declared inputs. Preserve adequate existing evidence, revise one measured pressure point at a time, and rerun the complete fixed group after a behavioral change.

Do not claim activation from body injection, retained use from one turn, or dependency behavior from ambient context. Keep behavior conclusions and missing evidence in the owning evaluation, Working Record, or delivery response rather than annotating the executing skill.

## Check The Package

Use the bundled [skill author](scripts/skill-author.mjs) for deterministic structure work:

```text
node <write-skill-directory>/scripts/skill-author.mjs init <directory> --name <name> --description <text>
node <write-skill-directory>/scripts/skill-author.mjs validate <directory> [--package-root <directory>]
node <write-skill-directory>/scripts/skill-author.mjs inspect <directory> [--package-root <directory>]
```

Choose the command by job:

- `init`: use only for a new package. It creates the directory and minimal `SKILL.md` and refuses to overwrite an existing one.
- `validate`: use after structural or resource changes and before claiming structural validity. It checks frontmatter, the top-level heading, recursive links, package dependencies, cycles, and containment.
- `inspect`: use when body sizes, resource classes, scripts, unlinked files, and validation findings are needed. It reports facts rather than quality.

Commands emit JSON. Invalid structure still emits its report and exits nonzero; command errors emit structured error JSON.

- Package root defaults to the nearest `package.json` ancestor, falling back to the skill directory’s parent. Use `--package-root` to set it explicitly.
- Frontmatter accepts flat plain strings or JSON-compatible double-quoted strings. Double-quote values when there is any ambiguity, especially punctuation, numbers, booleans, or null-like text.

Never import or invoke deprecated tooling.

## Stop

Stop when the requested skill is minimal, executable on first read, honest about its dependencies, and free of author-facing status. Stop and ask when public behavior, activation boundaries, dependencies, safety, or compatibility cannot be settled from evidence. Do not add resources or procedure merely to make the package look complete.
