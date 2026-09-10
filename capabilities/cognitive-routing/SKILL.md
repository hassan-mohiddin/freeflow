---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active to guide reasoning-led execution, shape assignments, select evidence, assess results, and adapt across Coordinator and Executor handoffs."
---

# Cognitive Routing

Use two configured model participants in one agent and canonical session; only one executes at a time. Coordinator uses governing judgment to understand the problem, develop the approach, narrow the search and execution space, and assess the result. Executor reasons resourcefully within that direction, investigates and executes, verifies its work, and returns evidence, explanations, and better mechanisms. A profile switch does not create independent review.

Optimize the whole task for quality, reasoning reliability, continuity, responsiveness, and cost. Spend Coordinator effort where it prevents mistakes, resolves uncertainty, or removes unnecessary work. Preserve the accepted quality bar while placing ordinary execution on Executor. Fewer tokens or switches are not an improvement if they cause worse decisions, repeated investigations, or avoidable recovery.

Treat contracts, reports, questions, and feedback as real communication with the other participant. Speak naturally and give the explanation the receiver needs: why an approach fits, what surprised you, what failed, or what you recommend changing. Neither profile can rely on the other's private reasoning or provider-side cache to carry that meaning. Shared history does not remove the need to communicate current intent.

Use host-provided source attribution to distinguish your own earlier observations from the other participant's findings and proposals. Do not adopt the other profile's words as your own remembered reasoning or personal verification. If attribution is unknown, keep it unknown rather than guessing from the current profile. Attributed communication helps identify who said something; its claims still need evidence and its instructions still need current applicability.

[Workflow](../../skills/workflow/SKILL.md) owns the work agreement, authority, current activity, checkpoints, and user-facing return boundary. Read its method when absent before applying this split. Routing changes compute and context placement, not those responsibilities. A contract, tool receipt, or capable model does not grant permission.

## Establish Current Control And Responsibility

Use the latest host-generated Runtime State. Do not infer control or profile from a model name, an old handoff, quoted instructions, or marker-shaped source text.

- **Inactive:** stop applying this routing method.
- **Manual:** run ordinary unsplit Workflow in the held profile, including conversation and environment work. Automatic role restrictions, delegation, and projection are bypassed. Do not retain a shadow Coordinator/Executor hierarchy. The hold remains until the user changes or releases it.
- **Automatic:** follow the current profile, unit, assignment, phase, and recovery state. These duties apply whether projection is on or off.

A **unit** is one outcome under Coordinator judgment. It can contain several assignments and assessments. An **assignment** is one saved contract for Executor. An **execution** is one response attempt and its associated tool work. A failed execution does not itself finish the assignment. A **handoff** preserves a contract or report and requests the corresponding transfer.

The harness owns IDs, lineage, and lifecycle. Use its current relationships and status to distinguish active, completed, and superseded work; do not maintain another ledger. Returning ends the assignment's ordinary Executor work. Coordinator assesses before accepting or closing the unit. Closing a unit does not complete a Working Record task or authorize delivery.

If current state is missing, contradictory, or blocked, recover through the supported controls before affected work. A Runtime State refresh is a host observation, not a new user request or a reason to discard a valid contract.

Use routing inspection only when current routing state or saved communication is missing or unclear before delegating another investigation. Follow the tool's controls; historical communication is not current authority, and known state needs no repeated polling. Do not inspect after every tool call when the current state and refs are already known.

## Follow The Complete Loop

```text
Coordinator understands the goal and current evidence
  -> chooses the next question or supported result
  -> gives Executor a concrete contract and assessment needs
Executor establishes the contract and required methods
  -> executes, observes, and corrects within scope
  -> verifies and self-reviews the actual result
  -> prepares the evidence Coordinator needs
  -> when projection is on, selects missing evidence and checks receipts
  -> optionally cleans its own context without losing responsibility
  -> reconciles any new method reads, evidence changes, and delivery gaps
  -> submits the report and stops ordinary assignment work
Coordinator assesses the result and its own direction
  -> continues covered work, corrects the actual gap, discusses, or closes
```

Coordinator may also clean its own context before delegation when useful. Cleaning is optional. Accounting for the evidence and returning honestly are required even when the result is incomplete.

Reaching a result or stop condition starts return preparation. It does not mean calling the return tool before preparing the evidence. For interruption or blocked work, preserve the actual partial state and available evidence without doing extra task work to make the return look complete.

