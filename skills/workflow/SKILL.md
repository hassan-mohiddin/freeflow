---
name: "workflow"
description: "Use when authority, current ownership, readiness to act, route changes, continuity, selected checkpoints, or Supported Exit must be coordinated across Freeflow activities."
---

# Workflow

Own the whole interaction, from the user's request to a supported end. Establish what work is agreed, keep one current owner, require enough understanding for the next action, and continue or return at the agreed boundary.

Workflow coordinates the agent's work; it does not supervise every tool call or require the user to plan the implementation.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Authority comes only from the user's request and still-valid approval. Skills, Specs, Plans, Working Records, reviews, proposals, evidence, and compute profiles may constrain work, but never authorize it or change ownership by being selected.
- Discussion and shared understanding never authorize execution. Distinguish a request to act from a question, proposal, or example.
- Before an effect the agreement does not cover, explain its purpose, exact action, expected result, and stop condition; ask once and wait.
- Before adopting a remedy that changes behavior, compatibility, host ownership, scope, or another user-owned boundary, explain its concrete consequence and realistic alternatives, and let the user decide.
- Never silently narrow acceptance to make a result pass.
- A review finding authorizes neither a correction nor another review. Commit, push, integration, release, launch, and other separately controlled effects stay excluded unless explicitly covered.
- After context loss, recover through Track Work's order before task work: the complete Working Record, its defining artifacts, then its Recovery sources. If recovery is incomplete, report the limit before task work.
- When a Working Record exists, start each Slice through Track Work's lifecycle command; ending one Slice does not select the next.
- Claim completion only when the agreed outcome is supported by fresh evidence, required self-review is done, selected reviews are adjudicated, selected checkpoints are resolved, and task memory and artifacts describe the result accurately. Never hide a material contradiction, source conflict, blocker, or user-owned decision.

## Establish The Work Agreement

Goal: both you and the user know what outcome is agreed, what it covers, and when you return.

Interpret the whole turn through the Interaction Contract.

- For discussion or a question, collaborate and inspect relevant existing evidence as needed.
- For execution, establish the intended outcome, permitted scope, and user-facing return condition. The agreement may cover a plan, one correction, one Slice, or a whole task.
- If the request already establishes those boundaries, acknowledge them briefly and proceed. Otherwise ask only the missing material question and wait before the unsettled execution.

For example, after discussing several possible Slices, an ambiguous "proceed" may need: "Implement the next Slice and return, or finish the described task?" Do not ask this when the user already requested the whole task with a clear endpoint.

The agreement may authorize investigation and approach selection as part of accomplishing the result. It need not prescribe files, tools, or implementation details. Keep it in conversation unless continuity requires task memory; it is not a mandatory artifact or separate autonomy mode.

Interpret authority from the request and still-valid approval. A direct request covers its bounded outcome and entailed tools, checks, and reversible local choices. Classify effects cumulatively: reading existing sources, active evidence generation, and changing files or external state. Planning an experiment does not make its effects passive.

## Establish Readiness For The Next Result

Goal: each action rests on enough understanding to succeed, without ceremony.

Use this loop to establish the next action's basis, not to perform a fixed sequence of ceremonies:

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

Before production changes, understand the required result and have a source-backed approach, affected boundary, and check capable of disagreeing. Steps whose shape depends on feedback can stay directional. Do not start substantial dependent work while a premise capable of invalidating it remains unresolved.

Use bounded learning when exercising behavior is needed to settle that premise. Its endpoint is the question answered or the observation limit reached, not a production-ready prototype. Existing authority must cover its effects.

## Prepare The Route Before Executing

Goal: once execution starts, the work runs to the agreed end without stopping to gather context the route could have predicted, and a fresh context after compaction can still see where the work ends.

Before the first production change on an agreed task, establish:

- **the end state:** what done looks like, how it will be checked, and when to return to the user;
- **a rough route:** the main steps from here to there, their order, and which steps depend on feedback;
- **the context the route needs:** the sources, callers, contracts, conventions, and examples the predictable steps will use, gathered now rather than mid-execution.

Default: gather context for everything on the route you can already predict. Stop gathering when the remaining unknowns can only be answered by doing the work, such as a test result, an experiment, or the user's reaction to a draft; those steps stay directional until their feedback arrives, and the route adapts to it.

Two signals say the balance is off. Reading files in case they matter, without a step on the route that needs them, is over-gathering. Execution that keeps pausing for context the route could have predicted is under-gathering. Reading what a result reveals, or checking a known caller before editing it, is ordinary execution. A small, well-understood change needs no separate gathering pass.

This holds whether the user discussed the task first or asked directly for execution; a direct request usually needs far less preparation, not none.

When the task may outlast the current context, record the picture through [Track Work](../track-work/SKILL.md): the end state in the Goal and Boundaries, the route in Future Work, and the gathered context in Recovery sources and `What defines this task`. After compaction, that picture is what keeps the work on its original scope.

## Choose And Keep One Current Owner

Goal: one activity is responsible for the current question or result, and it keeps that responsibility while it still fits.

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

