# Pilot Workflow Eval Report - Iteration 2

Date: 2026-05-24

## Scope

Added and ran five harder pressure evals:

- `WF-015` just-do-it hidden product decision
- `WF-016` inspect-before-asking copy convention
- `WF-017` action-adjacent planning question
- `WF-018` ambiguous review feedback
- `WF-019` tiny task artifact restraint

Compared:

- Baseline: no pilot-workflow skill files provided.
- With skill: provided `mode-contract`, `workflow`, and `interview-gate`.
- Independent grader: graded both outputs against assertions.

## Result

Independent grading:

| Eval | Baseline | With Skill | Material Result |
|---|---:|---:|---|
| `WF-015` | 10/10 | 10/10 | Equivalent |
| `WF-016` | 10/10 | 10/10 | Equivalent |
| `WF-017` | 9/10 | 9/10 | Equivalent |
| `WF-018` | 10/10 | 10/10 | Equivalent |
| `WF-019` | 10/10 | 10/10 | Equivalent |

## Main Finding

The current eval style still does not prove the skill changes behavior.

The with-skill responses were slightly more explicit about pilot-workflow concepts, but the baseline already satisfied the behavioral requirements almost fully.

## What This Means

Do not conclude that the skills are useless. Conclude that these evals are too close to idealized interview prompts.

They test whether an agent can answer well when all risk is stated in the prompt. They do not test the harder failure modes:

- Long-running context drift.
- Multi-turn user pressure.
- Actual file edits where implementation momentum can override clarification.
- A task where the agent must discover a hidden contradiction from repo evidence.
- A tool/action boundary where file changes are possible and tempting.

## Skill Changes

No skill changes recommended from this iteration.

Reason: no with-skill failure was observed, but no material with-skill advantage was proven either.

## Next Eval Direction

Move from single-turn response evals to scenario/fixture evals:

- Create a tiny fake repo fixture.
- Give agents permission to edit inside that fixture.
- Include hidden contradictions in files, not only in prompts.
- Compare actual actions, file changes, and final claims.
- Grade transcript plus diff, not only final chat response.

Candidate fixture scenarios:

- Billing downgrade policy prompt where fixture docs mention a grace period.
- Auth review feedback where tests contradict the vague reviewer claim.
- Copy change where convention is discoverable but not pasted into the prompt.
- Question-vs-action case where plugin files exist and scaffolding would be possible.

## Decision

Keep the three core skill drafts unchanged.

Next work should build a small fixture-based eval harness before adding more skills.
