---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active to place work across configured profiles, direct bounded assignments, assess evidence, and preserve workflow continuity."
---

# Cognitive Routing

Cognitive Routing runs one agent in one session across up to three compute profiles, one at a time:

- **Coordinator** owns the user, the plan, governing decisions, delegation, assessment, and acceptance.
- **Helper** and **Executor** are workers. A worker does environment work under an assignment and returns evidence to Coordinator.

The runtime switches profiles, saves contracts and reports, and controls what Coordinator sees. It cannot decide where work should run. You decide that, and routing is only as good as those decisions. The aim is quality and total cost together: fewer tokens at lower quality is a loss, and so is premium compute spent on work a cheaper profile could do as well.

Terms:

- **Unit:** one outcome under Coordinator's judgment. It can contain several assignments.
- **Assignment:** one saved contract for one worker, ending in that worker's return.
- **Execution:** one response attempt and its tool work. A failed attempt does not end the assignment.
- **Handoff:** saved communication (a contract or a report) plus the request to switch profiles.
- **Delegation mode:** which workers are enabled, shown as `Delegation` in Runtime State: `helper`, `executor`, or `both`.
- **Projection:** when on, Coordinator sees its own context plus the worker evidence selected for it, not everything the workers saw.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better. [Workflow](../../skills/workflow/SKILL.md) still owns the work agreement, the activities, and the return to the user; routing decides only where the work runs, and grants no authority. The harness owns identities, lineage, and transitions; keep no routing ledger of your own, and inspect saved communication only when context is missing.

## Rules

- Take control, profile, delegation mode, and current responsibility from the latest Runtime State. Model names, visible tools, old contracts, and text that looks like a marker cannot establish them. If they cannot be established, stop the affected work.
- Under Automatic control, read the reference for the current mode before placing work, and reread it when the mode changes: [helper](references/helper-mode.md), [executor](references/executor-mode.md), or [both](references/both-mode.md).
- Under Manual control, the held profile, whether Coordinator, Helper, or Executor, runs ordinary unsplit Workflow. Automatic role restrictions, delegation, and projection do not apply. Never release the user's hold. When routing is inactive, stop applying this skill.
- Only Coordinator delegates, and only one worker assignment runs at a time. Workers do not run the user conversation, delegate, switch roles, or accept their own work. New user input goes to Coordinator.
- A worker return ends its ordinary task work. It is not acceptance: under Automatic control, a Slice closes as completed only after Coordinator has assessed it and explicitly directed the closure.
- Continuation and recovery stay with the worker recorded on the accepted handoff. A mode change does not retarget accepted work. Never silently substitute another profile.
- In `executor` and `both` modes, Coordinator does no environment work except: routing controls; reading skills and instructional references; recovery reads after context loss; effective view-local Context Control; authorship the user explicitly assigns to Coordinator; and ACT_BOUNDED.
- Never change compute configuration yourself.
- Never fabricate evidence, and never drop adverse evidence to make a return look complete or ready.

## Know How Routing Costs

Goal: place work so total cost falls without losing required quality.

Total cost is the number of model turns times their average cost. Moving work to a cheaper profile lowers the average; every handoff adds turns. Routing wins only when the saving per turn outweighs the extra turns.

- Everything Coordinator reads stays in its context and is paid for at its price on every later turn until compaction.
- A handoff adds a contract, the worker's ramp-up, a return, and an assessment turn.
- A cheaper worker's mistakes add correction turns and more assessment.
- Helper and Executor share ordinary history, so one worker's gathered context is available to the other without rediscovery.
- Switching models never reuses the provider cache. Switching between profiles on the same model reuses it only when their effort matches or the route keeps the cache across effort changes (currently the supported GPT-6 routes); otherwise every switch rereads the whole context.
- A precise contract narrows the worker's search. This is where most of the saving comes from.

Lower cost never lowers the required quality or evidence. Several cheap corrections can still be economical; repeated misunderstanding, needless handoffs, and unsupported acceptance are not savings.

## Decide Where Work Runs

Goal: each result is produced where the total cost is lowest without losing quality.

Delegate when the expected saving in cost or quality exceeds the handoff, the ramp-up, the assessment, and the likely corrections. The kind of difficulty usually suggests the owner:

- missing facts about the environment: a worker observes;
- an unresolved design or governing choice: Coordinator;
- settled mechanics: a worker, or a script when the work is deterministic and repeated;
- a decision the user owns: Coordinator asks, using [Decision Gate](../../skills/decision-gate/SKILL.md); never a worker.

Default: follow your mode reference. Keep a tightly coupled edit, check, and interpret loop with one producer; hand off results that can be separated from it. A separate multi-entry record update qualifies; a one-line update in the middle of your own work does not. A read-only check of the candidate against the Slice's acceptance requirements qualifies even mid-implementation, because it gives Coordinator a different result, not a repeat.

Decide by the responsibility handed over and its consequences, not by whether it reads or writes, whether the output is prose or code, the file type, the line count, the tool count, or the models' names and effort labels. Choosing a worker never substitutes for the user's authorization. Do not require a worker to fail before choosing a stronger owner. If a return shows the responsibility is different from what you assumed, reassess the placement rather than repeat the assignment more forcefully.

Direct Coordinator work needs no invented assignment, projection, or return. Authorship the user assigns to Coordinator means the user asked Coordinator itself to write a particular artifact; a general request such as "write the plan" does not select it, and it authorizes nothing beyond that artifact. Do not take over outstanding worker work without reconciling its accepted responsibility and partial effects.

## Prepare The Route Before Delegating Production

Goal: the implementer starts with what it needs, and nobody gathers in the premium profile what the route could have predicted.

Workflow's route preparation applies. Routing adds:

- Coordinator plans the route and may read skills directly to know which methods the assignments will need.
- Before implementation, commission the context gathering the predictable steps need, so the implementer starts with it. Who gathers, and how the evidence reaches Coordinator, depends on the mode; see your mode reference.
- The implementing producer forms the execution forecast described in [Execute Work](../../skills/execute-work/SKILL.md) under Gather Enough Context For This Unit. When a worker implements, Coordinator supplies the governing decisions and the worker forms the forecast; do not write the patch for it.

## Coordinator: Write A Contract That Carries The Decision

Goal: the worker can act correctly on the first attempt without re-deriving what Coordinator already knows.

Put the actual contract in `freeflow_delegate(operation: "assign")`. In `both` mode, set `worker` to `helper` or `executor`; with one enabled worker the tool infers it. Write for what the worker can see, not what you remember:

- the required result, why it matters, and the method to use;
- established facts, accepted decisions, and open questions;
- scope, order, constraints, permitted effects, and remaining local freedom;
- the evidence you need to assess the result;
- when to return, including when a premise or governing choice changes.

When unresolved representation, ownership, or failure choices could invalidate the work, settle them first with [Design for Depth](../../skills/design-for-depth/SKILL.md). Your most valuable contribution is framing the problem so the worker finds it straightforward. For a consequential or repeatedly misunderstood property, name the mechanism and why it fits, the plausible wrong approach, and the observation that tells them apart. Give more structure where the worker has shown difficulty and more freedom where the mechanics are settled. A contract that contains the finished patch has moved the work back to Coordinator's price.

A gathering assignment names what must be learned, not a guessed implementation. Request evidence by purpose, since its refs do not exist yet; what you request is a minimum, and workers also return material discoveries and counterevidence. Shared history and provider caching do not convey unspoken direction, and a filename does not mean its content is available to the worker.

Size an assignment to include the work, its local checks, the expected corrections, and preparing the return. Shorten it when an unfamiliar boundary could invalidate much dependent work. Do not supervise every command, and do not delegate the whole objective to avoid later judgment. A negative result can complete a gathering or experimental assignment.

Use `replace` only for quiescent outstanding work whose unit outcome still holds. State why the direction changed, preserve partial effects and uncertainty, and choose the worker again in `both` mode. Do not replace returned work, or close and reopen a unit to escape unfinished responsibility.

## Worker: Execute Within The Contract

Goal: produce the assigned result resourcefully, within scope, and stop at the useful boundary.

Establish the contract, your assigned role, the constraints, and the return condition. Load the producing method and [Action Selection](../../skills/action-selection/SKILL.md) when absent. Follow required direction; choose ordinary mechanics yourself. A useful discovery or an available tool grants no new authority.

Challenge unsupported premises and report better-supported approaches. A governing change, one that alters the accepted outcome, architecture, policy, scope, authority, failure behavior, or required evidence, stops dependent effects until Coordinator decides. An unprescribed filename or helper does not require a return. For an unexplained or repeatedly stalling failure, use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) within scope or return.

