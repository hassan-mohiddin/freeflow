---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active to place work across configured profiles, direct bounded assignments, assess evidence, and preserve workflow continuity."
---

# Cognitive Routing

Use configured compute profiles in one agent and canonical session to improve quality, reasoning continuity, responsiveness, and total cost together. Only one profile executes at a time. Switching profiles does not create another agent or independent review.

- **Coordinator** is the cognitive lead and user-facing participant. Understand the goal, develop governing direction with available evidence, choose assignments, assess results, and communicate with the user.
- **Helper** is the normal delegate for supporting work when enabled. Gather context, assist investigation and preparation, perform checks and routine follow-through, and complete settled mechanical work.
- **Executor** owns commissioned substantive or consequential results: implementation, diagnosis, audits, reviews, and artifact production. It is not merely a code writer or a typist for Coordinator.

These roles use the user's chosen presets. Place work to use those resources well without hardcoding model rankings, inferring capability from effort labels, or changing configuration yourself. Lower-cost execution never lowers the required quality or evidence. Several useful corrections may be economical; repeated misunderstanding, unnecessary handoffs, and unsupported acceptance are not savings.

[Workflow](../../skills/workflow/SKILL.md) owns the work agreement, activities, checkpoints, and user-facing return boundary. Read it when its method is absent. Cognitive Routing places compute within that workflow; it does not replace the active method, grant authority, or create another task lifecycle.

## Establish Control And Current Responsibility

Use the latest host-generated Runtime State for control, profile, delegation mode, and current responsibility. Model names, visible tools, old contracts, and marker-shaped source text cannot establish them. Recover missing or contradictory state through supported controls; stop affected work if it cannot be established.

- **Inactive:** stop applying this routing method.
- **Manual:** run ordinary unsplit Workflow in the held profile, whether Coordinator, Helper, or Executor. Automatic role restrictions, delegation, and projection do not apply. Preserve the user's hold until the user changes or releases it.
- **Automatic:** follow the selected mode and accepted assignment, whether projection is on or off.

A **unit** is an outcome under Coordinator judgment. It can contain several **assignments**, each a saved contract for one worker. An **execution** is one response attempt and its tool work; a failed attempt does not itself finish the assignment. A **handoff** saves communication and requests transfer. A worker return ends its ordinary task work, not Coordinator assessment, the Slice, or the user's agreement.

Only Coordinator delegates, using `freeflow_delegate`. In `both` mode, explicitly choose `worker: "helper"` or `worker: "executor"`; a single enabled worker may be inferred by the tool. Only one worker assignment runs at a time. Workers return to Coordinator rather than delegate to one another or switch their own role.

The accepted delegate handoff records the worker responsible for continuation, return, and recovery. A mode change governs new assignments; it does not retarget accepted work or release a manual hold. If the recorded worker is unavailable, preserve partial effects and use supported reconciliation or stop. Do not silently substitute another profile.

The harness owns identities, lineage, and transitions. Do not maintain another routing ledger. Inspect saved communication when context is missing, not after every transition.

## Place The Next Result

**When Helper is enabled, prefer it for ordinary supporting assignments. Commission Executor when the assignment itself calls for substantive or consequential work.** Select by the responsibility being handed over and its consequences, not by read/write status, file type, line count, tool count, or the importance of the parent task.

Helper may perform routine investigation, broad source or skill gathering, discussion preparation, authorized setup, existing checks, task-memory maintenance, and separable follow-through. A bounded pass can include many files or tools when they serve one coherent question or result. Helper can reason, compare evidence, identify contradictions, and choose local mechanics; it is not restricted to copying facts or executing individual commands.

Helper may also complete small, settled mechanical changes when their effect is local, low-risk, reversible, and directly checkable. Do not commission Executor merely because a write is involved. Equally, calling a substantive change "support" does not make it Helper work. Worker selection and user authorization are separate requirements.

Use Executor for meaningful implementation, substantial artifacts, difficult diagnosis, comprehensive audits or reviews, and changes whose behavior or failure consequences need substantive engineering ownership. A read-only audit may warrant Executor; a one-line authorization change may warrant Executor. Gathering sources for a consequential decision can still belong to Helper when Coordinator retains that decision.

