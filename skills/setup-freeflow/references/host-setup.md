# Host Setup

Use this when setup needs a host target, profile, default mode, hooks/trust guidance, CLI boundary, or multi-agent shape.

Use `activation-contract.md` for canonical activation text, config invariants, and host adapter rules.

## Host Targets

Codex setup writes:

- `AGENTS.md`
- `.freeflow/config.json`

Claude setup writes:

- `CLAUDE.md`
- `.claude/rules/freeflow-core.md`
- `.freeflow/config.json`

Multi-agent setup updates both host surfaces only when the user asks for both or multi-agent setup. Render both hosts from `activation-contract.md` and mention duplicated activation drift risk.

Current runtime is not enough to choose a host when both `AGENTS.md` and `CLAUDE.md` exist.

## Profiles

Solo setup is the default:

- one host target,
- compact activation,
- `defaultMode: "workflow"`,
- no extra docs or hooks.

Team setup still uses compact activation. Add both hosts only if requested. Do not add team standards, onboarding docs, owners, approvers, repo-local hooks, or CLI checks unless the user separately asks and the repo has a validated path.

Strict setup changes `.freeflow/config.json` to `strict-workflow` only when the user explicitly asks to make that the repo default. Otherwise recommend strict-workflow for high-risk work without persisting it.

Evidence-routing setup is an opt-in branch inside normal setup, not a host profile. Use `output-router-setup.md`; keep minimal config unchanged unless the user accepts the capabilities decision point or explicitly asks for output-router/observed-routing/script-transform config.

Valid persisted defaults are exactly `conversation`, `workflow`, and `strict-workflow`.

## Not Setup

Do not install repo-local hooks, CLI commands, lint rules, global standards, docs inventories, setup-output-router skills, or state files during setup.

Freeflow's plugin-bundled context hooks are package runtime. They load mode-contract, workflow, interview-gate, discovery-light, and output-router context at session start, but setup should not copy hook files into the target repo.

After successful setup verification, setup should read the mode-contract, workflow, interview-gate, and output-router skills before the final response and apply the discovery-light runtime rule. If session-start runtime context does not load in later sessions, tell the user to review/trust the installed Freeflow plugin hooks or start a fresh/compacted session. Do not create repo-local hook files as a workaround.

If the user asks for enforcement, say Freeflow setup is instruction-only for now and ask whether to handle enforcement as a separate task.
