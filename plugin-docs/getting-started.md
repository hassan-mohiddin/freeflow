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
| Pi | Shared skills, Pi extension, optional context capabilities, and Cognitive Routing | Available when configured and the official model-state APIs are present |
| PiFlow | PiFlow-hosted Freeflow, including model-state control | Available when configured |

Cognitive Routing works in either Pi or PiFlow when the active host exposes the required model-state APIs.

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

The full normal-Pi integration targets Pi 0.84.3 or newer. Pi 0.84.4 is the current integration test target for Cognitive Routing.

### PiFlow

Install the separate PiFlow host, then install Freeflow into it:

```bash
npm install -g --ignore-scripts @hassangameryt/piflow
piflow install npm:@hassangameryt/freeflow
```

A Git package source is also supported:

```bash
piflow install git:github.com/hassan-mohiddin/freeflow
```

Use `-l` when the package should be recorded in project-local PiFlow settings. Review package source before installation because PiFlow extensions run with host permissions.

## Activate a repository

Run this in the repository where Freeflow should operate:

```text
/setup-freeflow
```

Setup creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. `.freeflow/local.json` is an optional personal override and cannot activate Freeflow by itself.

Freeflow's core guidance and separately editable Interaction Contract are delivered together whenever Freeflow is enabled. The 25 base skills are exposed with that core surface. Context Virtualization, Conversation History, and Cognitive Routing remain individually optional capabilities.

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
- **Pi:** use `/freeflow` to inspect settings/status, confirm the core prompt, Interaction Contract, and base skills, then configure distinct Cognitive Routing profiles when the official model-state APIs are available.
- **PiFlow:** use `/freeflow` to configure Cognitive Routing and distinct `standard` and `reasoning` profiles. While idle, either host supports `/freeflow profile standard`, `/freeflow profile reasoning`, and `/freeflow profile auto`.

Activation is not proof of runtime delivery. Setup reports delivery as `confirmed`, `unavailable`, or `unconfirmed`.

## What to read next

- [Pi integration](integrations/pi.md)
- [PiFlow integration](integrations/piflow.md)
- [Architecture](architecture.md)
- [Workflow](workflow.md)
- [Skill routing](skill-routing.md)
- [Release process](release.md)
