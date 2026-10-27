---
name: write-skill
description: "Use when creating, revising, merging or splitting a skill or any other text an agent acts on: a SKILL.md and its description, the references and scripts in a skill, AGENTS.md, CLAUDE.md, system or runtime prompts, tool descriptions, subagent briefs or judge prompts. Also use when deciding where an instruction should live, and when a skill is read at the wrong time, not read at all, or read but not followed."
---

# Write Skill

Write the smallest agent-first skill package that changes one coherent behavioral policy, or the smallest change to other instruction text an agent acts on.

**Other instruction text** is anything an agent reads and acts on that is not a skill package: an instruction file such as AGENTS.md or CLAUDE.md, a system or runtime prompt, a tool description, a subagent brief, or a judge prompt. For it, everything below applies except what concerns the package itself: the skill's frontmatter description, resource files and their read conditions, the dependency graph, and `validate`. A tool description is a routing interface too, so Write The Description For Recall applies to it. Read "the skill" as "the text", and its first read as the point the agent receives it: every request for an always-loaded file or prompt, the tool call for a tool description, dispatch for a brief or a judge prompt.

A skill is a prompt intervention, not merely a document. A host may read its body once and retain it across later messages and tool interactions until context projection or loss. Design the first useful read, retained influence, dependencies, and recovery paths; do not assume the body will be reread before every use.

Smallest means behaviorally minimal, not shortest. A detailed skill is justified when each instruction changes action or judgment, makes a dependency executable, protects a behavioral boundary whose failure is supported by evidence, or establishes an evidence, return, or stop condition.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

This body covers the common case: writing or revising one skill or one piece of instruction text. Open a reference only when its condition holds.

