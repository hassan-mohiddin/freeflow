---
name: delegation-harness
description: Use when coordinating Freeflow Pi/cmux pane delegation, orchestrator/planning-parent/execution-parent workflows, task packets, child results, context locality, capability reroutes, multi-agent execution, work packages, worktrees, routing fresh-reviewer/subagent requests, or when the user asks to spawn/manage visible pane agents.
---

# Delegation Harness

Use Freeflow delegation to preserve context locality, not to create agent spectacle.

Core rule:

```text
Store broadly. Return compactly. Promote selectively. Load narrowly.
```

## Subagent Routing Contract

Treat “subagent” as any separate agent context: Freeflow pane, host-native child, reviewer, researcher, worker, verifier, integrator, planning-parent, execution-parent, or future role-specific agent.

When a task warrants separate context, route in this order:

1. Use the Freeflow delegation harness when `delegate_*` tools are available, healthy, and appropriate for the task.
2. Otherwise use the host's native subagent mechanism when available.
3. Otherwise work inline and report that delegation was unavailable or not worth the overhead.

This applies when other skills ask for a fresh reviewer, researcher, verifier, worker, subagent, or independent context. Do not choose a host-native subagent before checking the harness route.

If the harness route is unavailable or inappropriate, name that and the fallback before presenting the work as independently reviewed or delegated.

Do not manually run cmux for normal child management. Manual cmux is only for bootstrapping a parent pane, recovering/debugging the harness itself, or notification/cleanup when the delegation tool surface is unavailable.

Tiny clear work stays inline. Do not create delegation state, specs, plans, or panes when one agent can safely inspect, edit, verify, and close out.

Decide execution delegation from the whole work package, not the next slice. For broad or multi-slice implementation, the execution-parent coordinates and assigns a worker stream; it does not become the main implementer just because the current slice is small. Reuse a worker across sequential slices when context remains useful. Spawn a new worker only for a real context boundary, parallelism, write-scope/capability change, stale context, or isolation need.

Execution-parent inline edits are limited to coordination, reporting, or mechanical integration. If an execution-parent edits product/runtime files, it must state why that edit is not worker-owned.

## Model

- **Orchestrator**: root continuity, user-facing routing, final closeout, final commit/push decision.
- **Planning-parent**: user-guided planning, research synthesis, spec/plan writing, artifact review loops.
- **Execution-parent**: plan-guided execution coordination, worker assignment, review/verification adjudication, integration, planned intermediate commits.
- **Children**: bounded researcher, worker, reviewer, verifier, or integrator panes.

The user normally talks to the orchestrator or active parent. Leaf children communicate through structured results, blockers, status, and evidence pointers.

Harness state and alerts need a failure contract before happy-path implementation: who may set each state, whether it is terminal, what evidence is required, whether it wakes the parent, what must not happen, and the recovery path.

## Hard Stops

Do not spawn before delegation preflight passes. If cmux is missing, unusable, or not the active visible workspace, fail closed and route to inline work, install/start cmux, or disable delegation. Do not fall back to hidden/headless child execution.

Do not dynamically grant tools to a running child pane. If a child lacks capability, route to the parent: handle it there, spawn a different pane, ask the user, or deny/defer.

Do not treat raw child transcripts as handoffs, completion signals, or normal TUI output. Child results, role-native reports, stored status, parent alerts, and parent reports are the handoffs; transcripts and screen captures are recoverable evidence.

Do not use parent polling loops as the normal completion/attention path. Children should emit sparse terminal or attention alerts backed by stored state. `delegate_wait` is explicit watch mode only; use a timeout and retry cap.

Do not send long multiline task packets into an active Pi TUI. Use `delegate_spawn` launch-time packets or `delegate_send` file-backed follow-ups/fixes. Short TUI prompts are only for simple follow-ups.

Do not close completed `--no-session` child panes until the parent or user agrees the context is no longer needed.

Do not let delegation bypass workflow gates. Source-truth conflicts, user-owned decisions, public API, compatibility, security, privacy, billing, data loss, permissions, and irreversible architecture still route to interview/discovery/spec/plan.

Do not parallelize implementation unless independence is explicit and writers are isolated. One writer per checkout.

## Tool Map

