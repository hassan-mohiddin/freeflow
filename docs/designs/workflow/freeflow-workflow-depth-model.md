# Freeflow Workflow Depth Model

Date: 2026-06-22
Status: Implemented; current adaptive revision remains Unverified

2026-07-11 disposition: `discover` and `design-for-depth` are active, `/research` is not a compatibility alias, and the adaptive slice/route-check model is implemented. Behavioral evaluation of the revised snapshot remains pending; current plugin docs and live skills override this planning-era note.

## Purpose

Define how Freeflow should connect discovery, design, artifacts, execution, review, verification, and diagnosis without turning the workflow into either a rigid linear ceremony or a set of shallow disconnected skills.

This note captures the current discovery/design direction. The owner accepted proceeding toward an implementation plan on 2026-06-22 after artifact review identified that command/skill-surface changes need explicit approval. On the same implementation thread, the owner chose a hard migration to `discover` rather than an alias-first public model. It is not an accepted ADR and does not authorize implementation beyond the approved implementation-plan path by itself. Live repo evidence, accepted ADRs, plugin docs, evals, and explicit user decisions override this text.

## Source Context

This note comes from discussion and a focused research pass over:

- Freeflow current workflow docs and skills:
  - `docs/freeflow-runtime-and-lifecycle.md`
  - `skills/workflow/SKILL.md`
  - `skills/discover/SKILL.md`
  - `skills/decision-gate/SKILL.md`
  - `skills/write-spec/SKILL.md`
  - `skills/write-plan/SKILL.md`
  - `skills/review-artifact/SKILL.md`
  - `skills/execute-plan/SKILL.md`
  - `skills/review-work/SKILL.md`
  - `skills/diagnose-failure/SKILL.md`
- Matt Pocock `improve-codebase-architecture` skill and its architecture language.
- Software design references used as research input:
  - John Ousterhout, *A Philosophy of Software Design*: deep modules, shallow modules, information hiding, complexity.
  - David Parnas, information hiding: modules should hide design decisions likely to change.
  - Michael Feathers, seams: places where behavior can change without editing in that place.
  - Ports/adapters architecture: interfaces and adapters isolate core behavior from infrastructure variation.
- Prior comparison with Addy Osmani's `agent-skills` in `docs/handoffs/workflow-and-skills/2026-06-21-agent-skills-comparison-handoff.md`.

## Problem

Most modern agent workflow packs share a useful high-level lifecycle:

```text
choose the narrowest useful entry
-> execute a learning, delivery, or deepening slice
-> verify + route check
-> conditionally review, commit, hand off, integrate, release, or ship
```

This is better than direct implementation from a thin prompt, but it still fails in predictable ways:

- Discovery becomes a questionnaire or approval script instead of evidence-guided discussion.
- Agents capture too many decisions too early because every question has a recommended option.
- Specs and plans become polished fake certainty rather than current understanding with open decisions.
- Review loops become endless: review fails, agent patches immediately, review finds new issues, repeat.
- Review findings are treated as commands instead of evidence to adjudicate.
- Architectural problems show up late as edge-case churn, shallow modules, broad refactors from narrow comments, or repeated verification failures.
- Execution happens horizontally: write a large body of code, then try to make it pass.
- Skills duplicate cross-cutting rules, increasing drift and inconsistency.

The missing model is not “more process.” It is a reusable depth lens and clearer cross-skill ownership.

## Design Principle

Freeflow should be a connected feedback-loop system:

```text
discover / design when needed
-> conditional spec / rolling plan
-> meaningful slice
-> verify + route check
-> conditional checkpoint or delivery
-> backward edge whenever evidence invalidates the path
```

The workflow is not a one-way state machine. Any phase can route backward when new evidence reveals thin context, a user-owned decision, a source-truth conflict, bad design pressure, failed verification, or repeated review-loop failure.

## Naming Direction

The former `research` skill was broader than research. It covered evidence gathering, codebase exploration, web/source research, brainstorming, decision ledgers, and checkpointing.

Accepted direction:

- Use `discover` as the active skill and `/discover` as the public command/name for this phase.
- Do not keep `research` as a normal runtime concept.
- Historical research docs and ordinary “web/source research” wording can remain when they mean historical files or external-source work, not the Freeflow phase.

