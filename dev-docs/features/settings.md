# Settings Screen

> **Covers:** `pi-extension/src/host/settings/`, `pi-extension/src/host/config-validation.ts`, `pi-extension/src/tool-execution/config.ts`, `pi-extension/src/compaction/config.ts`, `pi-extension/src/task-memory/config.ts`, `pi-extension/src/messaging/config.ts`, `pi-extension/src/cognitive-routing/config.ts`
> **Verified at:** `81500268` (2026-10-22)
> **User docs:** `plugin-docs/settings.md`

`/freeflow settings` opens one screen with three scopes: Session (this Pi session only), Personal (`.freeflow/local.json`) and Repository (`.freeflow/config.json`). Changing a row writes that scope's file at once (Session writes none), and a capability switch reloads the Pi session when the screen closes, so the new skills and tools take effect. Which layer wins and why: the overview's [Cross-Cutting Concerns](../README.md#cross-cutting-concerns); the screen's code: `pi-extension/src/host/settings/README.md`.

A setting a user changes gets a row on this screen. A key with no row needs the user's agreement and its reason in the settings test's `FILE_ONLY` list; the test fails on a config key with neither. That is why this file covers each capability's `config.ts` and the config validator: a new key flags it.

## Sub-features

- `settings-open`: opens the screen on the requested scope, without writing anything.
- `settings-repo-toggle`: switches a capability in the Repository scope and writes `.freeflow/config.json`.
- `settings-effect`: after closing, the session reloads and `/freeflow status` shows the change.
- `settings-personal-toggle`: cycles inherited, on and off in the Personal scope, writing `.freeflow/local.json` and removing it when nothing is left.
- `settings-personal-exclude`: when nothing ignores `.freeflow/local.json`, the first Personal write adds it to `.git/info/exclude`.
- `settings-session-toggle`: changes a Session value without touching either file.
- `settings-review`: the Review row cycles Review Work's mode in a file scope, writing `review.mode`, and its default leaves the file clean; Review has no Session value.
- `settings-reviewer-model`: the Reviewer model row opens a picker of the authenticated models, with inherit (Personal) or None (Repository) first.
- `settings-guidance-notices`: the Guidance notices row under Tool Execution switches `toolExecution.guidanceNotices` in every scope.

## How to get to it (user POV)

- Run `/freeflow settings` (opens Personal), or `/freeflow settings session`, `/freeflow settings personal` (or `local`), `/freeflow settings repo` (or `repository`).
- Press `Tab` inside the screen to switch scope, `↑`/`↓` to move, `Enter` or `Space` to change a row, `Esc` to close.

## Driving it

Preconditions:

- A fresh `scripts/verify-live.sh launch` (config `{}`), and `scripts/verify-live.sh doctor` passes.
- Rows run, from the top: Freeflow, Compaction, Context reuse, Tool Execution, Guidance notices, Task Memory, then the rest. Five `Down`s from the top reach Task Memory in every scope. In the file scopes, fifteen `Down`s reach Review, the second-to-last row.

- **Open each scope.** Run `scripts/verify-live.sh cmd "/freeflow settings repo"`. The pane shows `Freeflow settings    Session   Personal  [Repository]`, the line `.freeflow/config.json: shared with everyone who uses this repository.`, and the cursor on `› Freeflow                 on (inherited)`. Then `scripts/verify-live.sh snap settings-open`.
- **Nothing written by opening.** Run `scripts/verify-live.sh observe settings-open-files -- bash -c 'ls -A .freeflow; cat .freeflow/config.json'`. Output `config.json` and `{}`.
- **Select Task Memory.** Run `scripts/verify-live.sh keys Down Down Down Down Down`. The cursor is on `› Task Memory              off (inherited)`.
- **Switch it on.** Run `scripts/verify-live.sh keys Enter`. The row reads `› Task Memory              on`, and the description reads `A preview: attach Working Records to the session, deliver the focused record after compaction, and refuse record writes to records not attached.` Then `scripts/verify-live.sh snap settings-repo-toggle`.
- **Repository file.** Run `scripts/verify-live.sh observe settings-repo-config -- cat .freeflow/config.json`. Exit code `0`; the output is `{"taskMemory": {"enabled": true}}`, pretty-printed.
- **Close and reload.** Run `scripts/verify-live.sh keys Escape`. The pane shows `Reloaded keybindings, extensions, skills, prompts, themes, and context files`, and the `[Skills]` list now includes `task-memory`.
- **Effective state.** Run `scripts/verify-live.sh cmd "/freeflow status"`. The status line now ends `; task memory: enabled (No task record is attached.)`. Then `scripts/verify-live.sh snap settings-effect`, and clean up.
- **Personal cycle.** In a fresh run, run `scripts/verify-live.sh cmd "/freeflow settings personal"`. The header shows `[Personal]` and the line `.freeflow/local.json: only you, in this checkout. Overrides the repository.` Run `scripts/verify-live.sh keys Down Down Down Down Down Enter`: the row reads `› Task Memory              on`. Run `scripts/verify-live.sh observe settings-personal-on -- cat .freeflow/local.json`: `{"taskMemory": {"enabled": true}}`, pretty-printed. Run `scripts/verify-live.sh keys Enter`: the row reads `off`, and the same observe shows `"enabled": false`. Run `scripts/verify-live.sh keys Enter`: the row reads `off (inherited)`, and `scripts/verify-live.sh observe settings-personal-inherit -- ls -A .freeflow` shows only `config.json`. Then `scripts/verify-live.sh snap settings-personal-toggle` and `scripts/verify-live.sh keys Escape`.
- **Personal exclude.** In the same run, run `scripts/verify-live.sh observe settings-drop-ignore -- bash -c 'printf ".freeflow/*/\n" > .gitignore; git check-ignore -q .freeflow/local.json; echo "check-ignore exit $?"'`: `check-ignore exit 1`. Run `scripts/verify-live.sh cmd "/freeflow settings personal"`, then `scripts/verify-live.sh keys Down Down Down Down Down Enter`. Run `scripts/verify-live.sh observe settings-personal-exclude -- bash -c 'grep -v "^#" .git/info/exclude; git status --porcelain'`: the output is `.freeflow/local.json` and ` M .gitignore`, so the personal file is not offered for commit. Then `scripts/verify-live.sh keys Enter Enter Escape` to return the row to inherited.
- **Session.** Run `scripts/verify-live.sh cmd "/freeflow settings session"`. The header shows `[Session]` and `This Pi session only, not saved to a file. Overrides personal and repository values.` Run `scripts/verify-live.sh keys Down Down Down Down Down Enter`: the row reads `› Task Memory           on`, `Reset overrides     1 active` appears under `Session`, and the description says `on: Enabled for this Pi session only.` Run `scripts/verify-live.sh observe settings-session-files -- bash -c 'ls -A .freeflow; cat .freeflow/config.json'`: only `config.json`, still `{}`. Run `scripts/verify-live.sh keys Escape`, then `scripts/verify-live.sh cmd "/freeflow status"`: the line ends `task memory: enabled (No task record is attached.)`. Then `scripts/verify-live.sh snap settings-session-toggle`, and clean up.

- **Review in a file scope.** In a fresh run, run `scripts/verify-live.sh cmd "/freeflow settings repo"`, then `scripts/verify-live.sh keys` with fifteen `Down`s. The cursor is on `› Review                   auto (inherited)`. Run `scripts/verify-live.sh keys Enter`, then `Enter` again: the row reads `› Review                   off`, then `always`. Run `scripts/verify-live.sh observe settings-review-always -- cat .freeflow/config.json`: `{"review": {"mode": "always"}}`, pretty-printed. Run `scripts/verify-live.sh keys Enter`: the row reads `auto (inherited)`, and the same observe shows `{}`. Then `scripts/verify-live.sh snap settings-review`.
- **Reviewer model.** In the same screen, run `scripts/verify-live.sh keys Down Enter`. The picker's title is `Freeflow settings › Repository › Reviewer model › Choose reviewer model`, its first choice `None` with `Review Work chooses the reviewer's model.`, then the authenticated models by `provider/id`. A run without credentials has no models, so only `None` shows: picking a model is unverified live, and covered by the test `Pi settings set Review Work's review mode and reviewer model in the files`. Run `scripts/verify-live.sh keys Escape Escape` and clean up.
- **Guidance notices.** In a fresh run, run `scripts/verify-live.sh cmd "/freeflow settings repo"`, then `scripts/verify-live.sh keys Down Down Down Down`. The cursor is on `›   Guidance notices       on (inherited)`. Run `scripts/verify-live.sh keys Enter`: the row reads `off`, and `scripts/verify-live.sh observe settings-notices-repo -- cat .freeflow/config.json` shows `{"toolExecution": {"guidanceNotices": false}}`, pretty-printed. Then `scripts/verify-live.sh snap settings-guidance-notices`, `scripts/verify-live.sh keys Escape`, wait for `Reloaded …`, and clean up. In the Session scope the same four `Down`s and `Enter` read `›   Guidance notices    on`, with `Reset overrides     1 active`, and both files unchanged. What the notices do in a run needs a model call: [Tool Execution](tool-execution.md).

## Gotchas

- `Enter` on the first row switches Freeflow itself for that scope. Always confirm the `›` row in the printed pane before `Enter`, and never press `Enter` just after `cmd` opens the screen.
- In the Repository scope `Enter` flips between on and off; in Personal and Session it cycles inherited, on and off.
- A capability switch reloads the session after `Esc`. Wait for the `Reloaded …` notice before the next command.
- The fixture's `.gitignore` already ignores `.freeflow/local.json`, so `.git/info/exclude` is written only after the **Personal exclude** step removes that rule.
- Session rows are narrower than the file scopes' rows, so match a row by its label and value, not by its spacing.
