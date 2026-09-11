# Workflow

Freeflow is a workflow layer, not a new agent. The active agent owns understanding, routing, authorized work, verification, correction, adjudication, and completion.

## Single Adaptive Workflow

Freeflow always uses one adaptive Workflow. The Interaction Contract interprets the whole user turn, then Workflow chooses the narrowest owning skill and scales pressure to consequence, uncertainty, interaction, and reversibility.

Questions, criticism, examples, hypotheses, and tentative ideas remain discussion until clear action authority exists. For execution, the user-established work agreement defines the outcome, scope, and user-facing return condition. A clear request can already establish it; otherwise the agent asks only the missing material question. The agreement can cover figuring out the approach and completing several Slices without another confirmation at every internal return.

A direct request covers only its bounded outcome and entailed effects. High-risk or hard-to-reverse work receives proportionate decisions, evidence, verification, and selected checkpoints through this same Workflow—not a separate autonomy mode. A new user-owned choice or uncovered effect still requires a stop.

## Activation And Configuration

Freeflow requires a valid shared `.freeflow/config.json`. Optional `.freeflow/local.json` supplies per-checkout personal overrides and cannot activate Freeflow by itself. The only core enablement switch is `enabled`; base Freeflow skills and the Interaction Contract are present whenever Freeflow is enabled. Context Virtualization, Conversation History, and Cognitive Routing are independently configured capabilities.

```text
host session enablement -> personal override -> repository value -> built-in default
```

Configurations containing the removed `defaultMode`, `interactionContract`, or `skills` keys are invalid. An invalid existing local config fails closed instead of silently inheriting shared settings. Session state cannot bypass missing or invalid repository activation.

Pi and PiFlow `/freeflow settings` edit personal overrides; `/freeflow settings session` edits temporary enablement and optional-context overrides; `/freeflow settings repo` edits shared configuration. Session settings do not mutate either config file. Pi exposes Cognitive Routing profile controls when its native model-state APIs and source gate are effective; the current Freeflow PiFlow adapter is explicitly unavailable.

## Interaction Lifecycle

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

Entry is a user turn or new evidence interpreted through the Interaction Contract. It may lead directly to an answer, wait, deferment, or stop. When work is needed, Workflow chooses the narrowest owning skill.

The Feedback Loop applies to every bounded activity, including a whole task, slice, subtask, artifact revision, or small local change:

```text
orient or reconstruct state
-> choose or retain the current owner
-> establish the required result and a supported approach
-> apply its method and gather or produce evidence
-> determine what the evidence supports
-> self-review the supported result
-> continue, correct, re-enter, ask, defer, stop, or exit
```

For concrete work, establish **what** is required and **how** to produce the next coherent result before production changes. These are readiness questions, not mandatory separate investigations, documents, or user turns. Reuse supported understanding. A factual answer or discussion can end without implementation.

The third loop, the **Environment Interaction Loop**, runs inside a bounded activity whenever observation or effects are needed:

```text
need evidence or a covered effect
-> reuse adequate context or identify what is missing
-> select and bound the action and tool
-> execute once
-> observe what changed
-> apply active capability guidance where relevant
-> return to the current owner
```

Action Selection guides uncertain, broad, or repeated interactions and takes the fast path for known mechanics. It does not change the owner or authorize work.

A later turn or new evidence begins another Interaction Lifecycle. Re-enter only the owning activity whose responsibility changed; preserve valid work and decisions. An internal handback does not by itself reach the user's return boundary.

## Work Size, Learning, And Re-entry

Choose Slices by coherent outcomes, dependencies, uncertainty, and manageable context for implementation, checking, and correction—not by file, bug, or tool-call count. Keep useful future work directional and the current unit concrete. One Slice may span context cycles; one context cycle may finish several Slices. Before later work, check that its prerequisites actually hold.

