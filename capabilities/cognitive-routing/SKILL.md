---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active and automatic or manual compute control, profile transitions, delegated execution, direct Reasoning action, or boundary continuity must be interpreted."
---

# Cognitive Routing

Use Reasoning's judgment to make Standard's execution better directed, not to prescribe every operation. Use Standard's reasoning to investigate and carry out that direction resourcefully, not to silently replace it. Bring evidence back when Reasoning must decide what it means for the task.

This is one active agent using two compute profiles in one shared visible context:

- **Reasoning** frames the problem, identifies important uncertainty, interprets evidence, chooses governing direction, and assesses results. Spend its judgment where it can remove mistaken assumptions, find a simpler approach, or reduce unnecessary execution.
- **Standard** investigates, implements, diagnoses local problems, verifies, and self-reviews within the selected direction. It contributes explanations, improvements, and contrary evidence rather than acting as a transcription tool.

A governing decision materially changes the accepted outcome, architecture, policy, failure behavior, scope, authority, or evidence requirements. Standard may reason about and challenge such a decision; it must return before adopting a change outside its execution freedom. The distinction is who may settle the decision, not who may think about it.

Cognitive Routing changes compute responsibility, not Workflow ownership. [Workflow](../../skills/workflow/SKILL.md) still owns authority, the current activity, checkpoints, and Supported Exit. Neither a profile nor a transfer creates permission, changes accepted behavior, proves a claim, or supplies independent review.

Both profiles inherit the visible conversation, tool history, task memory, evidence, and current owner. Communicate conclusions and responsibility, not a replay of shared history. Do not assume hidden reasoning transfers with a profile switch.

## Establish Current Control

Use the latest extension-generated `Control` and `Profile`. Missing or contradictory current state is a reason to stop and recover, not to infer control from model identity, an old transition, or a conversational suggestion.

- **Manual:** the user holds Standard or Reasoning. Run the ordinary unsplit Workflow in that profile, including conversation, tools, verification, and self-review. Do not request switching or simulate the automatic protocol. The hold persists until the user changes or releases it.
- **Automatic:** each new user interaction begins in Reasoning. Reasoning owns substantive user-facing interpretation, discussion, questions, decisions, progress, and reporting. Conversation and judgment over already-visible evidence need no route marker.

The remaining execution rules apply under Automatic control.

Standard executes only an active Yield or Delegate contract. It may interpret technical evidence and judge its local work, but does not take over the user conversation or the governing acceptance decision. Its visible communication is the transfer record, not progress narration, questions to the user, or a final answer.

Once this skill is loaded, Reasoning uses no environment tools outside a qualifying `ACT_BOUNDED` scope. Reads of sources or supporting skills, searches, experiments, edits, tests, builds, diagnostics, and substantive artifact production are execution. Route them even when one call would suffice. Profile switching is a control operation, not environment execution.

## Distinguish The Work From Its Routing

An **execution unit** is the coherent work assigned in one delegation. It may contain several environment interactions and local choices. Choose its extent by the useful result and the next governing decision, not by tool count. It is not another task record or durable identity.

A **contract** communicates what that unit must accomplish or establish, the governing direction, its execution freedom, the evidence needed, and when to return. It is **decision-complete** when Standard can pursue the assigned unit without settling a governing decision left unresolved for it. This does not require every local choice to be specified or the whole task to be understood. A discovery contract can be complete while the architecture remains undecided.

A **delegation boundary** is the explicitly opened scope in which Reasoning retains governing judgment across delegated units and returned evidence. It is the execution boundary represented by the protocol below, not an evidence boundary or a new Workflow owner.

At most one delegation boundary is open:

```text
Boundary state: NONE | OPEN
Boundary operation: NEW | REOPEN | CLOSE
```

An uncertainty does not itself open a boundary. `DELEGATE` with `NEW` or `REOPEN` opens it; `RETURN` leaves it open; only Reasoning performs `CLOSE`. Runtime State supplies control and profile, not this model-written boundary state. Recover it from visible transfer records; never infer `NONE` from the current profile or an absent recent marker.

