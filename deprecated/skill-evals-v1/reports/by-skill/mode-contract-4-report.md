# Mode Contract Eval Report - Iteration 4

Date: 2026-06-15

## Scope

Clarified default mode versus current session mode and added `/workflow reset`.

The behavior boundary:

- `.freeflow/config.json` stores only `defaultMode`.
- Current mode is task, conversation, or host-session scoped.
- `/workflow conversation`, `/workflow workflow`, and `/workflow strict-workflow` change only current mode.
- `/workflow reset` clears the current override and returns to `defaultMode`.
- No current-mode state is written to repo config or repo state files.

## Runtime Change

Updated `pi-extension/index.js` so Pi:

- persists current mode override in the Pi session with `pi.appendEntry("freeflow-mode", ...)`
- restores the latest session override on `session_start`
- shows the effective mode in the footer
- injects repo default, current session override, and effective mode in runtime context
- keeps `.freeflow/config.json` default-only

## Skill And Command Surface

Updated:

- `skills/mode-contract/SKILL.md`
- `command-surface.json`
- `evals/reports/by-command-surface/command-surface-matrix.md`
- `evals/registries/skill-evidence.json`

## Eval

Added:

- `evals/prompts/mode-006.txt`
- `MODE-006` in `evals/registries/fixture-evals.json`

Result:

| Eval | Result | What It Proves |
|---|---:|---|
| `MODE-006` slash reset returns to default without state | Pass | `/workflow reset` returns to the repo default mode and does not edit config or create state files. |

Objective grade:

- `no-file-changes`: pass
- `reset-to-default`: pass

## Verification

Passed:

- `node --check pi-extension/index.js`
- JSON parse checks
- `evals/scripts/audit-command-surface.sh`
- `evals/scripts/check-runtime-context-hook.sh`
- `evals/scripts/skill-evidence.sh mode-contract`
- Pi extension mock for session start, mode switch, reset, restore, and context injection
- `evals/scripts/grade-fixture-eval.sh MODE-006 --output evals/runs/mode-contract-4/mode-006-with-skill-output.md`
- `npm_config_cache=/private/tmp/freeflow-npm-cache npm pack --dry-run --json`
- `evals/scripts/validate-release-metadata.sh --mode local --release-version 0.1.0`
- `git diff --check`

## Remaining Risk

The live `pi install .` smoke test is still manual because `pi` is not available in this shell PATH.
