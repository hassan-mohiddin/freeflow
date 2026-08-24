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

Press `t` to trust/enable the Freeflow plugin hooks when Codex marks them as needing review. Once enabled, the shared runtime hook stays inert until repository configuration is valid and any personal layer is missing or valid. `SessionStart` loads the applicable static fragments from `runtime/prompts/` and current mode state after start, resume, clear, and compact; it does not inject a full Workflow bootstrap. `UserPromptSubmit` runs for every submitted prompt but emits context only for an explicit session-mode control; ordinary prompts remain silent. Neither path exposes Pi-only capabilities. Setup reports runtime delivery as confirmed, unavailable, or unconfirmed instead of treating config as proof that the hook ran.

In Pi, install Freeflow as a Pi package from npm:

```bash
pi install npm:@hassangameryt/freeflow
```

Or install directly from GitHub:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

The package exposes the built Pi extension at `pi-extension/dist/index.js`. Pi extension source lives in `pi-extension/src/`. The Pi extension dynamically exposes normal and effective capability skills after repo setup, keeps `/freeflow mode` changes scoped to the Pi session, refreshes prompt fragments and Runtime State on every provider request, filters historical bootstrap entries, and does not inject full Workflow or capability bodies into the system prompt. Use `/freeflow` for the unified settings/status UI, including separate Session mode and Default mode controls; when Freeflow is off, nested skill, mode, and capability settings are inactive until re-enabled. The extension does not enforce policy, grant permissions, or create repo-local hooks.

- [Workflow](workflow.md): modes, entry points, loops, and the compact workflow map.
- [Skill routing](skill-routing.md): shipped skills, ownership, sibling routes, and reference dependencies.
- [Architecture](architecture.md): package layout, layered configuration, runtime delivery, review topology, and task memory.
- [Release evidence](release-evidence.md): current release evidence and deferred checks.
- [ADRs](adr/README.md): durable release decisions.
