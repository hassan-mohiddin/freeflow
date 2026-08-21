> **Doc ID:** SPEC-2026-07-01-freeflow-pi-pane-delegation-harness
> **Date:** 2026-07-01
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** Shared delegation-harness discovery session, `docs/designs/delegation/local-delegation-harness-design.md`, Codex CLI agent-harness research passes 4/6/7/8, Pi sessions/extensions/model docs, current Freeflow workflow and output-router skills.

# Freeflow Pi Pane Delegation Harness Spec

## Purpose

Define a Freeflow/Pi extension that lets one user work with a visible, deterministic tree of Pi pane-agents in cmux.

The goal is not to replace Pi. The goal is to extend Pi with a Freeflow delegation layer that improves context locality, preserves user control, and lets work move through planning and execution without forcing one overloaded conversation to carry every phase, slice, review, command output, and compaction.

This harness should make delegation feel like working with a coordinated team:

```text
user
  -> orchestrator
    -> planning-parent
      -> researcher / reviewer
    -> execution-parent
      -> worker / reviewer / verifier / integrator
```

The orchestrator remains the continuity layer. Parent agents own phase context. Leaf agents produce bounded evidence, implementation, review, or verification results.

## Problem

Today, substantial work often happens in one terminal with one agent:

```text
brainstorm -> spec -> plan -> review -> compact -> slice -> compact -> review -> compact -> slice -> ...
```

This creates several problems:

- planning consumes large context because it must explore, challenge, and settle many decisions;
- execution inherits planning context even when each slice only needs a small subset;
- reviews, verification output, failures, and fixes repeatedly bloat the same session;
- many compactions make the backend history hard to manage;
- the user has to carry the conversation map and decide when to split work;
- raw transcripts and command outputs can enter model context when only compact evidence is needed.

Freeflow skills already improve agent behavior. Output Router already improves evidence transport and context control. The missing layer is deterministic delegation: bounded agents with visible panes, explicit task packets, parseable results, policy-enforced tools, and recoverable evidence.

## Intended Outcome

Build a Pi extension for Freeflow that provides:

- cmux pane creation for visible delegated Pi sessions;
- fail-closed delegation preflight when cmux or child Pi startup is unavailable;
- Pi-only child runners, with model choice handled through Pi;
- role/profile-based tool activation and policy guards;
- automatic task-packet delivery to child panes;
- compact model-visible protocols for task packets, results, parent reports, blockers, and status;
- internal JSON/JSONL state for deterministic tools;
- event-derived status and monitoring;
- parent/child wait, cancel, capture, and close tools;
- compact Pi TUI rendering for delegation calls/results, with expanded details and recoverable evidence pointers;
- output-router-aware evidence handling;
- execution support for sequential and parallel work packages, including worktree isolation;
- commit checkpoint and closeout ownership rules.

The design target is:

```text
Store broadly. Return compactly. Promote selectively. Load narrowly.
```

Raw transcripts and routed output remain recoverable. Parent agents consume compact reports and evidence pointers. Specs, plans, reviews, and handoffs remain the promoted durable memory when they need to guide future work.

## Product Principles

### Workflow Scales Down

Delegation is not mandatory workflow ceremony. For a clear tiny task, normal Freeflow may be only:

```text
inspect enough -> execute -> verify -> commit/closeout
```

Do not launch planning-parent, execution-parent, write spec/plan artifacts, or spawn pane agents when one agent can safely complete the work without context pressure. Use strict-workflow when risk requires stronger gates.

### Agent As Partner

Freeflow agents should behave as collaborative senior engineers and workflow navigators, not passive executors. They should answer directly, challenge weak assumptions, surface missing path-changing topics, recommend routes, and preserve user authority over user-owned decisions.

### Context Locality First

Delegation exists primarily to improve context locality, not to create agent spectacle. Parallelism is useful only when it preserves safe boundaries.

Each agent should receive only the context needed for its job:

- orchestrator: task continuity, phase state, promoted reports;
- planning-parent: deep planning and artifact context;
- execution-parent: execution map and coordination context;
- leaf agents: bounded task packet plus allowed evidence/tools.

### Deterministic Harness Around Probabilistic Models

The model may be probabilistic. The harness should not be.

The harness owns:

- task/run directories;
- manifests and status files;
- event logs;
- active tool profiles;
- policy guards;
- result parsing;
- pane refs;
- timeout/cancel/close state;
- report storage.

The model outputs compact text blocks. The extension parses and stores canonical state.

