# Task memory

Working Records attached to a Pi session: which tasks the session works on, projects and child records, the focused record's resume view at the boundaries where context changes, and a gate on record writes. A prototype, off unless `taskMemory.enabled` is set. Design: `dev-docs/subsystems/task-memory.md`.

- `config.ts`: the `taskMemory` config key, its validation and layering.
- `runtime.ts`: session state as a fold over `freeflow-task-memory-v1` branch entries; attach, focus, detach, hold and confirm; snapshots through Track Work's `views.mjs`; the write gate; Runtime State lines.
- `registry.ts`: the registry file under the Freeflow home: projects and their stores, registered tasks and children created through Track Work's `init`, record ownership, and the compare-before-rename update.
- `tool.ts`: the `freeflow_task` tool.
