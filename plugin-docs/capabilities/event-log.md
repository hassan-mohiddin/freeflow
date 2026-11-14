# Event log and capabilities

Freeflow keeps a log of what happens in each session's loop, and says what it can do in the session. Both come from Freeflow's driver for the host: Claude Code's mod, Pi's extension and Codex's driver. Cursor, Copilot and Gemini have no driver: there Freeflow delivers its session-start guidance, keeps no log, and says so.

## The event log

One line per event, in `events/<session ID>.jsonl` in the Freeflow home (`FREEFLOW_HOME`, `~/.freeflow` by default):

- the session's start and end, and each turn;
- each model request: the model, its effort, and its tokens (input, cache read and written, output);
- each tool call: the tool, whether it failed, the exit code where the host gives one (Pi does, Claude Code and Codex do not), how long it took, the paths a file tool named, and a shell command's text;
- compactions, and whether Freeflow or the host ran them; workers started and stopped;
- Freeflow's own actions: a notice (with the context of the request that crossed it and the notice point, in tokens), the task menu, a compaction it ran (with the context cycle it ended), a store sync, its claims, and each checkpoint the agent wrote (compact or plain, for the session or a worker's delegation, with the context when the transcript shows it);
- each time a [gate](gates.md) warned or refused (the gate, the tool and the rule), and an agreement recorded with `agree`;
- the text Freeflow itself sent the model, each whole, with what sent it (see [What Freeflow sent the model](#what-freeflow-sent-the-model)).

`events summary` also says how many tokens the context grew from a cycle's notice to the checkpoint that answered it: `Notice to checkpoint: n cycle(s), median …, largest …`. Two limits for now: the measure reads Claude Code's transcript only, so it is Claude Code only (extending it to Pi and Codex is future work); and its two ends differ by about one reply's output, since the notice's context leaves out the last reply's output and the checkpoint's includes it.

A line never holds a prompt, an answer, a file's content or a tool's output, with one exception: a `sent` line holds the whole text Freeflow itself sent the model, which can include the task's record and the files its bundle carried, because Freeflow put that text in front of the model. In a command, keys and tokens (`sk-…`, `ghp_…`, `github_pat_…`, `xox…-`, `AKIA…`, `Bearer …`, and any `…key=`, `…token=`, `…secret=` or `…password=` value) are replaced with `[redacted]` before it is written, in a `sent` line's text too. A command is cut at its first heredoc operator (`<<`), so the text a heredoc writes into a file is never kept, and then cut to 200 characters.

The log stays on this machine: the store's Git ignores `events/`, and nothing in it is sent anywhere or read by the model. What leaves the machine is a summary: at each checkpoint and when a session releases its task, Freeflow writes `events/<session ID>.json` into the task's folder, which the store commits: model requests and tokens by model and effort, tool calls by tool with failures, compactions, workers, the share of tool calls that were Freeflow's own, and how often each gate would have fired.

Freeflow keeps the log until you delete it. Ask the agent, or run Track Work's script yourself:

```text
node <track-work>/scripts/working-record.mjs events summary                 this session's summary, or every log with its size
node <track-work>/scripts/working-record.mjs events summary --session <ID>  another session's
node <track-work>/scripts/working-record.mjs events show [--kind <kind>]    the lines themselves
node <track-work>/scripts/working-record.mjs events sent [--what <name>]    the text Freeflow sent the model, newest first
node <track-work>/scripts/working-record.mjs events sent --show <n>         one of them whole
```

The summary's `Sent: n (by what: …)` line counts that text by source; the task's summary file in the store counts it too, never the text.

## What Freeflow sent the model

Every text Freeflow puts in front of the model is kept as a `sent` line: a notice, a gate's warning or refusal, the session-start guidance and the task menu, a compaction's bundle and its instructions, the rows about a returned delegation or a changed setting, and, on Pi, its system-prompt sections and the Runtime State. Each line says what sent it (`what`: `notice`, `gate`, `menu`, `session-start`, `bundle`, `pinned-guidance`, `system-prompt` and the others `events sent` lists), its length in characters, and the whole text, with keys and tokens redacted. Text every request repeats unchanged, such as the system prompt's sections, is kept once per distinct text in a session, not with every request.

On Claude Code and Pi, `/freeflow sent` lists the same, newest first, and `/freeflow sent <n>` prints entry n whole. On Codex, ask the agent, which runs `events sent`. The list shows each entry's number, time, source, length and first line; the number is what `--show` takes.

These lines follow the event log's switch: with `events.enabled` off, nothing is written, the text is not kept, and `/freeflow sent` shows nothing new. Tool results are not kept: a command's output, an answer to a question and a reply to a message are the tool's own output, which the log does not hold; it records only that the call ran.

The log is on by default. Turn it off with the Event log row in `/freeflow settings` on Pi, `/freeflow settings events.enabled off` on Claude Code, by asking the agent on Codex (it runs Setup Freeflow's settings script), or in a file:

```json
{
  "events": { "enabled": false }
}
```

Off, nothing is written from the next event on (on Codex, from the next session start).

## What Freeflow can do here

Run `/freeflow capabilities` on Claude Code or Pi; on Codex, ask the agent, which runs the same list. Each request Freeflow knows reads `yes` (Freeflow does it here today), `possible` (the host offers it and Freeflow does not use it yet) or `no` (the host cannot), with how or why not:

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

On Claude Code today: `pin` (Freeflow's guidance is a section of the system prompt), `inject`, `compact`, `checkpoint`, `send`, `wake`, `block` (the [gate](gates.md)), `sensors` and `timers` are yes, and `route`, `spawn` and `ask` possible. A headless run (`claude -p`) has no one at the prompt, so `wake` is no and `compact` happens on the next compaction that comes. On Pi: `pin`, `inject`, `compact`, `checkpoint`, `wake`, `ask`, `block`, `sensors` and `timers` are yes; `send` is yes while Messaging is on, and `forget` and `route` are possible: Pi offers the calls, and Freeflow does not use them. On Codex: `pin`, `inject`, `checkpoint`, `block` (the [gates](gates.md), through Codex's `PreToolUse` hook, which does not see hosted tools such as web search) and `sensors` are yes; the rest are no. Codex compacts on its own, so `compact` is no: after Codex's compaction, Freeflow adds the task's record after Codex's summary.

The agent reads the same list with Setup Freeflow's `capabilities.mjs`, and never assumes a request that is not yes. When a request is not available, Freeflow says so instead of doing nothing: `checkpoint --compact` where no driver compacts writes the checkpoint and tells the agent that the host compacts on its own and how to recover after it.
