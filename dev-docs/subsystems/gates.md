# Gates

> **Covers:** `skills/track-work/scripts/lib/gates5.mjs`, `skills/track-work/scripts/lib/gate-state5.mjs`, `pi-extension/src/gates/`, `hooks/claude/freeflow.mjs`, `hooks/codex/driver.mjs`
> **Tests:** `.skill-eval/track-work/tests/gates5.test.mjs`, `pi-extension/tests/gates/`, `hooks/claude/freeflow.test.ts`, `hooks/tests/codex-driver.test.mjs`
> **Verified at:** `c89031ff` (2026-11-18)
> **User docs:** `plugin-docs/capabilities/gates.md`

For anyone changing Freeflow's gate: the one rule each driver checks before a tool call, the state Track Work keeps for it, and how Claude Code's mod, Codex's driver and Pi's extension run it. The gate only warns and has no setting (D-069).

## Purpose

A worker that writes outside its brief's scope, or to the task's record, breaks the coordinator's picture of the work, and a file another session claims can conflict when the two merge. The delegation gate checks both in code, in the driver, before each tool call, and ships warning only: the agent reads the rule, why, and the way through, and the event log counts each would-fire, so the user decides from data when the gate should refuse (SPEC-008, `specs/gates.md` in task-001's folder).

The agreement, Slice and delivery gates were removed (D-058). They refused on the record's state rather than on what it stood for: in one session they fired on read-only and record-keeping commands. Delivery is left to each harness's own permission prompts. Their old event lines stay readable.

## Vocabulary

- **Gate**: the rule checked before a tool call. One is left, `delegation`. It has no setting (`gates.delegation` is a removed key, D-069) and runs while Freeflow is on.
- **Decision**: `allow` or `warn`, from `gates5.decide`. Never `block`.
- **Changing call**: a file-writing tool (Claude Code's Edit, Write, MultiEdit, NotebookEdit; Pi's `edit`, `write`; `apply_patch`) or a shell command off the read-only list. A shell line the classifier cannot follow counts as changing.
- **Gate state**: `<FREEFLOW_HOME>/sessions/<session>/gates.json`, the few facts the gate needs, written only by Track Work's commands.
- **Would-fire**: a decision that was not `allow`; one `gate` event line each.

## How It Works

**The decision** (`gates5.mjs`). `decide(state, call)` is pure and synchronous and imports nothing, so a mod can import it and a call costs no file read. A call is `{ tool, paths, command, cwd, readOnly, delegation, now }`. The shell classifier (`splitCommand`, `classifyCommand`) splits a line at `&&`, `||`, `;`, `|`, `&`, a newline and parentheses, reads quotes, escapes and here-documents, collects the files a line redirects output to, and strips variable assignments, `env`, `sudo` and the like before the program. A command substitution makes the line changing. A line that runs `working-record.mjs` with a Track Work command is a read (`view`, `validate`, `estimate`, the listings), a write to the worker's own files (`checkpoint --delegation`, `delegate join`, `claim`) or a write to the record; a syntax check (`node --check`) is a read. The gate fires on:

| Rule | Fires on | Unless |
| --- | --- | --- |
| worker scope | a worker's changing call with a path outside its `writes` and its own delegation folder, or one on the task's `record.md`, `decisions.md` or `history.md` (by path, by a redirect, or by a Track Work command that writes) | the call is inside its scope |
| claim | any changing call on a path another session claims (SPEC-009 4.5) | the claim is this session's, its own delegation's in a worker session, or past its time |

Each rule that fires gives `{ gate, decision, reason, way, rule }`; every one is in `fired`, so the driver warns once per turn and logs each. A missing or unreadable state is quiet for the main loop and for a worker alike. `gateText` is the text the agent reads; `gateEvent` the event line's fields.

**The worker's scope** is read from its brief's `May write:` line, which `delegate open --writes` writes. A brief without that line takes its worktree as its scope, and one with neither is a reader that writes only its own folder. The warning says which: `May write: …`, or `no May write line; its worktree is its scope: …`.

