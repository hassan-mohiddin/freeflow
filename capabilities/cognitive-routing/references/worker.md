# Cognitive Routing: Worker

Read this as Helper or Executor under Automatic control, before your first command or edit and again after context loss. The [Cognitive Routing](../SKILL.md) skill's Terms and Rules apply. This reference is judgment, except where it restates those Rules.

## Execute Within The Contract

Goal: produce the assigned result resourcefully, within scope, and stop at the useful boundary.

Establish the contract, your assigned role, the constraints, and the return condition. Load the producing method when absent. Follow required direction; choose ordinary mechanics yourself. A useful discovery or an available tool grants no new authority.

Challenge unsupported premises and report better-supported approaches. A governing change, one that alters the accepted outcome, architecture, policy, scope, authority, failure behavior, or required evidence, stops dependent effects until Coordinator decides. An unprescribed filename or helper does not require a return. For an unexplained or repeatedly stalling failure, use Execute Work's [diagnose](../../../skills/execute-work/references/diagnose.md) reference within scope or return.

Run routine tools without announcing them; put findings in the report. Questions for the user, and the choices you made that the contract did not settle, go to Coordinator in the return.

Verify the actual candidate and self-review through the producing method, using [Verify Work](../../../skills/verify-work/SKILL.md) to say what the observations support. Keep failed, stale, incomplete, and inconclusive evidence. If a test changes, say what the old and new versions each establish.

Return when the result is ready, the stop condition is reached, no useful covered work remains, or new user input needs Coordinator. Do not stop after each command, and do not continue into a different responsibility to avoid a handoff. State what remains before the Slice's exit.

## Prepare Evidence, Then Return

Goal: Coordinator receives what it needs to judge the result and nothing it does not.

Helper and Executor share ordinary history. Reuse each other's sources and observations while keeping who produced them; do not create worker-to-worker projections. With projection on, Coordinator sees only what you select, so select enough original material for judgment, not the execution trail. Prepare evidence once, at the return boundary, not after each tool call.

1. **Reconcile the result.** Compare the contract with the actual work, changed assumptions, partial effects, missing checks, and contrary findings. Make sure captures describe the candidate you are reporting, after any later edits.
2. **Choose the evidence.** Start with what Coordinator requested and what it already has. Add governing background, material discoveries, and counterevidence it needs. Being eligible is not a reason to select a source, and a nearby result, filename, or shared report is not automatically the evidence for a claim. Unknown authorship stays unknown. When Coordinator already has adequate evidence, or the result needs no observation to judge (a draft written into the report), select nothing new. A claim about what a command, test or file showed is not self-contained, however short its output: select that result.
3. **Add the bodies and submit together.** With projection on, add the skill and reference reads that carry the methods Coordinator needs, and the original task-evidence bodies needed for assessment, in one `select_evidence` add using visible refs directly. Only tool results are evidence; write findings, drafts, and interpretation into the report instead. In the same response, put `return_work(operation: "submit")` last, with the result, evidence and limits, changed assumptions, partial effects, what remains, and why you are returning. Do not wait for the selection receipt: the report is saved even when evidence has problems. Never batch the return with new task work whose outcome the report assumes. Then stop ordinary task work.
4. **Check the return receipt.** If it reports problems, resolve identity or representation problems with `select_evidence`, then use payload-free `return_work(operation: "retry")`. Withdraw a request only with a reason; withdrawing does not close a required evidence gap. Do not rerun work to manufacture a selectable receipt.

Use `select_evidence` inspect only when a ref's identity, eligibility, representation, or selection state is unclear; assignment size alone is not a reason. Once you find the refs you need, add them; the remaining candidates are not a work queue. With projection off, skip the projection tools, not verification or honest reporting.

A required stop takes precedence over another read or test: return an honest `partial` or `blocked` report instead of forcing `completed`. `reportSaved` does not mean delivered or assessed. If the transfer is blocked, ordinary work stays ended; fix only the handoff problem and use payload-free `return_work(operation: "retry")`. Use `submit` again only to deliberately revise the report.

## Answer A Recovery Request

Recovery is Coordinator's bounded request for evidence missing from a returned assessment, and it belongs to the assignment's recorded worker; an outstanding assignment uses ordinary continuation instead.

During recovery, the worker may select previously exposed evidence and read only exact admitted task paths, granted captured results, or packaged Freeflow skill and reference files. It must not edit, run commands or tests, broaden discovery, or resume task work. Report stale or unavailable evidence without rerunning anything. Return with `return_work(operation: "supplement")` and stop reading. A `partial` or `blocked` supplement can deliver its communication while the full evidence obligation stays suspended; payload-free `retry` resends an unchanged saved supplement.
