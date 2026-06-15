# Architecture

Freeflow is a portable skill pack for coding agents.

## Runtime Boundary

Freeflow ships Markdown skills, bundled references, and lightweight context-loading hooks. It does not ship a CLI, native slash handlers, enforcement hooks, or a new agent runtime in v0.1.

Host runtimes still control tools, sandboxing, approvals, and permissions. Freeflow controls workflow pressure:

- how much clarification is needed
- when artifacts are useful
- when source-truth conflicts stop edits
- when review and verification are required
- when a handoff or durable decision is useful

## Package Layout

```text
freeflow/
  package.json
  .agents/plugins/marketplace.json
  .claude-plugin/marketplace.json
  README.md
  LICENSE
  CHANGELOG.md
  docs/
  plugins/freeflow/
    .codex-plugin/plugin.json
    .claude-plugin/plugin.json
    command-surface.json
    hooks/
    pi-extension/
    skills/
    docs/
    evals/
```

The repository root is the marketplace and package-facing shell. Codex uses `.agents/plugins/marketplace.json`; Claude uses `.claude-plugin/marketplace.json`. Both point at `plugins/freeflow/`. Pi uses the root `package.json` `pi` manifest to load `plugins/freeflow/skills/` and `plugins/freeflow/pi-extension/index.js`.

`plugins/freeflow/` is the single runtime source of truth. Skill edits, bundled references, eval metadata, and command-surface metadata live there to avoid generated package drift.

## Progressive Disclosure

Each skill keeps its active `SKILL.md` short. Stable details move into `references/` files only when they prevent bloat, reduce repeated work, or address measured failures.

This keeps the model's first-loaded instructions focused on behavior:

- trigger
- loop
- stop condition
- failure prevention

## Host Setup

`setup-freeflow` installs a compact always-on contract into the host repo.

The canonical setup contract lives in `skills/setup-freeflow/references/activation-contract.md`; setup docs, fixtures, and eval assertions should reference it or be checked against it.

Codex setup targets `AGENTS.md` and `.freeflow/config.json`.

Claude setup targets `CLAUDE.md`, `.claude/rules/freeflow-core.md`, and `.freeflow/config.json` when Claude is the selected host.

Setup should not silently update both hosts or overwrite stronger repo-specific rules. Existing repo instructions are source truth.

## Runtime Context Hooks

The installed plugin owns `hooks/hooks.json`. Setup does not copy hook files into target repos.

The hooks load the existing `workflow` skill, workflow map, and `interview-gate` skill:

- at session start, including startup, resume, clear, and compact

They also report whether the current repo appears set up, partially set up, or missing setup. They do not run after edit/write tools, block tools, grant permissions, enforce mode policy, or replace repo instructions.

Setup handles the same-session case directly: after successful setup verification, it reads the workflow skill, workflow map, and interview-gate skill before its final response and only then says workflow and interview-gate context is loaded.

Host runtimes may require plugin hooks to be reviewed and trusted after install. If the host skips untrusted hooks, setup still writes activation/config files, but future session-start runtime context will not load until hooks are trusted and the session is restarted, resumed, cleared, or compacted.

Pi uses an extension instead of `hooks/hooks.json`. The Pi extension registers direct commands, reads `workflow/SKILL.md`, `workflow/references/workflow-map.md`, and `interview-gate/SKILL.md`, refreshes that context on `session_start` and `session_compact`, and injects it during Pi's `before_agent_start` lifecycle event. Pi `/workflow` commands set a session-scoped current-mode override, while `.freeflow/config.json` remains the default-mode source. It follows the same boundary as the Codex/Claude hooks: context loading only, no enforcement.

## Deferred Enforcement

Enforcement hooks and CLI checks are intentionally deferred. They are useful only after skill wording and evals prove a repeated behavior needs mechanical enforcement.

For v0.1, commands are model-routed language such as `/write-spec` or `/verify-work`; they are not native registered slash handlers.
