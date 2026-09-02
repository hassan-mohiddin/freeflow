---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active and automatic or manual compute control, profile transitions, delegated execution, direct Reasoning action, or boundary continuity must be interpreted."
---

# Cognitive Routing

Use two compute profiles for one active agent in one shared visible context:

- **Reasoning** performs material judgment for the current owner, establishes adaptive contracts, and assesses returned results.
- **Standard** handles ordinary thinking and execution when Reasoning yields, or bounded execution when Reasoning delegates.

Cognitive Routing changes compute only. It does not change the current owner, authority, permitted effects, evidence requirements, review independence, bounded activity, Slice, or Supported Exit.

There are two control modes:

- **Automatic:** each new user interaction begins in Reasoning. Profile transitions are internal; the user does not choose each cycle.
- **Manual:** the user holds Standard or Reasoning. The held profile runs the ordinary unsplit Workflow and the automatic delegation protocol does not apply.

The existing `freeflow_switch_profile` tool remains the only profile-switch mechanism. This skill gives that tool its meaning; it does not create another tool.

## Preserve The Ordinary Workflow

A **Reasoning execution boundary** is the model-written protocol for one delegated execution-bearing bounded activity. It is not another activity, owner, authority source, Plan, or Working Record.

A Slice may contain zero, one, or many sequential Reasoning execution boundaries. When durable task memory is needed, [Track Work](../../skills/track-work/SKILL.md) records the wider Slice. At most one Reasoning execution boundary is `OPEN` at a time. One open boundary may contain several Standard delegations and returns; only the first delegated entry uses `NEW`, and `REOPEN` is reserved for a closed boundary. Opening, returning through, reopening, or closing an execution boundary never selects, extends, settles, or closes that Slice by itself.

Keep active state and transition separate:

```text
Boundary state: NONE | OPEN
Boundary operation: NEW | REOPEN | CLOSE
```

`REOPEN` is an operation, not a lasting state. It changes a historical closed boundary back to `OPEN`. After `CLOSE`, no active boundary remains. `RETURN` transfers execution evidence to Reasoning while leaving the boundary `OPEN`. Reasoning owns the Cognitive Routing boundary and its transitions; the current owner owns the bounded activity.

A **decision-complete contract** is the smallest model-written instruction that leaves Standard with no unresolved material judgment. Its shape is adaptive: it may be one line, a short brief, or a detailed set of sections. Include only the outcome, constraints or invariants, scope, evidence, ordering, and return conditions needed for the current result. Detail is proportional to residual judgment; it is not a fixed schema or a command-by-command plan. Contract detail is adaptive; route and transition markers remain explicit.

**Task Act** is direct Reasoning action for a narrow scope. Use `OBSERVE` for one narrow, discriminating observation and `ACT_BOUNDED` when judgment and action are materially inseparable. Profile switching and compact transition contracts are control operations, not Task Act. Task Act does not create an execution boundary.

Runtime State supplies authoritative `Control` and `Profile`. Route and boundary remain visible model-written state. After context loss or uncertainty, recover fresh state before Task Act and never infer boundary state from the Runtime State block.

## Read Current State

Read the latest extension-generated `Control` and `Profile`. Earlier profile state, transition results, and natural-language suggestions are history or advice.

| Runtime state | Route |
| --- | --- |
| Automatic · Reasoning | Reasoning discusses, routes, assesses, closes boundaries, or performs permitted Task Act. |
| Automatic · Standard during Yield | Standard leads the ordinary unsplit Workflow for one yielded bounded result. |
| Automatic · Standard during Delegate | Reasoning retains boundary responsibility; Standard executes the open contract. |
| Manual · Standard | Standard runs the ordinary unsplit Workflow; no automatic Yield or Delegate protocol. |
| Manual · Reasoning | Reasoning runs the ordinary unsplit Workflow; no automatic Yield or Delegate protocol. |

In Automatic, begin every new user interaction in Reasoning, even if the preceding automatic route used Standard. If an active Standard route has not reached a safe handoff or return, complete only the current safe interaction before transferring control; do not let a new profile choice interrupt an atomic environment action.

The current owner remains the owner across profile transitions. Profile transitions remain inside the current Feedback Loop and return evidence to that owner; they never authorize action, create task memory, resolve a user decision, or prove a result. Workflow owns authority, the active method, checkpoints, and Supported Exit. The active owner owns the bounded activity. Track Work owns durable task memory. Cognitive Routing does not become any of these owners.

## Choose The Automatic Route

When Reasoning receives an execution-bearing bounded activity without an active Standard route, choose exactly one of these routes:

```text
Reasoning
├─ YIELD       Standard temporarily leads ordinary work; no boundary
├─ DELEGATE    Reasoning remains leader; Standard executes an open boundary
└─ TASK ACT    Reasoning performs one narrow direct OBSERVE or ACT_BOUNDED scope
```

