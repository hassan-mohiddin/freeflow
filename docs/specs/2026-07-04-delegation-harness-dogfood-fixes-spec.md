> **Doc ID:** SPEC-2026-07-04-delegation-harness-dogfood-fixes
> **Date:** 2026-07-06
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Approved
> **Source:** 2026-07-04 delegation harness dogfood run, user/orchestrator design discussion, `docs/specs/freeflow-pi-pane-delegation-harness-spec.md`, `docs/plans/2026-07-01-freeflow-pi-pane-delegation-harness-implementation-plan.md`, and `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/` local evidence.

# Delegation Harness Dogfood Fixes Spec

## Purpose

Refine the implemented Freeflow Pi delegation harness after the first end-to-end dogfood run.

The original harness proved the core idea works: visible cmux panes can be spawned, task state can be stored, child outputs can be parsed, and execution can move through planning, research, worker, reviewer, verifier, and parent reports.

The dogfood also showed that several seams are too shallow:

- model input prompts leak pipe-row protocol syntax;
- child results are printed in chat and then parsed/stored, duplicating token usage;
- parent supervision currently relies too much on `delegate_wait` polling;
- alerts are stored but not surfaced as a useful parent/user event system;
- status and execution-map state can break when canonical JSON shape is not preserved;
- role/profile result contracts, especially verifier output, are not strict enough;
- layout and pane retention are not productized;
- batch operations cannot yet cover delegation tool calls;
- parent task-packet return fields conflict with parser/docs-required report fields.

This spec defines the next design target.

## Current Evidence

Dogfood task:

- `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/`

High-signal artifacts:

- `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/planning/dogfood-spec.md`
- `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/planning/executable-plan.md`
- `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/execution-report.json`
- `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/execution/harness-observations.md`

Observed issues:

- `FREEFLOW_TASK_PACKET` pipe rows were hard to read in child panes.
- `delegate_record_report` malformed execution kickoff was easy to trigger because required tag names were strict and not obvious.
- `delegate_wait` timeouts caused repeated waiting instead of alert-driven continuation.
- `delegate_status` hit `Cannot read properties of undefined (reading 'length')` after noncanonical execution-map shape.
- Verifier children produced useful check evidence but malformed `FFRESULT` blocks.
- `sourcePointers` did not accept output IDs, causing confusion about where evidence handles belong.
- Completed reviewer/verifier panes stayed open and cluttered the UI.
- A source-truth conflict was found: parent `RETURN_FIELDS` in task packets are shorter than parser/docs-required parent report fields.
- Execution-parent could treat a small first slice as permission to self-implement a broad multi-slice plan instead of assigning a worker stream.
- Closing/cancelling a parent before reconciling descendants could orphan active reviewer/verifier panes.
- A child prompt could mention `delegate_finish` even when the tool was not actually active, letting a child print “stored with delegate_finish” while canonical result/status stayed pending.
- Alert counts included stale and duplicate historical alerts, making current task attention look noisier than it was.
- A prose or combined write-scope string could pass spawn-time input but fail later as `write_scope_violation` because policy treats it as one path scope.
- Sending follow-up work to a terminal child could leave `delegate_wait` pinned to the old completed state, making the follow-up invisible to normal watch semantics.

## Design Principle

Use separate representations for separate jobs:

```text
Model input prompts        -> human-readable Markdown
Tool outputs / alerts      -> compact pipe rows
Stored canonical state     -> JSON / JSONL
Recoverable raw evidence   -> transcripts, screen logs, routed output IDs
Human debug notes          -> Markdown
```

Do not force one serialization format to serve every interface.

## Delegation Routing Contract

Delegation is a context-locality tool, not ceremony.

### Planning

Planning delegation is recommended, not forced.

Use orchestrator-only planning when the user is brainstorming, asking questions, or shaping a small task that one agent can hold in context.

Recommend a planning-parent and researcher when planning has real context boundaries:

- broad repo or docs discovery;
- multiple artifacts;
- artifact review loops;
- planning context likely to pollute execution;
- future autonomous execution needs a compact handoff.

If the user explicitly asks to dogfood, test, or use the harness, use the harness.

### Subagent routing priority

Treat "subagent" as any separate agent context, not only a host-native hidden subagent. A subagent may be:

- a Freeflow visible cmux/Pi pane agent;
- a host-native subagent in Claude, Codex, or another agent harness;
- a Pi `pi-subagents` child;
- a reviewer, researcher, worker, verifier, integrator, parent, or future role-specific child.

When a task warrants a subagent, choose the delegation route in this order:

1. Use the Freeflow delegation harness when it is available, healthy, and appropriate for the task.
2. Otherwise use the host's native subagent mechanism when available.
3. Otherwise do the work inline and report that delegation was unavailable or not worth the overhead.

This rule applies across skills. Generic instructions such as "use a fresh reviewer" or "spawn a researcher" should route through the harness first when the harness is available.

Do not require a full execution-parent for every small delegated task. The orchestrator or active parent may spawn a single reviewer, researcher, verifier, or worker child directly when that is enough.

Tiny work can still stay inline. The point is to prevent the orchestrator or parent from accidentally becoming the worker/reviewer/verifier for context-heavy or role-separated work.

### Execution

Tiny work stays inline:

```text
inspect enough -> edit -> verify -> closeout
```

Use execution-parent and children when execution crosses a delegation threshold:

- multiple work packages or slices;
- reviewer/verifier loops;
- independent research/implementation/review roles;
- context pressure;
- expected parallelism or worktree isolation;
- planned intermediate commits;
- integration risk.

For broad execution, the agent should stop before doing it inline and route:

```text
This crosses the delegation threshold. Use the harness, narrow the task, or explicitly bypass.
```

Execution-parent routing must be package/global, not slice-local. If the approved execution has multiple slices, review/fix loops, integration risk, or sustained context, the execution-parent coordinates and assigns implementation to a worker stream. It must not self-implement just because the current slice is small.

A worker may own multiple sequential slices when context remains useful and the write scope stays coherent. Spawn a fresh worker only for a real context boundary, parallelism, changed capability/write scope, stale context, or isolation need.

Execution-parent inline edits are limited to coordination, reporting, or mechanical integration. If the parent edits product/runtime files, it must record why the edit is not worker-owned.

## Task Packet Prompt Rendering

### Requirement

Task packets delivered to model sessions must be rendered as readable Markdown by default.

The canonical task packet remains structured internally, but the child sees a clear prompt, not pipe rows.

Example shape:

