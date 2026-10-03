---
name: write-docs
description: "Use when writing, updating, or reviewing documentation of how existing software works and why: architecture or subsystem docs, folder READMEs, and user guides, or when a change makes existing documentation wrong."
---

# Write Docs

Documentation tells a reader how a system works now and why it works that way, so they can use or change it without rebuilding the design from the code. It differs from a spec or a plan: those decide work before it happens and can be left behind once it is done ([Write Spec](../write-spec/SKILL.md), [Write Plan](../write-plan/SKILL.md)). Documentation describes what exists and stays true only if it changes with the code. If the document you are asked for decides work that is not done yet, use Write Spec or Write Plan instead.

Its readers include agents. An agent that reads code sees what it does but not why; without the why, it may treat a deliberate choice as a bug, rebuild a design that was rejected for a reason, or break a rule nobody wrote down. Documentation is where that knowledge outlives the task that produced it.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Write what is true now. Plans, task progress, and open work belong in the task's record, spec, or plan, not in documentation; history appears only as a short list of major changes.
- Check each claim against the code, its tests, or an observed run before writing it as fact. State what you could not check as unverified, or leave it out.
- When your change makes a document wrong, correct the document in the same change. Writing new documentation, or rewriting more than your change made wrong, needs a request or the repository's documentation rules.
- Follow the repository's documentation rules (`AGENTS.md` or its equivalent): where documentation lives, which parts need the user's approval to change, and what is public.
- Keep secrets, credentials, private task notes, and personal data out of documentation others can read.

## Choose The Document

Goal: each fact lives in one place, written for the reader who needs it.

| Reader | Document | Holds |
| --- | --- | --- |
| Someone using the software | User guide | What it does and how to use it: tasks, settings, commands, from the user's side. |
| Someone finding their way around the code | Overview (an `ARCHITECTURE.md`, or the index of the developer docs) | The problem the software solves, its parts and how they relate, a map of where things are, and the rules that hold across parts. Short and slow to change. |
| Someone changing one subsystem | Subsystem doc | How the subsystem works and why: its surface, state, invariants, decisions, failure behavior, code map, and tests. |
| Someone editing files in one folder | Folder `README.md` | What each file owns, local rules, and a pointer to its subsystem doc. |
| Anyone revisiting a hard-to-reverse choice | Decision record | The context, the decision, and its consequences. |

Prefer extending an existing document to creating a new one: a small set of current documents serves readers better than many partly current ones. A subsystem earns its own doc when the reasons behind it cannot be read from the code and readers keep needing them: agents re-derive the same design, or mistake a deliberate behavior for a bug. A user guide and a subsystem doc about the same feature are different documents for different readers; link them rather than merging them.

Write documentation where the repository keeps it. If it keeps none and you are asked to start, propose where it should live and confirm with the user before creating it.

## Write The Document

Read [Documentation Shapes](references/documentation-shapes.md) before choosing the structure of an overview, a subsystem doc, or a folder README, or before restructuring one. Its shapes are judgment to adapt to the software and to the repository's own conventions; only its header, which the docs check reads, is binding where used.

Goal: a reader with only the document and the code can make a correct change, and can tell what is deliberate.

- **Start from the code and its tests**, then read what explains them: specs, task records, decision records, commit messages, review threads. A reason that exists only in a task record or a conversation is the one most worth writing down, because it disappears with that record.
- **Name, do not link to lines.** Write paths, functions, types, configuration keys, and messages exactly, in backticks, so readers and search tools find them. Line numbers go stale with the next edit.
- **Write invariants, including absences.** "Nothing outside `config.ts` reads the config file" or "the request path never reads session files" cannot be seen by reading any one file, so state it.
- **Say what looks wrong but is intended.** For behavior a careful reader would take for a bug, state the behavior, the reason, and what would break if it changed.
- **Keep explanation apart from reference.** Explanation (purpose, how it works, why) is read once to understand; reference (surface, state, invariants, code map, tests) is consulted while working. Put them in separate sections so a reader looking up a fact does not wade through reasoning.
- **Prefer present-tense facts to narrative.** "Compaction runs at the end of a turn" rather than "We changed compaction so that it now runs at the end of a turn". History gets one short section of major changes, with commits.

Depth follows the reader's risk. A subsystem with many hidden reasons needs most of the shape; a small one may need only purpose, surface, and code map. Leave out a section with nothing true to say rather than filling it.

## Keep Documentation Current

Goal: documentation stays true as the code changes, without anyone remembering to check.

- When you finish a change, ask whether any document now says something false: a user guide, a subsystem doc, a folder README, an overview. Correct it in the same change.
- When work settles a decision about a documented subsystem (a design choice, a rejected alternative, a limit accepted on purpose), record the decision and its reason in the subsystem doc once the work it decided is done. The task record is deleted or forgotten with the task; the doc stays.
- Before you treat behavior in a documented subsystem as a bug, read its decisions and its list of intended behavior that looks wrong. If the behavior is listed there, changing it is a design change for the user to decide, not a fix.
- Delete or correct documentation that is no longer true. A wrong document misleads more than a missing one.
- After checking a document against the code, update the commit it records as verified.

## Check The Documentation

Goal: evidence that the document is accurate and that a reader without your context understands it.

Run the bundled [docs check](scripts/docs-check.mjs) after writing or changing documentation:

```text
node <write-docs-directory>/scripts/docs-check.mjs <docs-file-or-directory>... [--root <repository>] [--strict] [--json]
```

It reports paths a document names that do not exist and, for documents with the header, those whose covered code changed since the commit they record as verified. Missing paths are errors (exit code 1). Changed code is a warning, since many changes leave a document true; `--strict` makes it an error. Read the changes it lists and update the document or its verified commit.

For a new subsystem doc or overview, or one you substantially rewrote, test it on a reader without your context. Write five to ten questions a newcomer would ask: where is the code that does X, why does it do Y, is Z a bug, what breaks if W changes, which test proves V. Give a fresh agent only the document and the questions (a subagent where the host has one; otherwise ask the user to run it in a new session). Compare each answer with the code. Where an answer is wrong or unsure, fix the document and ask again. The check passes when the answers are right without new gaps.

A passing check shows the named paths exist and the reader understood the document; it does not prove every claim is current. Report what was checked.

## Stop

Stop when the document says only what is true now, each claim is checked or marked unverified, the docs check passes, and, for a new or rewritten subsystem doc or overview, the reader test answers correctly. Then return to the activity that asked for the documentation.

Stop and ask when where documentation lives, who may change it, or whether a disputed behavior is intended cannot be settled from the code, its tests, and its sources.
