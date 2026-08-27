---
name: execute-work
description: Use when carrying out or resuming requested or approved implementation, fixes, prototypes, documentation, configuration, repository maintenance, or other concrete work.
---

# Execute Work

Turn one accepted outcome into a supported concrete result.

Workflow establishes the authority envelope and current Slice. Execute Work coordinates bounded execution and in-Slice continuation. It does not redefine intent, own durable task memory, make user decisions, prove claims beyond available evidence, or authorize checkpoints and follow-on work.

A **bounded action** is one coherent execution or learning result with a checkable claim. It may include several reads, edits, commands, files, and focused checks. A tool call, file change, or execution-method change is not automatically another bounded action.

Read [Execute Work Edges](references/execute-work-edges.md) when resuming uncertain prior work, changing the Slice boundary, reaching a selected checkpoint, or exposing separately controlled follow-on work.

## Follow The Execution Loop

Use this as a feedback loop, not a mandatory phase sequence:

```text
[Accepted concrete result]
-> [Consume the current Slice and relevant live state]
-> [Choose one bounded action and a check that can disagree]
-> [Choose one primary execution route]
-> [Execute and observe]
-> [Determine what the evidence supports]
   -> unsupported cause or repeated failure -> Diagnose Failure
   -> user-owned choice or source conflict -> Decision Gate
   -> supported -> Verify at the required boundary
                -> self-review
                -> accept or correct once
-> [Continue inside the Slice or return the changed boundary to Workflow]
```

Implementation beginning does not justify continuation. Continue only while the accepted result, authority, evidence boundary, and Slice remain coherent.

## Enter From Established Direction

Consume the understanding already established by the request, [Discuss](../discuss/SKILL.md), Workflow, and accepted source truth. Do not restart discovery or recreate task context merely because execution began.

Before effects:

- confirm the concrete result and relevant non-goals;
- inspect the smallest live source set needed to avoid relying on stale context;
- identify one bounded action;
- name the claim its result must support;
- identify a direct check or observation that can disagree;
- confirm no selected checkpoint or separately controlled boundary is already due.

When a Working Record exists, use [Track Work](../track-work/SKILL.md) for recovery, reconciliation, and write-ahead Current Slice state before relying on or changing it. Do not create durable memory for a short direct result merely because execution was selected.

Return to [Workflow](../workflow/SKILL.md) when the intended result, authority, or current Slice is missing or materially inconsistent. Use [Decision Gate](../decision-gate/SKILL.md) when one known user-owned choice or source conflict blocks execution.

## Bound The Action

Choose the smallest coherent action that can produce a useful result and evidence.

A bounded action may be:

- one accepted behavior implemented through a vertical test-first loop;
- one behavior-preserving simplification with before-and-after evidence;
- one coherent documentation, configuration, or repository change;
- one reversible learning result with a discard, revise, or promotion condition;
- one direct mechanical result whose complete effect is already clear.

Keep unrelated work and later outcomes outside it. Do not split an action merely because it touches several files or tools. Do not combine results that require different authority, evidence boundaries, or independently useful outcomes.

Allow routine adaptation of local mechanics, ordering, and focused checks while the accepted result, permitted effects, and acceptance boundary remain unchanged. Return material changes to scope, behavior, evidence quality, persistence, or stop conditions to Workflow before acting.

## Choose One Execution Route

Use one primary execution route at a time:

- execute directly when the effect is known, mechanical, and directly verifiable;
- use [TDD](../tdd/SKILL.md) when accepted behavior should be guided by an observed failing check;
- use [Simplify Code](../simplify-code/SKILL.md) when working behavior should become easier to understand or change without altering its contract;
- use the required domain guidance when technology, risk, or repository conventions need a specialized method;
- use [Diagnose Failure](../diagnose-failure/SKILL.md) before correction when the cause is unsupported or repeated attempts have failed.

When specialized guidance is needed, read [Domain Skill Composition](../workflow/references/domain-skill-composition.md). Keep one Freeflow owner and return domain evidence to the current route.

Before writing or changing code, read [Code Practices](references/code-practices.md).

Action Selection controls environment interactions, not execution-method choice. When the next interaction is uncertain, broad, or likely to repeat without changing understanding, use [Action Selection](../action-selection/SKILL.md) to select and bound one useful interaction. When the next read, edit, or check is obvious, take its fast path directly.

## Execute Without Drifting

Implement the bounded result through the selected route.

Preserve accepted behavior, source truth, repository conventions, and relevant failure semantics. Do not rewrite tests, checks, Specs, Plans, policies, or established behavior merely to make implementation pass.

Handle an edge case only when accepted behavior, observed evidence, or material safety requires it and the expected result is settled. Return undefined observable behavior to Workflow rather than encoding a guess.

Let experiments fail safely. Keep disposable or diagnostic output outside production behavior until promotion is deliberately selected.

Stop the patch stream when related corrections keep adding caller coordination, public states, flags, retries, test-only seams, or recovery rules. Diagnose the shared cause before another patch. Use [Design for Depth](../design-for-depth/SKILL.md) only when direct evidence establishes structural ownership, interface, state, or failure-unit pressure.

Do not turn nearby cleanup, documentation, migration, deprecation, commit, push, integration, release, or launch into implied execution scope.

## Accept Evidence At The Claim Boundary

Close the evidence iteration when the bounded action’s claim is ready to be accepted or used by dependent work—not after every edit or command.

1. Run the focused checks or observations required by the selected method.
2. Use [Verify Work](../verify-work/SKILL.md) when the claim or observing boundary needs explicit factual classification.
3. Once fresh evidence supports the claim, use [Review Work](../review-work/SKILL.md) for silent self-review.
4. Return one clear local defect to the producing route when existing authority covers correction.
5. Re-run the affected evidence and repeat only the affected review lenses once.
6. Use Diagnose Failure when the cause is unclear or correction repeats.
7. Use Decision Gate when evidence exposes unsettled behavior or a user-owned choice.

A green check does not prove behavior it did not exercise. Source inspection does not prove runtime behavior. Review judgment does not replace verification.

Further polish, advisory warnings, unrelated findings, and optional improvements are feedback to classify—not authority to keep editing.

## Continue Or Return

Continue inside the same Slice when:

- the next bounded action serves the same accepted result;
- its authority and evidence boundary remain covered;
- the combined result can still be verified coherently;
- no stop condition or selected checkpoint is due.

A method change, verification run, self-review, correction, or pause does not create or complete a Slice by itself.

When durable memory exists, use Track Work to preserve only material changes to context, authority, Slice boundaries, evidence, blockers, decisions, checkpoints, and the next useful action. Do not record every command, edit, or execution choice.

Return to Workflow before beginning a distinct result, crossing an uncovered boundary, changing the accepted strategy materially, or performing a selected checkpoint or separately controlled follow-on action.

## Report The Supported State

Report proportionately:

- the concrete result;
- the strongest fresh evidence and what it does not prove;
- material corrections or route changes;
- the Current Slice or checkpoint state when relevant;
- unresolved, deferred, or unverified work.

A supported bounded action is not automatically a completed Slice. A completed Slice does not authorize a checkpoint, another Slice, push, integration, release, or launch.
