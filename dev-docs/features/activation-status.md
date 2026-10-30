# Activation and Status

> **Covers:** `pi-extension/src/host/status.ts`, `pi-extension/src/host/config.ts`, `pi-extension/src/host/config-validation.ts`, `pi-extension/src/store/layer.ts`
> **Verified at:** `77c132c6` (2026-10-30)
> **User docs:** `plugin-docs/settings.md`

Freeflow is active in a repository only when `.freeflow/config.json` exists and is valid. Pi's footer shows the effective state on every screen, and `/freeflow status` prints the effective capabilities. How configuration is read and validated: [Prompt assembly](../subsystems/prompt-assembly.md) and the overview's [Cross-Cutting Concerns](../README.md#cross-cutting-concerns). Neither the footer nor `/freeflow status` shows the `review`, `prompts` or `skills` settings, and prompts turned off, one or all with `prompts.enabled`, leave Freeflow active; the agent gets it in the Runtime State, and an invalid `review` makes the file invalid like any other key.

## Sub-features

- `act-on`: the footer reads `freeflow: on` when `.freeflow/config.json` is `{}`.
- `act-status`: `/freeflow status` prints the effective state.
- `act-store`: with a task this session holds in the Freeflow store, the footer reads `freeflow: task <ID>` and `/freeflow status` names the store and the task.
- `act-setup`: the footer reads `freeflow: setup needed` when the file is missing, and status says how to set it up.
- `act-local-only`: `.freeflow/local.json` alone does not activate Freeflow.
- `act-error`: the footer reads `freeflow: config error` when the file is invalid, such as one holding the removed `contextVirtualization` key, and status names the problem.
- `act-task-memory-gone`: a config that still sets the removed `taskMemory` keys loads, and `/freeflow status` says Pi's Task Memory is gone and they are ignored.

## How to get to it (user POV)

- Open Pi in a repository and read the footer line under the editor.
- Run `/freeflow status` while Pi is idle.
- Run `/setup-freeflow` to create the config. That is a workflow command, so a model call; see [Workflow commands](workflow-commands.md).

## Driving it

Preconditions:

- A fresh run for each state below, since the config is read at launch. Clean up between them.

- **On.** Run `scripts/verify-live.sh launch`. It prints `ready: freeflow: on`.
- **Status.** Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled; cognitive routing: disabled; tool execution: enabled; compaction: enabled (cycle 1)`, then `store: not ready (FREEFLOW_HOME is` the run's `home` folder: the run names a Freeflow home with no store in it. Then `scripts/verify-live.sh snap act-status`.
- **Config on disk.** Run `scripts/verify-live.sh observe act-on-config -- cat .freeflow/config.json`. Exit code `0`, output `{}`. Then clean up.
- **Setup needed.** Run `scripts/verify-live.sh launch --no-config`. It prints `ready: freeflow: setup needed`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: inactive (repo not set up); run /setup-freeflow`. Then `scripts/verify-live.sh snap act-setup`.
- **Personal file alone.** In the same run, run `scripts/verify-live.sh observe act-local-only -- bash -c 'mkdir -p .freeflow && printf "{\"enabled\": true}\n" > .freeflow/local.json && ls -A .freeflow'`. Exit code `0`, output `local.json`. Run `scripts/verify-live.sh cmd "/reload"`. The footer still reads `freeflow: setup needed`. Then `scripts/verify-live.sh snap act-local-only` and clean up.
- **Config error.** Run `scripts/verify-live.sh launch --config '{"contextVirtualization":{}}'`. It prints `ready: freeflow: config error`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: inactive (invalid config: Removed Freeflow context setting(s) in .freeflow/config.json: contextVirtualization. Delete those keys before using Freeflow.); fix .freeflow/config.json or run /setup-freeflow`, wrapped across two lines. Then `scripts/verify-live.sh snap act-error` and clean up.
- **The store and the held task.** Run `FFV_PI_ARGS="--session-id 0a0b0c0d-1111-4222-8333-444455556666" scripts/verify-live.sh launch`. It prints `ready: freeflow: on`. Run `scripts/verify-live.sh observe act-store -- bash -c 'W="$FFV_REPO/skills/track-work/scripts/working-record.mjs"; node "$W" store init --home "$FREEFLOW_HOME" --git-name "Probe User" --git-email probe@example.com > /dev/null && FREEFLOW_SESSION=0a0b0c0d-1111-4222-8333-444455556666 FREEFLOW_HARNESS=Pi node "$W" task create --title "Footer probe" --goal "Show the held task." --cue "read when probing the footer" --no-project | head -1'`: exit code `0`, output `task-001`, a task held by Pi's session. Run `scripts/verify-live.sh cmd "/reload"`: the footer reads `freeflow: task task-001`. Run `scripts/verify-live.sh cmd "/freeflow status"`, then `scripts/verify-live.sh snap act-store-status`: the status ends `store:` and the run's `home` folder, then `, holding task-001`. Then clean up.
- **An old Task Memory config.** Run `scripts/verify-live.sh launch --config '{"taskMemory":{"enabled":true}}'`. It prints `ready: freeflow: on`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled`, and, after the `store:` part, `task memory: Pi's Task Memory is gone, and its taskMemory settings are ignored: tasks live in the Freeflow store (Setup Freeflow moves old records in)`. Then `scripts/verify-live.sh snap act-task-memory-gone`, and clean up.

## Gotchas

- With no model available, the session start does not wait for the store, and the menu goes with the first prompt: the store step reloads the extension, which reads the store again, to show the held task without a prompt.
- `launch` treats any `freeflow:` footer as ready, and doctor passes in all three states because it checks that a footer exists, not which one. The step, not doctor, asserts the state.
- The footer lists optional capabilities that are on after `on`, separated by ` · `, so match its start, not the whole line.
- With no model available, the status line's compaction part is `compaction: enabled (cycle 1)`. With a model it also reports the context size, so match up to `(cycle 1`.
- Long notices wrap at the pane width (160 columns). Assert text that fits on one line, or read the wrapped lines together.
