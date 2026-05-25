# Pilot Workflow Runtime And Lifecycle

## Purpose

This document describes how Pilot Workflow should behave after the first draft skill pack exists.

It covers:

- host agent modes versus Pilot modes
- first-run setup
- mode persistence
- planning and execution lifecycle
- branching and re-entry
- missing runtime skills

This is architecture context, not an implementation plan.

## Host Modes Versus Pilot Modes

Pilot Workflow does not replace the host agent runtime.

Claude, Codex, and similar agents have their own permission modes. These control what tools the agent may use: read-only analysis, auto-editing, command approval, sandboxing, and full-access behavior.

Pilot modes control workflow pressure:

- `conversation`: discussion, critique, explanation, exploration.
- `workflow`: normal consequential work.
- `strict-workflow`: high-risk or hard-to-reverse work.

Host modes answer:

> What can the agent do with tools?

Pilot modes answer:

> How much workflow discipline should the agent apply?

For Pilot Workflow tasks, the user should normally run the host agent in an edit-capable normal mode, not the host's native plan mode. Native plan modes are useful for safe read-only exploration, but Pilot provides the planning lifecycle: research, grilling, specs, reviews, plans, execution, verification, and handoff.

Pilot should not depend on host plan mode. It should work in Codex, Claude Code, and similar tools as a portable workflow layer.

## Setup

Pilot needs a first-run setup flow.

Setup should be fast by default and only interview the user when there is a real decision.

Default setup creates:

```text
.pilot-workflow/config.json
```

with:

```json
{
  "defaultMode": "workflow"
}
```

No other config fields should be added yet.

Do not store:

- current mode
- current task
- current phase
- file inventories
- active plans
- version metadata
- activation file path

Version and migration fields can be added when Pilot is close to shipping.

## Agent Instruction File

Setup should add a tiny activation block to the host agent's repo instruction file.

Target file rules:

- If only `AGENTS.md` exists, update it.
- If only `CLAUDE.md` exists, update it.
- If both exist and the host target is obvious, update the host-relevant file.
- If both exist and the target is ambiguous, ask.
- If neither exists, ask which one to create.
- Update both only when the user asks for multi-agent setup.

If the user wants both files updated, explain the tradeoff:

- better activation across agents
- more drift risk

The activation block should be minimal because users often keep agent instruction files short and already have their own rules.

Suggested block:

```md
## Pilot Workflow

Use Pilot Workflow for consequential work. Default mode: `.pilot-workflow/config.json`.

Mode switches apply to the current task/conversation unless explicitly persisted.

Ask before user-owned decisions. Verify before completion claims.
```

Do not list the whole workflow or every mode in the activation block.

Placement matters:

- Update an existing `## Pilot Workflow` block in place.
- Otherwise place near existing agent skill/workflow sections when present.
- Otherwise append near the end.
- Do not place it above stronger repo-specific rules.
- Do not duplicate it.

## Context Files

Setup should not create an empty `CONTEXT.md`.

`CONTEXT.md` is domain language memory, not plugin state. Create or update it only when there is real glossary or context content to capture.

If `CONTEXT.md` exists, setup may note that Pilot skills can use it. Do not fill it with generic Pilot instructions.

ADRs remain reserved for hard-to-reverse, surprising, tradeoff-driven decisions.

## Existing Rule Conflicts

Existing repo instructions are source truth.

If setup finds instructions that conflict with Pilot's core behavior, it must name the conflict and ask.

Example conflict:

```text
Never ask questions. Always make a best guess and implement.
```

That conflicts with the interview gate. Setup should not silently rewrite it or pretend Pilot can fully operate under it.

The user decides whether to:

- install Pilot as advisory
- revise the conflicting rule
- skip setup

## Mode Persistence

Mode switches are task/conversation scoped by default.

Examples:

```text
/workflow conversation
/workflow workflow
/workflow strict-workflow
```

These apply to the current task or conversation unless the user explicitly asks to persist them.

Persisting requires explicit wording such as:

```text
Make strict-workflow the default for this repo.
```

Then setup or mode handling may update:

```json
{
  "defaultMode": "strict-workflow"
}
```

Do not write a persistent current-mode state file by default. That creates leakage risk: a strict mode chosen for one task can affect unrelated future work.

## Planning Phase

Planning decides what to build and how to build it.

It includes:

```text
research-brief
grill-context
write-spec
review-artifact
write-plan
review-artifact
```

Research and grilling form one larger discovery unit.

Research gathers evidence from the repo, provided sources, and current external sources when needed. It can be quick or deep. It may produce a chat answer or a durable research document.

Grilling turns uncertain ideas into shared understanding. It asks one question at a time, explores branches, challenges assumptions, and resolves ambiguity. It may begin before research, after research, or trigger research in the middle.

