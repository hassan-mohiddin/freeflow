# Verify Live

> **Covers:** `scripts/verify-live.sh`
> **Verified at:** `c07e84ed` (2026-10-19)

For anyone checking a Freeflow change in the running software rather than only in `node --test`, people or agents: how to start an isolated Pi session with this checkout's extension, check that it is worth driving, drive it, keep evidence, and clean up, and which inputs cost a model call. What to drive for each feature is in the [feature map](../features/README.md).

Everything goes through one helper, `scripts/verify-live.sh`, run from the repository root. It runs the repository's own Pi devDependency (`node_modules/.bin/pi`), never a globally installed `pi`, and works with macOS's stock bash 3.2 and on Linux. It needs `tmux` (3.2 or later), `git`, Node 22, and `npm ci` done in this checkout. It lives in `scripts/` with the other maintainer tooling, outside the npm package's `files`, and its `.sh` name gives it `bash -n` in `npm run check`.

## Launch

```bash
npm ci                                   # once per checkout: installs the pinned Pi
npm run build                            # after editing pi-extension/src: Pi loads pi-extension/dist
scripts/verify-live.sh launch            # fixture with .freeflow/config.json = {}
scripts/verify-live.sh launch --no-config
scripts/verify-live.sh launch --config '{"taskMemory":{"enabled":true}}'
```

`launch` creates `.tmp/verify-live/runs/<run>/` with an empty Pi agent dir, Pi session dir, `FREEFLOW_HOME`, `HOME` and temp dir, and a fresh Git fixture repository whose `.gitignore` holds `.freeflow/*/` and `.freeflow/local.json`. It starts `pi --no-context-files --no-extensions -e pi-extension/freeflow/index.js --approve` in the fixture inside a private tmux server (`tmux -L ffv-<run>`), with `PI_OFFLINE=1`, and prints `FFV_RUN=<run>`. Prefix later calls with it (`FFV_RUN=<run> scripts/verify-live.sh doctor`); with exactly one live run the helper finds it on its own.

The run is ready when the editor is empty and the footer line `freeflow: …` has rendered; `launch` waits up to 40 seconds for that. The footer is written by the Freeflow extension, so its presence proves the extension loaded. `launch` accepts any `freeflow:` footer, so a step asserts the exact footer it expects.

Runs are isolated: each has its own tmux server, Pi dirs, `FREEFLOW_HOME`, `HOME` and fixture, so two runs can drive side by side and nothing touches `~/.pi` or `~/.freeflow`. Never drive a Pi session the helper did not launch.

## Health Check

```bash
scripts/verify-live.sh doctor
```

Read-only. It checks that the run's tmux session exists; Pi is alive, is the pid the run recorded, and has the process title `pi`; Pi received the run's agent dir, session dir and `FREEFLOW_HOME`, and, unless model calls were allowed, an empty environment with the run's own `HOME`; its working directory is the fixture; the `freeflow:` footer is present; the editor is empty; the repository's HEAD has not moved since launch; and `pi-extension/dist` is not stale against uncommitted `pi-extension/src` edits. It ends `doctor: PASS`, or `doctor: FAIL` with exit code 1.

On Linux the environment comes from `/proc/<pid>/environ`. macOS shows no environment for a process that rewrote its title, as Pi does, so there doctor reads the pane's start command, from which Pi was `exec`'d under the same pid.

Run it before the first step, after any failed step, and whenever the screen looks wrong. On FAIL, clean up and launch again; do not drive on.

## Drive

```bash
scripts/verify-live.sh cmd "/freeflow status"         # type, submit, wait for idle or a full-screen list, print the pane tail
scripts/verify-live.sh keys Down Down Enter           # tmux key names: Up Down Enter Space Tab Escape C-u, or literal text
scripts/verify-live.sh screen                         # print the visible pane; writes no evidence
scripts/verify-live.sh observe <name> -- cat .freeflow/config.json
scripts/verify-live.sh tty <name> --wait 'Start? [y/N]' --keys 'n Enter' -- <command...>
```

- `cmd` types a slash command and presses `Enter`. When the first `Enter` only accepted an autocomplete entry, so the command is still in the editor and no full-screen list opened, it presses `Enter` once more. It never presses `Enter` on an open settings screen, never sends `Escape`, and refuses to type while the editor holds text.
- `keys` sends raw keys to Pi. `C-u` empties the editor without submitting; `Escape` closes a completion menu but leaves the typed text.
- `observe` runs an ordinary command in the fixture with the run's environment (`FREEFLOW_HOME` is the run's, `FFV_REPO` is this repository) and saves it as evidence. Wrap anything that expands those variables in single-quoted `bash -c '…'`, or your own shell expands them first.
- `tty` runs a command in a terminal of its own, in the same tmux server, for a command that behaves differently without one, such as a confirmation prompt. It waits for `--wait` text, sends `--keys`, waits up to 60 seconds for the command to exit, and saves the terminal and exit code.