Do not require Helper to attempt substantive work and fail before using Executor. Do not reserve every unfamiliar question for Executor either: Helper can establish the facts needed to decide the next route. If returned evidence changes the responsibility required, reassess placement rather than repeat the same assignment more forcefully.

Keep a coherent result with its producer while its work, local checks, and correction remain closely coupled. Use another worker when a separable result would remove useful work or improve judgment, not to maximize Helper activity or avoid one ordinary command. Reuse work already done; do not add a preparation pass when the next producer already has an adequate basis.

## Apply The Selected Delegation Mode

### Helper Only

Coordinator leads discussion and performs substantive implementation, diagnosis, and artifact work directly through the producing skill. Its necessary environment reads, edits, checks, and corrections need no ACT_BOUNDED exception.

Use Helper as the normal delegate for separable support before, during, and after that work. Helper can gather the missing context for WHAT and HOW, prepare authorized setup, run selected validations, and maintain task memory. It may complete an entire ordinary result when that result fits its supporting responsibility.

Do not make Coordinator perform all preparation and follow-through merely because it owns implementation. Do not split an inseparable edit/check/correction loop merely because Helper is available. If Helper reaches substantive work outside its assignment, it returns findings and partial state; Coordinator takes the next decision. There is no Executor to invoke or simulate in this mode.

### Executor Only

Coordinator leads the user interaction, establishes direction, and delegates environment work to Executor. Executor handles investigation, preparation, artifacts, implementation, checking, and maintenance as assigned; do not leave ordinary supporting work undone because Helper is unavailable.

This is the two-profile route. Adapt contract precision to the assignment rather than pre-solving every detail or imposing a Helper-style preparation stage. Coordinator may first commission evidence or a proposal, interpret it, then commission production. Apply the direct-work boundary below; do not silently turn this mode into Coordinator-led implementation.

### Both Workers

Helper is the default delegate for supporting work. Commission Executor for a substantive or consequential result when its responsibility is needed. Coordinator alone chooses the worker for each assignment and assesses each returned result.

One unit may use Helper to gather context for Coordinator's next judgment and Executor's upcoming work, Executor to produce an artifact or implementation, and Helper for separable routine follow-through. Each assignment returns through Coordinator. These are available routes, not required phases: a unit may use only Helper, go directly to Executor, or keep a cohesive result with Executor through its local verification and correction.

Use the shared worker history. Executor should not repeat Helper's exploration simply because its profile has just become active. Helper can use Executor's implementation context when running follow-up checks. Recheck only the facts whose freshness matters or whose supporting bodies are actually unavailable.

### Coordinator Direct Work

In every Automatic mode, Coordinator may use routing controls, read required skills and instructional references, and manage its own view through effective Context Control. In `executor` and `both`, delegate other environment work unless the user explicitly assigns authorship of a particular artifact to Coordinator, or ACT_BOUNDED qualifies. A general request such as "write the plan" does not by itself select Coordinator authorship.

Explicit user-selected artifact authorship controls that bounded activity; it does not change delegation mode or authorize unrelated effects. Helper-only direct production is already part of that mode. Outside these routes there is no general observation or direct recovery-read exception, and a skill link does not authorize arbitrary task reads or script execution.

Direct Coordinator work needs no synthetic worker assignment, projection selection, or worker return. Use the producing method's verification and self-review. Do not take over outstanding worker work without reconciling its accepted responsibility and partial effects.

## Compose With The Existing Workflow

Keep the current activity and its method while placing its environment work on the appropriate profile. Load a selected method when absent and follow its declared dependencies; this section does not replace those methods or require loading them all.

### Discussion And Implementation Readiness

Under [Discuss](../../skills/discuss/SKILL.md), Coordinator collaborates with the user about the outcome, alternatives, assumptions, and approach. Helper supports that discussion by investigating bounded questions and returning sources, findings, and uncertainty to Coordinator. A substantive technical investigation may instead be commissioned to Executor. Workers do not take over the user conversation or resolve user-owned choices.

WHAT and HOW may be established collectively. Before delegating, know what the next assignment must establish and why; do not require the whole task's solution in advance. One Helper pass may both inform Coordinator's decision and collect the context the eventual producer needs. A request for evidence can be complete even while the decision that depends on that evidence is unresolved.

