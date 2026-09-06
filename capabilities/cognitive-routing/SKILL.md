---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active and automatic or manual compute control, profile transitions, delegated execution, direct Reasoning action, or boundary continuity must be interpreted."
---

# Cognitive Routing

Use premium judgment to direct economical execution without lowering the accepted quality bar. Reasoning should solve the important planning and interpretation problems, then communicate enough of that solution for Standard to execute resourcefully. Bring evidence back before substantial further work depends on an assumption Reasoning needs to assess.

This is one active agent using two compute profiles in one shared visible context. Only one profile executes at a time:

- **Reasoning** frames the problem, identifies important uncertainty, finds the approach, plans the next execution unit, interprets evidence, and accepts or rejects the result.
- **Standard** investigates, implements, diagnoses local problems, verifies, and self-reviews within that direction. It contributes discoveries, better local mechanisms, and contrary evidence—not just transcription.

Plan for Standard to be an inexpensive model that may need explicit guidance to avoid mistakes Reasoning would recognize. Do not assume equal capability or rely on Standard to reconstruct an unstated approach. Do not assume incapacity either: preserve its freedom to solve local problems and improve execution within the contract.

A **governing decision** materially changes the accepted outcome, architecture, policy, failure behavior, scope, authority, or evidence requirements. Standard may think about and challenge it; Standard must return before adopting a change outside its execution freedom. The distinction is who may settle the decision, not who may think.

Cognitive Routing changes compute responsibility, not Workflow ownership. [Workflow](../../skills/workflow/SKILL.md) still owns authority, the current activity, checkpoints, and Supported Exit. A profile, contract, or review creates no permission and does not supply independent review.

Both profiles inherit the visible conversation, tool history, task memory, evidence, and current owner. Communicate conclusions and responsibility, not a replay of shared history. Hidden reasoning does not transfer through a switch; write the insights Standard needs to act on.

## Establish Current Control

Use the latest extension-generated `Control` and `Profile`. Missing or contradictory current state requires recovery, not inference from model identity, an old transition, or a conversational suggestion.

- **Manual:** the user holds Standard or Reasoning. Run the ordinary unsplit Workflow in that profile, including conversation, tools, verification, and self-review. Do not request switching or simulate automatic delegation. The hold persists until the user changes or releases it.
- **Automatic:** each new user interaction begins in Reasoning. Reasoning owns substantive user-facing interpretation, discussion, questions, decisions, progress, and reporting. Conversation and judgment over already-visible evidence need no route marker.

The remaining execution rules apply under Automatic control.

Standard executes only an active Yield or Delegate contract. Its visible communication is the transfer record, not progress narration, questions to the user, or a final answer. It must actually switch back at handback; writing both sides of a conversation does not transfer responsibility.

Once this skill is loaded, Reasoning uses no environment tools outside a qualifying `ACT_BOUNDED` scope. Source and skill reads, searches, experiments, edits, tests, builds, diagnostics, and substantive artifact production are execution. Route them even when one call would suffice. Profile switching is a control operation, not environment execution.

## Distinguish The Work From Its Routing

An **execution unit** is the coherent work assigned in one delegation. It can include several interactions and local choices. It ends in one assessable result before the next governing decision. It is not a tool-call quota, task record, or durable identity.

A **contract** communicates the unit's purpose, governing direction, concrete approach, execution freedom, required evidence, and return conditions. It is **decision-complete** when Standard can pursue it without settling a governing decision left unresolved. That does not mean every local choice is prescribed or the whole task is understood. A discovery contract can be complete while the implementation approach remains undecided.

A **delegation boundary** is the explicitly opened scope in which Reasoning retains governing judgment across delegated units and returned evidence. It is not an evidence boundary or another Workflow owner.

At most one delegation boundary is open:

```text
Boundary state: NONE | OPEN
Boundary operation: NEW | REOPEN | CLOSE
```

