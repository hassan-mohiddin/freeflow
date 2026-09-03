---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active and automatic or manual compute control, profile transitions, delegated execution, direct Reasoning action, or boundary continuity must be interpreted."
---

# Cognitive Routing

Cognitive Routing is a Reasoning-governed compute-routing model for one active agent in one shared visible context:

- **Reasoning** leads material judgment. It interprets intent and evidence, resolves or preserves governing uncertainty, creates execution contracts, and assesses returned results for the current owner.
- **Standard** is the ordinary workhorse. It reasons about local mechanics, leads complete results when Reasoning yields, and executes decision-complete contracts when Reasoning delegates.

In Automatic mode, Reasoning governs route selection and material judgment, but it does not lead every execution route. **Delegate** is the stateful Reasoning-led execution loop; **Yield** transfers whole-result leadership to Standard; and **ACT_BOUNDED** gives Reasoning direct action only within an exceptional declared scope.

Both profiles can reason. This is not a thinking-versus-doing split, a Workflow phase model, a second agent, or detached consultation. Standard executes accepted direction and returns contradictions instead of silently changing it.

**Cognitive demand** is the capability needed to choose or perform the next action reliably given uncertainty, branching, causal depth, and consequence. It is not task size, tool count, or Workflow phase.

A **material cognitive boundary** is a governing uncertainty or judgment that Standard must not settle while executing. Reasoning may settle enough direction to delegate one unit while retaining responsibility for what its evidence means.

A **decision-complete unit** gives Standard enough direction to proceed without choosing a material change to outcome, architecture, policy, failure behavior, scope, authority, or evidence requirements. It applies to Standard’s assigned unit, not necessarily to the whole cognitive boundary.

Cognitive Routing changes compute only. It does not change the current owner, authority, permitted effects, evidence requirements, review independence, bounded activity, Slice, or Supported Exit. A profile switch never authorizes action, resolves a user decision, creates task memory, proves a result, or changes ownership.

[Workflow](../../skills/workflow/SKILL.md) owns authority, the active method, checkpoints, and Supported Exit. When durable task memory is needed, [Track Work](../../skills/track-work/SKILL.md) records it. Cognitive Routing owns neither.

Both profiles inherit the same visible conversation, tool history, current owner, authority envelope, task memory, and evidence. A switch changes compute, not context; do not reconstruct or restate inherited state after switching. Visible transfer records carry only the governing conclusions, execution responsibility, and return conditions needed by the receiving profile.

There are two control modes:

- **Automatic:** each new user interaction begins in Reasoning, which chooses how covered execution reaches the environment.
- **Manual:** the user holds Standard or Reasoning, and that profile runs the ordinary unsplit Workflow. Automatic routing does not apply.

The existing `freeflow_switch_profile` tool is the only profile-switch mechanism. This skill gives that tool meaning; it does not create another tool.

## Read Current State

Use the latest extension-generated `Control` and `Profile`. Earlier profile state, transition results, and natural-language suggestions are history or advice.

Runtime State establishes current control and profile, not the model-written Yield, Delegate, or `ACT_BOUNDED` route or execution-boundary state. A Runtime State refresh is host context, not an interruption; it does not end an active route or `ACT_BOUNDED` scope unless the reported state contradicts it.

| Runtime state | Required behavior |
| --- | --- |
| Automatic · Reasoning | Lead analysis, discussion, decisions, assessment, and reporting. Route execution through `YIELD`, `DELEGATE`, or qualifying `ACT_BOUNDED`. |
| Automatic · Standard during Yield | Lead one complete ordinary bounded result and hand it back. |
| Automatic · Standard during Delegate | Execute the open contract while Reasoning retains boundary responsibility. |
| Manual · Standard | Run the ordinary unsplit Workflow; no automatic routing protocol applies. |
| Manual · Reasoning | Run the ordinary unsplit Workflow; no automatic routing protocol applies. |

In Automatic mode, Reasoning owns all substantive user-facing interpretation, questions, decisions, assessment, progress, and final reporting. Its conversational analysis and reporting need no route marker.

