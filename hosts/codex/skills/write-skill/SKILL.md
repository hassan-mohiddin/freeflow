---
name: write-skill
description: Use when creating or revising an agent skill.
---

# Write Skill

Write the smallest agent-first skill package that changes one coherent behavioral policy.

A skill is a prompt intervention, not merely a document. A host may read its body once and retain it across later messages and tool interactions until context projection or loss. Design the first useful read, retained influence, dependencies, and recovery paths; do not assume the body will be reread before every use.

Smallest means behaviorally minimal, not shortest. A detailed skill is justified when each instruction changes action or judgment, makes a dependency executable, protects a behavioral boundary whose failure is supported by evidence, or establishes an evidence, return, or stop condition.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Before substantially revising an existing skill, preserve the complete current package (`SKILL.md`, references, scripts, assets) in a recoverable Git ref or in task evidence outside the package. A small correction needs no new snapshot when the exact previous state is already recoverable and behavior, activation, dependencies, and resources are unchanged. A baseline supports recovery and comparison; it does not show that either version behaves correctly.
- If accepted behavior, public dependencies, safety, compatibility, or another user-owned boundary is unsettled, stop and resolve it before encoding it.
- Never rely on an unread skill or reference to cause its own read. The first read must come from context the agent already has: a description, guaranteed base guidance, an already-loaded skill, a capability cue, or another declared route.
- Rely only on context guaranteed on every valid activation path, never on an optional sibling, a common but unguaranteed route, or an accidental earlier read.
- Link every agent-facing reference, asset, script, and package dependency from the body, with the condition that requires it. The body and the resource state the same read condition.
- Keep authoring status, evaluation summaries, evidence gaps, changelog notes, readiness claims, and author debate out of the executing package; they belong in the evaluation artifact, task record, or delivery report.
- Claim only what the evidence observed. Structural checks prove structure. Explicit body delivery does not prove activation, one turn does not prove retained use, ambient context does not prove dependency behavior, prose review does not prove unchanged behavior, and one favorable example does not prove readiness.
- Run `validate` after any structural or dependency change and before claiming the package is valid. Never use deprecated authoring tooling.

## Establish The Behavioral Claim

Goal: know what the skill must change before deciding how it reads.

Before writing, identify:

- the behavior the skill should produce;
- the failure or misclassification it must prevent;
- the earliest decision where its guidance can change the trajectory;
- cues visible before the body is read;
- context guaranteed across every valid activation path;
- a nearby case that should not be hijacked;
- how the skill should stop influencing behavior after its method no longer applies;
- the evidence that could support or contradict the intended effect.

Begin with the behavioral intervention, not with sections, wording, examples, or file layout.

## Design The First Read

Goal: the skill is read at the earliest decision it can improve, and reading it on a nearby case does no harm.

Missing that decision is usually far more harmful than an unnecessary early read. A nearby case can pass by not loading the skill, or by loading it, recognizing that its method does not apply, and exiting without distorting later work. An early read is cheap only when the retained body stays safe; a skill that exits on the first turn but keeps distorting later work is not a safe read.

Read [Activation Boundaries](references/activation-boundaries.md) when activation is unclear or evidence shows missed, late, early, task-hijacking, or retained-interference behavior.

## Write The Description For Recall

The description is a routing interface, not a summary of the body.

- State the broad core job in plain language, with natural user verbs or task conditions visible before activation.
- Avoid terminology or classifications introduced only inside the skill or an optional dependency.
- Avoid future-duration guesses, named internal phases, exhaustive trigger catalogs, marketing claims, and compressed copies of the body.
- "Use when…" is useful wording, not mandatory grammar.

Favor recall when nearby reads are safe and a missed read is materially worse. Narrow the description when retained guidance routinely overrides another owner or method, not merely to prevent harmless reads.

## Write For The Executing Agent

Write for an agent seeing the skill for the first time with only guaranteed context.

1. Establish the job immediately.
2. Define necessary terms before using them.
3. Put each instruction where the agent first makes the affected choice.
4. Keep the normal route understandable from `SKILL.md`.
5. State what to do, what not to do, and when to stop, return, or route.
6. Prefer a positive route; use negative instructions to block plausible or observed failure, paired with the correct action or owner.
7. State why only when it helps the agent generalize or avoid a harmful literal reading.
8. Keep the skill to one coherent job. Repeat only the local guard needed from the surrounding workflow's authority, routing, continuity, review, or completion method, not the method itself.
9. Use plain words. Every coined term is something the agent must decode before it can act, so coin one only when it marks a distinction the agent has to act on, define it once, and use it the same way throughout.

