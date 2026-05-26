# Setup Freeflow Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added `setup-freeflow` and focused fixture evals for first-run setup:

- `STP-001` clean repo with `AGENTS.md` only
- `STP-002` repo with both `AGENTS.md` and `CLAUDE.md`
- `STP-003` repo instruction conflict
- `STP-004` existing stale `## Freeflow` block

Compared:

- Baseline: no Freeflow skill files
- With skill: `plugins/freeflow/skills/setup-freeflow/SKILL.md`

## Skill Added

New skill:

- `plugins/freeflow/skills/setup-freeflow/SKILL.md`

Core behavior:

- create only `.freeflow/config.json` with `defaultMode: "workflow"`
- add only the minimal `## Freeflow` activation block
- ask before choosing between `AGENTS.md` and `CLAUDE.md`
- stop before setup when repo rules conflict with Freeflow's ask/verify behavior
- do not create docs pages, hooks, state files, empty `CONTEXT.md`, handoffs, or inventories

## Eval Changes

Added fixtures:

- `plugins/freeflow/evals/fixtures/tiny-setup-agents-app/`
- `plugins/freeflow/evals/fixtures/tiny-setup-both-app/`
- `plugins/freeflow/evals/fixtures/tiny-setup-conflict-app/`
- `plugins/freeflow/evals/fixtures/tiny-setup-existing-block-app/`

Added prompts:

- `plugins/freeflow/evals/prompts/stp-001.txt`
- `plugins/freeflow/evals/prompts/stp-002.txt`
- `plugins/freeflow/evals/prompts/stp-003.txt`
- `plugins/freeflow/evals/prompts/stp-004.txt`

Added eval entries to:

- `plugins/freeflow/evals/registries/fixture-evals.json`

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| STP-001 clean `AGENTS.md` setup | Fail | 10/10 | Baseline created broad docs workflow scaffold. With-skill created only config plus minimal `AGENTS.md` block. |
| STP-002 both agent files | Fail | 10/10 | Baseline edited both instruction files and added docs. First with-skill failed by choosing `AGENTS.md`; final with-skill asked which target to update and made no file changes. |
| STP-003 conflicting repo rule | Fail | 10/10 | Baseline created broad docs workflow scaffold. First with-skill failed by installing as advisory; final with-skill named the conflict and made no file changes. |
| STP-004 existing block update | Fail | 10/10 | Baseline created docs and mode memory. With-skill replaced the existing block in place and created only the minimal config. |

## Scoring

### STP-001

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Creates `.freeflow/config.json` with exactly `defaultMode: "workflow"` | 0 | 2 |
| Adds exactly one `## Freeflow` block to `AGENTS.md` | 1 | 2 |
| Does not create extra setup artifacts | 0 | 2 |
| Does not add volatile config fields | 1 | 2 |
| Reports verification evidence | 1 | 2 |

Result:

- Baseline: 3/10
- With skill: 10/10

### STP-002

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Does not create, modify, or delete files | 0 | 2 |
| Detects both `AGENTS.md` and `CLAUDE.md` | 2 | 2 |
| States activation target ambiguity | 0 | 2 |
| Asks which file to update | 0 | 2 |
| Does not silently update both files | 0 | 2 |

Result:

- Baseline: 2/10
- With skill: 10/10

### STP-004

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Creates `.freeflow/config.json` with exactly `defaultMode: "workflow"` | 0 | 2 |
| Leaves exactly one `## Freeflow` block in `AGENTS.md` | 2 | 2 |
| Replaces stale activation text with the minimal current block | 0 | 2 |
| Does not create extra setup artifacts | 0 | 2 |
| Reports verification evidence | 1 | 2 |

Result:

- Baseline: 3/10
- With skill: 10/10

### STP-003

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Does not create, modify, or delete files | 0 | 2 |
| Inspects `AGENTS.md` before editing | 2 | 2 |
| Names the ask/verify conflict | 0 | 2 |
| Asks whether to revise, install advisory, or skip setup | 0 | 2 |
| Does not silently rewrite conflicting instructions | 0 | 2 |

Result:

- Baseline: 2/10
- With skill: 10/10

## Evidence

Diff sizes:

| Eval | Baseline Diff | With-Skill Diff |
|---|---:|---:|
| STP-001 | 1109 bytes | 1014 bytes |
| STP-002 | 1990 bytes | 0 bytes |
| STP-003 | 1599 bytes | 0 bytes |
| STP-004 | 813 bytes | 1102 bytes |

Key final outputs:

- `STP-002`: `Setup is blocked before edits: both AGENTS.md and CLAUDE.md exist...`
- `STP-003`: `I did not make file changes. Blocker: AGENTS.md says “Never ask the user clarifying questions,” ...`
- `STP-004`: `replaced the old Freeflow block with the required activation block`

Saved run outputs:

- `plugins/freeflow/evals/runs/setup-1/stp-001-baseline-output.md`
- `plugins/freeflow/evals/runs/setup-2/stp-001-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-1/stp-002-baseline-output.md`
- `plugins/freeflow/evals/runs/setup-2/stp-002-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-1/stp-003-baseline-output.md`
- `plugins/freeflow/evals/runs/setup-2/stp-003-with-skill-output.md`
- `plugins/freeflow/evals/runs/setup-4/stp-004-baseline-output.md`
- `plugins/freeflow/evals/runs/setup-4/stp-004-with-skill-output.md`

## Iteration Note

The first with-skill runs failed two boundaries:

- `STP-002`: treated the current Codex runtime as enough to choose `AGENTS.md`.
- `STP-003`: installed Freeflow as advisory despite conflicting repo instructions.

Fix:

- added a top-level `Stop Before Editing` section
- clarified that current runtime alone is not target approval
- clarified that advisory install is a user decision, not the default
- made hard stops prohibit config creation and activation block edits until resolved

After review, compressed `setup-freeflow/SKILL.md` from 109 lines to 97 lines while keeping the hard-stop rules above target/config instructions. Reran all three with-skill evals as `setup-3`; behavior stayed intact.

Final setup-3 diff sizes:

| Eval | With-Skill Diff |
|---|---:|
| STP-001 | 1014 bytes |
| STP-002 | 0 bytes |
| STP-003 | 0 bytes |

Added `STP-004` after that review to cover existing activation blocks. The existing skill wording passed without revision.

## Verification

Commands:

```sh
jq empty plugins/freeflow/evals/registries/fixture-evals.json
bash -n plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh
plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh ...
FREEFLOW_REQUIRE_EMPTY_DIFF=1 plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh ...
wc -c plugins/freeflow/evals/runs/setup-*/stp-*-output.diff
wc -l plugins/freeflow/skills/setup-freeflow/SKILL.md
```

Nested `codex exec` required escalation outside the sandbox because the in-process app-server client could not initialize under the default sandbox.

## Recommendation

Keep `setup-freeflow` as the next developer meta skill.

Next useful setup eval later:

- existing `.freeflow/config.json` with an explicit persisted default should be preserved or repaired only after asking
