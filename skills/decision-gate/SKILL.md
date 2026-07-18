---
name: decision-gate
description: Use when proceeding would silently choose for the user, conflict with existing code, tests, docs, or requirements, or take a materially different path from what was requested or agreed.
---

# Decision Gate

Stop before making a decision that belongs to the user or quietly changing the agreed path.

The [Interaction Contract](../../runtime/interaction-contract.md) governs whether the user is asking, proposing, reasoning, or authorizing action. Decision Gate begins only after one blocking choice or conflict is clear. When the problem or alternatives still need broader exploration, read [Discuss](../discuss/SKILL.md) instead.

## Stop Here

Use the gate when:

- the user must choose product behavior, scope, priorities, public interfaces, compatibility, permissions, security, privacy, billing, data-loss behavior, migration direction, or another hard-to-reverse outcome;
- the request conflicts with existing code, tests, docs, policies, requirements, or established behavior;
- the proposed action would materially change what was requested or agreed, including its evidence quality, risk, cost, persistence, or user-visible result;
- new evidence exposes one known user choice or source conflict that must be resolved before proceeding.

Do not use the gate for facts that can be inspected, harmless local choices, or reversible implementation details that preserve the accepted outcome.

## Inspect Before Asking

Inspect code, tests, docs, policies, logs, repository state, or current external sources when they can answer the factual part of the problem.

Ask the user only for a choice that remains theirs. If you cannot state the decision and meaningful alternatives clearly, the option space is not ready for a gate; use Discuss.

## Ask One Direct Question

State:

1. what was requested or previously agreed;
2. the conflicting evidence, missing choice, or materially different path;
3. why it changes the next action;
4. the meaningful options and tradeoffs;
5. a recommendation when evidence supports one;
6. one direct question that resolves the block.

Then stop. Do not perform the blocked action in the same response.

Urgency, approval to continue, reviewer confidence, or existing practice does not resolve an unnamed decision or conflict.

## Exit

Exit when the choice is explicit, the conflict is resolved, and remaining uncertainty would not change the next safe action.

Preserve the decision accurately for the work that depends on it. Do not broaden the decision or treat it as approval for a different path.