| Situation | Go to |
| --- | --- |
| Deciding where an instruction lives (always-loaded text, a description, a body, a reference, a script, a tool's own text) or moving it between them; adding, merging, splitting or removing a reference, script or skill; changing links, shared terms, entry paths, capability cues or context-loss recovery cues between skills | [Placement And Dependencies](references/placement-and-dependencies.md) |
| Writing a description whose missed read could cause an irreversible or costly action, or whose neighbour matches similar requests; evidence that a skill was read late, early, not at all, or on a neighbour's request, or that two descriptions match the same request; or evidence that a read skill was misread, ignored, or kept steering later work | [Activation And Wording](references/activation-and-wording.md) |
| Measuring what a revision changes in behavior | Evaluate In One Loop, below |
| Checking structure, copied passages, or what a revision lost | Check The Package, below |
| Recording why a skill exists: its claim, evidence, rejected alternatives and dropped candidates | Keep The Design Record, below |

## Rules

- The baseline of a revision is the committed state before it. Before committing a substantial revision, such as a merge, a split, a move between files or a rewrite, run `skill-author compare --all-units` and settle every unit it reports unmatched: restore it, name the file and line that now owns it, or record why it is removed, in a verdicts file kept with the evidence outside the package. Then someone, you or a reviewer, reads every reworded and unmatched unit for meaning, since a rewording can keep the words and change what they ask. Outside Git only, copy the package to the task's scratch folder before editing and pass `--base <folder>`. A clean comparison shows that text survived, not that behavior did.
- If accepted behavior, public dependencies, or another user-owned choice is unsettled, stop and resolve it before encoding it.
- Never rely on an unread skill or reference to cause its own read. The first read must come from context the agent already has: a description, guaranteed base guidance, an already-loaded skill, a capability cue, or another declared route.
- Rely only on context guaranteed on every valid activation path, never on an optional sibling, a common but unguaranteed route, or an accidental earlier read.
- In a skill package, link every agent-facing reference, asset, script, and package dependency from the body, with the condition that requires it. State the condition once, at the link; the resource opens with its content, not a restatement of its read condition.
- When a skill is removed or merged into another, add no alias, shim or redirect under the old name: the description of the skill that now owns the job routes the work, every link and command naming the old skill is updated, and the removed name is reported as a breaking change.
- Keep authoring status, evaluation summaries, evidence gaps, changelog notes, readiness claims, and author debate out of the executing package or text; they belong in the evaluation artifact, task record, delivery report, or the skill's design record.
- Claim only what the evidence observed. Structural checks prove structure. Explicit body delivery does not prove activation, one turn does not prove retained use, ambient context does not prove dependency behavior, prose review does not prove unchanged behavior, and one favorable example does not prove readiness.
- For a skill package, run `validate` after any structural or dependency change and before claiming the package is valid. Never use deprecated authoring tooling.

## Choose What To Change

Goal: change a skill only for behavior that will recur, and only where prose is the right fix.

When revising from evidence, such as observed failures, transcripts, review findings or eval results, list each candidate change with the evidence behind it. Drop a candidate that is:

- **not durable:** a one-off slip that the situation, not the guidance, explains;
- **too specific:** it fits one task or fixture, not the class of situations the skill serves;
- **a duplicate:** another candidate, or another skill, already owns it;
- **already covered:** the skill says it, and the failure lies elsewhere, such as activation or placement; fix that boundary instead;
- **structural:** a tool, script, check or runtime change prevents it more reliably than an instruction.

Keep dropped candidates and their reasons with the evidence, outside the package, in the skill's design record (Keep The Design Record, below).

## Prefer A Capability To Prose

Goal: the fact or check the agent needs is in front of it at the decision.

Prose changes behavior only when it is in context at the decision, and a skill body often is not: in 30 of Freeflow's own evaluation runs, 3 read any skill file. A script, a tool's output or a structured artifact reaches the decision whether or not a body was read. Before writing an instruction, ask whether a capability can do its job:

- **Replace mechanical prose:** a format, command list or check followed by hand becomes a script that does or checks it, such as `skill-author validate` for frontmatter and links.
- **Enable the main work:** a script puts the decision's facts in front of the agent, such as Verify Work's `test-changes.mjs`, which lists every changed existing test so the agent and its reviewer judge each one.

The prose then names the capability where it is used and keeps only the judgment a script cannot make. Add a script only for work the skill owns, never to make a package look complete.

## Choose Skill Boundaries

Goal: few skills, each owning one job in depth.

Every skill's description is loaded on every request, and neighbours whose descriptions overlap confuse the choice between them. Prefer depth to width: when several skills do one job split by type, such as commit, push and release, merge them into one skill whose body routes to a reference per type. Call such a skill a trunk: one capability, whose body routes to the references and scripts each of its situations needs. Keep a skill separate when its reader, trigger or job differs: another person or agent reads it, another request or situation calls for it, or it produces a different result.

Depth wins because guidance changes a decision only when every link holds: the description gets the skill read, the routing table gets the right reference or script read when its situation arises, and the agent applies what it read. The links multiply, so each extra skill boundary between a request and the method lowers the chance the method reaches the decision. Between skills, the choice is made from one description among all the others. Inside a trunk, it is made from a routing table with the body in context, and a body the host keeps in context can still route when the situation arises later. A script's output skips the chain: it is in front of the agent whether or not anything was read.

When the same workflow is rebuilt by hand across several tasks and no skill owns it, first check whether it is a branch of an existing skill; otherwise propose a new skill to the user, naming the tasks it recurred in.

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

## Keep The Design Record

Goal: whoever changes the skill next, a person or an agent, knows what it is meant to change and why, without the conversation that produced it.

The package holds only what the executing agent acts on, so the reasons behind it need a home of their own. Where the repository keeps developer docs, each skill has a design record there, in Write Docs' [skill design record](../write-docs/references/documentation-shapes.md#skill-design-record) shape. It holds:

- the behavioral claim above, as the skill currently makes it;
- the design and why: its boundaries, the structure of the package, and where each behavior was placed;
- the evidence for and against the claim, with where it is stored and what it can and cannot show;
- the alternatives rejected, with the reason, so they are not rebuilt;
- the candidates dropped under Choose What To Change, with the reason;
- the open questions.

Update it in the same change as the package. When the repository keeps no developer docs, keep this in the task record and say so in the delivery report.

## Shape The Package

Goal: the common case runs from `SKILL.md` alone, and the depth one situation needs sits in one place.

- `SKILL.md` is enough to act correctly in the common case without opening a reference.
- When the skill has references, a routing table comes first in the body: each row names a concrete, observable condition and the reference or section that serves it. "When unclear" is not a condition.
- A reference holds one situation's method. Add one only when its condition is narrow, so that many activations never reach it, and its content is large, so that inlining it would bury the common route; otherwise keep it inline.
- Merge references that are read together.
- Route from the body: every reference a situation needs has its row in the body's routing table, so reaching it never depends on first reading another reference. A reference may still point to a sibling for a neighbouring situation.
- Keep a trunk's body light: it is paid on every activation, so it holds the routing table, the common route and the Rules, and anything most activations do not use moves to a reference or a script.
- Give each rule one owner; everywhere else, point to it rather than restate it (Repeat Instructions Deliberately).
- Declare only the dependencies the skill's normal and conditional routes need.

Start with one `SKILL.md` and remove accidental complexity before splitting files. There is no universal body template, line limit, or reference count.

## Design The First Read

Goal: the skill is read at the earliest decision it can improve, and reading it on a nearby case does no harm.

Missing that decision is usually far more harmful than an unnecessary early read. A nearby case can pass by not loading the skill, or by loading it, recognizing that its method does not apply, and exiting without distorting later work. An early read is cheap only when the retained body stays safe; a skill that exits on the first turn but keeps distorting later work is not a safe read. When a missed read is costly, give the skill an upstream activation or recovery edge, as Placement And Dependencies describes.

## Write The Description For Recall

The description is a routing interface, not a summary of the body.

- State the broad core job in plain language, with natural user verbs or task conditions visible before activation.
- Avoid terminology or classifications introduced only inside the skill or an optional dependency.
- Name the situations each reference and script serves, in the words a request would use. A reference is reached only through its skill, so when skills merge, the owner's description keeps the triggers of every job it absorbed.
- Make it as long as recall needs, up to the host's limit (1,024 characters in the Agent Skills format). Every description is loaded on every request, but a missed read costs the decision the skill exists to change.
- Avoid future-duration guesses, named internal phases, marketing claims, and compressed copies of the body.
- "Use when…" is useful wording, not mandatory grammar.

Favor recall: an unneeded read is cheap when the body exits safely, and a missed read is not. Add a "not for" exclusion only when reading the skill on that request would do harm, such as retained guidance that routinely overrides another owner or method, never merely to prevent harmless reads.

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

Use discussion, research, and author reasoning to understand the behavior, then compile that understanding into runtime instructions. The conversation, rejected drafts, fixture narration, and any explanation whose only reader is the author stay out; what a later author needs from them goes in the design record.

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

> Delegate work when a cheaper profile can do it without significant quality loss and the handoff costs less than it saves. A separate record update across several entries often qualifies; a one-line update in the middle of your own work does not.

When a skill contains both kinds, say so once near the top: which instructions are binding, and that everything else is judgment the agent may adapt to its goal. A skill may be mostly Rules, like a release protocol, or mostly judgment, like work placement; the label keeps each one from being read as the other.

References follow the same split. A reference that defines a contract, such as a file format, schema, command interface, or protocol, is binding as written. A reference that deepens a method is judgment. A reference that is mostly one kind says so in its opening line, and states any Rule it adds; one that only restates a skill Rule as a local guard needs no label.

## Use Examples Deliberately

Add a compact example when prose alone leaves a likely misclassification. Show the observable situation, the required action or judgment, and the relevant stop, exit, or return.

Keep examples transferable; the body is not a transcript, fixture library, or scenario catalog. Inline examples teach the subject and are part of the candidate intervention, not independent evidence that the skill works.

## Compact Without Erasing Behavior

Goal: remove what does not change behavior, and nothing that does.

Compact after the behavioral policy, dependencies, and failure boundaries are understood. For each instruction, ask:

> Can this be removed without losing required behavior, introducing ambiguity, obscuring a dependency, or reintroducing a previously observed failure?

If yes, remove or merge it.

Keep an instruction because it protects measured behavior or prevents a specific failure you can name, not because it might help. An instruction with neither is a candidate for removal: remove it, or test whether it changes behavior, rather than keeping it by default. Skills otherwise only grow, as each incident adds instructions and none is ever shown safe to remove.

Remove an instruction once the mistake it guards against can no longer happen, for example because a tool now refuses the action or the capability it guarded is gone. Keep a local guard only for a path that still bypasses the enforcement.

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

Repetition earns its place when local presence protects an independently activated skill, a distinct decision point, a context-loss or host path, a dangerous literal reading, retained use after the method ends, a previously observed failure, or a required read condition. Keep the full definition or method with one canonical owner and repeat only the compact guard at the affected choice.

> Repeat the behavioral invariant, not the owning skill's entire explanation.

Repetition for emphasis, author reassurance, or stylistic consistency does not earn its place. Check that repeated wording keeps the same meaning and route. Removing, merging, moving, or rewording an instruction that protects measured behavior is a behavioral change; evaluate the affected boundary.

## Evaluate In One Loop

Goal: every revision answers observed evidence and is checked against it.

1. Start from the source: the evidence a change answers (Choose What To Change), or for a new skill, its behavioral claim.
2. Name the exact claim: description activation, first-read body behavior, nearby behavior, dependency composition, retained use, artifact outcome, or cross-host behavior.
3. Fix the cases before the draft is final: one that should use the guidance, a near miss that should not, and for judgment, one where following the default literally is the worse choice.
4. Run the arms with [Evaluate Behavior](../evaluate-behavior/SKILL.md) under fixed declared inputs; when the claim is that the revision is better, declare the decision rule before the run.
5. Read the transcripts and results, with the user when they review, before trusting a count.
6. Revise one measured pressure point.
7. Rerun the complete fixed group with every arm.

Stop when the evidence supports the claim, or when the next revision would only tune against the same cases; judge it on held-out cases instead. Preserve adequate existing evidence rather than rerunning it.

Evaluate the two kinds differently. A Rule passes when it is never broken, including under pressure to break it. Judgment passes on outcome, and its evidence should include a case where following the default literally is the worse choice, so a candidate that only obeys cannot pass.

Small wording, ordering, vocabulary, repetition, and structural changes can alter model behavior. Human review establishes intended meaning; behavioral evidence establishes observed effect.

## Check The Package

Use the bundled [skill author](scripts/skill-author.mjs) for deterministic package work:

```text
node <write-skill-directory>/scripts/skill-author.mjs init <directory> --name <name> --description <text>
node <write-skill-directory>/scripts/skill-author.mjs validate <directory> [--package-root <directory>] [--routing-map <file>]
node <write-skill-directory>/scripts/skill-author.mjs inspect <directory> [--package-root <directory>]
node <write-skill-directory>/scripts/skill-author.mjs similarity <directory> [--threshold <0-1>]
node <write-skill-directory>/scripts/skill-author.mjs compare [<base-ref> [<new-ref>] | --base <folder> [<folder>]] [--all-units] [--verdicts <file>]
```

- `init`: create a new minimal package; it never overwrites an existing one.
- `validate`: check frontmatter, heading shape, recursive links, declared package dependencies, and containment. It also lists link cycles among the Markdown files the skill reaches, leaving out links to any `SKILL.md`; Placement And Dependencies says what to do with one. With `--routing-map`, it checks that the map's row for the skill names the same sibling skills and resources that `SKILL.md` links.
- `inspect`: report body sizes, resource classes, scripts, unlinked files, and validation findings, when factual inventory matters.
- `similarity`: report Markdown files under a directory that share copied or lightly edited passages. Run it across related skills before keeping repetition; it cannot detect paraphrase, so a clean report does not prove an instruction is stated once.
- `compare`: with no arguments, compare the model-facing Markdown changed since the branch left the default branch with the working tree, uncommitted edits included, and list each rule-like unit (under a Rules heading, a numbered step, or containing never, always, must, only, do not or stop, or a reason: because, so that, otherwise, why) that no longer appears; `--all-units`, for a substantial revision, lists every unmatched unit. It exits nonzero while one has no verdict in `--verdicts <file>`, a JSON object of `"file:line": "verdict"` that carries across runs. Read every reworded rule it lists as well: a rewording can keep the words and change the meaning. `--help` gives the other options.

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
- contains no author-facing residue, and its design record, where the repository keeps one, says why;
- passes required structural checks, and after a substantial revision has a verdict for every rule-like unit it no longer states.

Stop and ask when accepted behavior, activation, dependencies, or another user-owned choice cannot be settled from evidence. Do not add sections, references, examples, scripts, or procedure merely to make the package look complete.
