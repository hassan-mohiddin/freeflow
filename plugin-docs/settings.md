# Settings

Every Freeflow setting in one place: what Freeflow turns on by default, every setting with its key and values, the three places a setting can live, what `/freeflow settings` shows on Pi and does on Claude Code, and the settings script the agent runs on every host. The capability pages explain what each feature does; this page is the reference to look a setting up in.

## What is on by default

With nothing configured, Freeflow on Pi runs with these capabilities; each one's own settings and their defaults are in the [screen picture](#freeflow-settings) and the [table of all settings](#all-settings).

| Feature | Default | What it is |
| --- | --- | --- |
| Freeflow | on | The core guidance, the Interaction Contract, the Working Method and the skills, plus `ask_user` dialogs |
| [Compaction](capabilities/compaction.md) | on | After the agent's checkpoint, the task's bundle replaces the conversation; Pi's compaction stays the fallback |
| [Tool Execution](capabilities/tool-execution.md) | on | Working guidance, file tracking, clearer edit errors, `apply_patch`, background commands and monitors, and skill guidance at the tool call that needs it |
| [Messaging](capabilities/messaging.md) | off | Messages between the agents in your Pi sessions on this machine |
| [Cognitive Routing](capabilities/cognitive-routing.md) | off | Coordinator, Helper and Executor profiles on different models |

On Codex, Claude Code, Gemini CLI, Cursor and GitHub Copilot only the `enabled` switch, `prompts`, `skills` and `review` apply, and on Claude Code `events` too; the capabilities above are Pi only. OpenCode reads no settings.

## Where a setting lives

| Scope | File | Who it affects | Overrides |
| --- | --- | --- | --- |
| Repository | `.freeflow/config.json` | everyone using the repository; commit it to share it | the defaults |
| Personal | `.freeflow/local.json` | only you, in this checkout; Freeflow adds it to `.git/info/exclude` and refuses to write it if Git tracks it | the repository |
| Session | none on Pi: kept in the Pi session; elsewhere `sessions/<session ID>/settings.json` in `FREEFLOW_HOME`, never synced | only this session; a new session, and `/clear`, start without it | personal and repository |

A setting you leave unset in a scope follows the next scope down: Session follows Personal, Personal follows Repository, Repository follows the default.

## `/freeflow settings`

`/freeflow settings` opens the Personal tab; `/freeflow settings session`, `local` (or `personal`) and `repo` (or `repository`) open that tab. `Tab` switches between them. With nothing configured, the Personal tab looks like this:

```text
Freeflow settings    Session  [Personal]  Repository
  .freeflow/local.json: only you, in this checkout. Overrides the repository.

  › Freeflow                 on (inherited)
    Runtime prompts          on (inherited)
      Each prompt            all
    Skills                   on (inherited)
      Each skill             all
    Compaction               on (inherited)
    Tool Execution           on (inherited)
      Guidance notices       on (inherited)
    Messaging                off (inherited)
      Ask before delivering  never (inherited)
    Cognitive Routing        off (inherited)
      Delegation             Executor only (inherited)
      Coordinator preset     not configured
      Helper preset          not configured
      Executor preset        not configured
      Context projection     on (inherited)
    Event log                on (inherited)
    Review                   auto (inherited)
      Reviewer model         not configured

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
- **Changing a value**: `Enter` or `Space` moves to the next value in place; a preset opens a picker for the model and then the thinking level, Reviewer model opens a picker of your authenticated models, and Each prompt and Each skill open their switches on a screen of their own (`Esc` returns). The list scrolls when it is taller than the screen; `(5/21)` under it says where you are. In the Session and Personal tabs the values include `inherit`, which removes the setting from that tab so it follows the scope below.
- **When it is saved**: each change is written at once, one at a time ("Saving…" while it writes). Closing the screen after changing a file setting, or a Session switch (Freeflow or a capability), reloads the session so the change applies; other Session changes (routing presets, Delegation, Control) apply from the next prompt.

## On Claude Code

Freeflow's mod adds `/freeflow settings`. With nothing set it shows:

```text
Freeflow settings for /home/you/project (Claude Code)
  Freeflow         on        default
  Runtime prompts  on        default
  Skills           on        default
  Event log        on        default
  Review           auto      default
  Reviewer model   none      default
