---
name: setup-freeflow
description: "Use when Freeflow is installed and the user asks to turn it on or off, to change or repair a setting (everywhere, for this folder or for this session, or ticked for one harness), to see what Freeflow's settings are, to set up the Freeflow store that keeps task memory (local only, or local + cloud with a private repository, in a cloud session too) and move older task records into it, or to check whether the current host is loading Freeflow's guidance and skills."
---

# Setup Freeflow

Freeflow works the moment it is installed: in every folder, on every host, with its defaults, and no config file. Setup is for the user's choices, not for activation. Keep three facts separate: the settings the user chose (kept in the Freeflow home, never in the repository), the store that keeps task memory, and what the host delivers at runtime.

- The settings are in the Freeflow home, not in the repository (`FREEFLOW_HOME`, default `~/.freeflow`): `settings.json` (everywhere, the default for a change), `folders.json` (this folder, one entry per repository), and the session's own file. Precedence is session, then this folder, then everywhere, then the default.
- A setting can also be ticked "only on this harness" (`claude-code`, `codex` or `pi`); the harness value wins within its layer.
- `.freeflow/config.json` and `.freeflow/local.json` are no longer read; `settings.mjs doctor` moves their settings to this folder. Freeflow writes nothing into a repository except the project's own review rules. Do not create or append Freeflow instructions in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/` or another host-owned instruction surface.
- Configuration does not prove runtime delivery. Delivery depends on the host's installed and trusted adapter.

Answer setting questions and delivery checks read-only. An explicit request authorizes the smallest selected change. Freeflow runs without setup, so a session never needs a setup step before work.

## Routes

| Situation | Go to |
| --- | --- |
| Turning Freeflow on or off, or changing any setting the user asks for | Change A Setting, below |
| Setting up the Freeflow store for task memory, local only or local + cloud, in a cloud session too; moving a local store to the cloud; moving older records (a repository's `.freeflow/tasks/`, Pi's former Task Memory) into the store | [store setup](references/store-setup.md) |
| Whether the host delivers Freeflow, or which host action refreshes it | Hosts, below |
| A setting the file or the script ignores, or a file that is not JSON | Repair Settings, below |

## Change A Setting

Run [the settings script](scripts/settings.mjs); never edit a settings file by hand:

```text
node <setup-freeflow>/scripts/settings.mjs list [--view normal|developer] [--harness <name>]
node <setup-freeflow>/scripts/settings.mjs get <key> [--harness <name>]
node <setup-freeflow>/scripts/settings.mjs set <key> <value> [--scope everywhere|folder|session] [--harness-only] [--harness <name>]
node <setup-freeflow>/scripts/settings.mjs unset <key> [--scope everywhere|folder|session] [--harness-only] [--harness <name>]
```

- `--scope` defaults to `everywhere`, a change on every folder on this machine. Use `folder` for this repository only, `session` for this session only.
- `--harness-only` ticks the value for one harness: `--harness codex` when you run the script on Codex, `claude-code` on Claude Code. Without `--harness`, the script reads `FREEFLOW_HARNESS`, else Claude Code when its session is named.
- `inherit` (or `unset`) removes the value in that scope, so it follows the next layer down.
- The script refuses a key or value the settings table does not list, and it writes nothing to a layer that holds settings Freeflow ignores; run `doctor` first.
- `list` shows the developer view by default; `--view normal` shows the rows a person changes (Freeflow, Task memory, Review and Workers read only, Status line and Pane on Claude Code).
- Its output names each Runtime State line the change adds or removes; give those to the user, and treat them as the new state.