`DELEGATE` with `NEW` or `REOPEN` opens it. `RETURN` leaves it open. Only Reasoning performs `CLOSE`. Runtime State supplies control and profile, not this model-written boundary state. Recover it from visible transfer records; never infer `NONE` from the current profile or an absent recent marker.

A Slice remains one coherent outcome, not one delegation. It may contain several sequential boundaries; a boundary may contain several units within the same bounded activity. Do not silently carry one boundary across distinct activities. Opening, returning, or closing does not select or complete a Slice. [Track Work](../../skills/track-work/SKILL.md) owns durable task memory when needed; its record is not routing state or fresh authority.

## Choose The Execution Route

When no execution is needed, remain in Reasoning and discuss, assess, answer, or wait.

For covered execution, check the existing boundary first:

```text
Boundary OPEN
  -> continue through DELEGATE
  -> or use ACT_BOUNDED if independently qualified
  -> suspend changed or blocked direction for Workflow
  -> CLOSE only when the bounded result is supported and self-reviewed

Boundary NONE
  -> YIELD if Standard can own the whole ordinary bounded result
  -> ACT_BOUNDED only if its independent conditions hold
  -> otherwise DELEGATE
```

- **Yield** transfers one complete ordinary result without opening a delegation boundary. It must be small, exact, local, reversible, low-risk, directly verifiable, and require no further governing judgment to complete.
- **Delegate** keeps Reasoning responsible for governing judgment while Standard executes. Use it for discovery, evidence Reasoning needs to interpret, and implementation or verification under accepted direction.
- **ACT_BOUNDED** permits exceptional direct Reasoning execution where judgment and action cannot usefully be separated under the conditions below.

Use Delegate when uncertain. Task size, convenience, or preference for the stronger profile does not settle the route.

Never Yield inside an open boundary or close a boundary to obtain Yield. A qualifying `ACT_BOUNDED` scope may contribute to an open boundary but does not close it.

Reading an exact package version as the complete requested result may Yield. Reading a configuration file so Reasoning can choose an architecture is Delegate, even though the action is equally small.

A route never widens authority. If the requested outcome, covered effects, or a user-owned decision is unsettled, use Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md) before affected execution. An informative experiment still needs authority to exercise target behavior.

## Delegate Through Concrete, Assessable Units

### Reasoning: Resolve The Next Planning Problem

Start from the actual goal, accepted constraints, and current evidence. Before assigning work, ask:

> If I were executing this, what would I do next, why that approach, what would I establish first, and what mistake would I need to avoid?

Answer from evidence, not an imagined repository. Transfer the useful conclusions into the contract rather than leaving Standard to rediscover them.

- **Intent is unclear:** discuss the material choice with the user; do not delegate a guess.
- **Environmental facts are missing:** delegate a focused investigation of the uncertainty that could change the approach. Name the relationship or alternatives to investigate, useful starting sources when known, and the evidence needed to decide. Allow adjacent exploration when it changes the answer.
- **Alternatives depend on an observable difference:** choose the smallest covered observation or experiment that distinguishes them before committing to an implementation.
- **Direction is supported:** work out the concrete next approach, important ordering, invariants, and checks. Do not hand over only an objective when Reasoning can already supply a useful solution strategy.

Discovery, implementation, verification, and correction are purposes of Delegate, not additional routes. Use the current owner's method; this skill does not replace planning, diagnosis, verification, or review.

### Reasoning: Keep The Unit Small Enough To Steer

Prefer a small, coherent result whose evidence lets Reasoning decide what should happen next. Make the immediate unit concrete; leave later work directional until its premises hold.

Shorten the unit when an unfamiliar integration, uncertain observer, failure-prone mechanism, or prior misunderstanding could invalidate substantial dependent work. Return before expanding that work, not after building a complete implementation around an unchecked premise.

When substantial work depends on an unverified assumption or mechanism, establish that foundation before expanding dependent work. For a new proof or integration path, establish a narrow end-to-end case before expanding its matrix. Specify the real path to exercise and controls that can show the observer is wrong. A fixture must not manufacture the behavior it claims to prove. Apply [Verify Work](../../skills/verify-work/SKILL.md) for the evidence method rather than treating test count as coverage.

