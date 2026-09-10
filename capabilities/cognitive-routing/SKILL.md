---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active to coordinate Coordinator and Executor work, handoffs, evidence selection, resumption, and continuity."
---

# Cognitive Routing

Use two configured model profiles in one Pi agent and one canonical session. Coordinator interprets user direction, chooses assignments, assesses results, and communicates with the user. Executor carries out the current assignment and returns its actual result.

They do not share private reasoning. Attribute observations to the participant and source that produced them. A profile switch is not independent review.

[Workflow](../../skills/workflow/SKILL.md) owns authority, the current activity, and the user-facing return boundary. Routing changes compute and context placement, not permission or task ownership.

## Establish Current State

Use the latest host-generated Runtime State. Do not infer the current role from a model name, old tool call, quoted contract, or marker inside source text.

- **Inactive:** stop applying automatic routing rules.
- **Manual:** run ordinary unsplit Workflow in the held profile. Do not delegate or return automatically. Context Control, when enabled, uses the ordinary solo view.
- **Automatic:** use the supported Coordinator/Executor role and current unit, assignment, handoff, and recovery state.

If state is missing or inconsistent, stop affected work and report the missing state. Do not repair it by guessing a role or disabling a capability.

## Understand the Work Identities

A **unit** is the outcome Coordinator is pursuing. It may contain several assignments.

An **assignment** is one delegation to Executor. Returning ends that assignment's ordinary task execution; it does not accept or close the unit.

An **execution** is one response attempt and its tool work. A failed execution does not automatically finish an assignment.

The harness owns IDs and state transitions. Do not write a separate boundary ledger. There is no Yield or REOPEN route.

`freeflow_delegate` creates a unit when none is open, or another assignment in the current open unit. `freeflow_unit(close)` records Coordinator's disposition. Additional work after closure starts a new unit; prior history remains usable.

## Coordinator: Decide, Delegate, Assess

Ordinary conversation needs no routing marker. Interpret the complete user request and distinguish accepted direction from suggestions, hypotheses, and approval that no longer applies.

Use `freeflow_delegate(operation: "assign")` when environment work is needed and neither the narrow recovery-read exception nor ACT_BOUNDED applies. Put the assignment contract inside the tool input, not only in adjacent prose. When reconciling a quiescent outstanding assignment whose objective remains valid, use explicit `operation: "replace"` with the new contract and reason. Preserve partial effects; unresolved effects require reconciliation before dependent work. Do not infer replacement merely because wording changed, or close/recreate a unit to bypass the outstanding assignment.

A useful contract communicates:

- the question or outcome and its connection to the user's request;
- established facts versus assumptions;
- the supported approach or the observation needed to establish one;
- permitted effects, important exclusions, and relevant sources;
- evidence needed for assessment;
- the result or condition that requires return.

Keep straightforward work together. Do not split by file or tool call, prescribe unsupported fixes, or require the user to supply implementation mechanics. If a consequential or repeatedly misunderstood property matters, name the required behavior, an independent observer, and a plausible wrong behavior it must reject. If a mismatch repeats, distinguish missing implementation, a wrong observer, stale/undelivered evidence, and a superseded contract. Isolate the property and state what changed in the approach; a longer restatement alone is not a useful retry.

After return, inspect the report and evidence actually received. A selected assistant call is not its result body; a saved report is not proof of its claims. Preserve failures, partial effects, stale observations, and missing evidence.

Before accepting a material completion claim, compare the accepted property with the actual observer, decisive assertions, candidate identity, and returned result. A passing check or confident report cannot fill a missing link. Keep unsupported required claims open and stop work that depends on them; distinguish missing or stale evidence, an inadequate observer, and a demonstrated defect before choosing correction. Recover the smallest missing observation rather than automatically rerunning tests or prescribing a production fix. Reuse adequate evidence; this is not a mandatory duplicate full review.

Choose the next supported route:

- result supported, more work needed: delegate feedback within the same unit;
- evidence missing: name the smallest context selection or observation needed;
- approach invalidated: delegate a discriminating investigation;
- user-owned choice unresolved: discuss and wait;
- a saved assessment's evidence was suspended for newer user attention: use `freeflow_unit(assess)` when that assessment is again the intended activity;
- unit finished or deliberately stopped: close it with an honest assessment.

