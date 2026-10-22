# System Prompt Architecture

Freeflow’s model-facing behavior is delivered through coordinated core, capability, and runtime surfaces. They form one effective surface for a provider request, not independent policies.

## The model-facing layers

### 1. Core guidance

`runtime/prompts/core.md` is the stable base guidance. It owns:

- Freeflow identity and shared boundaries;
- shared terminology;
- How Freeflow Works: the cycle (agree before the first edit on a task that builds or changes behavior, build and verify, review when Review Work's gate calls for it, hand over), what authorizes work and where it stops, and when to open a reference. It replaced the Workflow skill in October 2026, whose body agents rarely opened, so the cycle now reaches every turn and the skill descriptions carry the routing. The agree step carries the agreement itself (what I'll do, where I stop, the user's decisions with a default each, every open choice listed, technical ones too) rather than only a cue to Agree Work, because agents rarely opened Agree Work's body before their first edit; Agree Work keeps the list and the rest of the method. In 0.9.0 the clause "open a skill when the work's subject is its subject, not on a keyword" was cut: it did not reduce misfires, and the skill descriptions say when each applies;
- compact readiness and recovery invariants, including what counts as context loss: the conversation about the current work is no longer in context, so a new message, a pause or a resumed session that keeps it is not context loss;
- Project Memory: reading the project's developer docs before changing or judging code, and keeping what is learned where it lasts (task state in the Working Record, how the project works in developer docs, only agent rules in instruction files such as AGENTS.md or CLAUDE.md);

Core guidance is mandatory whenever Freeflow is enabled and also contains the guidance previously separated into `skills.md`. Detailed planning, execution, verification, and handback methods remain in skills rather than being duplicated into the standing prompt. The Working Method likewise keeps the everyday habits an ordinary turn needs and leaves what a skill already owns there: the diagnosis template to Execute Work's diagnose reference, performance measurement to Verify Work, and readiness before an edit and the smallest change to Execute Work. It owns keeping tool output small (capping, saying when output was cut, saving long output to a scratch file), which until 0.9.0 lived in the Action Selection skill and, on Pi, in Tool Execution's prompt: the skill's body was almost never opened, and Tool Execution reaches only Pi with that capability on, so the rule now reaches every host once and Tool Execution keeps only what is specific to Pi's tools.

### 2. Interaction Contract

`runtime/prompts/interaction-contract.md` remains a separate mandatory prompt fragment. It owns whole-turn interpretation, the distinction between discussion and authorization, and establishing the outcome, scope, and user-facing return condition. A clear request needs no redundant confirmation; an unsettled material boundary requires a question before execution.

Keeping this file separate lets its behavior change without changing the rest of the core guidance. It is not a configurable capability and is not a discoverable skill.

### 3. Runtime State

The extension supplies one compact volatile Runtime State record at session start, after context reconstruction or loss, and when its displayed state changes, including when Freeflow is disabled or unconfigured. When state is unchanged and the previous record remains in continuous provider context, the extension preserves it rather than appending a replacement. It reports current facts such as:

- whether Freeflow is active, inactive, unavailable, or awaiting setup;
- while Freeflow is active, the user's `review` setting (``Review: `off` ``, ``Review: `always`, reviewer model `<model>` ``), only when it is other than the default `auto` with no model, so most users' state stays as it was; the hook hosts' state carries the same line;
- optional capability availability;
- Cognitive Routing `Control`, `Profile`, `Delegation`, and `Projection`;
- with Tool Execution on and routing projection off, the Freeflow skills already read in this context (`Freeflow skills read in this context: …`), taken only where the state refreshes anyway; see [Tool Execution](tool-execution.md#repeat-reads-of-freeflow-instructions);
- with task memory on (a prototype, see [Task memory](task-memory.md)), the attached Working Records and the focus.

Runtime State is current-state data, not stable policy. It does not replace the prompt fragments, contain hidden reasoning, authorize a tool call, or reconstruct state from earlier transition history.

### 4. Discoverable skills and tools

Complete methods live in discoverable packages:

- the base model/contributor skills under `skills/` (the catalog's canonical list) whenever Freeflow is enabled and the mandatory core fragments are available;
- the Cognitive Routing and Compaction capability skills under `capabilities/` only when each gate is effective;
- capability tools from the same effective surface snapshot.

Tool Execution has no capability skill: its guidance is a prompt section (below), and its tools describe themselves.

## One effective surface snapshot

Prompt fragments, Runtime State, discoverable skills, capability tools, and projection controls must agree for one provider request. One effective-state snapshot determines the surface:

```text
resolve activation and host capability
-> load mandatory core fragments
-> load effective optional capability fragments
-> compute Runtime State
-> expose matching skills and tools
-> project the same effective surface to the provider
```

Do not resolve these surfaces independently and report contradictory state in the same request. A missing mandatory core fragment leaves Freeflow guidance unavailable and preserves the host’s ordinary operation. A missing optional capability fragment removes only that capability’s cue, skill, and tools while reporting it unavailable.

The `enabled` setting is the only Freeflow core switch. Cognitive Routing, Tool Execution and Compaction are the optional capabilities; Compaction is on by default. The former Freeflow Context operations, Context Virtualization, and Conversation History are removed. Configurations containing the removed `defaultMode`, `interactionContract`, `skills`, `contextVirtualization`, or `conversationHistory` keys are invalid.

## Host delivery

### Codex and Claude Code

The Codex and Claude adapters load the mandatory core fragments, followed by the Working Method when its file is present, at `SessionStart` for startup, resume, clear, and compact boundaries, and on Claude Code also fork.

Both hosts limit hook context, so the delivery is shaped to fit:

- **Claude Code** caps each hook's `additionalContext` at 10,000 characters, measured per hook with no setting to raise it; longer output is saved to a file and the model gets a 2,000-character preview without being told to read it. `hooks/claude/hooks.json` therefore runs one hook per prompt (`claude-session-start.mjs SessionStart core|interactionContract|workingMethod`); the core hook also carries the Runtime State and any configuration error. Live sessions showed the single 16 KB hook reaching the model as that preview (October 2026).
- **Codex** spills a hook's context to a file above 2,500 tokens (estimated as bytes / 4) unless the handler sets `additionalContextLimit`; `hooks/codex/hooks.json` sets it above the whole context.
- `hooks/tests/check-host-adapters.test.mjs` runs the manifests' commands and checks both limits, and keeps each prompt file within 9,500 characters.

Codex loads no hooks from a plugin whose root `plugin.json` is an Agent Plugins manifest; it reads such a plugin's `.codex-plugin/plugin.json` only as an overlay for skills and metadata (openai/codex `rust-v0.157.0` and `main` at `de3721a7`, `core-plugins/src/loader.rs`). The Agent Plugins spec requires that root manifest with its `$schema`, and Kiro, Cursor, ChatGPT, Copilot and VS Code install Freeflow from the repository, so the repository keeps it. Codex's marketplace entry (`.agents/plugins/marketplace.json`) instead installs the npm package (`"source": "npm"`; Codex runs `npm pack` on it), and the npm package omits the root `plugin.json`, which only Pi reads the package for and Pi does not use. Codex therefore reads `.codex-plugin/plugin.json` and its hook. `scripts/validation/check-package.mjs` and the release metadata check keep `plugin.json` out of the package. Codex users get released versions only. From 0.7.1 (`a99860a3`, which added the root manifest) until this change, Codex ran no Freeflow hook.

Codex runs a plugin hook only while its definition is trusted: it stores a hash of the hook (event, matcher, command, timeout, status message, limit) under `<plugin>@<marketplace>:<hooks file>:<event>:<group>:<handler>` when the user approves it in `/hooks`. Any change to the hook definition or the hooks file path makes Codex skip the hook silently until the user approves it again. They share `hooks/shared/runtime-context.mjs` but keep host-specific hook manifests and output envelopes. They do not process ordinary submitted prompts, persist session controls, or create clear-transfer state. Codex and Claude do not receive Pi-specific capability delivery.

The renderer decides config validity with Pi's own validator (`pi-extension/src/host/config-validation.ts`, imported from its built file), so settings written on Pi, such as Tool Execution or Compaction, never switch Freeflow off elsewhere. Until October 2026 the hooks kept their own copy of the check, which rejected those keys and left Freeflow silently missing. That module and its imports must stay free of Pi packages, because hooks run in plain Node; `hooks/tests/check-host-adapters.test.mjs` checks this and that the hooks and Pi agree on a set of configs. An existing invalid config renders a configuration error naming the file; a missing one renders nothing.

The user selects which runtime prompts these hosts receive with `prompts` (`core`, `interactionContract`, `workingMethod`), each on unless a config turns it off, the personal file overriding the shared one prompt by prompt (`selectedRuntimePrompts()` in `config-validation.ts`). With none selected the hook renders nothing, not a lone Runtime State. Pi accepts the key and ignores it, always delivering every prompt ([ADR 0011](../adr/0011-single-adaptive-workflow.md), amended).

Hook delivery does not enforce Freeflow policy, block tools, grant permissions, or replace repository instructions. Hook trust and registration are host concerns; Setup reports delivery as confirmed, unavailable, or unconfirmed.

### Gemini CLI

Gemini uses `gemini-extension.json`, the root `skills/` directory, and its `hooks/hooks.json` `SessionStart` adapter. The adapter returns Gemini’s `hookSpecificOutput.additionalContext` field. Gemini’s documented startup, resume, and clear lifecycle is host-specific; local fixtures do not prove extension dispatch.

### Cursor

Cursor discovers the portable skill surface from the root Agent Plugins 1.0 manifest. Its `.cursor-plugin/plugin.json` adds a `sessionStart` adapter that returns Cursor’s `additional_context` field. Cursor session-start hooks are fire-and-forget and do not provide a blocking policy boundary.

### GitHub Copilot and VS Code

Copilot CLI and VS Code discover portable skills from the root Agent Plugins 1.0 manifest. The `com.github.copilot/hooks/hooks.json` namespace supplies the compatible `SessionStart` hook, whose adapter returns direct `additionalContext` output. VS Code’s hook runtime is a preview surface, and Copilot CLI/cloud lifecycle environments differ; deterministic adapter tests do not establish native dispatch.

### Kiro

Kiro can load the root Agent Plugins 1.0 package as a Power and activate its bundled skills. No Kiro-specific context file or hook adapter is included, so Kiro does not receive a claimed always-on Freeflow prompt surface from this package.

### OpenCode and Hermes Agent

OpenCode v2 and Hermes consume the canonical `skills/` surface through their documented skill-source or Agent Plugins adapters. Neither receives a claimed always-on Freeflow prompt surface or Pi-specific capabilities from this package.

### Pi

The native Pi extension (Pi 0.99.1 or later) contributes stable core/capability guidance through `systemPromptOptions.sections` and composes one request in `context_with_system`, preserving Pi's leading prompt and later system/tool patches while applying Runtime State, routing and RequestHistory.

On Pi, Freeflow's section also carries the Working Method (`runtime/prompts/working-method.md`: how to approach and check work) whenever Freeflow is enabled, the Cognitive Routing cue while routing is effective, and with Tool Execution a separate section (`runtime/prompts/tool-execution.md`: searching, reading, running code and editing with Pi's tools) plus platform, shell and OS facts, with three of Pi's generic rule lines removed. These sections are fixed for a configuration, so the system prompt stays the same from request to request. The Codex, Claude Code and other hook-based hosts receive the core prompt, the Interaction Contract and the Working Method, in that order, each unless the user turned it off, and none of the capability sections. The Working Method is host-neutral, so it goes wherever Freeflow is enabled (October 2026; before that it was Pi-only). It filters historical one-time Workflow or Cognitive Routing bootstrap entries rather than creating new persistent bootstrap messages. This is an assembled-host boundary, not proof of provider cache hits; another extension may still alter the final request.

Pi keeps the sections a `before_agent_start` handler sets only for a run a user prompt started (Pi issue #10267). A run Pi starts itself, for an extension message such as a background exit, a monitor event or a message from another session, rebuilds the sections from Pi's base options, so Pi appends a system patch that removes Freeflow's sections (and reverts the rules and docs Tool Execution changes), then another that restores them at the next prompt. `keepSections()` (`host/section-keeper.ts`) undoes this in the request, never in the stored transcript: a run Pi starts keeps the prompt of the last prompt's run. During a prompt-started run, while Freeflow sets sections, `context_with_system` records every section as Pi rendered it (`currentSections()`), Freeflow's and other extensions' alike (Pi's own MCP extension sets `mcp_servers` the same way), and the head's sections (`headSections()`). On every request, a patch entry for a recorded section is dropped when it reverts the section or restates the value the request already carries. A head that still equals the recorded one is left as it is, so a section a later prompt changed keeps its patch; a head that differs was rebuilt (Pi rebuilds it from its base options after a compaction in a run it started) and gets the recorded values. Any other change passes through. With Freeflow off nothing is recorded and Pi's prompt passes unchanged. With no prompt yet in this process (a resumed session woken by a notice), the host records the sections the transcript carries, when Freeflow's guidance is among them; sections recorded for another session are dropped at `session_start`, and those recorded on another branch at `session_tree`, which also works out again whether the branch it lands on has had a prompt. A session that has never had a prompt carries none, and Pi would send no system prompt at all, so Freeflow starts no turn there (see [Request history and cache](request-history-and-cache.md) Limits).

Pi exposes Cognitive Routing when its native model, thinking, session-entry, and ancestry gates are effective.

See [Pi integration](../../plugin-docs/integrations/pi.md) for native-host behavior and its evidence limits.

## Nested execution model

Prompt delivery describes what the model sees. Core's cycle and Cognitive Routing describe how authorized execution is coordinated after that surface is available:

```text
Freeflow cycle (core): agree, build and verify, review and hand over
├─ skills chosen by their descriptions; Discuss Work owns the agreement, Track Work the Slices
└─ Cognitive Routing — automatic control only
   ├─ Coordinator selects the responsible worker for the next result
   │  ├─ Helper: ordinary support, preparation, checks, and settled mechanics
   │  └─ Executor: substantive or consequential results
   └─ Coordinator compares acceptance with actual evidence
      ├─ continue, change worker, or explicitly replace an assignment within an open unit
      └─ close the supported unit through routing_unit
```

Manual control runs the ordinary unsplit cycle for the held profile. Automatic Coordinator owns user-facing judgment and places work by delegation mode: Coordinator implements in `helper`, Executor-only delegates environment work to Executor, and `both` uses Helper by default while commissioning Executor for substantive or consequential results. Only Coordinator delegates one worker at a time; `both` requires an explicit worker choice. A unit may contain sequential assignments to different workers, but preparation and follow-up are optional routes. A saved report ends the assigned worker's task permission without accepting the unit or closing a Slice. Explicit retry preserves the saved report, and replacement preserves prior effects; routing does not add a second orchestrator or model-authored boundary ledger. Attached recovery lets Coordinator request missing evidence while preserving the returned assignment, original report, selection, and assessment; the assignment's recorded worker receives only bounded selection/exact-read work and returns a distinct supplement. Unsettled recovery must complete or be cancelled before `assess` resumes the assessment. Late user input reaching a prepared worker request requires an interrupted return before task tools. With projection enabled, Helper and Executor share ordinary active history while Coordinator receives selected worker evidence with original producer attribution; compaction retains the last observed delivered-user basis rather than treating stored-but-undelivered history as new input. Under automatic control, Coordinator must assess a supported Slice result and explicitly direct completed Track Work closure; Manual follows the ordinary cycle and Track Work instead. These operations do not change user authority or make an internal handback the user-facing endpoint.

## Failure and recovery boundaries

- Missing `core.md` or `interaction-contract.md`: preserve the host’s base prompt, hide base skills and optional capabilities, and report Freeflow guidance unavailable.
- Missing optional capability: report the capability unavailable; its skill, cue and tools are not sent.
- Disabled or unconfigured Freeflow, or missing mandatory prompts: preserve the host prompt and send nothing of Freeflow's except the Runtime State and the Setup Freeflow skill (so `/setup-freeflow` works); a settings change that turns Freeflow on or off costs one cache write (Task 003 D-001, D-002).
- Historical bootstrap entries: filter them from current projection; do not create new one-time bootstrap messages.
- Runtime State unavailable: do not infer it from model identity, response style, or old transition history.
- Native Pi request replay preserves Freeflow-generated snapshots only when the permitted ancestry and rendered prefix remain compatible; model/provider, tool/schema, instruction, earlier-content, compaction, navigation, or unsupported effort changes may shorten reuse. Provider cache hits remain outside the local assembly contract.
- Configuration establishes activation but does not prove host delivery.
- After context loss, the core cue requires Working Record recovery in Track Work's order when a record exists (the `resume` view with its History index, defining artifacts, Recovery sources, then the History entries the next action depends on), current capability/owner methods, and reconciliation with current direction and live evidence. An intact session uses bounded readback instead of repeating recovery: a resumed session or a new message after a pause, with the conversation still in context, is not context loss. Real Pi sessions (October 2026) showed agents reloading skills they still had after such pauses because the earlier wording counted session resume and uncertain continuity as context loss.
- Attached recovery is not general task access: the recorded worker receives only selected existing evidence, exact admitted task-file reads, packaged Freeflow methods, and recovery return controls. Fresh attention does not finish that recovery; supplement or cancellation precedes assessment resumption.
- A Runtime State refresh alone is not a user interruption or a replacement execution contract.

## Evidence boundary

Deterministic prompt, gating, discovery, package, and host-adapter checks prove assembly and delivery structure. They do not establish behavioral quality, universal skill readiness, native host dispatch, host trust UI, remote installation, marketplace review, or release publication. Those claims require their own evidence boundary.

## Related documentation

- [Workflow](../../plugin-docs/workflow.md)
- [Architecture](../README.md)
- [Skill routing](skill-routing.md)
- [Capabilities](../../plugin-docs/capabilities/README.md)
- [Getting Started](../../plugin-docs/getting-started.md)
- [Release evidence](../../plugin-docs/release-evidence/README.md)
