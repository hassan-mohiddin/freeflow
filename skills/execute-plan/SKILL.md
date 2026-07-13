---
name: execute-plan
description: Use when implementing an approved plan, executing or resuming planned slices, refining a rolling plan from implementation evidence, handling failed checks or formal-review findings, or deciding whether the next route is forward, backward, branched, or stopped.
---

# Execute Plan

Execute the next approved horizon without treating the plan as permanent authority.

The active agent owns implementation, self-verification, self-review, local correction, and learning. Live source truth wins over the plan. Every meaningful slice closes through a sequential self-check—self-verification, then bounded self-review only when evidence supports the outcome; independent contexts remain boundary tools.

Read [the execution map](references/execution-map.md) for multi-slice work, learning slices, distributed execution, or a failed source, scope, verification, or review condition.

## Orient

Read only enough to execute the current horizon safely:

- current phase and source requirements;
- relevant specs, tests, policies, ADRs, and live code;
- prior evidence and handoffs as memory;
- later work only for dependencies that constrain this slice.

Classify the next route:

- **Execute:** bounded work is supported by source truth.
- **Discover or design:** option space or a consequential interface is unsettled before implementation.
- **Revise spec:** behavior, scope, acceptance, public contract, or failure semantics changed.
- **Revise plan:** order, slice boundaries, mechanism, checks, or later assumptions changed.
- **Decision gate:** a user-owned decision or source conflict blocks action.
- **Diagnose:** a concrete, repeated, or unexplained failure needs root-cause evidence.
- **Stop or defer:** no safe in-scope route remains.

Do not improve, broaden, or reinterpret the plan silently.

## Bound The Slice

For non-trivial work, name only what execution needs:

- outcome and source requirement;
- stable seam or write boundary;
- behavior or learning question;
- direct verification;
- assumptions or stop conditions that could change the route.

Add a semantic failure unit only when authority, canonical evidence, atomic visibility, durable state, cancellation, or recovery materially affects correctness. Use `../design-for-depth/SKILL.md` proactively when such architecture is unsettled; do not invoke redesign merely because implementation contains ordinary bugs.

Choose reversible details from repo conventions. Stop for unsettled product, compatibility, public API, security, privacy, billing, permissions, data-loss, migration, or hard-to-reverse architecture decisions.

When separate execution contexts are useful, give each one a bounded outcome, source context, write boundary, evidence, and escalation conditions. The harness owns agent and transport mechanics.

## Execute

Work through one coherent behavior or evidence path:

- edit only what the slice needs;
- keep later work out unless evidence changes the route;
- let learning slices fail safely and apply their discard-or-promote rule;
- use `../tdd/SKILL.md` when behavior should drive a RED/GREEN/REFACTOR loop;
- use `../diagnose-failure/SKILL.md` when a failed signal lacks a supported cause.

Do not rewrite tests, verifiers, specs, or policies merely to make implementation pass. A conflicting check may be stale, but that is a fact to establish, not permission to change source truth.

## Self-Verify And Self-Review

After every meaningful slice:

1. Self-verify with the smallest direct check that can disagree with the intended outcome.
2. State what it proves and what remains unverified.
3. Only when evidence supports the outcome, silently self-review your own change once against source truth, evidence, and route.
4. Correct clear local reversible mistakes and rerun affected checks.
5. Surface only gaps that change scope, authority, design, evidence, or the next safe action.

Workflow guidance is enough for routine work. Read `../verify-work/SKILL.md` or `../review-work/SKILL.md` after any slice when richer self-verification or self-review guidance helps. Reading either skill does not dispatch another context or satisfy an independent boundary.

Continue when evidence preserves the outcome and route. When failures repeat, differ without explanation, or expose another consequence of an unknown cause, use diagnosis before redesign. Diagnosis may conclude local implementation bug, inadequate test, stale source, bad slice, reviewer-context problem, or structural design pressure.

Preserve valid work. Redesign only when root-cause or direct structural evidence shows that ownership, interface, state, or failure-unit shape is wrong.

## Final Assurance

After the final implementation slice:

1. run the sequential self-check: final self-verification, then bounded self-review only if it supports the outcome;
2. freeze the source identity;
3. dispatch one fresh verifier and one different fresh reviewer in parallel against that same state;
4. collect both results, then adjudicate and close or route backward.

Verifier and reviewer are separate from each other and the implementer, and neither depends on the other's output. Both standing dispatches need no reconfirmation.

Completion requires verifier Pass and resolved review with no later implementation change. Preserve an unaffected result when its boundary still holds, but any code change stales both. Self-check the correction and ask before another independent verifier or reviewer dispatch. Other extra contexts also require scoped authorization.

Commit, handoff, owner, integration, release, and launch checkpoints remain separately conditional. No intermediate slice or phase requires review merely by ending.

## Rolling Plan

At a phase boundary, preserve evidence and refine only the next executable horizon. Keep later phases directional.

Revise the plan when evidence changes order, slices, mechanisms, or checks. Revise the spec or ask the owner when behavior, scope, acceptance, public contract, sensitive policy, or failure semantics change. Ordinary implementation learning does not require independent artifact review.

## Completion

Report completed outcomes, direct verification, route-changing discoveries, accepted plan/spec changes, useful checkpoints, and remaining unverified behavior.

Implementation is complete when the final self-check supports the outcome and parallel final assurance returns verifier Pass plus resolved review for the same unchanged source identity. Unavailable or skipped standing assurance prevents a completion claim; preserve the work as unassured and report the missing boundary. Predicted intermediate reviews need not occur.
