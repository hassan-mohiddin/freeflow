# Workers in separate sessions

A task's coordinator can hand a part of the work to another session, not only to a subagent: for long work that should outlive the coordinator's turn or needs context cycles of its own. The worker gets the same brief, `progress.md` and `return.md` as a subagent, and the same checks when it returns. Track Work's script does this on every host. Claude Code's mod and Pi's extension add the worker session's compaction and the coordinator's wake when a return arrives.

## Starting a session worker

The agent runs `working-record.mjs delegate open --session …`. It prints the command that starts the worker in its own worktree, for example:

```text
Claude Code: cd <worktree> && claude --name D-031 "You are the worker for D-031 of <task>. Run: node …/working-record.mjs delegate join --record <task> --id D-031"
Pi: cd <worktree> && pi --session-name D-031 "…"
```

You or the agent start it; Freeflow does not start sessions itself. In the new session, `delegate join` makes it the worker and prints what it must read first.

A worker's worktree sits in one folder beside its repository, `<repo>.worktrees/D-031-<slug>`, and `delegate close` removes it once the delegation is accepted or stopped, if nothing in it would be lost: no uncommitted or untracked change, no ignored file outside `node_modules/` (removing a worktree deletes its ignored files, and `node_modules/` is reinstalled), and no commit on a detached HEAD that its branch does not hold. The branch stays. A worktree that holds any of these is left in place, and the close says what kept it.

## What a worker session may do

- It holds no task. Commands that write the task's record (`task take`, `checkpoint --record`, `slice …`, `agreement …`, `delegate close`) are refused with "this session works for D-031".
- It keeps `progress.md` with `checkpoint --delegation D-031`, which its compaction uses, and writes `return.md`.
- It may hand parts to its own subagents, never to another session.
- When done, it checks its return (`delegate check-return`) and sends the coordinator one message through the harness's own tool: `SendMessage` on Claude Code, `send_message` on Pi.

## Waiting for a return

A Slice that names the delegation under `Waits on` is waiting for it. When the worker's return is logged, the coordinator gets one line, `D-031 returned (done). S-057 waits on it: check it and close it.` Where the session is idle and can be woken (interactive Claude Code, Pi), that line starts its next turn, unless `delegation.wakeOnReturn` is off. Returns within a minute come as one line.

## The delegation log

Every delegation event is a line in the task folder's `channel.jsonl`: the brief, changes to it, the worker joining, its progress, its return, the outcome. `working-record.mjs delegate log` prints it. When an accepted return lists choices it made under Left open, one per line as `- <choice> -> <what it took>`, they are added to the task's `decisions.md`, so they reach you with the rest of the decisions.

## Claims on files

A session can claim files it is changing: `working-record.mjs claim --paths 'src/**'`. `delegate open --writes` claims the worker's scope for it. Another session that is about to write a claimed file gets a warning from the [delegation gate](gates.md) naming the task, the session and how long the claim lasts. Claims live in the Freeflow store, so with a cloud store they reach your other machines at their next sync.

A claim lasts `delegation.claimHours` (4 hours by default). It is renewed while its session keeps syncing, and ends at `release`, when its delegation is closed, or when its session ends. `claim --list` shows every live claim.

## Settings

| Setting | Values | Default |
| --- | --- | --- |
| `delegation.claimHours` | `1`, `2`, `4`, `8`, `24` | `4` |
| `delegation.wakeOnReturn` | `true`, `false` | `true` |

Both are in every scope ([Settings](../settings.md)).
