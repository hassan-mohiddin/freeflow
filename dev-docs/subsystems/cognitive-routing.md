# Cognitive Routing

> **Covers:** `pi-extension/src/cognitive-routing/`, `capabilities/cognitive-routing/`, `runtime/prompts/cognitive-routing.md`
> **Tests:** `pi-extension/tests/cognitive-routing/`, `pi-extension/tests/cache-reuse/`
> **Verified at:** `4bcccc7d` (2026-10-03)
> **User docs:** `plugin-docs/capabilities/cognitive-routing.md`

For contributors changing Cognitive Routing on Pi: how routing moves work between profiles in one session, how it records and recovers its state, how the Coordinator's projected view is built, and which of its behaviors are deliberate. What routing is for users, how to configure it, and how to choose a mode are in the user guide.

## Purpose

Cognitive Routing splits one Pi agent and one session between compute profiles. The **Coordinator** talks to the user, plans, delegates and judges. **Workers** (Helper and Executor) carry out bounded assignments, usually on a cheaper model or at lower effort. The goal is task quality, reasoning continuity, responsiveness and total cost together. Fewer tokens alone is not success: a reduction that loses essential context, causes repeated investigation or weakens decisions is a regression even when a single request is smaller.

Routing does this by switching Pi's model and effort per profile, by recording every routing decision as a session event, and, with **projection** on, by giving the Coordinator a reduced view: its own conversation plus each worker's report and the evidence the worker selected.

It deliberately does not:

- create a second agent or run profiles concurrently: one profile executes at a time;
- count as independent review: different profiles, even on different models, are not independent reviewers;
- act as task memory: a unit is not a Track Work Slice, and closing one completes no task, commit or release;
- grant permissions: routing tools are controls, checked against state, not permission grants;
- patch Pi, rewrite session files, or replay historical tool effects;
- dispatch through Pi's virtual models: it switches the host model itself.

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Profile | A configured provider, model and effort used as `coordinator`, `helper` or `executor`. | `Profile`, `Pair`, `PROFILES` in `types.ts` |
| Delegation mode | Which workers automatic routing uses: `executor` (the default), `helper`, or `both`. | `DelegationMode` |
| Control | `automatic` (the Coordinator delegates and routing switches profiles), `manual` (one held profile runs the ordinary unsplit workflow), or `inactive`. | `Control` |
| View | What a request is built for: a profile, or `solo` when routing does not split the work. Only the Coordinator's view under projection is selective; Helper and Executor always see the same ordinary history, so they share a view, and without projection every profile does. | `View`, `projection.ts` |
| Unit | One outcome under Coordinator judgment, containing one or more assignments. At most one is open. | `Unit` |
| Assignment | One accepted contract for one worker, and its return. At most one is outstanding. | `Assignment` |
| Execution | One model response and its tool results, bound to session entries at turn end. | `execution-opened`, `execution-bound` events |
| Handoff | A saved contract, report, recovery request or supplement, plus its delivery state (`pending`, `blocked`, `configured`, `superseded`). | `Handoff`, `Delivery` |
| Source, ref | A tool result in session history with a stable ref `ctx:<entry-id>` and a body hash. | `sources.ts` |
| Selection | The refs a worker selected as evidence for its assignment. | `Selection`, `freeflow_project` |
| Reservation | The prepared plan for delivering a selection to the Coordinator: sources with hashes, target model, size budget. | `Reservation` |
| Assessment | The Coordinator's judgment of a returned assignment. Its evidence view can be suspended by new user attention or a recovery, and resumed. | `assessment-suspended`, `assessment-resumed` |
| Recovery | A bounded request for missing assessment evidence, answered by the same worker with a separate supplement. | `recovery-request-accepted`, `freeflow_unit recover` |
| Admitted, exposed | A source is exposed when it appeared in a request a profile received (`sources-exposed`), and admitted when it was delivered into the Coordinator's view. Admitted content stays in that view (see Decisions). | `admissions()` in `assembler.ts` |
| Assessment obligation | While an assessment is active, the Coordinator's view must contain the selected evidence in full, rebuilt from history if needed. Suspending the assessment pauses only this obligation. | `assessment.view` |
| Quiescent | No execution of the assignment is running. | — |
| Event journal | The routing events stored as `freeflow-routing-v2` session entries; state is the reducer's replay of them. | `event-store.ts`, `state.ts` |

