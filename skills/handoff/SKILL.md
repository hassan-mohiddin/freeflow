---
name: handoff
description: Use when pausing, compacting, transferring, or resuming consequential work; when current context cannot safely finish the next slice; or when a temporary or durable continuation checkpoint must preserve evidence, decisions, route changes, and the next executable horizon for a fresh context.
---

# Handoff

Preserve the smallest continuation state a fresh context needs to choose the next safe action.

A handoff is memory, not authority. It records evidence and route state; it does not freeze the plan, replace live inspection, or prove completion.

## Choose Destination

- **Temporary handoff:** immediate continuation after pause, compaction, or session change. Use the OS temporary location unless the user gives a path.
- **Repo memory handoff:** durable project continuation context. Use the repo's established handoff location, usually `docs/handoffs/`.

If destination materially affects durability, authority, privacy, or repository state and the user has not chosen, ask one direct question before writing. Do not silently promote temporary context into repo memory.

Read [handoff templates](references/templates.md) after the destination is clear.

## Capture The Route

Record only what can change the next action:

- goal and current accepted outcome;
- current phase, slice, and route;
- settled decisions and source authority;
- completed work and fresh verification evidence;
- invalidated assumptions and affected spec/plan sections;
- open owner decisions, required evidence, and stop conditions;
- next executable action or backward route;
- live files and commands the next context must reopen.

For rolling plans, distinguish the current executable horizon from directional later phases. Do not turn provisional later work into committed tasks.

For learning slices, record the question, evidence, discard-or-promote result, and whether exploratory artifacts remain.

For review loops, record pass number, findings, parent adjudication, owner clarifications, changed areas, and residual risk. A fresh reviewer does not reset review history.

## Keep It Compact

Reference live artifacts by path instead of copying them.

Do not include:

- transcripts or narrative session history;
- exhaustive file trees, tech-stack summaries, or volatile inventories;
- copied specs, plans, diffs, logs, or reviewer output already stored elsewhere;
- unsupported completion claims;
- secrets, tokens, credentials, private personal data, or unnecessary sensitive content;
- instructions to trust the handoff without reinspection.

Include a short changed-file or dirty-state list only when it is necessary to prevent data loss or accidental overwrite during immediate continuation.

## Stop Conditions

Stop before writing when the requested handoff would:

- claim authority over live code, tests, docs, policies, ADRs, or owner decisions;
- promise exhaustive context or no reinspection;
- hide a source conflict, failed verification, unresolved review finding, or unapproved scope change;
- invent a destination, owner, status, completion claim, or next route;
- store sensitive or temporary material durably without approval.

Use `../decision-gate/SKILL.md` when the safe destination or route is user-owned and unclear.

## Resume

When resuming from a handoff:

1. Reopen the named source truth and current worktree state.
2. Verify completion and repository-state claims before repeating them.
3. Compare the handoff route with live evidence.
4. Preserve settled decisions that still hold.
5. Route only the invalidated layer backward.
6. Reconstruct the next slice contract before editing.

If live evidence contradicts the handoff, live evidence wins. Stop at the decision gate when changing source truth or accepted behavior requires owner direction.

## Report

State:

- handoff path and destination class;
- current route and next executable action;
- evidence captured and evidence to reopen;
- unresolved decisions, review pass, or verification gaps;
- any intentionally omitted sensitive or volatile context.

Creating a handoff ends the current execution slice. Do not continue into the next slice merely because continuation state now exists.