Keep straightforward, well-understood execution together when another return would not change the direction. Do not split it into individual reads or edits. More switches are not inherently cheaper: each invokes Reasoning again. Choose return points for avoided mistakes, useful judgment, and supported progress—not maximum supervision.

### Reasoning: Communicate A Usable Plan

Write naturally and directly. There is no required prose template or heading order. Include what Standard needs, even when that requires a detailed plan:

- the result or question this unit owns, and how it advances the task;
- what is established, what is a hypothesis, and why the proposed approach fits;
- relevant locations, interfaces, relationships, implementation steps, and ordering supported by current evidence;
- required behavior, invariants, exclusions, and any mechanism that is genuinely mandatory;
- the local choices Standard may make or improve;
- the observations and checks needed, misleading substitutes to avoid, and when to return.

Do not omit useful low-level direction merely to keep the contract high-level. Do not invent paths, APIs, or exact edits before inspecting their premises. Distinguish a suggested approach from a required constraint so Standard knows which it may improve.

Give extra precision where a mistake is likely or expensive, not everywhere equally. Explain the insight that removes search or ambiguity; do not reproduce a complete patch solely for Standard to transcribe. Shared context avoids history replay, not the need to state the current plan and stop condition clearly.

For example:

> I need to know whether cancellation reaches the real request path before we expand the compatibility matrix. Use the existing session fixture and one adapter. Register the actual handler; keep the normal serializer path and stub only the network boundary. Show a successful control that reaches the stub, then cancellation through that same path. Don't add an early-return gate in the fixture—that would prove our gate, not native cancellation. Choose the local instrumentation. Return the actual call counts and signal observations before adding more adapters.

This supplies a concrete investigation plan while leaving Standard useful local work. A contrary result is evidence, not a reason to alter the observer until it passes.

### Reasoning: Open Or Continue The Transfer

For the first transfer, write the literal markers, choosing one operation:

```text
DELEGATE
Boundary operation: NEW | REOPEN
Boundary state: OPEN
```

Use `NEW` for the first boundary for this bounded outcome. Use `REOPEN` only to continue the same previously closed outcome under fresh authority and invalidating evidence or changed intent. Identify the outcome when opening; later contracts identify the next unit without restating the whole task.

For another unit in the same open boundary:

```text
DELEGATE
Boundary state: OPEN
```

Follow the markers with the contract, then switch to Standard. A transfer must be visible and actually executed; private reasoning or role-labelled prose does not transfer responsibility.

## Standard: Execute Within The Plan, Not Blindly

Use the current owner's method and the shared evidence. Follow the concrete direction and required ordering. Decide ordinary local mechanics rather than returning because a helper, filename, variable name, or necessary intermediate step was not specified.

Within the covered unit, Standard may:

- follow relevant references and adjacent evidence that materially affect the question;
- test hypotheses and explain evidence that challenges the proposed approach;
- use an existing abstraction or simpler mechanism that preserves required direction;
- make necessary local changes, focused checks, and supported corrections;
- recommend a better governing approach without adopting it prematurely.

A suggested mechanism may change within this freedom; an explicit requirement may not. Optional cleanup, unrelated improvements, extra side effects, and scope expansion remain outside the contract. Later review cannot retroactively authorize them.

Disproving a tentative discovery hypothesis does not invalidate the investigation. Continue while the agreed question remains useful and covered. Return before adopting a change to governing direction or required evidence.

### Use Action Selection Throughout Execution

[Action Selection](../../skills/action-selection/SKILL.md) is Standard's required environment-interaction method under both Delegate and Yield. Before task interactions, read its body if the exact method is absent from active context; recover it after context loss. Reuse still-visible guidance rather than rereading it for every unit or call.

Apply its fast path to an obvious, known, covered operation. Use its branch path when the target, hypothesis, observer, or scope is uncertain, output may be broad, or recent interactions have stopped changing the decision. The contract supplies direction; Action Selection helps choose the next useful interaction within it.