Automatic Standard never conducts substantive user-facing interaction. It only executes an active Yield or Delegate contract, writes the compact `YIELD HANDOFF` or `RETURN` needed to transfer state, and switches to Reasoning. It must not interpret or answer user messages, ask questions, discuss decisions, assess results, or give progress or final reports. The transfer record is control text, not substantive user interaction.

In Automatic mode, begin every new user interaction in Reasoning, even if the preceding route used Standard. At any return condition—including available evidence, completion, a blocker or material question, a contract stop condition, failure, or a fresh user message—Standard finishes only the current atomic environment interaction, preserves partial effects and unverified work, writes the active route’s transfer record, and switches to Reasoning. Reasoning then interprets, assesses, asks, discusses, or reports.

Outside an explicit `ACT_BOUNDED` scope, Automatic Reasoning must not perform environment interaction, active evidence generation, mutation, tests, diagnostics, builds, probes, or substantive artifact production. Its only tool call is `freeflow_switch_profile`, which is a control operation.

The current owner remains unchanged across profile transitions.

## Choose Automatic Execution

When covered execution is needed, inspect the current boundary state first. Then route by residual cognitive responsibility—not by task phase, apparent complexity, or tool count.

```text
Automatic · Reasoning
└─ execution is needed
   ├─ Boundary OPEN
   │  ├─ DELEGATE the next unit, including work that would otherwise look like Yield
   │  ├─ ACT_BOUNDED if its independent conditions hold
   │  ├─ suspend or route a contradiction, choice, or changed boundary
   │  └─ CLOSE only after the bounded result is supported and reviewed
   └─ Boundary NONE
      ├─ YIELD if Standard can own the whole bounded result
      ├─ ACT_BOUNDED if its independent conditions hold
      └─ otherwise DELEGATE and open a boundary
```

### Boundary OPEN

Delegate is the continuing execution route while a boundary is `OPEN`. Standard executes decision-complete units and returns through the same boundary; Reasoning interprets the evidence and decides what follows.

Do not use literal `YIELD` while a Delegate boundary is open, and do not close the boundary merely to obtain Yield. If a unit would qualify for Yield in isolation, it remains Delegate because Reasoning still owns the boundary.

`ACT_BOUNDED` may temporarily operate inside an open Delegate boundary when its own conditions hold. It contributes evidence or effects to that boundary but never contains Delegate and never closes the boundary.

### Boundary NONE

Use **YIELD** only when Standard can own the whole result end to end: the result is small, exact, local, reversible, low-risk, directly verifiable, and requires no new material Reasoning judgment after execution. Yield creates no boundary.

Use **ACT_BOUNDED** only when judgment and environment action are materially inseparable and delegation would materially lose more than premium execution costs. It creates no boundary.

Otherwise use **DELEGATE**. This is the default when Reasoning must interpret returned evidence or govern what follows, including substantial work, unresolved local choices, source inspection, research, exploration, diagnostics, tests, verification, and evidence gathering.

For Delegate, the normal loop is:

```text
Reasoning frames the question or settled direction
-> writes a decision-complete contract for one unit
-> switches to Standard
-> Standard executes and returns evidence
-> Reasoning interprets the evidence
   -> more accepted work: delegate again
   -> supported and complete: self-review, then CLOSE
   -> contradiction or material change: diagnose, decide, ask, or return to Workflow
```

One environment call may still require Delegate. A large overall task may Yield one small, exact, ordinary bounded result. Better performance, convenience, fewer transitions, fewer tool calls, or preference for Reasoning never justifies direct access.

If uncertain, use `DELEGATE`.

A route never widens authority. If outcome, scope, authority, evidence boundary, or stop condition is unsettled, return to Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md) before execution.

Examples:

- With boundary `NONE`, reading an exact package version and reporting it may Yield.
- With boundary `NONE`, reading a configuration file so Reasoning can choose an architecture requires Delegate.
- With boundary `OPEN`, even an exact package-version read remains Delegate and returns through the open boundary.
- A sensitive intervention whose next action depends on interpreting each prior effect may qualify for `ACT_BOUNDED`.

## Switching Profiles

