# Research Eval Report - Iteration 1

Date: 2026-06-17

## Scope

Added a new `research` skill as the deeper discovery module for shaping ideas before spec, plan, build, or durable memory.

The skill replaces the shallow runtime split between evidence gathering, grilling, and decision capture with one loop:

```text
evidence -> user challenge / deeper question -> targeted question -> checkpoint -> route
```

It imports the deep-module language from the architecture skill so research can shape future code from the beginning: module, interface, implementation, depth, seam, adapter, leverage, locality, and deletion test.

## Skill Added

Added:

- `plugins/freeflow/skills/research/SKILL.md`
- `plugins/freeflow/skills/research/LANGUAGE.md`
- `plugins/freeflow/skills/research/CHECKPOINTS.md`
- `plugins/freeflow/skills/research/ARTIFACT-DESTINATIONS.md`

Core behavior:

- Research ends in a checkpoint, not automatic implementation.
- Checkpoints stay in chat for short-lived work, or are saved in the narrowest owning artifact when future work needs them.
- Questions use the deletion test: if skipping the question makes downstream complexity spread, it matters.
- Long question chains are treated as a failure mode, especially when the user asks for 25-50 recommended answers to approve.
- Durable decisions are routed by owner: glossary/domain doc, spec, plan, handoff, ADR, or chat.
- Research stops and asks when it reveals user-owned decisions, source-truth conflicts, path conflicts, or material method substitutions.

Final main skill length after support-file links: 128 lines. The extra length is intentional for this deep workflow module.

## Eval Added

Added prompts:

- `plugins/freeflow/evals/prompts/res-001.txt`
- `plugins/freeflow/evals/prompts/res-002.txt`

Added registry entries:

- `RES-001` research checkpoint before team invitations spec.
- `RES-002` research resists long grilling and capture pressure.
- `CMD-012` `/research` command preserves billing source truth.

Updated:

- `plugins/freeflow/evals/registries/fixture-evals.json`
- `plugins/freeflow/evals/registries/skill-evidence.json`

## Results

| Eval | Baseline | First with skill | Final with skill | Read |
| --- | ---: | ---: | ---: | --- |
| `RES-001` checkpoint before team invitations spec | Fail | Pass | Pass | Baseline inspected evidence and avoided edits, but did not produce the checkpoint shape. With-skill produced a research checkpoint, made no edits, and asked one path-changing invitation decision. |
| `RES-002` resists long grilling/capture pressure | Fail | Fail | Pass | Baseline followed pressure and asked 32 recommended questions. First with-skill also asked 32 questions. After tightening the long-question-chain rule, final with-skill asked one high-level direction question and produced a ledger/checkpoint. |

## Objective Grades

`RES-001` baseline:

- `no-file-changes`: pass
- `checkpoint-output`: fail
- `no-spec-plan-build`: pass

`RES-001` final with skill:

- `no-file-changes`: pass
- `checkpoint-output`: pass
- `no-spec-plan-build`: pass

`RES-002` baseline:

- `no-file-changes`: pass
- `no-long-question-chain-markers`: fail (`20.`, `25.`, `30.`, `32.`, `Below is the grill`)
- `no-durable-convention-created`: pass
- `mentions-risk-review`: pass

`RES-002` first with skill:

- `no-file-changes`: pass
- `no-long-question-chain-markers`: fail (`20.`, `25.`, `30.`, `32.`)
- `no-durable-convention-created`: pass
- `mentions-risk-review`: pass

`RES-002` final with skill:

- `no-file-changes`: pass
- `no-long-question-chain-markers`: pass
- `no-durable-convention-created`: pass
- `mentions-risk-review`: pass

## Evidence

Saved runs:

- `plugins/freeflow/evals/runs/research-1/res-001-baseline-output.md`
- `plugins/freeflow/evals/runs/research-1/res-001-with-skill-output.md`
- `plugins/freeflow/evals/runs/research-1/res-002-baseline-output.md`
- `plugins/freeflow/evals/runs/research-1/res-002-with-skill-output.md`
- `plugins/freeflow/evals/runs/research-2/res-002-with-skill-output.md`
- `plugins/freeflow/evals/runs/research-2/res-001-with-skill-output.md`
- `plugins/freeflow/evals/runs/research-command-1/cmd-012-with-skill-output.md`

Key grading commands:

```sh
plugins/freeflow/evals/scripts/grade-fixture-eval.sh RES-001 --output plugins/freeflow/evals/runs/research-2/res-001-with-skill-output.md
plugins/freeflow/evals/scripts/grade-fixture-eval.sh RES-002 --output plugins/freeflow/evals/runs/research-2/res-002-with-skill-output.md
plugins/freeflow/evals/scripts/grade-fixture-eval.sh CMD-012 --output plugins/freeflow/evals/runs/research-command-1/cmd-012-with-skill-output.md
```

Both final with-skill grades passed.

After command-surface migration, `CMD-012` was updated from `/research-brief` to `/research` and passed objective grading: no file changes, source-truth conflict named, and immediate downgrade not confirmed.

Post-review wording and structure refinement:

- Replaced the confusing `recommended answers I can agree with` phrasing with `Do not turn recommendations into an approval script`.
- Added support files for progressive disclosure: language, checkpoints, and artifact destinations. Removed the question-discipline support file because it repeated active `SKILL.md` rules.
- Refined the `RES-002` objective check so refusing to dump `25-50 questions` does not fail merely for mentioning the user's pressure phrase.
- Reran `RES-001` and `RES-002` into `plugins/freeflow/evals/runs/research-4/`; both final with-skill grades passed.

## Iteration Note

The first `RES-002` with-skill run exposed the exact failure Hassan described: the skill still allowed a 32-question grilling session because the wording said to prefer deeper questions but did not forbid dumping a long questionnaire under pressure.

Fix:

```text
Long question chains are a failure mode, not diligence. Do not answer pressure for "every question", "25-50 questions", or "recommended answers I can agree with" by dumping a long questionnaire. That creates shallow approvals.
```

This rule earned its place.

## Recommendation

Keep the new `research` skill as the active deep discovery module.

Follow-up change landed after review: `research-brief`, `grill-context`, and `capture-decisions` were moved to root `deprecated/skills/`, `/research` became the active discovery command, and current docs/command-surface metadata were updated.
