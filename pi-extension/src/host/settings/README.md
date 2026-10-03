# Settings

The `/freeflow` command.

| File | Owns |
|---|---|
| [`freeflow-command.ts`](freeflow-command.ts) | Parses `/freeflow` arguments and runs them: `settings` (the default) opens the settings screen, `status` prints the status report. Builds every setting for each scope (Session, Personal, Repository) as sections (Freeflow, Cognitive Routing, Tool Execution, Compaction, and for the session a reset), with its value and where that value comes from ("inherit → enabled (repository)"), and writes changes back through `host/config.ts`. `settings session`, `settings local` and `settings repo` open the screen on that scope. |
| [`settings-view.ts`](settings-view.ts) | The terminal widgets the command uses: the settings screen (scope tabs switched with Tab and Shift+Tab, section headers the cursor skips, small choices changed in place with Enter or Space, the chosen value's meaning under the description), plus the choice picker, preset wizard, and text input that open over it. They render entries and report the user's choices; they know nothing about Freeflow configuration. |

Routing's own commands (`/freeflow profile …`, `/freeflow resume`) are handled by [`cognitive-routing/runtime.ts`](../../cognitive-routing/runtime.ts).

## Rules

- A setting shows where its effective value comes from (default, repository, personal, or session), so users can tell why a change did not take effect; an inherited value shows what it resolves to.
- Toggles and small choices change in place; a choice with side effects on each step (holding a routing profile) or a destructive one (reset) opens a picker instead.
- The session scope covers every switch the other scopes have; session overrides are recorded in the session, never in a config file.
- Session overrides are staged and written when the next prompt starts (`host/staging.ts`), not when the user picks them.

Tests: [`tests/host/settings-view.test.js`](../../../tests/host/settings-view.test.js).