Branching is normal. A conversation may fork into research, return with a research doc and handoff, then continue the original grilling thread.

After enough context exists, `write-spec` converts the conversation and evidence into a durable artifact describing what should be built, what decisions were made, what was rejected, and what constraints matter.

`review-artifact` then checks whether the spec is fit to guide work. It should catch contradictions, missing owner decisions, unclear scope, or conflicts with live evidence.

`write-plan` converts the approved spec into an implementation plan. The plan explains how the work will be built: slices, files, tests, verification, and checkpoints.

Plans deserve review because they combine research, grilling, and specs into concrete execution. A bad plan can carry earlier cracks into implementation.

If review finds a real issue, the agent should not blindly fix and re-review in a loop. It should classify the issue, inspect evidence, use `review-work` or a fresh reviewer when useful, and fire the interview gate when the correction requires a user-owned decision.

Backward movement is expected:

```text
plan review -> spec revision -> plan revision -> final review
```

The planning phase is complete when the plan is reviewed enough to guide execution.

## Execution Phase

Execution does the work and proves it.

It includes:

```text
execute-plan
review-work
verify-work
commit-work
handoff
```

`execute-plan` should not rewrite the plan opportunistically. It should execute the fixed scope in vertical slices.

When execution discovers a new gap, source-truth conflict, impossible step, or hidden scope, it should stop and re-enter the workflow:

```text
execution -> interview-gate -> revise spec/plan or continue
```

Most workflow failures show up during execution. Good planning reduces this, but cannot eliminate it.

## Review And Verification

Review and verification are the execution closeout.

They are different checks and both must pass for consequential work.

`review-work` asks:

> Does the diff match the intent and engineering quality?

It checks scope, source truth, maintainability, architecture, risk, and whether the work actually matches the spec and plan.

`verify-work` asks:

> What fresh evidence shows this works?

It checks test output, typecheck output, lint output, browser checks, logs, screenshots, or other direct evidence.

Either can pass while the other fails.

Examples:

- Tests pass, but review fails because the implementation hardcodes billing policy or violates architecture.
- Review looks good, but verification fails because the test suite or browser check fails.

Completion claims require both review confidence and verification evidence when the work is consequential.

## Commit And Handoff

After successful execution, review, and verification, the work should be committed.

Pilot has a first `commit-work` skill for the lightweight closeout guard.

That skill should cover:

- checking the staged/untracked diff
- ensuring unrelated user changes are not included accidentally
- writing useful commit messages
- referencing specs, plans, or decisions when useful
- respecting pre-commit/lint/test failures
- keeping commits small enough to debug and roll back

Orchestra had useful prior art around commit discipline and references, but Pilot should avoid importing heavy machinery before behavior is proven.

After commit, create a handoff when continuity matters.

Handoff destination depends on use:

- temp handoff: immediate continuation after compaction or fresh chat
- memory handoff: durable project memory for future sessions

Handoffs are memory, not authority. Live repo evidence overrides stale handoff text.

## Cross-Cutting Skills

Some skills can fire in either planning or execution:

- `interview-gate`: user-owned decisions, ambiguity, source-truth conflicts, path conflicts.
- `diagnose-failure`: bugs, failing tests, regressions, unexpected behavior.
- `capture-decisions`: durable decisions, glossary terms, ADR-worthy tradeoffs.
- `bypass`: skip unnecessary ceremony without skipping judgment.
- `mode-contract`: infer or discuss Pilot modes.

`diagnose-failure` can be part of planning when research reveals a bug-like unknown, and part of execution when implementation or verification fails.

`capture-decisions` should record stable decisions, not session residue.

`bypass` defaults to one action and never bypasses user-owned decisions, source-truth conflicts, risky domains, or verification.

## Developer Meta Skills

Pilot should later include developer-only or contributor-facing skills.

Likely future skills:

- `setup-pilot-workflow`
- `write-skill`
- `evaluate-skill`

`write-skill` should encode Pilot's skill style:

- Matt-style concise pressure
- Obra-style phase boundaries
- Anthropic-style skill structure and progressive disclosure
- eval-backed iteration

`evaluate-skill` should encode Pilot's eval loop:

```text
failure scenario -> baseline eval -> with-skill eval -> skill revision -> rerun
```

Many real agent failures should become evals. When an agent skips a phase, silently decides, ignores source truth, or mishandles ambiguity, that scenario can become a fixture or prompt eval.

These skills should not encourage end users to mutate core Pilot skills casually. They are mainly for Pilot contributors and developers creating their own skill packs.

## Open Implementation Work

The next implementation layer should focus on:

1. mode command behavior and config reading
2. `write-skill`
3. `evaluate-skill`

Do not add runtime hooks yet.

Hooks should come after skill behavior and evals show where mechanical enforcement is needed.
