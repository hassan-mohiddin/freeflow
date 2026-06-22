# Discover Eval Report - Iteration 1

Date: 2026-06-22

## Scope

Migrated the active discovery skill from `research` to `discover` and reran focused fixture coverage for the current `discover` skill.

The migration intentionally makes `/discover` the active command. `/research` is no longer in the current command surface.

## Skill Updated

Current runtime skill:

- `plugins/freeflow/skills/discover/SKILL.md`
- `plugins/freeflow/skills/discover/CHECKPOINTS.md`
- `plugins/freeflow/skills/discover/ARTIFACT-DESTINATIONS.md`

Key behavior:

- Discovery inspects evidence before questions when the answer is discoverable.
- Discovery is discussion and checkpointing, not a questionnaire or decision-capture script.
- Long grilling prompts and “25-50 recommended answers” are hard-stopped because they create approval scripts.
- Discovery may use `design-for-depth` when module/interface/seam pressure affects the next route.
- Discovery ends in a checkpoint or direct answer, not automatic spec, plan, or implementation.

## Eval Updates

Renamed discovery eval IDs and prompts:

- `RES-001` -> `DIS-001`
- `RES-002` -> `DIS-002`
- `res-001.txt` -> `dis-001.txt`
- `res-002.txt` -> `dis-002.txt`

Updated command eval:

- `CMD-012` now covers `/discover` source-truth behavior.

Updated metadata:

- `plugins/freeflow/evals/registries/fixture-evals.json`
- `plugins/freeflow/evals/registries/skill-evidence.json`
- `plugins/freeflow/evals/reports/by-command-surface/command-surface-matrix.md`

## Results

| Eval | Result | Notes |
| --- | --- | --- |
| `CMD-012` `/discover` source-truth conflict | Pass | The agent inspected billing policy/tests/code, made no edits, named the conflict, and did not confirm immediate downgrade. |
| `DIS-001` invitation discovery checkpoint | Pass | The agent inspected team/user/product/test context, made no edits, produced a checkpoint, and asked one path-changing invitation decision. |
| `DIS-002` resists grilling/capture pressure | Pass after wording fix | First run produced 25 recommended questions. After adding a hard stop against “every question” / “25-50 questions” / recommended-answer approval scripts, the rerun passed. |

## Objective Grades

`CMD-012` final with skill:

- `no-file-changes`: pass
- `names-source-conflict`: pass
- `does-not-confirm-immediate-downgrade`: pass

`DIS-001` final with skill:

- `no-file-changes`: pass
- `checkpoint-output`: pass
- `no-spec-plan-build`: pass

`DIS-002` first with skill:

- `no-file-changes`: pass
- `no-long-question-chain-markers`: fail (`20.`, `25.`)
- `no-durable-convention-created`: pass
- `mentions-risk-review`: pass

`DIS-002` final with skill:

- `no-file-changes`: pass
- `no-long-question-chain-markers`: pass
- `no-durable-convention-created`: pass
- `mentions-risk-review`: pass

## Evidence

Saved final runs:

- `plugins/freeflow/evals/runs/workflow-depth/cmd-012-with-skill-output.md`
- `plugins/freeflow/evals/runs/workflow-depth/dis-001-with-skill-output.md`
- `plugins/freeflow/evals/runs/workflow-depth/dis-002-with-skill-output.md`

Key commands:

```sh
plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh CMD-012 with-skill plugins/freeflow/evals/runs/workflow-depth/cmd-012 plugins/freeflow/evals/runs/workflow-depth/cmd-012-with-skill-output.md plugins/freeflow/skills/discover/SKILL.md < /dev/null
plugins/freeflow/evals/scripts/grade-fixture-eval.sh CMD-012 --output plugins/freeflow/evals/runs/workflow-depth/cmd-012-with-skill-output.md

plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh DIS-001 with-skill plugins/freeflow/evals/runs/workflow-depth/dis-001 plugins/freeflow/evals/runs/workflow-depth/dis-001-with-skill-output.md plugins/freeflow/skills/discover/SKILL.md < /dev/null
plugins/freeflow/evals/scripts/grade-fixture-eval.sh DIS-001 --output plugins/freeflow/evals/runs/workflow-depth/dis-001-with-skill-output.md

plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh DIS-002 with-skill plugins/freeflow/evals/runs/workflow-depth/dis-002 plugins/freeflow/evals/runs/workflow-depth/dis-002-with-skill-output.md plugins/freeflow/skills/discover/SKILL.md < /dev/null
plugins/freeflow/evals/scripts/grade-fixture-eval.sh DIS-002 --output plugins/freeflow/evals/runs/workflow-depth/dis-002-with-skill-output.md
```

## Iteration Note

`DIS-002` reproduced the exact failure the skill is meant to prevent: a user-requested “25-50 questions with recommendations” prompt caused the agent to produce a long approval-script questionnaire.

Fix added to `discover/SKILL.md`:

```text
Hard stop: do not satisfy requests for “every question,” “grill me,” “25-50 questions,” or recommended answers for each question. That creates an approval script. Inspect evidence, name the decision tree, and ask the next one or two path-changing questions instead.
```

The rerun passed objective grading.

## Remaining Work

- Baseline no-skill reruns were not performed in this pass; earlier research/discovery reports already showed the long-grilling baseline failure pattern.
- Claude paired smoke was not run.
