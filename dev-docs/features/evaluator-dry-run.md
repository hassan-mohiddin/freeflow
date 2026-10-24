# Evaluator Dry Run

> **Covers:** `skills/evaluate-behavior/scripts/skill-eval.mjs`, `skills/evaluate-behavior/scripts/lib/identity.mjs`
> **Verified at:** `51b9682f` (2026-10-22)

A contributor runs the behavior evaluator with `skill-eval run <suite-or-group>`. Before anything starts it prints a plan (subjects, models, builds) and, on a terminal, asks `Start? [y/N]`. A run whose inputs are not committed is refused; `--dry-run` lets it run anyway and marks the result as a dry run that supports no claim. A dry run still runs subjects and calls models. How a run proceeds and why canonical evidence comes from commits: [Review, evaluation and verification](../subsystems/verification-review-evaluation.md).

## Sub-features

- `ev-plan`: `run` prints the plan, marked `dry run` with `--dry-run`, and asks before starting.
- `ev-decline`: answering anything but `y` at the prompt starts nothing.
- `ev-refuse`: without `--dry-run`, uncommitted inputs are refused after the plan, before any subject or login refresh.
- `ev-dry-run`: with `--dry-run`, uncommitted inputs run, and the result is marked as a dry run. Model call; unverified.

## How to get to it (user POV)

- From the repository root: `node skills/evaluate-behavior/scripts/skill-eval.mjs run <suite-or-group> [--dry-run] [--yes]`.
- Contributors usually reach it through `npm run eval:gate`, which has its own `--dry-run-plan`; that is not this feature.

## Driving it

Preconditions:

- A fresh `scripts/verify-live.sh launch`; Pi is not used. The run's empty environment and `HOME` mean no provider login reaches the evaluator, so a step that went further than intended could not call a model.
- The group `.skill-eval/verify-work/cases/VQ-001-contradictory-proof-activation.json` exists at HEAD: one description group, two arms, model `xai/grok-4.7`.

- **Results before.** Run `scripts/verify-live.sh observe ev-runs-before -- bash -c 'ls -1 "$FFV_REPO/.skill-eval/runs" 2>/dev/null | wc -l'`. Note the count.
- **Plan and decline.** Run `scripts/verify-live.sh tty ev-plan --wait 'Start? [y/N]' --keys 'n Enter' -- bash -c 'cd "$FFV_REPO" && node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/verify-work/cases/VQ-001-contradictory-proof-activation.json --dry-run'`. The terminal shows `Plan: 2 subjects (1 group, 2 arms, 1 trial); models: xai/grok-4.7 (medium); dry run`, then `Start? [y/N] n` and `Not started.`; exit code `1`.
- **Nothing started.** Run `scripts/verify-live.sh observe ev-runs-after -- bash -c 'ls -1 "$FFV_REPO/.skill-eval/runs" 2>/dev/null | wc -l'`. The count equals the one before.
- **Uncommitted input.** Run `scripts/verify-live.sh observe ev-clone -- bash -c 'git clone -q --depth 1 "file://$FFV_REPO" evclone && printf "\n" >> evclone/.skill-eval/verify-work/cases/VQ-001-contradictory-proof-activation.json && git -C evclone status --porcelain'`. Exit code `0`; output ` M .skill-eval/verify-work/cases/VQ-001-contradictory-proof-activation.json`.
- **Refused.** Run `scripts/verify-live.sh observe ev-refuse -- bash -c 'cd evclone && node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/verify-work/cases/VQ-001-contradictory-proof-activation.json --yes'`. Exit code `1`; output `Plan: 2 subjects (1 group, 2 arms, 1 trial); models: xai/grok-4.7 (medium)` and `uncommitted inputs: .skill-eval/verify-work/cases/VQ-001-contradictory-proof-activation.json; commit them, or run with --dry-run`.
- **Nothing written.** Run `scripts/verify-live.sh observe ev-refuse-nothing-written -- bash -c 'ls -A evclone/.skill-eval/runs; git -C evclone status --porcelain --ignored'`. `ls` reports no such directory, and the only change is the edited definition. Then clean up.
- **Dry run. Model call; unverified.** Needs the user's yes, a run launched with `--allow-model-call`, a full clone (`git clone "file://$FFV_REPO" evclone`, since the group's subject source is pinned to an older commit), and the group's `model` edited to a cheap one. Run the **Refused** step's command with `--dry-run` added. The evaluator should start both subjects and write a result whose `summary.json` has `"dryRun": true`.

## Gotchas

- `--dry-run` is not a way to see what would happen without spending: it runs subjects. To check definitions without a model, use `npm run check:eval-definitions`; to check a coding task, `skill-eval check-tasks`.
- Without a terminal, `run` prints the plan and starts without asking. Drive the prompt with `tty`, never `observe`, and give `--yes` only to a step that must stop at the refusal.
- The clone has the committed state of this checkout, so the refusal steps check committed evaluator code. Commit an evaluator change before driving them.
- The group's subject source is pinned to an old commit that a shallow clone lacks; the refusal comes first, so these steps never need it.
