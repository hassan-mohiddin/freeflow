# Design For Depth Eval Report - Iteration 1

Date: 2026-06-22

## Scope

Added and evaluated `design-for-depth` as a reusable design lens for module/interface/seam pressure.

The skill is intentionally progressive-disclosure:

- `plugins/freeflow/skills/design-for-depth/SKILL.md` keeps the active routing rules compact.
- `plugins/freeflow/skills/design-for-depth/references/software-design-philosophy.md` holds deeper Ousterhout/Parnas/Feathers/ports-adapters guidance.
- `plugins/freeflow/skills/design-for-depth/references/design-pressure-signals.md` holds examples and anti-patterns.

## Skill Added

Current active skill:

- `plugins/freeflow/skills/design-for-depth/SKILL.md`

Support references:

- `plugins/freeflow/skills/design-for-depth/references/software-design-philosophy.md`
- `plugins/freeflow/skills/design-for-depth/references/design-pressure-signals.md`

Core behavior:

```text
If complexity is spreading across callers, tests, docs, artifacts, or review comments, stop and classify the design pressure before patching forward.
```

The skill uses module/interface/seam/depth/locality/leverage language and routes pressure as local fix, plan defect, spec gap, owner decision, refactor candidate, or stop/defer.

## Eval Added

Added fixture:

- `plugins/freeflow/evals/fixtures/tiny-design-depth-app/`

Added prompt:

- `plugins/freeflow/evals/prompts/dfd-001.txt`

Added registry entry:

- `DFD-001` design-for-depth detects scattered notification policy.

Updated metadata:

- `plugins/freeflow/evals/registries/fixture-evals.json`
- `plugins/freeflow/evals/registries/skill-evidence.json`

## Results

| Eval | Result | Notes |
| --- | --- | --- |
| `DFD-001` scattered notification policy | Pass | The agent inspected source/tests, made no edits, rejected the quick retry-flag patch, identified caller choreography / scattered policy, and recommended a bounded notification delivery module. |

## Objective Grade

`DFD-001` final with skill:

- `no-file-changes`: pass
- `design-depth-language`: pass
- `no-quick-patch-final`: pass

## Evidence

Saved run:

- `plugins/freeflow/evals/runs/workflow-depth/dfd-001-with-skill-output.md`

Key commands:

```sh
plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh DFD-001 with-skill plugins/freeflow/evals/runs/workflow-depth/dfd-001 plugins/freeflow/evals/runs/workflow-depth/dfd-001-with-skill-output.md plugins/freeflow/skills/design-for-depth/SKILL.md < /dev/null
plugins/freeflow/evals/scripts/grade-fixture-eval.sh DFD-001 --output plugins/freeflow/evals/runs/workflow-depth/dfd-001-with-skill-output.md
```

## Observed Behavior

The passing run loaded the active skill and `references/design-pressure-signals.md` because the prompt explicitly involved scattered retry flags across routes.

Final answer correctly identified:

- retry/fallback/logging policy duplicated in route handlers;
- tests coupled to retry counts, fallback ordering, telemetry names, and provider helper names;
- the quick patch as shotgun surgery / caller choreography;
- a bounded refactor candidate: notification delivery module with an intent-level interface.

## Remaining Work

- Baseline no-skill run was not performed in this pass.
- No broader code-review or execution-spread design eval has been run yet.
- Claude paired smoke was not run.
