# Documentation Shapes

Read this before choosing the structure of an overview, a subsystem doc, or a folder README, or before restructuring one.

This reference is judgment except for the header: these are shapes to adapt, not mandatory templates. Where the repository already has documentation conventions, follow them and borrow from these shapes only what they lack. Use the sections a document's readers need, in the order that serves them, and leave out a section with nothing true to say.

The header is binding when you use it, because the [docs check](../scripts/docs-check.mjs) reads it. Use it on a document whose code the check should watch for staleness.

## Header

An overview and a subsystem doc start with a title and a header block:

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

## Adapting To The Software

Shape the sections around what readers of this software need to know before changing it. For example:

- **A library:** the surface is its public API, so Surface becomes the API reference or points to the generated one; add compatibility promises and how versions change.
- **A service:** add how it is deployed, configured per environment, observed, and recovered; operational steps are how-to content, so keep them in a separate runbook the doc links.
- **A command-line tool:** the surface is its commands, flags, exit codes, and output formats.
- **A data pipeline:** add data shapes at each stage, ordering and idempotency guarantees, and what reprocessing does.
- **A small module:** purpose, surface, and a few invariants may be the whole document, or a folder README may be enough.

## User Guide

A user guide is task-oriented: what the user can do, the settings and commands involved, and what they will see. Keep internals out unless the user must understand them to use the feature correctly, and link the subsystem doc for readers who want more.
