---
name: "compaction"
description: "Use when Freeflow says compaction is due or the user asks to compact: prepare what the conversation needs to continue, then compact with freeflow_compact."
---

# Compaction

Compaction replaces the conversation with what you write, and starts a new cycle: the stretch of conversation until the next compaction. The next cycle starts from your summary, the Working Record and what it points to, the carried context, and the lines Freeflow adds itself; everything else leaves your context, this skill included. Most drift after compaction comes from a summary that lost something the next step needed.

The summary works like a Working Record ([Track Work](../../skills/track-work/SKILL.md)) for one cycle. Ask Track Work's question: if context were lost now, what would the next context need that it could not recover from the Working Record, its defining artifacts, the workspace, or the carried context? Write that, and nothing more. Concise is not lossy: keep a detail when removing it could change the next action.

## Rules

The Rules are binding; if one cannot be met, stop and say why. The rest of this skill is judgment: follow its goal, and adapt when a different choice serves it better.

- With a Working Record, update it first (Track Work, "Prepare For A Context Boundary"), then write the summary, so the two agree. Name the record's path in the summary: Freeflow never names one, and recovery starts from it.
- Compaction is a context boundary, not a Slice transition or a Checkpoint. Do not rush, close, or pause a Slice to compact, claim an unfinished check passed, or guess the outcome of a running operation.
- Never write a requested, reported, or expected result as observed. Name every partial or uncommitted change, unverified result, running command, and obligation still waiting on its trigger.
- Keep exact: paths, identifiers, commands, error text, numbers, and the user's words wherever wording matters. Never paraphrase a decision or a constraint.
- Material that exists only in the conversation, such as a pasted file or a long message, leaves with it. With a Working Record, save it under the task's `sources/` and point to it; without one, quote what matters in the summary.
- Under Cognitive Routing with projection, the Coordinator does not compact: its view leaves out what workers did. Delegate an assignment whose contract says to compact with `freeflow_compact` and then return with `freeflow_return`, plus any other work it covers: after compacting, the worker sees the contract again but not its own `freeflow_compact` call. A worker's summary covers the whole session: the user's requests, the Coordinator's decisions, and the state of other work.

## When to compact

Goal: compact where stopping loses nothing that is not written down. That is a safe point: a finished step whose result you know, such as a check you ran and read, a complete set of edits, or a written report. Halfway through an edit set, with a command still running, or partway through a batch of reads you need together is not one.

- At Freeflow's first notice ("compaction is due soon"): if you are at a safe point, compact now. If your work ends within a step or two, such as a return or a final answer, finish it instead; it ends the context's growth without a compaction. Otherwise finish the current step, start nothing large, then compact.
- At "compact now", or when the user asks: the end of your current step is the safe point. If the step cannot end soon, write its partial state into the record or summary and compact.

## The summary

The previous cycle's summary is at the top of your context. Fold what still holds into the new one; drop what is done or no longer matters. Write state, not a story: what is true now, not the order things happened in. Leave out what the Working Record holds and what Freeflow states itself: the cycle, the routing profile, running background commands, and the files read and changed.

Read [Summary Format](references/summary-format.md) before writing, and use the shape that matches the work:

- **With a Working Record**, the record holds the task. The record-backed shape (`Task`, `Now`, `In flight`, `Next steps`) lets a fresh context continue the current step correctly on its own; the record lets it continue the task.
- **Without one**, the summary is the record for this cycle, in the record-shaped shape: the record's own headings.

Compaction never creates a record; whether a task needs one is decided at its start or when facts change its scope.

The limit is about 8,000 tokens. Most summaries need far less. If `freeflow_compact` refuses the call, fix what it names and call it again.

## What to carry

The notice gives the budget. Freeflow carries the newest results of your work in progress itself (under Cognitive Routing, those of your current assignment; otherwise, those of this cycle), filling whatever budget your picks leave, and lists the rest by ref. Pick only what that misses and the next step needs in full: older output you are working from (by routing ref, such as `ctx:1a2b3c4d`, when Cognitive Routing is on; otherwise by the id in the notice's list) and files you are changing (line ranges for large files), which are read fresh at compaction. Leave out what is cheap to re-read or already in the summary or record. The user's latest messages are carried for you. When the notice says context reuse is off, pick nothing.

## After compaction

This skill leaves your context with the rest of the conversation. Freeflow's recovery message, right after the carried context, says how to recover; follow it.