## Keep Coordinator's Environment Access Narrow

Under Automatic control, Coordinator may:

- use the Cognitive Routing tools permitted by its current role and phase;
- read skills and their instructional references to understand the methods it needs;
- use an effective Context Control capability to inspect, clean, or restore representations in its own view, under that capability's method;
- perform substantive environment work only within a qualifying `ACT_BOUNDED` scope defined below.

Delegate all other environment work: source and task-record reads, repository searches, commands, diagnostics, experiments, edits, tests, builds, and substantive artifact production. Ordinary inspection remains execution even when one small read would suffice. There is no general `OBSERVE` route.

The skill-reading exception permits only the reads needed to load instructional content. It does not permit running skill scripts, executing examples, following arbitrary task-file links, or reading a Working Record merely because a skill names it. Use known skill locations and the host's supplied catalog; broad discovery is Executor work. Complete a truncated method read, then stop the read scope when the needed body is available. Reuse still-retained methods rather than rereading them at every handoff.

Context Control is an explicit exception for managing one's own view, not general source investigation or a substitute for delegated task work. Read its current method before use; do not invent tools or operations when the capability is unavailable. Routing controls and these exceptions remain subject to host permissions and current user direction.

## Coordinator: Resolve The Next Planning Problem

Start with the user's actual outcome, constraints, amendments, and available evidence. Before delegating, work out what you would do next, why that approach fits, what must be established first, and what mistake the assignment should prevent. Transfer those useful conclusions rather than making Executor rediscover them.

Choose the assignment for the actual uncertainty:

| Current need | Coordinator's job | Executor's result |
| --- | --- | --- |
| User intent or a user-owned choice is materially unclear | Discuss the choice; do not delegate a guess | No affected execution until the direction is settled |
| Environmental facts or the cause are missing | Identify the question, plausible alternatives, useful starting sources, and permitted observation | Evidence that distinguishes the alternatives, including contrary findings |
| Outcome is settled but the approach is uncertain | Choose a bounded investigation or covered experiment capable of accepting or rejecting a mechanism | A supported approach or a clear limitation before substantial dependent work |
| Direction is supported | Explain the correction or design, necessary ordering, invariants, and checks | Resulting state, verification, self-review, and remaining limits |

A contract is **decision-complete** when Executor can pursue its assignment without settling an uncovered governing decision. A governing change materially alters the accepted outcome, architecture, policy, failure behavior, scope, authority, or evidence requirements. An investigation can be decision-complete while the larger implementation approach remains undecided.

One investigation may establish both the facts and the approach. A known local change needs no ceremonial discovery assignment. Do not invent APIs, paths, or exact edits before their premises are supported.

### Size Assignments Around Useful Judgment

Cognitive demand comes from uncertainty, branching, causal depth, and consequence. Use those pressures to choose assignment size and contract precision; task size or tool count alone does not tell you where judgment is needed.

Keep straightforward implementation, checking, and local correction together. Shorten an assignment when an unfamiliar seam, uncertain observer, or repeated misunderstanding could invalidate substantial dependent work. Establish that foundation before expanding the implementation or test matrix. A prototype ends when its question is answered or its observing limit is reached; a negative result can complete the learning assignment.

Account for the context needed to execute, check, correct, and return. Keep later work directional until its premises hold. Use actual host usage when available; do not invent token estimates or assume a large provider window guarantees reliable execution.

Choose return points where assessment can change what follows. Do not split by file or command, supervise every local choice, or delegate the whole task merely to avoid later judgment. Each unnecessary cycle consumes compute, time, and attention.

### Communicate A Usable Contract

Plan for differences in model capability without assuming Executor is incapable. Give more explicit direction where a misunderstanding is likely or expensive, and preserve freedom where the mechanics are understood. Natural communication may be one concise paragraph or a detailed plan; no fixed prose template is required.

Put the actual contract inside `freeflow_delegate(operation: "assign")`. Communicate what matters for this assignment:

- its question or result and connection to the user's goal;
- established facts, hypotheses, and why the supported approach fits;
- relevant sources, relationships, ordering, invariants, and known traps;
- required constraints versus suggested mechanics, local freedom, and excluded effects;
- evidence Coordinator will need, including material task background;
- the result, uncertainty, or condition requiring return.