## How It Works

### One run, step by step

Terms from other subsystems: the **Runtime State** is the message telling the model what is active (see [Request history and prompt cache](request-history-and-cache.md)); **codemode** is Pi's mode in which the model writes a script that calls tools.


Routing hooks into Pi's events (wired in `pi-extension/src/index.ts`, forwarded by `RoutingRuntime`):

1. **`before_agent_start`**: `beforeRun()` applies control changes staged while idle (profile holds, presets) and sets Pi's model for the active profile. A run started by an extension message gets the same preparation at its first `message_end`.
2. **`context_with_system`**: `routing.context()` (`ContextAssembler`) finds the latest delivered user input, opens an execution, and prepares the active profile's view (`prepareView()` in `projection.ts`). It adds routing's transient messages: routing state, attention, budget and communication. Request history then fixes their positions (see [Request history and prompt cache](request-history-and-cache.md)).
3. **`tool_call`**: `preflight()` (`ToolGate`) checks every call. Routing tools must be called directly, never from a codemode script. Under automatic control every call must belong to the assistant message Pi persisted for this turn (its batch), and the batch must follow the handoff rule: a handoff call comes last, may be accompanied only by `freeflow_project` calls, and never by ordinary task tools. A worker whose assignment has returned may make only the recovery reads it was granted.
4. **Tool execution**: `ToolHandlers` runs routing tools one at a time. Each accepted call appends its event once, so repeating a call returns the saved result.
5. **`turn_end`**: `Handoffs.turnEnd()` binds the response to its execution (`execution-bound`). If a delegation or return was accepted in this turn, `finishHandoff()` checks that the exchange is complete. For a return under projection it prepares the Coordinator's view and records the reservation, or marks the handoff `blocked` when evidence cannot be delivered. It then switches Pi to the receiving profile's model and effort (`ModelControl.applyPair()`) and records the handoff as `configured`, meaning Pi now runs the receiving profile. Pi's loop continues with the next request, now on the receiving profile.
6. **`agent_settled`**: `settled()` retires executions that never bound and finishes the run's bookkeeping.

Only `model-control.ts` changes Pi's model or effort. While idle, switches are staged and applied when the next prompt starts; during a run they apply at once.

### Unit and assignment lifecycle

```text
no open unit
  -> assign: create unit U1 and assignment A1
  -> worker executes A1
  -> submit: save A1 report and return to Coordinator
  -> Coordinator assesses
       -> assign: create A2 in U1
       -> replace: supersede a quiescent outstanding assignment
       -> close: accept, cancel, or defer U1
```

**Contract.** A useful contract communicates the required result and why it matters, established facts and remaining questions, scope and permitted effects, the evidence needed for assessment, and the return condition. A preparation assignment names what must be learned rather than guessing the patch. The routing skill teaches this; the runtime stores the contract as given.

**Return.** A report records the actual work, evidence, limitations, changed assumptions and partial effects. Once the report is saved, ordinary task work for that assignment ends (`worker_task_phase_ended` in the gate). The worker may correct its selection and retry the saved handoff (`freeflow_return retry`), but cannot continue implementation because delivery is blocked.

**Assessment.** The Coordinator compares material claims with the property the contract required, what actually observed it, the assertions that decide it, which version of the work was checked, and the returned limitations. It may accept, ask for focused evidence (recovery), commission a correction, revise the approach, or return a choice to the user.

**Replacement.** `replace` supersedes a quiescent outstanding assignment in the same unit, with a reason, preserving prior effects, evidence and uncertainty. It cannot discard a returned report.

**Closure.** Closing a unit as accepted, cancelled or deferred preserves communication and history. It completes no Slice or task, makes no commit, and deletes no admitted context.

### Routing tools

| Tool | Operations | Responsibility |
| --- | --- | --- |
| `freeflow_delegate` | `assign`, `replace` | The Coordinator saves a worker contract and requests execution. In `both` mode the Coordinator names the `worker`. |
| `freeflow_return` | `submit`, `supplement`, `retry` | The recorded worker saves or revises its report, returns a recovery supplement, or retries the unchanged saved handoff. |
| `freeflow_unit` | `inspect`, `assess`, `recover`, `cancel-recovery`, `close` | Reads saved work, manages recovery and assessment, or records the Coordinator's disposition. |
| `freeflow_project` | `inspect`, `add`, `remove` | Manages the worker's evidence selection; refused with `projection_disabled` when projection is off. |

