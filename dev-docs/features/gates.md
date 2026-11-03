# Gates

> **Covers:** `skills/track-work/scripts/lib/gates5.mjs`, `skills/track-work/scripts/lib/gate-state5.mjs`, `pi-extension/src/gates/`, `hooks/claude/freeflow.mjs`
> **Verified at:** `b2a93ba5` (2026-11-03)
> **User docs:** `plugin-docs/capabilities/gates.md`

Before each tool call on Claude Code and Pi, Freeflow checks four rules: an agreement before a change, a Slice before a change while a task is held, a reminder that a delivery step needs the user's yes, and a worker writing only its scope. Every gate warns by default: the call runs, and the agent reads the rule, why and the way through, once per gate in a turn. Each gate is `off`, `warn` or `block` in every scope (`gates.*`); under `block` the call is refused, and a delivery step is put to the person where someone can answer. The state the gates read is `<FREEFLOW_HOME>/sessions/<session ID>/gates.json`, which Track Work's commands write. How it works: [Gates](../subsystems/gates.md).

## Sub-features

- `gates-state-pi`: Pi's session start writes the session's gate state, with no task and no agreement.
- `gates-settings-pi`: the Gates rows on Pi's settings screen cycle a gate through `block`, `off` and back to `warn`, writing `gates.<gate>` in the file and dropping it at the default.
- `gates-claude-code`: on Claude Code, the mod's session start writes the gate state, `/freeflow settings gates.<gate> <value>` changes a gate, `/freeflow settings` lists the four gates, and `/freeflow capabilities` claims `block` as yes, with no model call.
- `gates-warn`, `gates-block`: a tool call warned or refused. Unverified live: a tool call needs a model call; the tests `the gates warn: …`, `the gates under block: …` and `the delegation gate: …` in `hooks/claude/freeflow.test.ts` (`claude plugin test .`) and `pi-extension/tests/gates/runtime.test.js`, whose last test runs a real Pi session with scripted model responses, cover them.
- The state's commands (`agree`, `delegate open --writes`) are the [Track Work CLI](track-work-cli.md)'s `tw5-gates`.

## How to get to it (user POV)

- The agent meets a gate's row in its conversation (Claude Code) or on a tool call's result (Pi) when it changes something before an agreement or a Slice, or runs a delivery step.
- Change a gate with `/freeflow settings` on Pi (the Gates rows) or `/freeflow settings gates.<gate> <off|warn|block>` on Claude Code.
- Count would-fires with `node <track-work>/scripts/working-record.mjs events summary`.

## Driving it

Preconditions:

- Pi: a fresh `FFV_PI_ARGS="--session-id 0a0b0c0d-1111-4222-8333-444455556677" scripts/verify-live.sh launch` (config `{}`), and `scripts/verify-live.sh doctor` passes.
- Claude Code: a scratch folder holding a Git repository with `.freeflow/config.json` `{}`, and an empty folder for `FREEFLOW_HOME`. Each `claude` command runs in the repository with `FREEFLOW_HOME` set to that folder, `CLAUDE_CODE_PLUGIN_DIRS` and `CLAUDE_CODE_SESSION_ID` unset, and `ANTHROPIC_BASE_URL=http://127.0.0.1:9`, so a model call would fail instead of being made; `<plugin>` is this checkout.

- **Pi writes the state.** Run `scripts/verify-live.sh observe gates-state-pi -- bash -c 'ls "$FREEFLOW_HOME/sessions/"; cat "$FREEFLOW_HOME"/sessions/*/gates.json'`. Exit code `0`; the output is `0a0b0c0d-1111-4222-8333-444455556677`, then the state: `"v": 1`, `"task": null`, `"store": null`, `"agreement": null`, `"exactSpec": null`, `"slice": null`, `"delegations": {}` and its `"updated"` time.
- **The Gates rows.** Run `scripts/verify-live.sh cmd "/freeflow settings repo"`, then `scripts/verify-live.sh keys` with twenty `Down`s. Under a `Gates` heading the four rows read `Agreement gate`, `Slice gate`, `Delivery gate` and `Delegation gate`, each `warn (inherited)`, and the cursor is on `›   Delivery gate          warn (inherited)`. Run `scripts/verify-live.sh keys Enter`: the row reads `›   Delivery gate          block` and the description `block: The call is refused with the same text; a delivery step becomes a question where you can answer.` Run `scripts/verify-live.sh observe gates-settings-repo -- cat .freeflow/config.json`: `{"gates": {"delivery": "block"}}`, pretty-printed. Run `scripts/verify-live.sh keys Enter`: `off`, and the file holds `"delivery": "off"`; `scripts/verify-live.sh keys Enter`: `warn (inherited)`, and the file is `{}`. Then `scripts/verify-live.sh snap gates-settings-pi`, `scripts/verify-live.sh keys Escape`, and clean up.
- **Claude Code changes a gate.** Run `claude -p "/freeflow settings gates.delivery block" --plugin-dir <plugin>`. Exit code `0`; output `freeflow: Delivery gate: block, from .freeflow/local.json (Personal). The agent sees it now.`; `cat .freeflow/local.json` shows `{"gates": {"delivery": "block"}}`, pretty-printed; `ls "$FREEFLOW_HOME"/sessions/*/` lists `capabilities.json` and `gates.json`, the state the mod's session start wrote (`"task": null`, `"agreement": null`).
- **Claude Code lists them.** Run `claude -p "/freeflow settings" --plugin-dir <plugin>`. After `Event log` the rows read `Agreement gate   warn      default`, `Slice gate       warn      default`, `Delivery gate    block     Personal` and `Delegation gate  warn      default`, and the Keys line names `gates.agreement, gates.slice, gates.delivery, gates.delegation`.
- **The block claim.** Run `claude -p "/freeflow capabilities" --plugin-dir <plugin>`. The `block` line reads `block      yes       tool.check refuses a gate's call under block, or asks the person for a delivery step (gates.*)`. On Pi, `/freeflow capabilities` reads `block` as `yes` too ([Capabilities](capabilities.md)).
- What the agent reads on a warned call, a refusal, the dialog for a delivery step and a worker's warning need a model call to make the tool call: covered by the tests named under Sub-features.

## Gotchas

- The rows are below the scroll on Pi's screen: the list scrolls past 18 rows, so the Gates heading shows only as the cursor nears it.
- `claude -p` has no one to answer a dialog, so a delivery step under `block` is refused there, not asked.
- The state is per session: a new session writes its own at its start.
