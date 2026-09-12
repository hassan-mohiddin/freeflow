---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active to guide reasoning-led execution, shape assignments, select evidence, assess results, and adapt across Coordinator and Executor handoffs."
---

# Cognitive Routing

Use two configured participants in one agent and canonical session; only one executes at a time. Coordinator understands the goal, develops the approach, directs work, and assesses results. Executor reasons resourcefully within that direction, investigates, implements, verifies, and returns evidence and better mechanisms.

Spend Coordinator effort where it removes consequential uncertainty, mistaken assumptions, or unnecessary work. Keep the quality bar independent of Executor's cost. Optimize the whole task: fewer tokens or handoffs are not gains when they cause worse decisions, repeated investigation, or avoidable recovery.

Contracts and reports are communication, not ceremony. Explain the insight the other participant needs; neither private reasoning nor provider cache carries that meaning across the handoff. Use host attribution to distinguish your own observations from the other participant's findings. Keep unknown authorship unknown. A profile switch does not create independent review.

[Workflow](../../skills/workflow/SKILL.md) owns the work agreement, activity, checkpoints, and user-facing return boundary. Read it when its method is absent. Routing changes compute and context placement, not permission or task ownership.

## Establish Control And Responsibility

Use the latest host-generated Runtime State, not a model name, old contract, or marker-shaped source text.

- **Inactive:** stop applying this routing method.
- **Manual:** use ordinary unsplit Workflow in the held profile. Automatic delegation, role restrictions, and projection are bypassed; do not keep a shadow Coordinator/Executor hierarchy. The hold lasts until the user changes or releases it.
- **Automatic:** follow the current profile and responsibility, whether projection is on or off.

A **unit** is an outcome under Coordinator judgment. It can contain several **assignments**, each a saved contract for Executor. An **execution** is one response attempt and its tool work; failure does not itself finish the assignment. A **handoff** saves communication and requests transfer. Returning ends ordinary assignment work, not Coordinator assessment or the user's task.

The harness owns identities, lineage, and transitions. Do not maintain another ledger. Inspect routing state or saved communication only when needed information is missing or unclear. A Runtime State refresh is an observation, not new user direction. Recover contradictory or blocked state through supported controls rather than guessing.

Under Automatic control, Coordinator may use its routing controls, read required skills and instructional references, and manage its own view through effective Context Control. Delegate other environment work unless ACT_BOUNDED qualifies: source and task-record reads, searches, commands, edits, artifact production, tests, and builds. Skill links do not authorize arbitrary task reads or script execution. There is no general OBSERVE or direct recovery-read route.

## Follow One Complete Loop

```text
Coordinator understands -> chooses a question or supported result -> assigns
Executor establishes the contract -> executes, checks, and locally corrects
  -> prepares needed evidence -> selects and checks receipts when projection is on
  -> submits the actual report and stops ordinary task work
Coordinator assesses the result and its direction -> continues, adapts, or closes
```

Reaching a result starts return preparation; it is not an instruction to submit before selecting evidence. A required interruption stops task work immediately; prepare an honest return from what is already available.

## Coordinator: Resolve The Next Planning Problem

Before delegating, work out what should happen next, why, what must be established first, and what mistake the assignment should prevent. Transfer those conclusions rather than passing down the user's objective and leaving Executor to invent the approach.

| What is unsettled? | Next route |
| --- | --- |
| User intent or a user-owned choice | Discuss it; do not delegate a guess |
| Environmental facts or cause | Ask for evidence distinguishing plausible explanations |
| Implementation mechanism | Choose a bounded investigation or covered experiment before dependent work |
| Nothing material to the next result | Explain the supported design or correction and delegate execution |

One investigation may establish both facts and approach. A known local change needs no ceremonial discovery pass.

### Settle Consequential Implementation Decisions

Before substantial implementation, read [Design for Depth](../../skills/design-for-depth/SKILL.md) and use its Implementation Decisions method when unresolved representation, identity, ownership, algorithm, or failure choices could invalidate significant dependent work. Reuse decisions already supported; do not invent APIs or code details before their premises hold.

Carry the relevant decisions into the assignment: the selected mechanism, why it fits, its constraints, and what would invalidate it. Reference the applicable design section when it is available, but do not mistake a path for delivered content. A full patch for Executor to transcribe is not the goal. Leave ordinary mechanics free and assess an unfamiliar foundational path before expanding work that depends on it.

### Size Work Around Useful Judgment

