# Getting Started

Freeflow is a portable workflow layer for coding agents. Choose the host that matches the capabilities you need, install the Freeflow package, activate it in a repository, and verify delivery before relying on it.

## Choose a host

| Host | Use it for | Cognitive Routing |
| --- | --- | --- |
| Codex | Shared Freeflow skills and lifecycle hook delivery | Not available |
| Claude Code | Shared Freeflow skills and lifecycle hook delivery | Not available |
| Pi | Shared skills, Pi extension, and optional Context Virtualization and Conversation History | Configuration is inspectable but execution is disabled |
| PiFlow | PiFlow-hosted Freeflow, including model-state control | Available when configured |

Cognitive Routing requires the separate PiFlow distribution. Installing Freeflow into normal Pi does not enable it.

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

Setup creates the shared `.freeflow/config.json` activation boundary. An optional `.freeflow/local.json` provides personal checkout overrides but cannot activate Freeflow by itself.

Setup does not write Freeflow instructions into `AGENTS.md`, `CLAUDE.md`, or other repository-owned host files.

## Verify delivery

Use the host-native surface to confirm the installation:

- **Codex:** trust the hook from `/hooks`, start a new session, and confirm the Freeflow context is delivered.
- **Claude Code:** reload plugins or start a new session, then use a namespaced Freeflow skill such as `/freeflow:discuss`.
- **Pi:** use `/freeflow` to inspect settings/status and `/freeflow mode workflow` to select a temporary mode.
- **PiFlow:** use `/freeflow` to enable Skills and Cognitive Routing, then configure distinct `standard` and `reasoning` profiles. While idle, use `/freeflow profile standard`, `/freeflow profile reasoning`, or `/freeflow profile auto`.

Activation is not proof of runtime delivery. Setup reports delivery as `confirmed`, `unavailable`, or `unconfirmed`.

## What to read next

- [Pi integration](integrations/pi.md)
- [PiFlow integration](integrations/piflow.md)
- [Architecture](architecture.md)
- [Workflow](workflow.md)
- [Skill routing](skill-routing.md)
- [Release process](release.md)
