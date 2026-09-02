---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active and automatic or manual compute control, profile transitions, delegated execution, direct Reasoning action, or boundary continuity must be interpreted."
---

# Cognitive Routing

Use two compute profiles for one active agent in one shared visible context. Cognitive Routing is a reasoning-led execution model: place higher-cognition compute where material judgment changes reliability, and use ordinary compute for clear execution once direction is settled.

- **Reasoning** is the cognitive lead. It interprets user intent and evidence, resolves or preserves material judgment, establishes adaptive execution contracts, and assesses returned results for the current owner.
- **Standard** is the capable workhorse. It reasons locally, leads complete ordinary results when Reasoning yields, and executes decision-complete contracts when Reasoning delegates.

**Cognitive demand** is the capability needed to choose or perform the next action reliably given uncertainty, branching, causal depth, and consequence. It is not task size, tool count, or a Workflow phase.

A **material cognitive boundary** is a governing uncertainty or judgment that Standard must not settle while executing. Reasoning may settle enough direction to delegate one execution unit while retaining responsibility for what returned evidence means.

This is not a thinking-versus-doing split, a Workflow phase model, a second agent, or detached consultation. Both profiles can reason. Reasoning leads material judgment; Standard executes accepted direction and returns contradictions instead of silently changing it.

Both profiles inherit the same visible conversation, tool history, current owner, authority envelope, task memory, and evidence. A profile switch changes compute, not context; do not reconstruct or restate inherited state after switching. Visible contracts carry governing conclusions, execution responsibility, and return conditions without pretending hidden reasoning transfers between profiles.

Cognitive Routing changes compute only. It does not change the current owner, authority, permitted effects, evidence requirements, review independence, bounded activity, Slice, or Supported Exit.

There are two control modes:

- **Automatic:** each new user interaction begins in Reasoning. Reasoning works conversationally by default and chooses how covered execution reaches the environment.
- **Manual:** the user holds Standard or Reasoning. The held profile runs the ordinary unsplit Workflow; automatic routing does not apply.

The existing `freeflow_switch_profile` tool remains the only profile-switch mechanism. This skill gives that tool its meaning; it does not create another tool.

Under Automatic · Reasoning, when environment execution is needed, choose `YIELD`, `DELEGATE`, or `ACT_BOUNDED`.

Outside an explicit `ACT_BOUNDED` scope, Automatic · Reasoning must not perform environment interaction, active evidence generation, mutation, tests, diagnostics, builds, probes, or substantive artifact production. Its only tool call is `freeflow_switch_profile`, which is a control operation. Conversational analysis, decisions, questions, assessment, and reporting remain the default and are not execution.

## Read Current State

Use the latest extension-generated `Control` and `Profile`. Earlier profile state, transition results, and natural-language suggestions are history or advice.

Runtime State establishes current control and profile, not the model-written Yield, Delegate, or `ACT_BOUNDED` route or execution-boundary state. A Runtime State refresh is host context, not an interruption, and does not end an active route or `ACT_BOUNDED` scope unless the reported state contradicts it.

| Runtime state | Behavior |
| --- | --- |
| Automatic · Reasoning | Remain the cognitive lead for analysis, discussion, decisions, assessment, and reporting. When execution is needed, choose `YIELD`, `DELEGATE`, or qualifying `ACT_BOUNDED`. |
| Automatic · Standard during Yield | Standard leads one complete ordinary bounded result. |
| Automatic · Standard during Delegate | Reasoning retains boundary responsibility; Standard executes the open contract. |
| Manual · Standard | Standard runs the ordinary unsplit Workflow; no automatic routing protocol applies. |
| Manual · Reasoning | Reasoning runs the ordinary unsplit Workflow; no automatic routing protocol applies. |

Reasoning's conversational work is the Automatic default and needs no route marker.

In Automatic, begin every new user interaction in Reasoning, even if the preceding automatic route used Standard. If Standard is still executing, complete only the current safe interaction before handing back; do not interrupt an atomic environment action to satisfy the profile default.

The current owner remains unchanged across profile transitions. A transition never authorizes action, creates task memory, resolves a user decision, or proves a result. Workflow owns authority, the active method, checkpoints, and Supported Exit. Track Work owns durable task memory. Cognitive Routing owns none of them.

