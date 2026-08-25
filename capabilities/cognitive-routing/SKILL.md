---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active to place conversation and automatic execution across Standard and Reasoning, including manual holds, transitions, and recovery."
---

# Cognitive Routing

Place two compute profiles inside Freeflow's existing [Workflow](../../skills/workflow/SKILL.md). They belong to one active agent with one shared context, authority surface, owner, and evidence boundary.

Cognitive Routing changes compute only. It never changes authority, mode, ownership, permitted effects, evidence requirements, review independence, or Supported Exit. Workflow retains authority and the active method; the current owner retains the bounded activity. A profile transition never authorizes action, creates task memory, resolves a user decision, or proves a result.

Under automatic control, `Conversation` selects the profile for substantive user-facing Think. Reasoning alone opens, reopens, leads, and closes execution boundaries. Standard executes bounded contracts inside an `OPEN` boundary. Under manual control, the held profile runs the ordinary unsplit Workflow.

## Read Runtime State

Read the latest extension-generated `Control`, `Profile`, and `Conversation`. They are authoritative for this provider request. Do not reconstruct them from configuration, prior state, transition output, or natural-language suggestions.

- `Control` is `automatic` or `manual`.
- `Profile` is the profile active now: `standard` or `reasoning`.
- `Conversation` is the effective route for substantive user-facing Think.

Substantive user-facing Think includes interpreting a fresh user message, discussing direction, answering the user, asking for a user decision, and reporting a Supported Exit. It excludes execution contracts, delegated progress, tool observations, and Task Act.

**Task Act** includes environment tools, active evidence generation, mutations, tests, diagnostics, builds, interactive probes, and substantive artifact production. Think, execution contracts, and profile switching are not Task Act.

### Execution Route

| Control · Profile | Route |
| --- | --- |
| Automatic · Standard | Execute the current DELEGATE or REMEDIATE contract inside an `OPEN` boundary, then RETURN at its stop condition. Outside one, take no Task Act; route to Reasoning when execution must begin or resume. |
| Automatic · Reasoning | Perform every NEW, REOPEN, and CLOSE; make governing judgments; issue DELEGATE or REMEDIATE; assess RETURN; gate direct Reasoning Act. |
| Manual · Standard | Run the ordinary unsplit Workflow in Standard. Automatic execution contracts and model-requested switching are disabled. |
| Manual · Reasoning | Run the ordinary unsplit Workflow in Reasoning. Automatic execution contracts and model-requested switching are disabled. |

### Conversation Route

| Conversation | Route |
| --- | --- |
| `standard` | Standard handles substantive user-facing Think. |
| `reasoning` | Reasoning handles substantive user-facing Think. |
| `adaptive` | At conversation entry or after execution CLOSE, keep the current profile unless the other profile materially better fits the immediate user-facing Think. |

Decide `adaptive` once at either routing point. Do not reconsider it between those points or switch only to restate a supported result.

Execution follows `Control · Profile`. User-facing Think follows `Conversation`. An `OPEN` execution boundary permits Standard Task Act regardless of `Conversation`.

The runtime resolves a manual hold before injection. Under manual control, `Conversation` must equal the held `Profile` and cannot be `adaptive`. If Runtime State contradicts that rule, do not switch; report the inconsistency through Workflow.

If any required field is absent, do not infer it. Report incompatible Runtime State and stop profile routing.

## Route Outside Execution

When no execution boundary is `OPEN`, apply `Conversation` before substantive user-facing Think. If the selected profile is already active, continue without a routing contract. Otherwise write:

```text
Profile route: <Profile> -> <target>.
```

Then switch. Profile route is a one-line compute transfer outside execution; the switch tool's required reason records why.

When execution becomes necessary, Reasoning must perform NEW or REOPEN. If Standard is active, write Profile route and switch to Reasoning first. Standard never opens, reopens, or closes a boundary.

After CLOSE:

- if another accepted outcome is already execution-bearing and no user-facing Think is needed first, Reasoning may perform NEW without an intermediate Profile route;
- otherwise apply `Conversation`, write Profile route only when the selected profile differs from `Profile`, and respond or wait in that profile.