Pure discussion, explanation, judgment, routing, and reporting remain in Reasoning and are not an execution route.

Use **YIELD** only when the result is small, exact, local, reversible, low-risk, directly verifiable, and does not require material judgment after execution. If the choice between Yield and Delegate is uncertain, choose Delegate.

Use **DELEGATE** for substantial work, unresolved local execution choices, potentially broad exploration, or work where Reasoning should remain responsible for the governing direction and evidence.

Use **TASK ACT** only for a narrow `OBSERVE` when direct inspection is cheaper and clearer than transfer, or `ACT_BOUNDED` when judgment and action are materially inseparable. Better performance alone is not enough. Use the narrowest direct scope and return to Reasoning when its stop condition is reached.

A route choice does not widen authority. If the outcome, scope, authority, evidence boundary, or stop condition is unsettled, return to [Workflow](../../skills/workflow/SKILL.md) or [Decision Gate](../../skills/decision-gate/SKILL.md) before execution.

## Yield To Standard

Yield is a one-off leadership transfer for one bounded result, used only while `Boundary state: NONE`. It is not a persistent Standard mode and does not create a Reasoning execution boundary.

Before yielding, Reasoning gives Standard an adaptive Yield brief beginning with literal `YIELD`. A one-line brief is sufficient when the result is obvious; add detail when scope, verification, or handoff conditions need it. The brief must make clear what Standard is taking over and when it must hand back.

Then switch to Standard with the existing profile-switch tool:

```text
freeflow_switch_profile(
  target="standard",
  reason="one-sentence yield label"
)
```

The switch must be the only tool call in that assistant response.

While Yield is active, Standard runs the ordinary unsplit Workflow for the yielded result. Standard may:

- think through local execution;
- choose an appropriate method such as [TDD](../../skills/tdd/SKILL.md) or [Simplify Code](../../skills/simplify-code/SKILL.md);
- use Action Selection for local uncertainty; broad exploration requires `YIELD HANDOFF`;
- verify the result;
- perform ordinary self-review through [Review Work](../../skills/review-work/SKILL.md);
- continue while the original result and authority remain coherent.

Standard must hand back rather than silently turning Yield into delegated execution when:

- the result is no longer exact or local;
- a user-owned choice or source conflict appears;
- verification fails or is inconclusive;
- the user interrupts, cancels, or changes direction;
- the work needs a material scope, architecture, policy, or evidence decision;
- the outcome becomes substantial or another activity would own it;
- the yielded result is supported and complete.

One possible compact handback shape is:

```text
YIELD HANDOFF
Result:
Evidence and limits:
Blocker or changed boundary, if any:
Handoff condition reached:
```

This is not a required schema; include only the information needed to transfer the result safely. Then switch back to Reasoning with the same tool. `YIELD HANDOFF` is not `RETURN`: no execution boundary exists to remain open. It is a profile transfer, not the separate point-in-time Handoff method. Reasoning gives the final brief when the result is supported, or routes the handed-back issue through Workflow, Diagnose Failure, Decision Gate, or another accepted route. Reasoning does not repeat Standard's full self-review unless the handoff contains contradictory or insufficient evidence.

## Delegate To Standard

Use **NEW** when an execution-bearing bounded activity first becomes delegated. Use **REOPEN** only when fresh authority and invalidating evidence or changed intent return the same closed outcome to execution.

Before switching, Reasoning writes the adaptive contract beginning with literal `DELEGATE` and marks:

```text
DELEGATE
Boundary operation: NEW | REOPEN
Boundary state: OPEN
```

If the boundary is already `OPEN` after a prior `RETURN`, begin the next transfer with `DELEGATE` but omit `NEW` or `REOPEN`. The contract may be one line or detailed, but it must be sufficient for Standard to execute without rederiving material direction. Include as applicable:

- the bounded outcome;
- supported judgment, constraints, and invariants;
- scope and necessary ordering;
- reversible local choices Standard may make;
- evidence or verification required;
- conditions that require Standard to return.

Then switch to Standard using the existing tool. The switch must be the only tool call in that assistant response.

Standard executes the current owner's method under the open contract. It may use direct fast-path interactions or [Action Selection](../../skills/action-selection/SKILL.md) for local uncertainty. Action Selection returns to the current owner inside the delegation; it does not return directly to Reasoning and does not create a nested boundary.

Standard may choose repository-consistent mechanics and reversible local details. It must use `RETURN` rather than continue when the next step would materially change the outcome, architecture, policy, failure behavior, scope, evidence boundary, or authority.

Return when:

- required evidence is available;
- the scoped execution or verification ends;
- the user interrupts, cancels, or changes direction;
- execution, verification, or evidence fails or becomes inconclusive;
- a contradiction or material judgment appears;
- the contract's stop condition is reached;
- no covered action can advance the result.

Return with an adaptive result brief:

```text
RETURN
Boundary state: OPEN
Execution result:
Evidence and verification:
Contradictions, limits, or residual effects:
Return condition reached:
```

Then switch back to Reasoning with the existing tool. `RETURN` resumes the same open boundary; it is neither `NEW` nor `REOPEN`.

Do not switch profiles for every tool call. One delegated boundary may contain several Standard interactions and several delegation iterations.

## Assess, Continue, Reopen, Or Close

After `RETURN`, Reasoning resumes the current owner's method and determines what the returned evidence supports. Use [Verify Work](../../skills/verify-work/SKILL.md) when the claim or observing boundary needs explicit factual classification. Once evidence initially supports the affected result, use [Review Work](../../skills/review-work/SKILL.md) for the normal same-agent self-review through the current owner. Cognitive Routing changes compute, not the review role. A selected independent review remains a separate Workflow and Review Work route; `RETURN` and `CLOSE` do not select or complete one automatically.

Route the returned result as follows:

| Result | Reasoning route | Boundary |
| --- | --- | --- |
| Supported and complete | Use Review Work for self-review, then `CLOSE` and report or continue through Workflow | `NONE` after `CLOSE` |
| Supported with more accepted work | Delegate the next unit | Same boundary remains open |
| One clear local defect | Delegate more work using the same boundary; no separate remediation boundary | Same boundary remains open |
| Missing mechanical evidence | Use Task Act or delegate the smallest additional check | Remains open |
| Unclear or repeated failure | [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) or Workflow | Open and suspended while routed |
| User-owned choice or source conflict | [Decision Gate](../../skills/decision-gate/SKILL.md) | Open and suspended while blocked |
| Changed intent, scope, authority, or source truth | Workflow | Open and suspended until reconciled |
| Distinct result or separately controlled work | Close or route the changed boundary through Workflow | No silent continuation |

A clear correction does not require a separate remediation contract or a new boundary. Reasoning may adapt the existing contract for the next delegation while preserving its original result and evidence.

Before reporting completion or choosing another automatic route, explicitly write `CLOSE` and `Boundary state: NONE`; otherwise the boundary remains `OPEN`.

When the result is supported, verified at the required boundary, and self-reviewed without an unresolved material issue:

```text
CLOSE
Boundary state: NONE
Current owner: unchanged
Supported bounded result:
Important evidence, assumptions, and limits:
Next route:
REOPEN only if:
```

Closing a delegated boundary leaves Reasoning active. It does not hand leadership to Standard. Reasoning may give the final response, continue discussion, or start another authorized bounded activity through `YIELD`, `DELEGATE` with `NEW`, or `TASK ACT`.

A closed boundary may be reopened only for authorized continuation of the same original outcome, with a reason, scope, expected evidence, and stop condition. A distinct result requires a new bounded activity and a new `NEW` boundary when delegated.

Do not close an unsupported, inconclusive, blocked, or route-changing result merely to remove the boundary. Do not create an automatic review-fix-review loop. If correction fails, repeats, or exposes related shared-state consequences, return to Diagnose Failure or Workflow.

## Task Act From Reasoning

Task Act is available whenever Reasoning has control. Before the first tool call in a direct Reasoning scope, explicitly write `OBSERVE` or `ACT_BOUNDED` with its scope and stop condition. That marker covers the tightly related interactions required to reach the stop; do not repeat it tool by tool. A materially different scope requires another marker or `YIELD`/`DELEGATE`.

Task Act may be selected:

- before any boundary is open;
- while assessing an open boundary after Standard returns;
- after a `YIELD HANDOFF`;
- after a completed Task Act scope.

It is not available while Standard is actively executing a Yield or Delegation; Reasoning waits for `YIELD HANDOFF` or `RETURN`.

Use `OBSERVE` when one narrow, discriminating observation is cheaper and clearer than delegation:

```text
OBSERVE
Question:
Scope:
Stop when:
```

Use `ACT_BOUNDED` only when judgment and action are materially inseparable:

```text
ACT_BOUNDED
Why judgment and action are inseparable:
Scope:
Authority:
Stop and reassess when:
```

A Task Act scope expires at its stop condition and returns Reasoning to Think or boundary assessment. At the stop, state its conclusion before another Task Act or route. Task Act scopes expire on interruption or context loss; after recovery, select a fresh route. A scope never covers the whole execution boundary, broad exploration, adjacent cleanup, or another action by implication.

