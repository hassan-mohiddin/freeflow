# Workflow Route Closeout

> **Date:** 2026-05-28
> **Type:** Issue
> **Status:** Open
> **Area:** Freeflow workflow routing

## Summary

Freeflow has a documented workflow spine and backward edge, but completed workflow phases do not consistently name the next route. This leaves the user repeatedly asking "what next?" or manually invoking the next skill.

Deepen workflow closeout so every completed consequential phase ends by naming the next route: forward, backward, branch, or stop.

## How We Found It

During Freeflow skill development, repeated task completions ended without a future-facing closeout. After issue creation, architecture review, or phase completion, the user had to ask:

- "what's next?"
- "what are our next tasks?"
- "should we run write-spec now?"
- "proceed?"

A second related pattern appeared in phase transitions. After a grilling phase, the agent did not naturally route to `write-spec`, `research-brief`, or `write-plan`. The user had to manually invoke each next skill even when the workflow map already showed the forward flow.

This is not only a missing "future scope" line. It is missing workflow routing.

## Current Behavior

The workflow map shows forward flow:

```text
Clarify / Research -> Decision / Spec -> Plan -> Execute -> Review -> Verify -> Handoff
```

The workflow skill also encodes a backward edge:

```text
Any state -> Clarify / Research -> explicit next state
```

But closeout behavior does not require the agent to name the next route after a phase completes. `verify-work` includes a `Next:` field in its final response shape, but says to omit sections that do not apply, so agents can drop it.

## Problem

The current closeout shape has weak workflow continuity:

- completed phases can strand the user
- the user must remember and invoke the next Freeflow skill
- forward flow exists in diagrams but is not behaviorally enforced
- backward flow can be reported as a problem but not named as the next route
- branching paths are not surfaced as decision options
- agents may silently stop after a useful artifact instead of connecting it to the next workflow entry point

The result is extra user steering and weaker orchestration.

## Desired Behavior

When a consequential workflow phase completes, the final response should include:

```text
Next: <route> because <reason>
```

The route can be:

- `Forward`: continue to the normal next workflow phase.
- `Backward`: return to clarification, research, grilling, or interview gate because new evidence changed the path.
- `Branch`: show 2-3 valid next routes when more than one path is reasonable.
- `Stop`: no required next action because the work is complete and no useful follow-up remains.

Examples:

```text
Next: Forward to `write-spec` because the grilling decisions are stable enough to preserve.
```

```text
Next: Back to `interview-gate` because implementation exposed a user-owned API compatibility decision.
```

```text
Next: Either `write-spec` to make this durable, or `research-brief` if we want more repo evidence first.
```

```text
Next: No required next action; the task is verified and no open decisions remain.
```

## Proposed Skill Changes

Primary change:

- `plugins/freeflow/skills/workflow/SKILL.md`

Add a route closeout rule:

```text
## Route Closeout Rule

When a consequential workflow phase completes, name the next route.

Use `Next:` in the final response unless this is a direct question answer, mid-task status, or clarification-only turn.

Choose one:
- Forward: the next workflow entry point is clear.
- Backward: new evidence requires clarification, research, grilling, or interview gate.
- Branch: 2-3 valid next routes exist.
- Stop: no required next action remains.

Do not ask a vague "what next?" question. Recommend the route supported by evidence.
Do not auto-create the next artifact unless the user asked to continue or the next action is already approved.
```

Secondary change:

- `plugins/freeflow/skills/verify-work/SKILL.md`

Make `Next:` mandatory for completed consequential work:

```text
For completed consequential work, `Next:` is mandatory. Omit it only for direct question answers, mid-task status, or clarification-only turns.
```

Map/docs change:

- `plugins/freeflow/skills/workflow/references/workflow-map.md`

Add that phase exits must name a next route, and define forward, backward, branch, and stop.

Optional phase-skill exit clauses:

- `grill-context`: after grilling, route to `write-spec`, `research-brief`, `write-plan`, or stop.
- `research-brief`: after evidence is enough, route to `grill-context`, `write-spec`, `write-plan`, or stop.
- `write-spec`: after spec, route to `review-artifact`, `write-plan`, or stop.
- `review-artifact`: if pass, route to next phase; if blocked, ask the blocking decision question.
- `write-plan`: after plan, route to `review-artifact`, `execute-plan`, or stop.
- `execute-plan`: after execution, route to `review-work`, `verify-work`, `commit-work`, `handoff`, or a backward route if evidence changed the plan.

## Invariants

- `Next:` is routing, not automatic permission to continue.
- The agent should recommend a route, not push vague decision burden back to the user.
- The route can move forward, backward, branch, or stop.
- The agent must not silently continue into a new artifact unless the user asked to continue or the next action is already approved.
- Direct answers, mid-task updates, and clarification-only turns do not need `Next:`.
- If a user-owned decision blocks the next route, the final line should be the decision question, not a generic route.

## Non-Goals

- Do not make every response end with `Next:`.
- Do not force ceremony for direct questions.
- Do not automatically chain every workflow skill.
- Do not create specs, plans, handoffs, or commits just because they are the next route.
- Do not replace interview gates with routing suggestions.

## Eval Ideas

Add focused evals where baseline behavior is likely to strand the user:

- Grilling completes with stable decisions. With-skill should route to `write-spec` or `write-plan`.
- Research brief completes with enough repo evidence. With-skill should route to `write-spec`, `grill-context`, or `write-plan`.
- Spec is written. With-skill should route to `review-artifact` or `write-plan`.
- Plan is written. With-skill should route to `execute-plan` or `review-artifact`.
- Implementation reveals a user-owned decision. With-skill should route backward to `interview-gate` or `grill-context`, not continue forward.
- Task is fully verified and no follow-up remains. With-skill should say no required next action.

Assertions should check that:

- final response includes `Next:`
- route is specific to a Freeflow entry point or explicit stop
- route is justified by evidence
- agent does not create the next artifact without permission
- backward-edge scenario routes backward instead of forcing forward progress

## Open Questions

- Should route type labels (`Forward`, `Backward`, `Branch`, `Stop`) be explicit in final responses, or only used internally?
- Should phase skills each contain exit wording, or should `workflow` plus `verify-work` be enough?
- Should `Next:` be a hard requirement only after `verify-work`, or after every completed phase artifact?
- Should route closeout be evaluated as a general workflow eval or separate evals per phase skill?