If Standard receives a fresh user message during execution, preserve completed evidence and RETURN before answering it. Reasoning determines what the message changes, then closes, continues, or applies `Conversation` as supported.

While a boundary is `OPEN`, profile transfers occur only through DELEGATE, RETURN, or REMEDIATE. Outside an `OPEN` boundary, automatic transfers use Profile route. Profile route never changes authority, owner, boundary state, or evidence.

## Run Automatic Execution

An **execution boundary** is the Reasoning-led compute protocol for one execution-bearing bounded outcome. It is not another activity, owner, authority source, Slice, Plan, review, or Working Record.

For one boundary identity:

```text
no boundary -> NEW -> OPEN -> CLOSE -> CLOSED -> REOPEN -> OPEN
```

- **NEW** creates and opens a boundary for a distinct outcome.
- **REOPEN** reopens the same `CLOSED` outcome after valid authority and invalidating evidence or changed intent.
- **CLOSE** closes the `OPEN` boundary after the result is supported.

Reasoning performs every boundary operation. DELEGATE, RETURN, and REMEDIATE are valid only while the boundary is `OPEN` and never change its state.

Before NEW, REOPEN, or DELEGATE, Reasoning orients to the current owner's method, current Runtime State, and live evidence.

The active agent has at most one `OPEN` boundary. One boundary may contain several delegations for the same outcome. A Slice may contain several sequential boundaries. Opening or closing a boundary never selects, extends, settles, or closes the Slice. [Track Work](../../skills/track-work/SKILL.md) may preserve the wider Slice; task memory never becomes routing state.

```text
authorized execution-bearing outcome
-> route to Reasoning when needed
-> Reasoning performs NEW or REOPEN
-> Reasoning makes the governing judgment
-> DELEGATE to Standard
-> Standard executes and gathers evidence
-> RETURN to Reasoning
-> Reasoning assesses and self-reviews
   -> same outcome needs more work: DELEGATE again
   -> clear local defect: REMEDIATE
   -> supported and complete: CLOSE
   -> distinct accepted outcome is execution-bearing: CLOSE, then NEW
   -> failed, inconclusive, repeated, route-changing, or unauthorized: reassess, diagnose, or return to Workflow
-> when user-facing Think is next: apply Conversation
```

The boundary stays `OPEN` through delegation, return, self-review, and one authorized clear correction. Do not create a nested review boundary.

## Execution Contracts

There are five execution contracts: OPEN, DELEGATE, RETURN, REMEDIATE, and CLOSE. OPEN establishes inherited boundary state; DELEGATE and REMEDIATE carry complete execution instructions; RETURN carries the material execution and evidence record; CLOSE carries the supported conclusion.

Shared context carries existing facts and evidence. The current OPEN or CLOSE contract is the canonical boundary record; the latest DELEGATE, RETURN, or REMEDIATE is the canonical transfer record. Each adds only what another profile cannot safely infer. Contracts point to external authority and never create or widen it.

Make each contract sufficient for its receiver. Do not sacrifice decision completeness, truthful effects, verification, or recovery to brevity. Do not repeat inherited authority, owner, outcome, or history unless it changed.

Field labels are literal. Fill each field with only the information it names. Use `None` for an empty required field, concise sentences by default, bullets only for several material facts, and exact evidence pointers instead of raw logs. Write contracts only when boundary state or profile responsibility changes. Inside execution, act without narrating routine planning or the next mechanical tool call; report only a material state change, contradiction, external effect, blocker, or return condition.

### OPEN

Reasoning writes this contract. It is the continuity anchor for the whole boundary.

```text
Execution Boundary — OPEN
Operation: NEW | REOPEN
Bounded outcome:
Authority source:
Current owner:
Starting evidence and constraints:
Governing decision or question:
Close when:
Stop if:
```

For REOPEN, `Starting evidence and constraints` includes what invalidated the `CLOSED` result and what remains valid. `Authority source` is always external to the contract. `Current owner` remains the Freeflow method, never Reasoning merely because Reasoning leads compute.

