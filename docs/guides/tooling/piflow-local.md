# Local PiFlow

PiFlow is the local daily-use distribution of the patched Pi host plus the Freeflow extension.
It is intentionally separate from the official `pi` command.

## Start

After building the local extension and patched Pi checkout:

```bash
npm run build:pi-extension
piflow
```

The launcher is installed at `~/.local/bin/piflow` and points at this checkout. It sets the explicit `FREEFLOW_RUNTIME=piflow` marker used by the extension. Cognitive Routing configuration is visible but read-only in ordinary `pi`; only this launcher can activate its runtime. It:

- uses the patched `pi-mono` CLI;
- loads the normal Pi package/resource set plus the local Freeflow package;
- clears inherited model/session environment variables;
- stores settings, credentials, package resources, and sessions under `~/.piflow/agent`;
- leaves `~/.pi/agent` unchanged.

The first launch creates an isolated functional snapshot from `~/.pi/agent`. Sessions and
`run-history.jsonl` are not copied. If PiFlow already had state, it is preserved in a timestamped
`~/.piflow/agent.backup.*` directory.

## Resync

Normal Pi changes are not copied continuously. Resync explicitly:

```bash
piflow sync-from-pi
```

This replaces PiFlow's functional settings, credentials, model catalog, MCP data, extensions,
skills, prompts, themes, and package resources from normal Pi. Existing PiFlow sessions and run
history are retained; the replaced state is backed up. The Freeflow package source is rewritten to
this local checkout, and absolute local packages are copied into PiFlow's own `local-packages` tree.

## Cognitive Routing

Cognitive Routing is disabled by default and can only become effective through `piflow`. Use
`/freeflow settings` while Pi is idle. The Cognitive Routing group appears before Output Router in
both hosts. Ordinary `pi` shows the configured group as `disabled · PiFlow only`; its controls are
read-only and it registers no routing tools, commands, shortcuts, or prompt context. In PiFlow the
group contains enablement plus atomic standard/reasoning preset wizards. An unset preset is shown as
`not configured`; both complete presets must be configured before routing can become effective.
Preset editing remains available in PiFlow while routing is disabled. Each wizard selects a currently
available authenticated model, then one effort supported by that model, then confirms the complete
`(provider, model, effort)` preset. Cancel leaves the prior preset unchanged. Unavailable saved
presets block routing; PiFlow does not silently substitute a model or lower effort.

The status line reports the active profile and ownership, for example `cognitive reasoning · automatic`.
`Ctrl+Shift+R` cycles manual standard/reasoning holds; `Ctrl+Shift+A` releases the hold and returns
to automatic control. A same-profile request is rendered as `already active` rather than a redundant
transition.

Manual profile control remains separate from model tool calls:

```text
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
```

`Ctrl+Shift+R` cycles the manual standard/reasoning hold. `Ctrl+Shift+A` releases it to automatic
control without forcing a profile change. Manual holds and valid automatic profile state survive
compaction, same-session resume, and `/reload`; reload replaces the stale lease and revalidates the
saved profiles. Automatic reasoning remains active until the agent explicitly yields with a visible
handoff. Automatic agent transitions retain the internal guarded switch tool but render as a compact
`Cognitive Routing: standard -> reasoning` notification.
