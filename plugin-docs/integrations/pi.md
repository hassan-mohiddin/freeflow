# Pi Integration

Freeflow can be packaged for Pi. The native entrypoint wires Freeflow's core prompt and skills, [Cognitive Routing](../capabilities/cognitive-routing.md), [Tool Execution](../capabilities/tool-execution.md) and [Compaction](../capabilities/compaction.md). An unreleased checkout is not a published release.

## Install

Install a released package:

```bash
pi install npm:@hassangameryt/freeflow
```

Or install from Git:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

Restart Pi or use `/reload` after installing or updating so its resources are rediscovered. An installation command is not proof that the native entrypoint was loaded or that Cognitive Routing is effective.

## Supported Pi evidence

The minimum supported native Pi version is 0.99.1 (peer range `>=0.99.1`); Pi 1.0 is supported and is the development dependency. Earlier Pi versions are unsupported. Native scripted fixtures exercise request assembly, routing, Tool Execution and compaction against Pi 1.0.0, and live sessions on Pi 1.0 with GPT-6 Luna and Sol 6.1 exercised routing, compaction and Tool Execution. These checks do not establish provider billing, model quality across models, or publication. The native entrypoint requires the host's public model registry/authentication lookup, session-scoped model and thinking controls, native session-entry append/readback, and session ancestry APIs.

## Activate Freeflow

In the repository where Freeflow should operate, run:

```text
/setup-freeflow
```

Setup creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. An optional `.freeflow/local.json` provides per-checkout personal overrides; it cannot activate Freeflow by itself.

Freeflow's core prompt and separately editable Interaction Contract are delivered together whenever Freeflow is enabled. The 25 base skills are exposed with that core surface. Cognitive Routing and Tool Execution are off by default; Compaction is on by default whenever Freeflow is enabled. The former Freeflow Context tool, Context Virtualization, and Conversation History have been removed. Before updating, delete `contextVirtualization` and `conversationHistory` from `.freeflow/config.json` and `.freeflow/local.json` wherever present; configs containing either key are invalid and block Freeflow activation until the keys are removed. `/freeflow settings` opens one screen with three scopes, switched with Tab: Session (this Pi session only), Personal (`.freeflow/local.json`) and Repository (`.freeflow/config.json`). Switches change in place; a three-way switch cycles inherit, enabled and disabled, and each row shows where its effective value comes from. The Session scope can override Freeflow itself, Cognitive Routing, projection, Tool Execution, Compaction and Context reuse, the delegation mode, and complete Coordinator, Helper, and Executor presets (including a worker not yet enabled by the current mode); choose a missing worker preset before enabling that worker. Session overrides do not change either file; they take precedence over personal and repository settings and can be reset or set to inherit. The footer shows the active profile, automatic/manual control, and effective delegation mode.

## Cognitive Routing configuration