### Failure Contracts Before Happy Paths

For consequential harness behavior, define the failure contract before implementing the successful path.

For each state, tool, parser, alert, send path, wait mode, and close/cancel path, the harness should define:

- what can fail;
- who observes the failure;
- what state/event is written;
- whether the path fails closed, fails open, degrades, escalates, or retries;
- what must not happen;
- how the parent/user recovers;
- what evidence proves the failure was handled.

Ambiguous states are product bugs. A child or parent should not have to guess between two states such as `failed` and `cancelled`.

### Empowerment With Guardrails

Do not cripple child agents by removing every useful tool. Give each role enough tools to do its assigned job efficiently. Enforce boundaries with:

```text
active tool allowlist + tool-call policy guard + parent oversight
```

No dynamic tool grants are supported. If a child lacks a capability, it requests rerouting through its parent.

## Scope

In scope:

- Pi extension tools for delegation.
- cmux pane adapter.
- cmux/delegation availability preflight and fail-closed unavailable states.
- Pi-only delegated runners.
- Role/profile definitions.
- Tool allowlists and policy guards.
- Compact task/result/report protocols.
- Repo-local gitignored delegation store under `.freeflow/delegation/`.
- Automatic child task-packet delivery.
- Status, wait, result, send, capture, cancel, close behavior.
- Parent handoff reports: planning report, execution kickoff, execution report.
- Output-router bridge for recoverable child evidence.
- Pi TUI render contracts for collapsed and expanded delegation tool views.
- Worktree-aware worker/integrator behavior.
- Planned intermediate commit checkpoints owned by execution-parent.
- Final closeout owned by orchestrator.

Out of scope:

- tmux integration.
- A custom non-Pi agent harness.
- pi-subagents integration.
- Dynamic tool grants inside running child panes.
- Leaf agents spawning children.
- Hard-gating Freeflow skills per role.
- Automatic push without user confirmation.
- Hidden/headless fallback children when cmux visible-pane behavior is unavailable.
- Treating `.freeflow/delegation/` as shared durable project truth.
- CLI-first implementation. Human/debug CLI may be added later, but Pi tools are the product surface for this spec.

## Architecture

```text
cmux workspace
  -> visible panes/surfaces
    -> Pi process per pane
      -> selected model through Pi
      -> Freeflow extension
        -> role/profile startup context
        -> active tools
        -> policy guards
        -> result/status parsing
        -> delegation store writes
```

The delegation harness consists of:

- **Delegation tools** registered in Pi.
- **cmux adapter** for panes/surfaces and screen capture.
- **Run store** under `.freeflow/delegation/`.
- **Context/profile compiler** for compact delegated-pane startup instructions.
- **Task-packet compiler** for per-agent assignments.
- **Protocol parser** for `FFRESULT`, status, attention, parent reports, and blockers.
- **Tool policy guard** using Pi `tool_call` hooks.
- **Output-router bridge** by referencing routed output IDs and recovery paths in child results.

## Roles

### Orchestrator

Root user-facing coordinator and continuity layer.

Responsibilities:

- define goal with the user;
- launch planning-parent and execution-parent;
- monitor parent-level state;
- own final closeout, final commit/push decision, and completion claim;
- inspect children when needed without bypassing parents by default.

Session policy:

- saved Pi session.

Tool access:

- broad normal Pi/Freeflow tools;
- delegation tools;
- web/fetch/MCP tools when configured.

### Planning Parent

Deep planning conversation owner.

Responsibilities:

- brainstorm and shape work with the user;
- perform basic repo scouting inline;
- launch researcher for deep/broad/specialized research;
- write spec and plan artifacts from gained context;
- launch reviewer for artifact review;
- iterate artifacts until passed, blocked, or explicitly routed;
- produce `PLANNING_REPORT` for orchestrator.

Session policy:

- no Pi session by default; harness stores transcript and reports.

Tool access:

- broad tools, including read/bash/edit/write, Freeflow routed tools, web/fetch when available, and delegation tools.

Policy:

- writes are expected for docs/specs/plans/reviews/handoffs and delegation state;
- product-code edits are discouraged and may be blocked unless explicitly in scope.

### Execution Parent

Execution phase coordinator.

Responsibilities:

- read execution kickoff, spec, plan, and planning report;
- create live execution map;
- split work into work packages;
- launch workers, reviewers, verifiers, integrator, and researcher when needed;
- adjudicate review findings;
- route failures and stop conditions;
- perform planned intermediate commit checkpoints;
- produce `EXECUTION_REPORT` for orchestrator.

