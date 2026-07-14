# Setup Freeflow Eval Report - Iteration 4

Date: 2026-06-14

## Scope

Preserved the setup lifecycle regression where setup completed but the current session still did not have Freeflow's workflow context loaded.

Owned paths:

- `skills/setup-freeflow/`
- `skills/setup-freeflow/references/activation-contract.md`
- `skills/setup-freeflow/references/host-setup.md`
- `evals/prompts/stp-010.txt`
- `evals/registries/fixture-evals.json`

Setup still does not create repo-local hooks, docs inventories, handoffs, state files, `.codex/rules`, or `CONTEXT.md`.

## Skill Change

After successful setup verification, `setup-freeflow` now reads:

- `../workflow/SKILL.md`
- `../workflow/references/workflow-map.md`

It may only say workflow context is loaded for the current session after both files were read successfully.

## Eval Added

Added:

- `STP-010`: setup loads workflow for current session.

Expected behavior:

- set up Codex with only `AGENTS.md` and `.freeflow/config.json`
- verify config shape, activation count, and absence of extra setup artifacts
- read the workflow skill and workflow map before the final response
- report workflow context loaded only after those reads

## Results

`STP-010` old runtime baseline: fail.

- Baseline used setup runtime files from pre-change `8627ac8d8835fdcd770d6d56ea0420b59f0b2914`.
- Created the required `.freeflow/config.json` and `AGENTS.md`.
- Failed the workflow-loaded output check because it did not report that workflow context was loaded for the current session.

`STP-010` current skill: pass.

- Created only `.freeflow/config.json` and `AGENTS.md`.
- Verified config shape, single activation block, no `.codex/rules`, no Claude setup, no hooks, no docs, no `CONTEXT.md`, and no state files.
- Read the workflow skill and workflow map.
- Reported: "Workflow skill and workflow map were read, so workflow context is loaded for this session."

## Evidence

Saved final runs:

- `evals/runs/setup-8/stp-010-baseline-old-runtime-output.md`
- `evals/runs/setup-8/stp-010-with-skill-output.md`

Key diffs:

- `evals/runs/setup-8/stp-010-baseline-old-runtime-output.diff`
- `evals/runs/setup-8/stp-010-with-skill-output.diff`

Mechanical grades:

```sh
evals/scripts/grade-fixture-eval.sh STP-010 --output evals/runs/setup-8/stp-010-baseline-old-runtime-output.md
# fail: setup-required-files pass; workflow-loaded-output fail

evals/scripts/grade-fixture-eval.sh STP-010 --output evals/runs/setup-8/stp-010-with-skill-output.md
# pass: setup-required-files pass; workflow-loaded-output pass
```

## Verification

Commands:

```sh
evals/scripts/check-activation-contract.sh
evals/scripts/check-runtime-context-hook.sh
evals/scripts/validate-release-metadata.sh --mode prepublish --release-version 0.1.0
```

Nested `codex exec` fixture runs required escalation outside the sandbox because the in-process app-server client is blocked by sandbox permissions.
