# Architecture

Freeflow is a portable skill pack for coding agents.

## Runtime Boundary

Freeflow ships Markdown skills, bundled references, lightweight context-loading hooks, and a Pi extension. It does not ship a CLI, Codex/Claude native slash handlers, enforcement hooks, or a new agent runtime in this release.

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
  .codex-plugin/plugin.json
  .claude-plugin/marketplace.json
  .claude-plugin/plugin.json
  README.md
  LICENSE
  CHANGELOG.md
  command-surface.json
  assets/
  plugin-docs/
  docs/
  evals/
  hooks/
  pi-extension/
  router/
  skills/
```

The repository root is the plugin root. Codex uses `.agents/plugins/marketplace.json`; Claude uses `.claude-plugin/marketplace.json`. Both point at `.`. Pi uses the root `package.json` `pi` manifest to load `skills/` and the built extension at `pi-extension/dist/index.js`; TypeScript source lives under `pi-extension/src/`.

The repo root is the single runtime source of truth. Skill edits, bundled references, eval metadata, public docs, and command-surface metadata live there to avoid generated package drift. Public plugin docs live under `plugin-docs/`. Project-development memory lives under `docs/` and is not part of the runtime surface.

`router/src/` is organized by responsibility: public tool entrypoints in `tools/`, transformation internals in `transform/`, evidence helpers in `evidence/`, vault storage in `vault/`, repo traversal in `repo/`, capture/routing/parsers in `routing/`, sandbox adapters in `sandbox/`, configuration contracts in `config/`, benchmark harnesses in `benchmarks/`, and frozen experiments in `experiments/`. `router/dist/` mirrors that layout as generated package output; active deprecated or historical router artifacts stay outside runtime code under `deprecated/router/`.

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

The hooks load the existing `mode-contract`, `workflow`, `interview-gate`, `discover`, and `output-router` skills:

- at session start, including startup, resume, clear, and compact

They also report whether the current repo appears set up, partially set up, or missing setup, and state the runtime priority order: mode-contract handles mode issues first, workflow classifies, interview-gate stops silent decisions, discover handles context-building, and output-router chooses evidence transport. They do not run after edit/write tools, block tools, grant permissions, enforce mode policy, or replace repo instructions.

Setup handles the same-session case directly: after successful setup verification, it reads the mode-contract, workflow, interview-gate, discover, and output-router skills before its final response and only then says that context is loaded.

Host runtimes may require plugin hooks to be reviewed and trusted after install. If the host skips untrusted hooks, setup still writes activation/config files, but future session-start runtime context will not load until hooks are trusted and the session is restarted, resumed, cleared, or compacted.

Pi uses an extension instead of `hooks/hooks.json`. The built Pi extension registers direct commands, reads `mode-contract/SKILL.md`, `workflow/SKILL.md`, `interview-gate/SKILL.md`, `discover/SKILL.md`, and `output-router/SKILL.md`, refreshes that context on `session_start` and `session_compact`, and injects full core skill context during Pi's `before_agent_start` lifecycle before every agent turn. The workflow-map and output-router safety-policy references remain available on demand but are not injected wholesale by default. The same extension registers `freeflow_status`, `freeflow_search`, `freeflow_run`, and `freeflow_batch` and gives them compact/expanded TUI renderers so collapsed tool rows stay readable while `ctrl+o` shows structured status, evidence, recovery details, and non-destructive migration recommendations. `freeflow_search action=transform operation.kind="script"` and `freeflow_run` script producers stay disabled until setup/user config opts in; setup can install JavaScript/Python/jq adapters into a user-global Freeflow cache, Pi auto-discovers that cache plus explicit `FREEFLOW_QUICKJS_WASI_ROOT`, `FREEFLOW_JQ_WASM_ROOT`, and `FREEFLOW_ERYX_ROOT` overrides, and only proof-passing languages are enabled. The Eryx Python adapter launches the setup-installed `node@24` child process with `--experimental-wasm-jspi` when needed, so normal Pi launches can still use Python after setup proof passes. When configured, its Pi `tool_result` hook observed-routes MCP, web, fetch, and code-search outputs after direct host execution; host permissions and execution remain owned by Pi. Pi `/workflow` commands set a session-scoped current-mode override, while `.freeflow/config.json` remains the default-mode source. It follows the same boundary as the Codex/Claude hooks: context loading and output routing only, no enforcement.

## Deferred Enforcement

Enforcement hooks and CLI checks are intentionally deferred. They are useful only after skill wording and evals prove a repeated behavior needs mechanical enforcement.

For this release, commands are model-routed language such as `/write-spec` or `/verify-work`; they are not native registered slash handlers.
