# Event log and capabilities

Freeflow keeps a log of what happens in each session's loop, and says what it can do in the session. Both come from Freeflow's driver for the host: Claude Code's mod and Pi's extension. Codex, Cursor, Copilot and Gemini have no driver: there Freeflow delivers its session-start guidance, keeps no log, and says so.

## The event log

One line per event, in `events/<session ID>.jsonl` in the Freeflow home (`FREEFLOW_HOME`, `~/.freeflow` by default):

- the session's start and end, and each turn;
- each model request: the model, its effort, and its tokens (input, cache read and written, output);
- each tool call: the tool, whether it failed, the exit code where the host gives one (Pi does, Claude Code does not), how long it took, the paths a file tool named, and a shell command's text;
- compactions, and whether Freeflow or the host ran them; workers started and stopped;
- Freeflow's own actions: a notice, a context row, the task menu, a compaction it ran, a store sync, its claims;
- each time a [gate](gates.md) warned, asked or refused (the gate, the tool and the rule), and an agreement recorded with `agree`.

A line never holds a prompt, an answer, a file's content or a tool's output. In a command, keys and tokens (`sk-…`, `ghp_…`, `github_pat_…`, `xox…-`, `AKIA…`, `Bearer …`, and any `…key=`, `…token=`, `…secret=` or `…password=` value) are replaced with `[redacted]` before it is written, and the command is cut to 200 characters.

The log stays on this machine: the store's Git ignores `events/`, and nothing in it is sent anywhere or read by the model. What leaves the machine is a summary: at each checkpoint and when a session releases its task, Freeflow writes `events/<session ID>.json` into the task's folder, which the store commits: model requests and tokens by model and effort, tool calls by tool with failures, compactions, workers, the share of tool calls that were Freeflow's own, and how often each gate would have fired.

Freeflow keeps the log until you delete it. Ask the agent, or run Track Work's script yourself:

```text
node <track-work>/scripts/working-record.mjs events summary                 this session's summary, or every log with its size
node <track-work>/scripts/working-record.mjs events summary --session <ID>  another session's
node <track-work>/scripts/working-record.mjs events show [--kind <kind>]    the lines themselves
```

The log is on by default. Turn it off with the Event log row in `/freeflow settings` on Pi, `/freeflow settings events.enabled off` on Claude Code, or in a file:

```json
{
  "events": { "enabled": false }
}
```

Off, nothing is written from the next event on.

## What Freeflow can do here

Run `/freeflow capabilities` on Claude Code or Pi. Each request Freeflow knows reads `yes` (Freeflow does it here today), `possible` (the host offers it and Freeflow does not use it yet) or `no` (the host cannot), with how or why not:

| Request | What it is |
| --- | --- |
| `pin` | keep a section of the prompt fixed |
| `inject` | add a line the agent reads mid-session |
| `forget` | leave earlier messages out of a request |
| `compact` | Freeflow's own compaction, with the task's bundle in place of the summary |
| `checkpoint` | save the task's state before a compaction |
| `rewind` | move the conversation back |
| `route` | change the model or effort |
| `spawn` | start an agent |
| `send`, `wake` | message another agent; start a turn with no prompt from you |
| `ask` | ask you a question in a dialog |
| `block` | refuse a tool call with its reason |
| `sensors`, `timers` | write the event log; act after a delay |

On Claude Code today: `inject`, `compact`, `checkpoint`, `send`, `wake`, `block` (the [gates](gates.md)), `sensors` and `timers` are yes, and `pin`, `route`, `spawn` and `ask` possible. A headless run (`claude -p`) has no one at the prompt, so `wake` is no and `compact` happens on the next compaction that comes. On Pi: `pin`, `inject`, `compact`, `checkpoint`, `wake`, `ask`, `block`, `sensors` and `timers` are yes; `send` is yes while Messaging is on, and `forget` and `route` are possible: Pi offers the calls, and Freeflow does not use them.

The agent reads the same list with Setup Freeflow's `capabilities.mjs`, and never assumes a request that is not yes. When a request is not available, Freeflow says so instead of doing nothing: `checkpoint --compact` where no driver compacts writes the checkpoint and tells the agent that the host compacts on its own and how to recover after it.
