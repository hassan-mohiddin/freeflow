# Gates

> **Covers:** `skills/track-work/scripts/lib/gates5.mjs`, `skills/track-work/scripts/lib/gate-state5.mjs`, `pi-extension/src/gates/`, `hooks/claude/freeflow.mjs`, `hooks/codex/driver.mjs`
> **Verified at:** `d664221e` (2026-11-18: Claude Code's refused gate setting, its Developer settings with no Gates row, and its block claim, Codex's block claim, and Pi's settings with no Gates row driven at `d664221e`, model calls blocked; the Codex warn and removed-key steps are not re-driven at this commit (the gate's rows now share PreToolUse's context with any pointer; `hooks/tests/codex-driver.test.mjs` covers both, and its test `a gate warning and a pointer in one PreToolUse` checks a fresh turn's context is the gate-only text, whole, then the pointer); the Pi warn step is unverified, it needs a model call)
> **User docs:** `plugin-docs/capabilities/gates.md`

Before each tool call on Claude Code, Codex and Pi, Freeflow checks one rule, the delegation gate: a worker writes only its brief's scope and not the task's record, and a file another session claims is warned of. It only warns (D-069): the call runs, and the agent reads the rule, why and the way through, once per turn. The gate has no setting; `gates.delegation` is a removed key, named as ignored by a file that still holds it. The agreement, Slice and delivery gates were removed (D-058). The state the gate reads is `<FREEFLOW_HOME>/sessions/<session ID>/gates.json`, which Track Work's commands write. How it works: [Gates](../subsystems/gates.md).

## Sub-features

- `gates-state-pi`: Pi's session start writes the session's gate state, with no task.
- `gates-settings-pi`: Pi's settings screen has no Gates row, in the normal view or in Developer settings.
- `gates-claude-code`: on Claude Code, `/freeflow settings gates.delegation <value>` is refused as an unknown setting, `/freeflow settings --all` has no delegation gate row, and `/freeflow capabilities` says `block` is no, with no model call.
- `gates-removed-keys`: a config that still holds `gates.delegation`, `gates.agreement`, `gates.slice`, `gates.delivery` or `governor.cap` loads; each key is named as ignored with its reason, and `doctor --fix` removes it (D-058, D-069).
- `gates-codex`: on Codex, the driver's `PreToolUse` with hook inputs as Codex writes them: a write to a path another session claims warns as `additionalContext` once per turn and runs; a second call the same turn adds no row; a `git push` runs. A `gates.delegation: block` in the home's `settings.json` changes nothing. No model call.
- `gates-warn`: a claimed write warned. Unverified live: a tool call needs a model call; the tests `the delegation gate warns …` and `a removed gates.delegation setting is named and ignored …` in `hooks/claude/freeflow.test.ts` (`claude plugin test .`), `pi-extension/tests/gates/runtime.test.js`, and `hooks/tests/codex-driver.test.mjs` cover them.
- The state's commands (`delegate open --writes`, `claim`) are the [Track Work CLI](track-work-cli.md)'s `tw5-gates`.

## How to get to it (user POV)

- The agent meets the gate's row in its conversation (Claude Code), on a tool call's result (Pi) or as context (Codex) when it writes a path another session claims, or when a worker writes outside its brief's `May write:`.
- There is nothing to change: the gate has no setting, and it never refuses a call.
- Count would-fires with `node <track-work>/scripts/working-record.mjs events summary`: `Gates: delegation N would-fire`.

## Driving it

Preconditions:

- Pi: a fresh `FFV_PI_ARGS="--session-id 0a0b0c0d-1111-4222-8333-444455556677" scripts/verify-live.sh launch --no-config`, and `scripts/verify-live.sh doctor` passes.
- Codex: a scratch folder holding a Git repository, `FREEFLOW_HOME` and `CODEX_HOME` set to empty folders in it, and `<plugin>` this checkout. The steps run Codex's driver with the hook inputs of `hooks/tests/fixtures/codex/inputs.mjs`, as Codex writes them.
- Claude Code: a scratch folder holding a Git repository, and an empty folder for `FREEFLOW_HOME`. Each `claude` command runs in the repository with `FREEFLOW_HOME` set to that folder, `CLAUDE_CODE_PLUGIN_DIRS` and `CLAUDE_CODE_SESSION_ID` unset, and `ANTHROPIC_BASE_URL=http://127.0.0.1:9`, so a model call would fail instead of being made; `<plugin>` is this checkout.

