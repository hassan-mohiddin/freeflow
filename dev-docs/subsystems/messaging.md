# Messaging

> **Covers:** `pi-extension/src/messaging/`, `capabilities/messaging/`
> **Tests:** `pi-extension/tests/messaging/`

For contributors changing how Freeflow on Pi lets one session message another. Design and decisions: Task 002's spec and its D-005 (`.freeflow/tasks/task-002-*/`, local to the developer's checkout).

## Purpose

Messaging lets the agents of live Pi sessions on one machine talk to each other, as Claude Code's cross-session messaging does: a child task reports to its parent, one session asks another a question, a session waits for another to finish. It is a preview, off by default (`messaging.enabled`), and works only where Freeflow is active.

It deliberately does not:

- reach sessions that are not running, sessions on other machines, or Pi sessions without Freeflow's messaging on;
- make a message an instruction: a message is information from another agent, and cannot answer a dialog, approve, change settings or run a command;
- carry Cognitive Routing's assignments across sessions; that belongs to the subagents design.

## How It Works

**Discovery.** While messaging is effective, the session lists itself in the live registry (`LiveRegistry`, `registry.ts`): one JSON file per session under `<freeflow home>/sessions/` with its session ID, name (Pi's session name, else folder plus four characters of the ID), folder, process ID, socket, busy or idle, its Task Memory project, its focused task and the tasks it owns (read from the task registry's owners, so a child can find its parent's session). The file is written only when it changes (`publish()`), and removed at `session_shutdown` or when messaging turns off. Listing drops entries whose process is gone and deletes them with their sockets.

**Transport.** Each session listens on a Unix socket (`transport.ts`) in `<tmpdir>/freeflow-<uid>/msg/`, mode 0700, named by a hash of the session ID so the path stays under macOS's limit. One request per connection: a line of JSON in, a line of JSON out. The server is `unref()`ed, so it never keeps Pi running by itself.

**Sending.** `send_message` takes one kind of address: a live session's full session ID (`resolve()`). Names, folders, ID fragments and task IDs are refused, with the IDs of the sessions they may mean, so the next call can use one; this session and unknown IDs are errors too. The agent gets IDs from `list_sessions` or from the `session=` of a message it answers; a child finds its parent by the owned task in `list_sessions`. The answer is `delivered`, `held` or `refused`, and the tool result says which. With `notify_when_idle`, the sender asks the receiver to tell it once when it next goes idle or exits; a receiver idle now says so at once.

**Receiving.** `handle()` checks limits, then the inbound policy (`messaging.inbound`, default `accept`; the settings row "Ask before delivering" shows it as never, outside the project, every message, refuse all):

| Policy | Same project | Other or none |
| --- | --- | --- |
| `project` | delivered | held |
| `accept` | delivered | delivered |
| `hold` | held | held |
| `refuse` | refused | refused |

A delivered message goes through the inbound channel as a `freeflow-message` notice ([Ask user and the inbound channel](ask-user.md)): steered in after the current tool batch while the agent works, a new turn when it is idle. It reads `<message from="name" session="id" folder="..." task="...">text</message>`, with attribute values and any closing tag inside the text escaped; held outcomes read `<message-status to=... session=...>` and idle notices `<session-status name=... session=...>`. The tags carry no notice prefix and no authority sentence: the model receives every Pi custom message as a user-role message, so the tag marks the source, and the messaging skill (whose description fires when a message arrives) carries the rules. A held message waits in a queue (at most 100, oldest dropped) and is put to the user one at a time in the `ask_user` dialog (`confirmWithUser()` with Deliver and Refuse and a countdown; Pi's `confirm` with a timeout outside the terminal), which closes after the hold expiry (5 minutes). The sender gets one notice with the outcome: accepted, refused, or not answered in time. Without a UI a held message is refused at once.

**Guidance.** The tools have `deferred` exposure: Pi does not send them until its `tool_search` loads them. While messaging is effective, `applyMessagingTools()` activates `tool_search` (and withdraws it when messaging turns off, only if Freeflow activated it); where Pi has no `tool_search`, it declares the two tools directly. The capability skill `capabilities/messaging/SKILL.md` is listed only while messaging is effective; its description is the trigger (the user asks to contact or answer another session, or a message arrives), and its body says how to load the tools, write and answer messages, and report from a child task. The authority rule is in the skill, in `send_message`'s description and in every delivered notice.

**Busy and idle.** `agent_start` marks the session busy and `agent_settled` idle; turning idle notifies sessions waiting for it.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| Off by default, its own switch, only where Freeflow is active. | A preview that opens a socket and lets other agents' text reach the model; repositories without Freeflow stay plain Pi. | On whenever Freeflow is on, as Claude Code; on wherever the extension loads. | Task 002 D-005 |
| Tools deferred behind `tool_search`; a capability skill, not a system-prompt cue, says how to use them. | Two tool definitions (about 2,000 characters) would be sent on every request; `tool_search` is 615 and the skill's list entry a line. Capabilities are skills under `capabilities/`, like Task Memory and Compaction (user, 2026-10-11). Loading keeps the prompt cache on Anthropic and OpenAI Responses models; elsewhere (xAI) it costs one cache write per session. | `direct` exposure. | Pi v1.1.0 check, Task 002 |
| Unix socket per session, registry files for discovery. | Push delivery as Claude Code on one machine; a closed session cannot receive, so nothing goes stale. | An inbox directory per session (spec O-1). | Task 002 D-001 |
| Default policy: same project delivered, the rest held. | Claude Code compares permission modes, which Pi lacks; a project is the user's own grouping of related sessions. | Accept all; hold all. | Task 002 D-005 |
| Held messages ask at once and expire after 5 minutes; the sender learns the outcome. | As Claude Code; a hold never leaves the sender waiting without an answer. | Asking at the next idle moment; review on demand. | Task 002 D-005 |
| Identity is read from the event context synchronously, busy is tracked from `agent_start`/`agent_settled`. | Pi invalidates a captured context when it replaces the session; asynchronous work must not read it. | Reading `liveHost` in `identity()`. | Native test, Task 002 |
| Messages are delivered by default; approval is a setting. | The user's trial: every message waited for a yes when the two sessions shared no project. | Holding messages from outside the project by default (D-005). | Task 002 D-008 |
| Only a full session ID addresses a session; rows show names. | Names and folders repeat and ID fragments can match two sessions, so one address form avoids delivering to the wrong session (the user, 2026-10-11). A task ID could name an owner whose session ended; `list_sessions` lists only live ones. Rows show the Pi name, else the folder plus four characters of the ID, and a short ID only when no name is known: the result names the session and puts the name in the row's shared render state, so the call line shows it, also after a reload. | Names, folders, ID ends and task IDs as addresses (D-005). | Task 002 D-009 |
| Rows: `send_message` shows `Message → name: first line` and its outcome, a received message `Message ← name: first line`, outcomes and status one line each (`render.ts`, `host/rows.ts`); a long body shows only when expanded. | Pi's own rows; the user asked for collapsed and expanded views. | Raw notice text. | Task 002 D-008 |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| A message to an idle session starts a model turn there. | That is what lets a session react while its user is away; the burst and per-minute limits bound the cost. | Messages wait unseen. |
| A sender's project is taken from its own request. | Every session on the socket folder belongs to the same user; the policy separates the user's projects, not users. | — |
| `list_sessions` and `send_message` are missing from the request until the agent searches. | Deferred exposure; the skill tells the agent to load them. | Every request pays for both definitions. |

## Limits

- Plain text, at most 100,000 characters; at most 5 sends in 10 seconds per sender; a receiver takes at most 20 a minute from one session and 50 a minute in all.
- Not tested live yet across two interactive sessions on every provider; see the task record for live checks.

## Code Map

- `messaging/config.ts`: `resolveMessagingConfig()`, `validateMessagingConfig()`, `InboundPolicy`.
- `messaging/registry.ts`: `LiveRegistry`, `LiveSession`, `alive()`.
- `messaging/transport.ts`: `socketPathFor()`, `listen()`, `request()`, `close()`.
- `messaging/messaging.ts`: `Messaging` (`start`, `stop`, `setBusy`, `resolve`, `send`, `handle`), the limits, `MESSAGE_TYPE`.
- `messaging/tools.ts`: `registerMessagingTools()`, `applyMessagingTools()`.
- `messaging/render.ts`: the transcript rows; `host/rows.ts`: the shared fold (short bodies in both views, long ones when expanded).
- `index.ts`: the host (identity, policy, delivery through `Inbound`, `confirm`, owned tasks), `syncMessaging()` in `status()`, `agent_start`/`agent_settled`, `session_shutdown`.

## Tests

- `tests/messaging/messaging.test.js`: sessions in one process through real sockets: delivery and the notice text, held messages accepted, refused, expired and without a UI, only full IDs addressing a session (other forms refused with the IDs they may mean), `list_sessions` with owned tasks, `notify_when_idle`, limits, stale entries.
- `tests/messaging/render.test.js`: the rows: sent, received, outcomes and status, folding, and the call line showing the session's name from the result instead of its ID.
- `tests/messaging/messaging-native.test.js`: in a real Pi session, `tool_search` active and the tools deferred until loaded, the skill listed, the registry entry, a reload; the tools declared directly without `tool_search`; and nothing of messaging while it is off.
