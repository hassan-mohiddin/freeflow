# Getting Started

Freeflow is a portable workflow layer for coding agents. Choose the host that matches the capabilities you need, install the Freeflow package, activate it in a repository, and verify delivery before relying on it.

## Choose a host

| Host | Use it for | Cognitive Routing |
| --- | --- | --- |
| Codex | Shared Freeflow skills and lifecycle hook delivery | Not available |
| Claude Code | Shared Freeflow skills and lifecycle hook delivery | Not available |
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