On a supported native Pi host, configure the v2 shape through `/freeflow settings` or the JSON layers:

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": true,
    "profiles": {
      "coordinator": {
        "provider": "openai",
        "model": "gpt-4o",
        "thinking": "off"
      },
      "helper": {
        "provider": "openai",
        "model": "gpt-4.1-mini",
        "thinking": "off"
      },
      "executor": {
        "provider": "openai",
        "model": "gpt-4.1",
        "thinking": "off"
      }
    }
  }
}
```

`delegation` accepts `executor`, `helper`, or `both` and defaults to `executor` when omitted. `projection` defaults to `true`. Profile names are `coordinator`, `helper`, and `executor`. Each configured profile requires `provider`, `model`, and one supported thinking value: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Coordinator must resolve to a distinct authenticated pair from every worker enabled by the selected mode; Helper and Executor may share a pair. Well-formed unavailable unused worker presets do not block the selected mode, while malformed configuration fails closed.

Older experimental routing fields or names such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are unsupported. There is no migration; rewrite them manually. Invalid configuration fails closed rather than partially enabling routing.

Freeflow's PiFlow integration was removed as a breaking change. Use native Pi for the Freeflow extension; Freeflow does not modify or uninstall a separate PiFlow installation. See the [Unreleased changelog](../../CHANGELOG.md#unreleased).

## Tool Execution and Compaction configuration

Tool Execution is disabled by default; Compaction is enabled by default:

```json
{
  "toolExecution": { "enabled": true },
  "compaction": { "enabled": true, "carry": true }
}
```

Tool Execution keeps Pi's tools and adds guidance, file tracking, clearer edit errors, `apply_patch` and the background commands `bash_background` and `stop_background`. The retired v2 keys (`capture`, `programs`, `workspace`, `discovery`, `adapters`, `accounting`) still load and do nothing. See [Tool Execution](../capabilities/tool-execution.md).

Compaction warns the agent before Pi's own limit and lets it compact with `freeflow_compact` from its own summary and carried context; Pi's compaction stays on as the fallback. `compaction.carry` (Context reuse) controls whether files and tool results are carried. See [Compaction](../capabilities/compaction.md).

## What the source adapter provides

When its host gate is effective, the native entrypoint is designed to provide:

- the 25-skill model/contributor surface and mandatory core/Interaction Contract prompts;
- refresh-aware Runtime State with v2 routing `Control`, `Profile`, and `Delegation`;
- Coordinator/Helper/Executor routing state recorded as native `freeflow-routing-v2` session entries;
- the four v2 routing tools: `freeflow_delegate`, `freeflow_return`, `freeflow_unit`, and `freeflow_project`;
- with Tool Execution, its prompt section, `apply_patch`, `bash_background` and `stop_background`, and the file-tracking layer around Pi's tools;
- with Compaction, the `freeflow_compact` tool, its notices, and the compaction skill.

## Controls

While an effective native host is idle:

```text
/freeflow
/freeflow settings
/freeflow settings local
/freeflow settings repo
/freeflow settings session
/freeflow profile coordinator
/freeflow profile helper
/freeflow profile executor
/freeflow profile auto
/freeflow profile history
/freeflow resume
/freeflow status
/freeflow compact
```

`/freeflow settings` opens the settings screen on the Personal scope; `/freeflow settings session`, `local` (or `personal`) and `repo` (or `repository`) open it on that scope. `/freeflow status` shows the effective state, prompt-cache diagnostics, running background commands and the compaction cycle. `/freeflow compact` asks the agent to prepare and compact now. `coordinator`, `helper`, and `executor` place a manual hold when available, `auto` releases it to automatic Coordinator control, and `history` reads work-oriented routing history (`history diagnostics` retains the raw event view). `/freeflow resume` explicitly resumes saved routing responsibility after reconciliation. These commands require an idle host and do not authorize task work.

When the source adapter exposes the native controls:

- `Ctrl+Shift+R` cycles Coordinator and the workers enabled by the current delegation mode.
- `Ctrl+Shift+A` releases a manual hold to automatic Coordinator control; repeating it while already automatic is idempotent.

## Routing behavior

Automatic routing gives Coordinator ownership of new direction. When Helper is enabled, it is the normal delegate for supporting work; Executor is commissioned for substantive or consequential results, including meaningful implementation, substantial artifacts, difficult diagnosis, audits/reviews, and small changes with material consequences. In `helper`, Coordinator implements directly and may delegate bounded support to Helper. In `executor`, delegated environment work goes to Executor. In `both`, Coordinator explicitly chooses the worker for each assignment, with Helper as the default support route and Executor available for substantive work. Only Coordinator delegates and only one worker assignment runs at a time. A unit may use sequential assignments to different workers without imposing a mandatory preparation pipeline. If input reaches an already prepared worker request, it must return before further task tools. Manual control runs the ordinary unsplit Workflow.

Projection is on by default. With projection off, all enabled profiles use ordinary active Pi context. With projection on, Helper and Executor share ordinary active context while Coordinator receives common context plus selected, actually exposed worker evidence with original producer attribution. Native dependencies are retained automatically; omitted result bodies are not reconstructed. Saved reports, selections, and the recorded assignment worker remain persisted routing state independent of a later profile or mode change. If that worker becomes unavailable, continuation fails closed rather than falling back to another profile.

Compaction (Freeflow's or Pi's) can remove user messages from the active view without making stored-but-undelivered input look new: routing keeps the last observed delivered-user basis, while genuinely delivered input interrupts the assignment. During partial routing-call arguments, collapsed receipts keep live contract/report prose visible; expand a receipt to inspect limitations or replacement reasons.

The legacy context transforms have been removed from the active runtime. Context Control v2 remains planned and unavailable; this page does not define a future composition or compatibility contract.

## Cache reuse boundaries

Freeflow contributes stable guidance as a structured prompt section and composes the full transcript in `context_with_system`, retaining Pi's earlier system/tool patches at their original positions. A native two-turn fixture exercises that timeline; it does not prove server cache hits, and another extension can still change the final request. The Pi candidate keeps Freeflow reference definitions, tool schemas, and generated runtime snapshots stable while feature gates control whether operations may execute. Helper and Executor share ordinary active history, and compatible worker/Coordinator views reuse only matching permitted prefixes; Freeflow does not copy excluded evidence to manufacture a cache match. Native ancestry replay preserves Freeflow-generated snapshots when their fingerprints and permitted history still apply.

Reuse may shorten or restart when the active model/provider or unsupported effort path changes, earlier evidence is archived/restored/withdrawn or otherwise changes the view, native compaction or navigation replaces history, Freeflow or host instructions/tool schemas change, or a capability change alters permitted content. Provider expiry, eviction, minimum cacheable length, and actual server cache hits remain outside Freeflow's control.

The selected-model effort adapter supports `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol` on qualified OpenAI Responses and OpenAI-Codex Responses request shapes. It preserves the request baseline and records compatible effort changes under `freeflow-openai-effort-v1`. Older `freeflow-astra-effort-v1` entries remain in the native session log but are not replayed; a new effort chain starts from the next supported request. This source/fixture evidence is not a billing or model-quality guarantee.

Pi 0.99 added Sign in with ChatGPT on the `openai` provider. Freeflow recognises that credential and leaves the route untouched: no explicit cache breakpoints, no Coordinator keep-alive replay, and no effort-history rewriting. Live checks on GPT-6 Luna and Sol 6.1 found that the sign-in route rejects `prompt_cache_breakpoint`, `max_output_tokens` and `configuration_update` ("use an API key instead"), still reuses a long cached prefix, and keeps a separate cache per reasoning effort, so switching effort on that route rereads the prefix. API keys and the legacy `openai-codex` route are unchanged.

[Prompt caching](../prompt-caching.md) explains how provider caches behave on Pi, how Freeflow keeps its additions cache-safe (including the anchor breakpoint and the Coordinator keep-alive), and the rules for changing request assembly. Detailed per-task cache evidence remains task-local and is not a published package artifact; this section states the public contract and its limits.

The routing tools are model-facing controls, not permission grants. A return saves a report but does not close a unit. Evidence selection must use actual canonical `ctx:<native-entry-id>` references, and unresolved or adverse evidence remains explicit.

## Persistence and recovery limits

Routing events are appended through Pi's native session-entry path and read back from the live branch. When existing or uncertain state needs reconciliation, the runtime uses a strict read-only persisted session snapshot with identity, ancestry, encoding, size, and divergence checks. It does not patch host files, claim `fsync`, or promise exactly-once behavior. Failed readback or uncertain effects block routing rather than permitting blind repetition.

New user attention retains ordinary admitted history and pauses only the saved assessment obligation to restore compacted evidence. Closing, replacing and returning preserve admitted communication; current versus historical contracts remain distinct. When material evidence is missing from a returned assessment, Coordinator can attach a recovery request without replacing the assignment or report. The worker recorded on that assignment may select exposed evidence and read only exact admitted task paths or packaged Freeflow methods before returning a separate supplement; ordinary task work remains closed. Fresh attention does not settle recovery, and `assess` remains unavailable until the supplement arrives or Coordinator cancels recovery.

Use `freeflow_unit` with `{"operation":"assess"}` only when that saved assessment is again intended and no recovery remains unsettled; failed readiness keeps it suspended. Recover Runtime State, the current assignment, saved report, selected evidence, and partial effects after context loss or native model/thinking changes. Current code accepts earlier supported v2 history, while older binaries may reject sessions containing the newer recovery events; there is no downgrade migration.

## Development boundary

For local Freeflow development, refresh a snapshot only from a committed Freeflow revision:

```bash
npm run snapshot:refresh
```

A snapshot identity and an installed package identity are different. Do not treat an uncommitted working tree as a production package source, and do not infer host behavior from a snapshot. Snapshot refresh does not patch the host or its session state.

## Related documentation

- [Tool Execution](../capabilities/tool-execution.md)
- [Compaction](../capabilities/compaction.md)
- [Cognitive Routing](../capabilities/cognitive-routing.md)
- [Freeflow architecture](../architecture.md)
- [Workflow](../workflow.md)
- [Skill routing](../skill-routing.md)
- [Root installation guide](../../README.md#quick-start)