**The state** (`gate-state5.mjs`). After `task take | release | switch | create`, `task here --take-back`, `delegate open | close | join` and `claim`, `release`, `store sync`, `working-record.mjs` derives the state again (`gatesAfter`, `refreshGates`) and writes it through a temporary file and a rename: the task the session holds in the store, or else the task whose record the command named; its folder; each open delegation's scope with its folder, and whether its brief has the May write line; in a worker session (`delegate join`), its delegation's task and `worker`, which `decide` takes as the call's delegation; and `claims`, the store's live claims of other sessions with the absolute globs they cover on this machine (`claimsForGates`). `session status`, which every driver runs at session start and at turn ends, writes a state where none exists, and again when a claims file changed after the state was written, so another session's new claim reaches the gate within a turn. An older file's agreement and Slice fields are no longer read or written, and do not make the state invalid (version 1 stays).

**Claude Code** (`hooks/claude/freeflow.mjs`). `tool.check`, after `next(e)` and the store's allow, calls `gated`: it reads the state at most once a turn (`readGates`; reread after a Track Work command seen in `tool.call`), maps a worker's `agentId` to its delegation through the mod's worker map, passes `isReadOnly`, and calls `decide`. The verdict stands; one row per turn is appended (`appendRow`; a worker's goes to it with `$.session.send`). The hook's `.catch` leaves the engine's verdict as it is.

**Codex** (`hooks/codex/driver.mjs`). `PreToolUse` calls `gated`, which reads the state once for the call. The call runs and the rows reach the model as `additionalContext`, once per turn per loop, joined with any reference pointer the call raises (dev-docs README, Reference Pointers). A failure lets the call go.

**Pi** (`pi-extension/src/gates/runtime.ts`). `GateRuntime` loads `gates5.mjs` from Freeflow's package once, reads the state at session start, again after the store's session start (`settled`), and after each `working-record.mjs` command's result, never per call. `tool_call` calls it before Freeflow's other checks while the capability state's `gates.delegation` is on (Freeflow on); it keeps the rows for the call's id and `tool_result` adds them to the result after Tool Execution's notices, with Tool Execution on or off. Pi has no workers, so only the claim rule fires there.

**Measurement** (`events5.mjs`). A `gate` line (`gate`, `decision`, `tool`, `rule`) for every decision that is not allow, under the agent that made the call; `events summary` prints `Gates: delegation N would-fire`, and `estimate --store` totals the same across the store's task folders. The text the gate sends the agent (its warning row, or a refusal's reason) is also kept as a `sent` line under `gate`, whole, on each driver. Lines an older log holds with the removed gates' names still read, and are not counted.

## Decisions

- **The gate only warns, and has no setting** (SPEC-008 P1, P2; settled 2026-11-14, D-069). A warning costs one row and tells the agent the way through; the would-fire counts are the record of what the gate saw. `block` was built and tested; the settled design removes it, so `gates.delegation` is a removed key that `doctor --fix` removes.
- **The removal of three gates** (D-058, Hassan on 2026-11-14): the agreement, Slice and delivery gates were removed with the cost cap. Each stands for a record state, not for what the rule protects, and the delivery gate duplicated each harness's own prompts.
- **One module decides, for every driver** (T1). The rule lives in `gates5.mjs`; the mod imports it, Pi loads it from Freeflow's package, and Codex's driver calls it. It imports nothing, since a mod may import only plugin files, and a pure function is tested on a table.
- **A small state file, written only by Track Work** (T1, section 6). Reading a record per call is out of the question. Each lifecycle command derives the state again from the record, so a change made by hand is set right by the next command, and no message or file the agent reads can open the gate.
- **Workers keyed by delegation, not agent ID**. The agent ID is known only to the driver after the spawn; the mod already maps it to its delegation, so the state holds each delegation's scope by `D-NNN` and the driver looks the worker up.
- **Fail open** (P6, D-069). A sensor and the gate both fail open: a call the gate cannot decide runs. Only a worker's scope needs the state, and without it the call is quiet, with one `freeflow` line.

