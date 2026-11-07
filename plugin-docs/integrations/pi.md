# Pi Integration

Freeflow can be packaged for Pi. The native entrypoint wires Freeflow's core prompt and skills, [Tool Execution](../capabilities/tool-execution.md), [Compaction](../capabilities/compaction.md) and [Messaging](../capabilities/messaging.md), and keeps tasks in the Freeflow store as Claude Code does. An unreleased checkout is not a published release.

## Install

Install a released package:

```bash
pi install npm:@hassangameryt/freeflow
```

Or install from Git:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

Restart Pi or use `/reload` after installing or updating so its resources are rediscovered. An installation command is not proof that the native entrypoint was loaded or that a capability is effective.

## Supported Pi evidence

The minimum supported native Pi version is 0.99.1 (peer range `>=0.99.1`); Pi 1.0 and 1.4 are supported, and Pi 1.4.0 is the development dependency. Earlier Pi versions are unsupported. Native scripted fixtures exercise request assembly, Tool Execution and compaction against Pi 1.4.0, and live sessions on Pi 1.0 with GPT-6 Luna and Sol 6.1 exercised compaction and Tool Execution. These checks do not establish provider billing, model quality across models, or publication. The native entrypoint requires the host's public model registry/authentication lookup, native session-entry append/readback, and session ancestry APIs.

## Activate Freeflow

In the repository where Freeflow should operate, run:

```text
/setup-freeflow
```

Without `.freeflow/config.json` Freeflow shows `freeflow: setup needed` and does not run in that folder: the agent is told to set it up with Setup Freeflow. `.freeflow/config.json` is the shared settings file (`{}` is valid), and `"enabled": false` in it or in `.freeflow/local.json` turns Freeflow off. An optional `.freeflow/local.json` provides per-checkout personal overrides. A setting either file holds that Freeflow cannot use is ignored and named, not a reason to turn Freeflow off.

Freeflow's core prompt, the separately editable Interaction Contract and the Working Method are delivered together whenever Freeflow is enabled. The base skills are exposed with that core surface, each with its own command: `/discuss-work`, `/execute-work`, `/verify-work`, `/review-work`, `/deliver-work`, `/track-work`, `/write-docs`, `/setup-freeflow`, `/write-skill` and `/evaluate-behavior` ([How Freeflow Works](../workflow.md#skills)). Compaction and Tool Execution are on by default whenever Freeflow is enabled; Messaging is off. The former Freeflow Context tool, Context Virtualization, and Conversation History have been removed. Before updating, delete `contextVirtualization` and `conversationHistory` from `.freeflow/config.json` and `.freeflow/local.json` wherever present: a config that still has either key ignores it, names it in the footer and `/freeflow status`, and keeps Freeflow on. Cognitive Routing (its profiles, `/freeflow profile`, `/freeflow resume` and the routing shortcuts) is removed as well: delete `cognitiveRouting` from both files, since a config that still sets it is ignored in the same way. `/freeflow settings` opens one screen with three scopes, switched with Tab: Session (this Pi session only), Personal (`.freeflow/local.json`) and Repository (`.freeflow/config.json`). Switches change in place; in the Session and Personal scopes a switch cycles inherit, on and off, and a value the scope does not set reads `(inherited)`, with where it comes from on the line under the list. The Session scope can override Freeflow itself and each capability's switch (Compaction, Tool Execution, Messaging). Session overrides do not change either file; they take precedence over personal and repository settings and can be reset or set to inherit. The footer shows the task the session holds.

Freeflow's PiFlow integration was removed as a breaking change. Use native Pi for the Freeflow extension; Freeflow does not modify or uninstall a separate PiFlow installation. See the [Unreleased changelog](../../CHANGELOG.md#unreleased).

## Questions in a dialog

Whenever Freeflow is enabled, the agent can put a choice that is yours to make into a dialog (`ask_user`) and continue on your answer in the same turn, instead of asking in its reply and stopping. It asks for choices only you can make, such as scope beyond what you asked for, a direction, or how to finish a branch; it does not ask for facts it can look up. Each dialog has one to four questions, each with two to four options and their trade-offs, its recommendation first. In the terminal:

