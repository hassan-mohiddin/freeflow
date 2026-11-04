# The pane and the status line

On Claude Code, Freeflow's mod keeps a status line under the prompt and a pane you open with `/freeflow pane`. Both show what the Freeflow store already knows: which task this session holds and what else is open, the workers on the held task, what the work costs, and the decisions waiting on you. They need a Freeflow store, and they draw in the terminal and the Desktop app's Code tab; VS Code shows the pane. A cloud session and a `claude -p` run draw nothing, so Freeflow reads nothing for them there. Pi's footer already shows the held task.

## The status line

```text
freeflow/task-001 · A-011 The overnight run · ctx 62% (cycle 12) · 7d 41% · 3 workers, 1 returned
```

The task this session holds and its Slice or open agreement, how full the context is and which context cycle it is in, the plan's weekly window (on a subscription), and the open delegations with how many have returned. With no task held it reads `Freeflow: no task held`. It changes at most once a turn, when one of its values does.

## The pane

`/freeflow pane` opens it, docked beside the transcript in a wide terminal and above the prompt otherwise, and `/freeflow pane` again or Esc closes it. Its keys work while it has the focus: `1` to `4` switch views, Enter on a row selects it, and each view's letters act on the selection.

| View | Shows | Keys |
| --- | --- | --- |
| 1 Tasks | Every open task in the store, one line each, grouped: Needs you (decisions waiting, or a worker returned to this session), Working (held by a session), Idle (free), with who holds each and when it last synced | `o` open, `n` new task, `m` move, `r` release |
| 2 Agents | The coordinator (this session), the held task's open delegations with their sub-workers nested and a returned one marked `← check it`, then the session's other agents; a selected delegation shows its brief, progress and return | `v` view the agent, `s` send a line, `c` check-return |
| 3 Cost | This session's cost and tokens by model and effort, the task's measured Slices and delegations by model and effort at API list price, what the Slices left in Future Work would take, and the plan's windows (five-hour and weekly) with when each resets | |
| 4 Decisions | The open agreement's decision items, those waiting on you and new first | |

Each action runs the command the agent would run, with your press as the authority, and adds one line to the conversation saying what you did, so the agent knows:

- **open** takes the selected task (`task take`). A task another session holds asks before taking it over. While this session holds another task, the pane asks the agent to checkpoint that one first and then switch, since only the agent can write its checkpoint.
- **new task** asks for a title and a goal, then runs `task create` in the project for this folder; this session takes the new task.
- **move** asks for a project (`none` for no project) and runs `task move`.
- **release** ends this session's hold (`task release`).
- **view the agent** shows the selected worker's transcript in the main view; **send a line** sends it a message.
- **check-return** runs `delegate check-return` on the selected delegation.

A command that fails shows its error in a small box and changes nothing. A value Freeflow could not read keeps its last good reading, and the pane says `as of <time>; could not read <command>` at its foot.

## Turning them off

```text
/freeflow settings pane.enabled off       the pane: /freeflow pane opens nothing, and the pane's data is not read
/freeflow settings pane.statusLine off    the status line
```

Both are on by default, in every scope (Session, Personal, Repository); see [Settings](../settings.md). With Freeflow itself off (`enabled`), neither shows.

## What it reads

Track Work's script, as JSON, after each turn ends and after each Track Work command the agent runs, never while a request is in flight: `session status`, `project list --json`, `delegate status --json` and, while the pane is open, `estimate --spent --json`, `estimate --plan --json` and `events summary --json`. The context, the cost and the plan's windows come from Claude Code itself.