## Choose Automatic Execution

When covered execution is needed and Standard is not already active, choose by residual cognitive responsibility—not by task phase, apparent complexity, or tool count:

```text
Automatic · Reasoning
└─ execution is needed
   ├─ YIELD         Standard leads one complete ordinary result; no boundary
   ├─ DELEGATE      Standard executes; Reasoning retains cognitive leadership
   └─ ACT_BOUNDED   Reasoning receives exceptional direct environment access
```

Reasoning-led delegated execution follows one compact loop:

```text
material cognitive boundary
-> Reasoning frames the governing question or settled direction
-> Reasoning writes a decision-complete contract for the next execution unit
-> Standard gathers evidence or executes accepted direction
-> RETURN to Reasoning
-> Reasoning determines what the evidence supports
   -> evidence settles direction: delegate the execution contract
   -> more accepted work: delegate again
   -> supported and complete: self-review, then close
   -> contradiction or material change: diagnose, decide, ask, or return to Workflow
```

Decision-complete applies to Standard's assigned unit, not the whole cognitive boundary. Reasoning may first delegate a bounded evidence-gathering contract, interpret the `RETURN`, and then delegate execution under the supported direction.

Use **YIELD** only when Standard can own the whole result end to end: it is small, exact, local, reversible, low-risk, directly verifiable, and does not require new material Reasoning judgment after execution.

Use **DELEGATE** when Reasoning must interpret returned evidence or retain cognitive leadership for what follows. This includes substantial work, unresolved local choices, source inspection, research, exploration, diagnostics, tests, verification, and evidence gathering that informs a material judgment. One environment call may still require Delegate; tool count does not decide the route.

Use **ACT_BOUNDED** only when judgment and environment action cannot be separated and delegation would materially lose more than premium execution costs. It is the only direct environment-access route for Automatic · Reasoning.

If uncertain between routes, use `DELEGATE`. Better performance, convenience, fewer transitions, fewer tool calls, or preference for Reasoning do not justify direct access.

A route never widens authority. If outcome, scope, authority, evidence boundary, or stop condition is unsettled, return to [Workflow](../../skills/workflow/SKILL.md) or [Decision Gate](../../skills/decision-gate/SKILL.md) before execution.

Examples:

- Reading an exact package version and reporting it may Yield because Standard can complete the whole result.
- Reading one configuration file so Reasoning can choose an architecture requires Delegate because Reasoning must interpret the evidence.
- A sensitive intervention whose next action depends on premium interpretation of each prior effect may qualify for `ACT_BOUNDED`.

## Preserve Reasoning-Led Execution Boundaries

A **Reasoning execution boundary** is the visible protocol that keeps one material cognitive boundary coherent while Standard executes. It preserves Reasoning's governing judgment and assessment responsibility without changing the current owner. Yield and `ACT_BOUNDED` do not create one.

A Slice may contain zero, one, or many sequential Reasoning execution boundaries. When durable task memory is needed, [Track Work](../../skills/track-work/SKILL.md) records the wider Slice. At most one Reasoning execution boundary is `OPEN` at a time.

Keep active state and transition separate:

```text
Boundary state: NONE | OPEN
Boundary operation: NEW | REOPEN | CLOSE
```

`NEW` opens the first delegated boundary for one bounded outcome. `REOPEN` returns a previously closed boundary to `OPEN` only when fresh authority and invalidating evidence or changed intent revive the same outcome. `RETURN` transfers execution evidence to Reasoning while leaving the boundary `OPEN`. `CLOSE` returns the state to `NONE`.

Opening, returning through, reopening, or closing a boundary never selects, extends, settles, or closes the wider Slice. Reasoning owns the execution boundary; the current owner owns the bounded activity.

A **decision-complete contract** is the smallest instruction that leaves Standard with no unresolved material judgment. Include only the outcome, constraints or invariants, scope, evidence, ordering, and return conditions needed for the result. Its shape is adaptive, not a fixed schema or command-by-command plan.

## Yield To Standard

Yield is a one-off leadership transfer for one complete ordinary bounded result. Use it only while `Boundary state: NONE`. It does not create a Reasoning execution boundary.

