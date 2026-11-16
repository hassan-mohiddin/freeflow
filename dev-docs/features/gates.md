# Gates

> **Covers:** `skills/track-work/scripts/lib/gates5.mjs`, `skills/track-work/scripts/lib/gate-state5.mjs`, `pi-extension/src/gates/`, `hooks/claude/freeflow.mjs`, `hooks/codex/driver.mjs`
> **Verified at:** `be0f39cb` (2026-11-14): the Claude Code steps (settings, listing, removed keys, doctor, capabilities) driven at the merge; the Codex and Pi steps by their tests, Pi's live step unverified
> **User docs:** `plugin-docs/capabilities/gates.md`

Before each tool call on Claude Code, Codex and Pi, Freeflow checks one rule, the delegation gate: a worker writes only its brief's scope and not the task's record, and a file another session claims is warned of. It warns by default: the call runs, and the agent reads the rule, why and the way through, once per turn. The gate is `off`, `warn` or `block` in every scope (`gates.delegation`); under `block` the call is refused with the same text. The agreement, Slice and delivery gates were removed (D-058). The state the gate reads is `<FREEFLOW_HOME>/sessions/<session ID>/gates.json`, which Track Work's commands write. How it works: [Gates](../subsystems/gates.md).

## Sub-features

- `gates-state-pi`: Pi's session start writes the session's gate state, with no task.
- `gates-settings-pi`: the Gates row on Pi's settings screen cycles the delegation gate through `off`, `warn` and `block`, writing `gates.delegation` in the file and dropping it at the default.
- `gates-claude-code`: on Claude Code, the mod's session start writes the gate state, `/freeflow settings gates.delegation <value>` changes the gate, `/freeflow settings` lists it, and `/freeflow capabilities` claims `block` as yes, with no model call.
- `gates-removed-keys`: a config that still holds `gates.agreement`, `gates.slice`, `gates.delivery` or `governor.cap` loads; each key is named as ignored with its reason, and `doctor --fix` removes it (D-058).
- `gates-codex`: on Codex, the driver's `PreToolUse` with hook inputs as Codex writes them: a write to a path another session claims warns as `additionalContext` once per turn; under `block` it is denied with the gate's text; a `git push` runs. No model call.
- `gates-warn`, `gates-block`: a claimed write warned or refused. Unverified live: a tool call needs a model call; the tests `the delegation gate warns: …`, `the delegation gate under block: …` in `hooks/claude/freeflow.test.ts` (`claude plugin test .`), `pi-extension/tests/gates/runtime.test.js`, and `hooks/tests/codex-driver.test.mjs` cover them.
- The state's commands (`delegate open --writes`, `claim`) are the [Track Work CLI](track-work-cli.md)'s `tw5-gates`.

## How to get to it (user POV)

- The agent meets the gate's row in its conversation (Claude Code), on a tool call's result (Pi) or as context (Codex) when it writes a path another session claims, or when a worker writes outside its brief's `May write:`.
- Change the gate with `/freeflow settings` on Pi (the Gates row) or `/freeflow settings gates.delegation <off|warn|block>` on Claude Code.
- Count would-fires with `node <track-work>/scripts/working-record.mjs events summary`: `Gates: delegation N would-fire`.

## Driving it

Preconditions:

- Claude Code: a scratch folder holding a Git repository with `.freeflow/config.json` `{}`, and an empty folder for `FREEFLOW_HOME` (outside the Freeflow store). Each `claude` command runs in the repository with `FREEFLOW_HOME` set to that folder, `CLAUDE_CODE_PLUGIN_DIRS` and `CLAUDE_CODE_SESSION_ID` unset, and `ANTHROPIC_BASE_URL=http://127.0.0.1:9`, so a model call would fail instead of being made; `<plugin>` is this checkout.
- Codex: a scratch folder holding a Git repository with `.freeflow/config.json` `{}`, `FREEFLOW_HOME` set to an empty folder in it, and `<plugin>` this checkout.
- Pi: a fresh `FFV_PI_ARGS="--session-id 0a0b0c0d-1111-4222-8333-444455556677" scripts/verify-live.sh launch` (config `{}`), and `scripts/verify-live.sh doctor` passes.

