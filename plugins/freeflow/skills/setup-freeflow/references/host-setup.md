# Host Setup

Use this only when setup asks for a host, profile, default mode, team install, hooks, CLI, or multi-agent shape. Use `activation-contract.md` for canonical activation text, config invariants, and host adapter rules.

## Hosts

Codex setup writes `AGENTS.md` and `.freeflow/config.json`.

Claude setup writes `CLAUDE.md`, `.claude/rules/freeflow-core.md`, and `.freeflow/config.json`.

Multi-agent setup updates both host surfaces only when the user asks for both or multi-agent setup. Mention that duplicated always-on text can drift, render both hosts from `activation-contract.md`, and keep Claude's full block in one imported file.

Current runtime is not enough to choose a host when both `AGENTS.md` and `CLAUDE.md` exist.

## Profiles

Solo setup is the default: one host target, compact activation, `defaultMode: "workflow"`, no extra docs.

Output-router setup is an opt-in config branch inside normal setup, not a separate host profile. Use `output-router-setup.md`; keep minimal setup config unchanged unless the user explicitly asks for router config.

Team setup still uses compact activation. Add both hosts only if requested. Do not add team standards, onboarding docs, owners, approvers, repo-local hooks, or CLI checks as part of setup unless the user separately asks and the repo has a validated path for them.

Strict setup changes `.freeflow/config.json` to `strict-workflow` only when the user explicitly asks to make that the repo default. Otherwise recommend strict-workflow for high-risk work without persisting it.

Valid persisted defaults are exactly `conversation`, `workflow`, and `strict-workflow`.

## Not Setup

Do not install repo-local hooks, CLI commands, lint rules, global standards, docs inventories, setup-output-router skills, or state files during setup.

Freeflow's plugin-bundled context hooks are package runtime. They load workflow and interview-gate context at session start, but setup should not copy hook files into the target repo.

After successful setup verification, setup should read the workflow skill, workflow map, and interview-gate skill before the final response. If session-start runtime context does not load in later sessions, tell the user to review/trust the installed Freeflow plugin hooks or start a fresh/compacted session. Do not create repo-local hook files as a workaround.

If the user asks for enforcement, say Freeflow setup is instruction-only for now and ask whether to handle enforcement as a separate task.
