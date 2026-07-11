# Host Setup

Host choice affects runtime delivery checks, not repository activation shape.

## Shared Repo Shape

Every host uses:

```text
.freeflow/config.json
```

Do not generate host-specific Freeflow instructions in `AGENTS.md`, `CLAUDE.md`, or `.claude/rules/freeflow-core.md`.

## Pi

The Freeflow Pi extension reads valid repo config before each agent turn, appends the canonical runtime kernel to `event.systemPrompt`, and loads the full Workflow skill as a hidden persistent custom message on the first turn. It must preserve the existing prompt and avoid duplicate Workflow messages while the stable marker remains active.

Confirm delivery through the extension status surface or a runtime-context test when available. A config written during setup takes effect on the next `before_agent_start` turn; read the kernel, Workflow, and any capability skill effective after setup directly for the remainder of the setup turn.

## Codex And Claude

The packaged lifecycle hook reads valid repo config and injects the same canonical kernel plus one full Workflow bootstrap at session start, resume, clear, and compact lifecycle boundaries supported by the host.

After first-time setup, use the host's relevant reload/resume lifecycle before relying on automatic injection.

Treat runtime delivery as:

- **confirmed** when the installed hook registration and current host trust/enablement are evidenced;
- **unavailable** when the hook/plugin is absent, disabled, denied, or unsupported;
- **unconfirmed** when the host exposes no trustworthy way to verify registration or execution.

Surface unavailable or unconfirmed delivery in the setup result. Do not compensate by copying the kernel into repository instruction files.

## Optional Capabilities

Capability setup remains an opt-in branch inside normal setup, not a host-specific activation shape. Use `output-router-setup.md`; keep minimal config unchanged unless the user accepts the capability decision point or explicitly asks for Output Router, observed routing, script transform, native safety-net routing, or Delegation Harness config.

Do not install repo-local hooks, CLI commands, lint rules, global standards, docs inventories, or state files during setup.

## Conflicts

Repo instructions can still conflict with Freeflow behavior even though they are not activation markers. Name the conflict and ask before enabling or changing behavior when it would alter the next action.