Reasoning may Think to settle the governing decision or question. Before DELEGATE, make the execution contract decision-complete: Standard must have no material judgment left. Leave reversible local mechanics to Standard.

### DELEGATE

Reasoning writes DELEGATE, then switches to Standard. It transfers one complete execution unit inside the inherited `OPEN` boundary.

```text
DELEGATE
Required execution result:
Settled decisions and invariants:
Scope and required order:
Standard may choose:
Evidence Standard must return:
Return when:
```

Detailed guidance is required when execution is complex. Specify exact behavior, constraints, and necessary ordering; prescribe ordinary tool choreography only when it affects correctness, safety, or evidence.

Standard executes through the current owner's method and the Environment Interaction Loop. Take the obvious mechanical and directly verifiable fast path. When the action, observer, or expected output is uncertain, broad, or likely to repeat, read [Action Selection](../../skills/action-selection/SKILL.md). Action Selection returns its observation and state change to the current owner inside the delegation, not directly to Reasoning.

Standard continues only while authority, contract, evidence, and stop conditions remain coherent. It may choose only the reversible local details granted by the contract. RETURN rather than choose when the next step would materially alter outcome, architecture, policy, failure behavior, scope, or evidence.

### RETURN

Standard writes RETURN, then switches to Reasoning. It reports what actually happened without deciding whether the result is accepted.

```text
RETURN
Execution status and result:
Work performed:
Resulting state and effects:
Evidence:
Unresolved contradictions and limits:
Why returning:
```

RETURN must be detailed enough for Reasoning to assess the result without replaying tool activity. Summarize material actions and evidence; do not paste logs or narrate every command.

Reasoning determines what RETURN proves. Use [Verify Work](../../skills/verify-work/SKILL.md) when the claim needs a fuller verification method. Failed or inconclusive work is not review-ready: delegate the smallest clear check, observe narrowly, diagnose an unclear cause, or return a route-changing issue to Workflow.

Once evidence supports the result, perform the same-agent self-review through the current owner's method. Cognitive Routing selects compute, not the review role. Self-review creates no formal finding, judgment, number, Pass label, independent-review claim, or review cycle.

### REMEDIATE

Reasoning writes REMEDIATE, then switches to Standard. Use it only for one clear local defect whose cause and correction are supported inside existing authority and intent.

```text
REMEDIATE
Defect and consequence:
Supported cause:
Required behavior after correction:
Selected correction:
Affected scope and order:
Must preserve:
Regression test or probe:
Fresh verification after correction:
Return when:
```

If the cause is unclear, use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) instead.

REMEDIATE must tell Standard exactly what is wrong, what corrected behavior is required, and how the supported remedy works. It need not prescribe keystrokes or ordinary commands. Keep one correction inside the boundary.

Missing mechanical evidence uses DELEGATE, not REMEDIATE. Changed intent, scope, authority, source truth, or a user-owned choice returns to Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md).

### CLOSE

Reasoning writes CLOSE only when the bounded result is supported, verified at the required boundary, and self-reviewed with no unresolved material issue.

```text
Execution Boundary — CLOSED
Operation: CLOSE
Supported result:
Evidence:
Limits:
Reopen only if:
```

`Reopen only if` names exact invalidating evidence or changed intent, never a next action.

CLOSE ends Reasoning's execution leadership for that outcome. It never changes the current owner.

After CLOSE, follow Route Outside Execution.

When Reasoning is also the selected Conversation profile, CLOSE may be the user-facing report. Do not repeat it in separate prose. When another profile reports, use CLOSE as its source and do not restate it verbatim.

Reporting, cleanup, or a distinct outcome does not REOPEN a `CLOSED` boundary.

## Gate Direct Reasoning Act

`Conversation` selects user-facing Think only. It never authorizes Task Act or broadens the gates below. Think and execution contracts need no direct-Act gate.

Normal execution belongs to Standard. OBSERVE and ACT_BOUNDED are available at any Reasoning turn inside an `OPEN` boundary, including before the first DELEGATE and after RETURN. They are unavailable while Standard holds a delegation and after CLOSE. Pure assessment and self-review are Think and need no gate.

Use **OBSERVE** for one narrow, discriminating evidence scope:

```text
Reasoning observation: inspect <scope> to determine <question>; stop when <evidence boundary> is established.
```

One scope may include a few tightly related reads or one focused diagnostic. Broad exploration, logs, matrices, builds, and repetitive inspection belong to Standard.

Use **ACT_BOUNDED** only when judgment and action are materially inseparable and delegation loss materially exceeds premium execution cost:

```text
ACT_BOUNDED
Direct Act:
Why Reasoning must act:
Scope and exclusions:
Expected result:
Stop and reassess when:
```

Suitable cases include difficult synthesis that is itself the artifact, consequential result-by-result diagnosis, or sensitive work Standard would otherwise have to reinterpret. ACT_BOUNDED inherits the OPEN boundary's outcome, authority, owner, evidence, constraints, and stop conditions.

OBSERVE and ACT_BOUNDED expire at their stop condition and return Reasoning to Think. They never change boundary state or profile responsibility and never cover broad verification, adjacent cleanup, the whole boundary, or another action by implication. Make the supported conclusion visible before DELEGATE, REMEDIATE, CLOSE, or another direct Reasoning Act.

## Respect Manual Control

The user owns manual versus automatic control. Under manual control, use the held `Profile` for authorized work. Do not call the profile-switch tool or simulate automatic execution contracts in prose. The ordinary Workflow, Environment Interaction Loop, verification, and self-review remain in that profile.

A manual hold survives turns, compaction, same-session resume, and reload until the user changes it, releases it to automatic control, or disables Cognitive Routing. Recommend another profile or automatic control once only when it materially improves reliability or efficiency. If the held profile cannot continue reliably, state the blocker and exact user control needed.

## Switch And Recover

Every automatic profile transfer uses:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="<one-sentence audit label>"
)
```

The switch must be the only tool call in that assistant response. Write Profile route, DELEGATE, RETURN, or REMEDIATE first. NEW, REOPEN, and CLOSE are always written in Reasoning and do not themselves require a profile transfer.

If a switch fails, read current Runtime State, preserve supported state, and return the blocker through Workflow:

- failed Profile route leaves boundary state unchanged and blocks the selected responsibility; before NEW no boundary opens, and before REOPEN or after CLOSE the boundary remains `CLOSED`;
- failed DELEGATE or REMEDIATE leaves the boundary `OPEN` in Reasoning and does not authorize broad direct execution;
- failed RETURN leaves the boundary `OPEN` in Standard and unable to resolve or close.

An `OPEN` boundary may survive turns, compaction, resume, reload, delegated execution, and evidence-driven re-entry while its outcome remains coherent. After interruption, recover Runtime State, owner, outcome, authority, the OPEN contract, the latest internal contract, and live evidence. OBSERVE and ACT_BOUNDED expire on interruption.

Visible contracts—not hidden reasoning—carry continuity. A stale delegation never overrides contradictory evidence. Bursty switching is valid when responsibility changes. Tool-by-tool switching, evidence-free returns, narration-only contracts, and switches whose target immediately returns the same responsibility are failures.

## Stop

Stop the automatic protocol when Cognitive Routing is inactive or unavailable, or control is manual. When no execution-bearing outcome is authorized, use only the ordinary Workflow plus `Conversation`. Stop routing work when Workflow reaches a Supported Exit.

Do not:

- let Automatic · Standard take Task Act outside DELEGATE or REMEDIATE in an `OPEN` boundary;
- let Standard perform NEW, REOPEN, or CLOSE;
- use Profile route while a boundary is `OPEN`;
- let a profile other than the fixed `Conversation` profile handle substantive user-facing Think outside execution;
- reconsider `adaptive` continuously;
- let Conversation or Profile route create authority, ownership, boundary state, or task-Act permission;
- turn Reasoning into the current owner, task-memory owner, or independent reviewer;
- require a Plan or Working Record merely because execution exists;
- delegate unresolved material judgment to Standard;
- use Reasoning for broad routine execution when delegation is available;
- create one boundary per tool call, correction, or self-review;
- keep one boundary across distinct bounded outcomes;
- continue an unclear or repeated correction loop.