Session policy:

- no Pi session by default; harness stores transcript and reports.

Tool access:

- broad tools, including delegation tools.

Policy:

- may perform planned intermediate commits;
- no push;
- usually delegates code edits to workers or integrator.

### Researcher

Deep evidence gatherer.

Responsibilities:

- perform broad/deep codebase research, web research, docs research, or MCP-backed research;
- return compact evidence summaries with pointers;
- avoid raw dumps.

Tool access:

- read;
- Freeflow search/run with policy;
- web/fetch when configured;
- read-only MCP tools when configured.

Policy:

- no edit/write;
- no mutation;
- command execution only when allowed by task policy.

### Worker

Implementation agent for an assigned work package.

Responsibilities:

- implement assigned package only;
- stay inside assigned checkout/worktree;
- run allowed checks when appropriate;
- report files changed, checks, uncertainty, and recommendation.

Tool access:

- read/bash/edit/write;
- Freeflow search/run/status.

Policy:

- write only inside assigned checkout/worktree;
- no delegation tools;
- no push;
- no commit by default.

### Reviewer

Review agent for either artifacts or implementation work.

Responsibilities:

- review assigned artifact, diff, package, or final work;
- classify findings;
- report blocking/non-blocking/question/needs-evidence findings;
- not fix findings.

Tool access:

- read;
- Freeflow search/run with policy.

Policy:

- no edit/write;
- no direct fixes;
- if verification evidence is needed outside authority, request reroute to verifier or parent.

### Verifier

Check runner and evidence reporter.

Responsibilities:

- run allowed checks;
- report output IDs/evidence;
- avoid broadening verification beyond the packet unless asked.

Tool access:

- read/bash;
- Freeflow run/search/status.

Policy:

- no edit/write;
- commands must be allowed by task packet.

### Integrator

Combines worker outputs and resolves integration-level issues.

Responsibilities:

- merge/apply worker outputs in assigned integration checkout;
- resolve mechanical conflicts within scope;
- run or request integration checks;
- report merge order, conflicts, checks, and risks.

Tool access:

- read/bash/edit/write;
- Freeflow search/run/status.

Policy:

- write only in assigned integration checkout;
- merge/apply commands must be in task packet;
- no push;
- commit only if explicitly assigned by execution-parent;
- escalate behavior/design/source-truth conflicts.

## Profiles And Skills

Profiles do not hard-gate Freeflow skills.

Skills are guidance. Tools are capability. A role profile controls:

- active tools;
- tool-call policy;
- session behavior;
- cwd/worktree;
- compact startup context emphasis;
- expected result/report protocol.

All child Pi panes may use installed Freeflow skills through normal Pi skill discovery/progressive disclosure. Profiles emphasize relevant behavior but do not hide unrelated skills.

Every delegated profile receives compact output-router guidance:

```text
Use Freeflow routed tools for broad/noisy/unknown-size output: repo-wide search, tests, logs, builds, broad diffs, generated output.
Use direct read only for exact known-small files.
Return compact summaries with evidence pointers, not raw dumps.
```

## Tool Policy

### No Dynamic Tool Grants

A running child pane cannot receive new tools.

If a child lacks a capability, it returns a blocked/capability request. The parent then handles it by:

- doing the work itself;
- spawning a different pane with the right profile/tools;
- asking the user;
- denying or deferring.

### Policy Guard

Active tools are not the whole enforcement boundary. The Freeflow extension must also guard `tool_call` events.

Global policy should block:

- secret paths such as `.env`, keys, certificates, credentials, and personal config;
- writes outside assigned write scope;
- `git push` except orchestrator after explicit user confirmation;
- unplanned commits;
- destructive shell commands;
- credential/environment dumping;
- publishing/deploy commands unless explicitly allowed.

Leaf agents with command tools should be constrained by task-packet `ALLOWED_COMMAND` entries or profile-specific read/check policy.

## Task Packet

A task packet is the child pane’s assignment. It is created by `delegate_spawn`, stored as compact text, and delivered automatically to the child Pi session.

Model-visible delegation packets and results use the same style as Output Router compact conversation output: a pipe-delimited row protocol, not CSV. Each line is one record:

```text
TAG|field|field
```

Literal `|` inside a field must be escaped as `¦`; newlines inside a field must collapse to spaces. Long/raw details belong in stored files, transcripts, screen logs, or output-router vault entries referenced by path or output ID.

A task packet contains:

- identity: task id, agent id, parent, role, profile, cwd/worktree;
- objective;
- in-scope and out-of-scope boundaries;
- source pointers: spec, plan, parent report, diff, evidence paths;
- authority boundaries;
- model-visible tool policy summary;
- allowed commands;
- write scope;
- selected input/evidence;
- stop conditions;
- expected return protocol;
- trace/result paths.

Example shape:

```text
FREEFLOW_TASK_PACKET
IDENTITY|agent=worker-run-store|role=worker|parent=execution-parent|profile=worker
CWD|/repo-worktrees/worker-run-store
OBJECTIVE|Implement the delegation run store and schemas for package P1.
SOURCE|spec|docs/specs/delegation/freeflow-pi-pane-delegation-harness-spec.md
SOURCE|plan|docs/plans/delegation/2026-07-01-freeflow-pi-pane-delegation-harness-implementation-plan.md
IN_SCOPE|run store, schema validation, tests for P1
OUT_OF_SCOPE|cmux adapter, Pi tool registration, non-Pi harness
TOOLS|read,edit,write,bash,freeflow_search,freeflow_run,freeflow_status
DENY|git_push,files_outside_write_scope,unplanned_commit
WRITE_SCOPE|/repo-worktrees/worker-run-store
ALLOWED_COMMAND|npm test -- delegation-store
ALLOWED_COMMAND|npm run typecheck
STOP|Spec/plan contradiction.
STOP|Need source-of-truth change.
STOP|Checks fail after bounded fix attempts.
RETURN|FFRESULT_REQUIRED
RETURN_FIELDS|summary,files_changed,checks_run,tests_status,uncertainty,recommendation
END_FREEFLOW_TASK_PACKET
```

The task packet is the child’s world. If context is not in the packet or recoverable through allowed tools, the child should not assume it.

## Result And Blocker Protocol

Leaf agents return compact role-native text that the extension parses into JSON.

Workers use `FFRESULT`. Reviewers and verifiers may use role-native findings/assessment or verification-evidence formats when that is clearer than worker-shaped `FFRESULT`; the parent/orchestrator consumes and adjudicates those reports into canonical state. Do not flatten every role into the same output shape just for parser convenience.

Generic worker/result terminal statuses:

- `completed`
- `completed_with_risks`
- `blocked`
- `failed`
- `cancelled`

Generic result:

```text
FFRESULT
STATUS|completed
SUMMARY|Mapped auth validation flow and identified relevant tests.
EVIDENCE|src/auth/validate.ts|18|Contains password validation rule.
FILES_READ|src/auth/validate.ts,tests/auth/validate.test.ts
TOOLS_USED|read,freeflow_search
UNCERTAINTY|Did not inspect UI error rendering.
RECOMMENDATION|Ask planning-parent whether UI validation is in scope.
END_FFRESULT
```

Blocked result:

```text
FFRESULT
STATUS|blocked
SUMMARY|Reviewer cannot verify whether finding reproduces because running tests is outside current authority.
BLOCKER|capability_gap|Need targeted test command run.|suggested_route=verifier
REQUEST|run_check|npm test -- delegation-store
RECOMMENDATION|Launch verifier with allowed command.
END_FFRESULT
```

Parsing rules:

- missing required result at process exit or timeout = failed;
- malformed result = failed or attention depending on state;
- unknown status = failed;
- `blocked` notifies parent;
- `capability_gap` reroutes, never grants a tool to the same running child;
- required evidence/check fields are validated by role/profile expectations.

## Status, Attention, Alerts, And User Steering

Child communication is structured alert/state, not open group chat.

Normal flow is alert-first, not poll-first:

1. Parent spawns a child and can end its turn.
2. Child works independently.
3. Child writes a sparse canonical state/result/report to the delegation store.
4. Child or the child extension emits an alert to the direct parent when a terminal or attention state is reached.
5. Parent wakes or notices the queued alert, then pulls details with `delegate_status`, `delegate_result`, or role-specific report tools.

Do not wake the parent model for every progress update, tool call, or check. Store/transcript logs may preserve low-level details, but parent-visible orchestration events should be sparse.

Parent-waking outcomes:

| Outcome | Terminal | Meaning | Set by | Parent wake |
| --- | --- | --- | --- | --- |
| `completed` | yes | Assigned work finished and supports the requested claim. | child/parser/harness | yes |
| `completed_with_risks` | yes | Assigned work finished, but named risks, gaps, or unverified areas remain. Store state may still be `completed`; preserve the risk status in result/report JSON. | child/parser/harness | yes |
| `blocked` | yes | Child is healthy but cannot proceed without parent/user decision, missing authority, or source-truth clarification. | child/parser/harness | yes |
| `failed` | yes | Child or harness attempted the task and hit an unrecoverable error, malformed required output, crash, or impossible command path. | parser/harness/child | yes |
| `cancelled` | yes | Parent/user/harness intentionally stopped obsolete or unsafe work before normal completion. It is not a child failure. | parent/harness | yes |
| `attention` | no | Child is paused or needs parent inspection/guidance, but may continue after steer/fix/cancel. | child/parser/harness | yes |
| `capability_gap` | no or terminal via `blocked` | Child lacks an allowed capability. It requests reroute; the same running child is not granted tools dynamically. Preserve this as blocker/request metadata and use `blocked` if the child cannot continue. | child/parser/harness | yes |

Internal/non-waking states:

| State | Meaning |
| --- | --- |
| `created` | State exists but no child work has started. |
| `starting` | Spawn/preflight/startup is in progress. |
| `running` | Child is working. Do not wake parent for routine progress. |
| `waiting_for_parent` | Child has already produced an attention/blocker/capability event and is paused until parent steer/cancel/reroute. Do not repeatedly wake for the same wait. |
| `closed` | Pane/session is closed; evidence remains. |

`delegate_wait` is explicit watch mode, not the default background strategy. It is useful for user-requested watching, short smoke checks, or a parent that intentionally wants to stay in the same turn. It must have a timeout, must not retry indefinitely, and must enforce a consecutive wait cap, e.g. three waits for the same scope before switching to alert-only mode.

Wait returns on:

- terminal state;
- attention/capability gap;
- timeout heartbeat;
- cancellation/close.

On timeout, the parent should not autonomously poll forever. It should report the timeout and either wait for an alert, ask the user to continue watching, or take a bounded diagnostic action.

The user may talk to orchestrator at any time and to the active parent during its phase. Parent/orchestrator classifies user input as:

- status-only;
- steer current work;
- follow-up after current work;
- cancel/replan affected children;
- add parallel context without invalidating running work.

Leaf children are normally not user-facing. Direct user intervention in a leaf should be logged and surfaced to the direct parent.

## Parent Reports

Parent reports are context compression artifacts. They are not raw transcripts.

### Planning Report

Planning-parent returns `PLANNING_REPORT` to orchestrator.

Required fields:

- status: `ready`, `ready_with_open_questions`, `blocked`;
- goal;
- artifact paths;
- review status;
- settled decisions;
- open questions;
- execution autonomy expectation: `high`, `medium`, `low`;
- expected user checkpoints;
- execution guidance;
- risks;
- evidence pointers.

`ready_with_open_questions` is allowed. It means execution can start, but named questions may become stop conditions.

### Execution Kickoff

Orchestrator sends `EXECUTION_KICKOFF` to execution-parent.

Required fields:

- task goal;
- source of truth: spec, plan, planning report;
- approved scope and out-of-scope boundaries;
- repo state;
- autonomy expectation;
- user checkpoints;
- commit policy;
- execution rules;
- stop conditions;
- expected execution report path.

The execution kickoff is not the plan. It is the runtime authorization and routing packet.

### Execution Report

Execution-parent returns `EXECUTION_REPORT` to orchestrator.

Required fields:

- status: `completed`, `completed_with_risks`, `blocked`, `failed`;
- summary;
- source references;
- work packages;
- commits;
- reviews;
- checks;
- files changed;
- plan deviations;
- stop conditions hit;
- open questions;
- risks;
- final recommendation;
- evidence pointers.

The orchestrator uses this report to decide final review, verification, commit, push, handoff, or backward routing.

## Delegation Store

Repo-local delegation state lives under:

```text
.freeflow/delegation/
```

This directory must be gitignored. It is local runtime state, not shared source truth.

Recommended shape:

```text
.freeflow/delegation/
├── index.json
└── tasks/
    └── <task-id>/
        ├── task.json
        ├── registry.json
        ├── events.jsonl
        ├── decisions.md
        ├── model/
        │   ├── planning-report.txt
        │   ├── execution-kickoff.txt
        │   └── execution-report.txt
        ├── planning-report.json
        ├── execution-kickoff.json
        ├── execution-report.json
        └── agents/
            └── <agent-id>/
                ├── manifest.json
                ├── status.json
                ├── events.jsonl
                ├── model/
                │   ├── task-packet.txt
                │   └── result.raw.txt
                ├── result.json
                ├── transcript.log
                ├── screen.log
                └── notes.md
```