Do not announce the method, narrate candidate comparisons, or add a separate planning turn for mechanical work. Keep comparisons internal. Follow its stall route when progress stops rather than repeating equivalent searches, expanding breadth, or collecting evidence without a current question.

Action Selection returns evidence to the current owner inside the contract. It does not authorize another unit or replace a required profile handback.

### Verify The Assigned Result

Use Verify Work to establish what the actual observer proves. Check that the required path and assertions ran—not just that the command passed. Distinguish a local helper or test-added safeguard from the native path the contract requested. Preserve failed, unavailable, and unexercised cases explicitly.

An expected failing regression or understood mechanical error does not alone require return. Correct it within the unit when the cause and remedy are local and supported. Do not guess through unexplained failure, weaken assertions, replace the requested observer, or expand repairs to make a result look complete.

Once evidence supports the unit's result, silently self-review through the current owner's method for correctness, alignment, suitability, and unnecessary complexity. Correct a clear covered defect and recheck only the affected state. Local self-review does not settle a changed governing decision or close the delegation boundary.

### Return At The Actual Stop Condition

Return when:

- the assigned result or evidence is available, with applicable verification and local self-review complete;
- the contract's stop point is reached, including an early evidence result before further implementation;
- a material contradiction or decision exceeds the unit's direction, authority, scope, failure behavior, or evidence requirements;
- required execution or verification cannot continue within the contract, or failure remains unexplained or repeats without useful new evidence;
- no covered action can advance the unit;
- any fresh user message arrives.

Finish only the current atomic environment interaction. Preserve partial effects and unverified work; do not start another action to improve the appearance of the return. A fresh user message must reach Reasoning before interpretation or response.

Under Delegate, write:

```text
RETURN
Boundary state: OPEN
```

Under Yield, write `YIELD HANDOFF` instead, as described below; Yield does not open a delegation boundary.

Explain naturally what was actually found or produced, the exact supporting evidence and its limits, meaningful adaptations, contradictions, unresolved questions, partial effects, and why the unit is returning. Separate facts from hypotheses and recommendations. Do not repeat an earlier result as though newly requested work was performed.

Then call `freeflow_switch_profile` with `target="reasoning"` and stop execution. Do not append a new `DELEGATE`, impersonate Reasoning's assessment, switch to Standard again, or begin the next unit yourself. A recommendation for the next unit belongs in the return as a recommendation, not an instruction granting yourself work.

`RETURN` leaves the boundary open. It is not `NEW`, `REOPEN`, `CLOSE`, independent review, or acceptance of the wider result.

## Reasoning: Assess The Result And Your Plan

Compare the return with the actual observations and artifacts in shared context. Do not accept the report merely because it says the contract is complete or the checks passed.

Ask:

- Does the result satisfy the actual goal and constraints, not just my suggested steps?
- Did the observer establish the required boundary, or did the fixture supply the behavior being claimed?
- Are material claims contradicted, unexercised, or missing evidence?
- Did Standard expose a mistaken premise, a better mechanism, or an omitted risk?
- Is the problem in execution, evidence, my plan, or the size of the assigned unit?

Do not accept a result you would reject if you had produced it yourself. Keep the required behavior, correctness, maintainability, and evidence standard independent of Standard's price. Do not require identical code or personal style. A simpler valid implementation may be better than Reasoning's original suggestion.

Reuse adequate verification and Standard's supported local self-review. Supply the governing assessment and self-review of your own direction; do not automatically repeat an identical full review. Once the accepted requirements and evidence are satisfied, stop. Imagined improvements and preference alone do not justify another correction.

If current context is sufficient, judge it directly. If another source, diff, test, or runtime observation is needed, delegate that evidence unit inside the same boundary. Do not create a nested review boundary or use direct tools to review personally.

Profile changes do not provide independence. Use [Review Work](../../skills/review-work/SKILL.md) or [Review Artifact](../../skills/review-artifact/SKILL.md) when the current owner needs their judgment method. A selected independent review remains a separate Workflow responsibility.

