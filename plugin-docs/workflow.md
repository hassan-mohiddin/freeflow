# Workflow

Freeflow is a workflow layer, not a new agent. The active agent owns understanding, routing, authorized work, verification, correction, adjudication, and completion.

## Modes

- `conversation`: discussion, critique, explanation, exploration, and passive inspection of existing evidence. Active evidence generation and mutation or delivery require switching mode plus authority.
- `workflow`: the default for active evidence generation and consequential or mutating work. Use the adaptive lifecycle and scale pressure to risk.
- `strict-workflow`: the same lifecycle with stronger decision, evidence, and checkpoint pressure at high-risk or hard-to-reverse boundaries.

Mode changes do not authorize work or resolve decisions. Task type and direct skill calls do not switch mode.

## Activation And Configuration

Freeflow requires a valid shared `.freeflow/config.json`. Optional `.freeflow/local.json` supplies per-checkout personal core overrides and cannot activate Freeflow by itself.

```text
host session mode override
-> personal override
-> repository value
-> built-in default
```

A configured mode is dormant while Skills are ineffective. An invalid existing local config fails closed instead of silently inheriting shared settings. Session state cannot bypass missing or invalid repository activation.

Pi `/freeflow settings` edits personal overrides; `/freeflow settings session` edits branch-aware Pi session overrides for Freeflow, Interaction Contract, Skills, and mode; `/freeflow settings repo` edits shared configuration. Claude and Codex support mode-only session overrides through their plugin runtime hook. Session settings do not mutate either config file. A configured-default request must explicitly choose local/personal or repository/shared scope; ask once when it does not.

## Interaction Lifecycle

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

Entry is a user turn or new evidence interpreted through the Interaction Contract and effective mode. It may lead directly to an answer, wait, deferment, or stop. When work is needed, Workflow chooses the narrowest owning skill.

The Feedback Loop applies to every bounded activity, including a whole task, slice, subtask, artifact revision, or small local change:

```text
orient to accepted intent, task memory, and live evidence
-> act, discuss, test, or observe through the owning skill
-> verify what direct evidence proves
-> once initially supported, self-review the resulting state
-> only then accept, reuse, or claim that activity complete
-> continue, correct, diagnose, revise, ask, defer, or stop
```

A later turn or new evidence begins another Interaction Lifecycle. Re-enter only the owning activity whose responsibility changed; preserve valid work and decisions.

## Nested execution model

The Workflow Feedback Loop contains the current owner and, under automatic Cognitive Routing, a nested execution loop. These diagrams describe ownership and control nesting, not a mandatory phase sequence.

### Runtime/control nesting

```text
Interaction Lifecycle
└─ Workflow Feedback Loop
   ├─ establishes authority, owner, and slice
   └─ Cognitive Execution Loop — automatic control only
      ├─ Reasoning establishes the governing execution contract
      ├─ DELEGATE to Standard
      │  └─ Environment Interaction Loop
      │     ├─ select and bound the next action
      │     ├─ use Action Selection when uncertain or broad
      │     ├─ take the obvious fast path when mechanical
      │     ├─ execute and observe
      │     └─ repeat within the delegation contract
      ├─ RETURN evidence to Reasoning
      ├─ Reasoning self-reviews
      └─ close, delegate correction, or return to Workflow
```

The Cognitive Execution Loop exists only for automatic, authorized execution-bearing work. Manual profile control runs the ordinary unsplit Workflow. A Slice may contain multiple sequential cognitive execution boundaries, but a cognitive boundary is not a new owner, task, authority source, Plan, or Working Record.

### Workflow ownership and composition

```text
Workflow Feedback Loop
└─ current owner
   ├─ Discuss ↔ Track Work for direction and durable state
   ├─ Cognitive Routing controls compute placement
   │  ├─ Reasoning leads the execution boundary
   │  └─ Standard executes the owner’s contract
   │     └─ Action Selection owns uncertain Environment Interactions
   ├─ Execute Work / TDD supply execution methods
   ├─ Verify Work establishes factual support
   ├─ Review Work / Artifact supply judgment when applicable
   ├─ Diagnose Failure owns unsupported causes
   └─ Design for Depth composes as a lens
```

