# Freeflow Developer Docs

For anyone working on Freeflow itself, people or agents: how it works inside, why it works that way, and how to change it safely. Using Freeflow is covered by the [user docs](../plugin-docs/README.md).

Freeflow is a portable skill pack and context-loading runtime for coding agents. It is not a new agent, permission system, or enforcement engine. This page is the architecture overview; the sections below link the detailed documents.

## Index

**Subsystems** (how each part works and why):

- [Prompt assembly](subsystems/prompt-assembly.md): prompt fragments, Runtime State, discoverable skills, gating, and nested execution context.
- [Skill routing](subsystems/skill-routing.md): shipped skills, ownership, sibling routes, and reference dependencies.
- [Cognitive Routing](subsystems/cognitive-routing.md): unit and assignment lifecycle, routing tools, evidence selection and recovery, persistence.
- [Compaction](subsystems/compaction.md): when compaction is due, the agent path and carried context, Cognitive Routing and Pi's own compaction, and the behavior that looks wrong but is intended.
- [Tool Execution](subsystems/tool-execution.md): the layer over Pi's tools: prompt sections, file tracking, edit error rewrites, `apply_patch`, background commands, and the bash guard.
- [Request history and prompt cache](subsystems/request-history-and-cache.md): how generated messages keep their positions, cache breakpoints, the Coordinator keep-alive, effort history, and cache health.
- [Pi extension](subsystems/pi-extension.md): what the extension registers, cache reuse boundaries, persistence and recovery limits, development snapshots.

**Guides** (how to do maintainer work):

- [Prompt cache rules](guides/prompt-cache.md): how Freeflow keeps requests cache-safe, and the rules for changing request assembly.
- [Performance](guides/performance.md): the rules, budgets, and tools that keep Freeflow's per-request and per-turn work small.
- [Release process](guides/release.md): one-package preparation, evidence, and human-controlled release boundaries.

**Decisions:** [decision records](adr/README.md) for hard-to-reverse choices.

Write and update these documents with the [Write Docs](../skills/write-docs/SKILL.md) skill. A developer doc changes in the same commit as the behavior it describes.

## Package Boundary

The repository root is the single source of truth for skills, references, runtime contracts, manifests, capability source, command metadata, docs, and current evidence.

```text
freeflow/
  plugin.json                    # Agent Plugins 1.0 portable manifest
  gemini-extension.json          # Gemini CLI extension manifest
  opencode.json                  # OpenCode project skill-source config
  .cursor-plugin/plugin.json     # Cursor-specific manifest
  com.github.copilot/            # Copilot/VS Code-specific components
  runtime/prompts/
  skills/
  capabilities/
  hooks/
  pi-extension/
  .deprecated/
  command-surface.json
  plugin-docs/                   # user docs
  dev-docs/                      # developer docs
  .deprecated/project-docs/
  .skill-eval/
```

The npm tarball contains runtime-required files, including the built Pi entrypoint, prompts, skills and capability skills, plus `NOTICE` and `licenses/` for code ported from OpenAI Codex (Apache-2.0); Pi TypeScript source and repository test trees are not package content. The package has no runtime dependencies; Pi and Pi TUI are host peers. GitHub also retains plugin docs, project memory, current eval definitions, and deprecated historical evidence. Retired Output Router evidence is preserved under `.deprecated/output-router/`. There is no generated package mirror.

## Documentation and source boundaries

- `plugin-docs/` holds the user docs: installing, configuring, and using Freeflow. Changing them needs the user's approval.
- `dev-docs/` holds the developer docs: architecture, subsystems, maintainer guides, and decision records. They change with the code they describe.
- `plugin-docs/release-evidence/` stores immutable versioned evidence records rather than a rolling current-state page.
- `CHANGELOG.md` records release history for the single published Freeflow package.
- `.deprecated/project-docs/` preserves project plans, handoffs, research, issues, and historical evidence; it is not the normal current-runtime reading path.
- `.freeflow/tasks/` contains ignored Working Records and task-local Plans; it is not public or package documentation.
- `plugin.json` is the Agent Plugins 1.0 root manifest. `skills/` is discovered at its fixed standard location; the manifest does not override it. `.cursor-plugin/`, `gemini-extension.json`, `com.github.copilot/`, and `opencode.json` are host-specific delivery metadata/configuration, not additional skill sources. `opencode.json` is repository-only and is not part of the npm runtime allowlist.