Before switching, give Standard an adaptive brief beginning with literal `YIELD`. Make clear what Standard owns and when it must hand back. One line is enough when the result is obvious.

Then switch:

```text
freeflow_switch_profile(
  target="standard",
  reason="one-sentence yield label"
)
```

The switch must be the only tool call in that assistant response.

While Yield is active, Standard runs the ordinary unsplit Workflow for the yielded result. It may:

- think through local execution;
- choose an appropriate method such as [TDD](../../skills/tdd/SKILL.md) or [Simplify Code](../../skills/simplify-code/SKILL.md);
- use Action Selection for local uncertainty;
- verify the result;
- perform ordinary self-review through [Review Work](../../skills/review-work/SKILL.md);
- continue while the original result and authority remain coherent.

Standard must hand back when:

- the result is no longer exact or local;
- broad exploration or material Reasoning judgment becomes necessary;
- a user-owned choice or source conflict appears;
- verification fails or is inconclusive;
- the user interrupts, cancels, or changes direction;
- scope, architecture, policy, failure behavior, or evidence requirements materially change;
- the result is supported and complete;
- no covered action can advance it.

Use an adaptive handback beginning with:

```text
YIELD HANDOFF
Result:
Evidence and limits:
Blocker or changed boundary, if any:
Handoff condition reached:
```

Include only fields the transfer needs. Then switch back to Reasoning. `YIELD HANDOFF` is not `RETURN`: no execution boundary exists. It is a profile transfer, not the separate point-in-time Handoff method.

Reasoning accepts and reports a supported result, or routes the changed issue through Workflow, Diagnose Failure, Decision Gate, or another accepted route. Do not repeat Standard's full self-review unless the handoff is contradictory or insufficient.

## Delegate To Standard

Use Delegate when Reasoning must retain cognitive leadership for execution evidence or what follows from it. Delegated observation, inspection, research, diagnostics, and verification remain Standard execution even when mechanically small.

A decision-complete contract resolves every material judgment Standard would otherwise need for that assigned unit. It may ask Standard to gather evidence for a cognitive boundary Reasoning has not yet resolved. Standard may reason about local mechanics, but it must not settle that boundary or reinterpret governing direction.

Before the first transfer for one bounded outcome, write:

```text
DELEGATE
Boundary operation: NEW | REOPEN
Boundary state: OPEN
```

Use `NEW` for the first boundary. Use `REOPEN` only for authorized continuation of the same previously closed outcome. When a boundary remains `OPEN` after `RETURN`, begin the next transfer with `DELEGATE` and omit `NEW` or `REOPEN`.

Give Standard a decision-complete contract. Use shared context rather than replaying it. Include as applicable:

- the bounded outcome;
- supported judgment, constraints, and invariants;
- scope and necessary ordering;
- reversible local choices Standard may make;
- required evidence or verification;
- conditions that require return.

Then switch to Standard. The switch must be the only tool call in that assistant response.

Standard executes the current owner's method under the open contract. It may use direct fast-path interactions or [Action Selection](../../skills/action-selection/SKILL.md) for local uncertainty. Action Selection returns to the current owner inside the delegation; it does not create another execution boundary.

Standard may choose repository-consistent mechanics and reversible local details. It must return rather than decide a material change to outcome, architecture, policy, failure behavior, scope, evidence boundary, or authority.

Return when:

- required evidence is available;
- scoped execution or verification ends;
- the user interrupts, cancels, or changes direction;
- execution, verification, or evidence fails or becomes inconclusive;
- a contradiction or material judgment appears;
- the contract's stop condition is reached;
- no covered action can advance the result.

Return with an adaptive brief beginning with:

```text
RETURN
Boundary state: OPEN
Execution result:
Evidence and verification:
Contradictions, limits, or residual effects:
Return condition reached:
```

Then switch back to Reasoning. `RETURN` resumes the same open boundary; it is neither `NEW`, `REOPEN`, nor `CLOSE`.

Do not switch for every tool call. One delegated boundary may contain several Standard interactions and several delegation iterations.

## Assess, Continue, Or Close