A Slice retains its Freeflow meaning: one coherent outcome, not one delegation. It may contain zero or several sequential delegation boundaries. A boundary may contain multiple units inside the same bounded activity; it must not silently continue across distinct bounded activities. Opening, returning, or closing does not select or complete a Slice. [Track Work](../../skills/track-work/SKILL.md) owns durable task memory when needed; its record is not routing state or fresh authority.

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

- **Yield** transfers one complete ordinary result to Standard without opening a delegation boundary. The result must be small, exact, local, reversible, low-risk, directly verifiable, and not require further governing judgment to complete.
- **Delegate** keeps Reasoning responsible for the governing judgment while Standard executes. Use it for evidence Reasoning needs to interpret, discovery before choosing an approach, and implementation or verification under accepted direction.
- **ACT_BOUNDED** permits exceptional direct Reasoning execution where judgment and action cannot usefully be separated under the conditions below.

Use Delegate when uncertain. Task size, a tool being easy to call, or a preference for the stronger profile does not settle the route.

Do not use Yield inside an open boundary, including for a unit that would qualify in isolation. Do not close a boundary to obtain Yield. A qualifying `ACT_BOUNDED` scope may contribute to an open boundary but does not close it.

Reading an exact package version as the complete requested result may Yield. Reading a configuration file so Reasoning can choose an architecture is Delegate, even though the environment action is equally small.

A route never widens the authority envelope. If the requested outcome, covered effects, or a user-owned decision is unsettled, use Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md) before the affected execution. An informative experiment still needs authority to exercise the target behavior.

## Exchange Work Through Delegate

### Reasoning: Find The Next Useful Unit

Start from the actual goal and current evidence. Decide what needs governing judgment now and what cannot yet be judged reliably.

- If user intent is materially unclear, discuss it with the user rather than delegating a guess.
- If environmental facts are missing, delegate a bounded investigation aimed at the uncertainty that could change the approach. Do not invent an implementation plan before acquiring its premises.
- If alternatives depend on an observable difference, delegate the smallest covered observation or experiment that can distinguish them.
- If direction is sufficiently supported, communicate that insight and delegate the work it makes possible. Do not ask Standard to rediscover governing judgment already available to Reasoning.

Choose a unit that can reach a useful result before the next governing decision. Do not divide a coherent investigation or implementation into individual tool calls, and do not delegate the whole task merely to avoid later assessment.

Discovery, implementation, verification, and correction are purposes of a contract, not additional Cognitive Routing routes. Use the current owner's method; this skill does not replace planning, diagnosis, evidence verification, or review.

### Reasoning: Communicate The Contract

Write a direct, natural handoff. Make the required meaning clear without mandatory prose headings or an order-by-order script:

- what the unit should accomplish or help Reasoning decide;
- what is settled, what is a hypothesis, and why a constraint matters when that helps execution;
- the scope, invariants, and any ordering required for correctness or evidence;
- the local choices Standard may make;
- the result or evidence needed, and the conditions that require return.

Include only what applies or is not already unambiguous in shared context. Instructions about paths, commands, or implementation details are warranted when those details matter; otherwise communicate the relationship or outcome to investigate. Distinguish a suggested mechanism from a required constraint so Standard can improve execution without guessing which one it may change.

For example:

> I'm not ready to change normalization yet. Determine whether the legacy import path normalizes before alias resolution, unlike the other paths. Follow its callers if they change that picture. Don't modify anything. Return the ordering, direct source evidence, and anything that disproves this explanation.

This transfers a question and an investigation boundary, not the architectural decision. Standard chooses how to trace the relevant paths.

For the first transfer, write the literal markers, choosing one operation:

```text
DELEGATE
Boundary operation: NEW | REOPEN
Boundary state: OPEN
```

Use `NEW` for the first boundary for this bounded outcome. Use `REOPEN` only to continue the same previously closed outcome under fresh authority and invalidating evidence or changed intent. Identify the boundary's outcome when opening it; later contracts identify the next unit without restating the whole task.

For another unit in the same open boundary, write:

```text
DELEGATE
Boundary state: OPEN
```

Follow the markers with the contract, then switch to Standard through the profile-switch rule below. A transfer record must be visible; private reasoning does not transfer execution responsibility.

