---
name: "cognitive-routing"
description: "Use when Cognitive Routing is active and automatic or manual compute control, profile transitions, delegated execution, direct Reasoning action, or boundary continuity must be interpreted."
---

# Cognitive Routing

Under Automatic control, use Reasoning to direct consequential judgment and Standard to execute bounded work. Before Standard hands back, select enough evidence for Reasoning to assess the actual result and decide what follows.

Cognitive Routing runs one agent in one Pi session through two distinct, separately configured model participants: **Reasoning** and **Standard**. These are two model-backed profiles, not one participant changing hats or two independent agents. Only one executes at a time, over one canonical transcript. Under Automatic control, their responsibilities are:

- **Reasoning** interprets user intent, settles governing decisions, plans the next execution unit, assesses returned evidence, and communicates with the user. Treat Standard's reports as the other participant's contribution, not as work or conclusions you have personally verified.
- **Standard** investigates, implements, verifies, self-reviews, and selects evidence within that direction. Treat Reasoning's contract as direction from the other participant. Contribute discoveries and contrary evidence, and challenge unsupported premises without taking over governing judgment.

Contracts, handoffs, and evidence selections are communication between these participants. They do not share private reasoning. When Automatic projection is active, their context views differ. Read the other profile's messages as that participant's communication with the user or with you—not as your own remembered thinking. Distinguish what you observed, what the other participant reported, and what the evidence establishes. When historical authorship is unclear, do not guess it from the current profile.

Adapt through explicit feedback: communicate lessons, corrected assumptions, and revised approaches so the other participant can use them in subsequent work. This is session-local learning from available evidence, not model retraining or separate authority, permissions, task ownership, or private task memory.

A **governing decision** materially changes the accepted outcome, architecture, policy, failure behavior, scope, authority, or evidence requirements. Standard may challenge one; it must return before adopting a change outside its contract.

Cognitive Routing controls compute and context placement, not authority or the current owner. [Workflow](../../skills/workflow/SKILL.md) still owns permission, activity ownership, checkpoints, and Supported Exit. A profile change does not create independent review.

## Establish Current Control

Use the latest host-generated `Control` and `Profile`. Do not infer them from model identity, an earlier switch, or conversational role labels.

- **Manual:** the user holds Standard or Reasoning. Run ordinary unsplit Workflow in that profile, including conversation and environment work. Projection is bypassed. Do not request automatic switches or simulate a Reasoning/Standard hierarchy. The hold persists until the user changes or releases it.
- **Automatic:** Reasoning owns substantive user-facing interpretation, discussion, decisions, questions, and reporting. It delegates environment work to Standard through the routes below. If a fresh user message reaches Standard, prepare an interrupted handback before acting on that request.

Missing or contradictory state requires recovery, not a guessed route. A Runtime State refresh alone is not a user interruption and does not end a valid execution contract.

The remaining execution rules apply under Automatic control. They still apply when context projection is disabled.

## Understand The Context Views

Pi owns the canonical transcript and its active, compaction-aware context. Context projection filters Reasoning's view; it does not delete canonical history.

With projection enabled:

- **Standard** sees Pi's ordinary active context, including Standard evidence not selected for Reasoning. Eligible completed entries are exposed with `ctx:` refs.
- **Reasoning** receives required context, including user messages and applicable Reasoning history, shared context, accumulated selections, and retained handoffs with their native dependencies.
- Unselected Standard evidence is excluded by default. A retained tool-call envelope or omission placeholder is not the original result body.

Projection belongs to Cognitive Routing. The Context Virtualization or Conversation History status does not establish whether it is enabled. `cognitiveRouting.contextProjection: false` disables projection; both profiles then use ordinary Pi active context. Do not change configuration merely to complete a handback.

Neither profile should assume it sees the whole original session. Compaction can replace older content with a summary while retaining a recent tail. Selection does not pin raw entries outside Pi's active context. Branch navigation may return to a point before a compaction; a ref quoted in a summary is not proof that its original body remains available.

Hidden reasoning does not transfer as a dependable handoff. Write conclusions and relevant uncertainty explicitly.

## Choose The Execution Route

Once this skill is loaded, Reasoning uses no environment tools outside a qualifying `ACT_BOUNDED` scope. Source and skill reads, searches, diagnostics, experiments, edits, tests, builds, and substantive artifact production are execution. Profile switching is a control operation, not environment execution.