```md
# Delegated task: worker-p1

## Objective
Add focused parent packet return protocol tests.

## Scope
In:
- `delegation/tests/delegation.test.js`

Out:
- tracked docs
- commits or pushes
- runtime behavior changes unless a source-truth conflict is reported

## Tools and policy
Allowed:
- read
- edit/write inside `delegation/tests/delegation.test.js`
- `node --test delegation/tests/*.test.js`

Denied:
- delegation tools
- `git push`
- destructive shell
- writes outside scope

## Stop conditions
Stop if:
- source truth conflicts with the plan;
- verification cannot run;
- the fix requires product/API/security/privacy/billing/data-loss decisions.

## Return
Use `delegate_finish` when complete.
Use `delegate_attention` if blocked or if parent input is needed.
```

### Machine metadata

A task packet may include a short machine-readable header or footer when needed, but the main prompt must remain human-readable.

Pipe-row examples are allowed only inside the return/protocol section when a legacy chat-parser fallback is still supported.

## Result And Attention Submission

### Requirement

Children and parents should not print full final results, reports, or findings into chat as the primary transport.

Add structured result-submission tools:

- `delegate_finish`
- `delegate_attention`
- optional `delegate_progress` for store-only progress

These are not parent-control delegation tools. They are child-safe lifecycle/reporting tools. Leaf profiles may receive result-submission tools while still being denied parent-control tools such as `delegate_spawn`, `delegate_send`, `delegate_close`, `delegate_cancel`, broad `delegate_status`, or task initialization.

`delegate_finish` stores a terminal result or report and alerts the direct parent.

`delegate_attention` stores a non-terminal or terminal attention/blocker event and alerts the direct parent.

`delegate_progress` stores progress without waking the parent by default.

### Tool authority split

Use two tool classes:

- **Parent-control tools**: create tasks, spawn panes, send follow-ups, close/cancel panes, record parent reports, inspect broad task state.
- **Child lifecycle tools**: submit final results, request attention, and record store-only progress for the current delegated agent.

Researcher/reviewer/verifier/worker profiles should not receive parent-control tools. They may receive child lifecycle tools scoped to their own `taskId` and `agentId`.

Runtime task packets must match actual active tools. If Pi cannot apply scoped profile tools or child lifecycle tools, the harness must fail closed, omit unavailable tool instructions, or clearly route to the legacy fallback before the child starts. Do not tell a child to use `delegate_finish` unless `delegate_finish` is actually available to that child.

### `delegate_finish` behavior

A `delegate_finish` call must:

1. validate the role-specific schema;
2. write canonical JSON under the agent/task store;
3. write compact model-visible text only if needed for recovery/debug;
4. append events JSONL;
5. update agent status;
6. enqueue an alert for the direct parent;
7. optionally trigger user-facing notification when the parent/orchestrator needs human attention;
8. return a tiny confirmation to the child.

The child-facing confirmation should be compact:

```text
delegate_finish|stored|parent_alerted|task=...|agent=...
```

It must not echo the full submitted result.

A sentence such as “Review stored with delegate_finish” is not a result. `delegate_finish` counts only when canonical result/report JSON, terminal status, events, and the direct-parent alert were written. If a child claims storage without those records, `delegate_result` must report pending or malformed state with recovery pointers, not success.

### Chat parser fallback

Legacy `FFRESULT`, `PLANNING_REPORT`, and `EXECUTION_REPORT` parsing from assistant chat may remain as a fallback.

Fallback parser output must be treated as less preferred than direct tool submission. Direct tool submission and fallback parsing must not create duplicate terminal alerts for the same canonical result.

## Evented Parent Inbox And Alerts

### Requirement

Use an evented mailbox, not duplex freeform chat and not polling-first supervision.

Normal communication:

```text
parent -> task/fix packet -> running child
child -> delegate_finish/delegate_attention -> harness store
harness -> compact alert envelope -> direct parent inbox
parent -> consumes alert and decides next action
```

### Alert envelope

Alerts should be compact pipe rows when surfaced to model context or tool output:

```text
ALERT|completed|from=worker-p1|summary=Added parent packet test|result=.freeflow/.../result.json
ALERT_EVIDENCE|check|ffout_...|node --test delegation/tests/*.test.js passed
```

Stored JSON contains the canonical alert.

Alert envelope should include enough for routing without forcing a result read:

- task id;
- from agent;
- direct parent;
- outcome/status;
- one-line summary;
- changed files or checks when relevant;
- result/report/evidence pointers;
- ack state;
- timestamps.

### Alert types

Parent-waking alert types:

- `completed`
- `completed_with_risks`
- `blocked`
- `failed`
- `cancelled`
- `attention`
- `capability_gap`
- parent report ready

Store-only event types:

- progress;
- check started;
- routine tool call;
- screen/transcript capture;
- low-value debug notes.

### Ack and stale alert handling

Add alert tools or status options:

- `delegate_inbox`
- `delegate_ack_alert`
- `delegate_ack_all`
- `delegate_status unreadOnly=true`

Default status should not dump old alerts. It should show current task, direct-parent unread alerts, and compact counts.

Unread counts must be scoped to the current task/direct parent by default. Historical alerts remain recoverable, but closed/completed old tasks must not inflate the normal unread count unless the caller explicitly asks for historical/global status.

A single terminal child result must produce one parent-facing unread alert. If the same result is observed through both `delegate_finish` and legacy parser fallback, dedupe by task, agent, result status, result path/content hash, and event type before surfacing it.

## User Attention And Desktop Notifications

The harness should support user-facing notifications when a human decision or reading step is needed.

This should be harness-owned, not a model shell command such as `osascript` or `terminal-notifier` emitted by the agent.

### Notification model

Autonomous execution should be quiet in the ideal path:

```text
approved spec/plan
-> execution-parent
-> workers/reviewers/verifiers
-> execution report
-> orchestrator final review/verification/closeout
-> done
```

Leaf child completion alerts go to the direct parent inbox only. They do not notify the user by default.

The model or parent may request user attention when it semantically knows the user must read, decide, approve, unblock, or close out. The harness owns delivery, dedupe, and channel policy.

Use a harness tool such as `delegate_user_attention` rather than shelling out from model code:

```text
delegate_user_attention|level=needs_decision|task=...|summary=Source-truth conflict needs owner decision.
```

The same tool may be used for a final successful completion notification when the task is done or when the user asked to be notified on completion.

### When to notify the user

Notify the user when the active orchestrator or active parent reaches a state that expects user attention:

- parent/orchestrator completed its turn and is waiting for user input;
- user-owned decision needed;
- source-truth conflict;
- blocked/failure requiring user choice;
- planning report ready for execution decision;
- execution report ready for closeout decision;
- final closeout summary ready;
- autonomous task completed successfully and the configured policy says to notify on completion.

Do not notify for every leaf child completion by default. Leaf child alerts go to the direct parent inbox. Escalate to user only if the direct parent is unavailable, explicitly watched, or the event is configured as user-facing.

### Notification channels

Support channels as capabilities, not model behavior.

Default first implementation:

- cmux notification/attention marker for visible workspace attention;
- TUI badge/inbox for persistent unread attention state.

Optional/configured channels:

- desktop notification;
- cmux pane title/status mark;
- optional sound/bell.

Notification text must be short:

```text
Freeflow: execution-parent blocked
Source-truth conflict. See task dogfood-e2e-delegation-20260704.
```

Completion notification text should also be short:

```text
Freeflow: task complete
Final verification passed. See task dogfood-e2e-delegation-20260704.
```

### Anti-spam rules

- Deduplicate by task/agent/state/event.
- Require ack or state change before repeating.
- Coalesce multiple child alerts into one parent summary when possible.
- Allow user-level notification preferences.

## Follow-ups And Attempts

`delegate_send` may send bounded notes, fixes, or follow-ups only to non-terminal children. Once a child is completed, blocked terminal, failed, cancelled, or closed, follow-up work must either spawn a new child or create an explicit new attempt with its own state/result identity. The harness must not silently send work into a terminal pane while `delegate_wait` and `delegate_result` continue to observe the old terminal state.

Until explicit attempts exist, sending to a terminal child should fail closed with a clear reroute.

## `delegate_wait`

`delegate_wait` remains explicit watch mode only.

It must not be the normal supervision loop.

Rules:

- timeout required;
- no autonomous indefinite retry;
- retry cap enforced;
- after cap, route to alert-only mode;
- timeout is heartbeat, not failure.

Parent agents should normally end their turn or continue other work after spawning children. They should not repeatedly wait unless the user explicitly requested watch mode or the work is a short smoke check.

## Result Consumption

`delegate_result` should return a compact result envelope by default, not raw JSON and not a transcript.

It should be useful enough for the common happy path:

```text
delegate_result|completed|agent=worker-p1|files=1|checks=1 pass|result=...
SUMMARY|Added parent packet return protocol test.
FILE|delegation/tests/delegation.test.js
CHECK|node --test delegation/tests/*.test.js|pass|outputId=ffout_...
```

Detailed mode can expose parsed rows, report fields, and evidence pointers.

Raw transcripts/screens require explicit capture/retrieve paths.

## Freeflow Batch Expansion

Broaden `freeflow_batch` beyond `run` and `search`, but only for Freeflow-owned operations with declared safety contracts.

Initial delegation batch kinds should be safety-contract-gated, not described as read-only:

- `delegate_status`: reads harness state.
- `delegate_inbox`: reads alert state.
- `delegate_result`: reads parsed result/report state.
- `delegate_capture`: writes recoverable screen evidence.
- `delegate_close`: mutates pane/harness state while preserving evidence.
- `delegate_ack_alert`: mutates alert ack state.

Conditional later kinds:

- `delegate_spawn`, only when independence/write-scope/layout safety is explicit;
- `delegate_send`, only for independent follow-ups to different agents.

Do not batch arbitrary mutating shell/tool calls without concurrency metadata.

Every batchable operation needs metadata:

- read-only or mutating harness state;
- mutates repo or not;
- requires one-writer-per-checkout or not;
- parallel-safe or conditional;
- failure behavior.

## Profiles And Role Contracts

Profiles must define both tools and result contracts.

### Planning parent

- Broad coordination and artifact tools.
- Delegation tools allowed.
- Product-code edits discouraged/blocked unless explicitly scoped.
- Returns planning report via `delegate_finish` or report tool.

### Execution parent

- Broad coordination tools.
- Delegation tools allowed.
- May coordinate planned checkpoint commits only when approved.
- Returns execution report via `delegate_finish` or report tool.

### Researcher

- Read/search/routed evidence tools.
- No edit/write.
- No parent-control delegation tools.
- May use child lifecycle tools to finish, request attention, or record progress.
- Returns evidence summary with pointers.

### Worker

- Read/edit/write/bash/routed tools inside assigned scope.
- No parent-control delegation tools.
- May use child lifecycle tools to finish, request attention, or record progress.
- No commit/push by default.
- Returns changed files, checks, uncertainty, recommendation.

### Reviewer

- Read/search/routed evidence tools.
- No edit/write.
- No parent-control delegation tools.
- May use child lifecycle tools to finish, request attention, or record progress.
- Reports blocking, non-blocking, questions, and needs-evidence findings.
- Does not fix.

### Verifier

- Read/run allowed checks.
- No edit/write.
- No parent-control delegation tools.
- May use child lifecycle tools to finish, request attention, or record progress.
- Strict result schema.
- Must use canonical statuses: `completed`, `completed_with_risks`, `blocked`, `failed`, `cancelled`.
- Check statuses can be `pass`, `fail`, `skipped`, `not_run`, but not as top-level result status.

### Integrator

- Writes only in assigned integration checkout.
- No push.
- Escalates behavior/design/source-truth conflicts.

## Parent Report Field Contract

Resolve the dogfood source-truth conflict by aligning default parent return fields with parser/docs-required fields.

Planning report fields:

```text
status
goal
artifact_paths
review_status
settled_decisions
open_questions
execution_autonomy
user_checkpoints
execution_guidance
risks
evidence
```

Execution report fields:

```text
status
summary
source_references
work_packages
commits
reviews
checks
files_changed
plan_deviations
stop_conditions_hit
open_questions
risks
final_recommendation
evidence
```

If the implementation moves fully to `delegate_finish`/report tools, task prompts should show these as readable schemas, not pipe rows.

## Canonical State And Robust Status

Harness-owned canonical JSON must be schema-validated.

Files such as `execution-map.json`, `status.json`, `registry.json`, and report JSON should be written through harness helpers/tools, not manually overwritten by model-generated `write` calls.

If canonical state is malformed, status tools must degrade gracefully:

```text
delegate_status|degraded|execution_map_invalid|task=...
reason|missing packages[].checks array
recovery|read last-good map or regenerate through delegate_update_execution_map
```

No status call should crash with internal JavaScript errors.

Recommended helper tools:

- `delegate_update_execution_map`
- `delegate_append_execution_note`
- schema validation inside existing report/result tools

## Layout Manager

Role-aware layout should replace ad hoc `direction` use.

Default layout:

```text
left:
  orchestrator

right / planning:
  planning-parent
  planning children

right / execution:
  execution-parent
  execution children

short-lived dock:
  reviewer/verifier panes
```

Rules:

- Parent panes stay prominent.
- Children group under their direct parent.
- Reviewer/verifier panes are visually short-lived.
- Spawn should accept a layout policy or infer it from role/profile.
- Manual `direction` remains an override.

## Pane Retention And Auto-Close

Default retention should reduce clutter while preserving evidence.

Recommended policy:

- researcher: close after parent consumes successful result unless marked reusable;
- reviewer: close after parent consumes pass/non-blocking result;
- reviewer with blocking, question, or needs-evidence findings: keep open through adjudication, fix, and re-review unless the parent/user explicitly closes it;
- verifier: close after parent consumes passing result;
- worker: keep open through review/fix loop, close after package accepted or parked;
- parent: close only after report consumed and orchestrator/user agrees;
- failed/blocked/attention panes: keep open for inspection.

Closing or cancelling a parent must reconcile descendants first. The harness should block the close, warn, or require an explicit close/cancel/adopt decision for active children; completed child results should be consumed or explicitly parked before the parent disappears. No parent close path should silently orphan active child panes.

Support retention modes:

```text
auto
keep-open
debug
```

Dogfood/debug sessions can default to `debug`. Normal harness runs should default to `auto`.

## Skill Routing Updates

This spec includes a skill behavior update slice.

`delegation-harness` should become the source of truth for subagent routing priority. It should also carry the agent-facing contract for Markdown task prompts, child lifecycle result tools, inbox/ack/user attention, robust status handling, and pane retention so runtime behavior and skill guidance stay aligned.

Other skills should not duplicate the full policy; they should reference the delegation route when they call for a subagent, reviewer, researcher, worker, verifier, or fresh independent context.

Initial skills to update with short pointers:

- `workflow`
- `discover`
- `write-plan`
- `execute-plan`
- `review-artifact`
- `review-work`
- `verify-work`
- `diagnose-failure`

The update should preserve portability: in hosts without the Freeflow delegation harness, use host-native subagents when available, then inline fallback.

Add eval coverage for prompts such as "review this spec with a fresh reviewer" so the expected route is harness delegation when available, not hidden/native subagents.

## Source Pointers, Evidence Handles, And Write Scopes

Clarify input fields:

- `sourcePointers`: file/path/source-truth pointers.
- `evidence`: output IDs, prior run IDs, result paths, and check evidence.
- `writeScope`: path or glob scopes only, not prose policy text.

If possible, allow output IDs in a first-class evidence field and render them clearly in task prompts.

Do not force users or agents to encode output IDs as fake paths.

Write-scope input must either support multiple explicit scopes or fail fast when a prose/combined scope is provided. A spawn call should not accept text such as “may touch delegation/**, pi-extension/**, router/**” and later fail because policy interpreted the entire sentence as one path.

## Out Of Scope

This spec does not require:

- replacing cmux;
- hidden/headless child fallback;
- dynamic tool grants;
- leaf agents spawning children;
- automatic commits or pushes;
- full duplex freeform parent/child chat;
- injecting full child transcripts into parent context;
- turning every planning discussion into delegated planning.

## Acceptance Criteria

### Prompt rendering

- Spawned child task prompt is readable Markdown by default.
- Pipe rows do not dominate model input prompts.
- Compact pipe rendering remains available for tool outputs and result envelopes.

### Result submission

- A child can complete via `delegate_finish` without printing a full `FFRESULT` in chat.
- Task packets mention `delegate_finish` only when the tool is actually active for that child.
- A claimed `delegate_finish` without canonical result/status/event/alert records is treated as pending or malformed, not successful.
- The direct parent receives a compact alert envelope with result pointers.
- Canonical result JSON is stored.
- Chat parser fallback still works for legacy children without creating duplicate terminal alerts.

### Alerts and user notifications

- Child terminal/attention events enqueue direct-parent alerts without `delegate_wait`.
- Parent/orchestrator user-attention events can trigger TUI/desktop notification through the harness.
- Alerts are deduped, ackable, scoped to current task/direct parent by default, and not dumped from old tasks by default.

### Status robustness

- `delegate_status` never crashes on malformed execution-map/status/report files.
- Malformed canonical state returns degraded status with recovery guidance.

### Profiles

- Researcher/reviewer/verifier do not receive parent-control delegation tools.
- Leaf profiles may receive scoped child lifecycle tools such as `delegate_finish`, `delegate_attention`, and `delegate_progress`.
- Worker can write only in scope.
- Verifier top-level statuses reject `PASS` and provide a clear schema hint.

### Batch

- `freeflow_batch` can batch safety-contract-gated delegation operations such as status, inbox, result, capture, close, and ack.
- Each batched delegation operation declares whether it reads state, writes evidence, mutates harness state, mutates repo state, and is parallel-safe.
- Batch refuses or clearly gates unsafe mutating parallel operations.

### Skill routing

- `delegation-harness` defines the global subagent routing priority.
- Skills that ask for fresh reviewers, researchers, workers, verifiers, or subagents reference that route instead of hardcoding host-native subagents.
- Eval coverage proves harness delegation is preferred when available and healthy.

### Live runtime smoke

- Live cmux smoke exercises the installed/reloaded Freeflow runtime, not a stale already-loaded session.
- If the current host cannot load WIP extension changes, live smoke happens after commit, push, and local update/reload.
- Completion is not claimed until post-reload smoke passes, or smoke failure is reported with a follow-up fix route.

### Layout and retention

- Default role-aware layout groups parents and children predictably.
- Passed reviewer/verifier panes can auto-close after parent consumption while preserving evidence.
- Parent close/cancel paths reconcile active descendants by requiring close, cancel, adopt, or park decisions before the parent disappears.
- Follow-ups to terminal children are rejected or represented as explicit new attempts so wait/result semantics do not observe stale terminal state.
- Debug mode can keep panes open for observation.

### Parent report fields

- Planning/execution parent task return contracts match parser/docs-required report fields.
- Tests cover parent report field alignment.

### Write scopes

- `delegate_spawn` either accepts multiple explicit write scopes or rejects prose/combined write scopes before launch with a clear expected format.
- Policy decisions and task packet rendering show the normalized scopes the child actually received.

## Open Questions

1. Which Pi extension mechanism can surface or wake parent/orchestrator alerts without polling?
2. What desktop notification backend should the harness use on macOS, and how should it degrade elsewhere?
3. Should parent/orchestrator completion notifications be enabled by default or opt-in per task/session?
4. What exact schema should `delegate_finish` use for role-native reviewer and verifier outputs?
5. Should canonical execution-map updates require a dedicated tool, or can existing report tools own all map mutations?
6. How much of the role-aware layout can cmux reliably support today?
7. Should auto-close happen immediately after parent reads an alert/result, or after parent explicitly acks it?

## Recommended Implementation Order

1. Update skill routing/evals so subagent requests prefer the Freeflow delegation harness when available.
2. Resolve parent report field contract and add tests before new report/result tooling builds on the current mismatch.
3. Split parent-control tools from child lifecycle tools.
4. Add `delegate_finish` and `delegate_attention` with schema validation and compact alerts.
5. Render task packets as Markdown prompts while preserving canonical JSON storage.
6. Implement parent inbox, alert ack, and user-attention notification contract.
7. Harden `delegate_status` and canonical state validation.
8. Tighten verifier/reviewer profile schemas.
9. Add pane retention/auto-close policy.
10. Add role-aware layout manager.
11. Broaden `freeflow_batch` to safe delegation operations.
