# Setup Freeflow Eval Report - Iteration 3

Date: 2026-05-26

## Scope

Updated `setup-freeflow` for setup profiles and explicit persisted defaults.

Owned paths:

- `plugins/freeflow/skills/setup-freeflow/`
- setup prompts and fixture registry entries

No hooks, CLI commands, global standards, or `.codex/rules` behavior files were added.

## Skill Changes

`setup-freeflow/SKILL.md` now:

- has a trigger description that covers host selection, multi-agent activation, config creation, and setup-time default-mode changes
- keeps hard stops and host target selection in the main skill
- allows `.freeflow/config.json` to use an explicitly requested valid repo default: `conversation`, `workflow`, or `strict-workflow`
- keeps `workflow` as the default when the user does not explicitly ask to persist another mode
- links to `references/host-setup.md` for host/profile/default-mode/enforcement details

Added:

- `setup-freeflow/references/host-setup.md`

The reference keeps profile details out of always-loaded setup text:

- Codex vs Claude vs multi-agent shape
- solo/team/strict setup defaults
- enforcement requests are separate from setup
- no hooks or CLI during setup

Final main skill length: 97 lines.

## Eval Added

Added:

- `STP-008`: Codex setup with explicit request to make `strict-workflow` the repo default.

Expected behavior:

- update `AGENTS.md` with the compact Freeflow block
- create `.freeflow/config.json` with only `defaultMode: "strict-workflow"`
- avoid hooks, docs pages, state files, `.codex/rules` behavior files, and volatile config fields

## Results

`STP-008` baseline: fail.

- Added an ad hoc `AGENTS.md` block.
- Did not create `.freeflow/config.json`.
- Did not use the compact source-truth/user-decision/verification activation block.

`STP-008` current skill before revision: fail.

- Created compact `AGENTS.md` activation.
- Created `.freeflow/config.json`.
- Wrote `defaultMode: "workflow"` despite the explicit `strict-workflow` default request.

`STP-008` after revision: pass.

- Created compact `AGENTS.md` activation.
- Created `.freeflow/config.json` with only `defaultMode: "strict-workflow"`.
- Reported JSON parsing, one activation block, no `.codex/rules`, and limited file inventory.

Regression runs after the final `SKILL.md` structure and description update:

- `STP-001`: pass, default setup still writes `workflow`.
- `STP-005`: pass, Codex setup still avoids `.codex/rules`.
- `STP-006`: pass, Claude setup still uses `CLAUDE.md` import plus one `freeflow-core.md`.

## Evidence

Saved final runs:

- `evals/runs/setup-7/stp-001-with-skill-output.md`
- `evals/runs/setup-7/stp-005-with-skill-output.md`
- `evals/runs/setup-7/stp-006-with-skill-output.md`
- `evals/runs/setup-7/stp-008-with-skill-output.md`

Key diffs:

- `evals/runs/setup-7/stp-008-with-skill-output.diff`
- `evals/runs/setup-7/stp-001-with-skill-output.diff`
- `evals/runs/setup-7/stp-005-with-skill-output.diff`
- `evals/runs/setup-7/stp-006-with-skill-output.diff`

The nested agents verified config JSON and activation counts in their final responses. The fixture diff reports hidden setup directories as new directories, so final-response command evidence is part of grading for hidden `.freeflow` and `.claude` file contents.

## Verification

Commands:

```sh
jq empty plugins/freeflow/evals/registries/fixture-evals.json
wc -l plugins/freeflow/skills/setup-freeflow/SKILL.md plugins/freeflow/skills/setup-freeflow/references/host-setup.md
git diff --check
```

Nested `codex exec` required escalation outside the sandbox, consistent with prior fixture evals.