Every agent-requested Automatic profile transition must use `freeflow_switch_profile`. Write the applicable transfer record first, in the same assistant response as the call. The switch must be that response's only tool call.

An **execution unit** is coherent work ending in one assessable result. It may contain several environment interactions. It is not a tool-call quota or a Working Record Slice.

A **delegation boundary** keeps Reasoning responsible for governing judgment across delegated units. At most one is open:

```text
Boundary state: NONE | OPEN
Boundary operation: NEW | REOPEN | CLOSE
```

Recover its state from visible transfer records, not the current profile. `RETURN` leaves it open; only Reasoning closes it. Task memory preserves work, not routing authority.

Choose the route from the work:

| State | Route |
| --- | --- |
| No environment work needed | Remain in Reasoning and discuss, assess, answer, or wait. |
| Boundary NONE; one small, exact, local, reversible, low-risk, directly verifiable result | `YIELD` may transfer the whole ordinary result to Standard. |
| Boundary OPEN, or work needs Reasoning's later judgment | `DELEGATE` to Standard. |
| Judgment and action are materially inseparable, and delegation would lose essential judgment | Consider `ACT_BOUNDED` under its conditions below. |

Use Delegate when uncertain. Never Yield inside an open boundary or close a boundary just to obtain Yield. Do not silently carry a boundary into a distinct activity; reconcile changed direction or authority through Workflow.

## Reasoning: Give Standard A Decision-Complete Contract

Work out the next approach before delegating. Give Standard enough direction to execute resourcefully without settling an unresolved governing decision. Plan for unequal model capabilities: make critical premises and instructions explicit without lowering acceptance or micromanaging Standard's local choices.

A useful contract communicates:

- the outcome or question and why it matters;
- established facts versus hypotheses;
- the concrete approach, relevant sources, required ordering, and invariants;
- permitted local choices and excluded effects;
- required evidence and any material shared context;
- the assessable result or condition that requires return.

For discovery, name the uncertainty and the smallest observation that distinguishes meaningful alternatives. For implementation, explain the supported correction rather than handing over only an objective. Do not invent APIs, paths, or exact edits before their premises are known.

Keep straightforward work together. Shorten the unit when an unfamiliar seam, uncertain observer, or repeated misunderstanding could invalidate dependent work. A fixture must exercise the required path, not manufacture the behavior it claims to prove.

### Request Evidence Without Limiting Standard's Judgment

Reasoning may name known refs or describe evidence it expects to need: the resulting diff, an actual test result, a governing contract, or a relevant assistant-authored proposal. Describe future evidence by purpose; its refs do not exist until the host exposes completed entries.

**Requested evidence is a requirement, not an exclusive allowlist.** Standard must satisfy it where possible and add other material evidence needed for judgment. A contract requesting a passing test does not justify omitting a later failure or contradictory observation.

Do not require redundant resubmission of already-retained refs. If a requested ref is unavailable, stale, or invalid for the intended selection field, Standard must report the limit rather than invent a replacement or misuse `shared` to bypass validation.

### Open Or Continue Delegation

For a new boundary, write:

```text
DELEGATE
Boundary operation: NEW
Boundary state: OPEN
```

Use `REOPEN` instead of `NEW` only for the same previously closed outcome under fresh authority and changed evidence or intent. Identify that outcome.

For another unit within the same open boundary:

```text
DELEGATE
Boundary state: OPEN
```

Follow with the contract, then call `freeflow_switch_profile` targeting `standard`. Do not submit a projection payload on entry to Standard.

## Standard: Execute And Keep Evidence Selectable

Execute only the active Yield or Delegate contract. Use the current owner's method; a profile does not replace implementation, diagnosis, verification, or review guidance.

Within the contract, choose local mechanics, inspect adjacent evidence that changes the answer, correct understood local errors, and recommend better approaches. Return before adopting an uncovered effect or changed governing direction.

Use [Action Selection](../../skills/action-selection/SKILL.md) for environment interactions; read its body when the exact method is absent. Take its fast path for known mechanical work. When an interaction is broad, uncertain, or repetitive, choose the smallest action that can change the decision. Do not narrate internal planning or keep collecting unchanged evidence.

