# Compaction

Freeflow compaction on Pi: one soft notice a compaction cycle, then the agent checkpoints with Track Work's `checkpoint --compact`, and at the run's end Freeflow writes Pi's compaction with the task's bundle; Pi's own compaction stays as the fallback, with the bundle after its summary. How it works and why, including the behavior that looks wrong but is intended: [`dev-docs/subsystems/compaction.md`](../../../dev-docs/subsystems/compaction.md). The model-facing method is Track Work's checkpoint, [`skills/track-work/SKILL.md`](../../../skills/track-work/SKILL.md).

| File | Owns |
|---|---|
| [`config.ts`](config.ts) | The `compaction` config key, its validation and its effective state. |
| [`controller.ts`](controller.ts) | The rows and the notice, the run-end compaction with the bundle, Pi's own compaction with the bundle, and the handoff to the post-compaction resets. |
| [`thresholds.ts`](thresholds.ts) | Where the notice comes: 75% of the window, or a tenth of the window before Pi's trigger if earlier, using Pi's effective reserve and the smallest window that may receive the full history; the rows at 50, 60 and 70%. |
| [`harness.ts`](harness.ts) | The part of the summary Freeflow writes itself: cycle, the request this compaction completes, routing profile, running background commands, the skills read, and the session-wide file lists in Pi's `<read-files>`/`<modified-files>` form. |

`/freeflow compact` (in `src/index.ts`) asks the agent to checkpoint with `--compact`. The store's state comes from [`../store/`](../store/README.md).

## Rules

- Never cancel or change Pi's own compaction; `fallback()` returns `undefined` on any failure.
- Write nothing before the run's last turn ends, and only for a waiting request whose checkpoint is done.
- Notices are appended messages; never change the system prompt, tool definitions or skill list with compaction state (prompt cache).
- `observe()` runs after every turn: follow [Performance](../../../dev-docs/guides/performance.md), read no store or session file there, and keep `tests/integration/request-path-budget.test.js` passing.
- Update the subsystem doc in the same change when behavior described there changes.

Tests: [`tests/compaction/`](../../tests/compaction/README.md).
