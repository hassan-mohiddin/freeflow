# Freeflow Developer Docs

> **Covers:** `skills/`, `capabilities/`, `runtime/prompts/`, `hooks/`, `pi-extension/src/`, `scripts/`, `command-surface.json`
> **Verified at:** `3a8fdf42` (2026-10-03)

For anyone working on Freeflow itself, people or agents: what the parts are, how they relate, the rules that hold across them, and where each part's detailed document is. Using Freeflow is covered by the [user docs](../plugin-docs/README.md).

## Purpose

Freeflow is a feedback-based control system for coding agents (it guides the agent's loop of acting, observing and correcting rather than replacing the agent): a portable skill pack and runtime guidance that steer an existing agent (Codex, Claude Code, Pi and others) through consequential work without ceremony, silent decisions, or unsupported claims. It is not a new agent, a permission system, or an enforcement engine. On Pi it also ships a native extension that adds capabilities the skill pack cannot: Cognitive Routing (splitting work between model profiles), Tool Execution (a layer over Pi's tools), and Compaction (the agent compacting its own context at a safe point), all without making a user pay more for the same work than native Pi.

## The Parts

```text
skills/  capabilities/  runtime/prompts/      model-facing methods and guidance (every host)
        │
        ├── hooks/  + host manifests           deliver core guidance at session start (Codex, Claude, Gemini, Cursor, Copilot)
        │
        └── pi-extension/src/                  native Pi delivery and capabilities
              host/            configuration, prompt sections, Runtime State, request history, status, settings
              cognitive-routing/   tool-execution/   compaction/     the optional capabilities
              provider-support/                prompt-cache and effort adaptations on qualified provider routes
```

- **Model-facing methods.** `runtime/prompts/` holds the always-present guidance: `core.md` (identity, shared terms, the three nested loops of interaction, feedback and environment work, and the Workflow, Action Selection, and Supported Exit cues that point to those skills), `interaction-contract.md`, and on Pi `working-method.md`, `tool-execution.md` and the `cognitive-routing.md` cue. `skills/` holds the 25 discoverable skills every host receives; Workflow owns the interaction and routes to leaf skills (Discuss, Write Spec, Execute Work, Verify Work, Track Work and the rest), which return evidence or route changes without widening authority. `capabilities/` holds two more skills listed only on Pi (`cognitive-routing`, `compaction`), not counted in the 25. How skills route to each other: [Skill routing](subsystems/skill-routing.md). How the prompt is assembled and gated: [Prompt assembly](subsystems/prompt-assembly.md).
- **Host hooks.** Hook-based hosts receive the core prompt and Interaction Contract at session start through one shared runtime-context renderer and a thin adapter per host (see Host Delivery below). They get no Pi capabilities.
- **The Pi extension.** `pi-extension/src/index.ts` registers Freeflow with Pi and wires every event to its owner. `host/` keeps what is not one capability: configuration, prompt sections, the Runtime State, request history, status and settings. Each capability is optional and lives in its own directory with a subsystem doc: Cognitive Routing (off by default), Tool Execution (off by default) and Compaction (on by default). `provider-support/` changes provider payloads only on qualified routes. [Pi extension](subsystems/pi-extension.md) covers what the extension registers and its persistence limits.
- **Task memory.** Track Work's `skills/track-work/scripts/working-record.mjs` owns the Working Record format (`.freeflow/tasks/*/record.md`, Git-ignored) and its lifecycle transitions; the skill teaches when to use them.
- **Tooling.** `scripts/validation/` holds the deterministic checks behind `npm run check`; `scripts/perf/` the request-overhead benchmark; `scripts/release*.mjs` release preparation; `scripts/freeflow-snapshot.mjs` the development snapshot; `.skill-eval/` the current skill evaluation definitions.

## Code Map

| Path | What it is |
| --- | --- |
| `skills/` | The 25 shared skills, one folder each (`SKILL.md`, `references/`, sometimes `scripts/`). |
| `capabilities/` | Pi-only capability skills. |
| `runtime/prompts/` | Always-present guidance fragments. |
| `hooks/` | `shared/runtime-context.mjs` (the renderer), `adapters/` (one per host), per-host `hooks.json`. |
| `pi-extension/src/` | Extension source (TypeScript); built to `pi-extension/dist/`, loaded through `pi-extension/freeflow/index.js`. Every directory under it has a README listing its files. |
| `pi-extension/tests/` | Unit and native tests (a real Pi session with scripted model responses), by area. |
| `plugin.json`, `gemini-extension.json`, `.cursor-plugin/`, `.claude-plugin/`, `.codex-plugin/`, `com.github.copilot/`, `opencode.json` | Host manifests and delivery metadata. |
| `command-surface.json` | The command and skill surface metadata the checks compare against. |
| `scripts/` | Validation, performance, release and snapshot tooling. |
| `plugin-docs/`, `dev-docs/` | User docs and developer docs. |
| `.deprecated/` | Retired features kept for reference (Tool Execution v2, legacy context, Output Router, Delegation Harness, modes, older project docs). Not active, tested, or packaged. |

## Rules Across The Code

