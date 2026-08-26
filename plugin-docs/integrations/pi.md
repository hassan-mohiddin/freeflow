# Pi Integration

Freeflow can run as a Pi package. Normal Pi provides the Freeflow extension host, mandatory core prompt delivery, discoverable base skills, and optional context capabilities, but it does not provide the host controls required by Cognitive Routing.

## Install

Install the published package:

```bash
pi install npm:@hassangameryt/freeflow
```

Or install from Git:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

Restart Pi or use `/reload` after installing or updating the package so its resources are rediscovered.

## Activate Freeflow

In the repository where Freeflow should operate, run:

```text
/setup-freeflow
```

Setup creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. An optional `.freeflow/local.json` provides per-checkout personal overrides; it cannot activate Freeflow by itself.

Freeflow's core prompt and separately editable Interaction Contract are delivered together whenever Freeflow is enabled. The 25 base skills are exposed with that core surface. Context Virtualization and Conversation History remain independently optional capabilities.

Pi stores temporary enablement and optional-context overrides in branch-aware session state. Session overrides do not replace repository activation or silently edit the shared configuration.

## What normal Pi provides

When effective, the Freeflow package provides:

- the 25-skill model/contributor surface, including Workflow and Action Selection;
- the mandatory `runtime/prompts/core.md` and `runtime/prompts/interaction-contract.md` fragments;
- per-provider Runtime State;
- optional Context Virtualization for archiving consumed tool results;
- optional Conversation History for bounded current-branch recovery;
- the `/freeflow` settings and status surface.

Full skill bodies are discoverable rather than injected as persistent bootstrap text. Freeflow context loading guides the model but does not enforce policy, grant permissions, or replace repository instructions.

## Cognitive Routing boundary

Normal Pi can display Cognitive Routing configuration for inspection, but it cannot execute Cognitive Routing. The Freeflow extension requires the PiFlow host contract for session model-state control, profile transitions, and the automatic switch tool.

Use [PiFlow integration](piflow.md) when Cognitive Routing is required.

## Common controls

```text
/freeflow
/freeflow settings
/freeflow settings session
/freeflow settings repo
```

`/freeflow settings` opens the personal override surface. `/freeflow settings session` manages temporary enablement and optional-context overrides, and `/freeflow settings repo` edits shared repository settings.

Cognitive Routing profile controls and keyboard shortcuts are intentionally unavailable in normal Pi. PiFlow provides the profile controls and `Ctrl+Shift+A` / `Ctrl+Shift+R` shortcuts while idle.

## Development boundary

For local Freeflow development, refresh a committed package snapshot from the Freeflow repository:

```bash
npm run snapshot:refresh
```

Do not treat an uncommitted Freeflow working tree as a release or production package source. Snapshots are development inputs; production installs use ordinary npm or Git package sources.

## Related documentation

- [Freeflow architecture](../architecture.md)
- [Workflow](../workflow.md)
- [Skill routing](../skill-routing.md)
- [PiFlow integration](piflow.md)
- [Root installation guide](../../README.md#quick-start)
