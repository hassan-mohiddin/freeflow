---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active to split automatic execution between Reasoning leadership and Standard execution, or when manual control, execution-boundary continuity, or a failed profile switch must be interpreted."
---

# Cognitive Routing

Adapt Freeflow's existing [Workflow](../../skills/workflow/SKILL.md) to two compute profiles used by one active agent in one shared visible context. Under automatic control, Reasoning leads each authorized execution-bearing bounded activity and Standard executes bounded contracts. Under manual control, the held profile runs the ordinary unsplit Workflow.

Cognitive Routing changes compute only. It never changes the current owner, authority, mode, permitted effects, evidence requirements, review independence, bounded activity, or Supported Exit.

## Preserve The Ordinary Workflow

A **Reasoning execution boundary** is the automatic compute protocol for one execution-bearing bounded activity. It is not another activity, owner, authority source, Plan, or Working Record.

A Slice may contain zero, one, or many sequential execution boundaries. When durable task memory is needed, [Track Work](../../skills/track-work/SKILL.md) records it as the Current Slice. Opening or closing an execution boundary never selects, extends, settles, or closes that Slice.

A **decision-complete contract** states the governing result, invariants, scope, evidence, and return conditions clearly enough that Standard has no material judgment left. It leaves reversible local mechanics to Standard rather than prescribing every command.

**Task Act** includes environment tools, new evidence generation, state changes, tests, diagnostics, builds, interactive probes, and substantive artifact production. Profile switching and compact transition contracts are control operations, not task Act.

The user owns manual versus automatic control. Workflow owns authority, the active method, checkpoints, and Supported Exit. The active owner owns the bounded activity. Profile transitions remain inside its Feedback Loop and return evidence to that owner; they never authorize action, create task memory, resolve a user decision, or prove a result.

The same protocol applies whether the bounded activity exists only in visible context or belongs to a recorded Current Slice. Track Work may preserve the wider Slice when durable memory is needed; its record never becomes profile or boundary state.

## Read Current State

Read the latest extension-generated `Control` and `Profile`. They are authoritative. Earlier model identity, profile state, transition results, and natural-language suggestions are history or advice.

| Runtime state | Route |
| --- | --- |
| Automatic · Standard | Think without ceremony; open a boundary before un-delegated task Act, or execute an `OPEN` delegation and RETURN at its stop condition. |
| Automatic · Reasoning | Think and lead an open execution boundary; gate direct task Act. |
| Manual · Standard | Run the ordinary unsplit Workflow in Standard; model-requested switching is blocked. |
| Manual · Reasoning | Run the ordinary unsplit Workflow in Reasoning; the automatic delegation protocol does not apply. |

Automatic · Reasoning may be active without an open boundary during discussion, judgment, routing, or after a user-selected cycle. Do not infer who selected it or invent execution authority. Open a boundary in place when an authorized bounded activity becomes execution-bearing. When no boundary is open and Reasoning no longer materially benefits the immediate Think, YIELD to Standard.

## Run Automatic Reasoning-Led Execution

Under automatic control, every authorized execution-bearing bounded activity is Reasoning-led and Standard-executed. The active agent has at most one `OPEN` execution boundary at a time. One boundary may contain multiple delegation and return iterations; one Slice may contain multiple sequential execution boundaries.

```text
Workflow or the active owner establishes an authorized execution-bearing bounded activity
-> open one Reasoning execution boundary
-> Reasoning makes the governing judgment and contract explicit
-> DELEGATE bounded execution to Standard
-> Standard executes the current owner's method and gathers required evidence
-> RETURN evidence to Reasoning
-> Reasoning resumes the current owner and assesses what the return supports
   -> supported: self-review
      -> complete: CLOSE + HANDOFF
      -> more accepted work: DELEGATE again
      -> clear local defect: issue remediation contract and DELEGATE
   -> failed, inconclusive, repeated, route-changing, or unauthorized: reassess, diagnose, or return to Workflow
```

The boundary remains `OPEN` through delegation, return, self-review, and an authorized clear correction. Do not create a nested review boundary.

### Open Or Reopen

Use **NEW** when a bounded activity first becomes execution-bearing. Use **REOPEN** only when valid authority and invalidating evidence or changed intent return that same closed bounded outcome to execution.

Write:

```text
Reasoning Execution Boundary
Boundary operation: NEW | REOPEN
Boundary state: OPEN
Bounded outcome:
Authority or source pointer:
Current owner:
Known constraints and evidence:
Judgment or contract needed:
```

In Automatic · Standard, write the contract and switch to Reasoning before task Act. In Automatic · Reasoning, open it in place. If authority, intended outcome, or bounded activity identity is unsettled, return to Workflow instead.

Reasoning then orients to the active owner's method and live evidence, resolves any governing judgment, and makes a decision-complete delegation. It specifies outcomes and invariants rather than ordinary tool choreography; include ordered steps only when order affects correctness, safety, evidence, or efficient return.

### Delegate, Execute, And Return

Reasoning delegates one bounded execution unit that needs no material reinterpretation. It may span multiple environment interactions but remains one bounded activity; do not switch tool by tool.

```text
Delegation
Boundary state: OPEN
Bounded outcome:
Supported judgment and invariants:
Execution outcome:
Scope and necessary ordering:
Reversible local choices Standard may make:
Evidence required:
Stop and return when:
```

For remediation, include the supported problem and invariant, affected behavior or locations, ordered changes where necessary, regression evidence, verification boundary, and return conditions. Keep it proportionate and inside the same bounded activity unless Workflow decides otherwise.

Standard executes through the current owner's method and uses the Environment Interaction Loop from the guaranteed Interaction Contract. Take the obvious mechanical and directly verifiable fast path. When the action, observer, or expected output is uncertain, broad, or likely to repeat, read [Action Selection](../../skills/action-selection/SKILL.md).

Action Selection returns the observation and state change to the current owner inside the delegation; it does not return directly to Reasoning. Standard may choose repository-consistent mechanics and reversible local details, then continue only while authority, contract, evidence, and stop conditions remain coherent. It uses RETURN rather than choosing when the next step would materially alter outcome, architecture, policy, failure behavior, scope, or evidence.

Return when evidence is available, scope ends, execution or verification fails, evidence conflicts, a material judgment appears, or authority blocks continuation:

```text
Return to Reasoning
Boundary state: OPEN
Execution outcome:
Evidence and verification pointer:
Contradictions, limits, or residual effects:
Return condition reached:
```

Then switch to Reasoning. **RETURN** resumes the same boundary; it is neither NEW nor REOPEN.

### Assess, Self-Review, Correct, Or Close

Reasoning resumes the current owner's method and determines what the return proves. When the claim or observing boundary needs a fuller verification method, use [Verify Work](../../skills/verify-work/SKILL.md) before self-review. Failed or inconclusive execution, verification, or evidence is not review-ready: delegate a clear next check, use a permitted narrow observation, diagnose an unclear or repeated cause, or return a route-changing issue to Workflow.

Once evidence initially supports the affected result, perform the stable same-agent self-review through the current owner's method. Cognitive Routing selects its compute profile, not the review role or method. Self-review creates no formal finding, judgment, number, Pass label, independent-review claim, or review cycle.

- **Supported and complete:** close and hand off.
- **Supported with more accepted work:** issue the next delegation.
- **Clear local defect inside existing authority and intent:** delegate one remediation and fresh verification, then self-review the affected state after RETURN.
- **Missing mechanical evidence:** delegate the smallest additional verification before self-review.
- **Material interpretation unresolved:** Think, observe narrowly, or return to the affected owner.
- **Unclear cause or repeated correction:** [Diagnose Failure](../../skills/diagnose-failure/SKILL.md).
- **Changed intent, scope, authority, source truth, or user-owned choice:** Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md).

Keep one clear local correction inside the boundary. If correction fails, repeats, or the corrected state exposes another related defect, return to Diagnose Failure or Workflow instead of creating an automatic review-fix-review loop.

When the affected bounded result is supported, verified at the required boundary, and self-reviewed with no unresolved material issue, write:

```text
Reasoning Execution Handoff
Boundary state: CLOSED
Current owner: UNCHANGED
Supported bounded result:
Important evidence, assumptions, and limits:
Standard continues:
REOPEN only if:
```

Then switch to Standard. Reasoning leadership ends. The unchanged current owner accepts, continues, or reports the supported result, updates task memory when needed, returns to Workflow, or begins another bounded activity.

