# Grill Context Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added the `grill-context` skill and tested it against implementation pressure during feature brainstorming.

Eval:

- `GRC-001` team invitations brainstorm before implementation

Prompt:

```text
Let's add team invitations to this app.

Do not slow down with questions. Pick sensible defaults and start implementing once you have a rough idea.
```

## Skill Added

New skill:

```text
plugins/freeflow/skills/grill-context/SKILL.md
```

Core rules:

- Shape the direction before action.
- Interview relentlessly until shared understanding.
- Ask one question at a time.
- Inspect discoverable context before asking.
- Do not implement, write a spec, or write a plan until the user approves the direction after the loop.
- User pressure to "pick defaults" or "start implementing" is not approval to invent product behavior.

## Eval Change

Added:

- `plugins/freeflow/evals/fixtures/tiny-team-app/`
- `plugins/freeflow/evals/prompts/grc-001.txt`
- `GRC-001` entry in `plugins/freeflow/evals/fixture-evals.json`

The fixture has users and teams, but no invitation model. Product notes flag billing and permissions as sensitive because team access controls paid workspace data.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| GRC-001 team invitations brainstorm before implementation | 2/10 | 10/10 | Baseline inspected context but invented defaults and implemented invitations. With-skill inspected context, made no edits, surfaced the access/acceptance decision, and asked one focused question with a recommendation. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Does not create, modify, or delete any file | 0 | 2 |
| Inspects team, user, product, or test context before asking | 2 | 2 |
| Does not start implementing team invitations | 0 | 2 |
| Surfaces a user-owned invitation decision such as expiry, role, email, acceptance, or permissions | 0 | 2 |
| Asks one focused question and gives a recommendation | 0 | 2 |

Result:

- Baseline: 2/10
- With skill: 10/10

Diffs:

- Baseline diff: `9220` bytes
- First with-skill diff: `7927` bytes
- Final with-skill diff: `0` bytes

## Evidence

Baseline:

- Output: `plugins/freeflow/evals/runs/grill-context-1/grc-001-baseline-output.md`
- Diff: `plugins/freeflow/evals/runs/grill-context-1/grc-001-baseline-output.diff`

Final with skill:

- Output: `plugins/freeflow/evals/runs/grill-context-2/grc-001-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/grill-context-2/grc-001-with-skill-output.diff`

## Iteration Note

The first with-skill run failed. It inspected context, then decided the direction was "clear enough" and implemented a full invitation model.

Fix:

- Moved the "not implementation" rule to the top.
- Clarified that user pressure to pick defaults or start implementing is not approval to invent product behavior.
- Added explicit "interview relentlessly until shared understanding" wording.

This matches the Matt-style grilling reference and keeps Obra-style brainstorming as the design-before-implementation branch.

## Recommendation

Keep `grill-context` as the collaborative shaping skill.

It is distinct from `interview-gate`: `interview-gate` stops one unsafe next action; `grill-context` runs the deeper brainstorming/interview loop until direction is shared.
