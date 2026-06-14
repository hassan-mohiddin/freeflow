# Freeflow Docs

These docs describe the public plugin behavior. Historical research stays in root `docs/`; eval sources and reports live under `plugins/freeflow/evals/`.

After installing Freeflow, run setup in each repo where you want it active:

```text
/setup-freeflow
```

Setup creates activation/config files only.

In Codex, open the hooks screen after install:

```text
/hooks
```

Press `t` to trust/enable the Freeflow `SessionStart` hook when Codex marks it as needing review. Once enabled, plugin-bundled hooks load workflow context at session start, resume, clear, and compact.

In Pi, install the repo as a Pi package:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

The package exposes `plugins/freeflow/skills/` and `plugins/freeflow/pi-extension/index.js`. The Pi extension registers direct Freeflow commands and injects compact runtime context before agent turns. It does not enforce policy, block tools, grant permissions, or create repo-local hooks.

- [Workflow](workflow.md): modes, entry points, loops, and the compact workflow map.
- [Skills](skills.md): shipped skills and what each one is for.
- [Architecture](architecture.md): package layout, runtime boundary, context hooks, and progressive disclosure model.
- [Release evidence](release-evidence.md): v0.1 acceptance evidence and deferred checks.
- [ADRs](adr/README.md): durable release decisions.