## Intended Behavior That Looks Wrong

- **A worker's shell command outside its scope does not warn.** A command names no path unless it redirects output; the worker scope rule checks the redirect targets and the record files only.
- **A shell line the classifier cannot follow** (an alias, `bash -c`, `$(…)`, a script) counts as changing; the claim rule then checks the paths it names, and there are none, so it does not warn on them.
- **The claim rule reads a shell command's redirect targets only**, on every driver: a `cp` or `sed -i` onto a claimed path does not warn.

## State

- `<FREEFLOW_HOME>/sessions/<session>/gates.json`, this machine only (the store ignores `sessions/`): `{ v: 1, task, taskDir, delegations: { "D-NNN": { writes, line, worktree, folder, handle } }, worker, claims: [{ id, task, delegation?, session, until, writes }], updated }`.
- In memory: the mod's `gateState` (once a turn), the rows warned in each loop's turn; Codex reads the file per call and keeps its warned rows in `gates-warned.json`; Pi's `GateRuntime` the same in memory.

## Invariants

- No text the agent reads can change a decision; only Track Work's commands write the state (`gates5.test.mjs`, "each lifecycle command writes the session's gate state").
- The gate never changes the verdict or refuses a call (`freeflow.test.ts`, "a removed gates.delegation setting is named and ignored"; `runtime.test.js`; `codex-driver.test.mjs`).
- No setting changes the gate: a file's `gates.delegation` is a removed key, named as ignored (`settings.test.mjs`, "a file holding a removed governor or gate key").

## Failure Behavior

- State missing or unreadable: quiet, with one `freeflow` line; a worker's call is not refused. The gate's text for the missing state still says to run `task here`.
- The mod's hook throws: the `.catch` leaves the engine's verdict as it is. Codex's driver's `catch` lets the call go.
- A state write fails: the lifecycle command still succeeds; the next one writes it.

## Cost

- `decide` is a few string operations per call; no file is read per call on any driver.
- A lifecycle command derives the state again from the record (a `git log` per task for the held task).
- The mod's settings read adds one settings script run at session start and after a settings change.

## Code Map

- `skills/track-work/scripts/lib/gates5.mjs`: `decide`, the shell classifier, paths and globs, `gateText`, `gateEvent`.
- `skills/track-work/scripts/lib/gate-state5.mjs`: `gateState`, `refreshGates`, `readGateState`, `delegationScope`.
- `skills/track-work/scripts/working-record.mjs`: `gatesAfter`, `session status`'s first write.
- `hooks/claude/freeflow.mjs`: `readGates`, `gated`, the `tool.check` hook and its `.catch`.
- `hooks/codex/driver.mjs`: `readGates`, `gated`, `firstWarnings`.
- `pi-extension/src/gates/runtime.ts`, wired in `pi-extension/src/index.ts` (`tool_call`, `tool_result`, `turn_start`, session start).

## Tests

- `.skill-eval/track-work/tests/gates5.test.mjs`: the one gate's decisions on a table of states and calls, the classifier, globs, the state each lifecycle command writes, the summary's and `estimate --store`'s counts.
- `hooks/claude/freeflow.test.ts`: warn, a removed setting named and ignored, the worker's scope, a missing state, the sent log's gate rows, the golden log.
- `pi-extension/tests/gates/runtime.test.js`: the runtime, the handlers, and a real Pi session where the removed gates stay silent.
- `hooks/tests/codex-driver.test.mjs`: Codex's `PreToolUse` with recorded inputs: warn once per turn and loop, a removed setting ignored, a missing state and an error both letting the call go, the gate lines.

## Limits

- Codex's `PreToolUse` covers Codex's own tools (`Bash`, `apply_patch`); a hook Codex stops at its timeout is open. Codex's subagents carry no delegation the driver can map, so their calls are gated as the main loop's. Cursor, Copilot and Gemini cannot check a call before it runs with Freeflow's hooks.
- The delegation gate reads a worker's scope from the brief's `May write:` line only; a brief that writes the scope in prose gets its worktree.
