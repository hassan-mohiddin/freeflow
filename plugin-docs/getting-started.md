# Getting Started

Freeflow is a feedback-based control system for coding agents: a short always-loaded method and eleven skills that work as a portable layer on every host, and on Pi a native extension. Choose the host that matches the capabilities you need, install the Freeflow package, activate it in a repository, and verify delivery before relying on it.

## Choose a host

| Host | Use it for | Cognitive Routing |
| --- | --- | --- |
| Codex | Shared Freeflow skills and Codex `SessionStart` hook delivery | Not available |
| Claude Code | Shared Freeflow skills and Claude Code `SessionStart` hook delivery | Not available |
| Gemini CLI | Gemini extension, shared skills, and Gemini `SessionStart` hook delivery | Not available |
| Cursor | Agent Plugins 1.0 skills and Cursor-specific `sessionStart` hook delivery | Not available |
| GitHub Copilot / VS Code | Agent Plugins 1.0 skills and Copilot/VS Code `SessionStart` hook delivery | Not available |
| Kiro | Agent Plugins 1.0 Power and shared skills | Not available; no Kiro-specific runtime adapter |
| OpenCode v2 | Canonical `skills/` through the documented project skill source | Not available; skills-only support |
| Hermes Agent | Agent Plugins 1.0 portable package and canonical skills | Not available; skills-only support |
| Pi | Shared skills and the native extension: core prompt, Compaction, experimental Tool Execution, and preview Task Memory | Cognitive Routing, Tool Execution and Compaction are experimental; native fixtures and live Pi 1.0 sessions exercise them, not every model or provider. Task Memory is a preview exercised by native fixtures and scripted sessions |

Cognitive Routing is not established merely by configuration or installation. The native Pi source entrypoint is wired, but installed-host dispatch and model behavior require separate evidence. Freeflow's PiFlow integration was removed as a breaking change; use native Pi for the Freeflow extension. Freeflow does not change or uninstall a separate PiFlow installation. See the [Unreleased changelog](../CHANGELOG.md#unreleased).

## Install Freeflow

### Codex

```bash
codex plugin marketplace add https://github.com/hassan-mohiddin/freeflow.git
codex plugin marketplace upgrade freeflow
codex plugin add freeflow@freeflow
```

Codex installs Freeflow from its npm package, so it needs Node.js and `npm`, and it receives released versions. Then open `/hooks` in Codex, approve the Freeflow hook, and start a new session. Codex silently skips a plugin hook you have not approved, and an update that changes the hook needs approving again. Freeflow 0.7.1 through 0.8.0 shipped no hook Codex could load, so Codex users of those versions got Freeflow's skills but not its session-start guidance; upgrade with `codex plugin marketplace upgrade freeflow` and approve the hook.

### Claude Code

```text
/plugin marketplace add hassan-mohiddin/freeflow
/plugin install freeflow
/reload-plugins
```

Start a new session if the current session predates the plugin installation.

### Gemini CLI

```bash
gemini extensions install https://github.com/hassan-mohiddin/freeflow
```

Gemini CLI copies extensions into its own extension directory. Restart the CLI after installation or updates. The root `gemini-extension.json`, `skills/`, and `hooks/hooks.json` provide the Gemini-specific package surface.

### Cursor

Cursor supports the Agent Plugins 1.0 root `plugin.json` for portable skills and the optional `.cursor-plugin/plugin.json` for Cursor-specific components. Use Cursor’s Customize → Plugins flow to install from a configured marketplace or Git source. The Cursor hook is fire-and-forget at `sessionStart`, so it is context delivery evidence only when observed in the host.

### GitHub Copilot and VS Code

Both hosts can consume the Agent Plugins 1.0 root `plugin.json` and the same `skills/` directory. Copilot CLI can install the repository directly:

```bash
copilot plugin install hassan-mohiddin/freeflow
```

In VS Code, use **Chat: Install Plugin From Source**. The Copilot-specific `com.github.copilot/hooks/hooks.json` adapter is available when plugin hooks are enabled. VS Code hooks are currently a preview feature; local deterministic checks do not establish host dispatch.

### Kiro

Kiro can consume the root Agent Plugins 1.0 package as a Power and activate its bundled shared skills. Use Kiro’s Powers UI or documented GitHub import flow. This package does not add Kiro steering files or a Kiro-specific always-on prompt adapter, so the Kiro claim is skills-only.

### OpenCode

OpenCode v2 discovers project skills from `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`, or a `skills` array in `opencode.json`/`opencode.jsonc`. Point that array at the existing checkout or installed package directory instead of copying the skills:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "skills": ["./node_modules/@hassangameryt/freeflow/skills"]
}
```

OpenCode support is skills-only in this package; no native OpenCode plugin module or always-on Freeflow prompt adapter is claimed.

### Hermes Agent

Hermes supports Agent Plugins 1.0 portable packages. Install and enable the repository through Hermes’s native workflow:

```bash
hermes plugins install hassan-mohiddin/freeflow --no-enable
hermes plugins enable freeflow
```

Hermes can also scan a checkout through its documented `skills.external_dirs` setting or install individual skills from the repository. This package provides the canonical skills surface only; it does not add a Python `plugin.yaml`/`register(ctx)` plugin or Hermes runtime hook.

### Pi

```bash
pi install npm:@hassangameryt/freeflow
```

A Git source is also supported:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

Restart Pi or use `/reload` after installing or updating the package.

Native Pi 0.99.1 is the minimum supported version (peer range `>=0.99.1`); Pi 1.0 and 1.4 are supported, and Pi 1.4.0 is the development dependency. Earlier Pi versions are unsupported. Scripted host checks and live sessions qualify the named behavior, not provider billing or model quality across models.

## Activate a repository

Run this in the repository where Freeflow should operate:

```text
/setup-freeflow
```

Setup creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. `.freeflow/local.json` is an optional personal override and cannot activate Freeflow by itself.

Whenever Freeflow is enabled, Pi delivers all of Freeflow's runtime prompts: the core guidance, the separately editable Interaction Contract, and the Working Method. On other hosts each of these is on by default, and you can turn any of them off with the `prompts` setting (see [Runtime prompts on other hosts](using-freeflow.md#runtime-prompts-on-other-hosts)). The 25 base skills are exposed whenever Freeflow is enabled. Cognitive Routing, Tool Execution and Task Memory are optional and off by default; Compaction is on by default. The former Freeflow Context tool, Context Virtualization, and Conversation History are removed; before updating, delete `contextVirtualization` and `conversationHistory` from `.freeflow/config.json` and `.freeflow/local.json` wherever present. Either key makes its config invalid and blocks Freeflow activation until removed.

Cognitive Routing uses this v2 configuration under `.freeflow/config.json` or `.freeflow/local.json`:

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": true,
    "profiles": {
      "coordinator": { "provider": "openai", "model": "gpt-4o", "thinking": "off" },
      "helper": { "provider": "openai", "model": "gpt-4.1-mini", "thinking": "off" },
      "executor": { "provider": "openai", "model": "gpt-4.1", "thinking": "off" }
    }
  }
}
```