Use [Verify Work](../../skills/verify-work/SKILL.md) to determine what observations prove. Check that requested cases and observers actually ran. A green suite does not establish a test that was never added, and a successful write confirms mutation—not the correctness of the resulting artifact.

Once evidence supports the unit's result, silently self-review it through the current owner's method. Correct a clear covered defect and recheck the affected state. Do not report intended changes as actual changes or claim the wider outcome accepted.

### Track Ref Meaning During The Block

As entries complete and receive refs, keep track of what each available ref represents and what it establishes. Consider the whole block, not only its last tool result.

Eligible material can include:

- tool results: source reads, diffs, checks, diagnostics, and returned subagent reports;
- earlier completed assistant-text entries: a draft, finding, interpretation, or proposal that Reasoning needs to inspect.

Use only refs actually exposed for eligible entries in the current view. A ref identifies an entry, not necessarily one tool invocation or an arbitrary paragraph. Do not derive refs from filenames, tool-call IDs, session storage, or an old summary. Do not invent refs for hidden reasoning or the not-yet-completed handoff.

This is evidence awareness, not another ledger. Do not print a ref inventory after every call, create a separate evidence store, or reread material merely to manufacture new refs.

### Select For Judgment, Not Volume

Before every handback, reassess the eligible entries already visible:

1. Identify what the contract required Reasoning to inspect.
2. Identify additional material facts, failures, contradictions, partial effects, and uncertainty uncovered during execution.
3. Select the smallest sufficient evidence set that lets Reasoning judge those points without relying only on the handoff's claims.
4. Leave redundant exploration, superseded content, and irrelevant output unselected. Do not omit material adverse evidence to make the result look successful or smaller.

When a material inclusion is uncertain, favor enough evidence for sound judgment over a cosmetically minimal payload. Do not append every ref just because it exists.

Use the switch payload fields by purpose:

| Field | Select |
| --- | --- |
| `projection.include` | Eligible completed Standard evidence needed to judge the work, from the current or earlier blocks: resulting code or diffs, verification, diagnostic facts, contradictions, and relevant assistant text. |
| `projection.shared` | Task background needed across subsequent work: applicable instructions, accepted specs or plans, governing contracts, constraints, and task-memory reads. |
| Neither | Redundant or irrelevant entries, material already adequately retained, and output that no longer supports a current claim. |

Choose by purpose, not by the age of the entry. Earlier-block refs remain usable only when currently exposed, completed, and valid on the active branch; neither field permits arbitrary session lookup or resurrection of compacted-out bodies. Both fields accumulate along the applicable session ancestry. `include` is not single-use, and `shared` is not permanent residency. Pi's compaction and branch boundaries still apply. Keep arrays deduplicated and do not place the same ref in both fields.

A skill or task-artifact read is an ordinary selectable entry, not an automatic permanent instruction store. Share it when later work needs its exact content and it is not already adequately available. Selecting external text or a reviewer proposal does not promote it into authority.

The current handoff and required native dependencies are retained automatically. Do not invent a self-ref or select every call/result dependency manually. Omitted or empty projection adds no discretionary evidence; earlier applicable selections remain. It does not mean “send the whole Standard block.” When projection is disabled, omit the projection payload rather than fabricating refs.

For example: if the contract asks for changed code and verification, select the resulting diff and relevant checks, including a remaining failure. Share a newly read governing contract when later units need it. A directory listing, obsolete draft, and write acknowledgement need not accompany an already-evidenced result. An earlier assistant proposal belongs in the selection when Reasoning must judge that proposal itself, not merely because Standard wrote it.

## Standard: Hand Back At The Stop Condition

Return when the unit's result is available, a selected stop point is reached, a material decision exceeds the contract, execution cannot safely continue, or a fresh user message arrives.

For a normal completed unit, finish its covered verification and self-review before handback. For an interrupted or blocked unit, preserve what actually happened and what remains unverified; do not continue working to improve the appearance of completion.

Prepare the handoff in this order:

1. Stop further environment work at the covered boundary.
2. Reassess and select available evidence for the whole unfinished or completed block.
3. Write the result, supporting observations, limits, partial effects, and reason for returning. State requested evidence that is still missing.
4. Call `freeflow_switch_profile` targeting `reasoning`, with the selected `projection.include` and `projection.shared` refs when applicable.