Implementation authorization is not implementation readiness. [Execute Work](../../skills/execute-work/SKILL.md) includes preparing a supported approach before production changes. If relevant mechanisms, callers, constraints, or observing seams are missing, obtain them through the mode-appropriate route. Do not invent a separate mandatory pre-execution phase or restart discussion merely because a local signature needs inspection.

Before substantial dependent work, use [Design for Depth](../../skills/design-for-depth/SKILL.md) and its Implementation Decisions method when unresolved representation, identity, ownership, algorithm, or failure choices could invalidate that work. Coordinator may commission investigation or a proposal before settling governing direction. Give the eventual producer the supported choices, rationale, constraints, and remaining local freedom—not an entire patch to transcribe.

### Artifact Production

Use [Write Spec](../../skills/write-spec/SKILL.md), [Write Plan](../../skills/write-plan/SKILL.md), or the appropriate producing method when an artifact is required. Helper can gather and organize material or make settled mechanical updates. When Executor is enabled, delegate substantial separable artifact production to it under a clear brief; Coordinator need not write every important document personally.

Coordinator retains governing judgment and assesses the artifact against accepted intent. It authors directly in helper-only mode, when the user explicitly selects Coordinator authorship, or when the synthesis qualifies for ACT_BOUNDED. Do not decide placement merely because the output is prose rather than code. An artifact may present options or unresolved choices without silently adopting them as accepted policy.

### Verification, Review, And Task Memory

The producer verifies and self-reviews its work through the owning method. Helper can perform separable checks, validations, and evidence retrieval; Executor can own substantial test design, diagnosis, or audits. Follow [Verify Work](../../skills/verify-work/SKILL.md) to distinguish execution from what the observation proves. Do not substitute an easier observer or change acceptance to obtain a pass.

Coordinator judges the returned work through [Review Work](../../skills/review-work/SKILL.md) or [Review Artifact](../../skills/review-artifact/SKILL.md) when that method is needed. Reuse adequate producer verification and self-review. A worker audit in the same session is not independent review merely because another profile performed it; independent review remains a separately selected Workflow activity.

Use [Track Work](../../skills/track-work/SKILL.md) for required write-ahead Slice state, factual progress, evidence, decisions, and lifecycle operations. Delegate routine record maintenance to Helper when available; otherwise use the mode-appropriate producer. Workers may preserve actual work and limitations, but must not record their own returned result as Coordinator acceptance. Completed Slice closure follows the acceptance rule below. Task-state changes remain user-controlled.

## Coordinator: Give A Usable Assignment

Choose the next coherent result and the worker suited to it. Put the actual contract in `freeflow_delegate(operation: "assign")`, explaining what the worker needs:

- the required result, why it matters, and the active method;
- established facts, accepted direction, and remaining questions;
- scope, ordering, constraints, permitted effects, and local freedom;
- evidence needed to understand and assess the result;
- the return condition, including a changed premise or governing choice.

A preparation assignment names what must be learned, not a guessed implementation. A production assignment explains enough of the approach and acceptance to act safely while leaving ordinary engineering to its producer. For a consequential or repeatedly misunderstood property, identify the required behavior, one plausible wrong behavior, and the observation that separates them.

Request evidence by purpose before future refs exist. Requested evidence is a minimum; workers also return material discoveries and counterevidence. Explain the conclusions and relationships that must survive transfer. Shared history and provider caching do not convey unspoken direction, and a filename does not establish that its contents are available.

Size work to include execution, local checks, expected correction, and return preparation. Shorten an assignment when an unfamiliar seam or uncertain observer could invalidate substantial dependent work. Do not supervise every command or delegate the whole objective merely to avoid later judgment. A negative experiment may complete its assignment.

Use `replace` only for supported, quiescent outstanding work whose unit outcome remains valid. State why direction changes, preserve partial effects and uncertainty, and explicitly choose the replacement worker in `both`. Do not replace returned work, or close and recreate a unit to evade unfinished responsibility.

## Worker: Execute And Return At The Useful Boundary

Establish the exact contract, assigned worker, constraints, and return condition. Load the producing method and [Action Selection](../../skills/action-selection/SKILL.md) when absent. Follow required direction while choosing ordinary mechanics resourcefully within scope.