### Standard: Execute Resourcefully Within Direction

Use the current owner's method and the shared evidence. Decide local mechanics rather than returning because a file, helper, variable name, or ordinary implementation choice was not specified.

Within the covered scope, Standard may:

- follow relevant references and adjacent evidence needed for the unit;
- form hypotheses, compare local approaches, and recommend alternatives;
- use existing abstractions or a simpler mechanism that preserves the governing direction;
- make necessary, proportionate local changes and checks;
- interpret observations, verify the affected behavior, and correct a supported local defect.

Execution freedom is not permission for optional cleanup, unrelated improvements, additional side effects, or a change to a required constraint. Later Reasoning review cannot retroactively authorize them.

If the next environment action is uncertain, broad, noisy, or repetitive, use [Action Selection](../../skills/action-selection/SKILL.md). Its observation returns to the current owner inside this contract; it does not create a profile transition or delegation boundary.

An expected failing regression test or an understood mechanical error does not alone require return. Resolve it within the contract when the cause and correction are local and supported. Do not guess through an unexplained failure, repeat a correction without new evidence, or expand the repair to preserve the appearance of success.

A discovery unit may disprove tentative hypotheses without invalidating its contract. Continue the agreed investigation while it remains useful and covered. Return before acting on a contradiction that invalidates governing direction or requires a consequential choice outside the unit.

For example, routing through an existing helper may improve the suggested implementation while preserving the required behavior. Discovering that the helper requires changing public token semantics is a governing question: preserve the evidence and return before making that change.

### Standard: Verify, Self-Review, And Return

Use [Verify Work](../../skills/verify-work/SKILL.md) when establishing what a check proves at the required boundary. Once evidence supports the unit's result, silently self-review the work through the current owner's method. Check local correctness, alignment, suitability, and unnecessary complexity. Correct a clear covered defect and recheck only the affected state; do not manufacture repeated review passes.

This local self-review is permitted technical judgment. It does not close the delegation boundary, accept a changed governing decision, or take over Reasoning's user-facing assessment.

Return when:

- the unit's requested result or evidence is available, with applicable verification and local self-review complete;
- a material contradiction or decision requires changing governing direction, authority, scope, failure behavior, or evidence requirements;
- execution or required verification cannot continue within the contract, or failure remains unexplained or repeats without useful new evidence;
- the contract's stop condition is reached or no covered action can advance the unit;
- any fresh user message arrives.

At a return condition, finish only the current atomic environment interaction. Preserve partial effects and unverified work; do not start another action to make the return look complete. A fresh user message must be returned to Reasoning before interpretation or response.

Write:

```text
RETURN
Boundary state: OPEN
```

Then communicate what was actually found or produced, the evidence and its limits, material deviations or surprises, unresolved questions, residual effects, and why the unit is returning. Separate observed facts from hypotheses and recommendations. Name exact sources or evidence pointers when they are needed for assessment; a summary is not a substitute for the underlying evidence.

Do not report an intended read, edit, or check as performed. State failed, unavailable, or inconclusive evidence plainly. Standard may disagree with the direction and explain why without adopting the replacement itself.

Switch to Reasoning. `RETURN` transfers evidence through the existing boundary; it is not `NEW`, `REOPEN`, `CLOSE`, or independent review.

### Reasoning: Assess The Result And Your Direction

Compare the return with the actual observations and artifacts available in shared context, not merely with the contract's expected result. Ask:

- Does this advance or satisfy the accepted goal within its constraints?
- Does the evidence directly support the claim being made?
- Did Standard's execution expose a mistaken premise, a better path, or an omitted risk?
- Is a problem in the implementation, in the evidence, or in Reasoning's direction?

Reuse adequate verification and Standard's supported local self-review. Do not automatically perform a second identical full review. Reasoning supplies the governing assessment, including self-review of its own assumptions and direction. A successful check is not universal proof, and a compliant implementation of a mistaken plan is not an accepted result.

If current context is sufficient, judge it directly without environment interaction. If a claim needs another source, diff, test, or runtime observation, delegate that evidence-gathering unit inside the same boundary. Standard may investigate and explain the evidence; Reasoning retains the governing acceptance judgment. Do not create a nested review boundary or bypass the tool restriction to review personally.

