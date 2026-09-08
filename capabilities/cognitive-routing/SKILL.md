---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active and automatic or manual compute control, profile transitions, delegated execution, direct Reasoning action, or boundary continuity must be interpreted."
---

# Cognitive Routing

Place consequential judgment in Reasoning and bounded environment work in Standard under Automatic control. Give Standard a supported execution contract, then return enough actual evidence for Reasoning to assess the result.

This is one agent in one Pi session using two distinct, separately configured model participants—not two independent agents or one participant merely changing hats. Only one executes at a time over one canonical transcript:

- **Reasoning** interprets the user, settles governing direction, chooses the next contract, assesses returned evidence, and communicates with the user.
- **Standard** investigates, implements, verifies, self-reviews, and selects evidence within that contract. It contributes contrary findings and better approaches without silently adopting an uncovered governing change.

They do not share private reasoning. Treat the other participant's reports as contributions, not as your own observations. Distinguish what you saw, what was reported, and what evidence establishes. If historical authorship is unclear, do not infer it from the current profile.

[Workflow](../../skills/workflow/SKILL.md) owns authority, readiness, activity ownership, checkpoints, and Supported Exit. Cognitive Routing changes compute and context placement, not those responsibilities. A profile switch is not independent review.

## Establish Current Control

Use the latest host-generated `Control` and `Profile`, not model identity, an old switch, or conversational role labels.

- **Manual:** the user holds a profile. Run ordinary unsplit Workflow in it, including conversation and environment work. Projection is bypassed. Do not request automatic switching or simulate a Reasoning/Standard hierarchy. The hold persists until the user changes or releases it.
- **Automatic:** Reasoning owns substantive user-facing interpretation, discussion, decisions, questions, assessment, and reporting. Standard executes only an active Yield or Delegate contract. A fresh user message reaching Standard requires an interrupted handback before acting on it.

Missing or contradictory state requires recovery, not a guessed route. A Runtime State refresh alone is not a user interruption and does not reset a valid contract.

All remaining execution rules apply under Automatic control, even when projection is disabled. When this capability is inactive or control becomes Manual, retained Automatic guidance must stop directing work.

## Keep The Three Boundaries Distinct

- The **user's work agreement** defines the outcome, permitted scope, and user-facing return condition. It may authorize one result or a whole task.
- An **execution unit** is coherent delegated work ending in one assessable result. It may contain several environment interactions; it is not a tool-call quota or a Working Record Slice.
- A **delegation boundary** keeps Reasoning responsible for governing judgment across units. At most one is open.

```text
Boundary state: NONE | OPEN
Boundary operation: NEW | REOPEN | CLOSE
```

Recover boundary state from visible transfer records, not the current profile. `RETURN` leaves it open; only Reasoning closes it. A record preserves task meaning and approval evidence, not routing authority.

An internal handback or boundary closure is not automatically the user's requested endpoint. Under a whole-task agreement, Reasoning can select further covered units or Slices without asking for another "continue." Required recovery and selected checkpoints still apply; an uncovered user-owned choice still stops work.

## Understand The Context Views

Pi owns the canonical history and its compaction-aware active context. Projection changes Reasoning's view without deleting canonical history.

With projection enabled:

- Standard sees Pi's ordinary active context, including evidence not selected for Reasoning. A narrow contract does not give Standard an isolated context window.
- Reasoning receives required context, including user messages and applicable Reasoning history, shared context, accumulated selections, and retained handoffs with native dependencies.
- Unselected Standard material is excluded by default. An omission marker or retained tool-call envelope is not the omitted result body.

Projection belongs to Cognitive Routing. Context Virtualization or Conversation History status does not determine it. `cognitiveRouting.contextProjection: false` gives both profiles ordinary Pi active context. Do not change configuration merely to complete a handback.

Selection is not pinning. Compaction can replace older material with a summary, and navigation can change the active ancestry. A ref quoted in a summary does not establish that the original body remains available or selectable. State conclusions and uncertainty explicitly; hidden reasoning is not a dependable transfer.

## Choose The Compute Route

Once this method is loaded, Automatic Reasoning uses no environment tools outside a qualifying `ACT_BOUNDED` scope. Source and skill reads, searches, diagnostics, experiments, edits, tests, builds, and substantive artifact production are execution. Profile switching is a control operation.

