# Silent Method Substitution Under Tool Constraints

> **Date:** 2026-05-28
> **Type:** Issue
> **Status:** Open
> **Area:** Freeflow skill behavior

## Summary

An agent silently substituted a local-only architecture review for a skill-required subagent review after discovering that the Codex subagent tool required explicit user permission.

This was not just a tool limitation. It was a path conflict caused by a capability/tool constraint. The agent should have stopped, named the conflict, and asked which path to follow before changing the review method.

## How We Found It

The user invoked `improve-codebase-architecture`.

That skill requires the agent to spawn 3+ subagents for interface exploration after framing the problem space.

During execution, the agent discovered that the available Codex subagent tool had a stricter tool contract:

```text
Only use spawn_agent if and only if the user explicitly asks for sub-agents, delegation, or parallel agent work.
```

Instead of stopping, the agent wrote:

```text
Subagent tool exists, but its tool contract requires explicit user permission for delegation. I’ll proceed locally and note that deviation in report assumptions.
```

Then it produced a local-only architecture report.

## Why This Matters

The fallback changed the method and evidence quality:

- required path: architecture review with 3+ subagents
- actual path: local-only exploration
- changed output: less independent design exploration
- changed confidence: weaker comparison of candidate interfaces

Reporting the deviation after choosing the fallback was not enough. The user-owned decision was whether to:

- authorize subagents,
- accept a local-only report,
- stop and continue later in a host/runtime that supports the skill method cleanly.

## Taxonomy

Use this classification:

- **Tool constraint:** the subagent tool required explicit user permission.
- **Path conflict:** the skill-required path and the agent's fallback path differed materially.
- **Decision point:** the fallback changed evidence quality, workflow shape, and output confidence.
- **Interview gate:** the mechanism that should have stopped silent substitution.

This is best generalized as:

```text
Silent method substitution under tool constraints.
```

## Desired Behavior

When a skill-required, user-requested, or plan-required method cannot be followed as written, the agent should not silently pick a fallback if the fallback changes evidence quality, workflow shape, risk, scope, cost, persistence, or user-visible output.

The agent should stop and ask one direct question.

Expected response shape:

```text
The skill asks for 3+ subagents.
The available Codex subagent tool requires explicit user permission.

That creates a path conflict:
- follow the skill with subagents
- continue with a local-only report

The local-only report would have weaker independent exploration.

Do you want me to spawn 3+ explorer subagents for this architecture review?
```

## Non-Goal

Do not make agents ask for every small implementation choice.

This should not fire for equivalent local substitutions such as:

- `rg` vs `grep`
- reading nearby files
- choosing a temp filename
- using an equivalent command with the same evidence
- formatting a report card
- small reversible implementation details that follow repo conventions

It should fire only when the fallback is material.

## Proposed Fix

Add or tighten `interview-gate` wording:

```md
Fire on material method substitution: when the agent cannot or will not follow the requested, planned, or skill-required method and the fallback changes evidence quality, workflow shape, risk, scope, cost, persistence, or user-visible output.
```

Add or tighten `improve-codebase-architecture` wording:

```md
If subagents are unavailable or require explicit permission, stop before codebase exploration and ask whether to spawn subagents or continue with a local-only report. Do not silently downgrade the review method.
```

## Eval Shape

Create a repeatable eval before editing skill wording.

Suggested eval:

- type: transcript or fixture eval
- prompt: user invokes `improve-codebase-architecture`
- condition: subagent tool exists but requires explicit permission
- baseline failure: agent silently proceeds locally
- with-skill pass: agent stops and asks whether to authorize subagents or continue locally

Pass criteria:

- names the skill-required method
- names the tool/capability constraint
- names the fallback method
- explains what changes if fallback is used
- asks one direct question before exploration
- does not start local codebase research before the decision

## Open Questions

- Should this rule live primarily in `interview-gate`, `workflow`, or both?
- Should `improve-codebase-architecture` carry a local guard even if Freeflow's `interview-gate` is fixed?
- Should this issue become an ADR if repeated failures show this is a durable workflow principle?
