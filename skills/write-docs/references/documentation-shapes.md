# Documentation Shapes

Read this before choosing the structure of an overview, a subsystem doc, a folder README, a feature file, or a live-verification guide, or before restructuring one.

This reference is judgment except for the header: these are shapes to adapt, not mandatory templates. Where the repository already has documentation conventions, follow them and borrow from these shapes only what they lack. Use the sections a document's readers need, in the order that serves them, and leave out a section with nothing true to say.

The header is binding when you use it, because the [docs check](../scripts/docs-check.mjs) reads it. Use it on a document whose code the check should watch for staleness.

## Header

An overview, a subsystem doc, a feature file, and a live-verification guide start with a title and a header block:

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
## Changes
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
- **Changes:** major changes in a few lines each, newest first, with commits. Not a changelog of every edit.

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

## Adapting To The Software

Shape the sections around what readers of this software need to know before changing it. For example:

- **A library:** the surface is its public API, so Surface becomes the API reference or points to the generated one; add compatibility promises and how versions change.
- **A service:** add how it is deployed, configured per environment, observed, and recovered; operational steps are how-to content, so keep them in a separate runbook the doc links.
- **A command-line tool:** the surface is its commands, flags, exit codes, and output formats.
- **A data pipeline:** add data shapes at each stage, ordering and idempotency guarantees, and what reprocessing does.
- **A small module:** purpose, surface, and a few invariants may be the whole document, or a folder README may be enough.

## User Guide

A user guide is task-oriented: what the user can do, the settings and commands involved, and what they will see. Keep internals out unless the user must understand them to use the feature correctly, and link the subsystem doc for readers who want more.
