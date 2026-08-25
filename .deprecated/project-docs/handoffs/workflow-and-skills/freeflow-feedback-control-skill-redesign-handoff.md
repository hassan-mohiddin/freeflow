# Freeflow Feedback-Control Skill Redesign Handoff

## Purpose

Use this handoff as the custom-compaction continuation prompt for the current Freeflow skill redesign.

This is compact continuation memory, not authority. After compaction or tree navigation, inspect the live repository state before editing. Live files, current diffs, explicit user direction, accepted decisions, and repository instructions override this handoff when they conflict.

Do not resume broad implementation automatically. Continue collaboratively with the user and update one skill package at a time.

## Immediate Working Contract

- Work with the user as a candid collaborative senior engineer.
- Answer questions without inferring edits.
- Treat criticism, examples, hypotheses, and tentative ideas as discussion rather than authorization.
- If a question affects consent or method, answer and wait unless the user clearly says to proceed.
- Agree or disagree from evidence rather than performatively agreeing.
- Ask only when ambiguity could materially change the outcome or route.
- Optimize for the smallest useful next action, not maximum activity.
- Update one skill package at a time, validate it, present it to the user, and stop for review.
- Do not touch the next package until the user approves the current one.
- Do not treat diagnostics, warnings, review findings, or possible wording improvements as automatic implementation instructions.
- After the approved packages are complete, perform one read-only cross-skill alignment review. Report findings before requesting approval for any final correction slice.

## Core Philosophy

Freeflow is being redesigned as a **feedback-based control layer for one active probabilistic coding agent operating with lossy context and bounded authority**.

It is not a fixed forward workflow, a new agent, or a prompt that orders the model to keep implementing until every possible issue disappears.

The control loop is:

```text
interpret intent and current state
-> resolve only uncertainty that changes the next action
-> choose one bounded action or experiment
-> execute, test, or observe
-> verify what the evidence proves
-> silently self-review once
-> continue, correct, diagnose, revise, ask, preserve, or stop
```

Progress means choosing a better-supported route, not merely producing more edits.

The five cooperating parts are:

1. **Interaction semantics** — distinguish questions, discussion, hypotheses, decisions, approvals, and commands.
2. **Decision and discussion** — build shared understanding and resolve only path-changing uncertainty.
3. **External memory** — preserve intent, strategy, current state, decisions, evidence, and continuity outside the model context.
4. **Adaptive execution** — work through bounded learning, delivery, or deepening slices and revise the route from evidence.
5. **Evidence and governance** — use tests, verification, review, user authority, and adjudication to decide what happens next.

## Single-Agent Scope

The current model is intentionally limited:

- One active agent owns discussion, specification, planning, execution, verification, adjudication, and closeout.
- No Turn Router is being built now.
- No separate worker, execution parent, or worker-handshake architecture is being built now.
- Verification remains with the active agent because it is factual claim-to-evidence work, not independent judgment.
- Independent agents or subagents may be used for review when broader judgment is worth the cost.
- Pi may help with context loading, commands, configuration, and optional reviewer transport, but skills remain the main behavior driver.

Deferred scope includes Turn Router work, worker/delegation architecture, runtime migration, command-surface migration, public documentation, generated output, package metadata, and behavioral eval execution unless the user explicitly reopens one of those areas.

## Interaction Contract

The old growing runtime kernel is being replaced conceptually by a tiny optional interaction contract.

Its job is only to guide turn interpretation:

- interpret the whole user turn before acting;
- answer questions without inferring action;
- treat criticism and tentative reasoning as discussion;
- answer first and wait when the answer affects consent or method;
- challenge unsupported claims rather than becoming a yes-machine;
- establish enough shared understanding for the next sound action;
- choose reversible local details when no path-changing ambiguity remains.

It must not contain slices, artifact policy, review cycles, final assurance, checkpoint routing, or the full Workflow.

Natural host behavior versus the minimal interaction contract should eventually be evaluated, but evals are deferred until the skill wording settles.

## Discuss

Discuss owns collaborative exploration and revision of direction.

Use it when:

- the user is shaping an idea or request;
- an open-ended request leaves important outcomes or alternatives unsettled;
- a spec, plan, design, or implementation direction needs discussion;
- new evidence invalidates an assumption or reopens the next approach.

Discuss should:

- start from what is already known;
- inspect factual evidence instead of asking the user for discoverable facts;
- stay with the highest unresolved question that can change direction;
- compare only materially different paths;
- contribute a real recommendation with reasons and disconfirming evidence;
- avoid recommendation-biased questionnaires that make the user a yes-machine;
- use breadth before depth without trying to discuss every possible topic;
- converge when the next sound action no longer depends on unresolved direction.

Discussion may alternate with small approved learning or delivery slices. A prototype can answer a question before a full Spec or Plan exists, but it does not silently become production behavior.