Task memory is `memory.mode`: `local` (on, this machine, the default), `sync` (on, with the store's private remote) or `off` (no menu, no task offered, nothing recorded). A session's compaction without a task is `compaction.withoutTask`.

### Turning Freeflow off

`enabled` is Freeflow's switch, in any layer or ticked for one harness. Off means Freeflow was never there: it sends nothing, does nothing and writes nothing. Freeflow never disables its own plugin. When the script reports an off value on Claude Code or Codex, give the user the one line it prints, with the harness's own command to disable the plugin (`claude plugin disable freeflow` on Claude Code; on Codex, the uninstall step in `plugin-docs/getting-started.md`, unverified there).

## Repair Settings

`list` names each setting a file ignores, with its file and reason, and each ignored setting keeps its default. `doctor` shows the fix for each, changing nothing:

```text
node <setup-freeflow>/scripts/settings.mjs doctor
node <setup-freeflow>/scripts/settings.mjs doctor --fix
node <setup-freeflow>/scripts/settings.mjs doctor --fix --committed
```

`doctor --fix` removes a removed key (such as `review.mode`), drops an unknown key, resets a wrong value to its default, and moves a repository's `.freeflow/config.json` or `.freeflow/local.json` settings into this folder, naming each. The committed `.freeflow/config.json` is shared, so it is rewritten only with `--committed`, and only after the user agrees. A file that is not JSON is never rewritten: ask the user before replacing it, and name the file. Never discard a setting silently.

A setting Freeflow cannot use is ignored and named; its default applies, and the rest of the file is used. Unsupported keys (`defaultMode`, `interactionContract`, `contextVirtualization`, `conversationHistory`, the removed `review` block, `cognitiveRouting`, `taskMemory`) are ignored and named until the user deletes them; `doctor` shows each.

## Set Up The Store

[Track Work](../track-work/SKILL.md) keeps task memory in the Freeflow store: one private Git repository at `FREEFLOW_HOME`, apart from every code repository. When the user asks to set it up, says yes when Track Work asks, or Freeflow's session start says something is missing for it, follow [store setup](references/store-setup.md): local only or local + cloud, a cloud session's steps, and moving older records. The store's own `.gitignore` keeps `settings.json`, `folders.json` and `first-session.json` out of its commits: they stay on this machine.

## Hosts

When Freeflow is on, host adapters deliver `runtime/prompts/core.md`, `interaction-contract.md` and `working-method.md`, the base Freeflow skill surface, and the Runtime State, each prompt unless its switch is off. Adapters load context only; they do not enforce policy, block tools, grant permissions, or replace repository instructions.

The first session in a user's Freeflow home gets one line, once, saying what Freeflow does and where its guide is.

### Pi

The Pi extension reads the layers before each agent turn. `/freeflow settings` opens the same rows as the settings script, with tabs for **Session**, **This folder** and **Everywhere**; `Tab` switches between them. A change is written at once, and closing the screen after a change reloads the session. A file-level change applies from the next turn; resource discovery waits for `/reload`, which tells the user to run it once after a setup change.

### Claude Code

Freeflow's mod adds `/freeflow settings` (the normal view), `/freeflow settings --all` (Developer settings), and `/freeflow settings <key> <value> [--folder | --session] [--harness-only]`, which changes one through the script; its line reaches the agent at once. `enabled` off stops the mod's task menu, notices, compaction, store sync and event log in the session; turning it on again brings them back from the next event.

### Codex

Codex has no settings command. The user asks the agent, which runs the settings script with `--harness codex`. Freeflow's driver answers the Codex hook events, and Codex runs each only once the user trusts it: after first-time install and after each update, tell the user to open `/hooks` and approve Freeflow's hooks, then start a new session. An unapproved hook is skipped silently.

After a first install or a setting change, tell the user to trigger the least disruptive host-native lifecycle boundary the host supports (a new session, resume, clear or compact); do not prescribe a host command the host lacks.

### What Freeflow Can Do Here

Freeflow's driver for the host writes, at session start, its claims for each request Freeflow knows: `yes` for what it does here today, `possible` for what the host offers and Freeflow does not use yet, `no` for what the host cannot do. Before relying on one, such as Freeflow compacting the session or keeping its event log, run [capabilities](scripts/capabilities.mjs) and use only what it reports as `yes`.

## Establish Same-Turn Context

After a first install or a setting change, apply the guidance for the rest of the turn: read the [Interaction Contract](../../runtime/prompts/interaction-contract.md), the [core guidance](../../runtime/prompts/core.md) and the [Working Method](../../runtime/prompts/working-method.md) when Freeflow is on. These reads do not prove that a host adapter ran at a lifecycle boundary; Hosts, above, says which boundary refreshes it.

## Verify And Report

Verify with the script, not by reading files:

- `list --view normal --json` shows each value and the layer it comes from;
- `doctor` reports nothing to fix, or names each problem and its fix;
- the host's runtime evidence shows the adapter ran for the current lifecycle, when the host exposes it.

Report separately:

1. the value of each changed setting, and the layer or harness tick it is set in;
2. the Runtime State lines the change added or removed;
3. the store state, when the store was touched;
4. automatic runtime delivery as **confirmed**, **unavailable**, or **unconfirmed**, with the host action that refreshes it.
