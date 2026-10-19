# Settings Screen

> **Covers:** `pi-extension/src/host/settings/`
> **Verified at:** `c4bdf496` (2026-10-19)
> **User docs:** `plugin-docs/settings.md`

`/freeflow settings` opens one screen with three scopes: Session (this Pi session only), Personal (`.freeflow/local.json`) and Repository (`.freeflow/config.json`). Changing a row writes that scope's file at once (Session writes none), and a capability switch reloads the Pi session when the screen closes, so the new skills and tools take effect. Which layer wins and why: the overview's [Cross-Cutting Concerns](../README.md#cross-cutting-concerns); the screen's code: `pi-extension/src/host/settings/README.md`.

## Sub-features

- `settings-open`: opens the screen on the requested scope, without writing anything.
- `settings-repo-toggle`: switches a capability in the Repository scope and writes `.freeflow/config.json`.
- `settings-effect`: after closing, the session reloads and `/freeflow status` shows the change.
- `settings-personal-toggle`: cycles inherited, on and off in the Personal scope, writing `.freeflow/local.json` and removing it when nothing is left.
- `settings-personal-exclude`: when nothing ignores `.freeflow/local.json`, the first Personal write adds it to `.git/info/exclude`.
- `settings-session-toggle`: changes a Session value without touching either file.

## How to get to it (user POV)

- Run `/freeflow settings` (opens Personal), or `/freeflow settings session`, `/freeflow settings personal` (or `local`), `/freeflow settings repo` (or `repository`).
- Press `Tab` inside the screen to switch scope, `↑`/`↓` to move, `Enter` or `Space` to change a row, `Esc` to close.

## Driving it

Preconditions:

- A fresh `scripts/verify-live.sh launch` (config `{}`), and `scripts/verify-live.sh doctor` passes.
- Rows run, from the top: Freeflow, Compaction, Context reuse, Tool Execution, Task Memory, then the rest. Four `Down`s from the top reach Task Memory in every scope.

- **Open each scope.** Run `scripts/verify-live.sh cmd "/freeflow settings repo"`. The pane shows `Freeflow settings    Session   Personal  [Repository]`, the line `.freeflow/config.json: shared with everyone who uses this repository.`, and the cursor on `› Freeflow                 on (inherited)`. Then `scripts/verify-live.sh snap settings-open`.
- **Nothing written by opening.** Run `scripts/verify-live.sh observe settings-open-files -- bash -c 'ls -A .freeflow; cat .freeflow/config.json'`. Output `config.json` and `{}`.
- **Select Task Memory.** Run `scripts/verify-live.sh keys Down Down Down Down`. The cursor is on `› Task Memory              off (inherited)`.
- **Switch it on.** Run `scripts/verify-live.sh keys Enter`. The row reads `› Task Memory              on`, and the description reads `A preview: attach Working Records to the session, deliver the focused record after compaction, and refuse record writes to records not attached.` Then `scripts/verify-live.sh snap settings-repo-toggle`.
- **Repository file.** Run `scripts/verify-live.sh observe settings-repo-config -- cat .freeflow/config.json`. Exit code `0`; the output is `{"taskMemory": {"enabled": true}}`, pretty-printed.
- **Close and reload.** Run `scripts/verify-live.sh keys Escape`. The pane shows `Reloaded keybindings, extensions, skills, prompts, themes, and context files`, and the `[Skills]` list now includes `task-memory`.
- **Effective state.** Run `scripts/verify-live.sh cmd "/freeflow status"`. The status line now ends `; task memory: enabled (No task record is attached.)`. Then `scripts/verify-live.sh snap settings-effect`, and clean up.
- **Personal cycle.** In a fresh run, run `scripts/verify-live.sh cmd "/freeflow settings personal"`. The header shows `[Personal]` and the line `.freeflow/local.json: only you, in this checkout. Overrides the repository.` Run `scripts/verify-live.sh keys Down Down Down Down Enter`: the row reads `› Task Memory              on`. Run `scripts/verify-live.sh observe settings-personal-on -- cat .freeflow/local.json`: `{"taskMemory": {"enabled": true}}`, pretty-printed. Run `scripts/verify-live.sh keys Enter`: the row reads `off`, and the same observe shows `"enabled": false`. Run `scripts/verify-live.sh keys Enter`: the row reads `off (inherited)`, and `scripts/verify-live.sh observe settings-personal-inherit -- ls -A .freeflow` shows only `config.json`. Then `scripts/verify-live.sh snap settings-personal-toggle` and `scripts/verify-live.sh keys Escape`.
- **Personal exclude.** In the same run, run `scripts/verify-live.sh observe settings-drop-ignore -- bash -c 'printf ".freeflow/*/\n" > .gitignore; git check-ignore -q .freeflow/local.json; echo "check-ignore exit $?"'`: `check-ignore exit 1`. Run `scripts/verify-live.sh cmd "/freeflow settings personal"`, then `scripts/verify-live.sh keys Down Down Down Down Enter`. Run `scripts/verify-live.sh observe settings-personal-exclude -- bash -c 'grep -v "^#" .git/info/exclude; git status --porcelain'`: the output is `.freeflow/local.json` and ` M .gitignore`, so the personal file is not offered for commit. Then `scripts/verify-live.sh keys Enter Enter Escape` to return the row to inherited.
- **Session.** Run `scripts/verify-live.sh cmd "/freeflow settings session"`. The header shows `[Session]` and `This Pi session only, not saved to a file. Overrides personal and repository values.` Run `scripts/verify-live.sh keys Down Down Down Down Enter`: the row reads `› Task Memory           on`, `Reset overrides     1 active` appears under `Session`, and the description says `on: Enabled for this Pi session only.` Run `scripts/verify-live.sh observe settings-session-files -- bash -c 'ls -A .freeflow; cat .freeflow/config.json'`: only `config.json`, still `{}`. Run `scripts/verify-live.sh keys Escape`, then `scripts/verify-live.sh cmd "/freeflow status"`: the line ends `task memory: enabled (No task record is attached.)`. Then `scripts/verify-live.sh snap settings-session-toggle`, and clean up.

## Gotchas

- `Enter` on the first row switches Freeflow itself for that scope. Always confirm the `›` row in the printed pane before `Enter`, and never press `Enter` just after `cmd` opens the screen.
- In the Repository scope `Enter` flips between on and off; in Personal and Session it cycles inherited, on and off.
- A capability switch reloads the session after `Esc`. Wait for the `Reloaded …` notice before the next command.
- The fixture's `.gitignore` already ignores `.freeflow/local.json`, so `.git/info/exclude` is written only after the **Personal exclude** step removes that rule.
- Session rows are narrower than the file scopes' rows, so match a row by its label and value, not by its spacing.