- `↑` `↓` move, `Enter` chooses, and `Space` toggles an option when several may be chosen;
- the last row, **Type my own answer**, takes your own words;
- `n` adds a note to a question;
- `Tab` moves between questions when there are several, then to Submit;
- `Esc` closes the dialog without answering; the agent then does not act on that choice.

In the transcript a question is one line, `Question · <header>: <question>`, and your answer another, `Answered · <header>: <choice>` (or `Closed without answering (Esc)`); expand them to see the options and notes.

In RPC clients each question is a list to pick from. Without a UI (print or JSON mode), the agent asks in its reply instead.

## Tool Execution, Compaction and Messaging configuration

Compaction and Tool Execution are enabled by default; Messaging is disabled by default:

```json
{
  "toolExecution": { "enabled": true },
  "compaction": { "enabled": true },
  "messaging": { "enabled": true, "inbound": "accept" }
}
```

Tool Execution keeps Pi's tools and adds guidance, file tracking, clearer edit errors, `apply_patch`, the background commands `bash_background` and `stop_background`, and `monitor`. It also pushes a few lines of a skill's guidance at the tool call that needs them, such as Deliver Work's commit essentials on a `git commit` result; `toolExecution.guidanceNotices: false` turns these off. The retired v2 keys (`capture`, `programs`, `workspace`, `discovery`, `adapters`, `accounting`) still load and do nothing. See [Tool Execution](../capabilities/tool-execution.md).

Compaction tells the agent once before Pi's own limit; at a safe point the agent checkpoints its task with Track Work's `checkpoint --compact`, and Freeflow replaces the conversation with the task's bundle and continues the run. Pi's compaction stays on as the fallback, with the bundle after its summary. Where the Freeflow store exists, a session gets the task menu at its start and the footer shows the task it holds, and `/freeflow status` has a `store:` line. See [Compaction](../capabilities/compaction.md).

Tasks are kept in the Freeflow store, as on Claude Code. Pi's former Task Memory is gone, with its `/freeflow task`, `/freeflow project` and `/freeflow trash` commands and its `taskMemory` settings, which a configuration may still set and which are ignored; its records move into the store through Setup Freeflow ([Getting Started](../getting-started.md#set-up-task-memory)).

Messaging, a preview, lets the agents in your Pi sessions on this machine send each other messages; `messaging.inbound` (Ask before delivering) chooses whether a message waits for you to accept it: `accept` (the default), `project`, `hold` or `refuse`. See [Messaging](../capabilities/messaging.md).

## Controls

While an effective native host is idle:

```text
/freeflow
/freeflow settings
/freeflow settings local
/freeflow settings repo
/freeflow settings session
/freeflow status
/freeflow compact
```

`/freeflow settings` opens the settings screen on the Personal scope; `/freeflow settings session`, `local` (or `personal`) and `repo` (or `repository`) open it on that scope. [Settings](../settings.md) lists every setting and explains the screen. `/freeflow status` shows the effective state, prompt-cache diagnostics, running background commands and monitors, and the context cycle. `/freeflow compact` asks the agent to prepare and compact now. These commands require an idle host and do not authorize task work.

The legacy context transforms have been removed from the active runtime.

## For developers

What the extension registers, its cache reuse boundaries, and development snapshots are in the developer doc [Pi extension](../../dev-docs/subsystems/pi-extension.md).

## Related documentation

- [Tool Execution](../capabilities/tool-execution.md)
- [Compaction](../capabilities/compaction.md)
- [Messaging](../capabilities/messaging.md)
- [Settings](../settings.md)
- [Freeflow architecture](../../dev-docs/README.md)
- [How Freeflow Works](../workflow.md)
- [Skill routing](../../dev-docs/subsystems/skill-routing.md)
- [Root installation guide](../../README.md#quick-start)
