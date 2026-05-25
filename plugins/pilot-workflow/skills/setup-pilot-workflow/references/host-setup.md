# Host Setup

Use this only when setup asks for a host, profile, default mode, team install, hooks, CLI, or multi-agent shape.

## Hosts

Codex setup writes `AGENTS.md` and `.pilot-workflow/config.json`.

Claude setup writes `CLAUDE.md`, `.claude/rules/pilot-core.md`, and `.pilot-workflow/config.json`.

Multi-agent setup updates both host surfaces only when the user asks for both or multi-agent setup. Mention that duplicated always-on text can drift, and keep Claude's full block in one imported file.

Current runtime is not enough to choose a host when both `AGENTS.md` and `CLAUDE.md` exist.

## Profiles

Solo setup is the default: one host target, compact activation, `defaultMode: "workflow"`, no extra docs.

Team setup still uses compact activation. Add both hosts only if requested. Do not add team standards, onboarding docs, owners, approvers, hooks, or CLI checks as part of setup unless the user separately asks and the repo has a validated path for them.

Strict setup changes `.pilot-workflow/config.json` to `strict-workflow` only when the user explicitly asks to make that the repo default. Otherwise recommend strict-workflow for high-risk work without persisting it.

Valid persisted defaults are exactly `conversation`, `workflow`, and `strict-workflow`.

## Not Setup

Do not install hooks, CLI commands, lint rules, global standards, docs inventories, or state files during setup.

If the user asks for enforcement, say Pilot setup is instruction-only for now and ask whether to handle enforcement as a separate task.
