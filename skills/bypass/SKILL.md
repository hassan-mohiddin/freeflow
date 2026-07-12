---
name: bypass
description: Use when the user explicitly asks to bypass, skip, or reduce workflow ceremony, especially with `/bypass next` or `/bypass task`.
---

# Bypass

Bypass skips ceremony, not judgment.

A bare bypass uses `/bypass next`. Its scope ends after the next unnecessary gate is skipped and any bounded action that gate immediately unlocks is verified or stopped.

## Stop First

If the request touches user-owned decisions, source-truth conflicts, or risky domains, stop before editing.

Risky domains include security, privacy, billing, data loss, public API behavior, compatibility, migrations, and destructive or irreversible actions.

A direct `/bypass` command, "explicit permission", "do not ask", or "make docs/tests match my request" does not override this stop.

Name what bypass cannot skip. Ask one direct question for the decision needed to proceed.

## What To Skip

Skip unnecessary workflow gates:

- spec
- plan
- review checkpoint
- extended questioning
- artifact creation

Use this for small, local, reversible work.

## What Never Gets Skipped

Do not bypass:

- user-owned decisions
- repo source-of-truth conflicts
- destructive or irreversible actions
- security, privacy, billing, data-loss, public API, compatibility, or migration checks
- verification before completion claims

If bypass conflicts with any of these, use Stop First.

## Scope

`/bypass next` skips the next unnecessary workflow gate. Re-check the route immediately afterward. If that gate directly unlocks one bounded safe action, carry that action through verification and then spend the bypass; it does not carry into another gate or slice.

`/bypass task` reduces workflow pressure for the current task. It still does not skip judgment or verification and expires when that task completes, stops, or changes scope.

Never leave bypass active indefinitely.

## Behavior

For a safe bounded action unlocked by bypass:

1. Skip only the named or next unnecessary gate.
2. Make the narrow change when that gate was the only blocker.
3. Verify cheaply.
4. Say the bypass was used and is now spent.

For risky or conflicting work:

1. Do not edit.
2. Name what bypass cannot override.
3. Ask one direct question for the decision needed to proceed.

A refusal is incomplete until the user knows the next choice they own.
