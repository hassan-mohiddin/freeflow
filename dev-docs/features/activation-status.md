# Activation and Status

> **Covers:** `pi-extension/src/host/status.ts`, `pi-extension/src/host/config.ts`, `pi-extension/src/host/config-validation.ts`, `pi-extension/src/host/runtime-state.ts`, `pi-extension/src/store/layer.ts`
> **Verified at:** `bf4a6342` (2026-11-14)
> **User docs:** `plugin-docs/settings.md`

On Pi, Freeflow runs in a folder that has a `.freeflow/config.json`. Without one the setup is needed: the footer reads `freeflow: setup needed`, nothing of Freeflow runs there, and the Runtime State tells the agent to set Freeflow up with the Setup Freeflow skill, or to work without it if the user declines (D-045, round 3). With the file present Freeflow is on, unless a setting turns it off: `enabled: false` in a file, or in the Session scope. A config file that cannot be used never turns it off. A setting the file ignores (a key no scope knows, a removed key, a value wrong for a known key, or a file that is not JSON, read as empty) keeps its default, and Freeflow says so: the footer reads `freeflow: on · N setting(s) ignored (settings.mjs doctor)`, and `/freeflow status` names each ignored setting, its file and why (D-045). Pi's footer shows the effective state on every screen, and `/freeflow status` prints the effective capabilities. How configuration is read and validated: [Prompt assembly](../subsystems/prompt-assembly.md) and the overview's [Cross-Cutting Concerns](../README.md#cross-cutting-concerns). Neither the footer nor `/freeflow status` shows the `review`, `prompts` or `skills` settings, and prompts turned off, one or all with `prompts.enabled`, leave Freeflow active; the agent gets it in the Runtime State.

## Sub-features

- `act-on`: the footer reads `freeflow: on` when `.freeflow/config.json` is `{}`.
- `act-status`: `/freeflow status` prints the effective state.
- `act-store`: with a task this session holds in the Freeflow store, the footer reads `freeflow: task <ID>` and `/freeflow status` names the store and the task.
- `act-start-ledger`: a session that starts with Freeflow on records its start's steps in the Freeflow home's `sessions/<session>/start.json`, which a reload reads so Freeflow does not catch up what the start already gave; the catch-up itself (Freeflow switched on after the start: the menu at the next run, once) needs a prompt, so it is unverified live and covered by `pi-extension/tests/store/catch-up.test.js`.
- `act-setup-needed`: with no `.freeflow/config.json` the footer reads `freeflow: setup needed`, `/freeflow status` reads `Freeflow: inactive (repo not set up); run /setup-freeflow`, and enabling waits for the setup. Only Setup Freeflow is exposed and the Runtime State carries the setup instruction (D-045, round 3). Creating the file turns Freeflow on.
- `act-local-off`: `enabled: false` in `.freeflow/local.json`, with the shared config file present, turns Freeflow off (`freeflow: off`), as on Claude Code.
- `act-ignored`: a setting the config ignores keeps Freeflow on: the footer adds `N setting(s) ignored (settings.mjs doctor)`, and `/freeflow status` names each ignored setting with its file and reason, then the command. A file that is not JSON is named as the whole file.
- `act-task-memory-gone`: a config that still sets the removed `taskMemory` keys loads, and `/freeflow status` says Pi's Task Memory is gone and they are ignored.

## How to get to it (user POV)

- Open Pi in a repository and read the footer line under the editor.
- Run `/freeflow status` while Pi is idle.
- Run `/setup-freeflow` in a folder with no `.freeflow/config.json`, to set Freeflow up there.
- Run `settings.mjs doctor` (Setup Freeflow's script) to see the fix for each ignored setting; it changes nothing unless `--fix` is given. See [Settings](settings.md).

## Driving it

Preconditions:

- A fresh run for each state below, since the config is read at launch. Clean up between them.

- **On.** Run `scripts/verify-live.sh launch`. It prints `ready: freeflow: on`.
- **Status.** Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled; tool execution: enabled; compaction: enabled (cycle 1)`, then `store: not ready (FREEFLOW_HOME is` the run's `home` folder: the run names a Freeflow home with no store in it. Then `scripts/verify-live.sh snap act-status`.
- **Unverified: Config on disk.** Run `scripts/verify-live.sh observe act-on-config -- cat .freeflow/config.json`. Exit code `0`, output `{}`. Then clean up.
- **Unverified: Setup needed.** Run `scripts/verify-live.sh launch --no-config`. It prints `ready: freeflow: setup needed`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: inactive (repo not set up); run /setup-freeflow`. Then `scripts/verify-live.sh snap act-setup-needed`. Run `scripts/verify-live.sh cmd "/freeflow enable"`: the warning reads `Freeflow: inactive (repo not set up); run /setup-freeflow`, and `scripts/verify-live.sh observe act-setup-needed-files -- bash -c 'ls -A .freeflow 2>/dev/null || echo "no .freeflow"'` prints `no .freeflow`: enabling wrote nothing. Then clean up.
- **Unverified: The setup creates the file.** In a run from `launch --no-config`, run `scripts/verify-live.sh observe act-config-added -- bash -c 'mkdir -p .freeflow && echo "{}" > .freeflow/config.json'`, then `scripts/verify-live.sh cmd "/reload"`. The footer reads `freeflow: on`. Then clean up.
- **Unverified: Personal off.** In a fresh `launch` run (config `{}`), run `scripts/verify-live.sh observe act-local-off -- bash -c 'mkdir -p .freeflow && printf "{\"enabled\": false}\n" > .freeflow/local.json && ls -A .freeflow'`. Exit code `0`, output `local.json` next to `config.json`. Run `scripts/verify-live.sh cmd "/reload"`. The footer reads `freeflow: off`. Then `scripts/verify-live.sh snap act-local-off` and clean up.
- **Unverified: A file that is not JSON.** In a run from `launch --no-config`, run `scripts/verify-live.sh observe act-not-json -- bash -c 'mkdir -p .freeflow && printf "{ not json\n" > .freeflow/config.json'`, then `scripts/verify-live.sh cmd "/reload"`. The footer reads `freeflow: on · 1 setting ignored (settings.mjs doctor)`. Run `scripts/verify-live.sh cmd "/freeflow status"`, then `scripts/verify-live.sh snap act-not-json-status`: the status reads `Freeflow: enabled; Settings ignored: .freeflow/config.json (whole file): not JSON:` followed by the parser's message, then ``Run `settings.mjs doctor` to see the fix.``. Clean up.
- **Unverified: A removed context key.** Run `scripts/verify-live.sh launch --config '{"contextVirtualization":{}}'`. It prints `ready: freeflow: on · 1 setting ignored (settings.mjs doctor)`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled; Settings ignored: .freeflow/config.json contextVirtualization: removed Freeflow context setting: delete this key. Run `settings.mjs doctor``, wrapped, `to see the fix.`, then `tool execution: enabled`. Then `scripts/verify-live.sh snap act-ignored-removed`, and clean up.
- **Unverified: A removed routing config.** Run `scripts/verify-live.sh launch --config '{"cognitiveRouting":{"enabled":true}}'`. It prints `ready: freeflow: on · 1 setting ignored (settings.mjs doctor)`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled; Settings ignored: .freeflow/config.json cognitiveRouting: Cognitive Routing was removed from Freeflow.`, then the command, wrapped. Then `scripts/verify-live.sh snap act-ignored-routing`, and clean up.
- **The store and the held task.** Run `FFV_PI_ARGS="--session-id 0a0b0c0d-1111-4222-8333-444455556666" scripts/verify-live.sh launch`. It prints `ready: freeflow: on`. Run `scripts/verify-live.sh observe act-store -- bash -c 'W="$FFV_REPO/skills/track-work/scripts/working-record.mjs"; node "$W" store init --home "$FREEFLOW_HOME" --git-name "Probe User" --git-email probe@example.com > /dev/null && FREEFLOW_SESSION=0a0b0c0d-1111-4222-8333-444455556666 FREEFLOW_HARNESS=Pi node "$W" task create --title "Footer probe" --goal "Show the held task." --cue "read when probing the footer" --no-project | head -1'`: exit code `0`, output `task-001`, a task held by Pi's session. Run `scripts/verify-live.sh observe act-start-ledger -- bash -c 'cat "$FREEFLOW_HOME/sessions/0a0b0c0d-1111-4222-8333-444455556666/start.json"'`: exit code `0`, `"pinned": true` and the steps `window`, `capabilities`, `guidance`, `sync` and `menu`, each with the launch's time. Run `scripts/verify-live.sh cmd "/reload"`: the footer reads `freeflow: task task-001`. Run `scripts/verify-live.sh cmd "/freeflow status"`, then `scripts/verify-live.sh snap act-store-status`: the status ends `store:` and the run's `home` folder, then `, holding task-001`. Then clean up.
- **Unverified: An old Task Memory config.** Run `scripts/verify-live.sh launch --config '{"taskMemory":{"enabled":true}}'`. It prints `ready: freeflow: on`. Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled`, then, after the `compaction:` part and before `store:`, `task memory: Pi's Task Memory is gone, and its taskMemory settings are ignored: tasks live in the Freeflow store (Setup Freeflow moves old records in)`, wrapped across two lines. Then `scripts/verify-live.sh snap act-task-memory-gone`, and clean up.

## Gotchas

- With no model available, the session start does not wait for the store, and the menu goes with the first prompt: the store step reloads the extension, which reads the store again, to show the held task without a prompt.
- `launch` treats any `freeflow:` footer as ready, and doctor passes in every state because it checks that a footer exists, not which one. The step, not doctor, asserts the state.
- The footer lists optional capabilities that are on after `on`, separated by ` · `, so match its start, not the whole line. The ignored-settings count follows the state word with ` · `.
- With no model available, the status line's compaction part is `compaction: enabled (cycle 1)`. With a model it also reports the context size, so match up to `(cycle 1`.
- Long notices wrap at the pane width (160 columns). Assert text that fits on one line, or read the wrapped lines together.