Set one: /freeflow settings <key> <value> [--session | --personal | --repository]  (Personal by default)
Remove one: /freeflow settings <key> inherit [--session | --personal | --repository]
Keys: enabled, prompts.enabled, prompts.<prompt>, skills.enabled, skills.<skill>, events.enabled, review.mode, review.model.
Pi-only settings (tool execution, compaction, messaging, Cognitive Routing) are changed on Pi or in the files.
```

A setting another scope sets is listed too, with its key. `/freeflow settings review.mode always` answers `Review: always, from .freeflow/local.json (Personal). The agent sees it now.`, and the agent works under the Runtime State line it changed from its next step. Prompt text the agent already has stays until the next session start or compaction, so the cached prompt is never rewritten; the command says so when you change a prompt. `/freeflow settings enabled off` also stops the mod's task menu, notices, context rows, compaction, hold and store sync in this session; turning it on again brings them back from the next event. A file you edit by hand counts from the next session start. The command runs without a model call, and shows in a cloud session too.

## The settings script

On every host the agent changes a setting when you ask by running Setup Freeflow's script, the one writer outside Pi's screen, with the same rules:

```text
node <setup-freeflow>/scripts/settings.mjs list [--host pi] [--json]
node <setup-freeflow>/scripts/settings.mjs get <key> [--json]
node <setup-freeflow>/scripts/settings.mjs set <key> <value> --scope repository|personal|session [--json]
node <setup-freeflow>/scripts/settings.mjs unset <key> --scope repository|personal|session [--json]
```

It refuses a key or value this page does not list, and writes nothing while either file is invalid. A Repository write drops a value equal to the default; a Personal write keeps it, so your file can set the default over a shared value. After a change it prints the Runtime State lines that changed, so the agent knows at once; the session-start hook reads the files again at the next session start, resume, `/clear` or compaction. The Session scope needs a host that names its session (Claude Code does); a routing preset is set on Pi's screen only.

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

`/freeflow status` gives the full state, with prompt-cache diagnostics, running background commands and the context cycle.

## All settings

Keys are paths in `.freeflow/config.json` or `.freeflow/local.json`. The Scopes column says which tabs show the setting.

| Screen row | Key | Values | Default | Scopes |
| --- | --- | --- | --- | --- |
| Freeflow | `enabled` | `true`, `false` | `true` | Session, Personal, Repository |
| Runtime prompts | `prompts.enabled` | `true`, `false`: off leaves all three prompts out | `true` | Session, Personal, Repository (every host) |
| Each prompt | — | opens the three switches below on their own screen, and names the ones that are on | all | Session, Personal, Repository |
| Each prompt › Core | `prompts.core` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each prompt › Interaction Contract | `prompts.interactionContract` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each prompt › Working Method | `prompts.workingMethod` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Skills | `skills.enabled` | `true`, `false`: off turns every skill but Setup Freeflow off | `true` | Session, Personal, Repository (every host) |
| Each skill | — | opens one switch per skill on its own screen, and names the ones that are off | all | Session, Personal, Repository |
| Each skill › Deliver Work | `skills.deliver-work` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Discuss Work | `skills.discuss-work` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Evaluate Behavior | `skills.evaluate-behavior` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Execute Work | `skills.execute-work` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Research Work | `skills.research-work` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Review Work | `skills.review-work` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Track Work | `skills.track-work` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Verify Work | `skills.verify-work` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Write Docs | `skills.write-docs` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Each skill › Write Skill | `skills.write-skill` | `true`, `false` | `true` | Session, Personal, Repository (every host) |
| Compaction | `compaction.enabled` | `true`, `false` | `true` | Session, Personal, Repository |
| Tool Execution | `toolExecution.enabled` | `true`, `false` | `true` | Session, Personal, Repository |
| Guidance notices | `toolExecution.guidanceNotices` | `true`, `false` | `true` | Session, Personal, Repository |
| Messaging | `messaging.enabled` | `true`, `false` | `false` | Session, Personal, Repository |
| Ask before delivering | `messaging.inbound` | `accept` (never), `project` (outside the project), `hold` (every message), `refuse` (refuse all) | `accept` | Session, Personal, Repository |
| Cognitive Routing | `cognitiveRouting.enabled` | `true`, `false` | `false` | Session, Personal, Repository |
| Delegation | `cognitiveRouting.delegation` | `executor` (Executor only), `helper` (Helper only), `both` (Helper and Executor) | `executor` | Session, Personal, Repository |
| Context projection | `cognitiveRouting.projection` | `true`, `false` | `true` | Session, Personal, Repository |
| Coordinator preset | `cognitiveRouting.profiles.coordinator` | `{ "provider", "model", "thinking" }` | none | Session, Personal, Repository |
| Helper preset | `cognitiveRouting.profiles.helper` | `{ "provider", "model", "thinking" }` | none | Session, Personal, Repository |
| Executor preset | `cognitiveRouting.profiles.executor` | `{ "provider", "model", "thinking" }` | none | Session, Personal, Repository |
| Control | none | automatic, or hold Coordinator, Helper or Executor | automatic | Session |
| Reset overrides | none | clears every session override | — | Session |
| Event log | `events.enabled` | `true`, `false`: off, Freeflow writes no event log | `true` | Session, Personal, Repository (Claude Code and Pi) |
| Review | `review.mode` | `auto`, `off`, `always` | `auto` | Session, Personal, Repository (every host) |
| Reviewer model | `review.model` | a model name, such as `claude-opus-4-5` | none | Session, Personal, Repository (every host) |
| — | `pane.enabled` | `true`, `false`: off, `/freeflow pane` opens nothing and the pane's data is not read | `true` | Session, Personal, Repository (Claude Code only, with `/freeflow settings`) |
| — | `pane.statusLine` | `true`, `false`: off, Freeflow pins no status line under the prompt | `true` | Session, Personal, Repository (Claude Code only, with `/freeflow settings`) |

What some of them mean:

- **Ask before delivering** decides whether a message from another session waits for you; `project` delivers messages from sessions holding a task in the same Freeflow store project and asks about the rest. See [Messaging](capabilities/messaging.md#ask-before-delivering).
- **Delegation** chooses which workers automatic routing may use; each needs its preset. A preset's `thinking` is one of the model's thinking levels. See [Cognitive Routing](capabilities/cognitive-routing.md).
- **Control** holds one profile for the session until you release it; it changes only while routing runs. `/freeflow profile` does the same.
- **Guidance notices** turns off the few lines of skill guidance Tool Execution adds to a tool result that needs them, such as the commit essentials on a `git commit`. See [Tool Execution](capabilities/tool-execution.md#guidance-notices).
- **Runtime prompts** is the switch for all of Freeflow's always-present prompts, and **Each prompt** turns them on or off one by one, on every host: Core (how Freeflow works: the cycle, what authorizes work, where it stops), the Interaction Contract (how the agent talks with you) and the Working Method (how it works). With one off, the agent works without that guidance; the rest of Freeflow stays on. The Cognitive Routing and Tool Execution prompts follow their capability's switch.
- **Skills** is the switch for all of Freeflow's skills but Setup Freeflow, which always stays so you can repair a configuration; **Each skill** turns them off or on one by one. On Pi an off skill is not loaded and its command says it is off. Codex, Claude Code and the other hosts load plugin skills themselves, so there the agent is told, in its Runtime State, not to use an off skill (``Skills off: `write-skill`; do not open or follow them.``); use the host's own setting to remove it completely. The capability skills (Compaction, Cognitive Routing, Messaging) follow their capability's switch.
- **Event log** (`events.enabled`) is whether Freeflow's driver, Claude Code's mod or the Pi extension, writes what happens in the session's loop to `events/<session>.jsonl` in the Freeflow home: the commands run (with keys and tokens redacted, cut to 200 characters), exit status, the paths file tools named, token counts, compactions and workers, never a prompt, an answer, a file's content or a tool's output. It stays on this machine; a checkpoint commits a short summary of it into the task's folder. Off, nothing is written from the next event, and `/freeflow capabilities` says so.
- **Pane** (`pane.enabled`) and **Status line** (`pane.statusLine`) are Claude Code's own: Freeflow's mod keeps a status line under the prompt and a pane `/freeflow pane` opens, showing your tasks, the agents working on the held task, what the work costs and the decisions waiting on you (see [the pane](capabilities/pane.md)). Pi's screen has no row for them, since Pi's footer already shows the held task; change them with `/freeflow settings pane.enabled off` on Claude Code, or in the files.
- **Review** (`review.mode`) and **Reviewer model** (`review.model`) set when the agent has finished work independently reviewed, by a separate reviewer; the agent's own self-review always runs. `auto` lets Review Work's risk check decide; `off` never starts one on its own, and when the change looks risky the agent proposes a review with its reason and cost and runs it only on your yes; `always` reviews every finished task. `auto` in your personal file returns a shared `off` or `always` to the default. Reviewer model names the model a reviewer runs on, where the host lets the agent choose one; Freeflow passes the name on as written and does not check it. The screen offers this Pi's authenticated models; on another host, write the name that host uses into the file. A Session value applies on Pi only, to this session. A setting other than the default shows in the agent's Runtime State, such as ``Review: `always`, reviewer model `claude-opus-4-5` ``.

A configuration file with a key Freeflow does not know is refused with an error naming the file. Keys of removed features are still accepted and do nothing: `toolExecution` keys `capture`, `programs`, `workspace`, `discovery`, `adapters` and `accounting`, and the top-level `outputRouter`, `observedRouting`, `scriptTransform` and `taskMemory` (with `processing` in the personal file). Pi's Task Memory is gone, so a `taskMemory` key does nothing, and `/freeflow status` says so. `contextVirtualization` and `conversationHistory` belong to removed context features: a file that still has either is invalid and keeps Freeflow off until you delete them.

## Example

A repository that turns on Messaging for everyone, with your personal file asking you about messages from sessions outside the project, and turning Tool Execution off for you:

`.freeflow/config.json`:

```json
{
  "messaging": { "enabled": true }
}
```

`.freeflow/local.json`:

```json
{
  "toolExecution": { "enabled": false },
  "messaging": { "inbound": "project" }
}
```

## Environment

| Variable | Effect |
| --- | --- |
| `FREEFLOW_HOME` | Where the Freeflow store and Messaging's session list live. Default `~/.freeflow`; `store init` refuses that folder while it holds Pi's former Task Memory (`registry.json`), so the store goes in another folder, such as `~/.freeflow-store`. |

## Related documentation

- [Pi integration](integrations/pi.md)
- [Capabilities](capabilities/README.md)
- [Getting Started](getting-started.md)
