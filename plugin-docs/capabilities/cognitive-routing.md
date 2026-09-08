# Cognitive Routing

Cognitive Routing changes compute and context placement for one active agent. It does not create another agent, transfer task ownership, widen authority, or replace Workflow.

## Host boundary and status

Cognitive Routing works in Pi and PiFlow when the host exposes the required model-state controls. Normal Pi uses its official model registry, model, thinking-level, and session-entry APIs; PiFlow uses its host-owned model-state lease.

The implementation is an experimental Pi/PiFlow capability. Deterministic runtime checks prove assembly, gating, host capability detection, persistence, and transition mechanics; behavioral model acceptance remains separate.

Cognitive Routing is effective only when:

1. Freeflow repository activation is valid;
2. Cognitive Routing is configured and enabled;
3. both profiles resolve to available, authenticated, distinct effective model/thinking pairs;
4. the host exposes the required model-state controls for its runtime.

Missing profiles, unavailable or unauthenticated models, invalid thinking levels, identical effective profiles, or host limitations leave routing unavailable rather than partially active.

## One agent, two participants, different views

`standard` and `reasoning` are distinct, separately configured model participants executing one at a time within one agent and canonical Pi session. They share the Workflow owner, authority envelope, accepted intent, and task-memory/evidence requirements—not private reasoning or necessarily identical visible history. A profile switch does not create independent review.

With Automatic context projection enabled, Standard sees Pi's ordinary active context. Reasoning receives required context, applicable user/Reasoning history, accumulated shared and selected evidence, and retained handoffs with native dependencies. Unselected Standard bodies are excluded by default; a retained call envelope or omission marker is not the original result. A narrow Standard assignment does not give it an isolated context window.

With `cognitiveRouting.contextProjection: false`, both profiles use ordinary Pi active context. Manual control bypasses projection. Selection is not pinning: it does not resurrect compacted-out bodies or override active-branch eligibility. Context Virtualization and Conversation History availability do not determine Cognitive Routing projection.

A profile is not a task owner and a transition or selected source is not an authorization source.

## Manual and automatic control

### Manual control

A manual hold lets the user keep `standard` or `reasoning` active. The held profile runs the ordinary unsplit Workflow and model-requested switching is blocked.

### Automatic control

Automatic control lets Cognitive Routing choose compute placement. Each new user interaction begins in Reasoning, and internal profile transitions are not user-selected cycles. Conversational Reasoning is the default and needs no route marker. All user-facing interpretation, discussion, decisions, questions, assessment, and reporting belong to Reasoning.

Before the full Cognitive Routing skill is visible, Automatic Reasoning reads that skill as its only environment action and stops. It does not interpret the current user request or perform task/evidence work until the read returns. If the read fails or is unavailable, routing stops and reports missing context.

For an authorized execution-bearing activity, Reasoning checks the current boundary first:

- With **no open boundary**, Yield may transfer one complete ordinary result, `ACT_BOUNDED` may act when independently qualified, and otherwise Delegate opens a boundary.
- With an **open boundary**, Delegate is the continuing route. Yield is not used; work that would qualify for Yield in isolation remains Delegate because Reasoning still owns the boundary. A qualifying `ACT_BOUNDED` scope may temporarily operate inside it.

Standard is used automatically only through Yield or Delegate. It never conducts substantive user-facing interaction; at every return condition it transfers state with `YIELD HANDOFF` or `RETURN` to Reasoning, which handles interpretation, questions, discussion, assessment, and reporting. The transfer records are control text, not user interaction. The target is cost-sensitive quality, not a claim of equivalence between profiles.

## Cognitive Execution Routes

```text
Workflow establishes authority, owner, and slice
-> Reasoning receives an authorized execution-bearing activity
   ├─ Boundary OPEN
   │  ├─ DELEGATE next decision-complete unit → RETURN; boundary remains open
   │  ├─ ACT_BOUNDED when independently qualified → reassess; boundary remains open
   │  ├─ suspend or route a contradiction, choice, or changed boundary
   │  └─ CLOSE only after the bounded result is supported and reviewed
   └─ Boundary NONE
      ├─ YIELD → Standard leads one complete result → YIELD HANDOFF → Reasoning
      ├─ ACT_BOUNDED when independently qualified → Reasoning acts directly
      └─ DELEGATE → open a model-written boundary; Standard executes
```

Under automatic control, Yield has no Cognitive Routing execution boundary and is forbidden while one is open. Delegate opens one with `NEW` or `REOPEN`; `RETURN` leaves it open and only Reasoning closes it. `ACT_BOUNDED` creates no execution boundary, may operate inside or outside Delegate, and never contains Delegate or closes its boundary. A closed boundary may be reopened only for the same authorized outcome with fresh authority and invalidating evidence or changed intent.

Delegation transfers bounded execution, not the governing boundary. Standard can challenge a mistaken premise but must not silently adopt a changed governing direction, expand scope, hide contrary evidence, or continue past its unit return condition.

The user's work agreement, a delegation unit, and a Track Work Slice are different boundaries. An internal handback does not end an agreement to finish the task. Reasoning can continue covered units without another user confirmation; a new user-owned choice or uncovered effect still requires a stop.

## Contracts and evidence