For local Pi extension development, Freeflow can provide an exact-commit development snapshot outside the repository. The assembler uses the committed lockfile to install declared runtime dependencies with scripts disabled and records source/package/dependency provenance before atomic publication, so the cached target is self-contained. It is not a production release or source-precedence mechanism; production installs use ordinary npm/Git sources. Snapshot refresh does not establish installed-host delivery or change host state.

Codex marketplace metadata uses local source `.`, while Claude uses host-valid local source `./`. Agent Plugins-compatible hosts read the root `plugin.json`; Gemini reads `gemini-extension.json`; Cursor-specific hooks use `.cursor-plugin/plugin.json`; Copilot/VS Code-specific hooks use `com.github.copilot/`. Pi loads `pi-extension/freeflow/index.js` from the root package manifest.

Freeflow does not ship a CLI, duplicate manifest command handlers, enforcement hooks, or a new agent runtime in this release. It uses each host's native skill invocation and ships one shared runtime-context renderer with host-specific session adapters plus the Pi extension.

## Layered Configuration

`.freeflow/config.json` is required shared repository activation. `.freeflow/local.json` is optional per-checkout personal core configuration and cannot activate Freeflow alone.

```text
host session enablement
-> personal override
-> repository value
-> built-in default
```

`enabled` is the only Freeflow core switch. When it is effective, the core prompt, Interaction Contract, and 25 base skills are present. Cognitive Routing and Tool Execution are optional gated capabilities, off by default; Compaction is gated by `compaction.enabled` and on by default. Configurations containing the removed `defaultMode`, `interactionContract`, or `skills` keys, or the retired `contextVirtualization` and `conversationHistory` keys, are invalid. An invalid existing personal layer fails closed; remove either legacy context key from both config layers before using Freeflow.

Cognitive Routing has its own v2 shape under `cognitiveRouting`:

```json
{
  "enabled": true,
  "delegation": "both",
  "projection": true,
  "profiles": {
    "coordinator": { "provider": "openai", "model": "gpt-4o", "thinking": "off" },
    "helper": { "provider": "openai", "model": "gpt-4.1-mini", "thinking": "off" },
    "executor": { "provider": "openai", "model": "gpt-4.1", "thinking": "off" }
  }
}
```

`delegation` accepts `executor`, `helper`, or `both` and defaults to `executor`; `projection` defaults to `true`. Profile names are `coordinator`, `helper`, and `executor`. Every configured preset must contain `provider`, `model`, and a supported thinking enum. Only profiles required by the selected mode or recorded current responsibility must resolve to available, authenticated models at that exact thinking level; a well-formed unused unavailable preset does not block another valid mode. Coordinator must differ from every enabled worker; Helper and Executor may share a pair. Repository delegation may be overridden personally or for one session. Older experimental routing fields or names such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are rejected as routing configuration and are not migrated. Rewrite them manually. Configuration establishes activation state; it does not prove host runtime delivery or model behavior.

Tool Execution has one switch, `toolExecution.enabled` (default `false`); the keys of the retired v2 runtime still load and do nothing. Compaction has `compaction.enabled` (default `true`) and `compaction.carry` (Context reuse, default `true`). The Pi session scope can override `enabled`, `cognitiveRouting.enabled`, `cognitiveRouting.projection`, `toolExecution.enabled`, `compaction.enabled` and `compaction.carry`, the delegation mode, and complete profile presets.

## Runtime Guidance

Freeflow has four coordinated model-facing parts:

1. **Core guidance:** `runtime/prompts/core.md` owns stable identity, shared terms, the three nested loops (Interaction Lifecycle, Feedback Loop, and Environment Interaction Loop), recovery, and Workflow, Action Selection, and Supported Exit cues.
2. **Interaction Contract:** `runtime/prompts/interaction-contract.md` is a separate mandatory fragment for whole-turn interpretation and establishing outcome, scope, and the user-facing return condition without redundant confirmation.
3. **Runtime State:** the extension supplies current capability availability and Cognitive Routing Control/Profile/Delegation/Projection at session start, after context reconstruction or loss, and when displayed state changes; unchanged state remains in the current provider context. It is not system-prompt policy.
4. **Discoverable skills:** 25 base skills under `skills/` are exposed with the core surface; child capability skills under `capabilities/` are exposed only when their own gates are effective.

The Interaction Contract is prompt-only and not discoverable. Full skill and capability bodies are discoverable methods, not persistent bootstrap content. Context loading does not enforce policy, block tools, grant permissions, or replace repository instructions. See [System Prompt Architecture](subsystems/prompt-assembly.md) for the canonical assembly and gating contract, and [Capabilities](../plugin-docs/capabilities/README.md) for detailed capability contracts.

## Host Delivery

### Codex and Claude Code

`hooks/adapters/codex-session-start.mjs` and `hooks/adapters/claude-session-start.mjs` use the shared `hooks/shared/runtime-context.mjs` renderer. Their host manifests preserve the `SessionStart` lifecycle boundary and startup, resume, clear, and compact matcher. They read repository and personal layers and deliver the mandatory core fragments without processing submitted prompts, persisting session controls, or creating clear-transfer state. Codex and Claude do not receive Pi-specific capability delivery.

The compatibility entrypoint `hooks/freeflow-runtime-context.mjs` remains executable for existing integrations. All shared adapters stay inert without valid repository activation, fail closed on invalid personal core config, and never inspect or expose Pi-specific capabilities. Host trust or hook registration may still be required. Setup reports delivery as confirmed, unavailable, or unconfirmed.

### Gemini CLI

`gemini-extension.json` identifies the root package as a Gemini extension. Gemini’s root `hooks/hooks.json` invokes `hooks/adapters/gemini-session-start.mjs` for its documented `SessionStart` lifecycle. The adapter returns Gemini’s `hookSpecificOutput.additionalContext` shape and shares the mandatory prompt renderer; Gemini does not receive Pi-specific capabilities.

### Cursor

The root `plugin.json` supplies the portable Agent Plugins 1.0 skill surface. `.cursor-plugin/plugin.json` adds Cursor’s documented `sessionStart` hook path, which invokes `hooks/adapters/cursor-session-start.mjs` and returns Cursor’s `additional_context` field. Cursor hook delivery is host-specific and fire-and-forget; the root standard manifest alone does not prove that runtime hook behavior occurred.

### GitHub Copilot and VS Code

Copilot CLI and VS Code consume the root Agent Plugins 1.0 `plugin.json` and fixed `skills/` directory. The `com.github.copilot/hooks/hooks.json` namespace provides the compatible `SessionStart` adapter for hosts with plugin hooks enabled. VS Code hook support is currently preview; Copilot cloud and CLI have different lifecycle environments. Local checks prove the package and hook shapes, not host dispatch or marketplace availability.

### Kiro, OpenCode, Hermes, and other skills-compatible hosts

Kiro can consume the root Agent Plugins 1.0 package as a Power and activate the same `skills/` directories. Hermes can install the same root portable package through its Agent Plugins adapter or scan the source through its skills workflow. OpenCode v2 uses the repository `opencode.json` `skills` array or an equivalent installed-project configuration to point at the existing `skills/` directory. This package does not add Kiro steering files, a Hermes `plugin.yaml`/`register(ctx)` module, or an OpenCode plugin module. Cline and Kilo are not claimed as native plugin integrations; users may use their documented standalone Agent Skills paths when available.

