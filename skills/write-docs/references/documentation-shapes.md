# Documentation Shapes

This reference is judgment except for the header: these are shapes to adapt, not mandatory templates. Where the repository already has documentation conventions, follow them and borrow from these shapes only what they lack. Use the sections a document's readers need, in the order that serves them, and leave out a section with nothing true to say.

The header is binding when you use it, because the [docs check](../scripts/docs-check.mjs) reads it. Use it on a document whose code the check should watch for staleness.

## Starting Developer Docs

First look for the project's own docs index, in this order: `dev-docs/README.md`, `ARCHITECTURE.md`, a `README.md` in `docs/`, then a docs folder the root `README.md` names. The first one found is the index. A project that has one keeps its home and its conventions: map these shapes onto what is there, never start a second tree, and never move existing docs without the user's yes.

Only when the project has no developer docs, propose this layout:

```text
dev-docs/
  README.md      overview: purpose, parts, code map, rules across the code, review rules, index of docs
  subsystems/    how each part works and why
  features/      what the user sees, and how to drive it live
  guides/        recurring maintainer jobs, such as a release or live verification
  skills/        why each skill or other agent instruction exists, and its evidence
  adr/           hard-to-reverse decisions
```

Grow it on demand: start with `README.md` alone, and add a folder when its first document is needed. A small project may never need more than the overview and `features/`. The proposal names what the first change writes (the overview only, from the code), roughly what it costs, and what it gains.

## Header

An overview, a subsystem doc, a feature file, a live-verification guide and a skill design record start with a title and a header block:

```markdown
# Compaction

> **Covers:** `pi-extension/src/compaction/`, `pi-extension/src/index.ts`
> **Tests:** `pi-extension/tests/compaction/`
> **Verified at:** `9078dd0` (2026-10-03)
> **User docs:** `plugin-docs/capabilities/compaction.md`
```

- **Covers:** the files and directories the document describes, as repository-relative paths in backticks, separated by commas. The check reports a document as possibly stale when any of them changes after the verified commit, unless the document changed in the same commit.
- **Tests:** the tests that prove the document's claims, in the same form. Optional.
- **Verified at:** the commit the document was last checked against, in backticks, with the date. Update it only after checking the document against the code at that commit.
- **User docs:** the user guide for the same feature, when one exists. Optional.

Under the header, one or two sentences say who the document is for and what it lets them do.

## Subsystem Doc

The first part explains; the second is reference to consult while working. The sections below are the full set for a subsystem with many hidden reasons; most need fewer.

```markdown
## Purpose
## Vocabulary
## How It Works
## Decisions
## Intended Behavior That Looks Wrong
## Surface
## State
## Invariants
## Failure Behavior
## Cost
## Code Map
## Tests
## Limits
```

- **Purpose:** the problem it solves, what it does, and what it deliberately does not do.
- **Vocabulary:** the terms a reader needs, each mapped to its name in the code.
- **How It Works:** the model in prose, then its lifecycle: which events or calls drive it, in order, and what each step does. A sequence or diagram helps when several parts take turns.
- **Decisions:** one entry per choice a reader could reasonably question: the decision, the reason, the alternative rejected and why, and the source (decision record, commit, issue).
- **Intended Behavior That Looks Wrong:** behavior a careful reader would take for a bug. For each: the behavior, why it is intended, and what would break if it changed.
- **Surface:** everything outside the subsystem touches: configuration keys with defaults, commands, tools or APIs, events, messages shown to users or models.
- **State:** what is stored and where (file, entry type, schema), what lives only in memory, and how state is rebuilt after a restart, reload, or other loss.
- **Invariants:** what must always hold, including absences. Name the test that guards each one, or say that none does.
- **Failure Behavior:** what happens when each dependency or step fails, and what the user or caller sees.
- **Cost:** the performance, caching, or resource rules the subsystem follows, and any measured numbers with their date.
- **Code Map:** one line per directory or important file: what it owns, and its key types or functions by name. Point to folder READMEs for per-file detail rather than repeating it.
- **Tests:** each test file or group and what it proves.
- **Limits:** known limits and open questions, as facts about the present, not plans.

## Overview

One short document for the whole codebase, revised when its structure changes rather than with every edit.

```markdown
## Purpose
## The Parts
## Code Map
## Rules Across The Code
## Cross-Cutting Concerns
## Subsystem Docs
```

- **Purpose:** the problem the software solves, in a paragraph.
- **The Parts:** the major parts, how data and control flow between them, and the boundaries between layers.
- **Code Map:** one entry per top-level area: a sentence or three on what it does, its key types by name, and any boundary or invariant it keeps. A map of the country, not an atlas of its states.
- **Rules Across The Code:** invariants that span parts, especially absences, such as which layer never depends on which.
- **Cross-Cutting Concerns:** how errors, configuration, testing, performance, and security work across parts.
- **Subsystem Docs:** a list linking each subsystem doc with one line on what it covers.

## Folder README

A folder README orients someone about to edit files in that folder.