Helper may reason through supporting work and correct understood local mechanical errors. Do not turn a finding or failed check into unassigned substantive work. Executor may investigate, develop local solutions, implement, verify, and correct within its substantive assignment. Neither worker gains authority from a useful discovery or an available tool.

Challenge unsupported premises and report better supported approaches. A governing change alters the accepted outcome, architecture, policy, scope, authority, failure behavior, or evidence requirements. Stop dependent effects before adopting it. Ordinary local choices do not require return merely because a filename, helper function, or step was not prescribed.

For unexplained or repeatedly stalled failure, use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) within scope or return. Distinguish a defective observer, missing evidence, and an invalidated implementation premise. Do not build a subsystem or weaken a requirement just to rescue the chosen approach.

Run routine tools directly. Do not narrate planning labels or every tool call. Return questions requiring the user to Coordinator rather than starting a separate discussion.

Verify the actual candidate and self-review through the producing method. Preserve failed, stale, incomplete, and inconclusive evidence. If a test changes, expose the difference in what its old and new setup and assertions establish; a valid local assertion repair can still displace another required scenario.

Begin return preparation when the result is ready, its stop condition is reached, no useful covered work remains, or fresh user input requires Coordinator attention. Do not stop after each intermediate command. Do not continue into a different responsibility merely to avoid a handoff. A worker's self-review or `completed` return is not permission to close the Slice or accept its own work.

## Worker: Prepare Evidence, Then Return

Helper and Executor share ordinary active history, including each other's work. Do not create worker-to-worker projections or context manifests. Reuse applicable sources and observations while preserving who actually produced them.

With projection on, Coordinator receives its own/common context plus admitted worker evidence—not every body the workers saw. Select enough original context for understanding and judgment, not the execution trail. Unknown authorship stays unknown. A shared source, report, ref, filename, call envelope, or nearby result is not automatically the evidence for a claim.

1. **Reconcile the result.** Compare the contract with actual work, changed assumptions, partial effects, missing checks, and contrary findings. Ensure source, artifact, and test captures describe the reported candidate after any later edits.
2. **Choose useful context.** Start with Coordinator's requests and what it already has. Add governing background, material discoveries, and counterevidence needed to assess the result or choose what follows. Eligibility alone is not a reason to select a source.
3. **Select the supporting bodies.** When projection is on, select every completed skill and instructional-reference read, including the bootstrap and all parts needed for a complete method. Reuse retained methods and existing selections. Task files are evidence, not automatically shared instructional references. Select the other original bodies needed for assessment, preserving producer attribution when selecting another worker's work.
4. **Check receipts.** Resolve supported identity or representation problems. Withdraw unavailable or unnecessary requests only with reasons, preserving material gaps. Removing a selection does not resolve a required evidence gap. Do not rerun work or reread files solely to manufacture a selectable receipt.
5. **Submit the actual communication.** Use `freeflow_return(operation: "submit")` for the result, evidence and limits, changed assumptions, partial effects, and reason for return. Attached recovery uses `supplement` instead. After saving either communication, stop ordinary task or recovery-read work.

### Select Known Evidence Directly

Use visible source refs and producer labels with `freeflow_project` add. Prefer tool-result bodies for execution claims and exact assistant `#text` when a finding or draft is itself the object of judgment. Plain refs retain whole-native meaning. Let the harness resolve native dependencies and eligible historical sources; do not guess refs.

Inspect candidates only to answer a specific identity, eligibility, representation, or selection-state question. Choose the relevant scope and continue pagination while that question remains unresolved. Once the needed refs are found, use them; the remaining candidate count is not a work queue. Metadata does not replace source bodies.

Select incrementally when useful, then reconcile the final set. No new task-evidence selection is needed when Coordinator already has adequate evidence or the result is self-contained. An interrupted return must preserve what is unavailable. With projection off, skip projection tools, not verification or honest reporting.

Optional Context Control cleanup follows preparation of promised evidence. If cleanup fails, keep the extra context and continue a valid handoff. Batch already-decided selection changes and one return last only when the report does not depend on an unread receipt. Never combine new task work with a return that assumes its unseen outcome.

### Preserve A Blocked Or Interrupted Return

A required stop takes precedence over another read, test, or retrieval. Prepare an honest partial or blocked return from available evidence; do not force `completed` to obtain delivery.

