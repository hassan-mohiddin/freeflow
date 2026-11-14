# The pane and the status line

On Claude Code, Freeflow's mod keeps a status line under the prompt and a pane you open with `/freeflow pane`. With them you see and work your Freeflow store without typing a prompt: pick a project and a task, take it, release it, switch to another, start a new one, look after your workers, read what Freeflow sent the model, and change Freeflow's settings. They need a Freeflow store, and they draw in the terminal and the Desktop app's Code tab; VS Code shows the pane. A cloud session and a `claude -p` run draw neither, so Freeflow reads nothing for them there.

## The status line

```text
Freeflow › freeflow › Memory & orchestration · A-012 · ctx 73% (cycle 3) · 7d 41%
```

The project and the task this session holds, in words; the open agreement's number; how full the context is, with the context cycle in brackets; and the plan's weekly window (on a subscription). The project's words stop at 16 characters and the task's at 24, cut at a word with an ellipsis; a task with a short name shows the short name instead. A task in no project shows no project. With no task held it reads `Freeflow: no task held`. It changes at most once a turn, when one of its values does. Your workers are in the pane, not here.

## The pane

`/freeflow pane` opens it and `/freeflow pane` again or Esc closes it. It asks for 50 columns docked beside the transcript; the terminal docks it in its full-screen layout from 110 columns (a dock takes at most 45% of the terminal, so 50 columns needs about 112), and below that, or on the main screen, opens it above the prompt instead.

At the top, always:

- **Needs you**: each worker's return to read (`[read]` opens it in the pane), then the decisions waiting on the held task's agreement and on your other open tasks (`[show]` lists them). When nothing does, one line, `Nothing needs you`.
- **Now**: the held task's Slice or agreement, the task (`held here` and the agreement's number), a running worker with its minutes, and the context.

Under them, five tabs; `1` to `5` switch them while the pane has the focus, Enter on a row picks it, and a letter acts on what you picked.

| Tab | Shows | Keys |
| --- | --- | --- |
| 1 Projects and tasks | A project picker, then that project's open tasks: `●` held here, who else holds one and when it last synced, `free` or `paused` | On the task you picked: `t` take, `r` release, or `s` switch to it; `n` new task |
| 2 Workers | The held task's delegations, running and returned, with model, effort, minutes and tokens where the event log has them; then what this session and the task have cost, by model | On the worker you picked: `b` brief, `e` return, `v` see now, `c` check, `x` stop |
| 3 Sent | The 20 newest texts Freeflow sent to the model, each opening to its full text | `o` show older (20 more) |
| 4 Settings | The settings' normal view as switches and choices, each with where its value comes from, and a `⋯` menu for the reach of your next change on that row | `d` Developer settings |
| 5 About | Freeflow's version, what is on, and the guide | `g` this guide, in the pane |

What each action does, as the command the agent would run, with your press as the authority; each one that runs adds one line to the conversation saying what you did, so the agent knows:

- **take** runs `task take`. A task another session holds asks you first, then takes it over.
- **release** runs `task release`.
- **switch** moves this session from the task it holds to the one you picked. When work was done under the held task, the switch waits for its checkpoint: the pane asks the agent to checkpoint it, then switch. A task taken and left with nothing done switches at once (`task switch`).
- **new task** asks for a title, then a goal, then runs `task create` in the project the picker shows (or with no project); this session takes the new task. While this session holds a task, that one is released first, after its checkpoint when work was done under it.
- **brief** and **return** open the worker's `brief.md` or `return.md` in the pane, with a link to the file; `q` goes back.
- **see now** shows the worker's own transcript in the main view.
- **check** runs `delegate check-return` on its return.
- **stop** asks you first, then stops the running worker; what it wrote stays in its worktree.
- A settings row's switch or choice runs `/freeflow settings <key> <value>`; by default the change applies everywhere, and `⋯` sets it to only this folder or only this session. **Developer settings** shows what `/freeflow settings --all` lists. A read-only row (such as Review) says where its value comes from instead.

A command that fails shows its error in a small box and changes nothing. A value Freeflow could not read keeps its last good reading, and the pane says `as of <time>; could not read <command>` at its foot.

## Turning them off

```text
/freeflow settings pane.enabled off       the pane: /freeflow pane opens nothing, and the pane's data is not read
/freeflow settings pane.statusLine off    the status line
```

Both are on by default; see [Settings](../settings.md), or the Pane and Status line rows in the pane's Settings tab. With Freeflow itself off (`enabled`), neither shows. With the event log off (`events.enabled`), Sent is empty.

## What it reads

Track Work's script, as JSON, after each turn ends and after each Track Work command the agent runs, never while a request is in flight: `session status` and `project list --json` always (the status line needs them), and while the pane is open `delegate status --json`, `estimate --spent --json`, `events summary --json`, `events sent --json` and the settings script's list. The context, the cost, the plan's windows and the running agents come from Claude Code itself.