```markdown
# <Folder name>

<One sentence: what this folder is.> How it works and why: `<path to subsystem doc>`.

| File | Owns |
|---|---|
| `file.ts` | <what it is responsible for, in one or two sentences> |

## Rules

- <A rule that holds for code in this folder.>

Tests: `<path to the folder's tests>`.
```

Keep it to what someone editing the folder needs first. Explanation belongs in the subsystem doc it points to.

## Feature File

Subsystem docs describe the software the way the code is built; a feature map describes it the way a user meets it, with the exact steps that show each feature working in the running software. Features cut across subsystems, so the map is its own folder beside them (`features/` in the developer docs): a `README.md` index and one file per user-facing feature. Software with nothing to run, such as a pure library, has no feature map; its tests are the live check.

A feature file uses the header. **Covers** names the code behind what the user sees, so the docs check flags the steps when that code changes. **Verified at** is the commit at which every step not marked unverified was last driven, not only read. Then:

```markdown
# <Feature name>

<One paragraph: what the user sees and does.>

## Sub-features
## How to get to it (user POV)
## Driving it
## Gotchas
```

- **Sub-features:** one line each, led by a short ID (`settings-open`) that evidence names reuse.
- **How to get to it (user POV):** every entry point a user has: a command, a key, a menu, a URL.
- **Driving it:** `Preconditions:` first, then one labeled bullet per user action, with the exact command and the observable result, including side effects such as files written. Mark a step that calls a paid service, such as a model, and say what it needs before it runs.
- **Gotchas:** traps that waste or invalidate a run, entry points not driven yet, and steps left unverified, with the reason.

Name only user paths, stable handles, required state, commands, and observable results; a source path appears only when it is the only stable handle. Link the subsystem docs the feature touches. A step that could not be driven stays marked unverified. A product bug the steps expose is reported to the user, never written into the steps as expected behavior.

The index `README.md` holds what every file shares: baseline preconditions, driving conventions, how proof and skipped steps are reported, and one line per feature file.

## Live-Verification Guide

One guide shared by every feature file (for example `guides/verify-live.md` in the developer docs), with the helper script it documents kept in the repository. It uses the header, covering the helper.

```markdown
## Launch
## Health Check
## Drive
## Evidence
## Clean Up
## Paid Calls
```

- **Launch:** the exact command that starts an isolated instance from empty state, and the signal that it is usable, not merely running.
- **Health Check:** one read-only command that says whether this instance is worth driving: it is the one the run started, on the right build, with isolated state. Run it before the first step and after anything surprising.
- **Drive:** the helper's commands and the stable handles they rely on (prompts, labels, on-screen text), not coordinates or tab order.
- **Evidence:** what each step saves and where (an ignored folder), and the proof standards: drive the real user path, capture the action and the resulting state, and check side effects from a second view.
- **Clean Up:** stop only what the run started, never by process name; remove scratch state; keep the evidence.
- **Paid Calls:** which inputs call a model or another paid service, the guard that refuses them by default, and what a step needs before it may run one, such as a pinned cheap model and the user's yes.

## Skill Design Record

For anyone changing a skill or other agent instruction text: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The package holds only what the executing agent acts on; this record holds the reasons, so a later author does not rebuild a rejected design or remove an instruction that guards a measured failure. [Write Skill](../../write-skill/SKILL.md#keep-the-design-record) says what it must capture. One record per skill, at `dev-docs/skills/<skill>.md`, with the header above:

```markdown
# Review Work

> **Covers:** `skills/review-work/`
> **Tests:** `.skill-eval/review-work/`
> **Verified at:** `9078dd0` (2026-10-03)
```

```markdown
## Purpose          the job, the reader and the decision the skill exists to change
## Behavioral Claim the behavior it produces, the failure it prevents, its earliest decision, its cues,
                    the context it relies on, the nearby case it leaves alone, and when it stops steering
## Design           its boundaries, the structure of the package, and where each behavior was placed, with why
## Evidence         what was run or observed, where it is stored, and what it can and cannot show
## Rejected         alternatives considered and why each was rejected
## Dropped          candidate changes not made, and why
## Open Questions   what is unknown and what would settle it
```

Keep it to what is true of the current package, and claims are stated no more strongly than their evidence. History lives in git: Design and Rejected cite the commit where each choice was made, and `git log` on the covered paths gives the rest. Evidence that no longer applies leaves the record; its commit keeps it.

## Adapting To The Software

Shape the sections around what readers of this software need to know before changing it. For example:

- **A library:** the surface is its public API, so Surface becomes the API reference or points to the generated one; add compatibility promises and how versions change.
- **A service:** add how it is deployed, configured per environment, observed, and recovered; operational steps are how-to content, so keep them in a separate runbook the doc links.
- **A command-line tool:** the surface is its commands, flags, exit codes, and output formats.
- **A data pipeline:** add data shapes at each stage, ordering and idempotency guarantees, and what reprocessing does.
- **A small module:** purpose, surface, and a few invariants may be the whole document, or a folder README may be enough.

## Test It On A New Reader

For a new subsystem doc or overview, or one you substantially rewrote, test it on a reader without your context. Write five to ten questions a newcomer would ask: where is the code that does X, why does it do Y, is Z a bug, what breaks if W changes, which test proves V. Give a fresh agent only the document and the questions (a subagent where the host has one; otherwise ask the user to run it in a new session). Compare each answer with the code. Where an answer is wrong or unsure, fix the document and ask again. The test passes when the answers are right without new gaps; it shows the reader understood the document, not that every claim is current.

## User Guide

A user guide is task-oriented: what the user can do, the settings and commands involved, and what they will see. Keep internals out unless the user must understand them to use the feature correctly, and link the subsystem doc for readers who want more.
