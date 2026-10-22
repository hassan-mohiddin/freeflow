# Workflow Commands

> **Covers:** `pi-extension/src/host/catalog.ts`
> **Verified at:** `88f1e98d` (2026-10-22)
> **User docs:** `plugin-docs/workflow.md`

Freeflow registers one Pi command per workflow skill, under the skill's own name (`/discuss-work`, `/execute-work`, `/deliver-work`, `/verify-work`, `/review-work` and the rest, plus `/setup-freeflow`, `/write-skill` and `/evaluate-behavior`). A skill removed or merged in 0.9.0 keeps no command: `/discuss`, `/bypass`, `/action-selection`, `/commit-work`, `/finish-branch`, `/release-work`, `/launch-work`, `/simplify-code`, `/migration-work`, `/diagnose-failure`, `/write-spec`, `/write-plan` and `/handoff` are gone: Write Docs owns specs and plans, and Track Work handoffs. Each sends its skill to the model as the next turn, so running one is a model call. Typing one and reading its completions is not. How skills route to each other: [Skill routing](../subsystems/skill-routing.md); how they reach the model: [Prompt assembly](../subsystems/prompt-assembly.md).

## Sub-features

- `wf-complete`: typing a command's prefix offers it in Pi's completion menu, with its description.
- `wf-removed`: no command remains for a skill removed or merged in 0.9.0.
- `wf-command`: a workflow command runs its skill and the agent answers under it. Model call; unverified.
- `wf-setup`: `/setup-freeflow` creates `.freeflow/config.json`. Model call; unverified.

## How to get to it (user POV)

- Type `/` in the Pi editor and pick a command, or type it in full, such as `/verify-work check the build`.
- The canonical list is `WORKFLOW_COMMANDS` and `CONTRIBUTOR_COMMANDS` in `pi-extension/src/host/catalog.ts`.

## Driving it

Preconditions:

- For the completion steps: a fresh `scripts/verify-live.sh launch`, and `scripts/verify-live.sh doctor` passes. No model call.
- For the steps that run a skill: the user's yes for the model calls, and a run launched with a pinned cheap model, `FFV_PI_ARGS="--model <provider/id>" scripts/verify-live.sh launch --allow-model-call`; `run.env` records the flags as `extra_pi_args`.

- **Completion, no model call.** Run `scripts/verify-live.sh keys "/discuss"`. The menu under the editor shows `→ discuss-work` with `Run Freeflow discuss-work`, and no `discuss` command of its own. Then `scripts/verify-live.sh snap wf-complete`.
- **Empty the editor.** Run `scripts/verify-live.sh keys C-u`, then `scripts/verify-live.sh doctor`: `ok   editor idle`.
- **Off skill, model-free part.** A skill the user turned off keeps its command, which says it is off instead of starting a turn; the Settings screen's `settings-skills` step shows it is not loaded. The command's refusal needs `cmd --allow-model-call` to type, so it is unverified live and covered by the test `Pi leaves out a skill and a runtime prompt the user turned off, and tells the agent`.
- **No removed commands, no model call.** Run `scripts/verify-live.sh keys "/byp"`: the menu offers no `bypass` command or skill. Empty the editor with `C-u`, run `scripts/verify-live.sh keys "/commit"`: the menu offers no `commit-work` command. Then `scripts/verify-live.sh snap wf-removed`, empty the editor with `C-u`, and clean up.
- **Run a skill. Model call; unverified.** Run `scripts/verify-live.sh cmd "/verify-work does README.md exist?" --allow-model-call`. The transcript should show the skill loaded and the agent's answer under it. Snap it as `wf-command`.
- **Set up a repository. Model call; unverified.** In a run launched with `--no-config` and `--allow-model-call`, run `scripts/verify-live.sh cmd "/setup-freeflow" --allow-model-call`, follow the agent's questions, and observe `.freeflow/config.json`.

## Gotchas

- `Escape` closes the completion menu but leaves the typed text in the editor; `C-u` empties it. Until the editor is empty, `cmd` refuses to type and doctor fails `editor idle`.
- `cmd` refuses every workflow command without `--allow-model-call`, and that flag needs a run launched with it, which keeps your environment. That guard is the only thing between a typo and a paid request.
- Without a pinned model, Pi picks whatever its catalog chooses, which is not a cheap one.
- `wf-command` and `wf-setup` have not been driven: no run so far had the user's yes for a model call. They stay unverified until one does.