| Current work | Route |
| --- | --- |
| No environment work needed | Remain in Reasoning to discuss, assess, answer, or wait. |
| Boundary NONE; small, exact, local, reversible, low-risk, directly verifiable result | `YIELD` may transfer the complete ordinary result. |
| Boundary OPEN, or work needs later Reasoning judgment | `DELEGATE`. |
| Judgment and action are materially inseparable and delegation would lose essential judgment | Consider `ACT_BOUNDED` under its conditions below. |

Use Delegate when uncertain. Never Yield inside an open boundary or close one merely to obtain Yield. Reconcile a genuinely changed activity or authority through Workflow rather than silently carrying an old boundary forward.

Every agent-requested Automatic transition uses `freeflow_switch_profile`. Write its transfer record as assistant text in the same response; the switch must be that response's only tool call. The tool's `reason` is an audit label, not the contract or handoff.

## Reasoning: Delegate The Missing Understanding Or Supported Change

Apply Workflow's outcome/approach readiness to the next unit. Do not hand Standard an implementation objective while leaving it to invent the governing approach.

Choose the contract for the actual need:

| Need | Give Standard | Require on return |
| --- | --- | --- |
| Understand the outcome or symptom | Accepted facts, the unresolved question, relevant sources or reported path, and permitted observation | Evidence that distinguishes expected/observed behavior or the material alternatives |
| Establish the approach | Settled outcome, constraints, uncertain mechanism or dependency, and the smallest useful investigation | Source-backed findings that let Reasoning select or reject an approach |
| Implement | Supported correction/design, why it follows from evidence, affected boundaries, necessary ordering, invariants, and checks | Actual resulting state, verification, self-review, and contrary or incomplete evidence |

One investigation may establish both what and how. A known local change need not receive separate discovery delegations. Keep straightforward implementation, checking, and correction together; do not split by file or command.

Make the current unit concrete without pretending every later Slice is known. Account for its necessary working context, checking, likely correction, and continuation. Use host-supplied usage if available; do not invent token estimates or promise the unit fits simply because the provider window is large.

Shorten a unit when an unfamiliar seam, uncertain observer, or repeated misunderstanding could invalidate substantial dependent work. Define a prototype by its question, permitted effects, adequate observer, return condition, and artifact disposition—not by completion of a production subsystem.

A decision-complete contract communicates:

- the question or outcome and its connection to the user's agreement;
- established facts versus hypotheses;
- the supported approach or discriminating observation, relevant sources, ordering, and invariants;
- local freedom, excluded effects, and assumptions whose failure requires return;
- evidence needed for assessment and task background that must be shared;
- the assessable result or condition ending the unit.

Specify exact edits or APIs only when their premises are known. Distinguish accepted requirements from suggested mechanics. Give Standard enough freedom to handle local details, but do not let prescriptive directions conceal a user-owned decision.

For a consequential or repeatedly misunderstood property, give a small acceptance example: required behavior, a relevant wrong behavior, and the observer that distinguishes them. If that observer is itself uncertain, settle it in a focused investigative unit before substantial implementation depends on it. A longer list of checks does not resolve an unknown observing boundary.

When scope, order, or return conditions change, identify which prior direction this contract replaces and what remains authorized afterward. For example: "Notification correctness only now; this replaces the instruction to continue into mode work. Mode work remains authorized for a later unit." Do not add a contract ID scheme or another ledger.

### Open Or Continue Delegation

For a new boundary:

```text
DELEGATE
Boundary operation: NEW
Boundary state: OPEN
```

Use `REOPEN` only for the same previously closed outcome under fresh authority and changed evidence or intent; identify that outcome.

For another unit inside the open boundary:

```text
DELEGATE
Boundary state: OPEN
```

Follow with the contract, then switch to `standard`. Do not submit a projection payload when entering Standard.

## Standard: Complete The Contract Without Expanding It

Use the current owner's method. Read [Action Selection](../../skills/action-selection/SKILL.md) when its exact method is absent; use its fast path for known mechanics and its bounded selection for uncertain, broad, or repeated interactions.

At entry and after recovery, establish the latest applicable contract, required result, exclusions, and unit return condition. Do not combine a superseded stopping instruction with the current scope. Resolve a material conflict from available direction or return it; do not choose whichever version permits progress.

For an investigation, focus on the declared question and stop when evidence is sufficient or the observing limit is reached. Do not follow every newly mentioned dependency. For implementation, apply the supported approach and handle understood local details within scope.

A routine caller/signature read may remain local. If a load-bearing premise is false, stop dependent effects, preserve completed work, and return the finding before adopting an uncovered approach. A governing change materially alters accepted outcome, architecture, policy, failure behavior, scope, authority, or evidence requirements.

