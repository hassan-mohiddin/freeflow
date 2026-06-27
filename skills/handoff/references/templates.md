# Handoff Templates

Use this only after destination is clear: temp handoff or memory handoff.

Handoffs are memory, not authority. Keep them compact, evidence-linked, and easy for a fresh agent to verify.

## Temp Handoff

Use for immediate continuation after compaction, pausing, or a fresh chat.

```md
# Temp Handoff

Date: YYYY-MM-DD

## Goal

## Current State

## Decisions Made

## Evidence To Reopen

## Next Action

## Watchouts
```

Keep `Current State` focused on what the next agent needs before acting. Do not include a transcript, full file tree, or broad repo summary.

## Memory Handoff

Use for durable project memory under the repo's existing handoff location.

```md
# Project Handoff

Date: YYYY-MM-DD

## Purpose

## Stable Context

## Decisions Made

## Live Evidence

## Next Focus

## Stop Conditions

## Superseded Or Deferred Work
```

Use `Live Evidence` for paths, tests, specs, ADRs, or commands the next agent should inspect. Say explicitly that live repo evidence overrides stale handoff text.

## Resume Checklist

When resuming from either handoff:

- Reopen linked live files before consequential edits.
- Verify completion claims before repeating them.
- Treat source-truth conflicts as interview-gate triggers.
- Ask before changing product, policy, security, privacy, billing, data-loss, compatibility, public API, or hard-to-reverse architecture.
