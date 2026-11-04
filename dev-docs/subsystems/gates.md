# Gates

> **Covers:** `skills/track-work/scripts/lib/gates5.mjs`, `skills/track-work/scripts/lib/gate-state5.mjs`, `pi-extension/src/gates/`, `hooks/claude/freeflow.mjs`
> **Tests:** `.skill-eval/track-work/tests/gates5.test.mjs`, `pi-extension/tests/gates/`, `hooks/claude/freeflow.test.ts`
> **Verified at:** `29279995` (2026-11-04)
> **User docs:** `plugin-docs/capabilities/gates.md`

For anyone changing Freeflow's gates: the four rules each driver checks before a tool call, the state Track Work keeps for them, how Claude Code's mod and Pi's extension run them, and why they only warn for now.

## Purpose

Some rules must always hold: no change before the user's agreement, no effect outside the record without a Slice, no commit, push or release without the user's own yes, and a worker writing only its own scope. Each is a skill's rule the agent can forget, and before the gates nothing saw when it did. The gates check them in code, in the driver, before each tool call. They ship warning only: the agent reads the rule, why, and the way through, and the event log counts each would-fire, so the user decides from data when a gate refuses (SPEC-008, `specs/gates.md` in task-001's folder).

## Vocabulary

- **Gate**: one rule checked before a tool call: `agreement`, `slice`, `delivery` or `delegation`. Each is `off`, `warn` or `block` (`gates.<gate>`).
- **Decision**: `allow`, `warn`, `ask` or `block`, from `gates5.decide`. `ask` is a delivery step under block where a person can answer.
- **Changing call**: a file-writing tool (Claude Code's Edit, Write, MultiEdit, NotebookEdit; Pi's `edit`, `write`; `apply_patch`) or a shell command off the read-only list. A shell line the classifier cannot follow counts as changing.
- **Gate state**: `<FREEFLOW_HOME>/sessions/<session>/gates.json`, the few facts the gates need, written only by Track Work's commands.
- **Would-fire**: a decision that was not `allow`; one `gate` event line each.

## How It Works

**The decision** (`gates5.mjs`). `decide(state, call, settings)` is pure and synchronous and imports nothing, so a mod can import it and a call costs no file read. A call is `{ tool, paths, command, cwd, readOnly, delegation, canAsk }`. The shell classifier (`splitCommand`, `classifyCommand`) splits a line at `&&`, `||`, `;`, `|`, `&`, a newline and parentheses, reads quotes, escapes and here-documents, collects the files a line redirects output to, and strips variable assignments, `env`, `sudo` and the like before the program; `git -C`, `-c` and the other options before git's subcommand are skipped. A command substitution makes the line changing. Track Work's own commands are the way through the agreement and Slice gates, so a line that runs only `working-record.mjs` never trips them; one that writes the record does trip the delegation gate for a worker. Each gate that fires gives `{ gate, decision, reason, way, rule }`; the strongest decision leads and every one is in `fired`, so the driver warns or refuses once and logs each. `gateText` is the text the agent reads; `gateEvent` the event line's fields.

| Gate | Fires on | Unless |
| --- | --- | --- |
| agreement | a changing call outside the store | the state has an agreement (the held task's open one, or `agree`'s) or an exact-spec declaration |
| slice | a changing call outside the store, by the main loop, while a task is held | the state has a Slice `in_progress` |
| delivery | `git commit`, `push`, `tag` (not a listing), `merge` (not `--abort`), `gh pr create`, `gh pr merge`, `npm publish`, `npm version`, `npm run release:*`, `node scripts/release.mjs`, also inside `bash -c` | never: under warn it always reminds |
| delegation | a worker's changing call with a path outside its `writes` and its own delegation folder, or one on the task's `record.md`, `decisions.md` or `history.md` (by path, by a redirect, or by a Track Work command that writes) | the call is inside its scope |

**The state** (`gate-state5.mjs`). After `task take | release | switch | create`, `task here --take-back`, `agreement open | close`, `slice start | start-direct | pause | resume | close`, `delegate open | close` and `agree`, `working-record.mjs` derives the whole state again (`gatesAfter`, `refreshGates`) and writes it through a temporary file and a rename: the task the session holds in the store, or else the task whose record the command named; its open agreement and Slice; each open delegation's scope (its brief's `May write:` globs, resolved against its worktree; else the worktree; else nothing, a reader) with its folder; the session's own agreement from `agree` while no task is held; an exact-spec declaration, which lasts the session. `session status`, which every driver runs at session start, writes a state where none exists, so the gates read what holds from a session's first call. `agree --outcome <text> [--exact-spec <reason>]` records a session's agreement in the state and as an `agreement` event line, and is refused while a task is held. `validate` names a state that differs from the record it reads.