### Adapt From The Actual Gap

- **Supported, incomplete work:** plan the next small coherent unit from what now holds.
- **Missing evidence:** delegate the observation that can resolve the claim, not speculative implementation.
- **One supported local defect:** explain the defect and correction basis; delegate the correction and affected verification.
- **A mistaken premise or better approach:** revise your direction before assigning more work. Route user-owned changes through Workflow.
- **Unclear or repeated failure:** use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) or Workflow before another correction. Reconsider the observer, decomposition, and execution demands rather than appending another checklist to the same failed approach.
- **Changed authority, a source conflict, or a user-owned choice:** suspend dependent execution and route through Workflow or Decision Gate.
- **Supported and complete:** self-review the bounded result and close.

Carry discoveries into later contracts. When evidence shows a misunderstood requirement, state it more concretely and shorten the next unit around that risk. When local execution is sound, do not add supervision without a reason. Repeated failure despite precise guidance is not a reason to lower acceptance or iterate indefinitely; return the limitation through Workflow and reconsider the approach or user-controlled compute configuration.

This is adaptation through shared context, not parameter learning, proof of model equivalence, or automatic promotion of a permanent rule.

### Close Only The Supported Boundary

When the bounded result is supported and self-reviewed, with applicable checkpoints and material contradictions resolved, write:

```text
CLOSE
Boundary state: NONE
Current owner: unchanged
```

State the supported result, important limits, and next route proportionately. Closing leaves Reasoning active to report or discuss. It does not complete the wider Slice or authorize follow-up work.

Do not close an unsupported, blocked, inconclusive, or contradictory result to clear routing state. If the task or activity changes, reconcile the unresolved boundary through Workflow rather than silently carrying it into distinct work. Preserve what remains open and why; pause, cancellation, and profile change are not completion.

## Yield One Complete Ordinary Result

Use Yield only with `Boundary state: NONE` and when Standard can complete and verify the whole ordinary result without further governing judgment. It avoids a delegation boundary, not the profile transition.

Write literal `YIELD`, followed by a brief identifying the result, constraints, evidence, and handback condition. One line is enough for an exact result. Then switch to Standard.

Standard executes, verifies, and self-reviews through the current owner's method, using Action Selection as specified above. The same scope, authority, failure, and fresh-user-message safeguards apply. If broad exploration or a new governing decision becomes necessary, stop and hand back; do not turn Yield into an unannounced delegation.

Write literal `YIELD HANDOFF`, followed by the actual result, evidence and limits, blocker or partial effects, and handback condition reached. Switch to Reasoning; do not assign yourself follow-up work.

Reasoning accepts and reports a sufficiently supported result without repeating Standard's review. If evidence is contradictory or insufficient, assess the gap and choose the appropriate route. Yield never opens or closes a delegation boundary. `YIELD HANDOFF` is not the separate task-memory Handoff method.

## Act Bounded Only When Delegation Loses Essential Judgment

`ACT_BOUNDED` is the sole direct execution route for Automatic Reasoning. Both conditions must hold:

1. judgment and the environment action or artifact production are materially inseparable;
2. shared-context delegation would cause a concrete material loss warranting the premium execution cost.

Name what delegation would lose. Convenience, fewer switches, one small read, or a general belief that Reasoning would do better is insufficient. Ordinary inspection, research, implementation, tests, builds, verification, and cleanup remain Standard work. A demanding quality bar does not itself qualify direct execution.

Difficult synthesis may qualify when the synthesis is itself the artifact: a decision-complete contract would require Reasoning to produce essentially the artifact and Standard merely to transcribe it. Sensitive result-by-result intervention may qualify when evolving judgment cannot usefully be separated from bounded action. The task label alone establishes neither condition; separable source gathering and routine validation remain delegated.

Before acting, write literal `ACT_BOUNDED` and state the scope and expected result, why judgment and action are inseparable, the concrete loss from delegation, existing authority, and stop condition. Fixed prose headings are not required.

