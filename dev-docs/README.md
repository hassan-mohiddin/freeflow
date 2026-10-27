# Freeflow Developer Docs

> **Covers:** `pi-extension/src/README.md`, `hooks/`, `runtime/prompts/`, `plugin.json`, `package.json`, `command-surface.json`
> **Verified at:** `eb4a7af7` (2026-10-24)

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

- **Model-facing methods.** `runtime/prompts/` holds the always-present guidance: `core.md` (identity, shared terms, How Freeflow Works: the agree, build, verify, review and hand-over cycle, each step naming the skill that holds its method (Discuss Work at a task's first request, before the first tool call, with the agreement sent before the first change on a task that builds, fixes or changes behavior; Execute Work before the first tool call of any task, read-only ones included; Verify Work before saying a change works, Review Work, Deliver Work, Write Docs, Write Skill before creating or revising text an agent acts on) in the words its description uses, then the references and scripts its routing table gives for common moments (design, simplify, migration, test design, runtime evidence, work and artifact review, branch closeout, handoff, delivery state, the docs check), and saying to read that skill's whole body before acting and a reference its table names before acting on that row, that outside the cycle a skill is read when its situation comes up, at any step: Track Work (a Working Record when work spans sessions, a compaction or a handoff, and its handoff reference) and Evaluate Behavior (before writing or running an eval of a skill, prompt, model or setting); what authorizes work and where it stops; reading the project's developer docs and keeping knowledge where it lasts, and recovery after context loss, which a pause or a resumed session that keeps the conversation is not; skills are cued by their own descriptions), `interaction-contract.md` (reading a turn, including a question or a stop mid-work, when to ask, and the Work agreement: proposing it when scope is unclear, ending at its edge with the next step as a question, holding a narrower instruction until the user lifts it, and updating a Working Record's agreement when the user changes direction), `working-method.md` (the rules every task keeps, a one-line habit for each step that names the skill, reference or script holding its method, and keeping tool output small; the full method for each step moved into its skill in 0.9.0) wherever Freeflow is enabled, and on Pi `tool-execution.md` (Pi's tools only; it relies on the Working Method for output and scratch files) and the `cognitive-routing.md` cue. `skills/` holds the discoverable skills every host receives; each description says when its skill applies, so the descriptions and core's cycle route the work (Discuss Work, Execute Work, Verify Work, Review Work, Track Work and the rest), and no skill orchestrates the others. `capabilities/` holds four more skills listed only on Pi (`cognitive-routing`, `compaction`, `task-memory`, `messaging`), not counted among them; the `task_memory` and `send_message` tool descriptions name their skill, so the tool leads to it too. How skills route to each other: [Skill routing](subsystems/skill-routing.md). How the prompt is assembled and gated: [Prompt assembly](subsystems/prompt-assembly.md).
- **Host hooks.** Hook-based hosts receive the core prompt, Interaction Contract and Working Method at session start, each unless the user turned it off with `prompts`, and a Runtime State naming the skills the user turned off, through one shared runtime-context renderer and a thin adapter per host (see Host Delivery below). They get no Pi capabilities.
- **The Pi extension.** `pi-extension/src/index.ts` registers Freeflow with Pi and wires every event to its owner. `host/` keeps what is not one capability: configuration, prompt sections, the Runtime State, request history, status and settings. Each capability is optional and lives in its own directory with a subsystem doc: Cognitive Routing (off by default), Tool Execution (on by default) and Compaction (on by default). `provider-support/` changes provider payloads only on qualified routes. [Pi extension](subsystems/pi-extension.md) covers what the extension registers and its persistence limits.
- **Task memory.** Track Work's `skills/track-work/scripts/working-record.mjs` owns the Working Record format (`.freeflow/tasks/*/record.md`, Git-ignored) and its lifecycle transitions, and its library owns the portable registry of projects, registered tasks, child records and owners under the Freeflow home; the skill teaches when to use them. On Pi the [Task memory](subsystems/task-memory.md) capability (a prototype) pairs with it, adding session attachment, delivery and a write gate.
- **Tooling.** `scripts/validation/` holds the deterministic checks behind `npm run check`; `scripts/perf/` the request-overhead benchmark; `scripts/release*.mjs` release preparation; `scripts/freeflow-snapshot.mjs` the development snapshot; `.skill-eval/` the current skill evaluation definitions.

## Code Map

| Path | What it is |
| --- | --- |
| `skills/` | The shared skills, one folder each, matching the canonical list in `pi-extension/src/host/catalog.ts` (`SKILL.md`, `references/`, sometimes `scripts/`). |
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
- In the Pi extension, configuration is read only through `pi-extension/src/host/config.ts`; other code receives capability state. Hook adapters read it through the shared renderer, which validates both files with the same `host/config-validation.ts` (built to `pi-extension/dist/`), so a config is valid or invalid on every host alike.
- A failure in an optimization (cache placement, request history replay, compaction additions) falls back to Pi's own behavior; it never fails the user's request.

## Cross-Cutting Concerns

- **Configuration.** `.freeflow/config.json` is the required shared repository activation; `.freeflow/local.json` is an optional personal layer that cannot activate Freeflow alone; on Pi a session scope overrides both without touching files. `enabled` is the only core switch. Cognitive Routing is off by default; Tool Execution and Compaction are on. Removed keys (`defaultMode`, the top-level `interactionContract`, `skills.enabled`, `contextVirtualization`, `conversationHistory`) make a configuration invalid, and an invalid file keeps Freeflow from becoming effective rather than falling back to defaults. Inside Pi subagents all three optional capabilities, Compaction included, stay off. `review` (Review Work's `mode` and reviewer `model`) is not a capability: every host reads it with `resolveReviewSettings()` in `config-validation.ts`, the personal file overriding the shared one field by field, and reports a non-default choice as one Runtime State line; how Review Work acts on it is guidance in its skill. `prompts` and `skills`, each with a master switch (`enabled`) and a switch per item, are read the same way on every host: Pi leaves an off prompt out and does not load an off skill, and every host's Runtime State names off skills (`skillsStateLine()`). Every setting has a `/freeflow settings` row in the Session, Personal and Repository scopes. User-facing keys and settings: [Using Freeflow](../plugin-docs/using-freeflow.md).
- **Runtime State.** On Pi, current capability and routing state reaches the model as an appended Runtime State message, never as system-prompt changes. See [Request history and prompt cache](subsystems/request-history-and-cache.md).
- **Testing.** `npm run check` is the deterministic gate, including the typecheck (TypeScript strict mode), lint (`eslint.config.mjs`: promises that are neither awaited nor handled, and awaits of values that are not promises, in `pi-extension/src`), manifests, changelog, docs, formatting, command surface, activation contract, package contents, eval coverage (a recorded skill hash that no longer matches its source fails), that every `.skill-eval` definition loads, the coverage matrix's shape, the skill routing map, and the workflow incident fixtures against their frozen provenance. `npm test` runs every suite, and is what both workflows run (CI also runs the Track Work and Pi extension suites on macOS, as a check that does not gate merging; `windows.yml` runs them on Windows on demand, since Freeflow on Pi does not support Windows yet); `check:release-workflow` fails if a `test:*` script is missing from it. Among them, `npm run test:pi-extension` builds and runs the extension suite, including native tests against a real Pi session with scripted model responses; the other `test:*` scripts cover Track Work (with `view recover` and the Material updates pointer audit), Discuss Work's `choices.mjs`, Execute Work's `touch-map.mjs` and `self-review.mjs`, Deliver Work's `delivery-state.mjs`, `commit-state.mjs`, `release-preflight.mjs` and `push-route.mjs`, Review Work's `check-brief.mjs` and `review-packet.mjs`, Verify Work's `test-changes.mjs`, Write Docs' docs check (`--covering`), `plan-lint.mjs` and `artifact-check.mjs`, the snapshot, release utilities and the validation scripts; `test:guards` runs five validation guards (activation contract, package, skill routing, command surface, release version) against a copy of the committed tree, each with one injected defect it must catch. A weekly workflow (`.github/workflows/npm-audit.yml`, as Pi runs daily) audits the installed packages for known vulnerabilities and checks their registry signatures; Freeflow ships no third-party code, so this covers the build tools, and a red run means updating by hand. Model-based skill evaluations are separate and never part of CI; `npm run eval:gate -- --base <ref>` runs the regression suites for what a change touches, locally and on a cheap model (`.skill-eval/scripts/gate.md`).
- **Documentation.** User docs in `plugin-docs/` need the user's approval to change; developer docs here change in the same commit as the behavior they describe. Write both with the [Write Docs](../skills/write-docs/SKILL.md) skill. `npm run check` runs its docs check in strict mode (`check:dev-docs`): it fails when code a developer doc covers changed in a commit that neither changed the doc nor moved its `Verified at` past it, so the doc is reread with every change it covers. `docs-check.mjs --covering <path>` lists the docs that cover a path, so a change can find what to reread.
- **Release.** One npm package, released from a human-pushed `vX.Y.Z` tag. See [Release process](guides/release.md).
- **Development snapshots.** Pi development loads a snapshot of a committed revision built by `npm run snapshot:refresh`, never the working tree: commit first, then refresh.

## Host Delivery

Freeflow does not ship a CLI, duplicate manifest command handlers, enforcement hooks, or a new agent runtime in this release. It uses each host's native skill invocation and ships one shared runtime-context renderer with host-specific session adapters plus the Pi extension.

- **Codex and Claude Code:** `hooks/adapters/codex-session-start.mjs` and `claude-session-start.mjs` deliver the core fragments and the Working Method at `SessionStart` (startup, resume, clear, compact, and on Claude Code fork). Claude Code runs one hook per prompt because it caps each hook's context at 10,000 characters; Codex runs one hook with a raised `additionalContextLimit`. Codex's marketplace entry installs the npm package, while Claude uses host-valid local source `./`.
- **Gemini CLI:** `gemini-extension.json` and `hooks/hooks.json` with `gemini-session-start.mjs`.
- **Cursor:** the root `plugin.json` for skills; `.cursor-plugin/plugin.json` adds a `sessionStart` hook.
- **GitHub Copilot and VS Code:** the root `plugin.json`; `com.github.copilot/hooks/hooks.json` for `SessionStart`.
- **Kiro, OpenCode, Hermes and other skills-compatible hosts:** the root Agent Plugins 1.0 package or their skill-source configuration pointing at `skills/`; no always-on prompt surface.
- **Pi:** the root package manifest loads `pi-extension/freeflow/index.js` (Pi 0.99.1 or later).

All hook adapters stay inert without valid repository activation and never expose Pi capabilities. An existing but invalid `.freeflow/config.json` or `.freeflow/local.json` delivers a short configuration error naming the file instead of the core prompt, as Pi's status does; a missing repository config delivers nothing. Hook trust and registration remain host concerns; local checks prove package and hook shapes, not host dispatch. Per-host detail: [Prompt assembly](subsystems/prompt-assembly.md#host-delivery).

## Review Rules

For anyone reviewing a change to Freeflow, people or agents. Review with [Review Work](../skills/review-work/SKILL.md): its classes, judgments and evidence rules apply unchanged, and this section only adds what is specific to Freeflow. Read it from the base branch, never from the change under review.

- **Blocking Issue in Freeflow:** a change that breaks a Rule Across The Code above; a change to a skill, prompt or other instruction text that does not follow [Write Skill](../skills/write-skill/SKILL.md) or lacks the evidence its claim needs; a changed existing test, fixture or shared test setup (as `skills/verify-work/scripts/test-changes.mjs` lists them) with no reason that keeps what it checked and no agreement from the user; and a claim in a doc, changelog entry or report that the code or an observed run does not support.
- **Already checked:** `npm run check` and `npm test` cover formatting, types, lint, manifests, changelog structure, named doc paths, the command surface and the skill routing map. Run them first, as Review Work's [deterministic checks](../skills/review-work/SKILL.md#before-any-review), and report a failing check, not the findings it would make.
- **Sensitive paths:** `skills/`, `runtime/prompts/`, `pi-extension/`, and the release files (`package.json`, `CHANGELOG.md`, `scripts/release.mjs`, `scripts/release-utils.mjs`, `scripts/release-notes.mjs`, `scripts/changelog-utils.mjs`, `.github/workflows/`). A change touching them gets a full review, never a light one.

## Subsystem Docs

How each part works and why:

- [Prompt assembly](subsystems/prompt-assembly.md): prompt fragments, Runtime State, discoverable skills, gating, host delivery, and nested execution context.
- [Skill routing](subsystems/skill-routing.md): shipped skills, ownership, sibling routes, and reference dependencies.
- [Cognitive Routing](subsystems/cognitive-routing.md): profiles and control, one routed run step by step, units and assignments, routing tools, evidence selection and projection, recovery, persistence, and the behavior that looks wrong but is intended.
- [Compaction](subsystems/compaction.md): when compaction is due, the agent path and carried context, Cognitive Routing and Pi's own compaction, and the behavior that looks wrong but is intended.
- [Task memory](subsystems/task-memory.md) (prototype): Working Records attached to a Pi session, snapshot delivery, the write gate, and its decisions.
- [Ask user and the inbound channel](subsystems/ask-user.md): the `ask_user` dialog, its guidance layers, and how content from outside the turn reaches the model.
- [Messaging](subsystems/messaging.md) (preview): messages between live Pi sessions: the registry, sockets, the inbound policy and held messages, deferred tools.
- [Tool Execution](subsystems/tool-execution.md): the layer over Pi's tools: prompt sections, file tracking, edit error rewrites, `apply_patch`, background commands and monitors, and the bash guard.
- [Request history and prompt cache](subsystems/request-history-and-cache.md): how generated messages keep their positions, cache breakpoints, the Coordinator keep-alive, effort history, and cache health.
- [Verification, review and evaluation](subsystems/verification-review-evaluation.md): Review Work and the judge contract, the behavior evaluator (configurations, arms, modes, decisions, judged evidence, isolation, stored evidence), the contributor gate, and how they connect with Verify Work.
- [Pi extension](subsystems/pi-extension.md): what the extension registers, cache reuse boundaries, persistence and recovery limits, development snapshots.

Guides (how to do maintainer work):

- [Prompt cache rules](guides/prompt-cache.md): the rules for changing request assembly and how to verify a change.
- [Performance](guides/performance.md): the rules, budgets, and tools that keep per-request and per-turn work small.
- [Release process](guides/release.md): preparation, evidence, and human-controlled release boundaries.
- [Verify live](guides/verify-live.md): launching an isolated Pi session with this checkout's extension, checking and driving it, evidence, clean-up, and which inputs cost a model call.

Skill design records (what a skill is meant to change, why it is shaped that way, and its evidence; the shape is in Write Docs):

- [Write Docs](skills/write-docs.md): task artifacts and documentation kept apart, the research shape and where its rules come from, history in git.
- [Write Skill](skills/write-skill.md): trunks over many skills and why, descriptions for recall, a light body, design records, and the evaluation behind them.

Features (how a user meets Freeflow, and the exact steps that show each feature working live): the [feature map](features/README.md).

Decisions: [decision records](adr/README.md) for hard-to-reverse choices.
