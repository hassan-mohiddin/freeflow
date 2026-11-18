# Settings

> **Covers:** `pi-extension/src/host/settings/`, `pi-extension/src/host/config-validation.ts`, `pi-extension/src/host/config-store.ts`, `pi-extension/src/host/config.ts`, `skills/setup-freeflow/scripts/settings.mjs`, `hooks/claude/freeflow.mjs`, `hooks/shared/runtime-context.mjs`, `hooks/codex/driver.mjs`, `pi-extension/src/compaction/config.ts`, `pi-extension/src/tool-execution/config.ts`, `pi-extension/src/messaging/config.ts`
> **Verified at:** `d664221e` (2026-11-18: driven at `d664221e`: the Pointers row in all three Pi tabs and the script's tick, precedence and refusal for `pointers.enabled` (in [Reference pointers](pointers.md)), Claude Code's `/freeflow settings --all` listing and a `/freeflow settings pointers.enabled off --harness-only` change, and the Pi screen with no Gates row; the other script steps and the Pi screen steps are not re-driven at this commit; the Codex steps are not driven)
> **User docs:** `plugin-docs/settings.md`

Settings live in the Freeflow home (`FREEFLOW_HOME`, `~/.freeflow`), never in the repository (D-060). Three layers, with precedence session, then this folder, then everywhere, then the default: `settings.json` (everywhere, the default for a change), `folders.json` (this folder, one entry per repository), and the session's own file. A setting can be ticked "only on this harness", and the harness value wins within its layer. The repository's own `.freeflow/config.json` and `.freeflow/local.json` are no longer read: `settings.mjs doctor --fix` moves their settings into this folder.

`/freeflow settings` on Pi opens one screen with three tabs, Session (this Pi session only), This folder and Everywhere; `Tab` switches between them. Changing a row writes that tab's layer at once (Session writes none of the files). On Claude Code `/freeflow settings` lists the normal view and `/freeflow settings --all` Developer settings. Codex has no command: the agent runs the settings script.

Every key is one row of the settings table, `SETTINGS` in `config-validation.ts`: the validators, Pi's Session keys, the screen's writes, the settings script and the settings tests read it. A setting a user changes also gets a row on Pi's screen, in all three tabs, nested screens included.

## Sub-features