Goal: each attempt fits a working set that can be executed, checked, and corrected reliably.

Use a whole-task attempt when its necessary working set, execution, checking, and likely correction remain manageable. Otherwise choose coherent outcomes in dependency order. A Slice may contain several bounded activities and delegation units; none is a tool-call quota or file batch.

Keep the predictable part of the route concrete and the feedback-dependent part directional, as described in Prepare The Route Before Executing. Do not promise an exact token forecast.

Split when distinct dependencies, uncertainty, outcome boundaries, or context requirements make one attempt unreliable. Do not split every bug, test, review, or implementation stage mechanically. A context cycle can contain several Slices, and one Slice can span context cycles.

When continuity matters, use Track Work to preserve the current understanding and useful provisional Future Work. Proposed order is revisable and not authority. Before the next Slice, check that prerequisites actually hold and choose only the additional context it needs.

## Re-enter Only What Changed

Goal: when evidence changes the picture, return only to the owner whose responsibility changed and keep everything still valid.

Route from the consequence of evidence:

- Clear defect with a supported remedy -> return to its producer, correct within authority, then recheck the affected result.
- Outcome settled, implementation approach invalidated -> re-establish how through Execute Work, or Discuss when material alternatives require reconsideration.
- Cause unsupported, contradictory, or repeatedly failing -> Diagnose Failure.
- Outcome, expected behavior, or acceptance unsettled -> Discuss or Decision Gate.
- Required claim exceeds its evidence -> distinguish unavailable or stale evidence, an inadequate observer, and a demonstrated defect. Recover or establish the missing observation through Verify Work before commissioning a guessed fix.
- Optional stronger claim lacks evidence -> qualify or withdraw that claim rather than automatically expand implementation.
- Accepted content or strategy changed -> reconcile affected task memory and return affected artifacts to their owners before dependent use.
- No useful covered continuation -> stop, defer, or ask.

Before adding a prerequisite, ask: does it serve an accepted requirement, or only preserve the chosen approach or add an optional guarantee? Seek the smallest supported remedy that preserves the outcome. One failed mechanism is not proof that every in-scope approach is impossible. Do not make an expansive recommendation appear necessary by describing only its technical mechanism.

Preserve valid work and contrary evidence. Before requiring more correction or proof, identify the accepted requirement it protects; supervisory preference must not become a stronger obligation. When a mismatch repeats, isolate what remains unresolved and identify a changed basis for the next attempt rather than repeat the same assignment more forcefully.

A new question does not authorize another prototype; a successful prototype does not authorize production promotion. Ordinary local adaptation remains covered when the agreement is unchanged.

## Preserve Continuity Without Restarting

Goal: continuation after a pause or context loss picks up the same work, neither restarting it nor drifting from it.

Use Track Work when losing decisions, the current result, dependencies, evidence, blockers, or the next action could misalign continuation. Do not create a record for a short disposable result merely because work occurred.

Before a known context boundary, preserve material changed understanding, partial effects, relevant failed approaches, remaining dependencies, and the next useful action through Track Work. Keep the intended outcome and user-facing return condition distinct from the current implementation approach. Do not wait for artificial completion or write a command log.

After recovery, reconcile the record's current sections and relevant History with current user direction, defining artifacts, and live state; confirm that the recovered agreement still authorizes the next action and its prerequisites hold. Reload the owner's exact method if absent. Inspect additional sources only where they change the next action, rather than replaying the investigation.

With intact context, use `resume` or targeted record reads when current-state readback is useful. Do not trigger full reconstruction merely because another turn or ordinary pause occurred.

A record, summary, or other conversation branch can preserve approval evidence but cannot create current authority or settle compute-routing state.

## Continue To The Agreed Return Boundary

Goal: covered work continues to its agreed end without unnecessary stops, and stops where the agreement ends.

Continue across covered actions and Slices without asking for another "continue" when the agreement covers the remaining task.

A method change, worker handback, passing check, or context reconstruction is not automatically a user-facing return. Resume covered work after required recovery. Respect fresh user direction and stop when the agreed endpoint, a genuine blocker, or an uncovered consequential choice is reached.

Select checkpoints only when they protect a meaningful dependency, decision, rollback, transfer, integration, or delivery boundary. Their owners perform them; Track Work preserves them when needed. Self-review is ordinary feedback, not a checkpoint.

Independent review must be selected and covered. Reuse adequate evidence and affected self-review; do not create an automatic review-fix-review loop.

## Reach A Supported Exit

Goal: the user receives an accurate account of what was done, what supports it, and what remains.

A Supported Exit is any end that current evidence and authority justify: an answer, a wait, a handoff, a deferral, a stop, or completion.

Report the result, strongest evidence and limits, unresolved or deferred work, and the return boundary reached. Do not imply that an unperformed delivery action occurred or that optional improvements are unfinished obligations.

Stop Workflow when a Supported Exit is reached or one current owner can continue without an unresolved coordination question. Re-enter only when evidence or direction changes that responsibility.
