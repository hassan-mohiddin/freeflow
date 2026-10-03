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

## For developers

What the extension registers, its cache reuse boundaries, how it persists and recovers routing state, and development snapshots are in the developer doc [Pi extension](../../dev-docs/subsystems/pi-extension.md).

## Related documentation

- [Tool Execution](../capabilities/tool-execution.md)
- [Compaction](../capabilities/compaction.md)
- [Cognitive Routing](../capabilities/cognitive-routing.md)
- [Freeflow architecture](../../dev-docs/README.md)
- [Workflow](../workflow.md)
- [Skill routing](../../dev-docs/subsystems/skill-routing.md)
- [Root installation guide](../../README.md#quick-start)
