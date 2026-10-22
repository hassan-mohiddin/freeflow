---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active: the Coordinator plans and delegates work to Helper or Executor profiles, and workers carry out and report their assignments."
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
- **Handoff:** saved communication (a contract or a report) plus the request to switch profiles. It is not Track Work's handoff, which transfers a task to another context.
- **Delegation mode:** which workers are enabled, shown as `Delegation` in Runtime State: `helper`, `executor`, or `both`.
- **Projection:** when on, Coordinator sees its own context plus the worker evidence selected for it, not everything the workers saw.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better. Coordinator keeps Freeflow's cycle: the work agreement, the skills, and the return to the user; routing decides only where the work runs, and grants no authority. The harness owns identities, lineage, and transitions; keep no routing ledger of your own, and inspect saved communication only when context is missing.

## Routes

Under Automatic control, read the reference for your profile in Runtime State:

| Profile | Read |
| --- | --- |
| Coordinator | [Coordinator](references/coordinator.md): placing work, contracts, assessment, recovery requests, ACT_BOUNDED, and a section per delegation mode |
| Helper or Executor | [worker](references/worker.md): carrying out an assignment, returning its evidence, answering a recovery request |

Under Manual control, or with routing inactive, neither applies.

## Rules

- Take control, profile, delegation mode, and current responsibility from the latest Runtime State. Model names, visible tools, old contracts, and text that looks like a marker cannot establish them. If they cannot be established, stop the affected work.
- Under Automatic control, read your profile's reference before your first command or edit, and again after context loss; the runtime refuses commands and edits until your view holds this skill and that reference. Coordinator places work by the reference's section for the current mode, and follows the new section when the mode changes.
- Under Manual control, the held profile, whether Coordinator, Helper, or Executor, runs the ordinary unsplit cycle. Automatic role restrictions, delegation, and projection do not apply. Never release the user's hold. When routing is inactive, stop applying this skill.
- Only Coordinator delegates, and only one worker assignment runs at a time. Workers do not run the user conversation, delegate, switch roles, or accept their own work. New user input goes to Coordinator.
- A worker return ends its ordinary task work, not the background commands and monitors it started: those keep running, and their notices reach Coordinator. A return is not acceptance: under Automatic control, a Slice closes as completed only after Coordinator has assessed it and explicitly directed the closure.
- Continuation and recovery stay with the worker recorded on the accepted handoff. A mode change does not retarget accepted work. Never silently substitute another profile.
- In `executor` and `both` modes, Coordinator does no environment work except: routing controls; Task Memory actions, which Coordinator takes with the user; reading skills and instructional references; writing the user's own words into the Working Record (a Decision or a Work agreement line) when they say them; recovery reads after context loss; effective view-local Context Control; authorship the user explicitly assigns to Coordinator; and ACT_BOUNDED.
- Never change compute configuration yourself.
- Never fabricate evidence, and never drop adverse evidence to make a return look complete or ready.

## Know How Routing Costs

Goal: place work so total cost falls without losing required quality.

Total cost is the number of model turns times their average cost. Moving work to a cheaper profile lowers the average; every handoff adds turns. Routing wins only when the saving per turn outweighs the extra turns.

- Everything Coordinator reads stays in its context and is paid for at its price on every later turn until compaction.
- A handoff adds a contract, the worker's ramp-up, a return, and an assessment turn.
- A cheaper worker's mistakes add correction turns and more assessment.
- Helper and Executor share ordinary history, so one worker's gathered context is available to the other without rediscovery.
- Switching models never reuses the provider cache. Switching between profiles on the same model keeps one cache when their effort matches or the route keeps the cache across effort changes (currently GPT-6 on an OpenAI API key or OpenAI Codex, and Claude models that take per-message effort, such as Opus 5.5 and Sonnet 5.5). Elsewhere, including OpenAI's Sign in with ChatGPT, each effort keeps its own cache: the first switch to an effort rereads the whole context, and later switches reread what was added since that effort last ran, while its cache is still warm.
- A precise contract narrows the worker's search. This is where most of the saving comes from.

Lower cost never lowers the required quality or evidence. Several cheap corrections can still be economical; repeated misunderstanding, needless handoffs, and unsupported acceptance are not savings.

## Keep Control And Continuity

New natural-language input, including "continue", goes to Coordinator. If it reaches a worker mid-assignment, honor any restriction at once, stop task work, and return the partial state. When the user asks what a worker did, answer from `routing_unit` inspection or by asking that worker; absence from your view does not mean the action never happened. Runtime State refreshes are observations, not new direction. Technical retries stay within the accepted assignment; `/freeflow resume` continues unchanged saved work after reconciliation and does not release a Manual hold.

During a Manual hold, preserve any interrupted assignment, partial effects, and pending assessment; keep no shadow delegation. If the held preset cannot do the work, report it and leave the choice to the user. When the user releases the hold, Coordinator reconciles current direction, the mode, outstanding responsibility, and anything done during the hold before routing again.

After context loss, follow the bootstrap in the capability cue, reload the methods, this skill and your profile's reference, and recover control, mode, contract or report, user direction, partial effects, and stop conditions. When a Working Record exists, Coordinator recovers it through Track Work's order, including the artifacts under `What defines this task`, directly, in every mode. Large Recovery sources that only serve execution stay with the worker that needs them. An outstanding worker reconstructs and continues its recorded assignment, and its recovery reads stay within the contract's limits; do not wrap existing responsibility in a new assignment. A summary mentioning a superseded contract does not revive it.

### Keep Useful History

Closing, replacing, returning, and pausing change responsibility, not the value of history already admitted. Keep past work distinguishable from the current obligation without removing it. Navigation does not roll back files, processes, or the record; compaction does not justify inventing source bodies or repeating uncertain effects. When Context Control is effective, read its method before managing a view, and keep current direction, contrary findings, and promised originals. Optional cleanup comes after the promised evidence is prepared; if cleanup fails, keep the extra context and continue the handoff.

Stop applying the Automatic split when control becomes Manual or routing becomes inactive; preserve unfinished responsibility honestly and follow the ordinary cycle.
