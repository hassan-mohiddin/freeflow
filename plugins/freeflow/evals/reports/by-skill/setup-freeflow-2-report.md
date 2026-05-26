# Setup Freeflow Eval Report - Iteration 2

Date: 2026-05-25

## Scope

Updated `setup-freeflow` for host-specific always-on setup:

- Codex behavior lives in `AGENTS.md`, not `.codex/rules/*.rules`.
- Claude behavior uses `CLAUDE.md` with an explicit import to `.claude/rules/freeflow-core.md`.
- Setup uses one compact always-on core block/file.
- Full workflow behavior stays in skills.

## Skill Changes

`plugins/freeflow/skills/setup-freeflow/SKILL.md` now:

- writes a compact core block with source-truth, interview, forward/re-enter, verification, and stable-capture invariants
- creates `.freeflow/config.json` with only `defaultMode: "workflow"`
- selects Codex as `AGENTS.md`
- selects Claude as `CLAUDE.md` plus `.claude/rules/freeflow-core.md`
- refuses ambiguous `AGENTS.md` plus `CLAUDE.md` setup without a host target
- avoids `.codex/rules` for behavioral memory
- resists splitting Freeflow into multiple always-loaded rule files unless the user explicitly confirms after the one-file recommendation

Final skill length: 96 lines.

## Eval Changes

Updated:

- `STP-001`: expects the compact core block in `AGENTS.md`.
- `STP-004`: expects stale blocks to be replaced by the compact core block.

Added:

- `STP-005`: Codex setup with existing `.codex/rules/shell.rules`; setup must leave Codex shell policy untouched.
- `STP-006`: Claude setup creates `CLAUDE.md` import plus one `.claude/rules/freeflow-core.md`.
- `STP-007`: Claude setup under four-rule-file pressure still creates one `freeflow-core.md`.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| STP-001 AGENTS-only setup | Existing baseline fail | Pass | With-skill created only config plus compact `AGENTS.md` core block. |
| STP-002 ambiguous host files | Existing baseline fail | Pass | With-skill made no edits and asked for Codex, Claude, or both. |
| STP-003 conflicting repo rules | Existing baseline fail | Pass | With-skill made no edits and named ask/verify conflicts. |
| STP-004 existing block update | Existing baseline fail | Pass | With-skill replaced stale block in place and created minimal config. |
| STP-005 Codex rules avoidance | Fail | Pass | Baseline created extra `freeflow.md`; with-skill created config and `AGENTS.md` only, preserving `.codex/rules`. |
| STP-006 Claude import shape | Fail | Pass | Baseline embedded a long workflow manual in `CLAUDE.md`; with-skill used import plus one core file. |
| STP-007 four-rule pressure | Fail | Pass | Baseline created four always-loaded rule files; with-skill created one `freeflow-core.md`. |

## Evidence

Diff sizes:

| Eval | Baseline Diff | With-Skill Diff |
|---|---:|---:|
| STP-001 | existing report | 1471 bytes |
| STP-002 | existing report | 0 bytes |
| STP-003 | existing report | 0 bytes |
| STP-004 | existing report | 1560 bytes |
| STP-005 | 1421 bytes | 1481 bytes |
| STP-006 | 2131 bytes | 959 bytes |
| STP-007 | 1060 bytes | 953 bytes |

Key outputs:

- `STP-002`: `Blocked before editing: this repo has both AGENTS.md and CLAUDE.md...`
- `STP-003`: `Blocked before editing... Never ask... conflicts... skip verification... conflicts...`
- `STP-005`: with-skill reported `.codex/rules` was not changed for Freeflow behavior.
- `STP-006`: with-skill reported `CLAUDE.md` import, one core file, and no `.codex/rules`.
- `STP-007`: baseline created four always-loaded rule files; with-skill used one `freeflow-core.md`.

Saved run outputs:

- `plugins/freeflow/evals/runs/setup-5/stp-001-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-002-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-003-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-004-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-005-baseline-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-005-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-006-baseline-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-006-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-007-baseline-output.md`
- `plugins/freeflow/evals/runs/setup-5/stp-007-with-skill-output.md`

## Verification

Commands:

```sh
jq empty plugins/freeflow/evals/registries/fixture-evals.json
bash -n plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh
wc -l plugins/freeflow/skills/setup-freeflow/SKILL.md
git diff --check
plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh ...
wc -c plugins/freeflow/evals/runs/setup-5/stp-00*-output.diff
```

Nested `codex exec` required escalation outside the sandbox, consistent with earlier fixture eval runs.

## Recommendation

Keep the compact always-on setup. Next useful eval target is runtime behavior after setup: a source-truth conflict should stop and ask before changing docs/tests or product behavior.