Steps:

- **Claude Code refuses a gate setting.** Run `claude -p "/freeflow settings gates.delegation block" --plugin-dir <plugin>`. Exit code `0`; output `freeflow: Freeflow settings: unknown setting gates.delegation; settings.mjs list names them`. Nothing is written.
- **Claude Code lists no gate.** Run `claude -p "/freeflow settings --all" --plugin-dir <plugin>`. The Developer view has no Gates row: `Claim hours  8 · the default (delegation.claimHours)` is the delegation row. The normal view (`/freeflow settings`) has none either.
- **A removed key is named.** Write `{"gates":{"agreement":"block","delegation":"block"},"governor":{"cap":6}}` to `$FREEFLOW_HOME/settings.json` and run `claude -p "/freeflow settings --all" --plugin-dir <plugin>`. Its ignored line reads `Settings ignored: settings.json gates.agreement: the Agreement gate was removed from Freeflow; settings.json gates.delegation: the delegation gate has no setting: it only warns, and never blocks a call (D-069); settings.json governor.cap: the cost cap was removed from Freeflow.` Run `node <plugin>/skills/setup-freeflow/scripts/settings.mjs doctor --root .`: exit code `1`, `Everywhere (settings.json in the home): 3 problems.`, each key with `(removed: the default applies)`. Then `doctor --fix --root .`: exit code `0`, `fixed: 3 removed from Everywhere`.
- **The block claim.** Run `claude -p "/freeflow capabilities" --plugin-dir <plugin>`. The `block` line reads `block      no        the delegation gate only warns, so nothing of Freeflow's refuses a call (D-069)`. Codex's `capabilities.mjs list` (after its session start, below) reads `block      no        the delegation gate only warns, so no Codex hook refuses a call (D-069)`.
- **Codex warns, and never refuses.** In the Codex scratch repository, with a second session `thr_g2` holding its own task and claiming `a.txt`: run the driver's `SessionStart` and `UserPromptSubmit` as `thr_g1`, then `PreToolUse` for `apply_patch` on `a.txt` (call `call_p1`), the same call again (`call_p2`), a `Bash` `git push` (`call_s`), and `Stop`. Expected: the first output's `additionalContext` reads `Freeflow gate (warn, delegation): a.txt is claimed by widget/task-002 (session thr_g2…, until …).` ending `This gate only warns.`; the second call prints nothing (one row per turn); the push prints nothing; the Codex output has no `permissionDecision`. `events summary` for `thr_g1` reads `Gates: delegation 2 would-fire`.
- **Codex with a removed block key.** Run the same steps with `{"gates":{"delegation":"block"}}` in the home's `settings.json` (set it before the first `SessionStart`): the output is the same warning, with no `permissionDecision`. `settings.mjs list` names `gates.delegation` as ignored, with its reason.
- **Pi's settings have no gate.** Run `scripts/verify-live.sh cmd "/freeflow settings"`, then `scripts/verify-live.sh cmd "/freeflow settings --all"`: the screens hold no Gates row, and `Claim hours` reads `8 hours (inherited)`. Run `scripts/verify-live.sh cmd "/freeflow capabilities"`: its `block` line reads `block      yes       tool_call returns a block with its reason: Tool Execution's guards (the delegation gate only warns)`, the Tool Execution guards that refuse a write, not the gate.
- **Pi warns.** With a claim on the repository's `a.txt` held by another session, an edit of `a.txt` shows the row on the call's result. Driving Pi needs a model call for the edit; the step is covered by `pi-extension/tests/gates/runtime.test.js` and is unverified live.
- What the agent reads on a warned call in a live conversation needs a model call to make the tool call: covered by the tests named under Sub-features.

## Gotchas

- A hook Codex stops at its timeout lets the call run.
- A missing gate state is quiet: a main-loop call and a worker's call both run, and the gate says nothing.
- The claim is another session's: a session's own claims never warn it, and a claim lapses at its time.
- The state is per session: a new session writes its own at its start.
