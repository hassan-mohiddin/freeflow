# Gates

A rule that should always hold, checked by Freeflow before each tool call on Claude Code, Codex and Pi. For now the gate only warns: the call runs, the agent reads the rule, why it exists and the way through, and the event log counts how often it would have fired. You can move it to `block` once its counts say it should refuse.

Freeflow had three more gates, for agreement, Slice and delivery. They were removed (D-058): they checked the state of the record rather than what it stood for, and they fired on read-only and record-keeping commands. Delivery (a commit, push, tag, merge or release) is left to each harness's own permission prompts.

## The delegation gate

| Fires on | Quiet when |
| --- | --- |
| a worker writing outside its brief's `May write:` line, or writing the task's `record.md`, `decisions.md` or `history.md` | the write is inside the worker's scope (its worktree when the brief names no `May write:` line) |
| a file another session claims (Track Work's `claim`) | the claim is the session's own, or it has expired |

The main conversation is not a worker, so only the claim rule applies to it. A read is never a change: `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `find`, `git status`, `log`, `diff`, `show` and the other listing commands, `npm test` and the project's `check`, `lint` and `typecheck` scripts. A command Freeflow cannot read (an alias, `bash -c`, a `$(…)`) counts as a change, so the gate may warn on a read; tell us, and the read-only list grows.

What the agent reads, once per turn:

```text
Freeflow gate (warn, delegation): src/http/client.ts is claimed by freeflow/task-002 D-009 (session 3f1c2a0b…, until 18:00 UTC).
Why: two sessions changing the same files conflict when their work merges.
Way through: ask that session through the harness's message tool, or pick other work. This gate only warns for now.
```

On Claude Code the row joins the conversation, or goes to the worker that made the call; on Codex it is added as context; on Pi it is added to the call's result.

## How often the gate would fire

`events summary` counts the gate lines of a session, and `estimate --store` adds them up across every session summary in the store:

```text
Gates: delegation 3 would-fire
```

## Settings

The gate is `off`, `warn` (the default) or `block`, in every scope: the Gates row of `/freeflow settings` on Pi, `/freeflow settings gates.delegation <value>` on Claude Code, or a file:

```json
{
  "gates": { "delegation": "block" }
}
```

Under `block` the gate refuses the call with the same text. A file that still holds a removed gate's key (`gates.agreement`, `gates.slice`, `gates.delivery`) loads; each key is named as ignored with its reason, and `settings.mjs doctor --fix` removes it. A gate that cannot read the session's gate state, for a worker's call, is quiet under `warn` and refuses under `block`, saying to run `task here`.

## Where it works

Claude Code (the mod's `tool.check`), Codex (the driver's `PreToolUse` hook) and Pi (the extension's `tool_call`). Codex does not run its hooks for hosted tools such as web search, so the gate does not see those, and Codex reads the gate's setting at session start: a change applies from the next session. Cursor, Copilot and Gemini cannot check a call before it runs with Freeflow's hooks today, so they have no gate; `/freeflow capabilities` says `block` for each host.

The gate state is `sessions/<session ID>/gates.json` in the Freeflow home, written by Track Work's commands as the task, its delegations and its claims change; it stays on this machine.
