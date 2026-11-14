# Settings

Every Freeflow setting in one place: what Freeflow turns on by default, every setting with its key and values, the three places a setting can live, what `/freeflow settings` shows on each host, and the settings script the agent runs on every host. The capability pages explain what each feature does; this page is the reference to look a setting up in.

## What is on by default

Freeflow is on once it is installed. It runs in every folder, on every host, with the defaults below, and no config file or setup step is needed. Freeflow writes nothing into your repository: your settings and rules live in the Freeflow home (`FREEFLOW_HOME`, `~/.freeflow` by default), which Freeflow creates at its first session.

| Feature | Default | What it is |
| --- | --- | --- |
| Freeflow | on | The core guidance, the Interaction Contract, the Working Method and the skills, plus `ask_user` dialogs |
| Task memory | on, this machine | The task menu and the store, kept on this machine; with sync, the store's private remote too; off, no menu and nothing recorded |
| [Compaction](capabilities/compaction.md) | on | After the agent's checkpoint, the task's bundle replaces the conversation; Pi's compaction stays the fallback |
| [Tool Execution](capabilities/tool-execution.md) | on | Working guidance, file tracking, clearer edit errors, `apply_patch`, background commands and monitors, and skill guidance at the tool call that needs it |
| [Messaging](capabilities/messaging.md) | off | Messages between the agents in your Pi sessions on this machine |
| [Gates](capabilities/gates.md) | warn | Four rules checked before each tool call (agreement, Slice, delivery, delegation scope), warning only; also on Claude Code |

On Codex, Claude Code, Gemini CLI, Cursor and GitHub Copilot only the `enabled` switch, Task memory, `prompts` and `skills` apply, on Claude Code `events`, `gates`, `governor` and the pane too, and on Codex `events`; the capabilities above are Pi only. OpenCode reads no settings.

## Where a setting lives

| Layer | Where | Who it affects | Overrides |
| --- | --- | --- | --- |
| Everywhere | `settings.json` in the Freeflow home | every folder on this machine; the default for any change | the defaults |
| This folder | `folders.json` in the Freeflow home, one entry per repository | this repository only, on this machine | Everywhere |
| This session | `sessions/<session ID>/settings.json` in the Freeflow home, never synced; on Pi, the Pi session | only this session; a new session, and `/clear`, start without it | This folder and Everywhere |

Precedence is **session, then this folder, then everywhere, then the default**. A setting you leave unset in a layer follows the next one down.

**Only on this harness** is a tick on any setting, not a layer. A ticked value is kept with the setting, naming the harness it is for (`claude-code`, `codex` or `pi`), and it wins over the layer's general value on that harness only. The other harnesses keep the general value. The ticks show in Developer settings.

The repository's own `.freeflow/config.json` and `.freeflow/local.json` are no longer read. A setting still in one of them is named as ignored, with the reason, until `settings.mjs doctor --fix` moves it to This folder (the Freeflow home's `folders.json`); a committed `config.json` is rewritten only with `doctor --fix --committed`, since it is shared.

## Two views

Settings have two views over one table. The **normal view** has the rows a person changes; **Developer settings** has every row, with its key and the harness tick.

| Normal view row | What it is |
| --- | --- |
| Freeflow | on or off: off, Freeflow was never there |
| Task memory | On, this machine; On, with sync; Off |
| Review (read only) | One reviewer and one round, at the rule's step (default: pull request); the row names the rule's source |
| Workers (read only) | Haiku by default, Opus when the agreement names it; a project's or your delegation rules replace it, and the row names the source |
| Status line | Claude Code only: the status line under the prompt |
| Pane | Claude Code only: `/freeflow pane` |

A change applies everywhere by default. "Only this folder" and "Only this session" are the reach of a change, offered beside it, not rows of their own.

## `/freeflow settings`

On Claude Code, `/freeflow settings` lists the normal view and `/freeflow settings --all` lists Developer settings. A change takes `--folder` or `--session` for its reach, and `--harness-only` for the tick:

```text
/freeflow settings                              the normal view
/freeflow settings --all                        Developer settings
/freeflow settings skills.write-docs off        everywhere (the default for a change)
/freeflow settings skills.write-docs off --folder
/freeflow settings prompts.core off --harness-only
/freeflow settings delegation.claimHours inherit
```

With nothing changed, the normal view looks like this:

```text
Freeflow settings for /home/you/project (Claude Code), normal view
  Freeflow     on        default
  Task memory  On, this machine  default
  Review       One reviewer and one round, at pull request  Freeflow's default
  Workers      Haiku by default · Opus when the agreement names it  Freeflow's default
  Status line  on        default
  Pane         on        default
Change one: /freeflow settings <key> <value> [--folder | --session] [--harness-only]; inherit removes it.
```

The agent sees a change from its next step: a changed Runtime State line is given to it at once. Prompt text the agent already has stays until the next session start or compaction, and the command says so when you change a prompt. `/freeflow settings enabled off` stops the mod's task menu, notices, context rows, compaction, hold and store sync in this session, and turning it on again brings them back from the next event. A file you edit by hand counts from the next session start. The command runs without a model call, and shows in a cloud session too.

**Off** means Freeflow was never there: it sends nothing, does nothing and writes nothing. On Claude Code and Codex, Freeflow cannot disable its own plugin, so an off row shows one line with the harness's own command to disable it: `claude plugin disable freeflow` on Claude Code, and on Codex the uninstall step in the install guide (`plugin-docs/getting-started.md`, unverified there).

On Pi, `/freeflow settings` opens a screen with the same rows. Its tabs are **Session**, **This folder** and **Everywhere**, and `Tab` switches between them. A value a tab does not set reads `(inherited)`, with the line under the list saying which tab it comes from. Each change is written at once, and closing the screen after a change reloads the session so it applies. Codex has no settings command: the user asks the agent, which runs the settings script.

## The settings script

On every host the agent changes a setting when you ask, by running Setup Freeflow's script, with the same rules as Pi's screen:

```text
node <setup-freeflow>/scripts/settings.mjs list [--view normal|developer] [--host pi|claude-code] [--harness <name>] [--json]
node <setup-freeflow>/scripts/settings.mjs get <key> [--harness <name>] [--json]
node <setup-freeflow>/scripts/settings.mjs set <key> <value> [--scope everywhere|folder|session] [--harness-only] [--harness <name>] [--json]
node <setup-freeflow>/scripts/settings.mjs unset <key> [--scope everywhere|folder|session] [--harness-only] [--harness <name>] [--json]
```

`--scope` defaults to `everywhere`. `--harness` names the harness a tick is for; without it, the script reads `FREEFLOW_HARNESS`, else Claude Code when its session is named. `list` defaults to the Developer view; `--view normal` lists the normal view. `--json` gives each row with its key, label, value, the layer it comes from (`everywhere`, `folder`, `session` or `default`), whether it is ticked, its choices and whether it is read only.

It refuses a key or value this page does not list. It writes nothing to a layer that holds settings Freeflow ignores, since writing would drop them: run `doctor` first. An everywhere write drops a value equal to the default; a folder write keeps it, since the folder's value overrides everywhere.

To see what a layer ignores and the fix for each, run the script's `doctor`:

```text
node <setup-freeflow>/scripts/settings.mjs doctor [--fix] [--committed]
```

`doctor` reads each layer against the settings on this page and prints each problem with its fix: a removed key dropped (such as `review.mode`), an unknown key dropped, a wrong value reset to the default, and a repository's `.freeflow/config.json` or `.freeflow/local.json` moved to This folder, naming each setting. It changes nothing unless you give `--fix`. A file that is not JSON is never rewritten: fix it by hand. The committed `.freeflow/config.json` is shared, so it is rewritten only with `--committed`. `doctor` exits `0` when nothing needs fixing, and `1` while a problem remains. The Session layer needs a host that names its session (Claude Code does).

## The footer

Pi's footer shows one `freeflow:` line with what changes while you work: the task this session holds.

