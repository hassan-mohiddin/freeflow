# Activation and Status

> **Covers:** `pi-extension/src/host/status.ts`, `pi-extension/src/host/config.ts`, `pi-extension/src/host/config-validation.ts`
> **Verified at:** `c07e84ed` (2026-10-19)
> **User docs:** `plugin-docs/settings.md`

Freeflow is active in a repository only when `.freeflow/config.json` exists and is valid. Pi's footer shows the effective state on every screen, and `/freeflow status` prints the effective capabilities. How configuration is read and validated: [Prompt assembly](../subsystems/prompt-assembly.md) and the overview's [Cross-Cutting Concerns](../README.md#cross-cutting-concerns).

## Sub-features

- `act-on`: the footer reads `freeflow: on` when `.freeflow/config.json` is `{}`.
- `act-status`: `/freeflow status` prints the effective state.
- `act-setup`: the footer reads `freeflow: setup needed` when the file is missing, and status says how to set it up.
- `act-local-only`: `.freeflow/local.json` alone does not activate Freeflow.
- `act-error`: the footer reads `freeflow: config error` when the file is invalid, such as one holding the removed `contextVirtualization` key, and status names the problem.

## How to get to it (user POV)

- Open Pi in a repository and read the footer line under the editor.
- Run `/freeflow status` while Pi is idle.
- Run `/setup-freeflow` to create the config. That is a workflow command, so a model call; see [Workflow commands](workflow-commands.md).

## Driving it

Preconditions:

- A fresh run for each state below, since the config is read at launch. Clean up between them.

- **On.** Run `scripts/verify-live.sh launch`. It prints `ready: freeflow: on`.
- **Status.** Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled; cognitive routing: disabled; tool execution: enabled; compaction: enabled (cycle 1)`. Then `scripts/verify-live.sh snap act-status`.
- **Config on disk.** Run `scripts/verify-live.sh observe act-on-config -- cat .freeflow/config.json`. Exit code `0`, output `{}`. Then clean up.
- **Setup needed.** Run `scripts/verify-live.sh launch --no-config`. It prints `ready: freeflow: setup needed`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: inactive (repo not set up); run /setup-freeflow`. Then `scripts/verify-live.sh snap act-setup`.
- **Personal file alone.** In the same run, run `scripts/verify-live.sh observe act-local-only -- bash -c 'mkdir -p .freeflow && printf "{\"enabled\": true}\n" > .freeflow/local.json && ls -A .freeflow'`. Exit code `0`, output `local.json`. Run `scripts/verify-live.sh cmd "/reload"`. The footer still reads `freeflow: setup needed`. Then `scripts/verify-live.sh snap act-local-only` and clean up.
- **Config error.** Run `scripts/verify-live.sh launch --config '{"contextVirtualization":{}}'`. It prints `ready: freeflow: config error`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: inactive (invalid config: Removed Freeflow context setting(s) in .freeflow/config.json: contextVirtualization. Delete those keys before using Freeflow.); fix .freeflow/config.json or run /setup-freeflow`, wrapped across two lines. Then `scripts/verify-live.sh snap act-error` and clean up.

## Gotchas

- `launch` treats any `freeflow:` footer as ready, and doctor passes in all three states because it checks that a footer exists, not which one. The step, not doctor, asserts the state.
- The footer lists optional capabilities that are on after `on`, separated by ` · `, so match its start, not the whole line. Turning Task Memory on leaves it at `freeflow: on`; prove that change from `/freeflow status`.
- With no model available, the status line's compaction part is `compaction: enabled (cycle 1)`. With a model it also reports the context size, so match up to `(cycle 1`.
- Long notices wrap at the pane width (160 columns). Assert text that fits on one line, or read the wrapped lines together.
