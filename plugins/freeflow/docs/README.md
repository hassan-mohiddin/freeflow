# Freeflow Docs

These docs describe the public plugin behavior. Historical research stays in root `docs/`; eval sources and reports live under `plugins/freeflow/evals/`.

After installing Freeflow, run `setup-freeflow` in each repo where you want it active. Setup creates activation/config files only; plugin-bundled hooks load workflow context at session start, resume, clear, and compact.

- [Workflow](workflow.md): modes, entry points, loops, and the compact workflow map.
- [Skills](skills.md): shipped skills and what each one is for.
- [Architecture](architecture.md): package layout, runtime boundary, context hooks, and progressive disclosure model.
- [Release evidence](release-evidence.md): v0.1 acceptance evidence and deferred checks.
- [ADRs](adr/README.md): durable release decisions.
