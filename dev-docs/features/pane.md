# Pane and status line

> **Covers:** `hooks/claude/pane.mjs`, `hooks/claude/types.d.ts`
> **Verified at:** `37f67003` (2026-11-14: the Settings step driven; the rest unchanged by D-054 and not driven)
> **User docs:** `plugin-docs/capabilities/pane.md`

On Claude Code, Freeflow's mod pins a status line under the prompt (the held task and its Slice or agreement, the context and its cycle, the weekly window, the open delegations) and opens one pane with `/freeflow pane`: four views switched by `1` to `4` (Tasks, Agents, Cost, Decisions), drawn from Track Work's JSON (`session status`, `project list --json`, `delegate status --json`, `estimate --spent --json`, `estimate --plan --json`, `events summary --json`). Its letter keys run Track Work's own commands and append one row each. `pane.enabled` and `pane.statusLine` turn them off. A `-p` run and a cloud session draw nothing.

## Sub-features

- `pane-mocked`: the mocked engine opens the pane, draws each view from fixture JSON, switches views by their buttons, runs each press's command and appends one row, and draws without writing state.
- `pane-json`: the three JSON outputs the pane reads, in a scratch store.
- `pane-headless`: `/freeflow pane` in a `-p` run says no surface is attached.
- `pane-settings`: `/freeflow settings` lists Pane and Status line, `pane.enabled off` makes `/freeflow pane` refuse, and `inherit` returns it.
- `pane-terminal`: in an interactive terminal session, the status line shows and `/freeflow pane` docks the pane beside the transcript.

## How to get to it (user POV)

- Type `/freeflow pane` on Claude Code (terminal or the Desktop app's Code tab); press `1` to `4` while it has the focus.
- Read the status line under the prompt.
- Turn either off with `/freeflow settings pane.enabled off` or `/freeflow settings pane.statusLine off`.

## Driving it

Preconditions: a scratch folder holding a Git repository `repo` with `.freeflow/config.json` `{}` and a remote `https://github.com/acme/widget.git`, and an empty folder `home` for `FREEFLOW_HOME`; `<plugin>` is this checkout; `W=<plugin>/skills/track-work/scripts/working-record.mjs`. Claude Code runs with `CLAUDE_CODE_PLUGIN_DIRS` and `FREEFLOW_SESSION` unset and `ANTHROPIC_BASE_URL=http://127.0.0.1:9`, so a model call would fail instead of being made. No step calls a model.

- **Mocked engine.** In `<plugin>`, run `claude plugin test .`. The six tests of `hooks/claude/pane.test.ts` pass with the mod's own: `/freeflow pane opens the pane and reads the scripts' JSON off the request path…`, `each view renders from the fixtures, and the hotkeys 1 to 4 switch views…`, `presses run Track Work's own commands…`, `the status line matches the fixture…`, `no render writes state…`, `where no surface draws, or with the pane off, nothing is read for it`.
- **The JSON it reads.** With `FREEFLOW_HOME=home FREEFLOW_SESSION=aaaaaaaa-1 FREEFLOW_HARNESS="Test harness"`: `node $W store init --git-name P --git-email p@example.com`, `node $W project new --name widget`, `node $W task create --title Probe --goal "Probe." --cue "read when probing" --project widget --cwd repo`. Then `node $W project list --json` prints `"session": "aaaaaaaa"` and project `widget` with task `widget/task-001`, title `Probe`, a `hold` by `aaaaaaaa`, `"thisSession": true`, `"agreement": null`, `"decisions": []`; `node $W delegate status --record widget/task-001 --json` prints `{ "delegations": [] }`; `node $W estimate --spent --record widget/task-001 --json` prints `slices` `0`, `delegations` `0`, `usd` `0`, `byModel` `[]`, and without `--json` `Spent: no Slice measured, no delegation measured, $0.00 at API list price.`
- **Headless.** In `repo`, with `FREEFLOW_HOME=home`, run `claude -p "/freeflow pane" --plugin-dir <plugin>`. Exit code `0`; output `freeflow: Freeflow's pane did not open here (no-surface: no surface is attached ($.session.surfaces() is empty)).`
- **Settings.** The same way, `claude -p "/freeflow settings" --plugin-dir <plugin>` lists `Pane  on  default` and `Status line  on  default` after `Cost cap`, and its Keys line ends `pane.enabled, pane.statusLine.`; `claude -p "/freeflow settings pane.enabled off" --plugin-dir <plugin>` prints `freeflow: Pane: off, from .freeflow/local.json (Personal). The agent sees it now.` and `Only Claude Code's mod acts on this setting.`; then `/freeflow pane` prints `freeflow: Freeflow's pane is off (pane.enabled); /freeflow settings pane.enabled on turns it on.`; `/freeflow settings pane.enabled inherit` prints `freeflow: Pane: on, from the default. The agent sees it now.`
- **Terminal** (unverified at `ce7ad79b`: driven at `f6a6be32`, before the two later fixes). In a 170-column `tmux` window, in `repo`, start `claude --plugin-dir <plugin>` with `FREEFLOW_HOME=home` (a separate `CLAUDE_CONFIG_DIR` whose `.claude.json` has the folder trusted keeps the person's own settings untouched). The line under the prompt reads `freeflow: Freeflow: no task held` (the session is not `aaaaaaaa`). Type `/freeflow pane` and Enter: the transcript shows `freeflow: Freeflow's pane opened: 1 Tasks, 2 Agents, 3 Cost, 4 Decisions.` and a pane docks on the right with `Freeflow  1: Tasks  2: Agents  3: Cost  4: Decisions`, `Working`, `widget/task-001  Probe  held by aaaaaaaa · synced <n> min ago` and `o: open  n: new task  m: move  r: release`. Pressing `2` to `4` and the letter keys in the live pane is unverified: not driven here (the mocked engine drives them).

## Gotchas

- A session whose event log has no line yet has no `events summary`; the pane takes that as no figures, not a failure.
- The pane reads after the hook that asks has returned (`$.clock.after(0)`), so a test advances the mocked clock before it looks.
- `$.ui.ask` (the takeover question) is not driven in the mocked engine: the kit answers it through `AskUserQuestion`'s tool call, which the tests do not stand in for.
- Where an installed Freeflow plugin is also present, `claude -p … --plugin-dir <plugin>` may print `freeflow: hooks module not loaded: another plugin of that name loads first`; the checkout's module answered the steps above all the same.
- The status line's ctx and 7d parts appear only after the session's first model request; before it the engine has no figures.
