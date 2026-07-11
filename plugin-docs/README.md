# Freeflow Docs

These docs describe the public plugin behavior.

After installing Freeflow, run setup in each repo where you want it active:

```text
/setup-freeflow
```

Setup creates `.freeflow/config.json`, the sole repo activation boundary. It does not generate Freeflow text in repo-owned host instruction files.

In Codex, open the hooks screen after install:

```text
/hooks
```

Press `t` to trust/enable the Freeflow `SessionStart` hook when Codex marks it as needing review. Once enabled, plugin-bundled hooks stay inert until `.freeflow/config.json` is valid, then load the canonical compact runtime kernel and independently enabled capability context at session start, resume, clear, and compact. Setup reports runtime delivery as confirmed, unavailable, or unconfirmed instead of treating config as proof that the hook ran.

In Pi, install Freeflow as a Pi package from npm:

```bash
pi install npm:@hassangameryt/freeflow
```

Or install directly from GitHub:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

The package exposes the built Pi extension at `pi-extension/dist/index.js`. Pi extension source lives in `pi-extension/src/`. The Pi extension dynamically exposes Freeflow model skills only after repo setup, keeps `/freeflow mode` changes scoped to the Pi session, refreshes enabled runtime context on session start and compact, and appends that context to the existing system prompt before every agent turn. Use `/freeflow` for the unified settings/status UI, including separate Session mode and Default mode controls; when Freeflow is off, nested skill, mode, output-router, and delegation settings are inactive until re-enabled. The safety-policy reference remains available to the output-router skill but is not injected wholesale by default. The extension does not enforce policy, grant permissions, or create repo-local hooks.

- [Workflow](workflow.md): modes, entry points, loops, and the compact workflow map.
- [Skills](skills.md): shipped skills and what each one is for.
- [Architecture](architecture.md): package layout, runtime boundary, context hooks, and progressive disclosure model.
- [Output Router](output-router.md): compact guide to routed retrieval, command output routing, vault recovery, and config.
- [Release evidence](release-evidence.md): current release evidence and deferred checks.
- [ADRs](adr/README.md): durable release decisions.
