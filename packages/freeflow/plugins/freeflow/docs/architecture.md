# Architecture

Freeflow is a portable skill pack for coding agents.

## Runtime Boundary

Freeflow ships Markdown skills and bundled references. It does not ship a CLI, hooks, native slash handlers, or a new agent runtime in v0.1.

Host runtimes still control tools, sandboxing, approvals, and permissions. Freeflow controls workflow pressure:

- how much clarification is needed
- when artifacts are useful
- when source-truth conflicts stop edits
- when review and verification are required
- when a handoff or durable decision is useful

## Package Layout

```text
freeflow/
  .codex-plugin/plugin.json
  .claude-plugin/plugin.json
  .claude-plugin/marketplace.json
  skills/
  docs/
  README.md
  LICENSE
  CHANGELOG.md
```

The package contains install/runtime assets only. Development evals, fixtures, research notes, handoffs, and generated run output are kept outside the runtime package.

## Progressive Disclosure

Each skill keeps its active `SKILL.md` short. Stable details move into `references/` files only when they prevent bloat, reduce repeated work, or address measured failures.

This keeps the model's first-loaded instructions focused on behavior:

- trigger
- loop
- stop condition
- failure prevention

## Host Setup

`setup-freeflow` installs a compact always-on contract into the host repo.

Codex setup targets `AGENTS.md` and `.freeflow/config.json`.

Claude setup targets `CLAUDE.md`, `.claude/rules/freeflow-core.md`, and `.freeflow/config.json` when Claude is the selected host.

Setup should not silently update both hosts or overwrite stronger repo-specific rules. Existing repo instructions are source truth.

## Deferred Enforcement

Hooks and CLI checks are intentionally deferred. They are useful only after skill wording and evals prove a repeated behavior needs mechanical enforcement.

For v0.1, commands are model-routed language such as `/write-spec` or `/verify-work`; they are not native registered slash handlers.
