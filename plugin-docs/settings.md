# Settings

Every Freeflow setting in one place: what Freeflow turns on by default, every setting with its key and values, the three places a setting can live, and what `/freeflow settings` shows on Pi. The capability pages explain what each feature does; this page is the reference to look a setting up in.

## What is on by default

With nothing configured, Freeflow on Pi runs with these capabilities; each one's own settings and their defaults are in the [screen picture](#freeflow-settings) and the [table of all settings](#all-settings).

| Feature | Default | What it is |
| --- | --- | --- |
| Freeflow | on | The core guidance, the Interaction Contract, the Working Method and the skills, plus `ask_user` dialogs |
| [Compaction](capabilities/compaction.md) | on | The agent compacts at a safe point from its own summary; Pi's compaction stays the fallback |
| [Tool Execution](capabilities/tool-execution.md) | on | Working guidance, file tracking, clearer edit errors, `apply_patch`, background commands and monitors |
| [Task Memory](capabilities/task-memory.md) | off | Working Records attached to the session; projects and child tasks |
| [Messaging](capabilities/messaging.md) | off | Messages between the agents in your Pi sessions on this machine |
| [Cognitive Routing](capabilities/cognitive-routing.md) | off | Coordinator, Helper and Executor profiles on different models |

On Codex, Claude Code, Gemini CLI, Cursor and GitHub Copilot only the `enabled` switch, `prompts` and `review` apply; the capabilities above are Pi only.

## Where a setting lives

| Scope | File | Who it affects | Overrides |
| --- | --- | --- | --- |
| Repository | `.freeflow/config.json` | everyone using the repository; commit it to share it | the defaults |
| Personal | `.freeflow/local.json` | only you, in this checkout; Freeflow adds it to `.git/info/exclude` and refuses to write it if Git tracks it | the repository |
| Session | none: kept in the Pi session | only this session | personal and repository |

A setting you leave unset in a scope follows the next scope down: Session follows Personal, Personal follows Repository, Repository follows the default.

## `/freeflow settings`

`/freeflow settings` opens the Personal tab; `/freeflow settings session`, `local` (or `personal`) and `repo` (or `repository`) open that tab. `Tab` switches between them. With nothing configured, the Personal tab looks like this:

```text
Freeflow settings    Session  [Personal]  Repository
  .freeflow/local.json: only you, in this checkout. Overrides the repository.

  › Freeflow                 on (inherited)
    Compaction               on (inherited)
      Context reuse          on (inherited)
    Tool Execution           on (inherited)
    Task Memory              off (inherited)
      Auto-approve           none
    Messaging                off (inherited)
      Ask before delivering  never (inherited)
    Cognitive Routing        off (inherited)
      Delegation             Executor only (inherited)
      Coordinator preset     not configured
      Helper preset          not configured
      Executor preset        not configured
      Context projection     on (inherited)

  Master switch for Freeflow's core guidance, skills, and optional capabilities in this checkout.
  Inherited: not set in any file, so Freeflow's default applies.
  inherit: Inherit Freeflow's default (on).

  ↑↓ move · Enter/Space change · Tab scope · Esc close
```

How to read it:

- **A section's row is its switch.** `Compaction  on` is Compaction's on/off; the indented rows under it are its settings.
- **The value comes first**, `on` in green and `off` in red. `(inherited)` means the tab you are looking at does not set it: the value comes from the tab below it, or is Freeflow's default. The line under the list says which ("Inherited from the repository's .freeflow/config.json."). No bracket means the value is set in this tab. In the Repository tab, `(personal: on)` means your personal file overrides it.
- **Grey means it has no effect right now**, because a switch above it is off; the line under the list says which one ("Takes effect when Messaging is on."). You can still change it, so you can set up, say, routing presets before you turn routing on. Grey settings that the host cannot apply at all (Cognitive Routing on a Pi without model control) do not change.
- **The bracket on a section's row** can also say `not active` (the switch is on but the capability is not running, for example while Freeflow is off) or `unavailable` (this host cannot run it).
- **Changing a value**: `Enter` or `Space` moves to the next value in place; a preset opens a picker for the model and then the thinking level, and Auto-approve opens its five switches on a screen of their own (`Esc` returns). In the Session and Personal tabs the values include `inherit`, which removes the setting from that tab so it follows the scope below.
- **When it is saved**: each change is written at once, one at a time ("Saving…" while it writes). Closing the screen after changing a file setting, or a Session switch (Freeflow or a capability), reloads the session so the change applies; other Session changes (routing presets, Delegation, Control) apply from the next prompt.