### Pi

The source Pi entrypoint:

- reads both config layers before agent turns;
- composes the mandatory core prompt and Interaction Contract plus effective optional capability prompts in `before_agent_start`;
- supplies one unified volatile `Freeflow Runtime State` message at session start, after context reconstruction or loss, and when displayed state changes, preserving it when unchanged;
- restores branch-aware session overrides for enablement, the optional capabilities and Compaction, Cognitive Routing delegation mode, and complete profile pairs;
- dynamically exposes 25 base model/contributor skills plus effective child capability skills;
- registers canonical direct commands, the v2 routing tools, Tool Execution's `apply_patch`, `bash_background` and `stop_background`, and `freeflow_compact`, each declared only while its gate is effective;
- with Tool Execution, adds its prompt section and the file-tracking layer around Pi's own tools, which stay available;
- with Compaction, measures context after each turn, sends the compaction notices, writes Freeflow compactions at turn end, and adds its instructions and state to Pi's own compaction;
- activates capability operations and discoverable capability skills only when their individual gates are effective;
- when the native source host gate is effective, uses Pi's model registry, session-scoped model/thinking controls, and native session entries for v2 Coordinator/Helper/Executor routing.

The native entrypoint is not yet in a released package. Native fixtures and live Pi 1.0 sessions on GPT-6 Luna and Sol 6.1 exercise it; model evaluation across models remains open.

`/freeflow settings` opens one settings screen with Session, Personal and Repository scopes (Tab switches); switches change in place, and session changes do not touch config files. `/freeflow settings session`, `local` and `repo` open it on that scope.

Pi source lives under `pi-extension/src/`; the package executes built output under `pi-extension/dist/` through `pi-extension/freeflow/index.js`.

## Skill Architecture

Workflow owns authority interpretation, work-agreement coordination, readiness, current-owner selection, and routing. It establishes the required outcome and supported approach for the next coherent unit rather than requiring a fixed sequence of documents or user turns. Leaf skills own focused methods and return evidence, decisions, or route changes without widening authority. Selecting a leaf method never authorizes active evidence generation, mutation, or delivery.

A skill body establishes the first-read job and normal route from guaranteed context. Separately owned required depth and conditional branch depth live in linked references whose read points are declared by the body; deterministic repeated work may live in scripts. Cross-skill links are project dependencies, not bundled local resources.

See [Skill routing](subsystems/skill-routing.md) for the typed owner, route, and reference adjacency map.

The active cross-host model/contributor surface has 24 skills under `skills/`, including Action Selection and Workflow. Agent Plugins-compatible hosts, Gemini, Cursor, Codex, Claude, OpenCode, Hermes, and the Pi extension all consume this one canonical skill tree through their documented discovery surfaces. Cognitive Routing is a Pi-specific capability skill under `capabilities/`, outside non-Pi host delivery. The removed Context Virtualization and Conversation History skills, source, and evaluations are preserved under `.deprecated/legacy-context/`; they are not an active package surface. Retired Output Router material is preserved under `.deprecated/output-router/`. Removed Mode Contract material is preserved under `.deprecated/modes/` and is not an active package surface.

## Review And Verification Topology

The active agent owns factual verification and workflow control. Self-review is silent and follows supported verification.

Independent review is a distinct selected and authorized judgment boundary, not an automatic consequence of writing a Spec, Plan, or implementation. Authors self-review Specs and Plans through Review Artifact; independent artifact or work review is used only when selected to protect a concrete boundary. Review budgets limit dispatches but do not authorize them.

Verify Work owns shared test-design guidance without mandatory test-first sequencing. Checks retain their accepted property and observing boundary when revised. Reports distinguish implemented work, exercised assertions, and supported claims, including whether saved results still apply after relevant edits.

A review report never edits. The active agent adjudicates and may request corrections plus one warranted focused follow-up together. Corrections return to Execute Work or the artifact owner and may remain in the same coherent Working Record slice.

