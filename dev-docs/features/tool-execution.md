# Tool Execution

> **Covers:** `pi-extension/src/tool-execution/`, `runtime/prompts/tool-execution.md`
> **Verified at:** `88f1e98d` (2026-10-22)
> **User docs:** `plugin-docs/capabilities/tool-execution.md`

Tool Execution is on whenever Freeflow is. The user sees it in `/freeflow status` and on the settings screen, where it has its own switch and a Guidance notices row; the model sees its guidance, file tracking, edit errors, `apply_patch`, background commands, monitors and guidance notices, which only a model's tool calls reach. How the code works: [Tool Execution](../subsystems/tool-execution.md).

## Sub-features

- `te-status`: `/freeflow status` reports `tool execution: enabled` with a fresh config.
- `te-session-off`: turning Tool Execution off in the Session scope reloads the session, status reports `tool execution: disabled`, and neither file changes.
- `te-guidance-commit`: a `git commit` result carries Deliver Work's commit essentials. Model call; unverified.
- `te-guidance-diagnose`: the second failure of the same test command carries diagnose's two key lines. Model call; unverified.
- `te-guidance-self-review`: a passing test after a file change carries the self-review reminder. Model call; unverified.
- `te-notices-off`: with Guidance notices off, none of the three appears. Model call; unverified.

The Guidance notices row itself is driven in [Settings screen](settings.md) (`settings-guidance-notices`).

## How to get to it (user POV)

- Run `/freeflow status` while Pi is idle.
- Open `/freeflow settings` and change Tool Execution or Guidance notices in any scope.
- Ask the agent to commit, or to run a test that fails twice, and read the tool result in the transcript.

## Driving it

Preconditions:

- A fresh `scripts/verify-live.sh launch` (config `{}`), and `scripts/verify-live.sh doctor` passes.
- For the guidance notice steps: the user's yes for the model calls, and a run launched with a pinned cheap model, `FFV_PI_ARGS="--model <provider/id>" scripts/verify-live.sh launch --allow-model-call`.

- **Status.** Run `scripts/verify-live.sh cmd "/freeflow status"`. The pane shows `Freeflow: enabled; cognitive routing: disabled; tool execution: enabled; compaction: enabled (cycle 1)`. Then `scripts/verify-live.sh snap te-status`.
- **Off for the session.** Run `scripts/verify-live.sh cmd "/freeflow settings session"`, then `scripts/verify-live.sh keys Down Down Down Down Down`: the cursor is on `› Tool Execution        on (inherited)`. Run `scripts/verify-live.sh keys Enter`, then `Enter` again: the row reads `› Tool Execution        off`. Run `scripts/verify-live.sh keys Escape` and wait for `Reloaded keybindings, extensions, skills, prompts, themes, and context files`. Run `scripts/verify-live.sh cmd "/freeflow status"`: the line reads `… tool execution: disabled; compaction: enabled (cycle 1)`. Run `scripts/verify-live.sh observe te-session-files -- cat .freeflow/config.json`: `{}`. Then `scripts/verify-live.sh snap te-session-off`, and clean up.
- **Commit notice. Model call; unverified.** In a model run, run `scripts/verify-live.sh cmd "/execute-work create notes.txt with one line and commit it" --allow-model-call`. The `git commit` result in the transcript should end with a `<freeflow-notice type="guidance">` block holding the commit essentials. Snap it as `te-guidance-commit`.
- **Diagnose notice. Model call; unverified.** In a model run whose fixture has a failing test, ask the agent to run that test twice. The second result should carry diagnose's two key lines. Snap it as `te-guidance-diagnose`.
- **Notices off. Model call; unverified.** Launch with `--config '{"toolExecution":{"guidanceNotices":false}}'` and repeat the commit step: no `freeflow-notice` block. Snap it as `te-notices-off`.

## Gotchas

- In the Session scope a switch cycles inherited, on and off: the first `Enter` sets `on`, the second `off`.
- A Session switch reloads the session after `Esc`; wait for the `Reloaded …` notice before the next command.
- Guidance notices are appended to a tool result before it is sent, so they show only in a transcript of a model's tool calls, never in `/freeflow status`.
- The notice steps have not been driven: no run so far had the user's yes for a model call. Local tests cover them: `pi-extension/tests/tool-execution/guidance-notices-native.test.js`.