Stable handles are on-screen text: the footer line starting `freeflow: `, the settings header `Freeflow settings` with the active scope in brackets, the row cursor `›`, and the notices Freeflow prints above the editor (`Freeflow: enabled; …`, `Project <name> created and linked …`, `Warning: …`). Settings rows have a fixed order, so move by counting `Down` from the top and confirm the `›` row in the printed pane before pressing `Enter`.

## Evidence

Each run's evidence goes to `.tmp/verify-live/evidence/<run>/`, which Git ignores:

- `run.env`: the run, its tmux server and Pi pids, repository HEAD, the number of uncommitted paths under `pi-extension`, `skills`, `runtime` and `capabilities`, the Pi version, the launch config, whether model calls were allowed, and extra Pi flags.
- `actions.log`: every launch, `cmd`, `keys`, `snap`, `observe`, `tty` and clean-up, with a UTC time.
- `NN-<name>.txt`: numbered `snap` captures (the full pane scrollback), and `observe` and `tty` records (the command, its output and its exit code).
- `final-pane.txt`: the pane as clean-up found it.

```bash
scripts/verify-live.sh snap <name>                    # NN-<name>.txt from the pane
```

Proof standards:

- Drive the user's path: slash commands, keys and the settings screen in Pi, and the documented CLI commands, not extension internals or test fixtures.
- Snap the screen after each action that changes state, and observe the resulting state from a second view: read the file the command wrote, list `FREEFLOW_HOME`, or run `/freeflow status` again.
- Name evidence after the feature's sub-feature ID, such as `snap settings-repo-toggle`.
- A step whose precondition is missing fails, with the command attempted and the missing precondition. Do not reword a step until it passes, and do not report an entry point as verified through another one.
- A step that fails is triaged before anything changes: drift in the steps, a gap in the helper, or a product bug, which is reported and never written into the steps.

## Clean Up

```bash
scripts/verify-live.sh cleanup
scripts/verify-live.sh list                           # live runs and evidence folders
```

Clean-up saves `final-pane.txt`, stops only this run's tmux server (`tmux -L ffv-<run> kill-server`) and removes its socket file, waits for the recorded Pi pid to exit (sending `SIGTERM` to that pid alone if it lingers), and deletes `.tmp/verify-live/runs/<run>/`. The evidence stays. Clean up after failed attempts too. Never stop processes by name: other Pi sessions may be the user's.

## Paid Calls

Free text and every slash command that hands a skill to Pi's agent (`/verify-work`, `/discuss` and the others in `WORKFLOW_COMMANDS` and `CONTRIBUTOR_COMMANDS` in `pi-extension/src/host/catalog.ts`) send a request to a model. So do `/freeflow compact` and anything else that starts a turn. `/freeflow status`, `/freeflow settings`, `/freeflow project`, `/freeflow task` and Pi's `/reload` run locally.

Two guards stand between a mistyped step and a paid request:

- **No credentials by default.** Without `--allow-model-call`, `launch` starts Pi with an empty environment (only `PATH`, the run's `HOME` and temp dir, `LANG`, `TERM` and the run's own variables) and an empty Pi agent dir, so no provider key, cloud profile or saved login reaches it. Pi then shows `No models available.`, and `observe` and `tty` commands get the same environment.
- **Only known local commands.** `cmd` refuses free text, and any slash command not on its short list of commands known to run locally, unless given `--allow-model-call`; that flag also needs a run launched with `--allow-model-call`. Add a command to the list only after confirming in source that it never starts a turn.

A step that needs a model runs only with a pinned cheap model and the user's yes:

```bash
FFV_PI_ARGS="--model <provider/id>" scripts/verify-live.sh launch --allow-model-call
scripts/verify-live.sh cmd "/verify-work does README.md exist?" --allow-model-call
```

With `--allow-model-call` Pi keeps your environment and `HOME`, so a provider key or cloud profile there can be used; the Pi agent dir stays empty, so a login saved in `~/.pi` is not. Without a pinned model, Pi picks whatever its catalog chooses, which is not a cheap one. `PI_OFFLINE=1` (with `PI_SKIP_VERSION_CHECK=1`) turns off Pi's automatic network activity, such as model catalog refreshes and the version check (Pi's `docs/environment-variables.md`); it is not a guard against a prompt you send.
