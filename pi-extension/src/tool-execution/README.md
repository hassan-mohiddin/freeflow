# Tool Execution

Freeflow's layer over Pi's own tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, codemode). It keeps Pi's tools and adds what Pi lacks: guidance on working in the environment, notices when files change behind the model, clearer edit errors, `apply_patch` for GPT models, and background commands.

How it works and why, including behavior that looks wrong but is intended: [`dev-docs/subsystems/tool-execution.md`](../../../dev-docs/subsystems/tool-execution.md). User-facing behavior: [Tool Execution](../../../plugin-docs/capabilities/tool-execution.md).

| File | Owns |
|---|---|
| [`prompt.ts`](prompt.ts) | The system prompt sections: removes a few Pi rule lines that contradict the taught working style, and adds the environment facts and the Tool Execution guidance after Freeflow's section. |
| [`tools.ts`](tools.ts) | Which Freeflow tools exist (`apply_patch`, `bash_background`, `stop_background`) and keeps them declared only while Tool Execution is effective. |
| [`file-state.ts`](file-state.ts) | What the model has seen of each file: its observations by path, with a content hash (or size and time for files over 8 MiB). |
| [`file-tracking.ts`](file-tracking.ts) | Observes files after `read`, `edit`, `write` and `apply_patch`, and after other tools notices files that changed behind the model. |
| [`edit-messages.ts`](edit-messages.ts) | Messages around Pi's `edit` and `write`: rewritten edit errors that show the closest match, refusals, and the changed-files notice. Every error ends in one concrete next step. |
| [`background.ts`](background.ts) | `bash_background` and `stop_background`: runs commands in the background, saves their output to a private temp file, and notifies the model when they exit. |
| [`bash-guard.ts`](bash-guard.ts) | Refuses a trailing `&` and long foreground `sleep` in `bash`, pointing to background commands instead. |
| [`config.ts`](config.ts) | Tool Execution settings. Keys of the retired v2 runtime still load and do nothing. |
| [`apply-patch/`](apply-patch/README.md) | The `apply_patch` tool. |

## Rules

- Augment Pi's tools; do not replace them.
- Messages to the model state facts and one next step, with no reassurance. Their wording was reviewed against the Beyond the Weights research (Task 006 evidence).
- Notices are appended (file changes, background exits); nothing earlier in the conversation is edited.
- Calls a tool makes for another tool (codemode's nested calls) are tracked like direct calls.
- Keep the system prompt sections and tool definitions fixed for a configuration; nothing here runs in `context_with_system` ([Performance](../../../dev-docs/guides/performance.md)).
- Update the subsystem doc in the same change when behavior described there changes.

Tests: [`tests/tool-execution/`](../../tests/tool-execution/README.md).