### Checkpoints During Discussion

A checkpoint is a deliberate boundary before dependent work where the agent observes, judges, decides, preserves, or transfers state.

Discuss now helps the user shape useful checkpoints when discussing slices, phases, experiments, or execution strategy.

Possible checkpoints include:

- verification or an integration check;
- independent review;
- a user decision;
- prototype promotion, revision, or discard;
- a local Git commit;
- Working Record reconciliation;
- pause or handoff;
- separately controlled integration, migration, release, or launch boundaries.

Recommend a checkpoint only when it reduces material risk, protects dependent work, or preserves a coherent state. Do not add one after every slice by habit.

A useful checkpoint states:

```text
Type:
Purpose:
Due boundary:
Conditions:
Approval status and scope:
```

The approved Discuss package includes checkpoint guidance in:

- `skills/discuss/SKILL.md`
- `skills/discuss/references/checkpoints.md`

## Skill-Writing Method

Skills are written for an agent reading them for the first time.

### Description

- Begin with the broad core trigger: `Use when executing...`, `Use when reviewing...`, `Use when committing...`.
- Use plain, observable task language.
- Do not require the model to predict an internal classification taught only inside the skill.
- Avoid vague terms such as “consequential” in descriptions unless guaranteed prior context defines them.
- Do not turn descriptions into exhaustive taxonomies.
- Route broadly when loading the skill is safe and the body can exit cleanly.

### Active body

- State the skill’s job immediately.
- Define necessary language before relying on it.
- Keep the normal path executable from `SKILL.md` alone.
- Use direct instructions that route, constrain, stop, or guide behavior.
- Keep hard stops and failure-prevention rules close to where the failure occurs.
- Do not copy the whole Workflow into leaf skills.
- Use a few compact examples when they teach a boundary faster than prose.

### Progressive disclosure

```text
description
-> SKILL.md
-> conditional reference or script
```

A reference is justified when:

- it serves a distinct conditional branch;
- loading it every time would obscure the normal path;
- the body tells the model exactly when to read it;
- it has one job and does not become a second copy of the skill or Workflow.

Examples in skills and references teach. Behavioral evals later prove whether the behavior changes. Evals are intentionally deferred for now.

### Strategic repetition

One normative owner should hold the full rule. Repeat a compact reminder only at a boundary where omission causes a real failure.

Prompt-based systems sometimes need strategic repetition; zero duplication is not an aesthetic goal. But repeated full lifecycle policy creates drift and workflow leakage.

## Workflow Ownership

Workflow alone owns:

- routing to the skill that owns the current job;
- artifact and task-memory selection;
- feedback sequencing;
- checkpoint routing;
- review selection;
- route changes from evidence;
- closeout and completion claims.

Method skills do not redefine Workflow.

The primary feedback loop is:

```text
orient to accepted intent and live evidence
-> choose one bounded action or experiment
-> implement, test, or observe
-> verify what the evidence proves
-> when supported, silently self-review once
-> continue, correct, diagnose, revise, ask, or stop
```

Once evidence supports the active slice and one bounded self-review correction batch is re-verified, freeze it. Possible polish, advisory warnings, and unrelated issues are not unfinished work; they require another selected slice.

## Execute Work

Execution is not Plan-dependent. Execute Work may begin from direct conversation, a Working Record, Spec, Plan, diagnosis, accepted review item, issue, or another established source.

Execution uses one visible semantic slice at a time. Announce only:

```text
Slice: <existing identifier or short name>
```

Keep the internal result, scope, checks, and stop conditions in agent reasoning or the Working Record. Do not narrate commands or the full slice contract.

For each meaningful slice:

1. establish the intended result, bounded scope, direct check, and stop condition;
2. make the smallest coherent change;
3. test or observe;
4. read Verify Work and determine what evidence proves;
5. when supported, read Review Work and silently self-review once;
6. apply one bounded correction batch for clear local issues;
7. re-verify and freeze the slice;
8. return unresolved or route-changing evidence to Workflow.

Continue only while the next slice is already accepted, no approved checkpoint is due, evidence supports the execution basis, and remaining work is shrinking or becoming clearer.

Do not silently absorb public documentation, migration, deprecation, commit, integration, release, launch, or other follow-on work. Report newly discovered follow-on work so the user can approve or defer it.

Approved Execute Work package:

- `skills/execute-work/SKILL.md`
- `skills/execute-work/references/execution-loop.md`
- `skills/execute-work/references/code-practices.md`

The public command/runtime/docs migration from `execute-plan` to `execute-work` remains deferred.

## Edge Cases

Agents tend to treat every imaginable edge case as required work, creating states, fallbacks, abstractions, tests, and review-fix loops.

The settled rule is:

> Handle edge cases required by accepted behavior, observed evidence, or material safety. Do not create behavior for hypothetical completeness.

Classify each case:

- required or observed with defined behavior: implement and test;
- material but undefined: return the decision to Workflow;
- plausible but unsupported: gather evidence;
- useful but optional: report or defer as separate work;
- purely hypothetical: leave it alone;
- repeated related cases: stop patching and diagnose the shared contract, cause, ownership, interface, or reviewer calibration.

A stream of related edge cases is feedback that the problem may be upstream. It is not permission for another patch.

## Comments And Code Practices

General code practice is owned by Execute Work and its Code Practices reference, not by Workflow, TDD, or Simplify Code.

Prefer code whose names and structure explain what happens. Comment non-obvious **why** when a future reader could otherwise make a harmful change:

- invariants or ordering constraints;
- concurrency, precision, security, or compatibility constraints;
- deliberate workarounds;
- why an apparently simpler approach is wrong;
- rejected obvious alternatives;
- temporary behavior and the condition that permits removal.

Do not narrate clear code, preserve stale comments, or leave `TODO: fix later` without a real reason or exit condition.

Put local rationale near the code. Put task status and future work in a Working Record or issue. Put broad durable rationale in a Spec, decision record, or ADR.

## TDD And Simplification

TDD owns one failing behavior check guiding one minimal implementation slice.

- Do not add edge-case tests solely because a case can be imagined.
- Stop when tests begin designing public states, fallbacks, or machinery rather than protecting accepted behavior.
- Use Code Practices during GREEN implementation.
- Freeze each supported behavior before selecting another.

Simplify Code owns behavior-preserving reduction of complexity.

- Keep bug fixes, edge-case handling, features, and broad modernization outside simplification.
- Preserve comments that explain why; remove stale or narrating comments.
- Stop when simplification exposes a wider ownership, interface, or behavior problem.
- Freeze once behavior remains supported and the accepted complexity is removed.

Approved packages:

- `skills/tdd/SKILL.md`
- `skills/simplify-code/SKILL.md`

Their existing conditional references did not need changes.

## Verification

Verification belongs to the active agent.

It asks:

> Does fresh direct evidence support this claim at the required observing boundary?

Verification is factual rather than judgment-oriented. It separates:

- check result: Passed, Failed, Error, or Unavailable;
- claim result: Supported, Contradicted, Inconclusive, or Unavailable.

A passed check may leave a broader claim Inconclusive. Source inspection does not prove runtime execution. A helper call does not prove registration, host dispatch, or installed-artifact behavior.

There is no standing fresh independent verifier in the new model. Review may judge whether verification evidence is sufficient, but it does not replace verification.

Verify Work alignment is the next skill-package inspection after compaction.

## Review

Self-review is performed silently by the active agent after evidence supports the slice. It creates no formal result or review cycle.

Independent review is optional broader judgment from someone who did not produce the work. Review findings are evidence, not commands.

Review Work and Review Artifact use:

- Blocking Issue;
- Non-blocking Issue;
- Question;
- Needs evidence;
- Improvement.

The review judgment is:

- Pass;
- Non-blocking;
- Inconclusive;
- Blocking.

A review ends when it reports its items and judgment. It does not remain active until Pass.

After review, the active agent adjudicates each item as Accepted, Rejected, or Open and derives the adjudicated judgment from accepted issues and material open items.

Routes:

- Pass: proceed;
- Non-blocking: proceed with explicit deferrals;
- Inconclusive: gather the missing evidence or decision;
- Blocking: select a bounded correction, move backward, defer, or stop.

Corrections are separate Execute Work slices, not continuation of review. Verify accepted corrections. Request focused follow-up only when the changed boundary still needs independent judgment.

### Review budget

For one state and boundary:

1. Review 1 is the normal broad review.
2. Review 2, when needed, is focused on accepted corrections, affected dependencies, and remaining risk.
3. Review 3 is exceptional and final.
4. Review 4 is forbidden.

At the cap, stop the autonomous review-fix-review process and return control to Workflow and the user. The work may remain blocked; the budget ends autonomous cycling, not all possible future work.

Approved review packages:

- `skills/review-work/SKILL.md`
- `skills/review-work/references/reviewer-prompt.md`
- `skills/review-artifact/SKILL.md`
- `skills/review-artifact/references/reviewer-prompt.md`

The existing security risk lens was not part of the review-loop edit.

## External Memory

External memory has distinct jobs:

- **Spec:** accepted intent, why, scope, behavior, constraints, failure semantics, and acceptance.
- **Plan:** stable ordered execution strategy, dependencies, checks, invalidation conditions, and selected checkpoints.
- **Working Record:** evolving current task state, slices, task-local decisions, evidence pointers, checkpoint state, history, and next useful action.
- **Decision record or ADR:** consequential choice, alternatives, rationale, consequences, and revisit/supersession conditions.
- **Handoff:** point-in-time continuation package for a context or ownership boundary.