## Task Memory

Track Work owns one complete model-facing method and one deterministic executable boundary:

- `skills/track-work/SKILL.md` teaches continuity, state reconstruction, Slice lifecycle, authority, and settlement judgment;
- `skills/track-work/references/working-record-format.md` defines the Schema 4 Markdown structure and direct-edit boundary;
- `skills/track-work/scripts/working-record.mjs` owns Schema 4 parsing, two views, deterministic lifecycle transitions, ID allocation, validation, and atomic persistence.

Schema 4 is an intentional breaking change from the prior Schema 2/3 representations. Existing ignored records remain untouched and are not automatically migrated; later compatibility work must select records explicitly and preserve copy-first recovery evidence.

After context loss, Workflow requests the complete `full` record and reconciles its current sections and History with the agreement, current assignment, supersession, and relevant live sources. Incomplete full recovery stops affected work. `resume` and targeted reads remain available for intact-session continuation; neither command's output format or lifecycle behavior changes.

The record preserves a provisional remaining route, dependencies, actual observations, and their applicability—not a transcript or a second routing-state store. A context boundary need not complete or replace a Slice. Conversation branches may preserve memory but cannot create authority for another branch.

## Capabilities

The former Freeflow Context tool, Context Virtualization, and Conversation History capabilities are removed from the active runtime surfaces. Their historical source and guidance are preserved under `.deprecated/legacy-context/`; Context Control v2 is planned but unavailable and is not a replacement in this release.

The v2 Cognitive Routing capability owns Coordinator plus optional Helper and Executor profiles, `executor`/`helper`/`both` delegation modes, native session-entry state, automatic assignment/report/assessment flow, `/freeflow profile coordinator|helper|executor|auto|history`, `/freeflow resume`, and the tools `freeflow_delegate`, `freeflow_return`, `freeflow_unit`, and `freeflow_project`. Coordinator alone delegates one worker at a time. Helper is the normal delegate for supporting work when enabled; Executor is commissioned for substantive or consequential results; Coordinator implements directly in `helper` mode. Projection is enabled by default; with it, Helper and Executor share ordinary history while worker evidence is selected for Coordinator with native dependencies and explicit readiness problems. Saved reports and the assigned worker remain independent of a later profile or mode change. Its current source path is experimental: the native Pi entrypoint is wired but unreleased and uninstalled.

The legacy context transforms are no longer part of the runtime, so their former composition restriction is not an active configuration choice. Context Control v2 remains planned and unavailable; this page does not define its future composition boundary. Routing state uses native `freeflow-routing-v2` entries and a strict read-only persisted snapshot for reconciliation; it does not patch host files, claim `fsync`, or promise exactly-once behavior. Pi-specific prefix reuse and cache-breaking boundaries are documented in [Pi cache reuse boundaries](subsystems/pi-extension.md#cache-reuse-boundaries).

Delegation Harness is retired from the live package. Its implementation and historical evidence remain under `.deprecated/delegation-harness/`.

Tool Execution owns the layer over Pi's tools: its prompt section and environment facts, file tracking, rewritten edit errors and refusals, `apply_patch`, and background commands. The retired v2 runtime (Session Store, programs, discovery, adapters, efficiency reports) is preserved under `.deprecated/tool-execution-v2/`. See [Tool Execution](../plugin-docs/capabilities/tool-execution.md).

Compaction owns the compaction thresholds and notices, `freeflow_compact`, the carried context and recovery message, and Freeflow's additions to Pi's own compaction. Cognitive Routing remains the responsibility owner; RequestHistory remains the generated-occurrence replay owner; selected OpenAI-model support owns qualified provider-request effort-history adaptation. See [Compaction](../plugin-docs/capabilities/compaction.md).

## Deferred Enforcement

Enforcement hooks and CLI policy checks remain deferred until behavioral evidence shows that concise instructions and workflow routing cannot prevent a repeated concrete failure. Existing hooks load context only.