Every automatic profile transition uses:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="one-sentence audit label"
)
```

Write the applicable Yield brief, Delegate contract, handoff, or return before switching. The switch must be the only tool call in that assistant response. Shared context carries existing evidence; visible routing text carries only the meaning the receiving profile needs.

Do not switch after every tool call or during an atomic environment interaction when avoidable. Keep Standard active until its contract reaches a return condition.

## Reasoning Execution Boundaries

A **Reasoning execution boundary** is the visible protocol that keeps one material cognitive boundary coherent while Standard executes. Yield and `ACT_BOUNDED` do not create one. Reasoning owns the execution boundary; the current owner owns the bounded activity.

A Slice may contain zero, one, or many sequential boundaries. At most one boundary is `OPEN` at a time. Keep boundary state separate from its operation:

```text
Boundary state: NONE | OPEN
Boundary operation: NEW | REOPEN | CLOSE
```

- `NEW` opens the first delegated boundary for one bounded outcome.
- `REOPEN` is an authorized continuation of the same previously closed outcome, requiring fresh authority and either invalidating evidence or changed intent.
- `RETURN` is a transfer record that gives execution evidence back to Reasoning while leaving the boundary `OPEN`; it is not a boundary operation.
- `CLOSE` returns the boundary to `NONE`.

Opening, returning through, reopening, or closing a boundary never selects, extends, settles, or closes the wider Slice. A boundary cannot continue across distinct bounded activities.

## Standard’s Contract

During Yield or Delegate, Standard executes the current owner’s method under the applicable direction. It may reason about local mechanics, choose repository-consistent reversible details, use [Action Selection](../../skills/action-selection/SKILL.md), and apply appropriate methods such as [TDD](../../skills/tdd/SKILL.md) or [Simplify Code](../../skills/simplify-code/SKILL.md). It may gather required evidence, verify, and perform ordinary self-review through [Review Work](../../skills/review-work/SKILL.md).

Standard must return rather than settle or silently reinterpret a material change to outcome, architecture, policy, failure behavior, scope, authority, evidence boundary, or governing direction. It must return when:

- the contract’s result or required evidence is available;
- scoped execution or verification ends;
- the Yield result is no longer exact or local, or broad exploration or material Reasoning judgment becomes necessary;
- a blocker, material question, contradiction, or user-owned choice appears;
- execution, verification, or evidence fails or becomes inconclusive;
- scope, architecture, policy, failure behavior, authority, or evidence requirements materially change;
- the contract’s stop condition is reached;
- no covered action can advance the result;
- any fresh user message arrives, including interruption, cancellation, or direction change.

At a return condition, finish only the current atomic environment interaction, preserve partial effects and unverified work, write the active route’s transfer record, and switch to Reasoning. A fresh user message is never interpreted or answered by Automatic Standard.

## Yield To Standard

Yield is a one-off leadership transfer for one complete ordinary bounded result. Use it only while:

```text
Boundary state: NONE
```

Before switching, write an adaptive brief beginning with literal `YIELD`. Make clear what Standard owns, the constraints and evidence, and when it must hand back. One line is enough when the result is obvious. Then switch to Standard using the shared transition rule.

While Yield is active, Standard runs the ordinary unsplit Workflow for the yielded result and continues only while the original result and authority remain coherent. It hands back when the common return conditions apply, including when the result is supported and complete.

Write:

```text
YIELD HANDOFF
Result:
Evidence and limits:
Blocker, partial effects, or changed boundary, if any:
Handoff condition reached:
```

Then switch to Reasoning. `YIELD HANDOFF` is a profile transfer, not Delegate `RETURN` and not the separate point-in-time Handoff method. Reasoning accepts and reports a supported result or routes a changed issue through Workflow, Decision Gate, [Diagnose Failure](../../skills/diagnose-failure/SKILL.md), or another owner. Do not repeat Standard’s full self-review unless the handoff is contradictory or insufficient.

## Delegate To Standard

Use Delegate when Reasoning must retain cognitive leadership for execution evidence or what follows from it. Delegated observation, inspection, research, diagnostics, verification, and evidence gathering remain Standard execution even when mechanically small.

A decision-complete contract is the smallest instruction that leaves Standard with no unresolved material judgment for its assigned unit. Use shared context rather than replaying it. Include only what applies:

- bounded outcome;
- supported judgment, constraints, and invariants;
- scope and necessary ordering;
- reversible local choices Standard may make;
- required evidence or verification;
- conditions that require return.

Reasoning may first delegate evidence gathering for a boundary it has not yet settled. Standard investigates the question and returns evidence; it does not settle the boundary.

### Open And Execute

For the first transfer, write:

```text
DELEGATE
Boundary operation: NEW | REOPEN
Boundary state: OPEN
```

Use `NEW` for the first boundary. Use `REOPEN` only for the authorized continuation of the same previously closed outcome described above. When a boundary remains `OPEN` after `RETURN`, begin the next transfer with `DELEGATE` and omit `NEW` or `REOPEN`.

After the marker, give Standard the contract and switch to Standard. The switch must be the only tool call in that assistant response.

Action Selection and any direct fast-path interaction remain inside the current delegation and do not create another execution boundary.

### Return

When a return condition occurs, write:

```text
RETURN
Boundary state: OPEN