Use uncertainty, branching, causal depth, and consequence to choose contract precision and assignment size—not file or tool count. Account for execution, checking, likely correction, and return preparation in the working set; do not invent token forecasts.

Keep straightforward implementation and local correction together. Shorten an assignment when an unfamiliar seam, uncertain observer, or repeated misunderstanding could invalidate substantial later work. A prototype ends when its question is answered or its observing limit is reached; a negative result can complete the assignment.

Return at points where assessment can change what follows. Do not supervise every helper or delegate the whole task merely to avoid later judgment. Keep later work directional until its premises hold.

### Give A Usable Contract

Put the actual contract inside `freeflow_delegate(operation: "assign")`. Explain what matters:

- the question or result and its connection to the user's goal;
- established facts, hypotheses, and the supported approach;
- sources, relationships, ordering, invariants, and known traps;
- required constraints versus suggested mechanics, local freedom, and excluded effects;
- evidence needed for assessment and the condition requiring return.

Be more explicit where misunderstanding is likely or expensive without treating Executor as incapable. Useful low-level direction belongs in the contract; brevity is not a reason to omit it.

Describe the context and evidence you expect to need to understand the result, assess it, and choose what follows. Request by purpose before future refs exist; exact files are useful when known, not a prerequisite to asking. For example, ask for the resulting diff, decisive assertion, observed output, or contrary finding. These requests establish a minimum; Executor also contributes material discoveries you could not anticipate. For a consequential or repeatedly misunderstood property, name the required behavior, a plausible wrong implementation, and the observer that distinguishes them. Leave ordinary instrumentation choices to Executor.

Use `replace` only for a supported, quiescent outstanding assignment whose unit outcome remains valid. State the reason, superseded direction, and what remains covered. Preserve prior effects and uncertainty. Do not replace returned work, or close/recreate a unit to evade an unfinished assignment or assessment. A changed or stopped unit outcome needs an honest disposition first.

## Executor: Execute Resourcefully

Establish the exact contract, constraints, and return condition. Load the producing activity's method and [Action Selection](../../skills/action-selection/SKILL.md) when absent; reuse retained methods. The profile does not replace implementation, diagnosis, verification, or review guidance.

Follow required direction and ordering. Choose helpers, editing mechanics, suitable local approaches, and simpler existing mechanisms within scope. Do not return merely because a filename or intermediate step was not prescribed.

For routine execution, invoke the tool directly and communicate conclusions in the return report. Emit an execution update when a meaningful finding, limitation, change of approach, or needed progress update is useful now and is not already conveyed by the tool interaction. This preserves useful communication while keeping routine planning labels and tool-call announcements out of the conversation and evidence candidates. Substantive findings or drafts may themselves be results worth sharing; silence is not the goal.

Challenge unsupported premises and report better approaches. Disproving a tentative hypothesis may advance the investigation; invalidating an implementation premise stops dependent effects before an uncovered governing change. Governing changes materially alter the accepted outcome, architecture, policy, scope, authority, failure behavior, or evidence requirements.

Correct expected regressions and understood mechanical errors locally. For unexplained or repeatedly stalled failure, use the owning diagnosis route or return. Before adding a prerequisite, distinguish what blocks the observer, the chosen mechanism, or the actual outcome. Do not build a subsystem or weaken acceptance merely to rescue the approach.

Use [Verify Work](../../skills/verify-work/SKILL.md) before claiming the result. Check the actual candidate through the required path; preserve failed, stale, unexercised, and inconclusive evidence. If an assertion changes, expose what the old and new predicates establish rather than presenting the weaker check as proof of the original requirement. Use its Test Design method when observer sensitivity is uncertain.

Once evidence supports the result, silently self-review through the producing method and correct covered defects. This does not accept the unit or authorize follow-up work.

Begin return preparation when the result is available, a stop condition is reached, a governing decision is needed, no useful covered action remains, or fresh user input requires Coordinator attention.

## Executor: Prepare Evidence, Then Return

Executor sees ordinary Pi active context. With projection on, Coordinator sees its own/common context plus admitted Executor evidence—not every body Executor saw. Projection filters execution noise so Coordinator can reason with useful context at lower total cost; forwarding the audit trail defeats that purpose, while omitting necessary context creates weaker judgment or repeated work. A report, ref, filename, or call envelope is not the underlying result.