Before pursuing a new prerequisite, distinguish what blocks the observer, the chosen mechanism, or the actual required outcome. Do not promote an optional stronger guarantee, change acceptance, or build a subsystem solely to keep the current approach moving. A prototype's negative result can be a successful learning outcome.

Use [Verify Work](../../skills/verify-work/SKILL.md) to establish what observations prove. Confirm requested assertions and actual boundaries ran; a successful write is mutation evidence, not correctness, and a green summary cannot erase an earlier failure. If changing a material assertion or fixture reduces what is demonstrated, return that limitation before claiming the unchanged requirement satisfied. Correct an established observer error without silently dropping the property.

Once evidence supports the result, silently self-review through the producing owner's method. Correct a clear covered defect and recheck the affected state. Do not claim the wider task accepted or treat a local issue as automatic authority for another review or unit.

Communicate corrected assumptions, lessons, and useful alternatives explicitly at handback. This is session-local learning between participants, not retraining, new authority, or separate private task memory.

## Standard: Select Actual Evidence For Judgment

Track what available completed refs identify throughout the block, not just at its end. Eligible material includes tool-result bodies and completed assistant text that itself contains a relevant finding, proposal, or draft.

**Select the evidence, not merely the request for it.** When the host labels entries by kind, a `toolResult` identifies returned material; the preceding assistant tool-call entry records the request. Selecting a call envelope does not establish that Reasoning received its result. A completed assistant proposal is useful evidence of the proposal, not proof of the files or tests it describes.

Use only refs actually exposed for eligible completed entries on the active branch. Never derive them from filenames, tool-call IDs, session storage, an old summary, or the not-yet-completed handoff. A ref may identify an entry containing more than one interaction; do not assume one ref per tool invocation or paragraph.

Before handback:

1. Identify what the contract required Reasoning to inspect.
2. Add material discoveries, contradictions, failures, partial effects, and uncertainty from the entire unit.
3. Check that source/test captures and check results describe the reported candidate. Relevant later edits may invalidate applicability; an authentic old body is not final-state evidence.
4. Select the smallest sufficient source bodies and observations supporting those points, with required missing cases explicit.
5. Leave redundant exploration, superseded content, and irrelevant output unselected.

Requested evidence is a minimum, not an exclusive allowlist. A request for passing checks does not permit omitting a later failure. Prefer enough evidence for sound judgment over a cosmetically small selection; do not append every ref merely because it exists.

| Field | Purpose |
| --- | --- |
| `projection.include` | Eligible completed Standard evidence needed to assess the result: code/diffs, checks, diagnostic facts, failures, and relevant assistant text. |
| `projection.shared` | Eligible task background needed across later units: instructions, accepted artifacts, constraints, governing contracts, and task-memory reads. |
| Neither | Redundant or irrelevant material, already adequately retained evidence, or output no longer supporting a current claim. |

Choose by purpose, not age. Earlier-block refs may be used when still exposed, completed, and eligible on the active branch. Both fields accumulate along applicable ancestry; neither can retrieve arbitrary session content or resurrect compacted-out bodies. `include` is not single-use and `shared` is not permanent residency. Deduplicate arrays and do not put one ref in both.

Reasoning's already-visible material does not need resubmission. Do not assume another origin or an old ref is eligible merely because its text is visible. If evidence is unavailable, stale, or rejected for a field, report the limit; do not misuse `shared` to bypass validation.

The current handoff and required native dependencies are retained automatically. Do not invent its self-ref or manually select every dependency. Empty or omitted projection adds no discretionary evidence; earlier applicable selections remain. It never means "send the whole Standard block." Omit the payload when projection is disabled.

A skill read is ordinary selectable background, not a permanent instruction store. Selecting external material or a reviewer proposal does not make it authoritative. Do not create another ledger, print ref inventories after every call, reread solely to manufacture refs, or copy raw evidence into the handoff to evade projection.

## Standard: Hand Back At The Agreed Unit Boundary

Return when the result is available, a selected stop point is reached, a material decision exceeds the contract, safe continuation is unavailable, or a fresh user message arrives.

For completed work, finish covered verification and self-review first. For blocked or interrupted work, preserve the actual partial state without doing more work to make it look complete.

1. Stop environment work at the covered boundary.
2. Reassess and select evidence for the whole unit.
3. Build the report from inspected final artifacts and actual observations, not the assignment rewritten in past tense. Distinguish what changed, which requested properties were checked, and what remains unsupported. For multi-part work, use a compact required-result / actual-check / remaining-limit mapping when it prevents omissions. State corrected assumptions and the reason for return.
4. Switch to `reasoning`, with eligible selections when projection applies.