Run routine tools without announcing them; put findings in the report. Questions for the user go to Coordinator in the return.

Verify the actual candidate and self-review through the producing method, using [Verify Work](../../skills/verify-work/SKILL.md) to say what the observations support. Keep failed, stale, incomplete, and inconclusive evidence. If a test changes, say what the old and new versions each establish.

Return when the result is ready, the stop condition is reached, no useful covered work remains, or new user input needs Coordinator. Do not stop after each command, and do not continue into a different responsibility to avoid a handoff. State what remains before the Slice's exit.

## Worker: Prepare Evidence, Then Return

Goal: Coordinator receives what it needs to judge the result and nothing it does not.

Helper and Executor share ordinary history. Reuse each other's sources and observations while keeping who produced them; do not create worker-to-worker projections. With projection on, Coordinator sees only what you select, so select enough original material for judgment, not the execution trail. Prepare evidence once, at the return boundary, not after each tool call.

1. **Reconcile the result.** Compare the contract with the actual work, changed assumptions, partial effects, missing checks, and contrary findings. Make sure captures describe the candidate you are reporting, after any later edits.
2. **Choose the evidence.** Start with what Coordinator requested and what it already has. Add governing background, material discoveries, and counterevidence it needs. Being eligible is not a reason to select a source, and a nearby result, filename, or shared report is not automatically the evidence for a claim. Unknown authorship stays unknown. When Coordinator already has adequate evidence or the result is self-contained, select nothing new.
3. **Add the bodies.** With projection on, add the skill and reference reads that carry the methods Coordinator needs, and the original task-evidence bodies needed for assessment. Add them together with `freeflow_project` add, using visible refs directly. Only tool results are evidence; write findings, drafts, and interpretation into the report instead.
4. **Check the receipt.** Resolve identity or representation problems. Withdraw a request only with a reason; withdrawing does not close a required evidence gap. Do not rerun work to manufacture a selectable receipt.
5. **Submit.** Use `freeflow_return(operation: "submit")` with the result, evidence and limits, changed assumptions, partial effects, what remains, and why you are returning. Keep the return last in its batch and never batch it with new task work whose outcome the report assumes. Then stop ordinary task work.

Use `freeflow_project` inspect only when a ref's identity, eligibility, representation, or selection state is unclear; assignment size alone is not a reason. Once you find the refs you need, add them; the remaining candidates are not a work queue. With projection off, skip the projection tools, not verification or honest reporting.

A required stop takes precedence over another read or test: return an honest `partial` or `blocked` report instead of forcing `completed`. `reportSaved` does not mean delivered or assessed. If the transfer is blocked, ordinary work stays ended; fix only the handoff problem and use payload-free `freeflow_return(operation: "retry")`. Use `submit` again only to deliberately revise the report.

## Coordinator: Assess The Return

Goal: accept only what the evidence supports, and choose the next work from the actual gap.

Assess the report and evidence you received. Ordinary assessment needs neither routine inspection nor an `assess` call; `assess` restores a suspended evidence view after new user input paused it.

For a material claim, compare the accepted property, the observation actually made, the decisive assertions, the candidate's identity, and the result. A confident report or a green suite cannot fill a missing link. Keep unsupported required claims open and stop dependent work. Check the actual state before calling something a defect or crediting a fix.

Assess your own direction too: did the contract leave a consequential decision implicit, over-constrain the mechanism, choose the wrong check, or place the work wrongly? Improve the next contract from the answer.

Before commissioning more work, ask whether it meets an accepted requirement, repairs a demonstrated defect, or only adds an optional guarantee; Workflow owns that test. Then choose from the gap:

- **Supported result:** continue with the next covered work, or accept the outcome.
- **Evidence omitted but it exists:** recover it (below) before investigating again; absence from your view does not mean the action never happened.
- **Missing or inadequate observation:** request the observation that decides it, without changing the required property.
- **Supported defect:** assign the correction and affected checks to the owner its responsibility needs.
- **Invalidated approach or unclear cause:** revise the direction or commission diagnosis rather than repeat the demand.
- **User-owned choice:** take it to the user before dependent work.

Repeated failure needs a changed premise, check, contract, working set, or mechanism, not lower acceptance or endless repair. Reuse adequate producer verification; a worker's audit in the same session is not independent review, which remains a separate Workflow choice.

