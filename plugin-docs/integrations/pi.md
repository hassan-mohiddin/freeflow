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

Freeflow's core prompt and separately editable Interaction Contract are delivered together whenever Freeflow is enabled. The 24 base skills are exposed with that core surface. Context Virtualization, Conversation History, and Cognitive Routing remain independently gated capabilities. Session settings can override core/context enablement temporarily; Cognitive Routing configuration is not a session override.

## Cognitive Routing configuration

On a future qualified native Pi host, configure the v2 shape through `/freeflow settings` or the JSON layers:

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "projection": false,
    "profiles": {
      "coordinator": {
        "provider": "openai",
        "model": "gpt-4o",
        "thinking": "off"
      },
      "executor": {
        "provider": "openai",
        "model": "gpt-4.1-mini",
        "thinking": "off"
      }
    }
  }
}
```

`projection` defaults to `false`. Use only `coordinator` and `executor` profile names. Each profile requires `provider`, `model`, and one supported thinking value: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Both profiles must resolve to distinct, authenticated model/thinking pairs that the host supports exactly.

Older experimental routing fields or names such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are unsupported. There is no migration; rewrite them manually. Invalid configuration fails closed rather than partially enabling routing.

The current source also rejects Cognitive Routing on the identified PiFlow host path. See [PiFlow integration](piflow.md); do not infer equivalent PiFlow support from this Pi source entrypoint.

## What the source adapter provides

When its host gate is effective, the native entrypoint is designed to provide:

- the 24-skill model/contributor surface and mandatory core/Interaction Contract prompts;
- refresh-aware Runtime State with v2 routing `Control` and `Profile`;
- Coordinator/Executor routing state recorded as native `freeflow-routing-v2` session entries;
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
/freeflow profile executor
/freeflow profile auto
/freeflow profile history
/freeflow resume
```

`/freeflow settings` and `/freeflow settings local` edit personal overrides; `/freeflow settings repo` edits `.freeflow/config.json`. `coordinator` and `executor` place a manual hold, `auto` releases it to automatic Coordinator control, and `history` reads work-oriented routing history (`history diagnostics` retains the raw event view). `/freeflow resume` explicitly resumes saved routing responsibility after reconciliation. These commands require an idle host and do not authorize task work.

When the source adapter exposes the native controls:

- `Ctrl+Shift+R` cycles the Coordinator/Executor manual hold.
- `Ctrl+Shift+A` releases a manual hold to automatic Coordinator control; repeating it while already automatic is idempotent.

## Routing behavior

Automatic routing gives Coordinator ownership of new direction. If input reaches an already prepared Executor request, it must return before further task tools. Coordinator assigns a decision-complete assignment; Executor performs it and returns an actual report; Coordinator receives the saved report and eligible evidence, then assesses, continues, or closes the unit. Manual control runs the ordinary unsplit Workflow.

Projection is off by default. With projection off, both profiles use ordinary active Pi context. With projection on, Executor retains ordinary active context while Coordinator receives common context plus selected, actually exposed Executor evidence. Native dependencies are retained automatically; omitted result bodies are not reconstructed. Saved reports and selections remain persisted routing state independent of a later profile-switch result.

The v2 projection is not qualified with the legacy Context Virtualization or Conversation History transforms. Keep those legacy capabilities standalone, or keep routing projection disabled. Neither legacy capability is removed.

The routing tools are model-facing controls, not permission grants. A return saves a report but does not close a unit. Evidence selection must use actual canonical `ctx:<native-entry-id>` references, and unresolved or adverse evidence remains explicit.

## Persistence and recovery limits

Routing events are appended through Pi's native session-entry path and read back from the live branch. When existing or uncertain state needs reconciliation, the runtime uses a strict read-only persisted session snapshot with identity, ancestry, encoding, size, and divergence checks. It does not patch host files, claim `fsync`, or promise exactly-once behavior. Failed readback or uncertain effects block routing rather than permitting blind repetition.

New user attention retains ordinary admitted history and pauses only the saved assessment obligation to restore compacted evidence. Closing, replacing and returning preserve admitted communication; current versus historical contracts remain distinct. Use `freeflow_unit` with `{"operation":"assess"}` only when that saved assessment is again intended; failed readiness keeps it suspended. Recover Runtime State, the current assignment, saved report, selected evidence, and partial effects after context loss or native model/thinking changes.

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