Conventions:

- JSON/JSONL for machine state.
- Compact text under `model/` for model-visible input/output.
- Markdown for human notes and promoted decisions.
- Logs for debugging and audit.

If something must guide future shared work, promote it to tracked docs:

- `docs/specs/`
- `docs/plans/`
- `docs/reviews/`
- `docs/handoffs/`
- `docs/adr/`

## Delegation Tool Surface

The extension registers Pi tools for orchestrator and allowed parent profiles.

Tools:

- `delegate_task_init`
- `delegate_spawn`
- `delegate_status`
- `delegate_wait`
- `delegate_result`
- `delegate_send`
- `delegate_capture`
- `delegate_cancel`
- `delegate_close`
- `delegate_record_report`

Leaf agents do not receive delegation tools.

### Availability And Preflight

Delegation is an optional Pi capability, not a baseline Freeflow requirement. Pi users without cmux must keep normal Freeflow behavior; delegation tools should report unavailable or degraded state instead of attempting pane work.

Before `delegate_spawn` creates a pane or launches child Pi, the harness must run a fail-closed preflight:

- `cmux` binary is available;
- required cmux commands for pane create, send or packet delivery fallback, screen capture, and close are available;
- the current terminal/session can address a usable cmux workspace/surface;
- the child Pi startup command is available;
- `.freeflow/delegation/` is writable;
- the requested role/profile/tool policy is valid.

If preflight fails, `delegate_spawn` must not call `cmux new-pane`, must not start child Pi, and must not fall back to hidden/headless `pi -p` execution. It returns a typed unavailable/blocker result, for example:

```text
DELEGATION_UNAVAILABLE|cmux_not_ready|cmux binary missing or no active cmux workspace|route=inline_or_start_cmux
```

Valid routes after unavailable state:

- continue inline in the current Pi session;
- ask the user to install/start cmux and retry;
- disable delegation for the task;
- use a different visible cmux workspace if the user chooses one.

`delegate_status` should expose preflight status so agents can inspect availability before recommending pane delegation. If Pi cannot hide unavailable delegation tools dynamically, every mutating delegation tool must still guard itself and return the safe unavailable result before side effects.

### Spawn Behavior

`delegate_spawn` must:

1. validate task, parent, role/profile, cwd, write scope, and allowed command shape;
2. run delegation preflight and fail closed before pane or child-process side effects;
3. create agent state directory;
4. compile `model/task-packet.txt`;
5. create cmux pane;
6. start Pi with delegation env vars and no session by default;
7. rely on the child Freeflow extension to load and deliver the task packet;
8. record pane/surface refs;
9. mark state running once startup succeeds.

Representative env vars:

```text
FREEFLOW_DELEGATION_STORE
FREEFLOW_DELEGATION_TASK_ID
FREEFLOW_DELEGATION_AGENT_ID
FREEFLOW_PARENT_AGENT_ID
FREEFLOW_AGENT_ROLE
FREEFLOW_CONTEXT_PROFILE
```

## Task Packet Delivery

Decision:

```text
Child startup must be automatic and packet-driven.
```

Preferred mechanism:

- `delegate_spawn` writes `model/task-packet.txt`;
- child Pi starts with delegation env vars;
- child Freeflow extension detects delegated mode;
- extension reads packet and injects it as the initial assignment.

Open implementation question:

```text
Verify whether Pi extension can safely call sendUserMessage during session_start.
Fallbacks: delayed send or cmux send after startup. Any `pi -p` use must still run as a visible cmux-pane child, or be removed.
```

This is an implementation detail, not a design blocker.

## Output Router Bridge

Delegation store and Output Router have separate jobs:

- Delegation store: agent lifecycle, task packets, transcripts, parsed results.
- Output Router/vault: command/test/search/build output recovery and compact evidence routing.

Child results should cite routed output IDs and evidence paths:

```text
CHECK|npm test auth|pass|outputId=ffout_abc123
EVIDENCE|ffout_abc123|lines 42-55|Auth tests passed.
```

Parents should consume compact results and evidence pointers, not raw transcripts or raw command output. If exact detail is needed, the parent retrieves it through delegation tools or output-router recovery.

## Pi TUI Rendering Contract

Delegation tools must render like Output Router tools: compact by default, detailed when expanded, and never noisy by surprise.

### Collapsed View

Collapsed tool calls/results should fit in one short line and answer: what tool, which task/role, current state, and the most useful handle.