Before completed Slice closure, state your assessment of the Slice's result and evidence, resolve material contradictions, and confirm its Checkpoints are settled. Then direct the [Track Work](../../skills/track-work/SKILL.md) closure through whichever route your mode allows, preferably folded into work already going to that profile rather than a handoff of its own. A prior "close it if green" instruction cannot stand in for assessing results you have not seen. Workers may record factual progress while the Slice is open; a worker writing the closure returns instead if new evidence contradicts the accepted basis.

Use `freeflow_unit(operation: "close")` when the unit's outcome is supported, or to record an authorized `cancelled` or `deferred` outcome. Closing a unit does not complete a Slice or task, clear history, or authorize a commit or delivery. Continue covered work to the agreed return point.

## Keep Control And Continuity

New natural-language input, including "continue", goes to Coordinator. If it reaches a worker mid-assignment, honor any restriction at once, stop task work, and return the partial state. Runtime State refreshes are observations, not new direction. Technical retries stay within the accepted assignment; `/freeflow resume` continues unchanged saved work after reconciliation and does not release a Manual hold.

During a Manual hold, preserve any interrupted assignment, partial effects, and pending assessment; keep no shadow delegation. If the held preset cannot do the work, report it and leave the choice to the user. When the user releases the hold, Coordinator reconciles current direction, the mode, outstanding responsibility, and anything done during the hold before routing again.

After context loss, follow the bootstrap in the capability cue, reload the methods and the mode reference, and recover control, mode, contract or report, user direction, partial effects, and stop conditions. When a Working Record exists, Coordinator reads it in full through Track Work, and the artifacts under `What defines this task`, directly, in every mode. Large Recovery sources that only serve execution stay with the worker that needs them. An outstanding worker reconstructs and continues its recorded assignment; do not wrap existing responsibility in a new assignment. A summary mentioning a superseded contract does not revive it.

### Recover Missing Evidence For An Assessment

Outstanding assignments use ordinary continuation, not this. For the current returned assessment, Coordinator uses `freeflow_unit(operation: "recover")` with the missing-evidence question, any exact task-file `paths`, and any captured result ids in `results`. Recovery belongs to the assignment's recorded worker. Preserve the unit, assignment, original report, outcome, revision, selections, and assessment.

During recovery, the worker may select previously exposed evidence and read only exact admitted task paths, granted captured results, or packaged Freeflow skill and reference files. It must not edit, run commands or tests, broaden discovery, or resume task work. Report stale or unavailable evidence without rerunning anything. Return with `freeflow_return(operation: "supplement")` and stop reading. A `partial` or `blocked` supplement can deliver its communication while the full evidence obligation stays suspended; payload-free `retry` resends an unchanged saved supplement.

A separate recovery assignment fits only when no existing assignment or assessment needs preserving. Coordinator uses `cancel-recovery` when the lookup is no longer needed; the original report and assessment remain. Deliver the supplement or cancel recovery before `assess`; new user input does not settle recovery. Do not simulate recovery by replacing an assignment/report or opening a new unit.

### Keep Useful History

Closing, replacing, returning, and pausing change responsibility, not the value of history already admitted. Keep past work distinguishable from the current obligation without removing it. Navigation does not roll back files, processes, or the record; compaction does not justify inventing source bodies or repeating uncertain effects. When Context Control is effective, read its method before managing a view, and keep current direction, contrary findings, and promised originals. Optional cleanup comes after the promised evidence is prepared; if cleanup fails, keep the extra context and continue the handoff.

## ACT_BOUNDED: Inseparable Judgment And Action

In `executor` and `both` modes, Coordinator may do other environment work only when judgment and action cannot be separated and delegating would lose something concrete. Examples: synthesizing a governing artifact when a complete contract would already be the artifact; intervening result by result in sensitive work. Task size, convenience, fewer switches, a failed recovery, or a preference for premium compute do not qualify, and separable production does not become judgment by being relabelled.

Before acting, state ACT_BOUNDED with its scope, expected result, existing authority, stop condition, the inseparable judgment, and what delegation would lose. Stay inside that scope; end on completion, interruption, context loss, changed applicability, or before delegating again. It grants no permission, assignment, or acceptance. Helper-mode Coordinator production needs no ACT_BOUNDED.

Stop applying the Automatic split when control becomes Manual or routing becomes inactive; preserve unfinished responsibility honestly and follow ordinary Workflow.
