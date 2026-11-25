# Activation and Status

> **Covers:** `pi-extension/src/host/status.ts`, `pi-extension/src/host/config.ts`, `pi-extension/src/host/config-validation.ts`, `pi-extension/src/host/runtime-state.ts`, `pi-extension/src/store/layer.ts`
> **Verified at:** `63ddec0d` (2026-11-25: every step in Driving it driven at `63ddec0d` in fresh runs with model calls blocked: the default run, the folder off and back on, the legacy file, doctor, the committed file, the file that is not JSON, and the no-settings run; `act-store` and `act-start-ledger` are not driven here)
> **User docs:** `plugin-docs/settings.md`

Freeflow is on once it is installed (D-060): on Pi it runs in every folder with its defaults, and no config file or setup step is needed. Its settings live in the Freeflow home: `settings.json` (everywhere), `folders.json` (this folder) and the session's values. The footer and `/freeflow status` report the effective state, and name each setting a layer ignores with its file and reason. Pi's former "setup needed" state is gone.

## Sub-features

- `act-on`: with no settings at all, the footer reads `freeflow: on`, `/freeflow status` reads `Freeflow: enabled`, and nothing is written to the repository.
- `act-no-config`: a run with no settings file (`launch --no-config`) reads `freeflow: on`, with no `.freeflow` folder in the repository.
- `act-status`: `/freeflow status` prints the effective state, with `Freeflow: disabled` when Freeflow is off.
- `act-off-folder`: `enabled: false` in this folder's entry (`folders.json`) turns Freeflow off in that folder: the footer reads `freeflow: off`, and `/freeflow status` reads `Freeflow: disabled`.
- `act-store`: with a task this session holds in the Freeflow store, the footer reads `freeflow: task <ID>` and `/freeflow status` names the store and the task.
- `act-start-ledger`: a session that starts with Freeflow on records its start's steps in the Freeflow home's `sessions/<session>/start.json`, which a reload reads so Freeflow does not catch up what it already did.
- `act-legacy-file`: a repository's own `.freeflow/config.json` is not read; `/freeflow status` names it as moved to This folder, and the footer is unaffected until doctor moves it.
- `act-ignored`: a setting a layer ignores keeps Freeflow on: the footer adds `N setting(s) ignored (settings.mjs doctor)`, and `/freeflow status` names each ignored setting with its file and reason (a damaged `settings.json` reads `(whole file): not JSON`).
- `act-task-memory-gone`: a config that still sets the removed `taskMemory` keys loads, and `/freeflow status` says Pi's Task Memory is gone and they are ignored.

## How to get to it (user POV)

- Open Pi in a repository and read the footer line under the editor.
- Run `/freeflow status` while Pi is idle.
- Run `settings.mjs doctor` (Setup Freeflow's script) to see the fix for each ignored setting; it changes nothing unless `--fix` is given. See [Settings](settings.md).

## Driving it

Preconditions: `scripts/verify-live.sh launch` (the run's Freeflow home holds `settings.json` `{}`), or `launch --no-config` for the no-settings run. The steps below ran at `63ddec0d`, with model calls blocked.

- **On by default.** Run `scripts/verify-live.sh launch`: `ready: freeflow: on`. Run `scripts/verify-live.sh observe act-1-home -- bash -c 'ls -A "$FREEFLOW_HOME"; ls -A .freeflow || echo "no .freeflow in the repository"'`: `settings.json`, `sessions` and `first-session.json` in the home, and `no .freeflow in the repository`.
- **No settings at all.** Run `scripts/verify-live.sh launch --no-config`: `ready: freeflow: on`, the home holds `sessions` and `first-session.json` only, and the repository has no `.freeflow` folder.
- **Off for this folder.** Run `scripts/verify-live.sh cmd "/freeflow settings"`, then `scripts/verify-live.sh keys Enter Enter` (Freeflow's row goes inherited, on, then off) and `scripts/verify-live.sh keys Escape`. After `sleep 4`, `scripts/verify-live.sh screen` reads `freeflow: off`; `/freeflow status` reads `Freeflow: disabled`; `folders.json` holds `"enabled": false` under the fixture's path.
- **Back on.** Run `scripts/verify-live.sh cmd "/freeflow settings"`, `scripts/verify-live.sh keys Enter` (off to inherited) and `scripts/verify-live.sh keys Escape`: the footer reads `freeflow: on`.
- **A legacy file is named, not read.** Run `scripts/verify-live.sh observe act-3-legacy -- bash -c 'mkdir -p .freeflow && printf "{\"enabled\": false}\n" > .freeflow/config.json'`. Then `scripts/verify-live.sh cmd "/freeflow status"` reads `Freeflow: enabled; Settings ignored: .freeflow/config.json (whole file): moved to This folder: run settings.mjs doctor --fix to move it.`
- **Doctor moves it.** Run `observe act-4-doctor -- bash -c 'node "$FFV_REPO/skills/setup-freeflow/scripts/settings.mjs" doctor --fix'`: exit code `1`, `enabled: moved to This folder (false)`, and `not rewritten: the committed file is shared`. After `/reload` the footer reads `freeflow: off`, since this folder's entry now holds `enabled: false`.
- **The committed file goes.** Run `observe act-5-committed -- bash -c 'node "$FFV_REPO/skills/setup-freeflow/scripts/settings.mjs" doctor --fix --committed'`: exit code `0`, and `fixed: .freeflow/config.json removed (committed)`.
- **A file that is not JSON.** Run `observe act-6-not-json -- bash -c 'printf "{ not json\n" > "$FREEFLOW_HOME/settings.json"'`, then `/reload` and `/freeflow status`: `Freeflow: disabled; Settings ignored: settings.json (whole file): not JSON: ...`; the folder's own `off` still holds, and the file is not rewritten.

Not driven at `63ddec0d`: `act-store` and `act-start-ledger` (no task is held in these runs, and the store's steps are Track Work's, driven in its own feature file); the Codex and Claude Code footers (no Codex here; Claude Code's status line is driven in [Settings](settings.md)).

## Gotchas

- `freeflow: store: not ready` in `/freeflow status` is expected in these runs: the run's `FREEFLOW_HOME` names a folder with no store in it.
- A `/reload` (or a settings screen closed after a file-level change) is needed before the footer reflects a file written by hand.
