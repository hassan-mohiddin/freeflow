# Task memory

Working Records attached to a Pi session: which tasks the session works on, the focused record's resume view at the boundaries where context changes, and a gate on record writes. A prototype, off unless `taskMemory.enabled` is set. Design: `dev-docs/subsystems/task-memory.md`.

- `config.ts`: the `taskMemory` config key, its validation and layering.
- `runtime.ts`: session state as a fold over `freeflow-task-memory-v1` branch entries; attach, focus, detach, hold and confirm; snapshots through Track Work's `views.mjs`; the write gate; Runtime State lines.
- `tool.ts`: the `freeflow_task` tool.