Perform only that bounded work while its justification remains valid. The scope ends at its stop condition, interruption, context loss, changed authority or material scope, or loss of eligibility. Make the result and limit visible. End the scope before delegating Standard work.

An `ACT_BOUNDED` scope creates no delegation boundary. It may contribute inside an open boundary but never contains Delegate, operates while Standard executes a contract, or closes a boundary. If uncertain about eligibility, Delegate.

## Switch Profiles Explicitly

Every automatic transition uses only:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="one-sentence audit label"
)
```

Write the applicable transfer record first. The switch must be the only tool call in that assistant response. Markers and required state fields are literal protocol; accompanying communication is adaptive. Do not substitute roleplay, private reasoning, or another mechanism for the transition.

Stay in Standard until a return condition, then switch to Reasoning before further interpretation or execution. Stay in Reasoning for assessment and user interaction. Do not switch per tool call; a close does not switch to Standard.

## Preserve Continuity And Failure Boundaries

A Runtime State refresh is host context, not a fresh user request. It does not end a valid contract or `ACT_BOUNDED` scope, or resolve a delegation boundary, unless its actual state contradicts the route.

A fresh user message requires Reasoning. During Standard execution, finish only the atomic interaction, preserve partial work, write `RETURN` or `YIELD HANDOFF`, and switch. If the host has already returned to Reasoning, recover the unfinished unit before assessing the message; do not infer completion.

### Manual Changes

A user control change takes effect at a safe boundary, never during an atomic interaction. Preserve the current result, contract, and unverified effects. Suspend an open automatic boundary rather than closing or abandoning it by implication. The held profile then runs ordinary Workflow.

When Manual control is released, begin in Reasoning and reconcile the suspended boundary before automatic execution. A failed release leaves the hold in force. If the held profile cannot continue reliably, state the blocker and required user control without requesting an automatic switch.

### Failed Transitions

A failed switch authorizes no workaround:

- Failed Yield entry: Standard has not begun the result.
- Failed Delegate entry: the boundary remains open; Standard has not begun the unit.
- Failed `YIELD HANDOFF` or `RETURN`: Standard stops at handback. It cannot take over user interaction, settle governing judgment, close the boundary, or execute another unit.

Preserve the supported route and use host-reported state rather than inventing success. Reasoning cannot execute directly to bypass failure. Any later `ACT_BOUNDED` scope must independently qualify; recovery uncertainty is not eligibility.

### Context Loss Or Uncertain Recovery

After compaction, resume, session navigation, interruption, or uncertain continuity, recover before task execution:

- latest Control and Profile;
- current owner, bounded activity, and live authority;
- active route and explicit delegation-boundary state;
- latest contract, return, or handoff;
- evidence, partial effects, unverified work, and stop conditions.

Visible records are memory, not fresh authority. A stale contract never overrides the current user or contradictory live evidence. A Working Record preserves task state, not profile or boundary state.

Required environmental recovery reads still use Standard through supported Yield or Delegate. If route identity or boundary state cannot be recovered well enough to select that route, stop and return the uncertainty to Workflow. Do not invent `NONE`, open a replacement boundary, or use direct Reasoning access. No fresh `ACT_BOUNDED` scope begins before recovery is complete.

Recover required methods when their exact bodies are absent. A recovery-only unit ends by returning the recovered state; it does not authorize Standard to start the next task unit, even when that work is already described in memory.

An open boundary can survive turns, reloads, and returns while the same bounded outcome remains coherent. Do not create another boundary for every correction, self-review, or evidence request.

## Stop At The Supported Route Boundary

Yield ends with handoff to Reasoning. Delegate ends when Reasoning closes the supported boundary. `ACT_BOUNDED` ends with its declared scope. Without further execution authority, answer, wait, pause, or stop through Workflow rather than manufacturing another route.

When Cognitive Routing is inactive or control is Manual, retained automatic instructions must stop directing work. Use current host state and ordinary Workflow; do not preserve shadow profile leadership or treat this skill as independent authority.
