---
name: write-skill
description: Use when creating or revising an agent skill.
---

# Write Skill

Write the smallest agent-first skill package that changes one coherent behavioral policy.

A skill is a prompt intervention, not merely a document. A host may read its body once and retain it across later messages and tool interactions until context projection or loss. Design the first useful read, retained influence, dependencies, and recovery paths; do not assume the body will be reread before every use.

Smallest means behaviorally minimal—not shortest. A detailed skill is justified when each instruction changes action or judgment, makes a dependency executable, protects a behavioral boundary whose failure is supported by evidence, or establishes an evidence, return, or stop condition.

## Establish The Behavioral Claim

Before writing, identify:

- the behavior the skill should produce;
- the failure or misclassification it must prevent;
- the earliest decision where its guidance can change the trajectory;
- cues visible before the body is read;
- context guaranteed across every valid activation path;
- a nearby case that should not be hijacked;
- how the skill should stop influencing behavior after its method no longer applies;
- the evidence that could support or contradict the intended effect.

Do not begin with sections, wording, examples, or file layout. Begin with the behavioral intervention.

If accepted behavior, public dependencies, safety, compatibility, or another user-owned boundary remains unsettled, stop and resolve it before encoding a runtime rule.

## Preserve The Exact Baseline

Before substantially revising an existing skill, preserve the complete current package:

- `SKILL.md`;
- references;
- scripts;
- assets and other owned resources;
- exact package identity.

Use a recoverable Git ref or task evidence outside the active package so the revision cannot replace its own baseline.

A small local correction does not require another snapshot when the exact previous state is already recoverable and the change does not alter behavior, activation, dependencies, resource structure, or compatibility.

Preserving a baseline supports recovery and comparison. It does not prove that the baseline or candidate behaves correctly.

## Design The First Read

A skill cannot activate itself. Its first read must be caused by context already available to the agent:

- an observable skill description;
- guaranteed base or system guidance;
- an already-loaded owner or sibling;
- an effective capability cue;
- another declared upstream route.

Do not rely on an instruction inside the unread skill to cause that skill to be read.

Optimize activation for the earliest useful decision. Missing that decision may be much more harmful than a harmless early read.

A nearby case can pass by:

- not loading the skill; or
- loading it safely, recognizing that its method does not apply, and exiting without later hijacking retained behavior.

False-positive activation is cheap only when the body remains safe after retention. A skill that exits on the first turn but continues distorting later work is not a safe read.

Read [Activation Boundaries](references/activation-boundaries.md) when activation is unclear or evidence shows missed, late, early, task-hijacking, or retained-interference behavior.

## Write The Description For Recall

Treat the description as a routing interface, not a summary of the body.

- State the broad core job in plain language.
- Use natural user verbs or task conditions visible before activation.
- Prefer recall when nearby reads are safe and missed activation is materially worse.
- Do not require terminology or classifications introduced only inside the skill or an optional dependency.
- Do not encode future-duration guesses, named internal phases, exhaustive trigger catalogs, or marketing claims.
- Do not compress the body into the description.
- Treat “Use when…” as useful wording, not mandatory grammar.

Optimize for the first useful read, not repeated reads. Do not narrow a description solely to prevent harmless activation. Do not broaden it when retained guidance routinely overrides another owner or method.

## Write For The Executing Agent

Write for an agent seeing the skill for the first time with only guaranteed context.

1. Establish the job immediately.
2. Define necessary terms before using them.
3. Put each rule where the agent first makes the affected choice.
4. Keep the normal route understandable from `SKILL.md`.
5. State what to do, what not to do, and when to stop, return, or route.
6. Prefer a positive route; use negative instructions to block plausible or observed failure.
7. Pair a negative rule with the correct action or owner whenever possible.
8. State why only when it helps the agent generalize or avoid a harmful literal reading.
9. Keep the skill focused on one coherent job. Do not copy the surrounding workflow’s authority, routing, continuity, review, or completion method into a focused skill; repeat only the local guard needed at the affected choice.
10. Keep authoring status, evaluation summaries, evidence gaps, changelog notes, and readiness prose out of the executing package.

A useful rule normally identifies:

```text
observable pressure
-> required or forbidden action
-> evidence, return, or stop condition
```

Use discussion, research, and author reasoning to understand the behavior. Compile that understanding into runtime instructions. Do not copy conversation history, rejected drafts, author debate, fixture narration, or explanation whose only reader is the author.

A skill may rely on guaranteed base context and dependencies explicitly required before use. It may not rely on an unread optional sibling or reference, a common-but-unguaranteed route, or an accidental earlier read.

Read [Agent-First Instructions](references/agent-first-instructions.md) when a concrete first-read or retained-use failure involves wording, placement, undeclared context, author explanation, or competing instructions.

## Use Examples Deliberately

Add a compact example when prose alone leaves a likely behavioral misclassification.

Show:

- the observable situation;
- the required action or judgment;
- the relevant stop, exit, or return.

Keep examples transferable. Do not turn the body into a transcript, fixture library, or scenario catalog.

Inline examples teach the subject and are part of the candidate intervention. They are not independent evidence that the skill works.

## Plan Terminology And Dependencies

For one self-contained skill, declare only the dependencies its normal and conditional routes need.

Before creating or revising multiple related skills, shared terminology, cross-skill links, capability activation, direct or routed entry paths, or context-loss recovery, read [Skill Dependency Graphs](references/skill-dependency-graphs.md).

For every skill:

- identify every valid direct and routed activation path;
- rely only on context guaranteed across all valid paths;
- place shared vocabulary in the nearest upstream context guaranteed before every consumer;
- keep leaf-specific terms local;
- distinguish owner routes, method composition, environment interactions, references, capability cues, and retained context;
- ensure critical skills have an upstream activation or recovery edge;
- do not assume a commonly preceding skill is guaranteed.