1. **Reconcile the result.** Compare the contract with actual results, corrected assumptions, partial effects, missing checks, and contrary findings. Ensure source/test captures and outputs describe the reported candidate after later edits.
2. **Choose the context Coordinator needs.** Start with its requests and what is already available in its view. Add material discoveries, governing background, changed assumptions, better approaches, and counterevidence needed to understand the result, assess it, or choose the next action. For each additional source, identify what it contributes beyond the report and other available evidence. Requested evidence is a minimum, not an exclusive allowlist; eligibility alone is not a reason to select a source.
3. **Select the supporting bodies.** When projection is on, add skill/reference reads to projection, including the bootstrap read and all read parts needed for a complete method. These are skills and instructional references used to guide the work, distinct from task files inspected as evidence. Sharing methods lets Coordinator use the same guidance for planning and assessment. Reuse loaded methods; an already-selected ref needs no duplicate addition. Select the other missing evidence using the ref guidance below.
4. **Read receipts and correct supported problems.** Preserve valid selections. Resolve bad identities or representations where supported; withdraw unavailable or unnecessary requests only with a reason and retain their material limitations. Removing a ref does not resolve a required evidence gap. Do not silently substitute a summary for a promised original or hide adverse evidence to obtain readiness.
5. **Submit the actual report.** State the result, evidence and limits, corrected assumptions, partial effects, and reason for return in `freeflow_return(operation: "submit")`. Then stop ordinary assignment work.

### Choose Refs From The Evidence

Use the visible source refs and producer labels to select known evidence directly with `freeflow_project` add. Prefer tool-result bodies for execution claims and exact visible assistant text (`#text`) when findings or drafts are themselves the object of judgment. A call envelope identifies an action, not its result body. Let the harness retain native dependencies and resolve eligible historical sources.

Use `freeflow_project inspect` to answer a specific selection question: which source supports a needed point when that is unclear, where its ref is after lengthy work, or what selection/representation gap remains after a failed addition. Choose the relevant scope and continue pagination while that question remains unresolved. Once the needed refs or selection facts are found, use them; the remaining candidate count is not a work queue. Inspection supplies metadata, not missing source bodies or proof of their relevance. Use known refs rather than guessing or rereading solely to manufacture new ones.

Select incrementally when useful, then reconcile the final set before submission. Keep the smallest sufficient set, including required methods and material counterevidence. For example, a final diff and discriminating check may support a correction without its setup commands and superseded intermediate edits; retain an earlier failure if it still changes the assessment. Summarize routine execution in the report rather than projecting each receipt or copying raw outputs into the report to evade selection.

No additional task-evidence selection is needed when Coordinator already has enough context and evidence, the result is self-contained, or an interrupted/blocked return honestly lacks it. Absence of an explicit request to project does not excuse missing support. With projection off, skip projection tools, not verification or honest reporting.

Optional Context Control cleanup may occur after promised evidence is prepared. Account for new reads or changed evidence before submitting. Batch already-decided selection changes and one return last only when the report does not depend on an unread receipt. Never combine new task work with a report that assumes its unseen outcome.

### Preserve A Blocked Or Interrupted Return

Do not delay cancellation or a required stop to run another read, test, or retrieval. Preserve available evidence through permitted handoff preparation. If evidence remains unavailable or selection is blocked, save a partial or blocked report with explicit gaps; do not force an unsupported `completed` outcome.

`reportSaved` is not configured, delivered, or assessed. If transfer is blocked, ordinary task work remains ended. Correct only the supported handoff problem, then use payload-free `freeflow_return(operation: "retry")` for the unchanged saved report. Use `submit` only for a deliberate report revision. Do not redo the investigation or repeat uncertain effects; reconcile them through supported controls.

## Coordinator: Assess The Result And Your Direction

Assess the report and evidence already received. Ordinary assessment requires neither `inspect` nor `assess`. The `assess` operation restores a suspended assessment's evidence obligation; it does not perform judgment or accept the result.

For a material claim, compare the accepted property, actual observer, decisive assertions, candidate identity, and result. A confident report or green suite cannot supply a missing link. Keep unsupported required claims open and stop dependent work.

Also ask whether your direction served the user's outcome: did it leave a consequential decision implicit, impose an unnecessary mechanism, choose the wrong observer, or size the assignment poorly? Consider whether the projected context supports understanding and the next decision or mostly repeats the execution trail; use that distinction to improve later requests and selection feedback without withholding needed evidence or starting a cleanup round solely to reduce the count. Accept a simpler valid implementation without demanding your preferred style. For a consequential design choice, assess its actual realization, not merely a claim that the spec was followed.