Under Delegate:

```text
RETURN
Boundary state: OPEN
```

Under Yield, write `YIELD HANDOFF`; no delegation boundary is open. Write the handoff in the same response as the switch, with that switch as its only tool call.

After requesting the switch, stop. Do not impersonate Reasoning's assessment, close a boundary, assign another unit, or claim success if the transition failed.

### Fresh User Messages

If a user message arrives in Standard, finish only the current atomic interaction. Reassess already-visible evidence, including earlier assistant findings, preserve partial changes and adverse observations, and hand back before interpreting the request.

Do not start another read, test, edit, or retrieval to complete the evidence set. Do not continue because the message says "continue." The message itself is retained automatically. Report unfinished checks and unavailable evidence rather than fabricate results or use interruption as an excuse for empty selection.

A Runtime State refresh alone is not such an interruption.

## Reasoning: Assess Against Intent And Evidence

After successful handback, inspect the evidence actually received. A fluent report, selected call envelope, or file path is not the underlying diff or test output.

Ask:

- Does the result serve the accepted outcome and amendments, not merely my prescribed steps?
- Did it add unsupported obligations or omit selected work?
- Does the supplied evidence establish the claimed state at the required boundary?
- Are requested evidence, adverse observations, or partial effects missing?
- Did Standard invalidate a premise, expose a better mechanism, or show the unit was poorly bounded?
- Does the next action remain covered and short of the user's return boundary?

Do not call a late snapshot a pre-change baseline or a favorable rerun proof that a previous failure was harmless. Preserve evidence limits from assistant reports and subagents; their assertions do not replace direct observations.

Reuse adequate verification and local self-review. Reasoning supplies governing assessment, not an automatic duplicate full review. Do not require identical implementation style or convert possible improvements into unfinished work.

Route through the existing Workflow:

- result supported but agreed work remains -> next coherent covered unit;
- required evidence missing -> smallest observation or context selection that resolves it;
- clear covered defect -> correction and affected checks;
- outcome settled but approach invalidated -> approach investigation;
- unclear or repeated cause -> [Diagnose Failure](../../skills/diagnose-failure/SKILL.md);
- changed outcome, authority, or owner choice -> Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md);
- separately selected work/artifact judgment -> [Review Work](../../skills/review-work/SKILL.md) or [Review Artifact](../../skills/review-artifact/SKILL.md).

When a handback fails to establish an explicitly requested property, first distinguish missing implementation, an inadequate observer, stale or undelivered evidence, and misunderstanding of the current contract. Missing evidence is not itself a code defect. Tie any further demand to accepted behavior rather than a newly preferred guarantee.

If the same mismatch recurs, isolate that property before assigning more dependent work. Identify what makes the next attempt useful: a corrected observer, concrete counterexample, recovered contract, smaller working set, or separately authorized compute change. A longer restatement alone is not a changed approach. Return a genuine unresolved limit instead of repeating the loop or lowering acceptance.

### Recover Missing Handback Evidence Narrowly

When an original result exists in Standard's visible context but was not delivered, delegate a context-only follow-up by purpose or known ref. Standard selects available completed evidence plus material counterevidence and reports what is unavailable. It does not reread, rerun, or retrieve history unless that follow-up explicitly covers those actions.

Use `include` for missing execution evidence, including earlier eligible results; age does not make a test result `shared` background. If a body is no longer available, report the limit so Reasoning can select a bounded source read or check. If call/result confusion repeats, change the capture or selection approach: use clearly labelled completed results and, when authorized, a few bounded direct reads. Do not repeatedly resubmit the same call envelope, reread without authority, or infer an accessible body from a named ref.

### Close A Supported Delegation

When the delegated outcome is supported and self-reviewed, selected checkpoints are resolved, and no material contradiction remains, Reasoning writes:

```text
CLOSE
Boundary state: NONE
Current owner: unchanged
```

State the result and limits proportionately. Closing leaves Reasoning active; it does not complete a Slice, reach the user endpoint, or authorize delivery by itself. Do not clear an unsupported boundary merely to obtain another route. Preserve unresolved state and return changed authority or ownership to Workflow.

## Yield A Complete Ordinary Result

With Boundary NONE and the small, exact, local, reversible, low-risk, directly verifiable conditions satisfied, write `YIELD` with the outcome, constraints, evidence, and stop condition, then switch to Standard.

