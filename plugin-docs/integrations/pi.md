# Pi Integration

Freeflow can be packaged for Pi. The source tree contains a native entrypoint wired to the v2 routing runtime, but this documentation does not claim that the current checkout is released, installed, or dispatched by stock Pi. Shared skills and ordinary package behavior remain distinct from host acceptance and model evaluation.

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

The repository's current development dependency is Pi 0.85.1. This is source and fixture context, not a support or behavioral acceptance claim. The native entrypoint requires the host's public model registry/authentication lookup, session-scoped model and thinking controls, native session-entry append/readback, and session ancestry APIs. Stock-Pi dispatch, installed-package behavior, and model quality remain separately unverified.

## Activate Freeflow

In the repository where Freeflow should operate, run:

```text
/setup-freeflow
```

Setup creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. An optional `.freeflow/local.json` provides per-checkout personal overrides; it cannot activate Freeflow by itself.

Freeflow's core prompt and separately editable Interaction Contract are delivered together whenever Freeflow is enabled. The 24 base skills are exposed with that core surface. Context Virtualization, Conversation History, and Cognitive Routing remain independently gated capabilities. Session settings can override core/context enablement and complete Cognitive Routing profiles enabled for that session. Session profile overrides do not mutate `.freeflow/config.json` or `.freeflow/local.json`; they take precedence over personal and repository profiles and can be reset or set to inherit. Delegation mode is configured only in repository or personal settings, not as a session override.

## Cognitive Routing configuration

On a future qualified native Pi host, configure the v2 shape through `/freeflow settings` or the JSON layers:

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": false,
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

`delegation` accepts `executor`, `helper`, or `both` and defaults to `executor` when omitted. `projection` defaults to `false`. Profile names are `coordinator`, `helper`, and `executor`. Each configured profile requires `provider`, `model`, and one supported thinking value: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Coordinator must resolve to a distinct authenticated pair from every worker enabled by the selected mode; Helper and Executor may share a pair. Well-formed unavailable unused worker presets do not block the selected mode, while malformed configuration fails closed.

Older experimental routing fields or names such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are unsupported. There is no migration; rewrite them manually. Invalid configuration fails closed rather than partially enabling routing.

The current source also rejects Cognitive Routing on the identified PiFlow host path. See [PiFlow integration](piflow.md); do not infer equivalent PiFlow support from this Pi source entrypoint.

## What the source adapter provides

When its host gate is effective, the native entrypoint is designed to provide:

- the 24-skill model/contributor surface and mandatory core/Interaction Contract prompts;
- refresh-aware Runtime State with v2 routing `Control`, `Profile`, and `Delegation`;
- Coordinator/Helper/Executor routing state recorded as native `freeflow-routing-v2` session entries;
- the four v2 routing tools: `freeflow_delegate`, `freeflow_return`, `freeflow_unit`, and `freeflow_project`;
- optional context capabilities under their separate gates.

These are source-level contracts, not proof of installed-host delivery, stock-Pi dispatch, or model behavior.

## Controls

While an effective native host is idle:

```text
/freeflow
/freeflow settings
/freeflow settings local
/freeflow settings repo
/freeflow profile coordinator
/freeflow profile helper
/freeflow profile executor
/freeflow profile auto
/freeflow profile history
/freeflow resume
```

`/freeflow settings` and `/freeflow settings local` edit personal overrides; `/freeflow settings repo` edits `.freeflow/config.json`. `coordinator`, `helper`, and `executor` place a manual hold when available, `auto` releases it to automatic Coordinator control, and `history` reads work-oriented routing history (`history diagnostics` retains the raw event view). `/freeflow resume` explicitly resumes saved routing responsibility after reconciliation. These commands require an idle host and do not authorize task work.

When the source adapter exposes the native controls:

- `Ctrl+Shift+R` cycles Coordinator and the workers enabled by the current delegation mode.
- `Ctrl+Shift+A` releases a manual hold to automatic Coordinator control; repeating it while already automatic is idempotent.

## Routing behavior

Automatic routing gives Coordinator ownership of new direction. When Helper is enabled, it is the normal delegate for supporting work; Executor is commissioned for substantive or consequential results, including meaningful implementation, substantial artifacts, difficult diagnosis, audits/reviews, and small changes with material consequences. In `helper`, Coordinator implements directly and may delegate bounded support to Helper. In `executor`, delegated environment work goes to Executor. In `both`, Coordinator explicitly chooses the worker for each assignment, with Helper as the default support route and Executor available for substantive work. Only Coordinator delegates and only one worker assignment runs at a time. A unit may use sequential assignments to different workers without imposing a mandatory preparation pipeline. If input reaches an already prepared worker request, it must return before further task tools. Manual control runs the ordinary unsplit Workflow.

Projection is off by default. With projection off, all enabled profiles use ordinary active Pi context. With projection on, Helper and Executor share ordinary active context while Coordinator receives common context plus selected, actually exposed worker evidence with original producer attribution. Native dependencies are retained automatically; omitted result bodies are not reconstructed. Saved reports, selections, and the recorded assignment worker remain persisted routing state independent of a later profile or mode change. If that worker becomes unavailable, continuation fails closed rather than falling back to another profile.

Native compaction can remove user messages from the active view without making stored-but-undelivered input look new: routing keeps the last observed delivered-user basis, while genuinely delivered input interrupts the assignment. During partial routing-call arguments, collapsed receipts keep live contract/report prose visible; expand a receipt to inspect limitations or replacement reasons.

The v2 projection is not qualified with the legacy Context Virtualization or Conversation History transforms. Keep those legacy capabilities standalone, or keep routing projection disabled. Neither legacy capability is removed.

## Cache reuse boundaries

The Pi candidate keeps Freeflow reference definitions, tool schemas, and generated runtime snapshots stable while feature gates control whether operations may execute. Helper and Executor share ordinary active history, and compatible worker/Coordinator views reuse only matching permitted prefixes; Freeflow does not copy excluded evidence to manufacture a cache match. Native ancestry replay preserves Freeflow-generated snapshots when their fingerprints and permitted history still apply.

Reuse may shorten or restart when the active model/provider or unsupported effort path changes, earlier evidence is archived/restored/withdrawn or otherwise changes the view, native compaction or navigation replaces history, Freeflow or host instructions/tool schemas change, or a capability change alters permitted content. Provider expiry, eviction, minimum cacheable length, and actual server cache hits remain outside Freeflow's control. The independent Astra effort adapter preserves the supported request baseline and records effective changes at its qualified boundary; this source/fixture evidence is not a billing or model-quality guarantee.

Detailed cache evidence remains task-local and is not a published package artifact; this section states the public contract and its limits.

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

- [Cognitive Routing](../capabilities/cognitive-routing.md)
- [Freeflow architecture](../architecture.md)
- [Workflow](../workflow.md)
- [Skill routing](../skill-routing.md)
- [PiFlow integration](piflow.md)
- [Root installation guide](../../README.md#quick-start)