Steps:

- **Claude Code changes the gate.** Run `claude -p "/freeflow settings gates.delegation block" --plugin-dir <plugin>`. Exit code `0`; output `freeflow: Delegation gate: block, from .freeflow/local.json (Personal). The agent sees it now.`; `cat .freeflow/local.json` shows `{"gates": {"delegation": "block"}}`, pretty-printed. Run `claude -p "/freeflow settings gates.delegation inherit" --plugin-dir <plugin>` to remove it.
- **Claude Code lists it.** Run `claude -p "/freeflow settings" --plugin-dir <plugin>`. The rows read `Delegation gate  warn      default` among the Gates rows, with no Agreement, Slice, Delivery gate, Cost governor or Cost cap row; the Keys line names `gates.delegation, review.unit, review.model, review.rounds, pane.enabled, pane.statusLine`.
- **A removed key is named.** In the scratch repository write `{"gates":{"agreement":"block","delegation":"block"},"governor":{"cap":6}}` to `.freeflow/config.json` and run `claude -p "/freeflow settings" --plugin-dir <plugin>`. The listing shows `Delegation gate  block     Repository`, and its ignored line names `.freeflow/config.json gates.agreement: the Agreement gate was removed from Freeflow` and `.freeflow/config.json governor.cap: the cost cap was removed from Freeflow`. Run `node <plugin>/skills/setup-freeflow/scripts/settings.mjs doctor --root .` (exit `1`, the fix shown per key), then `doctor --fix --scope repository --root .`: the file holds `{"v": 1, "gates": {"delegation": "block"}}`.
- **The block claim.** Run `claude -p "/freeflow capabilities" --plugin-dir <plugin>`. The `block` line reads `block      yes       tool.check refuses the delegation gate's call under block (gates.delegation)`. On Pi, `/freeflow capabilities` reads `block` as `yes` too ([Capabilities](capabilities.md)).
- **Codex warns, then refuses.** In the Codex scratch repository, with a second session `thr_g2` holding its own task and claiming `a.txt`: run the driver's `SessionStart`, then `PreToolUse` for `apply_patch` on `a.txt` as session `thr_g1`, the same call again, then with `gates.delegation` set to `block` in `.freeflow/config.json` a `SessionStart` and the call. Expected: the first output's `additionalContext` reads `Freeflow gate (warn, delegation): a.txt is claimed by … (session thr_g2…, until …).` ending `This gate only warns for now.`; the second call prints nothing (one row per turn); under block the call's output is `permissionDecision` `deny` with `Freeflow gate (block, delegation): a.txt is claimed by …`; a `Bash` `git push` prints nothing. Then `events summary` for `thr_g1` shows `Gates: delegation 2 would-fire, 1 of them asked or refused` (the same-turn repeat counts as a would-fire, not a row).
- **Pi warns.** With a claim on the repository's `a.txt` held by another session, an edit of `a.txt` shows the row on the call's result; `events summary` lists `delegation 1 would-fire`. Driving Pi needs a model call for the edit; the step is covered by `pi-extension/tests/gates/runtime.test.js` and is unverified live.
- What the agent reads on a warned call in a live conversation, and the refusal in a worker's run, need a model call to make the tool call: covered by the tests named under Sub-features.

## Gotchas

- Codex reads `gates.*` at session start, so the step runs `SessionStart` again after changing the file; a hook Codex stops at its timeout lets the call run whatever the mode.
- A main-loop call needs no gate state; a worker's call under `block` with no state is refused, and says to run `task here`.
- The claim is another session's: a session's own claims never warn it, and a claim lapses at its time.
- The state is per session: a new session writes its own at its start.