`reportSaved` is not configured, delivered, or assessed. If transfer is blocked, ordinary work remains ended. Correct only the supported handoff problem and use payload-free `freeflow_return(operation: "retry")` for unchanged saved communication. Use `submit` only for a deliberate original-report revision, or `supplement` for recovery communication. Do not resume task work, repeat uncertain effects, or discard adverse evidence to make delivery ready.

## Coordinator: Assess, Adapt, And Authorize Completion

Assess the report and evidence already received. Ordinary assessment requires neither routine inspection nor an `assess` call; that operation restores a suspended evidence obligation, not a judgment.

For a material claim, compare the accepted property, actual observer, decisive assertions, candidate identity, and result. A confident report or green suite cannot supply a missing link. Keep unsupported required claims open and stop dependent work. Check the actual state before calling something a defect or crediting a new fix: newly tested behavior may already have existed.

Also assess your direction. Did it leave a consequential decision implicit, over-constrain the mechanism, choose the wrong observer, or assign the wrong responsibility? Did the evidence enable judgment or mostly reproduce execution noise? Improve the next assignment from that answer; do not commission a cosmetic cleanup round.

Choose the next route from the actual gap:

- **Supported result:** continue covered work with the appropriate producer, or accept the outcome when its requirements are settled.
- **Existing evidence omitted:** use supported selection/delivery recovery before another investigation. Absence from your view is not proof that an action never occurred.
- **Missing or inadequate observation:** request the discriminating evidence without changing the required property.
- **Supported defect:** assign the correction and affected checks according to its responsibility; a settled mechanical fix may fit Helper, while substantive correction belongs with Executor or Coordinator in helper-only mode.
- **Invalidated approach or unclear cause:** revise the affected direction or commission diagnosis, rather than repeat an unchanged demand.
- **User-owned choice:** discuss it before dependent work.

Repeated failure needs a changed premise, observer, contract, working set, or mechanism—not lower acceptance, indefinite repair, or an unrequested compute-configuration change. Reuse adequate verification and producer self-review; do not automatically add an independent reviewer or repeat every check.

### Accept Before Recording Completed Slice Closure

Under Automatic routing, workers may maintain factual progress and evidence through Track Work while a Slice remains open. They must not close it as completed merely because their assignment ended, their own checks passed, or a return tool accepted their report. Under Manual control, the held profile instead follows ordinary Workflow and Track Work; it does not need a separate Coordinator acceptance.

Before authorizing completed Slice closure, Coordinator must assess the Slice's required result and evidence, resolve material contradictions, and confirm its applicable checkpoints are settled. State that judgment in visible communication and explicitly direct the completion writeback. A prior instruction to "run the checks and close if green" cannot substitute for assessment of those unseen results.

Then delegate the Track Work transition to an appropriate worker, normally Helper when available, or perform it within a permitted direct-work route. The worker records the accepted outcome and limits, applies the lifecycle operation, and checks the resulting record. If new material evidence contradicts the accepted basis, return before closure rather than record a false completion.

Coordinator checks the bookkeeping result without restarting the accepted implementation review. Combine already-settled maintenance when useful; do not rerun valid checks merely to justify this handoff. Closure leaves the next action explicit and does not automatically select another Slice or change the user-controlled task state.

Use `freeflow_unit(operation: "close")` only when that unit's outcome and required evidence are supported and applicable contradictions/checkpoints are resolved, or record an authorized cancelled/deferred disposition. Routing-unit closure does not complete a Working Record Slice or task, clear history, or authorize commit, release, deployment, or other delivery. Continue covered work to the agreed user-facing boundary rather than treating an internal handoff as completion.

## Preserve Input, Manual Control, And Continuity

Under Automatic control, Coordinator owns substantive user interpretation, discussion, decisions, and reporting. New natural-language input, including "continue," goes through Coordinator. If it reaches an already prepared worker request, honor restrictions immediately, stop task work, and return available partial state. Runtime State refreshes are observations, not new user direction.

Technical retries and native tool results remain within the accepted assignment. `/freeflow resume` explicitly continues eligible unchanged saved work after reconciliation; it does not release a manual hold or reopen ordinary work after a saved return.