**Claude Code** (`hooks/claude/freeflow.mjs`). `tool.check`, after `next(e)` and the store's allow, calls `gated`: it reads the state at most once a turn (`readGates`; reread after a Track Work command seen in `tool.call`), maps a worker's `agentId` to its delegation through the mod's worker map, passes `isReadOnly` and whether an `approver` is present, and calls `decide` with the modes `resolveEnabled` read from the settings script's `list`. Warn leaves the verdict as it is and appends one row per gate per turn (`appendRow`; a worker's goes to it with `$.session.send`); block answers `deny` with the gate's text, or `ask` for a delivery step with an approver; a `deny` beneath stands. The hook's `.catch` answers `deny` while any gate is at block, and the engine's verdict otherwise.

**Pi** (`pi-extension/src/gates/runtime.ts`). `GateRuntime` loads `gates5.mjs` from Freeflow's package once, reads the state at session start, again after the store's session start (`settled`), and after each `working-record.mjs` command's result, never per call. `tool_call` calls it before Freeflow's other checks with the modes in the capability state (`resolveGateSettings`); block returns `{ block, reason }`, ask uses `ctx.ui.confirm` where `ctx.hasUI`; warn keeps the rows for the call's id and `tool_result` adds them to the result after Tool Execution's notices, with Tool Execution on or off. Pi has no workers.

**Measurement** (`events5.mjs`). A `gate` line (`gate`, `decision`, `tool`, `rule`) for every decision that is not allow, under the agent that made the call; `events summary` prints `Gates: agreement N, slice N, delivery N, delegation N would-fire`, and the summary a checkpoint commits holds them, which `estimate --store` totals across the store.

## Decisions

- **Every gate warns in this build** (SPEC-008 P1, P2; accepted at its defaults on 2026-11-03). Rules that were prose cannot be measured until something sees them break; a warning costs one row and tells the agent the way through, and the would-fire counts say which gate is worth refusing. `block` is built and tested so moving a gate is a setting. Rejected: blocking from the start, which would stop work on the classifier's false positives before anyone knew their rate.
- **One module decides, for every driver** (T1). The rule lives in `gates5.mjs`; the mod imports it, Pi loads it from Freeflow's package, and Codex's driver calls it. It imports nothing, since a mod may import only plugin files, and a pure function is tested on a table.
- **A small state file, written only by Track Work** (T1, section 6). Finding the held task costs a `git log` per task; reading a record per call is out of the question. Each lifecycle command derives the state again from the record, so a change made by hand is set right by the next command, and no message or file the agent reads can open a gate.
- **Workers keyed by delegation, not agent ID**. The agent ID is known only to the driver after the spawn; the mod already maps it to its delegation (`delegations.json`), so the state holds each delegation's scope by `D-NNN` and the driver looks the worker up. The Spec's sketch kept them by agent ID.
- **Fail open under warn, closed under block** (P6). A sensor fails open; a gate turned to block that cannot read its state refuses, naming `task here` and `agree`.
- **Tests and checks are reads** (P5). A run of the project's tests is verification, which needs the agreement but not a gate; `npm test`, `node --test` and `npm run test|check|lint|typecheck|verify[:…]` count as reads.

## Intended Behavior That Looks Wrong

- **A read warns.** A shell line the classifier cannot follow (an alias, `bash -c`, `$(…)`, a script) counts as changing, so the agreement gate may warn on it. The read-only list grows from the logged false warnings.
- **A worker's shell command outside its scope does not warn.** A command names no path unless it redirects output; the delegation gate checks the redirect targets and the record files only.
- **A session that runs no lifecycle command still has a state.** `session status` at session start writes one with no task and no agreement, so the agreement gate warns on the first change of a session that agreed nothing on record.
- **Pi allows every call until its first read of the state**, at session start, so an extension that has not loaded `gates5.mjs` yet never refuses.
- **The delivery gate fires on a `git commit` the user asked for.** Under warn it reminds; it cannot know the user's yes.

## Surface

- Settings: `gates.agreement`, `gates.slice`, `gates.delivery`, `gates.delegation`: `off`, `warn` (default), `block`, in every scope (`SETTINGS` in `config-validation.ts`).
- Commands: `working-record.mjs agree --outcome <text> [--exact-spec <reason>]`; `delegate open --writes <glob>` (repeatable); `events summary`'s Gates line; `estimate --store`'s gates line.
- Text the agent reads: `Freeflow gate (<warn|ask|block>, <gate>): <what>` then `Why:` and `Way through:`; under warn it ends "This gate only warns for now."
- Event kinds `gate` and `agreement`, additive to schema v1; a `freeflow` line of what `gates` when the state is missing.
- Claims: `block` is yes on Claude Code and Pi.

## State

- `<FREEFLOW_HOME>/sessions/<session>/gates.json`, this machine only (the store ignores `sessions/`): `{ v: 1, task, taskDir, store, agreement, session, exactSpec, slice: { id, state }, delegations: { "D-NNN": { writes, worktree, folder, handle } }, updated }`.
- In memory: the mod's `gateState` (once a turn), `gateModes`, the gates that warned in each loop's turn; Pi's `GateRuntime` the same.

## Invariants

- No text the agent reads can change a decision; only Track Work's commands write the state (`gates5.test.mjs`, "each lifecycle command writes the session's gate state").
- A deny beneath a gate stands, and the store's allow still holds (`freeflow.test.ts`, "the gates under block").
- Under warn a gate never changes the verdict (`freeflow.test.ts`, "the gates warn"; `runtime.test.js`).

## Failure Behavior

- State missing or unreadable: quiet under warn, with one `freeflow` line; refused under block with "Freeflow cannot read its gate state; run `task here` or `agree`".
- The mod's hook throws: the `.catch` denies while a gate is at block, and leaves the engine's verdict otherwise.
- A state write fails: the lifecycle command still succeeds; the next one writes it.

## Cost

- `decide` is a few string operations per call; no file is read per call on either driver.
- A lifecycle command finds the held task once more (a `git log` per task) to write the state.
- The mod's settings read adds one settings script run at session start and after a settings change.

## Code Map

- `skills/track-work/scripts/lib/gates5.mjs`: `decide`, the shell classifier, paths and globs, `gateText`, `gateEvent`.
- `skills/track-work/scripts/lib/gate-state5.mjs`: `gateState`, `refreshGates`, `readGateState`, `delegationScope`, `gateDrift`.
- `skills/track-work/scripts/working-record.mjs`: `agree`, `gatesAfter`, `session status`'s first write, `validate`'s drift.
- `hooks/claude/freeflow.mjs`: `readGates`, `gated`, the `tool.check` hook and its `.catch`, the modes in `resolveEnabled`.
- `pi-extension/src/gates/runtime.ts`, wired in `pi-extension/src/index.ts` (`tool_call`, `tool_result`, `turn_start`, session start).

## Tests

- `.skill-eval/track-work/tests/gates5.test.mjs`: `decide` on a table of states and calls for each gate, the classifier, globs, the state each lifecycle command writes, `agree`, the summary's and `estimate --store`'s counts.
- `hooks/claude/freeflow.test.ts`: warn, block and ask, the worker's scope, a missing state, the golden log's delivery line.
- `pi-extension/tests/gates/runtime.test.js`: the runtime, the handlers, and a real Pi session.
- `hooks/tests/codex-driver.test.mjs`: Codex's `PreToolUse` with recorded inputs: warn once per gate per turn and loop, block and delivery denied in the shape Codex's parser accepts, a missing state and an error open under warn and closed under block, the gate lines and the golden log's two.

## Limits

- Codex's `PreToolUse` covers Codex's own tools (`Bash`, `apply_patch`); Codex does not run it for hosted tools such as web search, and a hook it stops at its 2 s timeout is open whatever the mode. Codex's subagents carry no delegation the driver can map (`SubagentStart` has no prompt), so the delegation gate does not fire there and their calls are gated as the main loop's. Cursor, Copilot and Gemini cannot check a call before it runs with Freeflow's hooks.
- Part 4's review gate, the return-point gate and the recovery gate are not built.
- The delivery gate reads the command's text; a script or alias that pushes is not seen.