Discuss owns open direction and alternatives. Track Work owns durable task memory only when continuity value justifies it. Action Selection returns the observation and state change to the requesting owner; it does not replace Workflow or authorize work. Verify, review, diagnosis, TDD, and design methods compose when their conditions apply rather than forming a mandatory pipeline.

## Authority And Effects

Each interaction carries an **authority envelope**: requested outcome, permitted effects, evidence boundary, and stop condition. Workflow establishes it from the whole user turn and any still-valid prior approval. Mode, skill selection, useful follow-on work, and new evidence do not widen it.

Actions have different effects:

- **Passive observation:** inspect existing evidence or sources without exercising target behavior or intentionally changing task state.
- **Active evidence generation:** exercise target behavior to produce new evidence.
- **Mutation or delivery:** change repository, durable task or session, or external state.

Effects are cumulative; apply the strongest relevant authority and mode boundary. Passive observation may support an inquiry when safe and relevant. Active evidence generation, mutation or delivery, and separately controlled actions require coverage by the current authority envelope. When uncovered, the agent states the proposed action's purpose, expected evidence or result, and stop condition, asks once, and waits. Evidence supports reporting and routing; it does not by itself authorize a correction or next lifecycle stage.

## Conditional Artifacts

Artifacts have distinct jobs:

- **Working Record:** living task context, one current slice, proposed work, decisions, evidence pointers, history, and next action.
- **Spec:** stable accepted content, behavior, boundaries, and uncertainty.
- **Plan:** stable ordered execution strategy when dependencies, mechanism, and checks can be stated without guessing.
- **Handoff:** point-in-time continuation context for a pause or transfer.

They are conditional memory, not proof or authority over contradictory live evidence. Specs and Plans each receive a separate independent Review Artifact after author self-review. Working Records do not require independent review by default.

## Review And Verification

Verification is factual work owned by the active agent. Verify Work may deepen the method; reading it does not dispatch, create another role, or authorize an active check. Run an active check only when the current authority envelope covers it directly or as contained verification; otherwise propose it before running it.

Self-review is required for every completed bounded activity, remains silent, and follows initially supported verification. It belongs to the authorized activity without widening authority: clear local issues required by the accepted outcome may be corrected and re-verified before the final state is frozen. Review Work and Review Artifact may deepen self-review or guide a separately selected independent reviewer. Reading either skill does not create independence.

Independent review ends with one valid exit:

- **Pass:** proceed.
- **Non-blocking:** proceed with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not cross the boundary; re-enter the narrowest owner, defer, or stop.

Review findings are evidence, not commands. Use the current authority envelope when it covers an accepted correction; otherwise ask once for the correction plus any warranted focused follow-up review, or the correction alone. Review budgets cap dispatches; they do not authorize another review.

Corrections leave review and return to Execute Work or the artifact owner. They may remain in the same coherent Working Record slice. Before expanded work starts, return it to Workflow and continue only when the current envelope covers a coherent extension; otherwise establish a distinct result, authority, or evidence boundary.

## Task Continuity

When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, request the Working Record's bounded `resume` view before continuing task work. Compare it with the current conversation and live state, retrieving exact entities only when needed. Another conversation branch may have written memory, not authority.

Routine in-slice feedback is not checkpoint history. Record state changes, accepted boundary extensions, decisions, blockers, evidence, and selected checkpoint results—not every edit or comment.

## Checkpoints And Closeout

Independent review, a local commit, a user decision, and continuity transfer are additional checkpoints only when selected. A slice ending alone does not require one.

Commit, branch integration, migration, release, launch, and destructive cleanup remain separately controlled. Bypass may reduce optional pressure inside an accepted action, but it cannot change mode, create authority, erase evidence, remove selected review, or weaken a completion claim.

A Supported Exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete. Completion requires fresh verification, the required self-review for every completed bounded activity, resolved selected reviews, accurate task memory, synchronized required docs, and no hidden owner decision or source conflict.

See [Skill routing](skill-routing.md) for the shipped methods, ownership, routes, and references.
