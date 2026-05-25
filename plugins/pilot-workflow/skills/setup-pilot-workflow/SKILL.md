---
name: setup-pilot-workflow
description: Install Pilot Workflow repo activation and default config. Use when setting up, installing, enabling, initializing, or configuring Pilot Workflow in a repo, especially when creating `.pilot-workflow/config.json` or adding a Pilot Workflow block to AGENTS.md or CLAUDE.md.
---

# Setup Pilot Workflow

## Stop Before Editing

Do not create config, add activation blocks, or change instructions until setup has a clear target and no unresolved repo-rule conflict.

Hard stops:

- both `AGENTS.md` and `CLAUDE.md` exist, and the user did not explicitly choose a host or ask for multi-agent setup
- existing repo instructions conflict with asking before user-owned decisions
- existing repo instructions conflict with verification before completion claims

For a hard stop, make no file changes. Name the blocker and ask one direct question.

## Inspect First

Before editing, inspect:

- `.pilot-workflow/config.json`
- `AGENTS.md`
- `CLAUDE.md`
- existing `## Pilot Workflow` blocks and conflicting repo instructions

Existing repo instructions are source truth. If a rule conflicts with Pilot's core behavior, name the conflict and ask whether to install Pilot as advisory, revise the rule, or skip setup. Advisory install is a user decision, not the default.

## Target File

Choose one activation file:

- If only `AGENTS.md` exists, update `AGENTS.md`.
- If only `CLAUDE.md` exists, update `CLAUDE.md`.
- If both exist and the user explicitly named the host target, update that file.
- If both exist and the target is ambiguous, ask before editing.
- If neither exists, ask which one to create.
- Update both only when the user asks for multi-agent setup. Mention the drift risk.

Do not treat the current agent runtime alone as target approval. A Codex run in a repo that also has `CLAUDE.md` still needs the user to choose unless the request or repo instructions make the target explicit.

Update an existing `## Pilot Workflow` block in place. Otherwise place the block near existing agent skill/workflow sections, or append near the end. Never duplicate it.

## Config

Create `.pilot-workflow/config.json` with exactly:

```json
{
  "defaultMode": "workflow"
}
```

Do not add:

- current mode, task, or phase
- file inventory, active plans, version metadata, or activation file path

Mode switches are task/conversation scoped unless the user explicitly asks to persist a different default mode.

## Activation Block

Use this exact block:

```md
## Pilot Workflow

Use Pilot Workflow for consequential work. Default mode: `.pilot-workflow/config.json`.

Mode switches apply to the current task/conversation unless explicitly persisted.

Ask before user-owned decisions. Verify before completion claims.
```

Do not list the whole workflow or every mode in the activation block.

## Do Not Create

Setup must not create:

- empty `CONTEXT.md`
- docs pages, hooks, state files, handoffs, or skill inventories

`CONTEXT.md` is domain language memory, not plugin state.

## Verify

Before claiming setup is complete, check:

- config JSON parses
- config contains only `defaultMode`
- activation block appears exactly once in each edited instruction file
- no unrelated files changed

If verification cannot run, say what remains unverified.