Execution result:
Evidence and verification:
Contradictions, limits, or residual effects:
Return condition reached:
```

Then switch back to Reasoning. `RETURN` resumes the same open boundary; it is neither `NEW`, `REOPEN`, nor `CLOSE`. One delegated boundary may contain several Standard interactions and delegation iterations.

### Assess, Continue, Or Close

After `RETURN`, Reasoning resumes the current owner’s method and determines what the evidence supports. Use [Verify Work](../../skills/verify-work/SKILL.md) when a claim needs explicit classification at its required evidence boundary. Once evidence supports the affected result, perform same-agent self-review through the current owner.

Self-review is Reasoning’s judgment over an evidence-supported state, not environment execution. If it needs another read, test, diagnostic, or command, Delegate the smallest evidence unit and resume after `RETURN`. A selected independent review remains a separate Workflow route; profile transitions do not create or complete independent review.

Route the returned result as follows:

| Result | Next action | Boundary |
| --- | --- | --- |
| Supported and complete | Self-review, then close and report or continue through Workflow. | Close to `NONE`. |
| Supported with more accepted work | Delegate the next unit. | Remains `OPEN`. |
| One clear local defect | Delegate correction and affected verification through this boundary. | Remains `OPEN`. |
| Missing mechanical evidence | Delegate the smallest additional check. | Remains `OPEN`. |
| Unclear or repeated failure | Use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) or Workflow. | Open and suspended. |
| User-owned choice or source conflict | Use Decision Gate. | Open and suspended. |
| Changed intent, scope, authority, or source truth | Use Workflow. | Open and suspended until reconciled. |
| Distinct result or separately controlled work | Close or route the change through Workflow. | No silent continuation. |

A clear correction does not require a new boundary. Adapt the existing contract while preserving the original result and evidence. Do not create an automatic review-fix-review loop. If correction fails, repeats, or exposes shared-state consequences, use Diagnose Failure or Workflow.

Before reporting completion or choosing another execution route, explicitly write `CLOSE` and `Boundary state: NONE`. Otherwise the boundary remains `OPEN`.

When supported evidence and self-review settle the result, write:

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

Do not close an unsupported, inconclusive, blocked, contradictory, or route-changing result merely to clear the boundary.

## Act Bounded

`ACT_BOUNDED` is the only direct execution route for Automatic Reasoning. It creates no execution boundary, changes no owner, and grants no authority.

Use it only when both are true:

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

While the scope remains valid, Reasoning may use the related environment tools and perform only the bounded execution required by the result. Do not repeat the marker per call.

It may begin whenever Reasoning controls execution, with or without an open Delegate boundary, but never while Standard is executing Yield or Delegate. It may contribute evidence to an open boundary without closing it.

The scope ends at its stop condition, interruption, context loss, material scope change, authority change, or loss of eligibility. Return changed authority, ownership, direction, or evidence boundaries to Workflow.

Difficult artifact synthesis, consequential result-by-result intervention, or sensitive evolving judgment may qualify. Ordinary inspection, research, edits, tests, builds, verification, documentation, cleanup, convenience, and transition avoidance do not.

If uncertain, `DELEGATE`.

## Manual Control

The user owns Manual versus Automatic control and the held profile. A manual hold survives turns, compaction, session resume, and reload until the user changes or releases it. If the held profile cannot continue reliably, state the blocker and exact user control needed; do not switch automatically.

Under Manual · Standard, Standard runs the ordinary unsplit Workflow, including user-facing interaction. Action Selection, TDD, Simplify Code, verification, review, diagnosis, and domain guidance remain available normally.

Under Manual · Reasoning, Reasoning runs the ordinary unsplit Workflow. The Automatic direct-environment restriction does not apply. Do not simulate Yield, Delegate, `YIELD HANDOFF`, `RETURN`, or `ACT_BOUNDED` merely because this skill is enabled.

A user control change takes effect at the next safe route boundary, never during an atomic environment interaction. Preserve supported results and visible contracts. If an automatic Delegate boundary is active, suspend it rather than silently abandoning it; the held manual profile then runs ordinary Workflow.

When the user releases Manual control, begin the next Automatic interaction in Reasoning and reconcile any suspended boundary before execution.

A control change changes compute only. It does not authorize work, resolve a user decision, close a boundary, or widen scope.

## Interruptions, Failed Switches, And Recovery

A failed transition preserves the supported route and never authorizes a workaround:

- failed Yield switch to Standard: remain in Reasoning; Standard does not begin;
- failed Delegate switch to Standard: the boundary remains `OPEN`; Standard does not begin;
- failed `YIELD HANDOFF` switch to Reasoning: Standard stops after the safe handoff point;
- failed `RETURN` switch to Reasoning: Standard stops and cannot resolve or close the open boundary;
- failed switch from Manual to Automatic: remain under the held manual profile.

Reasoning must not perform direct execution to bypass a failed transition. A fresh `ACT_BOUNDED` scope still requires its independent eligibility conditions.

If interruption prevents the transfer marker and Reasoning regains control, treat Yield as incomplete and Delegate as still `OPEN`; never infer completion from a profile change. If cancellation may have left partial effects, preserve them and route inspection through Standard. Once recovery is complete, a fresh `ACT_BOUNDED` scope may be used only if it independently qualifies.

After interruption, compaction, context loss, resume, reload, or uncertain continuity, recover before further task execution:

- latest extension-generated Control and Profile;
- current owner and bounded activity;
- active Yield or Delegate route;
- model-written boundary operation and state, when one exists;
- latest contract, handoff, or return;
- live authority, evidence, partial effects, unverified work, and stop condition.

Complete recovery before selecting another route. A fresh `ACT_BOUNDED` scope cannot begin until recovery is complete. During recovery, Automatic Reasoning has no direct environment access; route required inspection through Yield or Delegate. After recovery, a new ACT scope still needs independent qualification.

Do not infer:

- an open boundary from `Profile: standard`;
- Yield merely because no boundary is visible;
- completion from a profile change;
- authority from a prior contract;
- live state from task memory.

A Working Record may preserve task context but never becomes routing state or authority.

An open boundary may survive turns, compaction, resume, reload, delegated execution, and evidence-driven re-entry while its original outcome remains coherent. A stale contract never overrides contradictory live evidence. If route identity, continuity, authority, ownership, or boundary state is unclear, stop and return the uncertainty to Workflow.

## Stop

End the current automatic route when:

- `YIELD HANDOFF` safely returns a yielded result or changed boundary;
- Reasoning closes a Delegate boundary;
- an `ACT_BOUNDED` scope reaches its stop condition;
- no execution-bearing bounded activity is authorized;
- Workflow reaches a Supported Exit.

Automatic routing remains available for another covered execution need. When Cognitive Routing is inactive or control is Manual, this automatic protocol does not apply.

Do not:

- let Automatic Reasoning perform direct execution outside `ACT_BOUNDED`;
- let Automatic Standard begin execution without an active contract or conduct substantive user-facing interaction outside transfer control text;
- let Standard settle unresolved material judgment or decide whether Reasoning is needed;
- turn a profile into a new owner or treat profile capability as authority;
- treat Yield as an open boundary or `RETURN` as boundary closure;
- create a boundary per tool call, correction, or self-review;
- keep a boundary across distinct bounded activities;
- close an unsupported boundary to avoid resolving it;
- use `ACT_BOUNDED` for ordinary work, convenience, or transition avoidance;
- continue an unclear or repeated correction loop;
- hide transfer meaning in private reasoning.