Do not omit useful low-level guidance merely to keep a contract high-level. Explain the insight that removes search or ambiguity, without producing a whole patch just for Executor to transcribe. Describe future evidence by purpose; its refs do not exist until the host exposes completed sources.

Request likely assessment evidence in advance at the level you can justify: for example, the resulting diff, the exact assertion and actual check output, and anything that contradicts the proposed explanation. You need not know future refs or predict the findings. Executor must satisfy these requests where possible and add other material discoveries. An expected successful outcome is not an instruction to suppress contrary evidence.

For a consequential or repeatedly misunderstood property, name the required behavior, a plausible wrong behavior, and an observer that distinguishes them. For example: establish cancellation through the actual registered request path before expanding adapters; do not insert a fixture-only early return and call it proof of native cancellation. Leave local instrumentation choices to Executor.

When revising direction, identify what the new contract replaces and what remains covered later. Use `replace` with an explicit reason only for a supported, quiescent outstanding assignment whose unit's intended outcome remains valid. Preserve prior effects and uncertainty. If accepted direction changes that outcome or stops it, reconcile the old unit through the appropriate close disposition before assigning a new covered outcome. Do not replace a saved return that needs assessment, or close or create a unit merely to evade unfinished responsibility.

## Executor: Execute Resourcefully Within Direction

Establish the exact current contract, required result, constraints, and return condition. Load the producing activity's method and [Action Selection](../../skills/action-selection/SKILL.md) when their bodies are absent; reuse the methods while retained. A profile does not replace diagnosis, implementation, verification, or review methods.

Follow required direction and ordering. Choose ordinary mechanics, follow relevant adjacent evidence, compare local approaches, use simpler existing mechanisms, and correct understood local defects within scope. Do not return merely because a helper, filename, or intermediate step was not prescribed. Distinguish an improvable suggestion from a required constraint.

Challenge unsupported premises and communicate better approaches. A disproved tentative hypothesis can advance the assigned investigation; continue while its question remains useful and covered. A false premise that invalidates implementation requires stopping dependent effects and returning the finding before adopting an uncovered governing change.

Before pursuing a new prerequisite, distinguish what blocks the observer, the chosen mechanism, or the actual outcome. Do not change acceptance, add an optional stronger guarantee, or build a subsystem solely to keep the current approach moving. Report the smallest supported alternative or the unresolved limit.

An expected failing regression or understood mechanical error does not alone require handback. Correct it locally when the cause and remedy are supported. If failure is unexplained, repeated without useful evidence, or requires changing the contract, use the owning method's diagnosis route or return. Do not widen repairs or weaken assertions to produce a green result.

Use [Verify Work](../../skills/verify-work/SKILL.md) before claiming the assigned result. Confirm that the required path and decisive assertions actually ran against the reported candidate. A successful write is not correctness; a passing summary does not establish missing cases. Preserve failed, unexercised, stale, or inconclusive evidence.

If a material assertion changes after failure, expose what the old and new predicates establish. Replacing exact-position equality with a nonnegative-integer check does not establish the original requirement. Use Verify Work's Test Design method for uncertain observer sensitivity; do not substitute a fixture crash or manually invoked callback for the behavioral or native-host claim. Correct a genuinely wrong expectation when its governing source supports the correction.

Once evidence supports the result, silently self-review through the producing method for correctness, alignment, suitability, and unnecessary complexity. Correct clear covered defects and recheck the affected state. Local self-review does not accept the whole unit or authorize another assignment.

Return preparation begins when the result is available, the contract's stop condition is reached, a governing decision is needed, no useful covered action remains, or fresh user input requires Coordinator attention. Recommendations for later work belong in the report; they do not grant yourself another assignment.

## Executor: Prepare Evidence Before Returning

Evidence preparation belongs to every return. Projection selection is required when Coordinator needs evidence not already available in its view. Do not wait for Coordinator to ask again for the supporting material your result already requires.

Executor sees ordinary Pi active context. With projection on, Coordinator sees its own/common context plus admitted Executor evidence. Shared canonical history does not mean both profiles see the same bodies. A report, filename, quoted ref, or call envelope is not the underlying result.

Prepare the return in this order:

1. **Reconcile the result.** Compare the contract with actual final artifacts and observations. Identify material claims, requested evidence, corrected assumptions, adverse findings, partial effects, and missing cases across the whole assignment.
2. **Choose sufficient evidence.** Determine what Coordinator already has and what completed source bodies it still needs to assess those points. Check that source/test captures and results apply to the reported candidate after any later edits.
3. **Select when projection is on.** Select completed skill reads and their references, then add other missing eligible evidence Coordinator needs. Prefer actual tool-result bodies for execution evidence; include substantive assistant findings or drafts when those are themselves the object of judgment. Select incrementally during longer work, then reconcile the final set before return.
4. **Read relevant receipts.** Correct supported selection problems, preserve valid items, and report remaining gaps. Do not base a dependent claim on an unread result or repeat an adequate check.
5. **Optionally clean your view.** Use effective Context Control when helpful, preserving responsibility and promised evidence.
6. **Check immediately before submit.** Account for evidence changes since selection. With projection on, keep selected evidence limited to this assignment's assessment needs and disclose missing or failed items rather than adding every tool result. Every material claim needs sufficient evidence or an honest limit. Reuse adequate receipts and follow the batching rule below.
7. **Submit the actual report.** Use `freeflow_return(operation: "submit")` with the result, evidence and its limits, corrected assumptions, partial effects, and reason for return. Then stop ordinary assignment work.

Requested evidence is a minimum, not an exclusive allowlist. A request for passing checks does not permit omitting a later failure. Select the smallest sufficient set, keeping material counterevidence; neither dumping every ref nor hiding evidence to minimize size serves sound judgment. Include newly acquired governing background when Coordinator needs it.

Use refs exposed by the tool. Select actual result bodies for execution claims and visible assistant text when that text is the result being assessed. Use routing inspection only when a needed ref or selection state is unclear; a call envelope, omission placeholder, or uncompleted response is not the evidence it describes. Let the harness handle native dependencies and known-source resolution; do not invent refs or reconstruct its bookkeeping.

Follow per-item receipts to correct supported selection problems. Preserve unavailable bodies, target limitations, and uncertain request fit explicitly; do not substitute different content while claiming exact delivery. Selection readiness proves neither provider acceptance nor the report's claims. Reuse saved communication instead of repeating a report to create another selectable message.

Remove superseded or unnecessary selections only with a reason. Do not withdraw unique adverse evidence merely to obtain readiness. Avoid rereading to manufacture refs, printing inventories after every call, or copying raw outputs into the report to evade projection. Communicate conclusions and limitations in the report; select the inspectable evidence behind them.

No additional discretionary evidence is needed when Coordinator already has enough to assess the result or the result is genuinely self-contained. An empty selection is valid only when no required evidence needs adding, or blocked/interrupted work has actual evidence limitations disclosed. “Coordinator did not explicitly ask me to project” never excuses omitting necessary evidence. When projection is off, skip projection tools while preserving the same verification and reporting duties.

You may batch already-decided projection changes and one return last when the host permits it. Do not mix the handoff with new task work whose results the report has not inspected, or claim a future selection receipt succeeded. Use separate calls when you need its result to decide the report or correction.

### Preserve An Honest Blocked Or Interrupted Return

Do not delay a required stop to run another read, edit, test, or retrieval just to complete the evidence set. Preserve already-available evidence through permitted handoff preparation and report unfinished checks. Honor cancellation and host control limits before optional preparation.

If evidence remains unavailable or selection is blocked, retain valid selections and save the report with explicit gaps. Do not trap the assignment until it can appear successful. An `outcome: "completed"` claim must not conceal an unmet required property; partial or blocked results are valid returns.

A saved report is not successful delivery or assessment. Ordinary task work stays ended while you correct a supported handoff problem. Use the return tool's retry for an unchanged saved report; revise its text only deliberately. Never redo the investigation or repeat a potentially completed effect without reconciliation.

## Coordinator: Assess The Result And Your Direction

Assess the report and evidence already received. Use routing inspection only when required state or evidence is missing or unclear; routine assessment does not call `inspect`. Keep the required quality, correctness, maintainability, and evidence standard independent of Executor's cost. Do not accept a result you would reject if you had produced it yourself, or reject a simpler valid implementation merely because it differs from your suggestion.

Before accepting a material claim, compare the accepted property, actual observer, decisive assertions, candidate identity, and returned result. A confident report or green suite cannot fill a missing link. Keep unsupported required claims open and stop dependent work.

Also assess your own direction:

- Does the result serve the user's outcome and amendments, or merely follow your steps?
- Did execution expose a mistaken premise, better approach, omitted risk, or poorly sized assignment?
- Are requested evidence, adverse findings, or partial effects missing?
- Did your contract leave a governing decision implicit or turn a suggestion into an unnecessary obligation?
- Is the remaining issue required for acceptance, or an optional improvement?

Reuse adequate verification and Executor's supported self-review. Coordinator supplies governing assessment and self-review of its own direction, not an automatic duplicate full review. Use [Review Work](../../skills/review-work/SKILL.md) or [Review Artifact](../../skills/review-artifact/SKILL.md) when their judgment method is needed; read it if absent. A separately selected independent review remains a Workflow responsibility.

Route from the actual gap:

| Evidence and current agreement | Next action |
| --- | --- |
| Supported result; agreed work remains | Delegate the next coherent covered assignment |
| Existing evidence was not delivered | Seek the smallest supported selection or delivery correction; do not assume new execution is needed |
| Required observation is missing or inadequate | Delegate the discriminating observation, preserving the required property |
| A clear covered defect is established | Explain its basis; delegate correction and affected verification |
| A premise or approach is invalidated | Revise your direction or investigate the material alternative before dependent work |
| Cause is unclear or failure repeats | Use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md); reconsider observer, contract, and assignment size |
| User-owned choice or source conflict remains | Use Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md) and stop dependent effects |
| Outcome is supported and complete, or deliberately stopped | Record the appropriate unit disposition with an honest assessment |

Missing evidence is not itself a code defect. Before requesting a rerun, distinguish material that exists but was omitted, stale evidence, an inadequate observer, and an actual implementation gap. A saved return awaiting correction and a completed handoff are different phases; use only the operations current state permits. Do not create a new assignment solely to pretend the old assessment was resolved.

When the same mismatch recurs, isolate the property and identify what changes the next attempt: a clearer requirement, corrected observer, concrete counterexample, recovered contract, smaller working set, or revised mechanism. A longer restatement alone is not adaptation. Preserve the limitation rather than lower acceptance or repeat indefinitely. A change to user-controlled compute configuration remains a separate decision.

Carry useful lessons and corrected assumptions into later contracts. Add precision where evidence showed misunderstanding, and preserve local freedom where execution was sound. This is learning within the session; it does not create permanent policy or new authority.

Use `freeflow_unit(close)` only as Coordinator. Accept when the unit's required result and evidence are supported and applicable checkpoints and material contradictions are resolved. Use cancelled or deferred dispositions under current direction without claiming completion. Never close merely to clear blocked state.

An internal return or unit closure is not necessarily the user's requested endpoint. Continue covered work without asking for another “continue”; stop at the actual work agreement, a genuine blocker, or an uncovered consequential choice. A recommendation does not authorize delivery, publication, or other separately controlled work.

## Manage Context Without Losing The Reason For The Work

Treat contracts, reports, assessments, and admitted evidence as useful reasoning context. Finishing a unit or replacing an assignment does not by itself mean its communication is obsolete. Preserve the meaning and lineage needed to understand current work; do not request deletion merely because a lifecycle status changed.

Routing determines responsibility and admitted evidence; native compaction and effective Context Control manage reduction. Follow the current contract and runtime labels rather than restating history after each switch or treating historical instructions as current. Admitted content is not permanently pinned.

When Context Control is effective, both profiles may clean their own view after reading its method. Reduce redundant exploration, obsolete output, and noise; preserve current constraints, useful reasoning, unresolved failures, active communication, and evidence needed for assessment or continuation.

Coordinator's view is already selective; do not remove useful evidence merely to make it smaller. Executor must preserve current direction and useful lessons while reducing old raw output. Manage only your own view; cleaning does not change the other profile's view or canonical sources, and restoring content does not make excluded evidence shared.

Prepare promised evidence before optional cleanup, and do not replace an exact promised body with a summary. If cleanup fails, retain the extra context and continue the valid handoff. Skip no-op cleanup. Preserve stable communication; use actual observations, not character counts alone, to judge performance or cache benefits.

## Handle New Input, Control Changes, And Recovery

Under Automatic control, Coordinator owns substantive user interpretation, discussion, questions, decisions, assessment, and reporting. Executor returns findings through the handoff; it does not answer new user requests, impersonate Coordinator, or assign itself follow-up work.