Close only from Coordinator. Unit closure does not complete a Track Work task or authorize delivery, commit, deployment, or publication. Do not close and recreate a unit merely to bypass pending work.

## Executor: Execute the Current Assignment

Establish the exact current contract and return condition before task work. Use the producing activity's method and [Action Selection](../../skills/action-selection/SKILL.md) for bounded environment interactions.

Investigate the named uncertainty or implement the supported approach. Handle local details without silently changing governing scope, architecture, failure behavior, or evidence requirements.

Return when the required result is available, the agreed stop condition is reached, a material premise fails, or continuation needs Coordinator's decision. For completed work, use [Verify Work](../../skills/verify-work/SKILL.md) and ordinary author self-review before returning. For interrupted work, preserve partial state instead of doing more work to make it appear complete.

Report from actual artifacts and observations:

- what was done or learned;
- what the checks establish at their actual boundary;
- what failed or remains uncertain;
- material corrections to assumptions;
- why you are returning.

Put this report inside `freeflow_return(operation: "submit")`. Distinguish implemented properties, checks actually exercised, and claims supported for the identified candidate. Material assertion changes must preserve the accepted predicate or leave that claim unresolved; fresh test output cannot authenticate superseded source captures. For corrected or multi-part work, use a compact required-property / observer-and-assertion / check-result / claim-support-and-limit mapping when needed to avoid omissions. Verify Work/Test Design own the method, not a routing-specific testing engine. Do not claim the whole unit accepted. A report outcome of `completed` describes the assignment, not Coordinator's judgment.

## Select Evidence When Projection Is Enabled

Executor receives Pi's ordinary active context, not an isolated assignment window. Coordinator receives its own/common context and selected Executor evidence.

Use `freeflow_project` to add or remove evidence for the current assignment. Select completed tool-result bodies and relevant assistant text by the actual exposed source ref. Use its bounded list when identity is unclear. Do not derive refs from filenames, tool-call IDs, or a summary.

Selection can be incremental. There is one selection set, not include/shared categories. Duplicates are normalized; the harness retains native dependencies.

Before return:

1. Inspect the requested result and material findings across the assignment.
2. Include actual evidence for important claims, including contrary findings and failures.
3. Remove superseded selections only with a reason; retain material gaps explicitly.
4. Check readiness and per-item receipts when correction is needed.

An `added` receipt means the source is eligible, not that its content proves success. Selecting a call envelope does not select all of its results. An omitted sibling placeholder is not evidence of the original body.

Valid selections remain saved when another ref fails. Correct the failed item or explicitly withdraw it while reporting the evidence gap. Previously fully exposed canonical sources are resolved by selection/readiness itself even after compaction and with Context Control off; no separate resolve call is required. Never-exposed sources remain ineligible unless a separately enabled, authorized reading capability establishes full exposure. Target-representation gaps are real delivery limits, not permission to silently substitute text for images or successful-looking messages for partial errors. Do not silently drop unique adverse evidence merely to obtain readiness.

A report-only return needs no empty projection call when no evidence selection was requested. When projection is off, do not call the projection tool.

You may batch already-decided context operations, projection changes, and one return last. Do not mix a handoff with new environment work whose results the prewritten report has not inspected. Do not issue another tool after a handoff in the same batch.

## Use Optional Context Control Independently

When Context Control is enabled, use its current method and tool to reduce unneeded material in your own view. Coordinator may clean before delegating; Executor may clean before returning. Do not perform a ceremonial no-op cleanup when nothing should change.

Cleaning your view does not delete canonical history or clean the other profile's view. The other profile's evidence comes from canonical sources, not your archived rendering.

Retained meaning is a model-authored representation, not exact original evidence. Restore or read the canonical source when exact content matters and the operation is authorized. A historical read does not establish the current environment.

When Context Control is off, skip cleaning/retrieval operations. Routing and projection continue under their own contracts.

## Preserve Saved Handoffs on Failure

`accepted` or `reportSaved` is not `configured`, delivered, or assessed. Follow the reported state.