After `RETURN`, Reasoning resumes the current owner's method and determines what the evidence supports. Use [Verify Work](../../skills/verify-work/SKILL.md) when a factual claim needs explicit classification at its required evidence boundary. Once evidence supports the affected result, use [Review Work](../../skills/review-work/SKILL.md) for normal same-agent self-review through the current owner.

Cognitive Routing changes compute, not review independence. A selected independent review remains a separate Workflow and Review Work route; `RETURN` and `CLOSE` do not select or complete one.

Self-review is Reasoning's judgment over an evidence-supported state, not environment execution. Standard returns execution and verification evidence; Reasoning determines what it proves. If self-review needs a missing read, test, diagnostic, or command, Delegate the smallest evidence unit and resume judgment after `RETURN`. If it identifies a clear defect, Delegate correction and fresh verification through the same boundary, then self-review only the affected state. Neither route creates independent review or a new execution boundary.

Route returned execution as follows:

| Result | Reasoning route | Boundary |
| --- | --- | --- |
| Supported and complete | Self-review, then `CLOSE` and report or continue through Workflow | `NONE` after `CLOSE` |
| Supported with more accepted work | Delegate the next unit | Remains `OPEN` |
| One clear local defect | Delegate correction through the same boundary | Remains `OPEN` |
| Missing mechanical evidence | Delegate the smallest additional check | Remains `OPEN` |
| Unclear or repeated failure | [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) or Workflow | Open and suspended |
| User-owned choice or source conflict | [Decision Gate](../../skills/decision-gate/SKILL.md) | Open and suspended |
| Changed intent, scope, authority, or source truth | Workflow | Open and suspended until reconciled |
| Distinct result or separately controlled work | Close or route the changed boundary through Workflow | No silent continuation |

A clear correction does not require a new boundary. Adapt the existing contract while preserving the original result and evidence.

Before reporting completion or choosing another execution route, explicitly write `CLOSE` and `Boundary state: NONE`. Otherwise the boundary remains `OPEN`.

When supported evidence and self-review settle the result:

```text
CLOSE
Boundary state: NONE
Current owner: unchanged
Supported bounded result:
Important evidence, assumptions, and limits:
Next route:
REOPEN only if:
```

Closing leaves Reasoning active. It may report, continue conversationally, or later choose `YIELD`, `DELEGATE` with `NEW`, or qualifying `ACT_BOUNDED` for another covered execution need.

Do not close an unsupported, inconclusive, blocked, or route-changing result merely to remove the boundary. Do not create an automatic review-fix-review loop. If correction fails, repeats, or exposes shared-state consequences, use Diagnose Failure or Workflow.

## Act Bounded

`ACT_BOUNDED` is the only direct execution route for Automatic · Reasoning. It creates no execution boundary, changes no owner, and grants no authority.

Use it only when:

1. judgment and environment action are materially inseparable; and
2. shared-context delegation would cause material loss beyond premium execution cost.

Before acting, write:

```text
ACT_BOUNDED
Scope and expected result:
Why judgment and action are inseparable:
Why delegation would materially lose:
Existing authority:
Stop and reassess when:
```

While the scope remains valid, Reasoning may use the related environment tools and perform the bounded execution needed for its result. Do not repeat the marker per call.

It may begin whenever Reasoning controls execution, with or without an open Delegate boundary; never while Standard is executing Yield or Delegate. It may contribute evidence to an open boundary without closing it.

The scope ends at its stop condition, interruption, context loss, or material scope change. Return changed authority, ownership, direction, or evidence boundaries to Workflow.

Difficult artifact synthesis, consequential result-by-result intervention, or sensitive evolving judgment may qualify. Ordinary inspection, research, edits, tests, builds, verification, documentation, and cleanup do not. If uncertain, `DELEGATE`.

## Manual Control

The user owns Manual versus Automatic control and the held profile. A manual hold survives turns, compaction, session resume, and reload until the user changes or releases it. If the held profile cannot continue reliably, state the blocker and exact user control needed; do not switch automatically.

Under Manual · Standard:

- Standard runs the ordinary unsplit Workflow;
- Action Selection, TDD, Simplify Code, verification, review, diagnosis, and domain guidance remain available normally;
- do not request or simulate automatic routing.

Under Manual · Reasoning:

- Reasoning runs the ordinary unsplit Workflow;
- the automatic direct-environment-access restriction does not apply;
- do not simulate Yield, Delegate, `YIELD HANDOFF`, `RETURN`, or `ACT_BOUNDED` merely because Cognitive Routing is enabled.

A user control change takes effect at the next safe route boundary, never during an atomic environment interaction. Preserve supported results and visible contracts. If an automatic Delegate boundary is active, suspend it rather than silently abandoning it; the held manual profile then runs ordinary Workflow.

When the user releases Manual control, begin the next Automatic interaction in Reasoning and reconcile any suspended boundary before execution.

A control change changes compute only. It does not authorize work, resolve a user decision, close a boundary, or widen scope.

## Switch, Interrupt, And Recover Safely

Every automatic profile transition uses:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="one-sentence audit label"
)
```

The switch must be the only tool call in that assistant response. Write the applicable Yield brief, Delegate contract, handoff, or return before switching. Shared context carries existing evidence; visible routing text carries only the meaning the receiving profile needs.

Failed transitions preserve the supported route and never authorize a workaround:

- failed Yield switch to Standard: remain in Reasoning; Standard does not begin;
- failed Delegate switch to Standard: the boundary remains `OPEN`, but Standard does not begin;
- failed `YIELD HANDOFF` switch to Reasoning: Standard stops after the safe handoff point;
- failed `RETURN` switch to Reasoning: Standard stops and cannot resolve or close the open boundary;
- failed switch from Manual to Automatic: remain under the held manual profile.

Reasoning must not perform direct execution to bypass a failed transition. A fresh `ACT_BOUNDED` scope still requires its independent eligibility conditions.

User interruption is a handoff or return condition. At the next safe point, Standard sends `YIELD HANDOFF` or `RETURN` with partial effects and unverified work. If interruption prevents that marker and Reasoning regains control, treat Yield as incomplete and Delegate as still `OPEN`; never infer completion from a profile change.

Do not switch during an atomic environment interaction when avoidable. If cancellation may have left partial effects, route inspection through Standard unless a fresh `ACT_BOUNDED` scope independently qualifies.

After interruption, compaction, context loss, or resume, recover:

- latest extension-generated Control and Profile;
- current owner and bounded activity;
- active Yield or Delegate route;
- model-written boundary operation and state, when one exists;
- latest contract, handoff, or return;
- live authority, evidence, effects, and stop condition.

Complete recovery before selecting another route. A fresh `ACT_BOUNDED` scope cannot begin until recovery is complete.

Automatic · Reasoning does not gain direct execution access for recovery. Route required inspection through Yield or Delegate unless `ACT_BOUNDED` independently qualifies.

Do not infer an open boundary from `Profile: standard`, and do not infer Yield merely because no boundary is visible. If continuity, authority, or boundary identity is unclear, stop and return the uncertainty to Workflow rather than executing.

An open boundary may survive turns, compaction, resume, reload, delegated execution, and evidence-driven re-entry while its original outcome remains coherent. A stale contract never overrides contradictory live evidence. A Working Record preserves task context but never becomes routing state or authority.

## Stop

End the current automatic route when:

- `YIELD HANDOFF` safely returns a yielded result or changed boundary;
- Reasoning closes a Delegate boundary;
- an `ACT_BOUNDED` scope reaches its stop condition;
- no execution-bearing bounded activity is authorized;
- Workflow reaches a Supported Exit.

Automatic routing remains available for another covered execution need. When Cognitive Routing is inactive or control is Manual, this automatic protocol does not apply.

Do not:

- let Automatic · Reasoning perform direct execution outside `ACT_BOUNDED`;
- let Automatic · Standard begin untracked execution;
- let Standard decide whether Reasoning is needed;
- turn Reasoning or Standard into a new owner because the profile changed;
- treat Yield as an open boundary;
- treat `RETURN` as boundary closure;
- create a new boundary for every tool call, correction, or self-review;
- close an unsupported boundary to avoid resolving it;
- delegate unresolved material judgment to Standard;
- use `ACT_BOUNDED` for ordinary work, convenience, or transition avoidance;
- keep a boundary across distinct bounded activities;
- continue an unclear or repeated correction loop;
- hide transfer meaning in private reasoning;
- treat profile capability as action authority.
