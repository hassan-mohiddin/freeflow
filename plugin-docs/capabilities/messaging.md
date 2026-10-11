# Messaging

Messaging, a preview on native Pi, lets the agents in your Pi sessions on this machine send each other plain-text messages. Ask one session to tell, ask or answer another ("message session 2 and ask which tests fail there", "tell the api session the schema changed"), and its agent sends the message. The other session's agent gets it between its tool calls, or, when it is idle, at once. Replies come back the same way, so you do not carry results between terminals yourself.

A message is information from another agent, never your instruction. It cannot authorize work, approve an action, answer a dialog or change a setting in the session that receives it. The receiving agent acts on it only within what you already agreed to there; otherwise it tells you what the message asks and waits for you.

## Availability

- Native Pi only, and only between sessions that both have Messaging on and are running on this machine as your user.
- Off by default. Turn it on with the Messaging switch in `/freeflow settings` (Session, Personal or Repository scope), or in `.freeflow/config.json` or `.freeflow/local.json`:

```json
{
  "messaging": { "enabled": true }
}
```

- Needs Freeflow itself to be active in the session.

## Sending

Ask the agent in plain language. It looks up the sessions that can receive, picks the one you mean, and sends the message. Each session is shown by its name: the name Pi gives the session (for example with `pi --name api`), or its folder plus four characters of its session ID. The agent always addresses a session by its session ID, since names can repeat; when it answers a message, it uses the session the message came from.

A session that is not listed is not running with Messaging on and cannot receive. The agent says so rather than looking for another way to reach it.

To hear when the other session has finished, ask the agent to tell you when it is done: you get one notice when that session next goes idle or ends.

## Receiving

What a message does depends on the receiving session:

- **Working:** the message arrives after its current tool calls, and the agent takes it into account in the same run.
- **Idle:** the message starts a turn, so the agent can answer while you are away. Each such turn is a model request you pay for.
- **Started but with no prompt yet:** the message is shown with a notice that the agent reads it with your first prompt, and the sender is told the same. Pi gives a turn that is not started by a prompt no system prompt in a new session, so Freeflow does not start one there.

The agent replies when the message asks something or you want the other session told something. It does not answer acknowledgments, so two sessions do not keep acknowledging each other.

### Ask before delivering

By default every message is delivered. To approve messages first, set **Ask before delivering** in the Messaging section of `/freeflow settings`, or `messaging.inbound`:

| Setting | `messaging.inbound` | Messages from other sessions |
| --- | --- | --- |
| never (default) | `accept` | delivered |
| outside the project | `project` | delivered from sessions in this repository's [Task Memory](task-memory.md) project; you are asked about the rest |
| every message | `hold` | you are asked about each one |
| refuse all | `refuse` | refused |

When you are asked, a dialog shows the sender, its folder and the message (its first 600 characters), with **Deliver** and **Refuse** and a countdown. It closes after 5 minutes. The sender learns the outcome: delivered, refused, or not answered in time. A session without a UI refuses messages it would have asked about. A refusal is the other user's answer: the sending agent does not send it again or try another way in.

## In the transcript

Each step is one line, which expands to the full text:

- `Message → api: <first line>`, then `Delivered to api`, or `Held for api's user to accept`, for a message the agent sent;
- `Message ← api: <first line>` for one it received;
- `Message to api: refused`, or `accepted and delivered`, or `not answered in time`, when a held message's outcome arrives;
- `Session api is now idle` or `Session api has ended`, when a session you asked about finishes.

## Parent and child tasks

With [Task Memory](task-memory.md), a child task you run in its own session can report to its parent when its result is ready, when it is blocked, or when it needs a decision the parent owns. It finds the session that owns the parent task and sends the report there. The parent's agent records the report in the parent's Working Record and tells you; it starts no new work on it unless you have already agreed to that work. Workers that Cognitive Routing manages are not child sessions and do not use messaging.

## Limits

- Plain text, at most 100,000 characters a message.
- A session sends at most 5 messages in 10 seconds. A session takes at most 20 messages a minute from one session, and 50 a minute in all; past that, messages are refused.
- A message's text is not your context: the agent states what the other session needs in the message, and offers larger material (a test log, a diff) rather than pasting it.
- Sessions on other machines, and Pi sessions without Freeflow, cannot be reached.

## Privacy

Each session with Messaging on lists itself in `~/.freeflow/sessions/` (or under `FREEFLOW_HOME`): its session ID, name, folder, process ID, whether it is busy, and its Task Memory project and tasks. The entry is removed when the session ends, and an entry whose process is gone is removed by the next session that lists the others. Messages travel over a socket in your user's temporary directory that only your user can open. Nothing leaves the machine except through each session's own model requests.

## Prompt cache

`send_message` and `list_sessions` are not sent with every request: the agent loads them with Pi's `tool_search` when it first needs them. On Anthropic models and OpenAI Responses models, loading them keeps the prompt cache; on providers such as xAI it costs one cache write in that session. Received messages are appended to the conversation; nothing already sent changes. See [Prompt caching](../prompt-caching.md).

## Evidence limits

Local tests cover delivery between live sessions over real sockets, held messages accepted, refused and expired, addressing by session ID, the limits, the transcript rows, and, in a native Pi session, that the system prompt stays the same while a notice wakes an idle agent, also in a resumed session. Two-session runs on grok-4.7 (medium thinking) in October 2026 checked delivery to busy, idle and not-yet-prompted sessions, replies, idle notices, and that the receiving agent loads the messaging skill. Other models and long real use have not been measured.

## Related documentation

- [Task Memory](task-memory.md)
- [Capabilities](README.md)
- [Pi integration](../integrations/pi.md)
- [How messaging works](../../dev-docs/subsystems/messaging.md) (developer docs)
