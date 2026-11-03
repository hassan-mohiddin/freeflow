# Capabilities

> **Covers:** `skills/setup-freeflow/scripts/capabilities.mjs`, `hooks/claude/freeflow.mjs`, `pi-extension/src/events/`
> **Verified at:** `1e1866bd` (2026-11-03)
> **User docs:** `plugin-docs/capabilities/event-log.md`

What Freeflow can do in a session, for the requests of request set 1 (pin, inject, forget, compact, checkpoint, rewind, route, spawn, send, wake, ask, block, sensors, timers). Each driver, Claude Code's mod and Pi's extension, writes its claims at session start to `<FREEFLOW_HOME>/sessions/<session ID>/capabilities.json`: `yes` for what it carries out today, with a conformance test, `possible` for what the host offers and Freeflow does not use yet, `no` for what the host cannot do, each with how or why not. A user lists them with `/freeflow capabilities`; the agent with Setup Freeflow's `capabilities.mjs`, whose `check <request>` exits 0 only for `yes`. A host with no driver (Codex, Cursor, Copilot, Gemini) writes no file, and the script says that only the session-start guidance arrives there. Track Work's `checkpoint --compact` reads the same file and leaves a compaction request only where a driver claims `compact`. The last line of the listing names the session's event log.

## Sub-features

- `caps-no-driver`: with no claims for the session, `capabilities.mjs list` says no driver runs here, lists `inject` and `checkpoint` as yes and the rest as no, and no event log; `check compact` exits 1.
- `caps-claude-code`: on Claude Code, `/freeflow capabilities` lists the mod's claims for a headless run (`wake` no, `compact` only on the next compaction), with no model call.
- `caps-pi`: on Pi, `/freeflow capabilities` lists the extension's claims and the event log, with no model call.
- `caps-compact-refused`: `checkpoint --compact` in a session with no claims writes the checkpoint and no request, and says so.

## How to get to it (user POV)

- Run `/freeflow capabilities` on Claude Code or Pi.
- Ask the agent what Freeflow can do here; it runs `node <setup-freeflow>/scripts/capabilities.mjs` (`list`, `check <request>`, `--json`).

## Driving it

Preconditions: a scratch folder holding a Git repository with `.freeflow/config.json` `{}`, and an empty folder for `FREEFLOW_HOME`. Every command below runs in the repository with `FREEFLOW_HOME` set to that folder; `<plugin>` is this checkout. No step calls a model.

- **No driver.** Run `FREEFLOW_SESSION=s-1 node <plugin>/skills/setup-freeflow/scripts/capabilities.mjs list`. Exit code `0`; the first line reads `No Freeflow driver runs in this session: only the session-start guidance arrives here, and the agent runs Freeflow's scripts itself.`, `inject` and `checkpoint` read `yes`, the other twelve `no` with `no Freeflow driver runs here`, and the last line is `Event log: none; no driver writes one here.` Then `FREEFLOW_SESSION=s-1 node <plugin>/skills/setup-freeflow/scripts/capabilities.mjs check compact; echo "exit $?"`: `compact: no (no driver): no Freeflow driver runs here` and `exit 1`.
- **Compaction refused.** In a store with a task this session holds (`node <plugin>/skills/track-work/scripts/working-record.mjs store init --git-name P --git-email p@example.com`, `project new --name widget`, `task create --title Probe --goal "Probe." --cue "read when probing" --project widget`, all with `FREEFLOW_SESSION=s-1`), run `FREEFLOW_SESSION=s-1 node <plugin>/skills/track-work/scripts/working-record.mjs checkpoint --record widget/task-001 --compact | tail -1`. Output `No Freeflow driver here compacts (no capabilities for this session). The harness compacts on its own; after it, recover with view recover.`; `test -e "$FREEFLOW_HOME/sessions/s-1/compact.json"; echo $?` prints `1`: no request was written.
- **Claude Code.** With `CLAUDE_CODE_PLUGIN_DIRS` unset and `ANTHROPIC_BASE_URL=http://127.0.0.1:9`, so a model call would fail instead of being made, run `claude -p "/freeflow capabilities" --plugin-dir <plugin>`. Exit code `0`; the output starts `freeflow: Freeflow on Claude Code (claude-code-mod 0.9.0, request set 1, headless)`, lists the fourteen requests with `inject`, `compact`, `checkpoint`, `send`, `sensors` and `timers` as `yes`, `wake` as `no` with `nothing runs between turns in a headless run`, and `compact`'s line reads `on the next compaction; it cannot start one in a headless run`; the last line reads `Event log: on,` the session's `events/<session>.jsonl` under `FREEFLOW_HOME`, and its line count. `ls "$FREEFLOW_HOME"/sessions/*/capabilities.json` shows the file the mod wrote.
- **Pi.** Run `scripts/verify-live.sh launch` (config `{}`), then `scripts/verify-live.sh cmd "/freeflow capabilities"`. The pane shows `Freeflow on Pi (pi-extension 0.9.0, request set 1, interactive)`, `pin`, `inject`, `compact`, `checkpoint`, `wake`, `ask`, `block`, `sensors` and `timers` as `yes`, `forget` and `route` as `possible` (Pi offers the calls; Freeflow does not use them), `send` as `possible` (Messaging is off), `rewind` and `spawn` as `no`, and `Event log: on,` the session's log under the run's Freeflow home. Then `scripts/verify-live.sh snap caps-pi`, and clean up.

## Gotchas

- `/freeflow capabilities` reads the claims file the driver wrote at session start; on Pi the command writes the current claims first, on Claude Code a settings change rewrites them.
- The line count of the event log counts lines already written: Claude Code writes a turn's lines at its end, and Pi once the session stays idle two seconds after a run, so a count right after a command may not include it.
- The session ID is `FREEFLOW_SESSION`, else `CLAUDE_CODE_SESSION_ID`, as Track Work reads it; a Pi run inside a Claude Code terminal passes its own with `--session`.