## The footer

Pi's footer shows one `freeflow:` line with what changes while you work: Cognitive Routing's state. The other capabilities are settings, shown on the settings screen.

| Footer | Means |
| --- | --- |
| `freeflow: coordinator · automatic · executor mode` | routing running: the profile working now, automatic or a manual hold, and the delegation mode |
| `freeflow: coordinator · pending` | routing starting with the session |
| `… · <model> on next prompt`, `… · model differs` | routing running: a profile change waiting for the next prompt, or a model other than the profile's in use |
| `freeflow: routing blocked · <reason>` | routing on but not running, and why; `· /freeflow profile auto` when releasing a hold would let it run |
| `freeflow: routing inactive` | routing on, but its runtime is inactive in this session |
| `freeflow: on` | Freeflow on, routing off |
| `freeflow: on (all capabilities off)` | Freeflow on, every capability off |
| `freeflow: off`, `freeflow: off (session)` | Freeflow off, in the files or by this session's override |
| `freeflow: unavailable` | Freeflow on, but its packaged guidance cannot be read |
| `freeflow: setup needed`, `freeflow: config error` | no configuration file, or one Freeflow cannot read |

`/freeflow status` gives the full state, with prompt-cache diagnostics, running background commands and the compaction cycle.

## All settings

Keys are paths in `.freeflow/config.json` or `.freeflow/local.json`. The Scopes column says which tabs show the setting.

| Screen row | Key | Values | Default | Scopes |
| --- | --- | --- | --- | --- |
| Freeflow | `enabled` | `true`, `false` | `true` | Session, Personal, Repository |
| Compaction | `compaction.enabled` | `true`, `false` | `true` | Session, Personal, Repository |
| Context reuse | `compaction.carry` | `true`, `false` | `true` | Session, Personal, Repository |
| Tool Execution | `toolExecution.enabled` | `true`, `false` | `true` | Session, Personal, Repository |
| Task Memory | `taskMemory.enabled` | `true`, `false` | `false` | Session, Personal, Repository |
| Auto-approve | — | opens the five switches below on their own screen, and names the ones that are on | none | Personal, Repository |
| Auto-approve › Attach | `taskMemory.autoApprove.attach` | `true`, `false` | `false` | Personal, Repository |
| Auto-approve › Create | `taskMemory.autoApprove.create` | `true`, `false` | `false` | Personal, Repository |
| Auto-approve › Directories | `taskMemory.autoApprove.env` | `true`, `false` | `false` | Personal, Repository |
| Auto-approve › Fan-out | `taskMemory.autoApprove.fanout` | `true`, `false` | `false` | Personal, Repository |
| Auto-approve › Projects | `taskMemory.autoApprove.projects` | `true`, `false` | `false` | Personal, Repository |
| Messaging | `messaging.enabled` | `true`, `false` | `false` | Session, Personal, Repository |
| Ask before delivering | `messaging.inbound` | `accept` (never), `project` (outside the project), `hold` (every message), `refuse` (refuse all) | `accept` | Personal, Repository |
| Cognitive Routing | `cognitiveRouting.enabled` | `true`, `false` | `false` | Session, Personal, Repository |
| Delegation | `cognitiveRouting.delegation` | `executor` (Executor only), `helper` (Helper only), `both` (Helper and Executor) | `executor` | Session, Personal, Repository |
| Context projection | `cognitiveRouting.projection` | `true`, `false` | `true` | Session, Personal, Repository |
| Coordinator preset | `cognitiveRouting.profiles.coordinator` | `{ "provider", "model", "thinking" }` | none | Session, Personal, Repository |
| Helper preset | `cognitiveRouting.profiles.helper` | `{ "provider", "model", "thinking" }` | none | Session, Personal, Repository |
| Executor preset | `cognitiveRouting.profiles.executor` | `{ "provider", "model", "thinking" }` | none | Session, Personal, Repository |
| Control | none | automatic, or hold Coordinator, Helper or Executor | automatic | Session |
| Reset overrides | none | clears every session override | — | Session |
| — | `prompts.core` | `true`, `false` | `true` | Personal, Repository (Codex, Claude Code, Gemini CLI, Cursor, Copilot) |
| — | `prompts.interactionContract` | `true`, `false` | `true` | Personal, Repository (same hosts) |
| — | `prompts.workingMethod` | `true`, `false` | `true` | Personal, Repository (same hosts) |
| — | `review.mode` | `auto`, `off`, `always` | `auto` | Personal, Repository (every host) |
| — | `review.model` | a model name, such as `claude-opus-4-5` | none | Personal, Repository (every host) |

