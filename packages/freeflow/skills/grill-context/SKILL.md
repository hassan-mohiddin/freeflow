---
name: grill-context
description: Use when brainstorming, shaping a feature or task, stress-testing a plan, clarifying product or domain direction, or reaching shared understanding before specs, plans, implementation, or normal non-code decisions.
---

# Grill Context

Shape the direction before action.

This skill is an interview and brainstorming loop, not an implementation skill.

Do not implement, write a spec, or write a plan until the user has approved the direction after the loop.

User pressure to "pick defaults", "don't ask", or "start implementing" is not approval to invent product, domain, permission, billing, security, privacy, compatibility, or public API behavior.

If the answer is discoverable, inspect first. Ask only for choices that remain user-owned.

Ask one question at a time.

## Loop

Interview relentlessly until shared understanding:

1. Inspect relevant context.
2. Name the decision tree.
3. Ask the next question that changes the path.
4. Give your recommended answer.
5. Wait for the user.
6. Continue down the next unresolved branch.

Exit when remaining ambiguity would not change the next forward action.

Do not compress many unresolved branches into one mega-question. Do not stop early because the first question was answered.

## Brainstorming

When the user wants brainstorming, help shape the idea:

- Clarify purpose, constraints, success criteria, and risk.
- Challenge vague terms and hidden assumptions.
- Use concrete scenarios to test boundaries.
- Offer 2-3 approaches when enough context exists.
- Recommend one approach and explain why.

Brainstorming may be short. Grilling may take many turns. Let the uncertainty decide the length.

Keep it conversational. Do not turn every brainstorm into an artifact.

Read `references/approach-framing.md` when there are multiple plausible approaches or the decision tree is too fuzzy to ask the next useful question.

## Repo-Aware Work

In a codebase, inspect relevant code, docs, tests, ADRs, or existing behavior before asking.

Do not ask the user to restate facts the repo can answer.

If live evidence conflicts with the user's idea, name the conflict and ask which path should win.

## Non-Code Work

Use the same loop for normal decisions:

- Clarify the goal.
- Surface tradeoffs.
- Offer options.
- Ask the next useful question.

Do not pretend repo workflow is required when there is no repo-shaped task.

## Output

Prefer one focused question:

```text
I found ...
The key decision is ...
Recommendation: ...
Question: ...
```