Discuss frames and assesses learning needed to settle direction; Execute Work runs the bounded action. Diagnosis and design can also frame observations under their own methods. An experiment needs a question, adequate observer, covered effects, and an exit at an answer or observing limit. It does not continue until the prototype becomes a production subsystem. Promotion must be deliberately selected and authorized.

A clear local defect returns to its producer. An invalidated approach needs renewed preparation; an unsupported cause needs diagnosis; unsettled acceptance needs discussion or a user decision. Missing or stale evidence is not itself a code defect. Before adding a prerequisite or stronger check, establish which accepted requirement needs it. Repeated mismatches require a changed basis for the next attempt, not just a longer restatement.

## Nested Execution Model

The three core loops apply with or without Cognitive Routing. Under automatic Cognitive Routing, compute placement occurs inside the current Workflow owner; it is not a fourth mandatory task phase. These diagrams describe ownership and control nesting, not a fixed sequence.

### Runtime and compute nesting

```text
Interaction Lifecycle
└─ Workflow Feedback Loop
   ├─ establishes authority, owner, and slice
   └─ Cognitive Routing — automatic control only, when available
      ├─ Coordinator interprets direction and saves one assignment
      ├─ Executor performs the assignment and returns its actual report
      ├─ Coordinator assesses the report and eligible evidence
      │  ├─ continues or replaces a quiescent outstanding assignment
      │  └─ closes the supported unit
      └─ Action Selection bounds uncertain environment interactions
```

Automatic Cognitive Routing transfers compute, not ownership: Coordinator interprets user direction, preserves the authority envelope, directs the current assignment, and assesses its result; Executor works within that assignment and returns an actual report with limitations. A saved return ends ordinary Executor work for that assignment but does not accept or close the unit. Manual Cognitive Routing control runs the ordinary unsplit Workflow. Late user input reaching a prepared Executor request requires an interrupted return before further task tools. Projection, when enabled, selects eligible Executor evidence for Coordinator and preserves the assessment obligation through compaction until disposition, with explicit suspension for newer attention. These operations do not change user authority or make an internal handback the user-facing endpoint.

### Workflow ownership and composition

```text
Workflow Feedback Loop
└─ current owner
   ├─ Discuss ↔ Track Work for direction and durable state
   ├─ Cognitive Routing places compute without changing the owner
   │  ├─ Coordinator directs and assesses under automatic control
   │  └─ Executor executes the current owner's contract
   ├─ Execute Work supplies execution methods
   ├─ Verify Work establishes factual support
   ├─ Review Work / Artifact supply judgment when applicable
   ├─ Diagnose Failure owns unsupported causes
   ├─ Action Selection bounds uncertain Environment Interactions
   └─ Design for Depth composes as a lens
```

Discuss owns open outcome/approach direction and alternatives. Execute Work owns concrete work and its bounded preparation. Track Work preserves durable meaning only when continuity warrants it. Action Selection returns observations to the requesting owner. Verify, review, diagnosis, and design compose when needed rather than forming a mandatory artifact pipeline. A routing assignment is not a Track Work Slice; Cognitive Routing places compute without changing Workflow responsibility.

## Authority And Effects

Each interaction carries an **authority envelope**: requested outcome, permitted effects, covered active evidence generation, and stop condition. The observing mechanism establishes the evidence boundary; Workflow interprets and enforces the envelope from the whole user turn and any still-valid prior approval. Skill selection, useful follow-on work, and new evidence do not widen it.

Actions have different effects:

- **Passive observation:** inspect existing evidence or sources without exercising target behavior or intentionally changing task state.
- **Active evidence generation:** exercise target behavior to produce new evidence.
- **Mutation or delivery:** change repository, durable task or session, or external state.

Effects are cumulative. Passive observation may support an inquiry when safe and relevant. Active evidence generation, mutation or delivery, and separately controlled actions require coverage by the current authority envelope. When an active evidence, mutation, delivery, or separately controlled action is not covered, the agent explains why it is needed, exactly what will happen, what it should produce, and where it will stop; asks once, and waits. Evidence supports reporting and routing; it does not by itself authorize a correction or next lifecycle stage.