What some of them mean:

- **Auto-approve** switches let the agent take that group of Task Memory actions without asking you: `attach` covers attaching a record and making a held one writable, `create` creating a task or child task, `env` changing a task's directories, `fanout` a child task with its own worktree, `projects` creating or linking a project and importing a record. See [Task Memory](capabilities/task-memory.md#ask-in-plain-language).
- **Ask before delivering** decides whether a message from another session waits for you; `project` delivers messages from sessions in this repository's Task Memory project and asks about the rest. See [Messaging](capabilities/messaging.md#ask-before-delivering).
- **Delegation** chooses which workers automatic routing may use; each needs its preset. A preset's `thinking` is one of the model's thinking levels. See [Cognitive Routing](capabilities/cognitive-routing.md).
- **Control** holds one profile for the session until you release it; it changes only while routing runs. `/freeflow profile` does the same.
- **`prompts`** turns each of Freeflow's session-start prompts on or off on hosts other than Pi; Pi always delivers all of them.
- **`review`** sets when the agent has finished work independently reviewed, by a separate reviewer; the agent's own self-review always runs. `auto` lets Review Work's risk check decide; `off` never starts one on its own, and when the change looks risky the agent proposes a review with its reason and cost and runs it only on your yes; `always` reviews every finished task. `auto` in your personal file returns a shared `off` or `always` to the default. `model` names the model a reviewer runs on, where the host lets the agent choose one; Freeflow passes the name on as written and does not check it. A setting other than the default shows in the agent's Runtime State, such as ``Review: `always`, reviewer model `claude-opus-4-5` ``.

A configuration file with a key Freeflow does not know is refused with an error naming the file. Keys of removed features are still accepted and do nothing: `toolExecution` keys `capture`, `programs`, `workspace`, `discovery`, `adapters` and `accounting`, and the top-level `outputRouter`, `observedRouting` and `scriptTransform` (with `processing` in the personal file). `contextVirtualization` and `conversationHistory` belong to removed context features: a file that still has either is invalid and keeps Freeflow off until you delete them.

## Example

A repository that turns on Task Memory for everyone, with your personal file adding Messaging and one auto-approve switch, and turning Tool Execution off for you:

`.freeflow/config.json`:

```json
{
  "taskMemory": { "enabled": true }
}
```

`.freeflow/local.json`:

```json
{
  "toolExecution": { "enabled": false },
  "messaging": { "enabled": true },
  "taskMemory": { "autoApprove": { "attach": true } }
}
```

## Environment

| Variable | Effect |
| --- | --- |
| `FREEFLOW_HOME` | Where Task Memory's registry and project stores, and Messaging's session list, live. Default `~/.freeflow`. |

## Related documentation

- [Pi integration](integrations/pi.md)
- [Capabilities](capabilities/README.md)
- [Getting Started](getting-started.md)