A Markdown link declares a package dependency. It does not automatically select the target owner or execute the linked skill.

## Compact Without Erasing Behavior

Compact after the behavioral policy, dependencies, and failure boundaries are understood.

For each instruction, ask:

> Can this be removed without losing required behavior, introducing ambiguity, obscuring a dependency, or reintroducing a previously observed failure?

If yes, remove or merge it. If uncertain, preserve it until evidence distinguishes the variants.

Do not compact by:

- deleting the positive route while retaining only prohibitions;
- moving normal required behavior into an always-read reference;
- merging rules whose triggers or stop conditions differ;
- replacing a concrete instruction with generic quality language;
- removing terminology required by a direct activation path;
- deleting repetition that protects a distinct decision or recovery boundary.

Length is a diagnostic fact, not a quality verdict. A long skill may be minimal. A short skill may force the agent to reconstruct missing judgment through reasoning or environment interactions.

## Repeat Rules Deliberately

Repetition is justified when local presence protects:

- an independently activated skill;
- a distinct decision point;
- a context-loss or host path;
- a dangerous literal interpretation;
- a previously observed failure;
- a required body-to-reference read condition.

Use one canonical owner for the full definition or method. Repeat only the compact local guard needed at the affected choice.

> Repeat the behavioral invariant, not the owning skill’s entire explanation.

Do not repeat rules merely for emphasis, author reassurance, or stylistic consistency. Check that repeated wording preserves the same meaning and route.

When removing, merging, moving, or rewording a rule that protects measured behavior, treat the candidate as a behavioral change and evaluate the affected boundary.

## Add Resources Only When They Change Loading Or Ownership

Before adding or reorganizing references, assets, or scripts, read [Progressive Disclosure](references/progressive-disclosure.md).

Start with one `SKILL.md`. Remove accidental complexity before splitting files.

- Keep normal first-read behavior inline.
- Add an activity-required reference when one named normal activity genuinely needs separately owned depth but the skill may exit before that activity.
- Add a conditional reference when an observable branch requires depth that would obscure the normal route.
- Use an entry-required reference only when separation has independent value, such as canonical reuse, separate ownership or lifecycle, generated contracts, compatibility, or host constraints.
- Inline entry-required content when every useful activation reads it and separation provides no distinct value.
- Add a script when deterministic repeated work owned by the skill is safer, clearer, or materially less wasteful than model-generated operations.
- Link every agent-facing resource, package dependency, and executable entrypoint from the body at its first useful decision.
- Keep owned resources inside the package unless canonical cross-package ownership is required.

The body and reference must name the same read condition. A reference cannot activate itself.

There is no universal body template, line limit, reference count, or requirement that a script follow an earlier failure.

## Evaluate The Behavioral Claim

Static inspection and package validation prove structure, not behavior.

Name the exact claim being tested:

- description activation;
- first-read body behavior;
- nearby behavior;
- dependency composition;
- retained use;
- artifact outcome;
- cross-host behavior.

Use [Evaluate Skill](../evaluate-skill/SKILL.md) to compare exact baseline and candidate environments under fixed declared inputs.

Preserve adequate existing evidence. Revise one measured pressure point at a time. After a behavior-sensitive change, rerun the complete fixed group with both variants.

Do not claim:

- activation from explicit body injection;
- retained use from one turn;
- dependency behavior from ambient context;
- unchanged behavior from prose review;
- improvement from structural validation;
- readiness from one favorable example.

Small wording, ordering, vocabulary, repetition, and structural changes may alter model behavior. Human review can establish intended meaning; behavioral evidence establishes observed effect.

Keep evaluation conclusions and missing evidence in the evaluation artifact, task record, or delivery report—not in the executing skill.

## Check The Package

Use the bundled [skill author](scripts/skill-author.mjs) for deterministic package work:

```text
node <write-skill-directory>/scripts/skill-author.mjs init <directory> --name <name> --description <text>
node <write-skill-directory>/scripts/skill-author.mjs validate <directory> [--package-root <directory>]
node <write-skill-directory>/scripts/skill-author.mjs inspect <directory> [--package-root <directory>]
```

Choose the operation by its evidence:

- `init`: create a new minimal package; never overwrite an existing one.
- `validate`: check frontmatter, heading shape, recursive links, declared package dependencies, and containment.
- `inspect`: report body sizes, resource classes, scripts, unlinked files, and validation findings.

Run `validate` after structural or dependency changes and before claiming package validity. Use `inspect` when factual inventory or package composition matters.

Commands emit JSON. Invalid structure still emits a report and exits nonzero; command errors emit structured error JSON.

Package root defaults to the nearest `package.json` ancestor, then the skill directory’s parent. Use `--package-root` when validating a candidate in an overlay or another package context.

Frontmatter accepts flat plain strings or JSON-compatible double-quoted strings. Quote ambiguous punctuation, number-like, boolean-like, or null-like values.

Package validity does not prove behavioral quality. Never use deprecated authoring tooling.

## Stop

Stop when the requested package:

- expresses one coherent behavioral policy;
- activates at the earliest useful boundary;
- remains safe on nearby and retained use;
- works from guaranteed context on every valid path;
- keeps its normal route executable on first read;
- declares dependencies and resource conditions honestly;
- contains no unsupported author-facing residue;
- passes required structural checks.

Stop and ask when accepted behavior, activation, dependencies, safety, compatibility, or another user-owned boundary cannot be settled from evidence.

Do not add sections, references, examples, scripts, or procedure merely to make the package look complete.
