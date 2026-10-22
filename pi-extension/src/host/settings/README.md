# Settings

The `/freeflow` command.

| File | Owns |
|---|---|
| [`freeflow-command.ts`](freeflow-command.ts) | Parses `/freeflow` arguments and runs them: `settings` (the default) opens the settings screen, `status` prints the status report. Builds every setting for each scope (Session, Personal, Repository) as sections (Freeflow with Runtime prompts and Skills, Compaction, Tool Execution, Task Memory, Messaging, Cognitive Routing, Review, and for the session a reset), with its value and where that value comes from ("inherit → enabled (repository)"), and writes changes back through `host/config.ts`. `settings session`, `settings local` and `settings repo` open the screen on that scope. |
| [`settings-view.ts`](settings-view.ts) | The terminal widgets the command uses: the settings screen (scope tabs switched with Tab and Shift+Tab, section headers the cursor skips, small choices changed in place with Enter or Space, the chosen value's meaning under the description), plus the choice picker, preset wizard, and text input that open over it. They render entries and report the user's choices; they know nothing about Freeflow configuration. |

Routing's own commands (`/freeflow profile …`, `/freeflow resume`) are handled by [`cognitive-routing/runtime.ts`](../../cognitive-routing/runtime.ts).

## Rules

- A setting shows where its effective value comes from (default, repository, personal, or session), so users can tell why a change did not take effect; an inherited value shows what it resolves to.
- Toggles and small choices change in place; a choice with side effects on each step (holding a routing profile) or a destructive one (reset) opens a picker instead.
- Every config key a user sets has a row here. A key without one needs the user's agreement and its reason in `FILE_ONLY` in the settings test (`tests/integration/pi-extension.test.js`), which fails on a key with neither.
- Every setting has a row in all three scopes, Session included; session overrides (`SESSION_OVERRIDE_KEYS` in `host/config.ts`, switches and a few choices) are recorded in the session, never in a config file. The settings test checks every scope, nested screens included.
- Session overrides are staged and written when the next prompt starts (`host/staging.ts`), not when the user picks them.

Tests: [`tests/host/settings-view.test.js`](../../../tests/host/settings-view.test.js).