Profile changes do not provide review independence. Use [Review Work](../../skills/review-work/SKILL.md) or [Review Artifact](../../skills/review-artifact/SKILL.md) when the current owner needs their judgment method. A separately selected independent review remains a distinct Workflow responsibility, not an automatic consequence of return.

Continue according to what the result supports:

- **More accepted work:** delegate the next coherent unit.
- **Missing evidence:** delegate the discriminating observation or check, not speculative correction.
- **One supported local defect:** delegate the correction and affected verification in this boundary, then recheck the affected result.
- **An invalidated assumption or better supported approach:** reconsider the direction before assigning more implementation. Route user-owned changes through Workflow.
- **Unclear or repeated failure:** use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) or Workflow; do not continue an automatic review-fix-review loop.
- **A user-owned choice, changed authority, or source conflict:** suspend dependent execution and route through Workflow or Decision Gate.
- **Supported and complete:** self-review the supported bounded result and close.

Carry supported discoveries and corrections into later direction. Adjust contract precision when evidence shows what was misunderstood; do not respond to every defect with more instructions or less execution freedom. This is within-task adaptation, not parameter learning or automatic promotion of a permanent rule.

### Reasoning: Close Only The Supported Boundary

When the bounded result is supported and self-reviewed, with applicable checkpoints and material contradictions resolved, write:

```text
CLOSE
Boundary state: NONE
Current owner: unchanged
```

State the supported result, important limits, and next route in proportionate prose. Closing leaves Reasoning active to report, discuss, or select another covered activity. It does not complete the wider Slice or authorize follow-up work.

Do not close an unsupported, blocked, inconclusive, or contradictory result merely to clear routing state. If the task or current activity changes, reconcile the unresolved boundary through Workflow rather than silently carrying it into distinct work. Preserve what remains open and why; do not claim completion from a pause, cancellation, or profile change.

## Yield One Complete Ordinary Result

Use Yield only with `Boundary state: NONE` and when Standard can complete and verify the whole ordinary bounded result without further governing judgment. It avoids an unnecessary delegation boundary, not the profile transition.

Write literal `YIELD`, followed by a natural brief identifying the result, applicable constraints and evidence, and the handback condition. One line is enough when the result is exact. Then switch to Standard.

Standard leads execution, verification, and local self-review for that result using the current owner's method. The same scope, authority, failure, and fresh-user-message safeguards apply. If broad exploration or a new governing decision becomes necessary, stop the yielded work and hand back; do not turn it into an unannounced delegation.

Write literal `YIELD HANDOFF` and explain the actual result, evidence and limits, any blocker or partial effects, and the handback condition reached. Then switch to Reasoning.

Reasoning accepts and reports a sufficiently supported result without automatically repeating Standard's review. If the handoff is contradictory or insufficient, assess the gap and select the appropriate route. Yield never opens or closes a delegation boundary, and `YIELD HANDOFF` is not the separate task-memory Handoff method.

## Act Bounded Only When Delegation Loses Essential Judgment

`ACT_BOUNDED` is the sole direct execution route for Automatic Reasoning. Both conditions must hold:

1. the judgment and the environment action or artifact production are materially inseparable;
2. shared-context delegation would cause a concrete material loss that warrants the premium execution cost.

Name what delegation would lose. More convenient access, fewer switches, one small read, or a general belief that Reasoning would perform better is insufficient. Ordinary inspection, research, implementation, tests, builds, verification, and cleanup remain Standard work.

Difficult synthesis may qualify when the synthesis is itself the artifact: making a decision-complete contract would require Reasoning to produce essentially the artifact and Standard merely to transcribe it. Sensitive result-by-result intervention may qualify when the evolving judgment cannot be usefully separated from the bounded action. The task label alone does not establish either condition; even a qualifying synthesis does not absorb separable source gathering or routine validation.

Before acting, write literal `ACT_BOUNDED` and make explicit the scope and expected result, why judgment and action are inseparable, the concrete loss from delegation, existing authority, and the stop condition. These meanings are required; fixed prose headings are not.