Under Delegate, write the literal fields:

```text
RETURN
Boundary state: OPEN
```

Under Yield, write `YIELD HANDOFF`; Yield does not open a delegation boundary.

**Write the handoff as assistant text in the same response as the switch call.** The `reason` argument is an audit label, not a substitute for the handoff. The switch must be that response's only tool call.

Do not replay raw evidence bodies in the handoff to evade selection. Communicate conclusions and responsibility, with refs carrying the inspectable material. After requesting the switch, stop Standard execution. Do not impersonate Reasoning's assessment, close the boundary, append a new delegation, or assign yourself another unit.

### A Fresh User Message Stops Work, Not Evidence Preservation

If a user message arrives in Standard, finish only the current atomic environment interaction. Before switching, reassess the already-visible eligible refs for the unfinished block—including earlier assistant text, not just tool results.

Preserve the evidence Reasoning needs to understand completed work, failures, partial mutations, and remaining uncertainty. Honor the contract's evidence requests where the available state permits, and add other material evidence. The new user message is already retained; it needs no fabricated ref.

Do not start another read, test, edit, or retrieval to complete the evidence set. Do not answer the new request, reinterpret it as a new Standard contract, or continue because it says “continue.” Report unavailable or unfinished evidence, write the handoff, and switch to Reasoning.

For example: interrupted after an edit but before verification, select the available mutation/result evidence, state that verification has not run, and hand back. Do not run the missing check or report a pass. An interruption must not become an empty-selection shortcut that silently discards material evidence already available.

## Reasoning: Assess The Received Evidence

After a successful handback, compare the actual received evidence with the contract and accepted outcome. Do not assume an omitted Standard block is visible or that a fluent report establishes its claims.

Ask:

- Did the work satisfy the goal and constraints, not merely the suggested steps?
- Do the selected artifacts and observations support the stated result at the required boundary?
- Are requested evidence, contradictions, unverified effects, or meaningful failures missing?
- Did Standard expose a mistaken premise, better mechanism, or flaw in the execution unit?
- Does the next action remain covered, or does it require a user-owned decision?

Selected assistant text and subagent reports retain their evidence limits. A claim about a diff is not the diff; a report that tests passed does not establish which assertions ran. If a material source or assertion must be inspected, delegate that focused follow-up rather than assuming it exists or performing an ordinary direct read in Reasoning.

When received evidence is insufficient, Reasoning may request a context-only follow-up by naming the evidence needed—such as existing test output, failure details, or an earlier assistant proposal—without knowing its refs. Standard reassesses its already-visible eligible entries, selects the requested evidence plus other material context, reports anything unavailable, and hands back. Do not reread files, rerun checks, or retrieve omitted history unless the contract authorizes that work.

Use `projection.include` for additional eligible Standard evidence, including refs from earlier blocks. Reserve `projection.shared` for task background; an old test result does not become background merely because it came from an earlier block. Do not fabricate refs or infer an available body from a summary. If the original material is no longer visible or eligible, report that limit so Reasoning can choose a bounded investigation.

Reuse adequate verification and local self-review. Supply governing judgment without automatically repeating a full identical review. Do not require identical implementation style or turn imagined improvements into unfinished work.

Route narrowly:

- supported but incomplete work → the next coherent delegated unit;
- missing evidence → the smallest covered observation that can resolve it;
- clear covered defect → a bounded correction and affected verification;
- unclear or repeated failure → [Diagnose Failure](../../skills/diagnose-failure/SKILL.md), reconsidering the observer and execution demands;
- changed authority or a user-owned choice → Workflow or [Decision Gate](../../skills/decision-gate/SKILL.md);
- separately selected implementation/artifact review → [Review Work](../../skills/review-work/SKILL.md) or [Review Artifact](../../skills/review-artifact/SKILL.md).

Repeated failure despite concrete direction is not a reason to lower acceptance or iterate indefinitely. Preserve the limitation and reconsider the approach or user-controlled compute configuration through Workflow.

### Close Only Supported Work

When the delegated outcome is supported and self-reviewed, with selected checkpoints and material contradictions resolved, write:

```text
CLOSE
Boundary state: NONE
Current owner: unchanged
```

State the result and material limits proportionately. Closing leaves Reasoning active and does not complete a Working Record Slice or authorize delivery by itself.