- `settings-open`: `/freeflow settings` opens on This folder, with Freeflow first, then Task memory, and writes nothing.
- `settings-tabs`: `Tab` cycles Session, This folder and Everywhere; each tab's summary line says where its values go.
- `settings-memory`: Task memory is one row (`memory.mode`: on, this machine; on, with sync; off), written to the tab's layer.
- `settings-compaction-no-task`: Compaction has a row for Compaction without a task (`compaction.withoutTask`) in every tab.
- `settings-pointers`: Pointers (`pointers.enabled`) has a row in every tab, below Event log, written to the tab's layer; driven in [Reference pointers](pointers.md).
- `settings-skills`: Skills is a switch for every skill but Setup Freeflow, and Each skill under it opens one switch per skill; the title reads `Freeflow settings › <tab> › Each skill`.
- `settings-prompts`: Runtime prompts is a switch for all three prompts; Each prompt opens Core, the Interaction Contract and the Working Method.
- `settings-gates`: the delegation gate has no setting (D-069): no Gates row in any screen, and `set gates.delegation` is refused as unknown; driven in [Gates](gates.md).
- `settings-removed-keys`: the removed keys `gates.delegation`, `gates.agreement`, `gates.slice`, `gates.delivery` and `governor.cap` (with `governor.mode`) load from a layer, are named as ignored with their reason by `list` and `doctor`, and `doctor --fix` removes them; `set` refuses them as unknown (D-058).
- `settings-all-scopes`: every setting has a row in Session, This folder and Everywhere; the test `every config key Freeflow acts on has a /freeflow settings row, or a stated reason it has none` checks it.
- `settings-script`: `settings.mjs` lists (normal and developer views), gets, sets and unsets a key in each scope, with `--harness-only` ticks, refuses a value the table does not allow, and prints the Runtime State line a change gave.
- `settings-precedence`: a session value over a folder value over an everywhere value over the default, as `get` reports them; a tick over its layer's general value on its harness only.
- `settings-off`: Freeflow off in any layer or ticked for one harness; on Claude Code and Codex the off line names the harness's own command to disable the plugin, which Freeflow never does itself.
- `settings-claude-code`: on Claude Code, `/freeflow settings` lists the normal view, `--all` lists Developer settings, and `/freeflow settings <key> <value> [--folder | --session] [--harness-only]` changes one, the model reading the changed line in the running session, with no model call for the command itself.
- `settings-ignored`: a setting a layer ignores keeps its default and is named by the script's list, the Pi footer and status, and Claude Code's listing; a write to that layer is refused and names the doctor. The repository's own files are named as moved to This folder until doctor moves them.
- `settings-doctor`: `settings.mjs doctor` prints each problem in each layer with its fix (a removed key, a value reset to the default, a file that is not JSON left alone, a repository's `.freeflow/config.json` or `.freeflow/local.json` moved to This folder), changes nothing without `--fix`, and removes the committed file's settings only with `--committed`.

## How to get to it (user POV)

- Run `/freeflow settings` on Pi (opens This folder), `/freeflow settings --all` on Claude Code for Developer settings.
- Press `Tab` inside the Pi screen to switch tabs, `↑`/`↓` to move, `Enter` or `Space` to change a row, `Esc` to close.

## Driving it

Preconditions: a fresh `scripts/verify-live.sh launch` (the run's Freeflow home holds `settings.json` `{}`) for the Pi steps; a scratch folder holding a Git repository, and an empty folder for `FREEFLOW_HOME`, for the script and Claude Code steps. The script is `node <plugin>/skills/setup-freeflow/scripts/settings.mjs`.

Driven at `0ca2ebb1`, each step as written.

- **Open and tabs.** Run `scripts/verify-live.sh cmd "/freeflow settings"`. The header reads `Freeflow settings    Session  [This folder]  Everywhere`, the line under it reads `Freeflow home, folders.json: this repository's folder only. Overrides everywhere.`, and the cursor is on `› Freeflow  on (inherited)`, with `Task memory  on, this machine (inherited)` under it. Run `scripts/verify-live.sh keys Tab`: the header reads `[Everywhere]` and the line reads `Freeflow home, settings.json: every folder, this machine. The default for a change.`
- **Nested screen.** On This folder, run `scripts/verify-live.sh keys Down Down Down Down Down Enter`. The title reads `Freeflow settings › This folder › Each skill`, with `Deliver Work  on (inherited)` first.
- **Task memory.** On This folder, run `scripts/verify-live.sh keys Down Enter` on a fresh run: `› Task memory  on, this machine` and then `on, with sync`. The file `folders.json` holds `"memory": { "mode": "sync" }` under the fixture's path.
- **Folder off, and the footer.** Run `scripts/verify-live.sh keys Enter Enter` on Freeflow, then `Escape`: the footer reads `freeflow: off`, `/freeflow status` reads `Freeflow: disabled`, and `folders.json` holds `"enabled": false` under the fixture's path. Run `Enter` once more and `Escape`: the footer reads `freeflow: on` again.
- **Script lists.** Run `node <plugin>/skills/setup-freeflow/scripts/settings.mjs list --view normal --host claude-code`: the rows run Freeflow, Task memory, Review and Workers (read only, `Freeflow's default`), Status line and Pane. `list --view developer` adds the prompt, skill, compaction, delegation and event rows, each with its key in brackets.
- **Harness tick.** Run `settings.mjs set prompts.core off --harness-only --harness codex --scope everywhere`: output `prompts.core: off (Everywhere, only on codex)`. `get prompts.core --harness codex` gives `off`, and `get prompts.core --harness claude-code` gives `on (default)`.
- **Precedence.** With everywhere `delegation.claimHours` 8 and this folder's 2, `get delegation.claimHours` reads `2 (This folder)`; with `FREEFLOW_SESSION=s-1 set delegation.claimHours 1 --scope session`, the same `get` reads `1 (This session)`.
- **Refusal.** Run `settings.mjs set delegation.claimHours 3 --scope folder`: exit code `1`; the first line reads `delegation.claimHours takes 1, 2, 4, 8, 24, not 3`; the usage follows; nothing is written.
- **Off for one harness.** Run `settings.mjs set enabled off --scope everywhere --harness-only --harness claude-code`: output `enabled: off (Everywhere, only on claude-code)` and `Freeflow is off here. Freeflow never disables its own plugin: to stop it on this harness, run claude plugin disable freeflow.` `get enabled --harness codex` reads `on (default)`.
- **Doctor.** Run `settings.mjs doctor` in a repository holding `.freeflow/config.json` `{"enabled": false}` (the run's folder, after the legacy file was written): exit code `1`; the output reads `.freeflow/config.json (committed, shared): 1 to move to This folder`, then `enabled: moved to This folder (false)`, and `Run settings.mjs doctor --fix to write these fixes (the committed file: with --committed).` `doctor --fix` writes the folder entry and keeps the committed file, with `not rewritten: the committed file is shared`; `doctor --fix --committed` then removes it, and exits `0`.
- **A removed key.** With the home's `settings.json` holding `{"gates":{"agreement":"block","delegation":"block"},"governor":{"cap":6}}`, run `settings.mjs doctor --root .`: exit code `1`; the first line reads `Everywhere (settings.json in the home): 3 problems.`, then `gates.agreement: the Agreement gate was removed from Freeflow` with `- gates.agreement: "block"` and `+ (removed: the default applies)`, then `gates.delegation: the delegation gate has no setting: it only warns, and never blocks a call (D-069)`, and `governor.cap: the cost cap was removed from Freeflow`. Run `doctor --fix --root .`: exit code `0`, `fixed: 3 removed from Everywhere (settings.json in the home)`; with nothing else in the file, the file is removed. The removed keys are not settings: `set governor.mode stop` exits `1` with `unknown setting governor.mode`.
- **Claude Code lists.** With `FREEFLOW_HOME` set to an empty folder and `ANTHROPIC_BASE_URL=http://127.0.0.1:9` (no model call can be made), run `claude -p "/freeflow settings" --plugin-dir <plugin>`: exit code `0`, and the output starts `freeflow: Freeflow settings for <folder> (Claude Code), normal view`. `claude -p "/freeflow settings --all" ...` starts `... Developer settings`.
- **Claude Code changes one.** The same way, run `claude -p "/freeflow settings prompts.workingMethod off --harness-only" --plugin-dir <plugin>`: output `freeflow: Working Method: off, from Everywhere, only on Claude Code. The agent sees it now.`, and `settings.json` holds the value under `harness.claude-code`. The event log's sent line for the change (`what` `settings`) reads `The user changed a Freeflow setting with /freeflow settings: ` and the change, with the Runtime State lines that changed after it.

Not driven at `0ca2ebb1`, with the reason: the Codex steps (no Codex runs here); the Pi "Ignored" banner (driven through `/freeflow status`, see Activation and status).

## Gotchas

- `Enter` on the first row switches Freeflow itself for the tab you are on. Always confirm the `›` row in the printed pane before `Enter`.
- In This folder and Session, `Enter` cycles inherited, on and off (for Task memory: this machine, with sync, off, then inherited); in Everywhere it cycles on and off.
- The Pi screen closes after `Escape`, and a file-level change reloads the session; wait for the footer before the next command.
- A key moved with `Escape` leaves the cursor where it was: after a nested screen, `Escape` returns to the row that opened it, not to the top. Read the `›` row before pressing `Enter` again.
- The list scrolls past 18 rows, so a row far from the cursor is off screen until the cursor nears it; match a row by its label and value.
