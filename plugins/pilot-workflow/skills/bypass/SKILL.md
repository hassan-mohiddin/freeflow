---
name: bypass
description: Use when the user explicitly asks to bypass, skip, or reduce workflow ceremony, especially with `/bypass next` or `/bypass task`.
---

# Bypass

Bypass skips ceremony, not judgment.

Default to one action. After that action, the bypass is spent.

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

If bypass conflicts with any of these, name the conflict and ask before acting.

## Scope

`/bypass next` means the next workflow gate only.

`/bypass task` means reduce workflow pressure for the current task. It still does not skip judgment or verification.

Never leave bypass active indefinitely.

## Behavior

For a safe small edit:

1. Make the narrow change.
2. Verify cheaply.
3. Say the bypass was used and is now spent.

For risky or conflicting work:

1. Do not edit.
2. Name what bypass cannot override.
3. Ask one direct question for the decision needed to proceed.

A refusal is incomplete until the user knows the next choice they own.