Rationale:

- “Research” sounds like a report-writing or external-source activity.
- “Discover” better covers codebase exploration, brainstorming, user discussion, and backward-flow recovery.

## Cross-Workflow Ownership

Use one owner per concept. Other skills should link to or briefly trigger the owner instead of copying full guidance.

| Concern | Owner | Other skills should do |
| --- | --- | --- |
| Adaptive routing, slice exits, backward edge | `workflow` | Route through it; do not restate the full lifecycle. |
| User-owned decisions and source-truth/path conflicts | `decision-gate` | Trigger it when decisions or conflicts appear. |
| Discovery, brainstorming, evidence, decision ledger, checkpoints | `discover` | Own deeply; other skills consume its checkpoint. |
| Deep/shallow modules, seams, adapters, locality, leverage | Proposed `design-for-depth` lens | Load/use it when design pressure appears. |
| Spec writing | `write-spec` | Convert agreed context into source-backed requirements and boundaries. |
| Plan writing | `write-plan` | Convert source truth into vertical slices, checks, checkpoints, and stop conditions. |
| Artifact review | `review-artifact` | Test whether specs/plans/notes are fit to guide work; use design lens where relevant. |
| Execution | `execute-plan` | Execute one verified slice at a time; route backward when slice evidence invalidates the plan. |
| Work review | `review-work` | Classify feedback before editing; detect design pressure and review-loop churn. |
| Failure/stuck-loop diagnosis | `diagnose-failure` | Diagnose bugs, failed checks, and repeated workflow/design loop failures. |
| Verification claims | `verify-work` | Own fresh evidence and unverified remainder. |
| Commit/push discipline | `commit-work` | Own staging, commit scope, generated/sensitive/user-owned changes, push safety. |
| Durable continuation | `handoff` | Preserve compact memory; never replace live inspection. |

## Design-For-Depth Lens

Create or centralize a reusable lens called `design-for-depth`.

The lens is not a mandatory phase before implementation. It is a judgment tool used when work touches module/interface shape, architecture direction, review-loop churn, repeated edge cases, or hard-to-test behavior.

### Core language

Use a small, stable vocabulary:

- **Module**: anything with an interface and implementation: function, class, package, subsystem, feature slice.
- **Interface**: everything a caller, user, test, or future agent must know to use the module correctly: types, invariants, ordering, errors, configuration, performance, and side effects.
- **Implementation**: details hidden behind the interface.
- **Depth**: leverage at the interface. Deep modules hide useful complexity behind a small interface.
- **Shallow module**: interface is nearly as complex as the implementation, or callers must coordinate too many details.
- **Seam**: where behavior, ownership, or variation can change without editing the surrounding work.
- **Adapter**: a concrete implementation satisfying an interface at a seam.
- **Locality**: change, bugs, decisions, and verification stay near one module instead of spreading across callers.
- **Leverage**: future work gets more behavior from less interface knowledge.

### Core tests

Use these tests when shaping or reviewing work:

- **Deletion test**: if deleting a module makes complexity vanish, it may be pass-through ceremony. If complexity reappears across callers, the module was earning its keep.
- **Interface test surface**: if tests must reach past the interface to assert normal behavior, the module shape may be wrong.
- **Variation test**: one adapter is a hypothetical seam; two adapters or a real expected variation justify a seam better.
- **Locality test**: one concept should not require many unrelated edits, tests, docs, and reviewer explanations.
- **Decision-hiding test**: likely-changing design decisions should be hidden behind modules rather than spread through workflow artifacts and callers.

### Design-pressure signals

Load or apply the lens when evidence shows:

- A narrow change touches many files for the same concept.
- Callers must know ordering, flags, cleanup, retries, or policy details that should live behind an interface.
- Tests duplicate implementation sequencing instead of behavior through a stable interface.
- Review findings keep adding edge-case patches.
- A module is mostly pass-through naming around another module.
- A spec or plan makes detailed implementation choices before evidence exists.
- A feature is becoming a god file, god object, or mixed-responsibility module.
- A seam exists only for theoretical future variation.
- Error handling, caching, authorization, billing, migrations, or compatibility policy is scattered.
- The agent can only explain correctness by listing many coordinated steps across modules.

### Non-goals

The lens should not:

- Force upfront architecture ceremony for small reversible work.
- Require new abstractions for every change.
- Encourage speculative seams or adapters.
- Replace source-truth checks or user-owned decisions.
- Rewrite product behavior under the label of architecture.
- Become a long architecture manual loaded on every turn.

## Phase Integration

### Discover

Discovery should remain one broad skill because evidence gathering, codebase exploration, brainstorming, decision tracking, and checkpointing are connected.

Update direction:

- Strengthen “discussion before decision capture.”
- Prefer evidence before questions when the answer is discoverable.
- Treat recommendations as tradeoff explanations, not yes/no approval scripts.
- Keep decision ledger: settled, tentative, open.
- Use the design-for-depth lens when the goal involves architecture, growing scope, module/interface shape, or codebase exploration.
- End with a checkpoint and route, not a silent jump to spec/plan/build.

A user question can still be lightweight:

```text
question -> inspect smallest relevant evidence -> answer directly
```

No artifact or checkpoint is required unless the answer changes future consequential work.

### Write Spec

Specs should capture broad behavior, scope, boundaries, source evidence, and open decisions. They should not pretend every implementation detail is settled.

Update direction:

- Preserve open questions when they do not block the next route.
- Mark architecture assumptions as tentative unless evidence or user decision settles them.
- Add boundary language such as in scope / out of scope / ask first / never when useful.
- Avoid turning design guesses into polished requirements.

### Write Plan

Plans translate source truth into executable slices. They should not create source truth.

Update direction:

- Make dependency and slice order explicit when it affects execution.
- Use vertical slices that produce testable behavior.
- Include direct checks and route conditions per meaningful slice; select independent review at consequential phase exits whose integrated outcome constrains dependent work; use the artifact-review route before implementation and parallel final verifier/reviewer assurance after final self-check.
- Allow some design decisions to be deferred until slice evidence exists.
- Route to design-for-depth when slice boundaries, seams, interfaces, or locality are unclear.

### Review Artifact

One evidence-backed independent review of the consequential spec/plan package is a standing boundary before implementation. `write-spec` chooses combined spec-then-plan review, spec-first review for high-risk source truth, or spec-only review. The writing agent's own check remains separate.

Keep formal review bounded:

- A clean first-pass review is valid.
- Request one narrow confirmation only with scoped authorization and accepted blockers or boundary-required evidence gaps.
- A third pass is exceptional, owner-selected, and terminal.
- Diagnose repeated unknown causes before redesigning or growing prose.

Review only lenses material to the boundary. Distinguish blocking findings, non-blocking suggestions, owner questions, and evidence gaps; adjudicate findings instead of obeying them.

### Execute Plan

Execution should be slice-based and evidence-driven.

Update direction:

- Keep one verified vertical slice at a time.
- Use tests and one sequential self-check—self-verification then, only on support, bounded self-review—as the primary feedback loop; allow review/verify skills to enhance either inline without implying independence.
- Correct local reversible mistakes directly and let the agent learn across slices.
- Diagnose repeated or unexplained failure before redesigning; use design-for-depth only for established structural pressure or proactive consequential architecture.
- If evidence invalidates the plan, route only affected work backward.
- Complete approved plan-selected independent reviews at consequential phase exits before dependent work, then close final implementation through sequential self-check and parallel fresh verifier/reviewer contexts against the same frozen state.
- Use optional commit/handoff checkpoints when rollback or continuity matters.

### Review Work

Approved plan-selected consequential phase-exit reviews carry scoped authorization. After final self-check, one fresh verifier and one different fresh reviewer run in parallel against the same frozen implementation without sharing outputs. Other reviewer or verifier contexts require scoped user authorization. Review feedback is evidence, not authority; verifier output is factual evidence, not judgment.

Update direction:

- Review coherent consequential phase outcomes selected by the plan and the final task outcome, not every slice.
- Keep classification before editing: accepted, rejected, question, needs evidence.
- Apply clear local accepted fixes when safe; do not create an automatic review-fix-review loop.
- Request narrow confirmation only when independently authorized reinspection materially protects the boundary.
- Diagnose repeated findings before redesigning.

### Diagnose Failure

Diagnosis should cover both normal failure signals and workflow-loop failures.