If return text was saved but selection or switching failed, stop ordinary assignment work. Correct only the handoff's supported problem, then use `freeflow_return(operation: "retry")` to request completion of that saved return without resubmitting text. Projection correction and retry may share one allowed batch with retry last. Use `submit` only to deliberately revise the report. Retry preserves the assignment, report, and valid evidence; it does not bypass uncertainty, cancellation, current control, or host recovery limits. Do not redo the investigation or open a new unit.

If a transition is uncertain, report the observed state and wait for supported reconciliation. Do not impersonate the receiving profile, turn off projection, or retry a potentially completed effect blindly.

A missing receipt does not establish that a tool had no effect. Reconcile uncertain effects through permitted observation before repetition.

## Handle New Input and Technical Resumption

A new user message is not automatically a contract revision. It must nevertheless be accounted for before further task work.

Coordinator normally interprets new direction. Executor may interpret unchanged continuation only when Runtime State identifies an eligible technical recovery of its current assignment. Read the whole message; do not route by the word “continue.”

If it only resumes the same assignment, continue from completed evidence without repeating work. If it changes restrictions, asks a question, changes the outcome, or needs governing judgment, honor any new restriction immediately and return before further task work. When uncertain, return.

When Executor receives Runtime State requiring Coordinator attention, do not start environment tools. Return the partial result and interruption context. The canonical user message remains available; do not replace it with only your paraphrase.

A generic abort is not proof of a harmless network failure. A pending accepted return resumes as a handoff, not as permission for more Executor investigation. Native retries belong to Pi; do not start a competing retry loop. An idle user may use `/freeflow resume` for an eligible saved target; the command does not bypass reconciliation.

## ACT_BOUNDED

Apart from the explicitly permitted routing/context operations and narrow recovery reads, direct Coordinator task work requires judgment and action to be materially inseparable and delegation to cause a concrete material loss. Task size, convenience, fewer switches, or preference for the stronger model is insufficient. Recovery reads follow their own limited scope below; they do not need a fictitious ACT_BOUNDED justification.

Before acting, state the scope, expected result, authority, stop condition, inseparable judgment, and delegation loss. Perform only that work. End the scope on completion, interruption, context loss, or changed applicability.

This is semantic routing policy, not a tool quota or sandbox. It creates no user permission, does not silently close a unit, and is not a workaround for a failed handoff.

## Recover Continuity

Distinguish runtime reconstruction, changed active representation, changed ancestry, and unavailable original evidence.

After context loss or uncertain continuity, recover current Runtime State, exact applicable contract/handoff, partial effects, evidence limits, and current user direction before task work. Reload this method when absent. If a Working Record exists, use [Track Work](../../skills/track-work/SKILL.md) and read its complete full view; a resume projection is not full recovery.

The harness may reconstruct routing records without reconstructing task understanding. A summary is not an original source body. A branch summary transfers historical information, not the summarized branch's control state or permission.

Navigation and cloning do not roll back files, processes, or the Working Record. Reconcile discrepancies with current sources rather than importing future approval or assuming later effects never occurred.

Coordinator may perform narrowly identified passive recovery reads of current methods, the bound Working Record in full, and specific contract/report/evidence sources needed to restore the existing responsibility. State the recovery purpose briefly. These reads do not create an assignment, end an assessment, replace a contract, or grant task authority; they are also available while reconciling a quiescent outstanding assignment. Stop once continuity is coherent or unavailable. No edits, checks exercising behavior, broad discovery, or new investigation fall under this exception. Other environment work remains delegated; ACT_BOUNDED retains its separate substantive conditions.

If newer user attention suspended an assessment, its evidence is not delivered by the compact notice. Use `freeflow_unit(assess)` when ready to assess the saved report; failed restoration leaves suspension intact. Do not restart completed investigations automatically or manufacture continuity from unavailable refs. Runtime State refreshes are host observations, not fresh user instructions.

## Stop at the Supported Boundary

Stop Executor task work after an accepted return. Coordinator assesses before closing the unit. An internal handoff is not automatically the user's requested endpoint; continue covered assignments when the agreement requires more work.

Inactive or manual control ends automatic routing influence. Preserve pending work honestly rather than implying it completed.