| Footer | Means |
| --- | --- |
| `freeflow: task <project>/<task>` | Freeflow on, and the task this session holds in the Freeflow store |
| `freeflow: on` | Freeflow on, holding no task |
| `freeflow: on (all capabilities off)` | Freeflow on, every capability off |
| `freeflow: off`, `freeflow: off (session)` | Freeflow off, in the settings or by this session's override |
| `freeflow: unavailable` | Freeflow on, but its packaged guidance cannot be read |
| `freeflow: on · N setting(s) ignored (settings.mjs doctor)` | Freeflow on; N settings in a file are ignored, each keeping its default |

A settings file that is not JSON, or holds a setting Freeflow cannot use, does not turn Freeflow off: the setting is ignored and named, and the rest of the file is used. `/freeflow status` names each ignored setting and its file, and `settings.mjs doctor` shows the fix.

`/freeflow status` gives the full state, with prompt-cache diagnostics, running background commands and the context cycle.

## All settings

Keys are paths in the Freeflow home's layers (`settings.json`, `folders.json` and the session's file). The Layers column says which layers the setting can be set in: all of them, unless it says otherwise.

| Screen row | Key | Values | Default | Layers |
| --- | --- | --- | --- | --- |
| Freeflow | `enabled` | `true`, `false` | `true` | Everywhere, This folder, This session |
| Task memory | `memory.mode` | `local` (on, this machine), `sync` (on, with the store's remote), `off`: no menu, no task offered, nothing recorded | `local` | Everywhere, This folder, This session |
| Runtime prompts | `prompts.enabled` | `true`, `false`: off leaves all three prompts out | `true` | Everywhere, This folder, This session (every host) |
| Each prompt | — | opens the three switches below on their own screen, and names the ones that are on | all | Everywhere, This folder, This session |
| Each prompt › Core | `prompts.core` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each prompt › Interaction Contract | `prompts.interactionContract` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each prompt › Working Method | `prompts.workingMethod` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Skills | `skills.enabled` | `true`, `false`: off turns every skill but Setup Freeflow off | `true` | Everywhere, This folder, This session (every host) |
| Each skill | — | opens one switch per skill on its own screen, and names the ones that are off | all | Everywhere, This folder, This session |
| Each skill › Deliver Work | `skills.deliver-work` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Discuss Work | `skills.discuss-work` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Evaluate Behavior | `skills.evaluate-behavior` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Execute Work | `skills.execute-work` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Research Work | `skills.research-work` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Review Work | `skills.review-work` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Track Work | `skills.track-work` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Verify Work | `skills.verify-work` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Write Docs | `skills.write-docs` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Each skill › Write Skill | `skills.write-skill` | `true`, `false` | `true` | Everywhere, This folder, This session (every host) |
| Compaction | `compaction.enabled` | `true`, `false` | `true` | Everywhere, This folder, This session |
| Compaction without a task | `compaction.withoutTask` | `true`, `false`: off, Freeflow's compaction runs only while a task is held | `true` | Everywhere, This folder, This session |
| Tool Execution | `toolExecution.enabled` | `true`, `false` | `true` | Everywhere, This folder, This session |
| Guidance notices | `toolExecution.guidanceNotices` | `true`, `false` | `true` | Everywhere, This folder, This session |
| Messaging | `messaging.enabled` | `true`, `false` | `false` | Everywhere, This folder, This session |
| Ask before delivering | `messaging.inbound` | `accept` (never), `project` (outside the project), `hold` (every message), `refuse` (refuse all) | `accept` | Everywhere, This folder, This session |
| Reset overrides | none | clears every session override | — | This session |
| Event log | `events.enabled` | `true`, `false`: off, Freeflow writes no event log | `true` | Everywhere, This folder, This session (Claude Code and Pi) |
| Agreement gate | `gates.agreement` | `off`, `warn`, `block` | `warn` | Everywhere, This folder, This session (Claude Code and Pi) |
| Slice gate | `gates.slice` | `off`, `warn`, `block` | `warn` | Everywhere, This folder, This session (Claude Code and Pi) |
| Delivery gate | `gates.delivery` | `off`, `warn`, `block` | `warn` | Everywhere, This folder, This session (Claude Code and Pi) |
| Delegation gate | `gates.delegation` | `off`, `warn`, `block` | `warn` | Everywhere, This folder, This session (Claude Code and Pi) |
| Claim hours | `delegation.claimHours` | `1`, `2`, `4`, `8`, `24`: how long a claim on paths lasts, renewed while its session syncs | `4` | Everywhere, This folder, This session (Claude Code and Pi) |
| Wake on return | `delegation.wakeOnReturn` | `true`, `false`: a delegation the current Slice waits on wakes the idle session when it comes back | `true` | Everywhere, This folder, This session (Claude Code and Pi) |
| — | `governor.mode` | `warn`, `stop` | `warn` | Everywhere, This folder, This session (Claude Code) |
| — | `governor.cap` | a number above 0: a percent of the seven-day window, or dollars | none | Everywhere, This folder, This session (Claude Code) |
| — | `pane.enabled` | `true`, `false`: off, `/freeflow pane` opens nothing and the pane's data is not read | `true` | Everywhere, This folder, This session (Claude Code only, with `/freeflow settings`) |
| — | `pane.statusLine` | `true`, `false`: off, Freeflow pins no status line under the prompt | `true` | Everywhere, This folder, This session (Claude Code only, with `/freeflow settings`) |

What some of them mean:

- **Task memory** (`memory.mode`) decides whether Freeflow's task memory runs on this machine. `local` is the default: the menu, the held task and the store, kept on this machine. `sync` also syncs the store to your private remote. `off` gives no menu, offers no task and records nothing; a task's budget and the sync remote stay where they are.
- **Compaction without a task** (`compaction.withoutTask`): with a task held, Freeflow's compaction always applies; with none held, this switch decides whether it runs too. Off leaves compaction to the host.
- **Claim hours** (`delegation.claimHours`) is how long a claim on files lasts, 4 hours by default; a claim is renewed while its session keeps syncing and ends when the session releases it, its delegation closes or the session ends. **Wake on return** (`delegation.wakeOnReturn`) is whether a worker's return wakes the session waiting on it when that session is idle; off, the return shows at its next turn instead. See [Workers in separate sessions](capabilities/delegation-sessions.md#claims-on-files).
- **Ask before delivering** decides whether a message from another session waits for you; `project` delivers messages from sessions holding a task in the same Freeflow store project and asks about the rest. See [Messaging](capabilities/messaging.md#ask-before-delivering).
- **Guidance notices** turns off the few lines of skill guidance Tool Execution adds to a tool result that needs them, such as the commit essentials on a `git commit`. See [Tool Execution](capabilities/tool-execution.md#guidance-notices).
- **Runtime prompts** is the switch for all of Freeflow's always-present prompts, and **Each prompt** turns them on or off one by one, on every host: Core (how Freeflow works: the cycle, what authorizes work, where it stops), the Interaction Contract (how the agent talks with you) and the Working Method (how it works). With one off, the agent works without that guidance; the rest of Freeflow stays on. The Tool Execution prompt follows its capability's switch.
- **Skills** is the switch for all of Freeflow's skills but Setup Freeflow, which always stays so you can repair a configuration; **Each skill** turns them off or on one by one. On Pi an off skill is not loaded and its command says it is off. Codex, Claude Code and the other hosts load plugin skills themselves, so there the agent is told, in its Runtime State, not to use an off skill (``Skills off: `write-skill`; do not open or follow them.``); use the host's own setting to remove it completely. The capability skill (Messaging) follows its capability's switch.
- **Event log** (`events.enabled`) is whether Freeflow's driver, Claude Code's mod or the Pi extension, writes what happens in the session's loop to `events/<session>.jsonl` in the Freeflow home: the commands run (with keys and tokens redacted, cut to 200 characters), exit status, the paths file tools named, token counts, compactions and workers, never a prompt, an answer, a file's content or a tool's output. It stays on this machine; a checkpoint commits a short summary of it into the task's folder. Off, nothing is written from the next event, and `/freeflow capabilities` says so.
- **Gates** (`gates.agreement`, `gates.slice`, `gates.delivery`, `gates.delegation`) set each of Freeflow's four gates, checked before each tool call on Claude Code and Pi: `warn` (the default) lets the call run and the agent reads the rule and the way through, once per gate in a turn, and the event log counts it; `block` refuses the call with the same text, a delivery step becoming a question to you where someone can answer; `off` checks nothing. See [Gates](capabilities/gates.md).
- **Review has no settings.** Every pull request gets an independent review by one reviewer, in one round, on top of the agent's own self-review; the agent checks the fixes after it. To review earlier, at every push or every commit, write a `Review at:` line, `Review at: push` or `Review at: commit`, in your own `rules/review.md` in the Freeflow home, or in the project's Review Rules (a `## Review Rules` section of a tracked Markdown file, or a `REVIEW.md`), which win over yours. More reviewers or a stronger reviewer model is the agent's proposal to you, with its reason and cost. The reviewer's model comes from your routing table's review row. See [Review and verification](workflow.md#review-and-verification). A file that still holds the old `review` block (`review.unit`, `review.model`, `review.rounds`, `review.depth`, `review.mode`) keeps loading: each key is ignored and named, and `doctor --fix` removes it.
- **Cost governor** (`governor.mode`) and **Cost cap** (`governor.cap`), on Claude Code: Freeflow's mod watches what the session spends against two caps and tells the agent before a limit surprises you. On a Claude subscription the cap is a daily pace for your seven-day window: what is left of it divided by the days until it resets, against what you used since this day of the window began. With a Working Record whose plan predicts its cost (Track Work's `estimate --plan`), the task's cap is the plan's high end, against the session's cost at API list price; with an API key, dollars are the only measure. At 80% of a cap the agent gets one row naming the cap, the use and when it resets; at 100%, under `warn` it gets one more, and under `stop` it is asked to stop at its next safe point, checkpoint and ask you how to go on. `governor.cap` sets one number in their place: on a subscription a percent of the seven-day window, in place of the daily pace; with an API key, dollars of the session's cost, in place of the task's cap. Each row is also written to the event log, and `events summary` lists them. Pi's screen has no row for these: Pi has no cost governor yet.
- **Pane** (`pane.enabled`) and **Status line** (`pane.statusLine`) are Claude Code's own: Freeflow's mod keeps a status line under the prompt and a pane `/freeflow pane` opens, showing your tasks, the agents working on the held task, what the work costs and the decisions waiting on you (see [the pane](capabilities/pane.md)). Pi's screen has no row for them, since Pi's footer already shows the held task; change them with `/freeflow settings pane.enabled off` on Claude Code.

A settings file with a key Freeflow does not know, or a value wrong for a key it knows, does not turn Freeflow off: the key or value is ignored, its default is used, and the footer and `/freeflow status` name it with its file. Keys of removed features are still accepted and do nothing: `toolExecution` keys `capture`, `programs`, `workspace`, `discovery`, `adapters` and `accounting`, and the top-level `outputRouter`, `observedRouting`, `scriptTransform` and `taskMemory` (with `processing` in the Everywhere file). Pi's old Task Memory is gone, so a `taskMemory` key does nothing, and `/freeflow status` says so. `contextVirtualization` and `conversationHistory` belong to removed context features: a file that still has either ignores it, names it, and Freeflow stays on; delete the key, or let `doctor --fix` remove it.

## Example

A home where Messaging is on for everyone, with this folder asking you about messages from sessions outside the project, and Tool Execution off for this folder only. This is the Freeflow home's `settings.json` and `folders.json`:

`settings.json`:

```json
{
  "messaging": { "enabled": true }
}
```

`folders.json`, keyed by the repository:

```json
{
  "/home/you/project": {
    "toolExecution": { "enabled": false },
    "messaging": { "inbound": "project" }
  }
}
```

## Environment

| Variable | Effect |
| --- | --- |
| `FREEFLOW_HOME` | Where Freeflow's home is: the settings, the first-session marker, and the task store if you make one. Default `~/.freeflow`; `store init` refuses a folder that holds Pi's former Task Memory (`registry.json`), so the store goes in another folder, such as `~/.freeflow-store`. |

## Related documentation

- [Pi integration](integrations/pi.md)
- [Capabilities](capabilities/README.md)
- [Getting Started](getting-started.md)