Standard completes the ordinary result, verifies and self-reviews it, selects evidence, writes `YIELD HANDOFF`, and actually switches back. A broader investigation or governing decision requires handback instead of silently extending Yield. The same interruption and failure rules apply. Reasoning accepts the supported result or selects the next route.

## Act Bounded Only When Delegation Loses Essential Judgment

`ACT_BOUNDED` is the sole direct Automatic Reasoning execution route. Both conditions must hold:

1. judgment and action or artifact production are materially inseparable;
2. shared-session delegation would cause a concrete material loss warranting direct Reasoning execution.

Task size, convenience, fewer switches, a demanding quality bar, or preference for the stronger model is insufficient. Ordinary investigation, implementation, verification, and cleanup remain Standard work.

Synthesis can qualify when it is itself the requested artifact: a decision-complete delegation would require Reasoning to produce the artifact and Standard merely to transcribe it. Sensitive result-by-result intervention can qualify when evolving judgment cannot usefully be separated from action.

Before acting, write `ACT_BOUNDED` with scope, expected result, authority, stop condition, inseparable judgment, and concrete delegation loss. Perform only that work while the justification holds. End the scope at completion, interruption, context loss, changed authority, loss of eligibility, or before another delegation.

The scope creates no delegation boundary, may contribute to an open one, cannot contain Delegate, cannot operate while Standard executes, and cannot close the boundary. It is not a workaround for a failed switch.

## Preserve Control And Failure Boundaries

### Manual Changes

Apply user control changes at a safe boundary, not during an atomic interaction. Preserve the active contract, completed work, and unverified effects. Suspend any open Automatic boundary rather than implying completion; the held profile runs ordinary Workflow without projection or automatic handbacks.

Releasing Manual returns to Automatic Reasoning; reconcile suspended work before delegating. A failed release leaves the hold in force. Manual execution does not automatically share all its history on re-entry; profile-based selection still governs Standard-attributed evidence.

### Failed Transitions Or Projection

A failed switch grants no workaround:

- failed entry to Yield/Delegate -> Standard has not begun the assigned unit;
- failed Standard handback -> Standard stops without taking over user interaction or governing judgment;
- rejected/unavailable projection -> preserve the error and missing evidence; do not drop refs, disable projection, fabricate a full-context return, or retry merely to force progress.

Use host-reported control/profile state, not assumed success. Preserve the open boundary and partial effects. A rejected selection is not a completed handback. Reasoning cannot bypass the failure through direct execution; any later Act Bounded scope must independently qualify.

For an explicitly authorized corrected handback retry, preserve the earlier substantive handoff through its actual eligible assistant-text ref in `include`, plus the still-valid evidence needed for assessment. Include the failed result when its details matter. Write a short current explanation of the retry; it does not replace the earlier report. Recheck duplicates and ref kinds before calling. Do not drop unique evidence just to obtain success, derive unavailable refs, or assume a retry is covered merely because rejection occurred. If the earlier report cannot be retained, state that missing communication explicitly.

### Context Loss And Navigation

Recover before task execution: current control/profile, owner, authority and user agreement, active contract, explicit boundary state, partial effects, evidence limits, and stop conditions. Distinguish actually visible bodies from summaries and quoted refs. Reconcile the latest assignment with superseded directions; recover its exact source through the permitted route when wording changes the next action. Do not resume implementation from a summary when the current unit is inspection only. Preserve separately which observations occurred and whether they apply to the current candidate. An unresolved contract conflict stops dependent work, not authorizes another guessed unit.

Use [Track Work](../../skills/track-work/SKILL.md) when a Working Record exists, including its complete `full` recovery after context loss. A record does not recreate routing authority or ref eligibility. Reload required methods whose bodies are absent; a prior shared selection may not have survived compaction.

Environmental recovery reads still use Standard through a supported route. If that route cannot be established, stop through Workflow rather than inventing Boundary NONE, opening a replacement boundary, or using Act Bounded because recovery is uncertain.

A recovery-only unit returns recovered state, not permission for the next implementation unit. Reasoning then resumes the covered task at the narrowest valid point. Preserve supported work instead of restarting the entire investigation.

## Stop At The Supported Boundary

Yield ends with handback, Delegate ends when Reasoning closes its supported boundary, and Act Bounded ends at its declared condition. The user-facing return follows the work agreement and Workflow—not the number of switches.

A recommendation is not authority for another action. Inactive or Manual control must not retain a shadow Automatic hierarchy.