The harness owns unit, assignment, handoff and event identities. Models use returned refs; they never invent ids or keep a parallel ledger. Tool definitions stay fixed and visible to every profile for the prompt cache; the gate and handlers decide what may run.

### Evidence selection and projection

Only tool results are evidence: `ctx:<entry>` on a tool result. A worker's own messages are not selectable; what it would say belongs in its report. A worker adds evidence and submits its return in the same response, with the return last. The report is saved even when a selected source has a problem; the receipt reports readiness. A ref that cannot be resolved is kept as an unresolved problem and does not stop the other selections. A selected source that resolves but cannot be delivered (for example an image the Coordinator's model cannot take) makes the handoff `blocked` until the worker fixes the selection with `freeflow_project` and uses `retry`.

`freeflow_project inspect` scopes: `assignment` (this assignment's candidates), `active`, `history`, and `selected` (saved selections with their diagnostics). Results show identity metadata, not content previews. Cursors bind to the inspection snapshot; changed ancestry or reload requires a fresh inspection.

When the Coordinator's view is prepared (`prepareView()`), each selected tool result arrives with its native call envelope and required call/result structure. Unselected sibling results in the same call group appear as explicit omission placeholders, never fabricated content. Readiness also checks source availability and identity, receiver configuration, whether the target model can represent the source (images, failed sources), and whole-request size. `ready: true` means no known preparation problem at that boundary. It does not prove the claim, current external truth, an actual cache hit, or Coordinator acceptance. Valid selections survive another item's failure; adverse or unresolved evidence stays explicit.

The Coordinator's view is append-only: evidence admitted later is delivered where it was admitted, a worker turn kept only for its structure (a tool call whose result was selected) carries only its calls, and a completed worker run shares one provenance note. Projection never sends the worker's full history to the Coordinator, even on failure: a projection error blocks the request instead.

Workers see the full ordinary history. A profile receives another profile's private reasoning only when that turn was produced on the receiving model and under the same view; otherwise the reasoning is withheld.

### Attached evidence recovery

```text
worker report returned
-> Coordinator identifies a material evidence gap
-> freeflow_unit recover saves a bounded request
-> the assignment's recorded worker receives recovery scope
-> worker selects exposed evidence and/or reads exact files the Coordinator named
-> freeflow_return supplement saves separate communication
-> Coordinator receives the supplement or cancels recovery
-> freeflow_unit assess may resume the original assessment
```

Recovery may use previously exposed evidence, the exact task-file paths the Coordinator named in the request, packaged Freeflow skill or reference Markdown, and the routing and return controls. It may not search broadly, edit, test, build, run scripts, or resume task work (the gate's `recoveryReadAllowed()`). Reads stop when the supplement is saved. Evidence that needs new work (running tests, searching) needs a new assignment instead. The worker recorded on the assignment owns recovery even if configuration later selects another mode; if that worker is unavailable, routing blocks rather than substituting another profile. A supplement is separate from the original report, which keeps its identity, revision and selection. Fresh user attention does not settle recovery: the Coordinator receives the supplement or cancels.

### New user attention

New user input belongs to the Coordinator. During a returned assessment it suspends the forced assessment-evidence obligation (`assessment-suspended`, reason `user-attention`) while keeping ordinary admitted history, the report, selections and current responsibility. A later `freeflow_unit assess` must re-establish readiness before the assessment view resumes. During outstanding worker execution, new direction reaches the worker as an attention message (`freeflow-routing-attention`) requiring it to stop ordinary task tools and return its partial state; the Coordinator then handles the new input.

### Persistence and reconciliation

Every routing decision is an event appended as a `freeflow-routing-v2` custom entry on the session branch and read back (`EventStore`). State is the reducer's replay (`state.ts`), which also enforces every transition rule; `event-schema.ts` validates each stored event. Because the journal lives on the branch, navigation and forks select the matching history automatically.

When existing or uncertain state needs reconciliation (startup, reload), `EventStore.reconcile()` first checks that the live branch is persisted. Pi parses the session file when it opens a session and appends each entry synchronously after that, so where Freeflow recorded that point (`trustStartedSession()` at a non-reload `session_start`), comparing only the bytes appended since then with Pi's in-memory entries proves it (`persistedTailMatches()`). Without that trust point, or when anything differs, routing reads a strict read-only snapshot of the whole file (`read-only-session.ts`) with identity, ancestry, UTF-8/JSONL, size and divergence checks. Limits are 512 MiB per session file, 128 MiB per entry, and 250,000 records. An uncertain append or a divergent snapshot blocks automatic work rather than allowing blind repetition.

After reload, tree navigation, context loss, or an external model or effort change, routing recovers the Runtime State, control and profile, unit and assignment, saved report and partial effects, selected evidence and limitations. Navigation replays only the selected ancestry and never re-runs historical tools. Manual holds survive navigation. An external model or effort change under automatic control (Pi's `/model`, Shift+Tab, selecting a Pi virtual model) is reconciled as external state: routing records `control: inactive`, and `index.ts` turns Cognitive Routing off for the session through its Session switch (`cognitiveRouting.enabled: false`), so `/freeflow settings` and the footer show it off. It is not written into presets. Any routing control turns it back on first (`turnRoutingOn()` in `index.ts`): `/freeflow profile auto` or `/freeflow profile <profile>`, Ctrl+Shift+A, Ctrl+Shift+R, or the Session switch; re-enabling hands control to the automatic Coordinator.

### Compaction

Freeflow's and Pi's compaction may remove active user or evidence bodies while the session history keeps them. Routing keeps the last delivered user basis so stored but undelivered entries do not look like new input. Under routing a worker compacts itself mid-assignment with `freeflow_compact` and continues; routing then re-sends the assignment's contract followed by a note that the compaction is done. A Coordinator under projection never compacts; it delegates an assignment that compacts and returns. After a worker's compaction the Coordinator sees a version of the carried context (what the compaction copied into the next cycle) that names the worker's copies, and evidence it received stays in its view until the next compaction. Details: [Compaction](compaction.md).

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| Optimize quality, continuity, responsiveness and total cost together; never a token target alone. | A smaller request that causes repeated investigation or weaker decisions costs more overall. | Token reduction as the success measure. | Task 001 D-002; spec retention contract (10 September 2026) |
| Keep admitted communication: closing, replacing, returning or new attention update responsibility and status but never remove context already admitted to a profile's view. | A report-only explanation must survive the unit closing before the Coordinator answers, without a duplicate delegation (the spec's required example). Deliberate reduction belongs to a future Context Control. | Automatic cleanup on unit close. | Task 001 D-002 |
| Natural-language input always goes through the Coordinator; an unchanged outstanding assignment resumes only through `/freeflow resume`; manual holds survive navigation until released. | Keeps restrictions and identity without a prose classifier deciding whether input means "continue". | Inferring resumption from the user's words. | Task 001 D-001 |
| Mode intents: `helper` maximizes quality (the Coordinator implements, Helper takes what needs no Coordinator-level reasoning); `executor` is the cost saver (Executor does environment work from contracts); `both` sends consequential work to Executor and support to Helper. | The modes serve different goals: quality in `helper`, where under-delegation is the failure to prevent, and cost in `executor`. | Helper by default everywhere (Task 001 D-007, superseded). | Task 007 D-001; Task 001 D-006 |
| State is native session events replayed by a reducer that enforces every transition rule. | Inherits Pi's ancestry (navigation, forks) and avoids two sources of truth. Rules once enforced only in handlers could be bypassed. | A separate state store; handler-only checks. | Spec §1.3; Task 009 D-008, `6bd0031e` |
| Tool definitions stay visible to every profile; the gate decides what may run. | Changing tool lists with profile or settings rewrites the cached prompt on every switch. | Showing each profile only its tools. | Task 004 |
| Only tool results are selectable evidence; worker assistant messages are not. | Workers rarely write text, and what they would select belongs in the report; assistant text candidates flooded evidence inspection. | Selecting whole assistant messages or their text. | Task 009 D-003, `e21fe440` |
| A profile receives another profile's reasoning only on the same model and the same view. | A worker replaying the Coordinator's signed thinking after a different view broke Claude requests and the cache. | Never sharing; always sharing. | Task 009 D-002, `e21fe440` |
| Idle profile switches are staged and applied at the next prompt. | Pi writes a model change and two effort changes per switch (103 of 246 entries in one real session) and checks auth each time; deferring leaves at most one change per prompt and removed stale-context switch bugs. | Applying at once. | Task 009 D-004 |
| A worker selects evidence and returns in one response; problems are fixed with `retry`. | Waiting for a separate selection receipt cost about one extra worker request per assignment. | Waiting for a selection receipt. | Task 009 D-007 |
| A model or effort the user picks in Pi turns routing off for the session, visibly, through the Session switch; any routing control turns it back on. | A hidden `inactive` state left the settings switch showing on with no obvious way back (user, 2026-10-03: "routing should go off and to turn it on, i should either use short cuts or slash commands or freeflow settings"). | Keeping a hidden inactive state resumed only by `/freeflow profile auto`. | user, 2026-10-03 |
| Keep switching the host model; no virtual-model dispatch. A virtual model selected by the user turns routing off. | Host switching works on Pi 0.99.1; virtual dispatch would rework every observed-model invariant for no attribution gain. | Dispatching through a virtual model. | Task 010 D-001 |
| Projection is on by default with routing. | It is where routing's Coordinator saving comes from. | Off by default. | `15cd43b2` |
| Startup verifies persistence by the bytes appended since Pi parsed the file, falling back to a whole-file snapshot; the trust point is set only where Pi just parsed the file, never on `/reload`. | Re-reading and comparing the whole file cost 130 ms on a 24 MB session. A reload keeps Pi's session in memory without re-reading the file, so trusting it there could hide an entry a failed write left out (Pi 1.0.0 source, tag v1.0.0). | Always the full snapshot; trusting on every start. | Task 013 D-001 |
| Event replay at startup stays proportional to the number of routing events; no checkpoints. | A checkpoint would be as large as the log, because routing state keeps every event for idempotency, unless idempotency is redesigned, which touches the persistence guarantees. Replay costs about 15 µs per event. | Checkpoint entries. Revisit if a real session's replay passes 100 ms (about 7,000 events). | Task 013 D-001 |
| Routing tools cannot be called from codemode scripts. | A handoff must be the last call of the persisted assistant message, and a script's nested call never appears in it. Nested calls of ordinary tools are admitted with the call that issued them. | — | `24096258` |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| The Coordinator can call any ordinary tool; nothing in the gate restricts it. | Narrow environment access for the Coordinator is skill guidance, so it can still read what judgment needs. Only workers are gated by phase. | — |
| A worker's report is saved even when its selected evidence has problems. | The report must not be lost; readiness is reported and fixed by `retry`. | Lost reports and repeated work. |
| A returned worker cannot keep working even if the Coordinator's handoff is blocked. | The report ends ordinary task work; only correction or recovery remains. | Workers continue past their contract. |
| Old contracts and reports stay in history after replacement or closure, labelled historical. | Admitted communication is kept (see Decisions). | The Coordinator loses context it already used. |
| Under manual control the gate refuses every routing tool except `freeflow_unit`. | Inspection and closing saved work stay possible while a profile is held. | — |
| New user input during an assignment does not cancel it. | The worker returns partial state; the Coordinator decides. | Lost partial effects. |
| Unknown historical attribution stays unknown. | Model identity is not role identity, and marker-shaped text is not provenance. | Mis-attributed evidence. |
| Projection errors block the request rather than falling back to the full history. | The Coordinator must never receive a worker's full history by accident. | Silent cost and context blow-up. |
| A recovering worker may not run tests or search, even to find the evidence asked for. | Recovery is a bounded lookup, not new work. | Recovery becomes an unreviewed assignment. |
| Changing the delegation mode does not retarget an accepted assignment or its recovery. | The recorded worker owns its assignment. | Work moves between profiles mid-assignment. |

## Surface

**Configuration** (`cognitiveRouting` in `.freeflow/config.json`, overridden by `.freeflow/local.json`, overridden by session scope; validated in `config.ts`). Only the profiles the delegation mode needs must resolve to available models; a missing one makes routing unavailable with the reason in status:

| Key | Default | Notes |
| --- | --- | --- |
| `enabled` | `false` | Session scope may override. |
| `delegation` | `executor` | `executor`, `helper`, `both`. |
| `projection` | `true` | Session scope may override. |
| `profiles.<profile>` | — | `{ provider, model, thinking }` for `coordinator`, `helper`, `executor`. Session presets are separate overrides recorded as events. |

Routing is unavailable inside subagents and when Pi's model registry lacks the needed support.

**Commands:** `/freeflow profile coordinator|helper|executor` (manual hold), `/freeflow profile auto` (release), `/freeflow profile history [diagnostics]`, `/freeflow resume`. Ctrl+Shift+R cycles manual holds; Ctrl+Shift+A releases to the automatic Coordinator. Each of these except `history` turns routing on first when it is off. `/freeflow settings` edits switches and presets.

**Tools:** `freeflow_delegate`, `freeflow_return`, `freeflow_unit`, `freeflow_project` (model-only; see above).

**Session entries:** `freeflow-routing-v2` events. **Transient messages:** `freeflow-routing-v2-state`, `freeflow-routing-attention`, `freeflow-routing-budget`, `freeflow-routing-communication`.

**Skill and prompt:** `capabilities/cognitive-routing/SKILL.md` with `references/helper-mode.md`, `executor-mode.md`, `both-mode.md`; the bootstrap cue `runtime/prompts/cognitive-routing.md`.

**Ports to other subsystems:** `suspendedCoordinator()` (keep-alive), `observationScope()` (cache health), `currentAssignment()`, `assignmentResults()` and `evidenceSource()` (compaction).

## State

- **Session:** the event journal. Event types include `delegate-accepted`, `return-accepted`, `recovery-request-accepted`, `recovery-supplement-accepted`, `recovery-cancelled`, `handoff-retry-requested`, `handoff-prepared`, `handoff-state`, `selection-changed`, `assessment-suspended`, `assessment-resumed`, `unit-closed`, `execution-opened`, `execution-bound`, `execution-interrupted`, `assignment-resumed`, `sources-exposed`, `request-observed`, `profile-overrides` and `delegation-override` (`event-schema.ts` holds the full list and required fields).
- **Memory:** `RoutingSession` holds the bound session, the current turn, blocking errors, control, and caches of replayed state per branch; the assembler caches admissions per leaf. All are rebuilt from the journal.
- **Rebuilt:** on session start, reload and navigation, `bind()` and `ancestryChanged()` replay the branch's events, with the read-only snapshot check where state is uncertain.

## Invariants

The spec's invariants (Task 001 §3.3) that hold today. Most are guarded across the routing suite rather than by one named test; where a test is named below, it was checked to exercise the invariant.

- Freeflow rendering never rewrites a canonical source body; a later Coordinator request extends the earlier one. `communication.test.js` ("reusing earlier-assignment evidence extends the Coordinator's cached request instead of rewriting it"), `tests/cache-reuse/`.
- Only the selected ancestry determines control, selection and residency; invalid ancestry blocks automatic effects. `persistence.test.js` ("fresh no-v2 baseline validates ancestry before allowing automatic effects").
- No worker assignment without an accepted contract and an open unit; only the recorded worker may return, select, supplement or retry. `state.test.js` ("worker identity rejects foreign returns and recovery requests").
- An accepted return ends ordinary task work for that assignment (`worker_task_phase_ended`). `recovery.test.js`.
- Only the Coordinator's disposition closes a unit; closing during recovery is refused or abandons the recovery atomically. `state.test.js`, `recovery.test.js`.
- A failed model switch records the handoff as blocked and tells the user. `handoffs.test.js`.
- Manual holds survive navigation, and `/freeflow resume` cannot release them. `recovery.test.js`.
- Image and failed-source limits stay explicit while error tool results remain evidence. `projection.test.js`.
- Routing tools are declared to the model but not callable from scripts; nested ordinary calls are admitted with their issuing call. `nested-calls.test.js`.
- The producing execution, not the profile live after a switch, determines attribution; unknown attribution stays unknown. Covered in the suite; no single named test.
- Replay never invokes historical tools. By construction (replay reads events only); no single named test.

## Failure Behavior

| Failure | Result |
| --- | --- |
| A routing call is invalid for the current state | Blocked result naming what to reconcile; nothing half-applies. |
| Evidence for a return cannot be delivered | The handoff is `blocked` with reasons; the report stays saved; the worker fixes the selection and retries. |
| Switching Pi's model fails | Handoff `blocked`; the user is told "Couldn't switch to <profile> — report saved" (or assignment). |
| An append is uncertain or a snapshot diverges | Automatic routing blocks, with the reason in `/freeflow status`; no blind repetition. Reloading the session re-runs reconciliation from the persisted file. |
| A response errors or aborts mid-assignment | The assignment stays outstanding; `/freeflow resume` continues it. |
| The assigned worker is unavailable during recovery | Routing blocks rather than substituting another profile. |
| The configuration is invalid or the host lacks support | Routing is unavailable, with the reason in `/freeflow status`. |
| A projection error | The request is blocked; the full worker history is never sent instead. |

## Cost

Routing runs on every request and turn. It follows the [performance rules](../guides/performance.md): state replay is cached per branch (`EventStore` identity fast path), the branch is walked once per leaf, and admissions are cached per leaf. Each view message is rendered once per entry and variant and reused across requests (`ViewCache` in `projection.ts`): a rendering keeps one identity, so request history fingerprints it once, and nothing is cloned per request. Renderings are shared and never mutated; tests run with `FREEFLOW_FREEZE_VIEWS` set to make a mutation throw. View assembly remains a pass over the live context: about 7 ms per request at a normal window and 25 ms at 8,000 live messages (October 2026, down from 73 ms). Session start verifies persistence by the file's tail rather than re-reading it, and replays every routing event, about 15 µs per event: about 50 ms on a 24 MB session with 2,100 events and 90 ms on a 45 MB one with 4,200 (October 2026; 180 and 350 ms before). Replay stays proportional to the number of routing events by decision (see Decisions). The prompt cache side (anchors, keep-alive, per-view prefixes) is in [Request history and prompt cache](request-history-and-cache.md).

## Code Map

See the folder [README](../../pi-extension/src/cognitive-routing/README.md), which lists each file by group (wiring, state, control, requests and tool calls). In short: `runtime.ts` (`RoutingRuntime`, hooks and commands), `session.ts` (`RoutingSession`), `model-control.ts` (the only model switcher), `gate.ts` (`ToolGate`), `handlers.ts` (`ToolHandlers`), `handoffs.ts` (`Handoffs`), `assembler.ts` (`ContextAssembler`), `projection.ts` (`prepareView()`), `sources.ts`, `provenance.ts`, `budget.ts`, `event-store.ts`, `event-schema.ts`, `state.ts`, `config.ts`, `economics.ts` (preset and retention advice), `status.ts`, `tools.ts`, `schemas.ts`, `render.ts`, `types.ts`.

## Tests

See the tests [README](../../pi-extension/tests/cognitive-routing/README.md), grouped by area: end-to-end delegation (`native.test.js`, `delegation.test.js`), state and persistence, turns and handoffs, projection and evidence, recovery and compaction, Pi 0.99 behavior (`pi-099.test.js`, `nested-calls.test.js`), runtime and status, and regressions from earlier reviews (`review-fixes.test.js`). Native tests run the Coordinator on `gpt-4o` and workers on `gpt-4.1-mini`, so each request body shows which profile sent it.

## Limits

Deterministic source and fixture checks establish configuration and gating rules, state transitions, persistence and recovery boundaries, projection structure and source identity, and request construction at their observed boundaries. They do not establish installed-host behavior, universal provider compatibility, independent review, optimal worker selection, provider cache hits or billing savings, model quality, or production readiness.

- Routing is native Pi only; other hosts receive the skill surface without the runtime.
- Context Control v2 (source-aware residency and bounded recovery) is planned and not implemented; the removed legacy context code is in `.deprecated/legacy-context/` and is not a current contract.
- The two known costs above.

## Changes

- Task 013 (2026-10-03): view renderings cached with stable identities (`14a61a40`); startup verified by the file's tail, no trust point on `/reload`.
- `15cd43b2` (2026-10-03): projection on by default.
- `9bf18905`, `9d80fdcd`, `c3e23538`, `a7474bc0`, `d56ab99e` (2026-10-02 to 03): compaction under routing.
- `00a06204`, `24096258` (2026-09-30): Pi 0.99.1 support: message-started runs, codemode nested calls admitted, routing tools kept out of scripts.
- `e41d62da` to `6bd0031e` (2026-09-29): the runtime split into session, model control, gate, assembler, handoffs and handlers; the reducer enforces every transition rule.
- `e21fe440` (2026-09-29): Claude routing qualified; reasoning shared only on the same model and view; worker messages no longer selectable.
- `c6702bb3` (2026-09-15): Helper profile and cache reuse.
- `d05f5615` (2026-09-10): the native routing redesign (Task 001).
