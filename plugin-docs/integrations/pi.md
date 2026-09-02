# Pi Integration

Freeflow can run as a Pi package. Normal Pi provides the Freeflow extension host, mandatory core prompt delivery, discoverable base skills, optional context capabilities, and Cognitive Routing when its official model-state APIs are available.

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

## Supported Pi versions

The full normal-Pi integration targets Pi **0.84.3 or newer**. Pi 0.84.2 introduced the `expandPromptTemplates` option used by Freeflow’s direct skill commands; Pi 0.84.3 made model and thinking selections session-scoped unless they are explicitly saved, which Cognitive Routing requires. Pi 0.84.4 is the current integration test target.

## Activate Freeflow

In the repository where Freeflow should operate, run:

```text
/setup-freeflow
```

Setup creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. An optional `.freeflow/local.json` provides per-checkout personal overrides; it cannot activate Freeflow by itself.

Freeflow's core prompt and separately editable Interaction Contract are delivered together whenever Freeflow is enabled. The 25 base skills are exposed with that core surface. Context Virtualization, Conversation History, and Cognitive Routing remain independently optional capabilities.

Pi stores temporary enablement and optional-context overrides in branch-aware session state. Session overrides do not replace repository activation or silently edit the shared configuration.

## What normal Pi provides

When effective, the Freeflow package provides:

- the 25-skill model/contributor surface, including Workflow and Action Selection;
- the mandatory `runtime/prompts/core.md` and `runtime/prompts/interaction-contract.md` fragments;
- refresh-aware Runtime State at session start, context reconstruction, and displayed state changes;
- optional Context Virtualization for archiving consumed tool results;
- optional Conversation History for bounded current-branch recovery;
- Cognitive Routing through the shared Control/Profile skill, profile tool, controls, and transition history;
- the `/freeflow` settings and status surface.

Full skill bodies are discoverable rather than injected as persistent bootstrap text. Freeflow context loading guides the model but does not enforce policy, grant permissions, or replace repository instructions.

## Cognitive Routing

When configured with distinct authenticated profiles and Pi exposes its official model registry, `setModel`, `setThinkingLevel`, and session-entry APIs, normal Pi runs the same Cognitive Routing behavior as PiFlow. The extension persists prepared and committed transitions, rolls back partial changes, and suspends routing after a native model or thinking-level override until explicitly reactivated.

If those APIs are unavailable, the configuration remains inspectable but routing is unavailable on that host.

## Common controls

```text
/freeflow
/freeflow settings
/freeflow settings session
/freeflow settings repo
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
```

`/freeflow settings` opens the personal override surface. `/freeflow settings session` manages temporary enablement and optional-context overrides, and `/freeflow settings repo` edits shared repository settings.

Cognitive Routing profile controls and `Ctrl+Shift+A` / `Ctrl+Shift+R` shortcuts are available while either host is idle and exposes the required runtime APIs.

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