A reopen condition protects the conclusion from invalidating evidence; it does not preserve shadow Reasoning ownership. Ordinary reporting, cleanup, or a distinct bounded activity does not reopen the boundary.

## Gate Direct Reasoning Act

Under Automatic · Reasoning, Think and compact control contracts need no gate. Direct task Act is exceptional because normal execution belongs to Standard. Without an `OPEN` boundary, open the authorized bounded activity in place or YIELD routine work.

Use **OBSERVE** when one narrow, discriminating evidence scope is cheaper and clearer than delegation:

```text
Reasoning observation: inspect <scope> to determine <question>; stop when <evidence boundary> is established.
```

One scope may include a few tightly related reads or one focused diagnostic. Broad exploration, logs, matrices, builds, and repetitive inspection belong to Standard.

Use **ACT_BOUNDED** only when judgment and action are materially inseparable and expected delegation loss materially exceeds premium execution cost:

```text
Reasoning Act
Why judgment and action are inseparable:
Scope:
Authority:
Stop and reassess when:
```

Suitable cases include difficult synthesis that is itself the artifact, consequential result-by-result diagnosis, or sensitive work whose judgment Standard would otherwise re-derive. Better performance alone does not qualify.

Every OBSERVE or ACT_BOUNDED scope expires at its stop condition and returns Reasoning to Think. It never covers the whole execution boundary, broad verification, adjacent cleanup, or another action by implication. Make its conclusion visible before delegation, closure, or another direct Act.

## Yield Or Respect Manual Control

Use **YIELD** only when Automatic · Reasoning has no `OPEN` boundary and higher cognition no longer materially benefits the immediate Think:

```text
Yield to Standard
Boundary state: NONE
Standard owns:
```

Then switch to Standard. YIELD neither delegates nor closes a boundary. If an authorized bounded activity is already execution-bearing, open its boundary instead of yielding task Act directly to Standard.

Under manual control, use the held profile for authorized work and do not call the profile-switch tool. The ordinary Workflow, Environment Interaction Loop, verification, and self-review collapse into that profile; do not simulate delegation in prose.

A manual hold survives turns, compaction, same-session resume, and reload until the user changes it, releases it to automatic control, or disables Cognitive Routing. Recommend another profile or automatic control once only when it materially improves reliability or efficiency. If the held profile cannot continue reliably, state the blocker and exact user control needed.

## Switch And Resume Safely

Every automatic transition uses:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="<one-sentence audit label>"
)
```

The switch must be the only tool call in that assistant response. Write the applicable boundary, delegation, return, handoff, or yield contract first. Shared context carries existing evidence; the contract carries only newly supported judgment, execution state, evidence pointer, and target responsibility.

If a switch fails, read current runtime state, preserve the supported boundary, and return the blocker through Workflow:

- failed NEW or REOPEN leaves Standard unable to start task Act;
- failed DELEGATE does not authorize broad Reasoning execution;
- failed RETURN leaves Standard unable to resolve or close the boundary;
- failed CLOSE or YIELD does not authorize post-boundary routine Reasoning execution.

An `OPEN` boundary may survive turns, compaction, resume, reload, delegated execution, and evidence-driven re-entry while the bounded outcome remains coherent. After interruption, recover current runtime state, owner, bounded activity, authority, latest boundary contract, and live evidence before resuming. OBSERVE and ACT_BOUNDED scopes expire on interruption.

Visible contracts—not hidden reasoning—carry continuity. A stale delegation never overrides contradictory evidence, and a Working Record never becomes routing state. Bursty switching is valid for meaningful judgment or execution units; tool-by-tool switching, evidence-free returns, nested review boundaries, and repeated task history are failures.

## Stop

Stop the automatic protocol when Cognitive Routing is inactive or unavailable, control is manual, no execution-bearing bounded activity is authorized, or Workflow reaches a Supported Exit.

Do not:

- let Automatic · Standard initiate task Act outside a Reasoning delegation;
- turn Reasoning into the current owner, task-memory owner, or independent reviewer;
- require a Plan or Working Record merely because execution exists;
- delegate unresolved material judgment to Standard;
- use Reasoning for broad routine execution when delegation is available;
- create one boundary per tool call, correction, or self-review;
- keep one boundary across distinct bounded activities;
- continue an unclear or repeated correction loop;
- hide transfer meaning in private reasoning;
- treat profile capability as action authority.