These are conditional roles, not mandatory files.

Plans remain stable during ordinary execution. Actual progress, deviations, checkpoint outcomes, review results, commit SHAs, and current state belong in the Working Record.

## Checkpoints And Authorization

A checkpoint is a deliberate boundary before dependent work where the agent observes, judges, decides, preserves, or transfers state.

Every meaningful slice already receives verification and silent self-review. Additional checkpoints are selected only when useful.

During planning or discussion, consider:

- independent review;
- local commit;
- user decision;
- Working Record reconciliation;
- pause or handoff;
- separately controlled integration, migration, deprecation, release, or launch boundaries.

A checkpoint should state its type, purpose, due boundary, conditions, status, and approval scope.

User approval of a Plan authorizes its listed:

- implementation;
- checks;
- selected reviews;
- Working Record updates;
- local commits.

Plan approval does **not** authorize push, integration, migration, deprecation, release, or launch. Those remain separate.

A checkpoint explicitly approved in discussion is also authorized for the current task. A Working Record preserves that authority but cannot create it.

Planned checkpoints remain conditional on live state. Do not force one when its intended outcome, evidence, review status, or change boundary no longer holds.

Approved checkpoint-related packages:

- `skills/write-plan/SKILL.md`
- `skills/write-plan/references/plan-shapes.md`
- `skills/track-work/SKILL.md`
- `skills/track-work/references/working-record-schema.md`
- `skills/commit-work/SKILL.md`
- `skills/commit-work/references/staging-decisions.md`
- checkpoint alignment in Execute Work and its execution loop;
- checkpoint guidance in Discuss and its checkpoint reference.

## Repository And Change-State Cautions

The working tree contains a broad skills-only redesign accumulated across this conversation and a prior branch. Some files may be modified, deleted, or untracked because command/runtime/docs/eval migration was deliberately reverted or deferred.

Do not infer exact current state from this handoff. On continuation:

1. inspect `git status --short`;
2. inspect the current diff only for the skill package being considered;
3. preserve unrelated user changes;
4. do not restore deferred runtime, command, docs, package, generated, or eval changes without explicit approval;
5. remember that `skills/execute-work/` and `skills/track-work/` may still be untracked while the old runtime surface continues to refer to legacy names;
6. remember the known skill-validator limitation: package-local validation reports cross-skill links as escaping the skill root even when the links are intentional and valid;
7. treat Markdown line-length findings as advisory unless the repository requires reflow; do not enter style-only churn;
8. run focused link checks, `git diff --check`, diagnostics, and one self-review per approved skill package.

## Approved Working Method For Each Skill Package

For each package:

1. announce one short slice;
2. read only the owning files and direct dependencies needed for that package;
3. make the bounded update;
4. validate links, diff integrity, and diagnostics;
5. perform one self-review;
6. apply at most one bounded correction batch for clear material issues;
7. re-verify;
8. present the changed files, behavioral changes, size, checks, and known validation limitations;
9. stop and wait for user approval.

Do not proceed because a tool reports warnings or because more wording could be polished.

## Exact Next Steps

After compaction or navigation:

1. Read this handoff and inspect live repository status.
2. Resume with an **inspect-only alignment of the Verify Work package**:
   - `skills/verify-work/SKILL.md`
   - `skills/verify-work/references/integration-evidence.md`
   - `skills/verify-work/references/browser-runtime-evidence.md`
   - `skills/verify-work/references/performance-evidence.md`
   - confirm that the obsolete independent verifier contract is absent or no longer active;
   - edit only if a concrete inconsistency with the settled single-agent model exists.
3. Present Verify Work findings or its bounded update and wait for approval.
4. Continue remaining inspect-only alignment one package at a time, likely:
   - Write Spec and its direct references;
   - the Interaction Contract;
   - any directly affected Decision Gate, Mode Contract, Handoff, or related package only when a concrete inconsistency is found.
5. Do not reopen already approved packages merely for style. Revisit one only when the alignment review finds a material contradiction.
6. After all package-level work, perform one **read-only cross-skill alignment review** covering descriptions, first-read behavior, ownership, terminology, links, progressive disclosure, checkpoint authority, execution/review exits, and deferred scope.
7. Report findings before editing.
8. Ask the user to approve one final bounded correction slice if material findings remain.
9. Keep command/runtime/docs/eval migration and behavioral eval execution deferred until separately approved.

## Current Continuation Question

The next agent should not ask the user to repeat this history. Inspect the live Verify Work package, compare it with the settled model above, and either:

- report that no change is required; or
- propose or apply one bounded Verify Work package update, then stop for user review.