Examples:

```text
delegate_spawn worker TASK-123 • preflight
delegate_spawn worker TASK-123 • pane p7 • running
delegate_status TASK-123 • 3 active / 1 blocked
delegate_result TASK-123 • complete • 2 files changed • checks passed
delegate_capture TASK-123 • screen snapshot saved
delegate_close TASK-123 • closed • evidence kept
delegate_spawn • unavailable: cmux_not_ready
```

Collapsed output must not include raw child transcripts, raw screen dumps, large task packets, or raw command output.

### Expanded View

Expanded rendering should expose enough operational detail for trust and debugging without flooding context:

```text
Delegation
status: running
task: TASK-123
role/profile: worker / write-scoped
pane: cmux surface/pane ref
scope: src/auth-middleware.ts, tests/auth-middleware.test.md
allowed tools: read, edit, freeflow_run
blocked tools: bash network
state: created -> starting -> running
evidence:
  task packet: .freeflow/delegation/tasks/TASK-123/model/task-packet.txt
  result: .freeflow/delegation/tasks/TASK-123/result.json
  transcript: .freeflow/delegation/tasks/TASK-123/transcript.log
  screen: .freeflow/delegation/tasks/TASK-123/screen.log
latest: RESULT pending
```

Expanded result rendering should show parsed result fields, files changed/read, checks, blockers, output-router IDs, and evidence pointers. It may show bounded excerpts only when the tool explicitly captured a screen/result excerpt; otherwise it points to recoverable evidence.

Unavailable rendering must be explicit:

```text
Delegation unavailable
reason: cmux_not_ready
action taken: no pane opened, no child Pi started
route: continue inline, install/start cmux, or disable delegation
```

A future `delegate_dashboard` overlay may show the task tree interactively, but the first implementation must provide reliable `renderCall`/`renderResult` behavior for every delegation tool before relying on an overlay.

## Planning Flow

Normal flow:

1. User and orchestrator define goal and rough scope.
2. Orchestrator launches planning-parent.
3. User works deeply with planning-parent.
4. Planning-parent does basic scouting inline.
5. Planning-parent launches researcher for deep/broad/specialized evidence.
6. Planning-parent writes spec and plan.
7. Reviewer reviews artifacts.
8. Planning-parent iterates or blocks.
9. Planning-parent returns `PLANNING_REPORT` to orchestrator.
10. Orchestrator asks user whether to proceed to execution when appropriate.

Planning should aim to make execution as autonomous as reasonably possible, but autonomy is desired, not required. If execution is expected to need decisions or checkpoints, the plan/report should name them instead of hiding them.

## Execution Flow

Normal flow:

1. Orchestrator sends `EXECUTION_KICKOFF` to execution-parent.
2. Execution-parent creates live execution map from the approved plan.
3. Execution-parent assigns work packages.
4. Workers implement packages.
5. Verifiers run checks.
6. Reviewers review packages/diffs.
7. Execution-parent adjudicates findings.
8. Workers or integrator fix accepted findings.
9. Integrator merges parallel outputs one at a time.
10. Execution-parent performs planned commit checkpoints.
11. Execution-parent returns `EXECUTION_REPORT`.

Execution should be autonomous when the plan is sufficient. It must route backward when evidence invalidates the plan or a user-owned decision appears.

Stop/escalate for:

- product behavior ambiguity;
- scope change;
- public API or compatibility issue;
- security/privacy/billing/data-loss issue;
- source-truth conflict;
- spec/plan contradiction;
- repeated review/verification failure;
- unexpected sensitive/generated/user-owned files;
- integration conflict that changes design/behavior;
- needing to rewrite source truth rather than implement it.

## Worktrees And Integration

Core rule:

```text
One writer per checkout.
```

Use worktrees when multiple workers write in parallel or when isolation is needed.

Parallel implementation may happen in separate worktrees. Integration is sequential by default:

```text
merge/apply package A -> verify -> merge/apply package B -> verify
```

Worker output must include:

- worktree path;
- branch when applicable;
- files changed;
- checks run;
- diff summary;
- uncertainty.

Integrator output must include:

- merged packages;
- merge order;
- conflicts resolved;
- integration changes;
- checks/output IDs;
- remaining risks.

Cleanup should preserve evidence by default. Remove worktrees only after successful merge/checkpoint and record cleanup events.

## Commit Checkpoints And Closeout

Execution-parent owns planned intermediate commit checkpoints. Orchestrator owns final closeout.