Reasoning delegates the missing understanding or a supported change: a named outcome uncertainty, a bounded approach investigation, or concrete implementation with relevant invariants and checks. It distinguishes accepted requirements from suggested mechanics and makes superseding scope/order/return instructions explicit. Uncertain observers and repeated mismatches warrant smaller decision-bearing units, not increasingly long restatements of the same assignment.

Standard reports from actual final artifacts and observations, separating implemented behavior, exercised checks, and unresolved requirements. Evidence must match the reported candidate; fresh test output paired with superseded code does not establish completion. A missing result can require evidence recovery rather than another implementation fix.

When projection is applicable, the exposed switch tool accepts optional selections:

- `projection.include`: completed eligible Standard evidence needed to assess the result, including actual tool-result bodies and relevant assistant text;
- `projection.shared`: eligible task background needed across later units, such as instructions, accepted artifacts, constraints, and task-memory reads.

Both fields accumulate along applicable ancestry. References must be actually exposed, completed, eligible, and deduplicated within and across the arrays. A tool-call ref does not substitute for its result body. Missing, stale, or adverse evidence remains explicit; successful reference validation does not prove semantic sufficiency.

The current successful handoff and required native dependencies are retained automatically. On an explicitly authorized corrected retry, Standard must select the earlier substantive handoff's eligible assistant-text ref when that report is needed, alongside still-valid evidence. A short retry explanation is not the earlier report. Failure alone does not authorize retry, evidence removal, or disabling projection.

## Direct Reasoning execution

Reasoning's conversational work is the default and needs no route marker. Outside an explicit `ACT_BOUNDED` scope, Automatic Reasoning performs no environment interaction, active evidence generation, mutation, tests, diagnostics, builds, probes, or substantive artifact production. Use Yield for a complete ordinary result and Delegate when Reasoning must assess evidence or retain cognitive leadership.

`ACT_BOUNDED` is the only direct execution route for Automatic Reasoning. It requires judgment and environment action to be materially inseparable and shared-context delegation to cause material loss beyond premium execution cost. The named scope may contain the related environment tools and execution needed for its result, but it creates no boundary, changes no owner, and grants no authority. It may contribute evidence to an open Delegate boundary but cannot close it.

The scope ends at its stop condition, interruption, context loss, or material scope change. Recover before selecting a fresh route after context loss. Ordinary inspection, research, edits, tests, builds, verification, documentation, and cleanup belong to Standard through Yield or Delegate.

## Controls and history

While Pi or PiFlow is idle, use:

```text
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
/freeflow profile history
/freeflow profile history active
/freeflow profile history anomalies
```

- `standard` and `reasoning` create manual holds;
- `auto` releases the hold and returns automatic control to the Reasoning profile;
- history commands expose read-only transition evidence.

### Pi and PiFlow keyboard shortcuts

While either host is idle:

- `Ctrl+Shift+R` cycles the manual standard/reasoning hold. It switches to the other active profile and keeps manual control.
- `Ctrl+Shift+A` sets automatic control. It releases a manual hold and moves to Reasoning when necessary; repeating it while already automatic is idempotent.

Both hosts expose these controls when their required model-state APIs are available. Profile changes remain unavailable while the host is running.

Use the host-supplied Runtime State for current `Control` and `Profile`, not model identity or transition history. A Runtime State refresh is not a human interruption and does not cancel the active contract. Provider/model/lease implementation details are not routing authority; any projection-status display must be interpreted at its supported runtime boundary.

Agents may request one bounded automatic transition through:

```text
freeflow_switch_profile(target="reasoning" | "standard", reason="...")
```

The request changes compute and may carry applicable context selections; it never authorizes a task action. The full [Cognitive Routing skill](../../capabilities/cognitive-routing/SKILL.md) owns the transfer protocol and eligibility rules.

## Failure behavior

- Missing current state is unavailable; do not infer it from model identity or old transitions.
- A failed switch does not silently expand Reasoning or Standard’s role.
- A Yield handoff transfers the profile back to Reasoning without creating an execution boundary.
- A delegated return resumes the same open boundary; it is not a new boundary.
- Closing a delegated boundary leaves Reasoning active; it does not hand leadership to Standard.
- A closed boundary is reopened only for the same authorized outcome when fresh authority and invalidating evidence or changed intent require it.
- Transition history reports unresolved or anomalous evidence instead of fabricating a cause.
- A native Pi model or thinking-level selection suspends routing until explicit reactivation; partial transitions roll back or remain blocked with persisted evidence.

## Recovery

After context loss, recover current control/profile, the user agreement, active assignment and superseded directions, explicit delegation-boundary state, partial effects, evidence limits, and stopping conditions. Required environment reads still follow the compute route. When a Working Record exists, read its complete `full` view and reconcile it with current sources; task memory cannot recreate routing authority or make old refs selectable.

Keep separate that a prior check occurred and whether it applies to the current candidate. Recover missing source bodies through a permitted bounded route rather than reconstructing exact evidence from a summary or automatically rerunning checks. Resume only the narrowest covered work whose state is coherent.

## Evidence boundary

Cognitive Routing documentation and deterministic tests establish contracts and delivery mechanics. They do not establish that model behavior is universally improved, that every transition is optimal, or that the capability is production-ready.

## Related documentation

- [Capabilities](README.md)
- [System prompt architecture](../prompt-architecture.md)
- [Workflow](../workflow.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
- [Release evidence](../release-evidence/README.md)