Use discussion, research, and author reasoning to understand the behavior, then compile that understanding into runtime instructions. The conversation, rejected drafts, fixture narration, and any explanation whose only reader is the author stay out.

Read [Agent-First Instructions](references/agent-first-instructions.md) when a concrete first-read or retained-use failure involves wording, placement, undeclared context, author explanation, or competing instructions.

## Separate Rules From Judgment

A skill gives two kinds of instruction, and agents need to tell them apart.

- **Rules** are binding. Breaking one is wrong in every situation: authority, safety, evidence honesty, data integrity, or an invariant that a tool or another skill depends on.
- **Judgment** guides the choice among allowed actions: placement, granularity, timing, effort, what to record, how much to delegate. A better choice sometimes means departing from the default.

Classify each instruction with one question:

> If an agent pursued the goal well but broke this sentence, would the outcome be wrong in every case?

If yes, it is a Rule. If the agent would sometimes do better, it is judgment.

Agents follow imperative lists literally. A judgment written as an imperative becomes a Rule by accident: "Delegate routine record maintenance to Helper" makes an agent hand off a two-line update and then do the rest itself.

Write a Rule as a short imperative that names its trigger and its stop:

```text
observable pressure
-> required or forbidden action
-> evidence, return, or stop condition
```

Keep Rules few, testable, and together near the top, and say what to do when one cannot be met.

Write judgment as a trade-off the agent can reason from:

```text
goal
-> default and why it usually serves the goal
-> signals that a different choice serves it better
```

Examples inside judgment are illustrations, not triggers:

> Delegate a unit when a cheaper profile can do it without significant quality loss and the handoff costs less than it saves. A separate record update across several entries often qualifies; a one-line update in the middle of your own work does not.

When a skill contains both kinds, say so once near the top: which instructions are binding, and that everything else is judgment the agent may adapt to its goal. A skill may be mostly Rules, like a release protocol, or mostly judgment, like work placement; the label keeps each one from being read as the other.

References follow the same split. A reference that defines a contract, such as a file format, schema, command interface, or protocol, is binding as written. A reference that deepens a method is judgment. A reference that is mostly one kind says so in its opening line, and states any Rule it adds; one that only restates a skill Rule as a local guard needs no label.

## Use Examples Deliberately

Add a compact example when prose alone leaves a likely misclassification. Show the observable situation, the required action or judgment, and the relevant stop, exit, or return.

Keep examples transferable; the body is not a transcript, fixture library, or scenario catalog. Inline examples teach the subject and are part of the candidate intervention, not independent evidence that the skill works.

## Plan Terminology And Dependencies

Goal: every term and dependency is available on every path that reaches the skill.

For one self-contained skill, declare only the dependencies its normal and conditional routes need. Before creating or revising several related skills, shared terminology, cross-skill links, capability activation, direct or routed entry paths, or context-loss recovery, read [Skill Dependency Graphs](references/skill-dependency-graphs.md).

- Identify every valid direct and routed activation path.
- Place shared vocabulary in the nearest upstream context guaranteed before every consumer; keep leaf-specific terms local.
- Distinguish owner routes, method composition, environment interactions, references, capability cues, and retained context.
- Give critical skills an upstream activation or recovery edge.

A Markdown link declares a package dependency. It does not select the target owner or execute the linked skill.

## Compact Without Erasing Behavior

Goal: remove what does not change behavior, and nothing that does.

Compact after the behavioral policy, dependencies, and failure boundaries are understood. For each instruction, ask:

> Can this be removed without losing required behavior, introducing ambiguity, obscuring a dependency, or reintroducing a previously observed failure?

If yes, remove or merge it.

Keep an instruction because it protects measured behavior or prevents a specific failure you can name, not because it might help. An instruction with neither is a candidate for removal: remove it, or test whether it changes behavior, rather than keeping it by default. Skills otherwise only grow, as each incident adds instructions and none is ever shown safe to remove.

Compaction goes wrong when it:

- deletes the positive route while keeping only prohibitions;
- reduces a judgment to a bare imperative by dropping its goal or its signals for deviating;
- moves normal required behavior into an always-read reference;
- merges instructions whose triggers or stop conditions differ;
- replaces a concrete instruction with generic quality language;
- removes terminology a direct activation path needs;
- deletes repetition that protects a distinct decision or recovery boundary.

