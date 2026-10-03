# Getting Started

Freeflow is a portable workflow layer for coding agents. Choose the host that matches the capabilities you need, install the Freeflow package, activate it in a repository, and verify delivery before relying on it.

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
| Pi | Shared skills and the native extension: core prompt, Compaction, and experimental Tool Execution | Cognitive Routing, Tool Execution and Compaction are experimental; native fixtures and live Pi 1.0 sessions exercise them, not every model or provider |

Cognitive Routing is not established merely by configuration or installation. The native Pi source entrypoint is wired, but installed-host dispatch and model behavior require separate evidence. Freeflow's PiFlow integration was removed as a breaking change; use native Pi for the Freeflow extension. Freeflow does not change or uninstall a separate PiFlow installation. See the [Unreleased changelog](../CHANGELOG.md#unreleased).

## Install Freeflow

### Codex

```bash
codex plugin marketplace add https://github.com/hassan-mohiddin/freeflow.git
codex plugin marketplace upgrade freeflow
codex plugin add freeflow@freeflow
```

When Codex asks for hook trust, open `/hooks`, enable the Freeflow hook, and start a new session.

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

Native Pi 0.99.1 is the minimum supported version (peer range `>=0.99.1`); Pi 1.0 is supported and is the development dependency. Earlier Pi versions are unsupported. Scripted host checks and live sessions qualify the named behavior, not provider billing or model quality across models.

## Activate a repository

Run this in the repository where Freeflow should operate:

```text
/setup-freeflow
```

Setup creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. `.freeflow/local.json` is an optional personal override and cannot activate Freeflow by itself.

Freeflow's core guidance and separately editable Interaction Contract are delivered together whenever Freeflow is enabled. The 24 base skills are exposed with that core surface. Cognitive Routing and Tool Execution are optional and off by default; Compaction is on by default. The former Freeflow Context tool, Context Virtualization, and Conversation History are removed; before updating, delete `contextVirtualization` and `conversationHistory` from `.freeflow/config.json` and `.freeflow/local.json` wherever present. Either key makes its config invalid and blocks Freeflow activation until removed.

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

Tool Execution is opt-in, and Compaction is on unless you turn it off:

```json
{
  "toolExecution": { "enabled": true },
  "compaction": { "enabled": true, "carry": true }
}
```

See [Tool Execution](capabilities/tool-execution.md) and [Compaction](capabilities/compaction.md). On Pi, `/freeflow settings` changes all of these for the repository, for you, or for one session.

Setup does not write Freeflow instructions into `AGENTS.md`, `CLAUDE.md`, or other repository-owned host files.

## Verify delivery

Use the host-native surface to confirm the installation:

- **Codex:** trust the hook from `/hooks`, start a new session, and confirm the core Freeflow context is delivered.
- **Claude Code:** reload plugins or start a new session, then use a namespaced Freeflow skill such as `/freeflow:discuss`.
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
- [Architecture](architecture.md)
- [Workflow](workflow.md)
- [Skill routing](skill-routing.md)
- [Release process](release.md)
