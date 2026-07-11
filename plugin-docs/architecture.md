# Architecture

Freeflow is a portable skill pack for coding agents.

## Runtime Boundary

Freeflow ships Markdown skills, bundled references, lightweight context-loading hooks, and a Pi extension. It does not ship a CLI, Codex/Claude native slash handlers, enforcement hooks, or a new agent runtime in this release.

Host runtimes still control tools, sandboxing, approvals, and permissions. Freeflow controls workflow pressure:

- how much clarification is needed
- when artifacts are useful
- when source-truth conflicts stop edits
- how each meaningful slice is verified and rerouted from evidence
- when independent review, commit, handoff, branch integration, release, or launch is useful

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

The repository root is the plugin root. Codex uses `.agents/plugins/marketplace.json` with local source `.`, while Claude uses `.claude-plugin/marketplace.json` with host-valid local source `./`. Pi uses the root `package.json` `pi` manifest to load `pi-extension/freeflow/index.js`, which re-exports the built extension from `pi-extension/dist/index.js`; TypeScript source lives under `pi-extension/src/`. Pi model skill exposure is dynamic and owned by the extension.

The repo root is the single source of truth. Skill edits, bundled references, eval metadata, public docs, and command-surface metadata live there to avoid generated package drift. Public plugin docs live under `plugin-docs/`; eval definitions and evidence live under `evals/`. They ship through GitHub but are excluded from the npm runtime tarball. Project-development memory lives under `docs/` and is not part of the runtime surface.

`router/src/` is organized by responsibility: public tool entrypoints in `tools/`, transformation internals in `transform/`, evidence helpers in `evidence/`, vault storage in `vault/`, repo traversal in `repo/`, explicit local-source traversal in `local/`, capture/routing/parsers in `routing/`, sandbox adapters in `sandbox/`, configuration contracts in `config/`, benchmark harnesses in `benchmarks/`, and frozen experiments in `experiments/`. `router/dist/` mirrors that layout as generated package output; active deprecated or historical router artifacts stay outside runtime code under `deprecated/router/`.

## Progressive Disclosure

Each skill keeps its active `SKILL.md` short. Stable details move into `references/` files only when they prevent bloat, reduce repeated work, or address measured failures.

This keeps the model's first-loaded instructions focused on behavior:

- trigger
- loop
- stop condition
- failure prevention

## Host Setup

`setup-freeflow` creates `.freeflow/config.json`, the sole repo activation boundary.

The canonical setup contract lives in `skills/setup-freeflow/references/activation-contract.md`; setup docs, fixtures, and deterministic checks stay aligned with it.

Codex, Claude, and Pi use the same repo shape. Setup does not generate Freeflow blocks, imports, or rule files in repo-owned host instructions. Existing repo instructions remain source truth and must be inspected when they conflict with activation.

## Runtime Context Hooks

The installed plugin owns `hooks/hooks.json`. Setup does not copy hook files into target repos.

The hooks stay inert until `.freeflow/config.json` exists, parses, and matches the supported setup config shape. Once configured and enabled, they load `skills/decision-gate/references/runtime-kernel.md`, the full `workflow` skill once at the first session turn, and any independently enabled capability context:

- at session start, including startup, resume, clear, and compact

The compact kernel remains system context and routes mode-setting, reset, inference, or discussion to the full Mode Contract on demand. In Pi, the full Workflow skill is a hidden persistent custom message and is not duplicated while its stable message marker remains in active session context. Codex and Claude receive the same full Workflow body from their session-start hook. `enabled: false` suppresses all Freeflow hook context; `skills.enabled: false` suppresses the kernel, Workflow bootstrap, and workflow skill exposure while leaving enabled capabilities available. Full `mode-contract`, `decision-gate`, `discover`, and lifecycle skill bodies remain available on demand. Hooks do not run after edit/write tools, block tools, grant permissions, enforce mode policy, replace repo instructions, or use host instruction files as activation markers.

Setup handles the same-session case directly: after successful setup verification, it reads and applies the canonical kernel, full Workflow skill, and any capability skill effective after setup and only then says that current-session context is loaded.

Host runtimes may require plugin hooks to be reviewed and trusted after install. Setup reports runtime delivery as confirmed, unavailable, or unconfirmed. If a hook is absent or skipped as untrusted, config still activates the repo but automatic session context will not load until the adapter is available/trusted and the session is restarted, resumed, cleared, or compacted.

Pi uses an extension instead of `hooks/hooks.json`. The built Pi extension registers direct commands, dynamically exposes setup/model skills, refreshes enabled runtime context on `session_start` and `session_compact`, appends the compact kernel to the existing system prompt during Pi's `before_agent_start` lifecycle before every agent turn, and injects the full Workflow skill as one hidden persistent custom message when that marker is absent from active session context. `.freeflow/config.json` is the activation boundary: missing or invalid config exposes only setup; top-level `enabled: false` suppresses skills, tools, runtime context, observed routing, native routing, and delegation. `/freeflow` is the unified control/settings/status command and stays available for re-enable; `/freeflow mode` owns session-mode selection, while the settings UI distinguishes temporary Session mode from persisted Default mode. `/output-router` and `/delegation-harness` remain compatibility settings commands. The full `discover` skill, workflow-map reference, and output-router safety-policy reference remain available on demand when skills are enabled but are not injected wholesale by default. The same extension registers `freeflow_status`, `freeflow_search`, `freeflow_run`, and `freeflow_batch` only as active tools when effective config permits, and gives them compact/expanded TUI renderers so collapsed tool rows stay readable while `ctrl+o` shows structured status, evidence, recovery details, and non-destructive migration recommendations. `freeflow_search action=transform operation.kind="script"` and `freeflow_run` script producers stay disabled until setup/user config opts in; setup can install JavaScript/Python/jq adapters into a user-global Freeflow cache, Pi auto-discovers that cache plus explicit `FREEFLOW_QUICKJS_WASI_ROOT`, `FREEFLOW_JQ_WASM_ROOT`, and `FREEFLOW_ERYX_ROOT` overrides, and only proof-passing languages are enabled. The Eryx Python adapter launches the setup-installed `node@24` child process with `--experimental-wasm-jspi` when needed, so normal Pi launches can still use Python after setup proof passes. When configured, enabled, and output-router-effective, its Pi `tool_result` hook observed-routes MCP, web, fetch, and code-search outputs after direct host execution; host permissions and execution remain owned by Pi. Pi `/freeflow mode` commands set a session-scoped current-mode override only when skills are effective, while `.freeflow/config.json` remains the default-mode source. It follows the same boundary as the Codex/Claude hooks: context loading and output routing only, no enforcement.

## Deferred Enforcement

Enforcement hooks and CLI checks are intentionally deferred. They are useful only after skill wording and evals prove a repeated behavior needs mechanical enforcement.

For Codex and Claude, slash-style skill calls such as `/write-spec` or `/verify-work` are model-routed language rather than native registered handlers. The Pi extension registers the direct and developer calls declared in `command-surface.json`; natural language remains the preferred interface.