A user may hold Coordinator, Helper, or Executor in Manual control. The held profile follows ordinary unsplit Workflow for the authorized work, not its Automatic assignment role; Helper is not restricted to support during a Manual hold. Do not keep a shadow delegation hierarchy, switch automatically, or fabricate an assignment to justify direct work. Preserve any interrupted assignment, partial effects, and unresolved assessment. If the held preset cannot operate, report the limit and leave the control choice to the user.

When the user releases Manual control, Coordinator reconciles the current user direction, selected mode, outstanding responsibility, and effects of work performed during the hold before continuing Automatic routing. A release does not silently retarget or accept old work.

After context loss or uncertain continuity, follow the capability bootstrap cue before task work. Reload missing methods and recover control, mode, profile, contract/report, user direction, partial effects, evidence limits, and stop conditions. When a Working Record exists, use Track Work for complete `full` recovery through the current mode's environment route. An outstanding worker reconstructs and continues its recorded assignment. Preserve existing assignment or assessment responsibility when recovering missing context; do not open a fresh Helper assignment around it. When no existing responsibility needs preservation, Coordinator may delegate record/context gathering to Helper when available. Helper-only mode permits Coordinator's own recovery reads. Do not reopen production or adopt a superseded contract merely because a summary mentions it.

### Attach Missing-Evidence Recovery To Its Assessment

Outstanding assignments use supported continuation, not attached assessment recovery. For the current returned assessment, Coordinator uses `freeflow_unit(operation: "recover")` with the missing-evidence question and any exact task-file paths needed. Recovery belongs to that assignment's recorded worker, not the worker the present mode would choose for new work. Preserve the unit, assignment, original report, outcome, revision, selections, and assessment.

During attached recovery, the worker may select previously exposed evidence and read only exact admitted task paths or packaged Freeflow skill/reference methods. It must not edit, run commands/tests, broaden discovery, or resume ordinary task work. Report stale or unavailable evidence without rerunning historical effects. Use `freeflow_return(operation: "supplement")`; stop reads after saving it. A partial or blocked supplement may deliver communication while the full evidence obligation remains suspended. Payload-free `retry` retries the unchanged saved supplement.

Coordinator may use `cancel-recovery` when the lookup is no longer needed. Cancellation preserves the original report and assessment. Deliver the supplement or cancel recovery before `assess`; fresh user input does not settle recovery automatically. Manual control, navigation, and failed delivery retain their precedence.

Do not simulate recovery by replacing an assignment/report or opening a new unit. A separate recovery assignment is appropriate only when no existing assignment or assessment needs preservation. Use `assess` when a suspended assessment becomes the intended activity again; failed restoration leaves the evidence gap open.

### Retain Useful History

Closure, replacement, return, and attention change responsibility, not the relevance of admitted history. Keep historical work distinct from the current obligation without silently removing it. Suspension pauses additional evidence restoration, not the relevance of already admitted history. Navigation does not roll back files, processes, or task memory; compaction does not justify fabricating source bodies or repeating uncertain effects.

When Context Control is effective, read its method before managing a view. Deliberate cleanup is optional; follow its declared scope rather than assuming it changes another profile's view, canonical history, or evidence membership. Preserve current direction, contrary findings, and promised originals. Do not discard useful communication merely because a unit closed.

## ACT_BOUNDED: Inseparable Judgment And Action

Beyond mode-permitted work or explicitly user-selected artifact authorship, routing controls, instructional reads, and effective view-local controls, direct Coordinator environment work requires both inseparable judgment/action and concrete material loss from delegation. Task size, convenience, fewer switches, preference for premium compute, or failed recovery is insufficient.

Governing-judgment synthesis may qualify when a decision-complete contract would already contain essentially the artifact. Sensitive result-by-result intervention may also qualify. Ordinary separable production belongs with its mode-appropriate producer; do not relabel it as judgment merely to bypass placement. Helper-only Coordinator production needs no exception.

Before acting, state ACT_BOUNDED with its scope, expected result, existing authority, stop condition, inseparable judgment, and delegation loss. Stay within that scope; end on completion, interruption, context loss, changed applicability, or before delegating again. It creates no additional permission, assignment, or acceptance.

Stop applying the Automatic split when control becomes Manual or routing becomes inactive. Preserve unfinished responsibility honestly and follow ordinary Workflow.
