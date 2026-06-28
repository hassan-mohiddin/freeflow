# Freeflow Docs

These docs describe the public plugin behavior.

After installing Freeflow, run setup in each repo where you want it active:

```text
/setup-freeflow
```

Setup creates activation/config files only.

In Codex, open the hooks screen after install:

```text
/hooks
```

Press `t` to trust/enable the Freeflow `SessionStart` hook when Codex marks it as needing review. Once enabled, plugin-bundled hooks load mode-contract, workflow, interview-gate, discover, and output-router context at session start, resume, clear, and compact.

In Pi, install Freeflow as a Pi package from npm:

```bash
pi install npm:@hassangameryt/freeflow
```

Or install directly from GitHub:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

The package exposes `skills/` and the built Pi extension at `pi-extension/dist/index.js`. Pi extension source lives in `pi-extension/src/`. The Pi extension registers direct Freeflow commands, keeps `/workflow` mode changes scoped to the Pi session, refreshes mode-contract, workflow, interview-gate, discover, and output-router context on session start and compact, and injects the full core skill context before every agent turn. The safety-policy reference remains available to the output-router skill but is not injected wholesale by default. The extension does not enforce policy, block tools, grant permissions, or create repo-local hooks.

- [Workflow](workflow.md): modes, entry points, loops, and the compact workflow map.
- [Skills](skills.md): shipped skills and what each one is for.
- [Architecture](architecture.md): package layout, runtime boundary, context hooks, and progressive disclosure model.
- [Output Router](output-router.md): compact guide to routed retrieval, command output routing, vault recovery, and config.
- [Release evidence](release-evidence.md): current release evidence and deferred checks.
- [ADRs](adr/README.md): durable release decisions.