`delegation` accepts `executor`, `helper`, or `both` and defaults to `executor`; `projection` defaults to `true`. Profiles are `coordinator`, `helper`, and `executor`. Coordinator must differ from each worker enabled by the selected mode; Helper and Executor may share a pair. Repository delegation can be overridden personally or for one Pi session without changing repository or personal files. Older experimental routing names or fields such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are unsupported and have no migration; rewrite them manually. Configuration does not establish host availability or model evaluation.

Tool Execution and Compaction are on unless you turn them off, and Task Memory is opt-in:

```json
{
  "toolExecution": { "enabled": true, "guidanceNotices": true },
  "compaction": { "enabled": true, "carry": true },
  "taskMemory": { "enabled": true }
}
```

See [Tool Execution](capabilities/tool-execution.md), [Compaction](capabilities/compaction.md) and [Task Memory](capabilities/task-memory.md). On Pi, `/freeflow settings` changes all of these for the repository, for you, or for one session.

Setup does not write Freeflow instructions into `AGENTS.md`, `CLAUDE.md`, or other repository-owned host files.

## Set up task memory

Work that runs past one compaction, or across sessions and machines, keeps its memory in the Freeflow store: one private Git repository, apart from your code, at `FREEFLOW_HOME` (`~/.freeflow` by default). The first time a task needs memory, the agent asks how to set it up; you can also ask for it with `/setup-freeflow`.

- **Local only:** the store on this device; nothing leaves the machine.
- **Local + cloud:** the same store, kept in step with a private repository on your own GitHub account, so every device and every cloud session has it. Create an empty private repository (for example `freeflow-store`) and give the agent its URL.

If you want neither, the agent works without memory beyond the current compaction. Records you kept before the store, in a repository's `.freeflow/tasks/` or Pi's Task Memory, are copied into it on your word; the originals stay where they are.

**Claude Code cloud sessions.** A cloud session's container is thrown away, so it needs local + cloud. In the cloud environment's settings: add your store repository under Repositories; set `FREEFLOW_HOME` to the folder it is cloned to (`/home/user/` and the repository's name); and load the Freeflow plugin with a setup-script line that clones Freeflow and `CLAUDE_CODE_PLUGIN_DIRS` naming that folder. Select the store as one of the session's repositories when you start a session. If something is missing, Freeflow says what at session start, and whether you or the agent fixes it.

## Verify delivery

Use the host-native surface to confirm the installation:

- **Codex:** trust the hook from `/hooks`, start a new session, and confirm the core Freeflow context is delivered.
- **Claude Code:** reload plugins or start a new session, then use a namespaced Freeflow skill such as `/freeflow:discuss-work`.
- **Gemini CLI:** use `/extensions list` and `/skills`; start or resume a session and confirm the core context is delivered by the Gemini `SessionStart` hook.
- **Cursor:** confirm the installed plugin exposes the shared skills; if hooks are enabled, inspect the session-start result for the shared core context.
- **GitHub Copilot / VS Code:** confirm the installed Agent Plugin exposes the shared skills; if hooks are enabled, inspect the `SessionStart` result for the shared core context.
- **Kiro:** confirm the Power is installed and the shared skills appear in the Agent Steering & Skills surface. Do not infer an always-on prompt adapter from the Power manifest alone.
- **OpenCode v2:** confirm the configured `skills` array points at the canonical `skills/` directory and inspect the native `skill` catalog. Do not infer runtime prompt delivery.
- **Hermes Agent:** confirm the portable package is listed/enabled or the checkout is trusted as a skills source, then inspect the skills catalog. Do not infer runtime prompt delivery from portable package installation.
- **Pi:** use `/freeflow status` to confirm the core prompt, Interaction Contract and base skills, which capabilities are effective, and the compaction cycle; `/freeflow settings` shows each setting and where its value comes from.

Activation is not proof of runtime delivery. Setup reports delivery as `confirmed`, `unavailable`, or `unconfirmed`.

## What to read next

- [Using Freeflow Effectively](using-freeflow.md)
- [Pi integration](integrations/pi.md)
- [Tool Execution](capabilities/tool-execution.md)
- [Compaction](capabilities/compaction.md)
- [Task Memory](capabilities/task-memory.md)
- [Architecture](../dev-docs/README.md)
- [How Freeflow Works](workflow.md)
- [Skill routing](../dev-docs/subsystems/skill-routing.md)
- [Release process](../dev-docs/guides/release.md)