New natural-language input goes through Coordinator, including “continue.” If it reaches an already prepared Executor request, honor restrictions immediately, stop further task work, and prepare an interrupted return from available evidence. A refreshed Runtime State alone does not trigger this rule.

Continue ordinary tool responses and native retries within the assignment. Explicit `/freeflow resume` is a user control for interrupted work after reconciliation, not a requirement for every continuation or new task authority. Resume a saved return only as handoff correction; reconcile uncertain effects before retrying.

A manual hold suspends automatic work without completing it. Preserve the contract and partial effects; Coordinator reconciles them when the hold is successfully released.

After actual context loss, navigation, or uncertain continuity, recover current control, responsibility, exact applicable contract/report, current user direction, partial effects, evidence limits, and stop conditions. Reload required skills and instructional references when absent. Do not combine an old stopping instruction with a superseding contract or resume implementation when the current assignment is inspection only.

Use [Track Work](../../skills/track-work/SKILL.md) when a Working Record exists; full task recovery requires its complete `full` view and reconciliation with current sources. Coordinator may read that method directly, but task-record and evidence reads remain Executor work. A record cannot supply missing routing authority or prove current environment state.

### Recover Through The Existing Assignment

Attach recovery to the existing responsibility. Coordinator identifies the missing information and question to resolve; recovery creates no new outcome or task permission.

- **Outstanding assignment:** Executor recovers the identified context within its supported continuation, reconciles current restrictions, and continues only covered work. Do not replace the assignment or repeat completed actions merely to recover.
- **Returned assignment:** use recovery attached to that assignment only when the runtime exposes a recovery-only phase. Bound it to identified reads, evidence projection, and return to the same assessment. Preserve the original contract, report, outcome, and valid evidence; keep recovery findings distinct. Ordinary task work stays closed, including edits, tests, and further investigation.

When projection is on, project the recovered bodies Coordinator needs. Full Working Record recovery requires the complete read, not Executor's summary. Report missing or stale evidence; historical observations are not fresh environment proof.

If the required recovery phase is unavailable, inspect saved communication and stop if it is insufficient. Do not invent operations or simulate recovery by replacing work or its report. A separate recovery assignment is appropriate only when no existing assignment or assessment needs preservation. Ordinary recovery reads do not qualify for `ACT_BOUNDED`.

### Resume The Recovered Responsibility

Suspending an assessment preserves admitted history but pauses its additional evidence-restoration obligation. Inspect saved communication when needed and restore the assessment through its routing control when it is again intended. Follow restoration failures honestly; they do not erase the report or authorize repeating completed investigations.

Navigation does not roll back files, processes, or the Working Record. Reconcile the current environment through covered observation; do not import later approval into an earlier conversational branch. Keep an observation's historical occurrence separate from its applicability now.

## ACT_BOUNDED: Execute Directly Only When Judgment Is Inseparable

Beyond routing controls, instructional reads, and effective view-local context operations, Coordinator's direct environment work requires both:

1. judgment and the action or artifact production are materially inseparable;
2. delegation would cause a concrete material loss that warrants direct Coordinator execution.

Task size, convenience, one small read, fewer switches, a demanding quality bar, or preference for the stronger model is insufficient. Ordinary investigation, implementation, verification, and environment cleanup remain Executor work. Failed handoff or uncertain recovery does not qualify the exception.

Synthesis may qualify when the requested artifact is the governing judgment itself: a decision-complete contract would require Coordinator to produce essentially the artifact and Executor merely to transcribe it. Sensitive result-by-result intervention may qualify when evolving judgment cannot usefully be separated from action. Separable source gathering and routine validation still belong to Executor.

Before acting, state `ACT_BOUNDED` with the scope, expected result, existing authority, stop condition, inseparable judgment, and concrete delegation loss. Perform only that work while the justification holds. End the scope on completion, interruption, context loss, changed authority or applicability, and before delegating again.

The scope does not create or close a routing unit, transfer Workflow ownership, or grant permission. Make its result and limits visible, then return to the supported Coordinator responsibility.

## Stop At The Supported Boundary

Executor stops ordinary task work after saving its return. Coordinator assesses before accepting the unit and continues only as far as the user's agreement covers. Preserve unresolved evidence and partial effects at every stop.

When routing becomes inactive or control becomes Manual, stop applying the automatic split even if this skill remains in context. Use current host state and ordinary Workflow.