- `delegate_status`: inspect preflight, task/agent state, unread parent alerts, and compact execution-map metadata.
- `delegate_task_init`: create repo-local task state under gitignored `.freeflow/delegation/`.
- `delegate_spawn`: preflight, write the task packet, open a visible cmux pane, and start a delegated Pi child.
- `delegate_send`: send a bounded note or file-backed follow-up/fix packet to an existing child.
- `delegate_wait`: bounded watch for terminal/attention state; not a polling loop.
- `delegate_result`: read compact parsed results/reports and evidence pointers; no raw transcript injection.
- `delegate_capture`: save a bounded screen snapshot as evidence without dumping raw screen text.
- `delegate_cancel`: interrupt a valid child while preserving evidence.
- `delegate_close`: close a valid child surface after result/capture is consumed.
- `delegate_record_report`: store planning/execution reports and malformed-report evidence.
- `delegate_finish`: store a terminal child result or parent report and alert the direct parent when the tool is active.
- `delegate_attention`: store blocker/attention state and alert the direct parent.
- `delegate_progress`: store progress without waking the parent by default.
- `delegate_inbox`: read current-task/direct-parent alert state.
- `delegate_ack_alert` / `delegate_ack_all`: mark alert(s) read within scoped inbox rules.
- `delegate_user_attention`: request harness-owned user attention through configured channels.
- `delegate_update_execution_map`: update canonical execution-map package state through validation.

## Normal Tool Flow

1. Decide delegation is warranted; otherwise stay inline.
2. `delegate_status` with preflight when availability matters.
3. `delegate_task_init` for the task.
4. `delegate_spawn` with role/profile, cwd, objective, source pointers, in/out-of-scope, allowed commands, write scope, evidence pointers, and stop conditions.
5. Let child terminal or attention alerts wake the parent. Use `delegate_wait` only for explicit bounded watch.
6. Use `delegate_result`, role-native report tools, or `delegate_status` to consume compact state from the tool output first; read canonical JSON only when the compact envelope is malformed, ambiguous, or insufficient for exact evidence recovery.
7. Use `delegate_send` for bounded fixes/follow-ups when needed.
8. Use `delegate_capture` only for bounded evidence snapshots.
9. Use `delegate_close` only after the parent/user has consumed needed evidence.
10. Promote durable decisions to tracked docs only when workflow requires it; do not commit `.freeflow/delegation/` runtime state.

## Result Protocol

Use the right representation for the interface.

- Child task prompts are readable Markdown by default.
- Tool outputs, alerts, and compact parent-facing envelopes use pipe-style rows that are sufficient for normal parent decisions without reading JSON.
- `delegate_finish`, `delegate_attention`, and role-native result tools are preferred when active.
- Legacy `FFRESULT`, `PLANNING_REPORT`, and `EXECUTION_REPORT` rows are fallback chat protocol; they must use normal ASCII `|` separators and include their closing marker, such as `END_FFRESULT`.
- Do not tell a child to use `delegate_finish` unless that tool is actually active for the child.
- Include output-router evidence pointers (`outputId`, path, or lines) instead of raw command output.

## When To Delegate

Delegate when work has real context boundaries:

- planning research can run independently;
- a reviewer/verifier can inspect a bounded artifact, diff, or command result;
- execution packages can be isolated by dependencies/write sets;
- context-window pressure would force noisy compaction;
- a phase parent can synthesize child outputs into a compact report.

Keep small, reversible, single-file work inline. Do not use slice-local smallness to inline a broad execution plan.

## Phase Flow

1. Orchestrator and user settle the goal and rough scope.
2. Planning-parent owns deep planning and writes/reviews artifacts.
3. Planning-parent reports settled decisions, artifacts, open questions, risks, and execution guidance to orchestrator.
4. Orchestrator starts execution after user-approved planning.
5. Execution-parent builds a live execution map, assigns worker streams for implementation packages, adjudicates reviews, verifies, integrates, and performs planned intermediate commits.
6. Execution-parent reports compact execution evidence to orchestrator.
7. Orchestrator owns final review/verification summary, final commit/push decision, handoff, and completion claim.

Execution autonomy is desired, not guaranteed. If execution reveals new path-changing evidence, route backward.

## Read When Needed

Read `references/context-locality.md` when explaining why delegation exists, deciding whether to delegate, or handling context-window/compaction pressure.

Read `references/roles-and-contracts.md` when deciding which pane owns a phase, who talks to the user, or what a parent/child report should contain.

Read `references/task-packets-and-results.md` when spawning a child, shaping a task packet, handling blockers/capability gaps, or consuming child results.

Read `references/execution-and-integration.md` when using workers, reviewers, verifiers, integrators, worktrees, execution maps, review loops, or commit checkpoints.

Read `references/tool-policy.md` when a child asks for tools, commands, writes, or capability escalation.
