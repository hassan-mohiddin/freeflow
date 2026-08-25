---
name: execute-work
description: Use when executing or resuming implementation, fixes, prototypes, documentation updates, repository maintenance, or other concrete changes.
---

# Execute Work

Carry out concrete work through bounded actions and fresh evidence only when it was requested or approved and the effective mode permits its effects.

A Slice is the shared coherent outcome. Execute Work owns each **bounded action**—one implementation, experiment, correction, or observation—inside it. A Slice need not have durable task memory; when one does, Track Work records its Current Slice.

Read [Execute Work edges](references/execute-work-edges.md) when work resumes from prior state, crosses a Slice boundary, reaches a selected checkpoint, or reveals separately controlled follow-on work.

## Follow The Execution Route

Use this as a directed map, not a fixed phase sequence:

```text
[Requested or approved concrete work; effective mode permits its effects]
-> [Orient and establish the current slice]
-> [Take one bounded action]
-> [Test or observe]
-> [Verify what the evidence proves]
   -> clear local defect -> correct -> test or observe again
   -> unclear, repeated, or route-changing result -> Workflow
   -> supported -> silent self-review -> freeze before acceptance or reuse
-> [Route]
   -> more accepted work in this slice -> next bounded action
   -> coherent boundary extension -> Workflow -> covered and recorded when needed -> next action
   -> distinct result, authority, or evidence boundary -> Workflow
   -> approved checkpoint due -> owning skill -> route again
   -> supported exit -> report
```

Implementation beginning does not justify continuation. Continue only while authority, evidence, and the current slice remain coherent.

## Orient Before Changing State

Establish:

- intended result and the source that supports it;
- current slice, accepted scope, and relevant live state;
- the current authority envelope, due checkpoints, and separately controlled boundaries;
- direct check or observation that can disagree with the result;

Execute Work inherits the authority envelope established by Workflow; selecting this method does not create execution authority. A small self-contained change needs no Spec, Plan, or Working Record merely because execution was selected.

Inspect relevant code, tests, docs, policies, artifacts, repository state, and current external constraints before relying on memory. When sources materially conflict or the intended result is unsafe to infer, return the evidence to [Workflow](../workflow/SKILL.md) rather than choosing silently.

When a Working Record exists, use [Track Work](../track-work/SKILL.md) for write-ahead slice state and later reconciliation. Announce the active slice once in a compact line when useful; do not announce every action or manufacture an identifier for a tiny task.

## Bound Each Action

Choose the smallest coherent action that can produce the intended result or useful evidence:

- keep unrelated and later work outside it;
- choose reversible local details from repository conventions;
- let an experiment fail safely and preserve its discard, revise, or promote condition;
- keep every experiment and observation inside the authority envelope;
- use only specialized methods and domain guidance that the concrete boundary needs.

When several environment actions or observers could produce useful evidence, or the likely action is broad, use [Action Selection](../action-selection/SKILL.md) to choose and bound one interaction. Execute Work keeps ownership of the intended result and accepted effects; Action Selection returns the observation or bounded effect. Skip it when the next action is already known, mechanical, and directly verifiable.

When an accepted behavior change, bug correction with a supported cause, consequential rule, or behavior-preserving refactor benefits from a failing check first, use [TDD](../tdd/SKILL.md) for that bounded action before changing production behavior.

Before work changes the intended result, scope, permitted effects, evidence boundary, stop condition, or authority source, decide through Workflow whether it is an accepted extension or a new slice. When a Working Record exists, use Track Work to record an accepted extension before executing it. Do not let a series of “small” additions silently replace the original result.

## Execute For The Required Boundary

Match implementation and evidence to the work. Code may need behavior tests or runtime observations. Documentation, configuration, generated artifacts, and repository maintenance may need parsing, links, builds, diffs, structural checks, or installed-artifact evidence.

Do not rewrite tests, checks, Specs, Plans, policies, or accepted behavior merely to make implementation pass. Determine whether the implementation, evidence, environment, or source is wrong before changing what defines success.

Before writing or changing code, read [Code Practices](references/code-practices.md). Prefer clear ownership, names, and failure behavior. Comment only non-obvious rationale, constraints, invariants, or temporary behavior with a real exit condition.

Handle an edge case only when accepted behavior, observed evidence, or material safety requires it. If expected behavior is undefined and would change observable behavior or scope, return it to Workflow. When related patches keep adding states, flags, or caller coordination, stop and return the shared pressure rather than extending the patch stream.

## Close Each Evidence Iteration

After every bounded action:

1. run the focused tests or observations appropriate to its claim;
2. use [Verify Work](../verify-work/SKILL.md) when the claim or observing boundary needs its fuller method;
3. once initial evidence supports the result, use [Review Work](../review-work/SKILL.md) for silent self-review;
4. correct clear local issues within existing authority and re-verify the affected boundary;
5. confirm the final state has no unresolved material issue, freeze it, and only then accept, reuse, or report the result.

Self-review remains inside the bounded action rather than creating another action or review cycle. A failed or inconclusive check does not prove the design or source is wrong. Correct a clear local defect; use [Diagnose Failure](../diagnose-failure/SKILL.md) when the cause is unclear or failure repeats.

Further polish, advisory warnings, unrelated issues, and review findings without mutation authority are feedback to classify, not permission to keep editing.

## Route Continuation Deliberately

Continue inside the current slice when the next bounded action is accepted, its intended result remains coherent, the combined boundary can still be verified as one unit, no stop condition applies, and no checkpoint is due.

Before a distinct result begins, let Workflow establish the current slice outcome, then use Track Work when present to select the next authorized slice. A route through discussion, diagnosis, review, verification, or an approved checkpoint does not itself end or replace the current slice.

A Plan preserves intended strategy, not progress. Return material changes to its order, mechanism, dependencies, slices, or checks to Workflow. Do not add public documentation, migration, deprecation, push, integration, release, launch, or another separately controlled action without its own authority.

## Report The Supported State

Report the accepted result, fresh verification evidence and limits, material route changes, current slice or artifact state, and unresolved or unverified work. A supported action is not automatically a completed slice, and a completed slice does not authorize the next one.
