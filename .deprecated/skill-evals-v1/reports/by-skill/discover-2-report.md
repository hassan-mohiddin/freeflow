# Discover Eval Report - Iteration 2

Date: 2026-07-01

## Scope

Strengthened discovery as collaborative conversation navigation after a preserved failure where the user had to carry every next topic and explicitly ask for a grilling pass.

New eval:

- `DIS-003` discover navigates a topic transition.

## Failure Preserved

During sustained brainstorming, the conversation reached a natural pause around context locality in long, multi-stage work. The desired behavior is for the agent to act as a partner: summarize the settled framing, surface the next path-changing topics or route, recommend one next step, and avoid creating artifacts without permission.

## Eval Artifacts

Added:

- `evals/prompts/dis-003.txt`
- `DIS-003` in `evals/registries/fixture-evals.json`
- `DIS-003` in `evals/registries/skill-evidence.json`

## Skill Change

Updated `skills/discover/SKILL.md` to:

- Frame the agent as a collaborative partner and workflow navigator, not a passive executor.
- Track sustained discovery topics as settled, tentative, and open.
- At natural pauses, name the next 1-3 path-changing topics worth covering.
- When the user asks what next after sustained discovery, include a `Next:` route.

## Results

| Eval | Baseline | With skill | Notes |
| --- | ---: | ---: | --- |
| `DIS-003` | Fail | Pass | Baseline gave useful next content but omitted the explicit `Next:` route and context-locality framing. With-skill made no edits, preserved context-locality language, recommended a route, and included `Next:`. |

## Objective Grades

Baseline:

- `no-file-changes`: pass
- `next-route-mentioned`: fail
- `mentions-context-locality`: fail

With skill:

- `no-file-changes`: pass
- `next-route-mentioned`: pass
- `mentions-context-locality`: pass

## Evidence

Saved runs:

- `evals/runs/spec-readiness/dis-003-baseline-output.md`
- `evals/runs/spec-readiness/dis-003-baseline-output.diff`
- `evals/runs/spec-readiness/dis-003-with-skill-output.md`
- `evals/runs/spec-readiness/dis-003-with-skill-output.diff`

Commands:

```sh
evals/scripts/run-fixture-eval-by-id.sh DIS-003 baseline evals/runs/spec-readiness/dis-003-baseline evals/runs/spec-readiness/dis-003-baseline-output.md

evals/scripts/run-fixture-eval-by-id.sh DIS-003 with-skill evals/runs/spec-readiness/dis-003-with-skill evals/runs/spec-readiness/dis-003-with-skill-output.md skills/discover/SKILL.md

evals/scripts/grade-fixture-eval.sh DIS-003 --output evals/runs/spec-readiness/dis-003-baseline-output.md

evals/scripts/grade-fixture-eval.sh DIS-003 --output evals/runs/spec-readiness/dis-003-with-skill-output.md
```

## Read

The new wording keeps the behavior conversational rather than ceremonial. It does not require a `Next:` line every turn; it requires navigation when a sustained discovery topic reaches a natural transition or the user asks where to go next.