Do not close an unsupported boundary merely to clear routing state. Preserve why it remains unresolved and return changed activity or authority to Workflow.

## Yield A Complete Ordinary Result

Use Yield only with Boundary NONE and the small, exact, local, reversible, low-risk, directly verifiable conditions above.

Write `YIELD` with the outcome, constraints, evidence, and stop condition, then switch to Standard. Standard executes, verifies, self-reviews, selects evidence, writes `YIELD HANDOFF`, and actually switches back to Reasoning. The same interruption and failure rules apply.

If broader investigation or a governing decision becomes necessary, hand back instead of turning Yield into an unannounced delegation. Reasoning accepts a supported result or chooses the next route. Yield never opens or closes a delegation boundary.

## Act Bounded Only When Delegation Loses Essential Judgment

`ACT_BOUNDED` is the sole direct Automatic Reasoning execution route. Both conditions must hold:

1. judgment and action or artifact production are materially inseparable;
2. shared-session delegation would cause a concrete material loss warranting direct Reasoning execution.

Task size, convenience, fewer switches, a demanding quality bar, or preference for the stronger model is insufficient. Ordinary inspection, implementation, verification, and cleanup remain Standard work.

Synthesis may qualify when the synthesis is itself the artifact: a decision-complete delegation would require Reasoning to produce essentially that artifact and Standard merely to transcribe it. Sensitive result-by-result intervention may qualify when evolving judgment cannot usefully be separated from bounded action.

Before acting, write `ACT_BOUNDED` and name the scope, expected result, existing authority, stop condition, inseparable judgment, and concrete loss from delegation. Perform only that work while the justification holds. End the scope at completion, interruption, context loss, changed authority, or loss of eligibility, and before delegating again.

An Act Bounded scope creates no delegation boundary. It may contribute to an open one but cannot contain Delegate, operate while Standard executes, or close the boundary. It is not a fallback around a failed switch.

## Preserve Continuity And Failure Boundaries

### Manual Changes

A user control change takes effect at a safe boundary, not during an atomic interaction. Preserve the current result, contract, and unverified effects. Suspend an open Automatic boundary rather than implying it completed. The held profile runs ordinary Workflow without projection or automatic handbacks.

Releasing Manual returns to Automatic Reasoning; reconcile the suspended work before delegating. A failed release leaves the hold in force. Manual execution does not automatically share all its history on later Automatic re-entry: profile-based selection still governs Standard-attributed evidence in the active context.

### Failed Transitions Or Projection

A failed switch authorizes no workaround:

- failed Yield or Delegate entry → Standard has not begun the assigned work;
- failed Standard handback → Standard stops at handback; it may not take over user interaction or governing judgment;
- rejected or unavailable projection → preserve the error and missing evidence; do not drop refs, disable projection, fabricate a full-context return, or retry merely to force progress.

Use host-reported control/profile state, not an assumed successful transfer. Preserve the open boundary and partial effects. Reasoning cannot execute directly to bypass a routing failure; any later Act Bounded scope must independently qualify.

### Context Loss Or Session Navigation

After compaction, resume, navigation, interruption, or uncertain continuity, recover before task execution:

- latest control/profile and current owner;
- live authority, active contract, and explicit boundary state;
- completed and partial effects, remaining evidence, and stop conditions;
- which material is actually visible as a body, rather than only named by a summary or old ref.

Use [Track Work](../../skills/track-work/SKILL.md) when ongoing work has a Working Record. A record or summary is memory, not new authority or proof that old refs remain selectable. Load required methods whose exact bodies are absent; do not assume a previously shared read survived compaction.

Required environmental recovery reads still use Standard through a supported route. If authority or route identity cannot be recovered well enough to select it, stop through Workflow. Do not invent Boundary NONE, open a replacement boundary, or invoke Act Bounded because recovery is uncertain.

A recovery-only unit returns recovered state; it does not authorize the next implementation unit. Preserve useful existing decisions and evidence instead of restarting the task.

## Stop At The Supported Boundary

Yield ends with handback, Delegate ends when Reasoning closes supported work, and Act Bounded ends at its declared stop condition. A recommendation does not authorize the next action.

When Cognitive Routing is inactive or control is Manual, retained Automatic instructions must stop directing work. Use current host state and ordinary Workflow, not shadow profile leadership.