Intermediate commit checkpoints are allowed when:

- checkpoint exists in approved plan/execution map;
- package is complete;
- review checkpoint passed or was explicitly skipped by plan;
- verification checkpoint passed;
- diff matches intended scope;
- no sensitive/user-owned/generated surprise files are included;
- commit message is scoped to package.

No user prompt is needed for planned intermediate commits when evidence matches the approved plan. User prompt is needed for unplanned commits, scope changes, unexpected files, source-truth conflicts, user-owned decisions, and push.

Staging policy:

- inspect git status and diff/stat;
- stage explicit intended files;
- never rely on `git add .` for checkpoint commits.

Final closeout is orchestrator-owned:

- read execution report;
- run or spawn final review if needed;
- run or spawn final verification;
- commit remaining approved changes if needed;
- ask before push/PR unless explicitly preauthorized;
- write handoff only when useful;
- close/park panes after reports are consumed;
- report verified and unverified evidence.

## Success Criteria

Mechanical smoke checks:

- preflight reports unavailable without pane/child side effects when cmux is missing or unusable;
- spawn opens cmux pane and starts Pi with correct env vars when preflight passes;
- task packet is delivered automatically;
- valid result parses to JSON;
- invalid/missing result becomes failed state under defined conditions;
- profile tool activation works;
- policy guards block forbidden writes/commands;
- terminal/attention child events wake or queue alerts for the direct parent without requiring user mediation;
- progress/tool/check noise does not wake the parent model by default;
- bounded waits return heartbeat, enforce retry caps, and preserve parent responsiveness;
- cancel/close preserves evidence and updates state;
- collapsed and expanded TUI renderers show compact state, details, and evidence pointers without dumping raw transcripts/screens.

Workflow checks:

- tiny clear work stays inline and does not require delegation, spec, or plan artifacts;
- orchestrator launches planning-parent;
- planning-parent launches researcher and consumes compact evidence;
- planning-parent writes planning report without dumping raw transcript;
- orchestrator launches execution-parent from kickoff;
- execution-parent spawns worker/reviewer/verifier/integrator as needed;
- capability gap reroutes to another pane rather than granting tools;
- execution report compresses implementation evidence;
- orchestrator can complete closeout from report and evidence pointers.

Context locality checks:

- raw child transcripts are not injected into parent by default;
- child results include compact summaries and recoverable evidence pointers;
- orchestrator context remains smaller than a comparable one-session flow;
- promoted artifacts carry decisions forward instead of raw chat history.

## Open Questions

- Which Pi lifecycle hook should deliver the task packet most reliably?
- What is the exact profile-context injection hook and payload shape?
- What matcher syntax should policy guards use for allowed commands, denied commands, and write scopes?
- How frequently should transcripts/screens be captured for long-running panes?
- What exact parent alert mechanism should be used for model wake-up, unread queue surfacing, coalescing, and rate limits?
- How should degraded profiles be reported when optional tools like web search are unavailable?
- Should parent panes ever use saved Pi sessions, or should harness state remain the only default persistence outside orchestrator?

## Decisions Made

- Use cmux only.
- Delegation spawn fails closed when cmux preflight fails; normal Freeflow remains available.
- No hidden/headless fallback when visible cmux-pane behavior is unavailable.
- Use Pi only for spawned panes.
- Build as a Freeflow/Pi extension.
- Use Pi tools, not CLI, as the main control surface.
- Save orchestrator session; use no-session for delegated panes by default.
- Keep skills available; enforce tools and policy instead.
- No dynamic tool grants.
- Use one reviewer role for artifacts and work.
- No separate artifact-writer role; planning-parent writes artifacts.
- No separate scout role; planning-parent handles basic scouting and launches researcher for deep/broad/specialized evidence.
- Execution-parent owns planned intermediate commit checkpoints.
- Orchestrator owns final closeout and push decisions.
- Use alert-first child completion/attention handling, not polling-first supervision.
- Parent-visible child events are sparse terminal/attention/capability states, not every progress or tool event.
- `delegate_wait` is explicit watch mode with timeout and retry caps, not an autonomous polling loop.
- Store local runtime state under gitignored `.freeflow/delegation/`.
- Keep model-visible protocols compact text and internal state JSON/JSONL.
- Render delegation tools compactly by default; expanded TUI shows details and evidence pointers, not raw transcript dumps.
- Use pipe-delimited compact row protocols like Output Router (`TAG|field|field`, escaping literal `|` as `¦`), not CSV.
