# Settings

The `/freeflow` command.

| File | Owns |
|---|---|
| [`freeflow-command.ts`](freeflow-command.ts) | Parses `/freeflow` arguments and runs them: `settings` (the default) opens the settings screens, `status` prints the status report. Builds every setting entry (Freeflow, Cognitive Routing, Tool Execution, Compaction) with its scope (repository, personal, or session), current value, and where that value comes from, and writes changes back through `host/config.ts`. |
| [`settings-view.ts`](settings-view.ts) | The terminal widgets the command uses: the settings list, choice picker, wizard steps, and text input. They render entries and report the user's choices; they know nothing about Freeflow configuration. |

Routing's own commands (`/freeflow profile …`, `/freeflow resume`) are handled by [`cognitive-routing/runtime.ts`](../../cognitive-routing/runtime.ts).

## Rules

- A setting shows where its effective value comes from (built-in, repository, personal, or session), so users can tell why a change did not take effect.
- Session overrides are staged and written when the next prompt starts (`host/staging.ts`), not when the user picks them.

Tests: [`tests/host/settings-view.test.js`](../../../tests/host/settings-view.test.js).
