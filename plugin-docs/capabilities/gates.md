# Gates

Four rules that should always hold, checked by Freeflow before each tool call on Claude Code and Pi. For now every gate only warns: the call runs, the agent reads the rule, why it exists and the way through, and the event log counts how often each gate would have fired. You can move a gate to `block` once its counts say it should refuse.

## The four gates

| Gate | Fires on | Quiet when |
| --- | --- | --- |
| Agreement | a change outside the Freeflow store: a file edit or write, or a shell command that is not on the read-only list | the work has an agreement: the held task's open agreement, or one recorded with `agree` in a session with no task, or an exact spec declared |
| Slice | a change outside the store while the session holds a task | the task has a Slice in progress |
| Delivery | `git commit`, `git push`, `git tag`, `git merge`, `gh pr create`, `gh pr merge`, `npm publish`, `npm version`, `node scripts/release.mjs`, also inside `&&` chains and after `git -C`, `-c` or `env` | never: it reminds the agent that this step needs your own yes |
| Delegation | a worker writing outside its brief's `May write:` line, or writing the task's `record.md`, `decisions.md` or `history.md` | the write is inside the worker's scope (its worktree when the brief names no `May write:`) |

A read is never a change: `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `find`, `git status`, `log`, `diff`, `show` and the other listing commands, `npm test` and the project's `check`, `lint` and `typecheck` scripts. A command Freeflow cannot read (an alias, `bash -c`, a `$(…)`) counts as a change, so a gate may warn on a read; tell us, and the read-only list grows. Track Work's own commands are how the agent records an agreement or a Slice, so they never trip the agreement or Slice gate.

What the agent reads, once per gate in a turn:

```text
Freeflow gate (warn, slice): Edit on src/http/client.ts with no open Slice in freeflow/task-001.
Why: an effect outside the record needs a Slice first, so a lost context can tell what was half done.
Way through: slice start-direct (or slice start), then go on. This gate only warns for now.
```

On Claude Code the row joins the conversation, or goes to the worker that made the call; on Pi it is added to the call's result.

## An agreement without a task

A session that holds no task records the agreement with Track Work's script, which the agent runs:

```text
node <track-work>/scripts/working-record.mjs agree --outcome "Fix the README typo."
node <track-work>/scripts/working-record.mjs agree --outcome "Fix the README typo." --exact-spec "the issue names the line and the fix"
```

`--exact-spec` says your request fixes every choice, so there was nothing to agree; the declaration and its reason go to the event log, for a reviewer to check. With a task, the agreement is the task's (`agreement open`).

## How often each gate would fire

`events summary` counts the gate lines of a session, and `estimate --store` adds them up across every session summary in the store:

```text
Gates: agreement 0, slice 3, delivery 1, delegation 0 would-fire
```

## Settings

Each gate is `off`, `warn` (the default) or `block`, in every scope: the Gates rows of `/freeflow settings` on Pi, `/freeflow settings gates.<gate> <value>` on Claude Code, or a file:

```json
{
  "gates": { "delivery": "block" }
}
```

Under `block` a gate refuses the call with the same text. A delivery step becomes a question to you where someone can answer it (Claude Code's permission dialog, Pi's confirmation), and is refused in a headless run. A gate that cannot read the session's gate state is quiet under `warn` and refuses under `block`, saying to run `task here` or `agree`.

## Where it works

Claude Code (the mod's `tool.check`), Pi (the extension's `tool_call`) and Codex (the driver's `PreToolUse` hook). On Codex a warning reaches the agent as context before the call runs, and under `block` Codex refuses the call with the gate's text; Codex cannot ask you, so a delivery step under `block` is refused there. Codex does not run its hooks for hosted tools such as web search, so the gates do not see those, and Codex reads a gate's setting at session start: a change applies from the next session. Cursor, Copilot and Gemini cannot check a call before it runs with Freeflow's hooks today, so they have no gates; `/freeflow capabilities` (on Codex, `capabilities.mjs list`) says `block` for each host.

The gate state is `sessions/<session ID>/gates.json` in the Freeflow home, written by Track Work's commands as the task, its agreement, its Slice and its delegations change; it stays on this machine.