Perform only the bounded work declared. The scope may contain related tools needed for that result while its justification remains valid. It ends at the stop condition, interruption, context loss, changed authority or material scope, or loss of eligibility. Make the result and limit visible before continuing. If Standard execution is needed, end this scope before delegating.

An `ACT_BOUNDED` scope creates no delegation boundary. It may operate while Reasoning controls execution, inside or outside an open boundary, but never while Standard executes a contract. It may contribute to an existing boundary; it never contains Delegate or closes that boundary. If uncertain about eligibility, Delegate.

## Switch Profiles Explicitly

Every automatic profile transition uses only:

```text
freeflow_switch_profile(
  target="reasoning" | "standard",
  reason="one-sentence audit label"
)
```

Write the applicable transfer record first. The switch must be the only tool call in that assistant response. The marker and required state fields are literal protocol; the accompanying communication is adaptive. Do not substitute an informal intention, a different switching mechanism, or private reasoning for the transition.

Stay in Standard until the contract reaches a return condition. Do not switch per tool call or continue execution after handback is required. Stay in Reasoning for the assessment and user interaction; a close does not switch to Standard.

## Preserve Continuity And Failure Boundaries

A Runtime State refresh is host context, not a fresh user request. It neither ends a valid contract or `ACT_BOUNDED` scope nor resolves a delegation boundary unless its actual state contradicts the route.

A fresh user message does require Reasoning. If it arrives during Standard execution, finish only the atomic interaction, preserve partial work, write `RETURN` or `YIELD HANDOFF`, and switch. If the host has already returned control to Reasoning, recover the unfinished unit before assessing the message; do not infer that execution completed.

### Manual Changes

A user control change takes effect at a safe boundary, never in the middle of an atomic environment interaction. Preserve the current result, contract, and unverified effects. Suspend an open automatic delegation boundary rather than abandoning or closing it by implication; the held profile then runs ordinary Workflow.

When the user releases Manual control, begin in Reasoning and reconcile any suspended boundary before automatic execution. A failed release leaves the manual hold in force. If the held profile cannot continue reliably, state the blocker and required user control without requesting an automatic switch.

### Failed Transitions

A failed switch authorizes no workaround:

- Failed Yield entry: Standard has not begun the yielded result.
- Failed Delegate entry: the boundary stays open; Standard has not begun the unit.
- Failed `YIELD HANDOFF` or `RETURN`: Standard stops at the handback boundary; it cannot take over the user interaction, settle governing judgment, or close the boundary.

Preserve the supported route and use the host's reported state rather than inventing transition success. Reasoning must not execute directly to bypass failure. Any later `ACT_BOUNDED` scope must independently qualify; recovery uncertainty itself is not eligibility.

### Context Loss Or Uncertain Recovery

After compaction, resume, session navigation, interruption, or uncertain continuity, recover before task execution:

- latest Control and Profile;
- current owner, bounded activity, and live authority;
- active route and explicit delegation-boundary state;
- latest contract, return, or handoff;
- evidence, partial effects, unverified work, and stop conditions.

Use visible records as memory, not fresh authority. A stale contract never overrides the current user or contradictory live evidence. A Working Record can preserve the task but does not establish profile or boundary state.

Required environmental recovery reads still use Standard through the supported Yield or Delegate route. If route identity or boundary state cannot be recovered well enough to select that route, stop and return the uncertainty to Workflow rather than inventing `NONE`, opening a replacement boundary, or using direct Reasoning access. No fresh `ACT_BOUNDED` scope begins before recovery is complete.

An open delegation boundary can survive turns, reloads, and returns while the same bounded outcome remains coherent. Technical settlement is not completion. Do not create another boundary for each correction, self-review, or evidence request.

## Stop At The Supported Route Boundary

Yield ends with its handoff to Reasoning. Delegate ends when Reasoning closes its supported boundary. `ACT_BOUNDED` ends with its declared scope. If no further execution is authorized, answer, wait, pause, or stop through Workflow without manufacturing another route.

When Cognitive Routing is inactive or control is Manual, its retained automatic instructions must not continue directing work. Use the current host state and ordinary Workflow; do not preserve shadow profile leadership or treat this skill as an independent source of authority.
