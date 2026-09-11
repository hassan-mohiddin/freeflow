---
name: "workflow"
description: "Use when authority, current ownership, readiness to act, route changes, continuity, selected checkpoints, or Supported Exit must be coordinated across Freeflow activities."
---

# Workflow

Own the outer Interaction Lifecycle. Establish what work is agreed, keep one current owner, require enough understanding for the next action, and continue or return at the agreed boundary.

Workflow coordinates the agent's work; it does not supervise every tool call or require the user to plan the implementation. Skills, artifacts, evidence, and compute profiles never create authority or change ownership merely by being selected.

## Establish The Work Agreement

Interpret the whole turn through the Interaction Contract. Distinguish discussion from a request to act.

- For discussion or a question, collaborate and inspect relevant existing evidence as needed. Do not turn shared understanding into implementation authority.
- For execution, establish the intended outcome, permitted scope, and user-facing return condition. The agreement may cover a plan, one correction, one Slice, or a whole task.
- If the request already establishes those boundaries, acknowledge them briefly and proceed. Otherwise ask only the missing material question and wait before the unsettled execution.

For example, after discussing several possible Slices, an ambiguous "proceed" may need: "Implement the next Slice and return, or finish the described task?" Do not ask this when the user already requested the whole task with a clear endpoint.

The agreement may authorize investigation and approach selection as part of accomplishing the result. It need not prescribe files, tools, or implementation details. Keep it in conversation unless continuity requires task memory; it is not a mandatory artifact or separate autonomy mode.

Interpret authority from the request and still-valid approval. A direct request covers its bounded outcome and entailed tools, checks, and reversible local choices. Classify passive observation, active evidence generation, and mutation or delivery cumulatively. Planning an experiment does not make its effects passive.

Before an uncovered effect, explain its purpose, exact action, expected result, and stop condition; ask once and wait. Specs, Plans, Working Records, reviews, proposals, and useful evidence may constrain work but cannot authorize it.

## Establish Readiness For The Next Result

Use the Feedback Loop to establish the next action's basis, not to perform a fixed sequence of ceremonies:

```text
Orient or reconstruct current state
-> WHAT: establish the required outcome and constraints
-> HOW: establish a supported approach for the next coherent unit
-> act through the current owner
-> verify what happened
-> self-review the supported result
-> continue, re-enter, ask, stop, or complete
```

These are questions to resolve, not mandatory separate reads, documents, or user turns. Reuse understanding that remains supported. One observation can answer both what and how. A factual answer or discussion can exit without implementation.

Before production changes, the agent must understand the required result and have a source-backed approach, affected boundary, and check capable of disagreeing. Do not demand every future file or detail before the next unit. Do not start substantial dependent work while a premise capable of invalidating it remains unresolved.

Use bounded learning when exercising behavior is needed to settle that premise. Its endpoint is the question answered or the observation limit reached—not a production-ready prototype. Existing authority must cover its effects.

## Choose And Keep One Current Owner

Choose the narrowest activity whose responsibility matches the current question or result.

- [Discuss](../discuss/SKILL.md) owns open direction, alternatives, assumptions, and collaborative outcome or approach decisions.
- [Decision Gate](../decision-gate/SKILL.md) resolves one known user-owned choice or material source conflict.
- [Execute Work](../execute-work/SKILL.md) owns concrete work, including bounded implementation preparation, execution, and in-Slice continuation.
- [Diagnose Failure](../diagnose-failure/SKILL.md) establishes unsupported or repeatedly failing causes before correction.
- [Verify Work](../verify-work/SKILL.md) establishes factual support; [Review Work](../review-work/SKILL.md) and [Review Artifact](../review-artifact/SKILL.md) judge resulting work and guiding artifacts.
- [Track Work](../track-work/SKILL.md) owns Working Record creation, reconstruction, reconciliation, and lifecycle.
- [Write Spec](../write-spec/SKILL.md) owns durable accepted content; [Write Plan](../write-plan/SKILL.md) owns a sufficiently settled ordered strategy.
- [Migration Work](../migration-work/SKILL.md) owns movement of consumers, state, or traffic.
- [Commit Work](../commit-work/SKILL.md), [Handoff](../handoff/SKILL.md), [Finish Branch](../finish-branch/SKILL.md), [Release Work](../release-work/SKILL.md), and [Launch Work](../launch-work/SKILL.md) own their selected preservation or delivery boundaries.

[Design for Depth](../design-for-depth/SKILL.md) supplies a lens where design matters. [Simplify Code](../simplify-code/SKILL.md) and domain guidance may supply an execution method without becoming another owner. Verify Work supplies test-design guidance when checks must be designed; a formal test-first sequence is not required. [Bypass](../bypass/SKILL.md) reduces explicitly selected optional pressure, not authority or evidence requirements.

When the owner needs an environment interaction and the action or tool choice is not already obvious, use [Action Selection](../action-selection/SKILL.md). It returns the observation and state change to the same owner. Read [Domain Skill Composition](references/domain-skill-composition.md) when specialized guidance is needed.

Keep the owner while its question, outcome, authority, and observing boundary remain coherent. Local implementation preparation does not require another discussion merely because a file or signature must be inspected. Cognitive Routing controls compute placement, not these responsibilities.

## Size Work By Context And Dependencies