Length is a diagnostic fact, not a quality verdict. A long skill may be minimal; a short one may force the agent to reconstruct missing judgment.

## Repeat Instructions Deliberately

Goal: each behavior has one owner, with a local guard wherever an agent could otherwise act without it.

Repetition earns its place when local presence protects an independently activated skill, a distinct decision point, a context-loss or host path, a dangerous literal reading, a previously observed failure, or a required read condition. Keep the full definition or method with one canonical owner and repeat only the compact guard at the affected choice.

> Repeat the behavioral invariant, not the owning skill's entire explanation.

Repetition for emphasis, author reassurance, or stylistic consistency does not earn its place. Check that repeated wording keeps the same meaning and route. Removing, merging, moving, or rewording an instruction that protects measured behavior is a behavioral change; evaluate the affected boundary.

## Add Resources Only When They Change Loading Or Ownership

Before adding or reorganizing references, assets, or scripts, read [Progressive Disclosure](references/progressive-disclosure.md).

Start with one `SKILL.md` and remove accidental complexity before splitting files.

- Keep normal first-read behavior inline.
- Add an activity-required reference when one named normal activity needs separately owned depth but the skill may exit before that activity.
- Add a conditional reference when an observable branch needs depth that would obscure the normal route.
- Use an entry-required reference only when separation has independent value, such as canonical reuse, separate ownership or lifecycle, generated contracts, compatibility, or host constraints; otherwise inline it.
- Add a script when deterministic repeated work owned by the skill is safer, clearer, or materially less wasteful than model-generated operations.
- Keep owned resources inside the package unless canonical cross-package ownership is required.

There is no universal body template, line limit, reference count, or requirement that a script follow an earlier failure.

## Evaluate The Behavioral Claim

Goal: evidence that the skill changes behavior as intended, at the boundary being claimed.

Name the exact claim: description activation, first-read body behavior, nearby behavior, dependency composition, retained use, artifact outcome, or cross-host behavior. Use [Evaluate Skill](../evaluate-skill/SKILL.md) to compare exact baseline and candidate environments under fixed declared inputs.

Evaluate the two kinds differently. A Rule passes when it is never broken, including under pressure to break it. Judgment passes on outcome, and its evidence should include a case where following the default literally is the worse choice, so a candidate that only obeys cannot pass.

Preserve adequate existing evidence. Revise one measured pressure point at a time, and after a behavior-sensitive change rerun the complete fixed group with both variants.

Small wording, ordering, vocabulary, repetition, and structural changes can alter model behavior. Human review establishes intended meaning; behavioral evidence establishes observed effect.

## Check The Package

Use the bundled [skill author](scripts/skill-author.mjs) for deterministic package work:

```text
node <write-skill-directory>/scripts/skill-author.mjs init <directory> --name <name> --description <text>
node <write-skill-directory>/scripts/skill-author.mjs validate <directory> [--package-root <directory>]
node <write-skill-directory>/scripts/skill-author.mjs inspect <directory> [--package-root <directory>]
node <write-skill-directory>/scripts/skill-author.mjs similarity <directory> [--threshold <0-1>]
```

- `init`: create a new minimal package; it never overwrites an existing one.
- `validate`: check frontmatter, heading shape, recursive links, declared package dependencies, and containment.
- `inspect`: report body sizes, resource classes, scripts, unlinked files, and validation findings, when factual inventory matters.
- `similarity`: report Markdown files under a directory that share copied or lightly edited passages. Run it across related skills before keeping repetition; it cannot detect paraphrase, so a clean report does not prove an instruction is stated once.

Commands emit JSON. Invalid structure still emits a report and exits nonzero; command errors emit structured error JSON. Package root defaults to the nearest `package.json` ancestor, then the skill directory's parent; use `--package-root` for a candidate in an overlay or another package context.

Frontmatter accepts flat plain strings or JSON-compatible double-quoted strings. Quote ambiguous punctuation, number-like, boolean-like, or null-like values.

## Stop

Stop when the requested package:

- expresses one coherent behavioral policy;
- separates binding Rules from judgment;
- activates at the earliest useful boundary;
- remains safe on nearby and retained use;
- works from guaranteed context on every valid path;
- keeps its normal route executable on first read;
- declares dependencies and resource conditions honestly;
- contains no author-facing residue;
- passes required structural checks.

Stop and ask when accepted behavior, activation, dependencies, safety, compatibility, or another user-owned boundary cannot be settled from evidence. Do not add sections, references, examples, scripts, or procedure merely to make the package look complete.