- Freeflow guides; it does not enforce policy. Session hooks only load context, and enforcement hooks stay deferred until evaluations show concise guidance cannot prevent a repeated failure. On Pi, the extension's checks on tool calls (a refused blind overwrite, the bash guard, routing's phase gate) are working feedback that names the next step, not a permission system.
- One canonical skill tree serves every host. Host manifests point at `skills/`; nothing is copied or generated per host.
- On Pi, Freeflow never makes a request cost more than native Pi would: content a provider cached is never rewritten, the system section and tool definitions stay fixed for a configuration, and generated content is appended. See [Prompt cache rules](guides/prompt-cache.md).
- Freeflow's work on every request and turn stays small and does not grow with session age. See [Performance](guides/performance.md).
- Freeflow never patches Pi, rewrites session files, or replaces Pi's tools; it uses Pi's extension API and appends session entries.
- In the Pi extension, configuration is read only through `pi-extension/src/host/config.ts`; other code receives capability state. Hook adapters read it through the shared renderer.
- A failure in an optimization (cache placement, request history replay, compaction additions) falls back to Pi's own behavior; it never fails the user's request.

## Cross-Cutting Concerns

- **Configuration.** `.freeflow/config.json` is the required shared repository activation; `.freeflow/local.json` is an optional personal layer that cannot activate Freeflow alone; on Pi a session scope overrides both without touching files. `enabled` is the only core switch. Cognitive Routing and Tool Execution are off by default; Compaction is on. Removed keys (`defaultMode`, `interactionContract`, `skills`, `contextVirtualization`, `conversationHistory`) make a configuration invalid, and an invalid file keeps Freeflow from becoming effective rather than falling back to defaults. Inside Pi subagents all three optional capabilities, Compaction included, stay off. User-facing keys and settings: [Using Freeflow](../plugin-docs/using-freeflow.md).
- **Runtime State.** On Pi, current capability and routing state reaches the model as an appended Runtime State message, never as system-prompt changes. See [Request history and prompt cache](subsystems/request-history-and-cache.md).
- **Testing.** `npm run check` is the deterministic gate, including the typecheck, manifests, changelog, docs, formatting, command surface, activation contract, package contents and eval coverage. `npm run test:pi-extension` builds and runs the extension suite, including native tests against a real Pi session with scripted model responses; other `test:*` scripts cover Track Work, the snapshot, release utilities and the validation scripts. Model-based skill evaluations are separate and never part of CI.
- **Documentation.** User docs in `plugin-docs/` need the user's approval to change; developer docs here change in the same commit as the behavior they describe. Write both with the [Write Docs](../skills/write-docs/SKILL.md) skill and run its docs check: `node skills/write-docs/scripts/docs-check.mjs dev-docs`.
- **Release.** One npm package, released from a human-pushed `vX.Y.Z` tag. See [Release process](guides/release.md).
- **Development snapshots.** Pi development loads a snapshot of a committed revision built by `npm run snapshot:refresh`, never the working tree: commit first, then refresh.

## Host Delivery

Freeflow does not ship a CLI, duplicate manifest command handlers, enforcement hooks, or a new agent runtime in this release. It uses each host's native skill invocation and ships one shared runtime-context renderer with host-specific session adapters plus the Pi extension.

- **Codex and Claude Code:** `hooks/adapters/codex-session-start.mjs` and `claude-session-start.mjs` deliver the core fragments at `SessionStart` (startup, resume, clear, compact). Codex marketplace metadata uses local source `.`, while Claude uses host-valid local source `./`.
- **Gemini CLI:** `gemini-extension.json` and `hooks/hooks.json` with `gemini-session-start.mjs`.
- **Cursor:** the root `plugin.json` for skills; `.cursor-plugin/plugin.json` adds a `sessionStart` hook.
- **GitHub Copilot and VS Code:** the root `plugin.json`; `com.github.copilot/hooks/hooks.json` for `SessionStart`.
- **Kiro, OpenCode, Hermes and other skills-compatible hosts:** the root Agent Plugins 1.0 package or their skill-source configuration pointing at `skills/`; no always-on prompt surface.
- **Pi:** the root package manifest loads `pi-extension/freeflow/index.js` (Pi 0.99.1 or later).

All hook adapters stay inert without valid repository activation and never expose Pi capabilities. Hook trust and registration remain host concerns; local checks prove package and hook shapes, not host dispatch. Per-host detail: [Prompt assembly](subsystems/prompt-assembly.md#host-delivery).

## Subsystem Docs

How each part works and why:

- [Prompt assembly](subsystems/prompt-assembly.md): prompt fragments, Runtime State, discoverable skills, gating, host delivery, and nested execution context.
- [Skill routing](subsystems/skill-routing.md): shipped skills, ownership, sibling routes, and reference dependencies.
- [Cognitive Routing](subsystems/cognitive-routing.md): profiles and control, one routed run step by step, units and assignments, routing tools, evidence selection and projection, recovery, persistence, and the behavior that looks wrong but is intended.
- [Compaction](subsystems/compaction.md): when compaction is due, the agent path and carried context, Cognitive Routing and Pi's own compaction, and the behavior that looks wrong but is intended.
- [Tool Execution](subsystems/tool-execution.md): the layer over Pi's tools: prompt sections, file tracking, edit error rewrites, `apply_patch`, background commands, and the bash guard.
- [Request history and prompt cache](subsystems/request-history-and-cache.md): how generated messages keep their positions, cache breakpoints, the Coordinator keep-alive, effort history, and cache health.
- [Pi extension](subsystems/pi-extension.md): what the extension registers, cache reuse boundaries, persistence and recovery limits, development snapshots.

Guides (how to do maintainer work):

- [Prompt cache rules](guides/prompt-cache.md): the rules for changing request assembly and how to verify a change.
- [Performance](guides/performance.md): the rules, budgets, and tools that keep per-request and per-turn work small.
- [Release process](guides/release.md): preparation, evidence, and human-controlled release boundaries.

Decisions: [decision records](adr/README.md) for hard-to-reverse choices.
