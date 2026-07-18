---
name: execute-work
description: Use when executing or resuming implementation, fixes, prototypes, documentation updates, repository maintenance, or other concrete changes.
---

# Execute Work

Carry out concrete work in visible, bounded slices and use evidence before continuing.

A **slice** is one coherent unit of work that can be executed and checked together. Work may come directly from the current conversation or from a Working Record, Spec, Plan, diagnosis, accepted review item, issue, or another established source.

Read [the execution loop](references/execution-loop.md) when work spans multiple slices, resumes from prior state, needs a specialized execution method, or reveals approved follow-on work.

## Establish The Work

Before changing anything, understand:

- the intended result and source that establishes it;
- the bounded scope and relevant live state;
- the direct check or observation that can disagree with the result;
- any condition that would stop the work or change its route.

A clear user request can be enough. Do not require a Spec, Plan, or Working Record for a small self-contained change.

Inspect relevant code, tests, documentation, policies, artifacts, and repository state before relying on remembered or proposed behavior. When sources materially conflict, or the intended result is not clear enough to execute safely, return to [Workflow](../workflow/SKILL.md) with the observed gap rather than silently choosing a path.

## Bound And Announce The Slice

Before each meaningful slice, understand its intended result, bounded scope, direct check, and any stop condition. Keep those details internal or in the Working Record.

Announce only the active slice in one compact line. Use its existing phase, number, or name when one exists:

```text
Slice: Phase 2 — S-2.1 API integration
```

When no identifier exists, use a short descriptive name. Do not narrate the slice contract, individual edits, or commands. Re-announce only when the active slice changes materially.

For a tiny task, the task itself is one slice. Do not manufacture numbering, categories, or ceremony merely to announce it.

When a Working Record exists, use [Track Work](../track-work/SKILL.md) for its before-and-after slice updates.

## Execute

Make the smallest coherent change that produces the intended result or evidence:

- keep unrelated and later work outside the slice;
- choose reversible local details from repository conventions;
- let a prototype or experiment fail safely and apply its discard, revise, or promote condition.

Match the method and evidence to the work. Code may need behavior tests or runtime evidence. Documentation, configuration, generated artifacts, and repository maintenance may need link checks, parsing, builds, diffs, structural inspection, or another direct check instead.

Do not rewrite tests, checks, Specs, Plans, policies, or accepted behavior merely to make the implementation pass. Establish whether the implementation, evidence, environment, or source is wrong before changing the thing that defines success.

## Write Code For The Next Reader

When a slice writes or changes code, read [Code Practices](references/code-practices.md).

Prefer names and structure that make behavior and ownership clear. Comment only non-obvious why: invariants, constraints, tradeoffs, workarounds, or temporary behavior with a real exit condition. Do not narrate clear code, preserve stale comments, or leave vague promises. Put broad decisions and future work in their owning artifact.

## Handle Edge Cases Deliberately

Handle an edge case when accepted behavior, observed evidence, or material safety requires it. If expected behavior is undefined and would change observable behavior or scope, return it to Workflow. Do not add fallback behavior, states, abstractions, or tests for hypothetical completeness.

When related cases keep appearing, patches widen, or each fix adds another state or flag, stop patching and return the evidence to Workflow so the shared requirement, cause, ownership, or interface can be reconsidered.

## Close The Feedback Loop

After each meaningful slice:

1. Run the focused tests or observations appropriate to the result.
2. Read [Verify Work](../verify-work/SKILL.md) and determine what the evidence proves.
3. When the result is supported, read [Review Work](../review-work/SKILL.md) and silently self-review the work.
4. Correct clear local issues and re-verify the affected result.
5. Return unresolved or route-changing evidence to Workflow.

A failed or inconclusive check does not automatically mean the design or source is wrong. Correct a clear local defect; return to Workflow when the cause is unclear, repeated, or produces widening patches.

Once evidence supports the slice and one self-review correction batch has been re-verified, freeze it. Treat further improvements, advisory warnings, and unrelated issues as feedback to classify, not instructions to keep editing. Report or defer them unless another slice is selected.

## Keep Artifact Ownership Clear

A Plan records intended strategy, not execution progress. Do not revise it for completed slices, expected local choices, or status changes. When evidence materially changes the strategy, order, dependencies, mechanism, or checks—or stable accepted content appears to have changed—return the evidence to Workflow so the owning artifact can be handled deliberately.

## Honor Checkpoints And Follow-On Authority

Before starting another slice, check the approved Plan, discussion, and Working Record for a due review, local commit, user, or continuity checkpoint. When its conditions hold, use the owning skill before continuing. If live evidence makes it incoherent, do not force it; record the deviation and return it to Workflow.

Plan approval authorizes listed work, checks, reviews, Working Record updates, and local commits. It does not authorize push, integration, migration, deprecation, release, or launch.

Do not silently add public documentation or other follow-on work outside the accepted scope. Public documentation changes, migration, and deprecation require an explicit user request or approval. Report newly discovered follow-on work so the user may approve or defer it.

When a checkpoint or follow-on route is already requested or approved, use the owning skill or reference listed in the execution loop. When public documentation is itself approved work, update and verify it directly.

## Continue Or Return

Continue with another slice when it is already accepted, remains within scope and authority, no approved checkpoint is due, feedback supports the execution basis, and remaining work is shrinking or becoming clearer.

Return to Workflow when feedback reopens direction, exposes a consequential decision or source conflict, invalidates the execution strategy, reveals material scope growth, or leaves no worthwhile safe continuation.

## Report

Report the supported result, verification evidence, material route changes, updated task state or approved artifacts, and anything that remains unresolved or unverified.