## Conditional Artifacts

Artifacts have distinct jobs:

- **Working Record:** living task context, one Current Slice, ordered Future Work, Decisions, Slice-local Evidence/Blockers, History, Notes, and the next action.
- **Spec:** stable accepted content, behavior, boundaries, and uncertainty.
- **Plan:** stable ordered execution strategy when dependencies, mechanism, and checks can be stated without guessing.
- **Handoff:** point-in-time continuation context for a pause or transfer.

Artifacts preserve content or strategy; they are not proof or authority over contradictory current intent and live evidence. Specs and Plans receive author self-review through Review Artifact. Independent review is separately selected and authorized only when it protects a concrete boundary; neither artifact creation nor revision requires it automatically. An already-covered task does not acquire another approval gate merely because its approach is written down.

## Review And Verification

Verification is factual work owned by the active agent. Verify Work may deepen the method; reading it does not dispatch, create another role, or authorize an active check. Run an active check only when the current authority envelope covers it directly or as contained verification; otherwise propose it before running it.

Checks must preserve the required property and observing boundary. A material assertion change must not replace exact behavior with a weaker shape check while retaining the stronger completion claim. Use a concrete wrong-behavior example or covered counterexample exercise where observer sensitivity is uncertain, not a compulsory test-first or mutation-testing cycle. A real passing result can become inapplicable after relevant edits without ceasing to be a real historical observation.

Self-review is required for every completed bounded activity, remains silent, and follows initially supported verification. It belongs to the authorized activity without widening authority: clear local issues required by the accepted outcome may be corrected and re-verified before the final state is frozen. Review Work and Review Artifact may deepen self-review or guide a separately selected independent reviewer. Reading either skill does not create independence.

Independent review ends with one valid exit:

- **Pass:** proceed.
- **Non-blocking:** proceed with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not cross the boundary; re-enter the narrowest owner, defer, or stop.

Review findings are evidence, not commands. Use the current authority envelope when it covers an accepted correction; otherwise ask once for the correction plus any warranted focused follow-up review, or the correction alone. Review budgets cap dispatches; they do not authorize another review.

Corrections leave review and return to Execute Work or the artifact owner. They may remain in the same coherent Working Record slice. Before expanded work starts, return it to Workflow and continue only when the current envelope covers a coherent extension; otherwise establish a distinct result, authority, or evidence boundary.

## Task Continuity

After context loss—such as compaction, context-replacing summarization, clear, session resume/navigation, or transfer into another context—read the complete Working Record through `full` when one exists. Page truncated output until complete; stop affected work if full recovery is unavailable. With intact context, use `resume` or targeted reads only when useful.

Reconcile the current agreement, assignment, superseded directions, dependencies, partial effects, and evidence with current user direction, defining artifacts, and relevant live state. A full record restores recorded memory, not every linked source or proof of live correctness. Keep separate that an observation occurred and whether it applies now. Another conversation branch may preserve memory but cannot create authority. Continue already-covered work after coherent recovery rather than require another "continue."

Routine in-slice feedback is not checkpoint history. Record state changes, accepted boundary extensions, decisions, blockers, evidence, and selected checkpoint results—not every edit or comment.

## Checkpoints And Closeout

Independent review, a local commit, a user decision, and continuity transfer are additional checkpoints only when selected. A slice ending alone does not require one.

Commit, branch integration, migration, release, launch, and destructive cleanup remain separately controlled. Bypass may reduce optional pressure inside an accepted action, but it cannot change authority, erase evidence, remove selected review, or weaken a completion claim.

A Supported Exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete. Completion requires fresh verification, the required self-review for every completed bounded activity, resolved selected reviews, accurate task memory, synchronized required docs, and no hidden owner decision or source conflict.

See [Skill routing](skill-routing.md) for the shipped methods, ownership, routes, and references.
