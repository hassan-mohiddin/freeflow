# Workflow Commands

> **Covers:** `pi-extension/src/host/catalog.ts`
> **Verified at:** `1b1ad851` (2026-10-21)
> **User docs:** `plugin-docs/workflow.md`

Freeflow registers one Pi command per workflow skill (`/discuss`, `/write-plan`, `/verify-work`, `/review-work`, `/commit-work`, `/bypass next|task` and the rest, plus `/setup-freeflow`, `/write-skill` and `/evaluate-behavior`). Each sends that skill to the model as the next turn, so running one is a model call. Typing one and reading its completions is not. How skills route to each other: [Skill routing](../subsystems/skill-routing.md); how they reach the model: [Prompt assembly](../subsystems/prompt-assembly.md).

## Sub-features

- `wf-complete`: typing a command's prefix offers it in Pi's completion menu, with its description.
- `wf-bypass-args`: `/bypass ` offers the arguments `next` and `task`.
- `wf-command`: a workflow command runs its skill and the agent answers under it. Model call; unverified.
- `wf-setup`: `/setup-freeflow` creates `.freeflow/config.json`. Model call; unverified.

## How to get to it (user POV)

- Type `/` in the Pi editor and pick a command, or type it in full, such as `/verify-work check the build`.
- The canonical list is `WORKFLOW_COMMANDS` and `CONTRIBUTOR_COMMANDS` in `pi-extension/src/host/catalog.ts`.

## Driving it

Preconditions:

- For the completion steps: a fresh `scripts/verify-live.sh launch`, and `scripts/verify-live.sh doctor` passes. No model call.
- For the steps that run a skill: the user's yes for the model calls, and a run launched with a pinned cheap model, `FFV_PI_ARGS="--model <provider/id>" scripts/verify-live.sh launch --allow-model-call`; `run.env` records the flags as `extra_pi_args`.

- **Completion, no model call.** Run `scripts/verify-live.sh keys "/byp"`. The menu under the editor shows `→ bypass        [t] Run Freeflow bypass` and a `skill:bypass` row. Then `scripts/verify-live.sh snap wf-complete`.
- **Empty the editor.** Run `scripts/verify-live.sh keys C-u`, then `scripts/verify-live.sh doctor`: `ok   editor idle`.
- **Bypass arguments, no model call.** Run `scripts/verify-live.sh keys "/bypass "`. The menu shows `→ next` with `Skip one optional step`, and `task` with `Reduce optional pressure for the current task`. Then `scripts/verify-live.sh snap wf-bypass-args`, `scripts/verify-live.sh keys C-u`, and clean up.
- **Run a skill. Model call; unverified.** Run `scripts/verify-live.sh cmd "/verify-work does README.md exist?" --allow-model-call`. The transcript should show the skill loaded and the agent's answer under it. Snap it as `wf-command`.
- **Set up a repository. Model call; unverified.** In a run launched with `--no-config` and `--allow-model-call`, run `scripts/verify-live.sh cmd "/setup-freeflow" --allow-model-call`, follow the agent's questions, and observe `.freeflow/config.json`.

## Gotchas

- `Escape` closes the completion menu but leaves the typed text in the editor; `C-u` empties it. Until the editor is empty, `cmd` refuses to type and doctor fails `editor idle`.
- `cmd` refuses every workflow command without `--allow-model-call`, and that flag needs a run launched with it, which keeps your environment. That guard is the only thing between a typo and a paid request.
- Without a pinned model, Pi picks whatever its catalog chooses, which is not a cheap one.
- `wf-command` and `wf-setup` have not been driven: no run so far had the user's yes for a model call. They stay unverified until one does.