Use a whole-task attempt when its necessary working set, execution, checking, and likely correction remain manageable. Otherwise choose coherent outcomes in dependency order. A Slice may contain several bounded activities and delegation units; none is a tool-call quota or file batch.

Keep the task horizon directional: outcome, major dependencies, and proposed remaining Slices. Make the current unit concrete enough to execute. Do not research all later work now or promise an exact token forecast.

Split when distinct dependencies, uncertainty, outcome boundaries, or context requirements make one attempt unreliable. Do not split every bug, test, review, or implementation stage mechanically. A context cycle can contain several Slices, and one Slice can span context cycles.

When continuity matters, use Track Work to preserve the current understanding and useful provisional Future Work. Proposed order is revisable and not authority. Before the next Slice, check that prerequisites actually hold and choose only the additional context it needs.

## Re-enter Only What Changed

Route from the consequence of evidence:

- Clear defect with a supported remedy -> return to its producer, correct within authority, then recheck the affected result.
- Outcome settled, implementation approach invalidated -> re-establish how through Execute Work, or Discuss when material alternatives require reconsideration.
- Cause unsupported, contradictory, or repeatedly failing -> Diagnose Failure.
- Outcome, expected behavior, or acceptance unsettled -> Discuss or Decision Gate.
- Required claim exceeds its evidence -> distinguish unavailable/stale evidence, an inadequate observer, and a demonstrated defect. Recover or establish the missing observation through Verify Work before commissioning a guessed fix; do not silently narrow acceptance.
- Optional stronger claim lacks evidence -> qualify or withdraw that claim rather than automatically expand implementation.
- Accepted content or strategy changed -> reconcile affected task memory and return affected artifacts to their owners before dependent use.
- No useful covered continuation -> stop, defer, or ask.

Before adding a prerequisite, ask: does it serve an accepted requirement, or only preserve the chosen approach or add an optional guarantee? Seek the smallest supported remedy that preserves the outcome. One failed mechanism is not proof that every in-scope approach is impossible.

If a remedy changes behavior, compatibility, host ownership, scope, or another user-owned boundary, explain the concrete consequence and realistic alternatives before adopting it. Do not make an expansive recommendation appear necessary by describing only its technical mechanism.

Preserve valid work and contrary evidence. Before requiring more correction or proof, identify the accepted requirement it protects; supervisory preference must not become a stronger obligation. When a mismatch repeats, isolate what remains unresolved and identify a changed basis for the next attempt rather than repeat the same assignment more forcefully.

A new question does not authorize another prototype; a successful prototype does not authorize production promotion. Ordinary local adaptation remains covered when the agreement is unchanged.

## Preserve Continuity Without Restarting

Use Track Work when losing decisions, the current result, dependencies, evidence, blockers, or the next action could misalign continuation. Do not create a record for a short disposable result merely because work occurred.

Before a known context boundary, preserve material changed understanding, partial effects, relevant failed approaches, remaining dependencies, and the next useful action through Track Work. Keep the intended outcome and user-facing return condition distinct from the current implementation approach. Do not wait for artificial completion or write a command log.

After context loss or uncertain continuity, follow core recovery guidance and read the complete Working Record through Track Work's `full` view. Reconcile its current sections and relevant History with current user direction, defining artifacts, and live state; confirm that the recovered agreement still authorizes the next action and its prerequisites hold. If full recovery is unavailable or incomplete, report the limit before task work. Reload the owner's exact method if absent. Inspect additional sources only where they change the next action, rather than replaying the investigation.

With intact context, use `resume` or targeted record reads when current-state readback is useful. Do not trigger full reconstruction merely because another turn or ordinary pause occurred.

A record, summary, or other conversation branch can preserve approval evidence but cannot create current authority or settle compute-routing state.

## Continue To The Agreed Return Boundary

Continue across covered actions and Slices without asking for another "continue" when the agreement covers the remaining task. Starting a new Slice still requires Track Work's lifecycle operation when a record exists; closure alone does not select it.

A method change, Standard handback, passing check, or context reconstruction is not automatically a user-facing return. Resume covered work after required recovery. Respect fresh user direction and stop when the agreed endpoint, a genuine blocker, or an uncovered consequential choice is reached.

Select checkpoints only when they protect a meaningful dependency, decision, rollback, transfer, integration, or delivery boundary. Their owners perform them; Track Work preserves them when needed. Self-review is ordinary feedback, not a checkpoint.

Independent review must be selected and covered. Findings do not authorize correction or another review. Reuse adequate evidence and affected self-review; do not create an automatic review-fix-review loop. Commit, push, integration, release, launch, and other separately controlled effects remain excluded unless explicitly covered.

## Reach A Supported Exit

Claim completion only when the agreed outcome is supported by fresh evidence, required self-review is complete, selected independent reviews are adjudicated, selected checkpoints are resolved, and required task memory and artifacts describe the result accurately. No material contradiction, source conflict, blocker, or user-owned decision may be hidden.

Report the result, strongest evidence and limits, unresolved or deferred work, and the return boundary reached. Do not imply that an unperformed delivery action occurred or that optional improvements are unfinished obligations.

Stop Workflow when a Supported Exit is reached or one current owner can continue without an unresolved coordination question. Re-enter only when evidence or direction changes that responsibility.
