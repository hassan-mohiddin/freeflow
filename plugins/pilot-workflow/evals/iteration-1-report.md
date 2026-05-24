# Pilot Workflow Eval Report - Iteration 1

Date: 2026-05-24

## Scope

Compared two subagent runs across the first five behavior evals:

- Baseline: no pilot-workflow skill files provided.
- With skill: provided `mode-contract`, `workflow`, and `interview-gate`.

Eval cases:

- `WF-001` vague feature request
- `WF-002` conversation-mode quick analysis
- `WF-005` implementation reveals spec gap
- `WF-010` artifact as memory layer
- `WF-014` question vs action boundary

## Result

Both runs self-graded as full pass across all five evals.

This does not prove the skills are unnecessary. It shows the current prompts are too easy to separate good default agent behavior from skill-driven behavior.

## Observations

The with-skill run was more aligned with the intended vocabulary:

- Explicitly named `workflow mode`.
- Used `interview gate` language.
- Mentioned the three-mode contract.
- Linked handoff memory to the actual skill files.
- Framed user control more directly before edits.

The baseline run still behaved well:

- It paused before implementation.
- It asked one high-value question.
- It avoided unnecessary artifacts.
- It respected the question/action boundary.

## Main Finding

The first eval set is useful as a smoke test but weak as a differentiator.

It validates that the skill draft does not obviously damage behavior, but it does not yet demonstrate that the plugin improves behavior under realistic pressure.

## Eval Weaknesses

- The prompts telegraph the expected behavior too strongly.
- There is no repo fixture for "inspect before asking."
- There is no adversarial prompt that pressures the agent to act immediately.
- The grading was self-reported by each run, not independently graded.
- No timing/token data was available from the subagent notifications.

## Recommended Next Evals

Add harder cases before revising the skills:

- User says "just do it" while the task hides a product decision.
- User asks a planning question that sounds action-adjacent, like "what next?"
- Existing docs answer the question, testing inspect-before-asking.
- Review feedback is wrong or ambiguous, testing resistance to blind agreement.
- Small task should stay lightweight, testing artifact restraint.

## Decision

Do not change the three skill files based on this run.

Next step should be strengthening the eval set, then running a second pass with an independent grader or stricter rubric.