Reuse adequate verification and Executor self-review. Use [Review Work](../../skills/review-work/SKILL.md) or [Review Artifact](../../skills/review-artifact/SKILL.md) when their judgment method is needed; load it when absent. A separate independent review remains a Workflow decision, not an automatic handoff step.

Choose the next action from the actual gap:

- **Supported result, covered work remains:** assign the next coherent result.
- **Existing evidence omitted:** seek supported selection/delivery correction before new investigation.
- **Missing or inadequate observation:** request the discriminating evidence, preserving the required property.
- **Supported defect:** explain the correction and affected checks.
- **Invalidated approach or unclear cause:** revise the affected direction or investigate; do not repeat the same demand more forcefully.
- **User-owned choice:** discuss through Workflow or Decision Gate before dependent work.
- **Outcome complete or deliberately stopped:** close with an honest disposition.

Carry supported lessons into later contracts. Add precision where misunderstanding occurred; keep freedom where execution was sound. Repeated failure needs a changed premise, observer, contract, working set, or mechanism—not lower acceptance or an endless repair loop. Changing user-controlled compute configuration remains a separate decision.

Use `freeflow_unit(close)` as Coordinator only when the required result and evidence are supported and applicable checkpoints and contradictions are resolved, or record an authorized cancelled/deferred outcome without claiming completion. Closing a unit does not complete a Working Record task, delete relevant history, or authorize delivery, commit, release, or deployment. Continue covered work to the user's agreed boundary, not merely to an internal handoff.

## Handle Input, Context, And Recovery

Under Automatic control, Coordinator owns substantive user interpretation, discussion, decisions, and reporting. New natural-language input, including "continue," goes through Coordinator. If it reaches an already prepared Executor request, honor restrictions immediately, stop task work, and return the available partial state. Runtime State refreshes do not trigger this interruption rule.

Native tool responses and technical retries continue within the assignment. `/freeflow resume` is an explicit user control for eligible interrupted work after reconciliation, not permission to release a manual hold or resume ordinary work after a saved return. Releasing Manual control returns responsibility for reconciliation to Coordinator.

After context loss or uncertain continuity, recover control, current responsibility, applicable contract/report, user direction, partial effects, evidence limits, and stop conditions. Reload missing methods. When a Working Record exists, follow [Track Work](../../skills/track-work/SKILL.md) for complete `full` recovery and current-source reconciliation; record and evidence reads remain Executor work. Do not combine a superseded stopping instruction with a newer contract.

Attach recovery to the existing responsibility. Outstanding assignments recover through their supported continuation. Returned work may use an attached recovery-only phase only if the runtime actually exposes it; otherwise inspect saved communication and stop if insufficient. Do not simulate recovery by replacing the assignment or report. A separate recovery assignment is appropriate only when no existing assignment or assessment needs preservation.

Use `freeflow_unit(assess)` when a suspended assessment becomes the intended activity again. Failed restoration leaves the gap open. Suspension pauses additional evidence restoration, not the relevance of ordinary admitted history. Navigation does not roll back files, processes, or task memory; historical instructions do not grant current authority.

When Context Control is effective, read its method before managing your own view. Either profile may reduce obsolete or redundant material without losing current direction, contrary findings, or promised evidence. Cleanup is optional and never changes the other profile's view, canonical history, or evidence membership. Prepare promised originals first; if cleanup fails, retain the extra context and continue the valid handoff. Do not discard useful communication merely because a unit closed.

## ACT_BOUNDED: Inseparable Judgment And Action

Beyond permitted routing, instructional reads, and view-local context operations, direct Coordinator environment work requires both inseparable judgment/action and a concrete material loss from delegation. Task size, convenience, fewer switches, preference for the stronger model, or failed recovery is insufficient.

Synthesis may qualify when the requested artifact is the governing judgment itself and a decision-complete contract would already contain essentially the artifact. Sensitive result-by-result intervention may also qualify. Separable gathering, routine checking, and ordinary implementation remain delegated.

Before acting, state ACT_BOUNDED with the scope, expected result, existing authority, stop condition, inseparable judgment, and delegation loss. Stay within it; end on completion, interruption, context loss, changed applicability, or before delegating again. It grants no permission and does not create, transfer, or close routing responsibility.

Stop applying the automatic split when control becomes Manual or routing becomes inactive. Preserve unfinished responsibility honestly and follow ordinary Workflow.