Existing bug/test/performance diagnosis remains the core. Add a secondary route for repeated workflow failures such as:

- Artifact review remains blocked after a narrow confirmation.
- Final work review reveals repeated consequences of one unknown cause.
- Verification keeps failing for different reasons.
- Implementation keeps creating new edge cases.
- Accepted fixes repeatedly reveal shared-state or module-shape problems.

Candidate root-cause categories:

- Thin discovery.
- Wrong or shifting scope.
- Premature decisions.
- Source-truth conflict.
- Missing owner decision.
- Bad plan slice.
- Shallow module/interface.
- Spec or plan encoded implementation guesses.
- Implementation bug.
- Stale or under-contextualized reviewer.
- Inadequate verification loop.

Diagnosis should recommend the next route: rediscover, revise spec, revise plan, redesign module seam, fix implementation, adjust review prompt, or stop.

## Redundancy Control

To avoid drift:

- Keep `workflow` compact and always-loaded.
- Do not always load `design-for-depth`; load it only when design pressure appears.
- Move shared module/interface/seam/depth language into one place.
- Phase skills should contain only trigger lines and local application rules.
- References should exist only when they keep `SKILL.md` short or prevent measured failures.
- Do not copy large architecture explanations into every skill.

## Candidate Implementation Shape

Accepted implementation shape:

1. Use `/discover` as the active discovery command.
2. Create `skills/design-for-depth/SKILL.md` as the design lens.
3. Move discovery skill files under `skills/discover/` and remove the old `research/LANGUAGE.md` compatibility source.
4. Update existing skills with short trigger lines:
   - `discover`
   - `write-spec`
   - `write-plan`
   - `review-artifact`
   - `execute-plan`
   - `review-work`
   - `diagnose-failure`
5. Update plugin docs and command-surface metadata for the active `discover` concept.
6. Add evals before claiming the behavior is improved.

## Eval Ideas

Do not rely on intuition alone. Candidate evals:

1. **Questionnaire trap**
   - Prompt pressures the agent to ask many questions and accept recommendations.
   - Passing behavior: inspect evidence, ask one high-leverage question, avoid rubber-stamp decision capture.

2. **Premature spec detail trap**
   - Context lacks implementation evidence but invites detailed architecture decisions.
   - Passing behavior: preserve open questions or route to discovery instead of inventing design.

3. **Shallow module review trap**
   - Fixture has a pass-through abstraction or scattered policy.
   - Passing behavior: identify shallow/deep module issue and recommend redesign route, not surface cleanup.

4. **Reviewer-dependence trap**
   - Pressure asks for repeated broad reviewers after ordinary slices or each fix.
   - Passing behavior: use self-verification and self-review, optionally enhance them with review/verify skills, keep standing artifact/final reviewers plus one distinct final verifier, and diagnose repeated unknown causes.

5. **Execution spread trap**
   - A plan slice causes complexity to spread across callers/tests.
   - Passing behavior: stop and route backward to design/spec/plan revision instead of patching forward.

6. **Discover command trap**
   - `/discover` should route to discovery behavior.
   - Passing behavior: the command does not drift from the active skill trigger.

## Open Questions

- Should `design-for-depth` be a full skill, a shared reference, or a skill with a small reference?
  - Current recommendation: full skill with concise body and optional reference if needed.
- Should the old `/research` command remain as a compatibility alias?
  - Current owner direction: no normal runtime use of `/research`; treat `discover` as the active concept.
- Should this design become an ADR after implementation decisions are made?
  - Current recommendation: not yet. Use this as a draft design note until scope is accepted and evals exist.
- Which eval should be written first?
  - Current recommendation: start with shallow-module review trap or questionnaire trap because they target the highest-risk behavior discussed.

## Review And Owner Decision

`review-artifact` found one blocking issue: the note could be mistaken as approval to implement `/discover` and `design-for-depth` even though those are product/scope changes.

Adjudication: accepted. The owner explicitly chose to proceed toward an implementation plan for `/discover` and `design-for-depth` on 2026-06-22.

## Recommended Next Route

Forward to `write-plan`: write a bounded implementation plan before updating skills.

The implementation plan should preserve this boundary: `/discover` and `design-for-depth` are approved for planning, but each slice still needs source-truth checks, eval coverage where behavior changes, and review before completion claims.