When a Task Act result is direct evidence for an open boundary, keep the boundary `OPEN`. When it changes authority, scope, ownership, accepted direction, evidence boundary, or stop conditions, route to Workflow. When it exposes an unclear or repeated failure, use Diagnose Failure. When it exposes a user-owned choice, use Decision Gate.

If the action could be executed safely by Standard without losing material judgment, use Yield or Delegate instead. Do not use Task Act to bypass the execution split or to perform broad routine work in Reasoning.

## Manual Control

The user owns Manual versus Automatic control and the held profile. A manual hold survives turns, compaction, session resume, and reload until the user changes or releases it. If the held profile cannot continue reliably, state the blocker and exact user control needed; do not switch automatically.

Under Manual · Standard:

- Standard runs the ordinary unsplit Workflow;
- Action Selection, TDD, Simplify Code, verification, review, diagnosis, and domain guidance remain available normally;
- the model does not request or simulate automatic profile switching.

Under Manual · Reasoning:

- Reasoning runs the ordinary unsplit Workflow;
- direct task work follows ordinary Workflow rather than the automatic Task Act gate;
- the model does not simulate Yield, Delegate, `YIELD HANDOFF`, or `RETURN` merely because Cognitive Routing is enabled.

A user control change takes effect at the next safe route boundary, never in the middle of an atomic environment interaction. Preserve any supported result and visible contract. If an automatic delegated boundary is active, suspend it rather than silently abandoning it; the held manual profile then runs the ordinary Workflow. When the user releases Manual control, begin the next Automatic interaction in Reasoning and reconcile any suspended boundary before execution.

A manual control change changes compute control only. It does not authorize new work, resolve a user decision, close a boundary, or widen scope.

## Switch And Resume Safely

Every automatic profile transition uses:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="one-sentence audit label"
)
```

The switch must be the only tool call in that assistant response. Write the applicable route, contract, handoff, return, or task-act scope before switching. Shared context carries existing evidence; the visible contract carries only the route-specific meaning needed by the receiving profile.

Failed transitions preserve the supported boundary and do not authorize a workaround:

- failed Yield switch to Standard: remain in Reasoning; do not let Standard begin untracked work;
- failed Delegate switch to Standard: the boundary remains `OPEN`, but Standard cannot start; do not perform broad direct Reasoning execution as a substitute;
- failed `YIELD HANDOFF` switch to Reasoning: Standard stops after the safe handoff point and does not continue the yielded task;
- failed Delegate `RETURN` switch to Reasoning: Standard stops and cannot resolve or close the open boundary;
- failed switch from Manual to Automatic: remain under the held manual profile until the control state changes successfully.

User interruption is a handoff or return condition. At the next safe point, Standard sends `YIELD HANDOFF` or `RETURN` with partial effects and unverified work. If interruption prevents that marker and Reasoning regains control, treat Yield as incomplete and Delegate as still `OPEN`; never infer completion from a profile change. Do not switch during an atomic environment interaction when avoidable. If cancellation may have left partial effects, inspect them before retrying or continuing.

After interruption, compaction, context loss, or resume, recover:

- latest extension-generated Control and Profile;
- current owner and bounded activity;
- Yield or Delegate route;
- model-written boundary operation and state, when one exists;
- latest contract, handoff, or return;
- live evidence, authority, and stop condition.

Do not infer an open boundary from `Profile: standard`, and do not infer Yield merely because no boundary is visible. If continuity, authority, or boundary identity is unclear, stop and return the uncertainty to Workflow rather than executing.

An open boundary may survive turns, compaction, resume, reload, delegated execution, and evidence-driven re-entry while its original outcome remains coherent. A stale contract never overrides contradictory live evidence. A Working Record preserves task context but never becomes routing state or authority.

## Stop

End the current automatic route when:

- a `YIELD HANDOFF` returns control to Reasoning;
- Reasoning closes a Delegate boundary;
- no execution-bearing bounded activity is authorized;
- Workflow reaches a Supported Exit.

Automatic routing remains available for another authorized activity after a Yield handoff or Delegate closure. When Cognitive Routing is inactive or control is Manual, this automatic protocol does not apply.

Do not:

- let Automatic · Standard begin untracked Task Act;
- let Standard decide whether Reasoning is needed;
- turn Reasoning or Standard into a new owner merely because the profile changed;
- treat Yield as an open boundary;
- treat `RETURN` as boundary closure;
- create a new boundary for every tool call, correction, or self-review;
- close an unsupported boundary to avoid resolving it;
- delegate unresolved material judgment to Standard;
- use Reasoning for broad routine execution when delegation is available;
- use Task Act to bypass the split;
- keep a boundary across distinct bounded activities;
- continue an unclear or repeated correction loop;
- hide transfer meaning in private reasoning;
- treat profile capability as action authority.
