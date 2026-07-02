> **Doc ID:** PLAN-2026-07-01-freeflow-pi-pane-delegation-harness
> **Date:** 2026-07-01
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft
> **Source:** `docs/specs/freeflow-pi-pane-delegation-harness-spec.md`

# Freeflow Pi Pane Delegation Harness Implementation Plan

## Goal

Implement the Freeflow Pi pane delegation harness described in `docs/specs/freeflow-pi-pane-delegation-harness-spec.md` as a Pi extension feature.

The implementation should let an orchestrator or parent Pi agent create visible cmux panes running delegated Pi agents, pass them compact task packets, enforce role/tool policy, parse compact result/report blocks into deterministic state, and monitor or close those panes without loading raw transcripts into parent context.

Delegation must fail closed when cmux is missing or unusable, leaving normal Freeflow/Pi behavior available. Delegation tools must also have compact Pi TUI rendering: one-line collapsed state, expanded operational details, unavailable/preflight failure details, and evidence pointers instead of raw transcript or screen dumps.

Do not route tiny clear work through delegation. If one agent can safely inspect, edit, verify, and commit/close out, keep the workflow inline. The harness is for context boundaries, not every bug/refactor.

## Source Authority

Primary source:

- `docs/specs/freeflow-pi-pane-delegation-harness-spec.md`

Supporting context:

- `docs/designs/local-delegation-harness-design.md`
- `docs/codex-cli-agent-harness/README.md`
- `docs/codex-cli-agent-harness/2026-06-12-pass-4-subagents-and-delegation.md`
- `docs/codex-cli-agent-harness/2026-06-12-pass-6-memory-and-context.md`
- `docs/codex-cli-agent-harness/2026-06-12-pass-7-config-and-extensibility.md`
- `docs/codex-cli-agent-harness/2026-06-13-pass-8-agent-harness-comparisons.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `skills/workflow/SKILL.md`
- `skills/discover/SKILL.md`
- `skills/output-router/SKILL.md`
- `pi-extension/src/index.ts`
- Pi extension/session/tool docs under `/Users/mohammedhassanmohiddin/.hermes/node/lib/node_modules/@earendil-works/pi-coding-agent/docs/`

## Non-Goals

Do not:

- add tmux support;
- build a custom non-Pi harness;
- integrate pi-subagents;
- add a CLI-first user surface;
- require delegation, spec, or plan artifacts for tiny clear tasks;
- add dynamic tool grants;
- let leaf agents spawn children;
- hard-gate Freeflow skills per role;
- make `.freeflow/delegation/` tracked shared source truth;
- add automatic push behavior;
- use hidden/headless child execution when visible cmux pane behavior is unavailable;
- dump raw child transcripts/screens as normal delegation tool output;
- recast scope into staged shipping or roadmap framing.

## Likely Files And Modules

Existing files likely touched:

- `.gitignore`
- `package.json` for build/test scripts and package file inclusion
- `pi-extension/src/index.ts`
- `pi-extension/src/runtime-context.ts`
- `pi-extension/src/router-tools.ts` only if shared tool-registration patterns are reused
- `pi-extension/src/renderers.ts` if shared renderer utilities are reused
- `pi-extension/dist/**` after build
- `delegation/dist/**` after build
- `router/tests/pi/*.test.js` for Pi adapter tests, unless a better test location is added

Likely new files:

- `delegation/tsconfig.json`
- `delegation/src/types.ts`
- `delegation/src/paths.ts`
- `delegation/src/store.ts`
- `delegation/src/protocol.ts`
- `delegation/src/packet.ts`
- `delegation/src/profiles.ts`
- `delegation/src/policy.ts`
- `delegation/src/cmux.ts`
- `delegation/src/index.ts`
- `delegation/tests/*.test.js`
- `pi-extension/src/delegation/runtime.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/src/delegation/renderers.ts`
- `pi-extension/src/delegation/index.ts`
- `router/tests/pi/delegation-*.test.js` or `pi-extension/tests/delegation-*.test.js` for Pi adapter behavior if a new test location is added

Find existing Pi extension and router build/test patterns before creating final module names.

## Harness Module Architecture

Build the harness as a portable delegation core plus a Pi extension adapter:

```text
delegation/
├── tsconfig.json
├── src/
│   ├── types.ts
│   ├── paths.ts
│   ├── store.ts
│   ├── protocol.ts
│   ├── packet.ts
│   ├── profiles.ts
│   ├── policy.ts
│   ├── cmux.ts
│   └── index.ts
└── tests/
    └── *.test.js

pi-extension/src/delegation/
├── runtime.ts
├── tools.ts
├── renderers.ts
└── index.ts
```

### Module Responsibilities

Delegation core:

- `types.ts`: shared role/profile names, states, event/result/report types, and tool input/output types.
- `paths.ts`: derive `.freeflow/delegation` paths safely from repo/task/agent ids.
- `store.ts`: own filesystem state for tasks, agents, manifests, status, events, raw model text, parsed results, and reports.
- `protocol.ts`: parse and format compact model-visible pipe-delimited row blocks such as `FFRESULT`, `FFSTATUS`, `FFATTENTION`, `PLANNING_REPORT`, `EXECUTION_KICKOFF`, and `EXECUTION_REPORT`; escape literal `|` as `¦` and collapse field newlines to spaces, matching Output Router compact conversation output.
- `packet.ts`: compile task packets from spawn inputs, profile policy, source pointers, allowed commands, write scope, and expected output contract.
- `profiles.ts`: define role/profile registry, active tool lists, compact context emphasis, and default policy shape.
- `policy.ts`: evaluate tool calls against active profile, task policy, write scope, allowed commands, denied paths, Git rules, and command guards.
- `cmux.ts`: wrap cmux commands for preflight, pane creation, send, screen capture, close, and ref parsing with an injectable command runner for tests.
- `index.ts`: export the delegation core API consumed by Pi extension adapters and tests.

Pi extension adapter:

- `runtime.ts`: connect the delegation core to Pi lifecycle hooks: delegated env detection, context injection, active tools, task-packet delivery, tool-call blocking, and assistant-output parsing.
- `tools.ts`: register Pi delegation tools and keep tool handlers thin.
- `renderers.ts`: render collapsed and expanded TUI for delegation calls/results, including unavailable/preflight failures and recoverable evidence pointers.
- `index.ts`: expose `registerDelegation(pi)` for `pi-extension/src/index.ts`.

### Dependency Direction

Keep the core independent from Pi. Keep cmux isolated behind the core adapter boundary.

Allowed import direction:

```text
delegation/src/types.ts and delegation/src/paths.ts
  <- delegation/src/store.ts
  <- delegation/src/protocol.ts
  <- delegation/src/packet.ts
  <- delegation/src/profiles.ts
  <- delegation/src/policy.ts
  <- delegation/src/cmux.ts
  <- delegation/src/index.ts

pi-extension/src/delegation/runtime.ts
  -> delegation core
  -> Pi lifecycle APIs

pi-extension/src/delegation/tools.ts
  -> delegation core
  -> Pi tool registration APIs
```

Rules:

- Delegation core must not import Pi extension modules.
- `store.ts` must not know about cmux or Pi.
- `protocol.ts` must not read/write files.
- `packet.ts` must not spawn panes or mutate state.
- `policy.ts` should be mostly pure and heavily tested.
- `cmux.ts` must only know command execution and cmux ref parsing, not Pi lifecycle or model protocols.
- Pi `runtime.ts` and `tools.ts` are adapters around the delegation core.
- cmux quirks stay in `delegation/src/cmux.ts`; Pi lifecycle quirks stay in `pi-extension/src/delegation/runtime.ts`.

This keeps task storage, compact protocols, role policy, pane control, and Pi lifecycle integration replaceable without changing every caller.

### Test Shape

- Protocol tests: raw model text -> parsed result/report/status, including pipe delimiter escaping and newline collapse.
- Store tests: temp directory writes/reads, event append, status/result persistence.
- Path tests: reject unsafe task/agent ids such as `../`, absolute paths, path separators, and empty ids.
- Packet tests: spawn request -> compact task packet.
- Profile tests: role/profile -> active tools and context emphasis.
- Policy tests: allow/block representative tool calls.
- cmux tests: fake command runner, preflight outcomes, command construction, ref parsing.
- Runtime tests: mocked Pi hooks for delegated context, active tools, result parsing, and policy blocking.
- Tool tests: tool input -> store/cmux state changes and compact tool output.
- Renderer tests: collapsed and expanded render output for spawn/status/result/capture/close/unavailable cases without raw transcript or screen dumps.

## Execution Map

| Package | Goal | Depends On | Can Parallelize? | Likely Write Set | Checks | Review Checkpoint | Commit Checkpoint | Stop Conditions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Verify Pi lifecycle hooks, cmux availability/preflight, and command assumptions | None | No | docs/notes optional, tests/spike fixtures if kept | focused local spike; `npm run build:pi-extension` | After spike findings | No | Pi cannot inject task packet or set active tools as expected; cmux unavailable cannot be detected before spawn side effects |
| P1 | Add delegation store, schemas, compact protocol parser, and gitignore entry | P0 | No | `.gitignore`, `delegation/src/{types,paths,store,protocol}.ts`, `delegation/tests`, build config | `npm run build`, focused node tests | After P1 | Yes | Store shape conflicts with spec or parser cannot preserve raw text |
| P2 | Add delegated runtime detection, context profile emphasis, active tool profiles, and tool policy guards | P1 | Yes with P3 after interfaces stabilize | `delegation/src/{profiles,policy}.ts`, `pi-extension/src/delegation/runtime.ts`, `pi-extension/src/index.ts`, tests | `npm run build`, focused Pi extension tests | After P2/P3 integration | No | Pi lifecycle cannot support profile injection or policy blocking |
| P3 | Add delegation tool surface, cmux adapter, preflight guards, and TUI renderers | P1 | Yes with P2 after interfaces stabilize | `delegation/src/{packet,cmux}.ts`, `pi-extension/src/delegation/{tools,renderers,index}.ts`, `pi-extension/src/index.ts`, tests | `npm run build`, focused tool/renderer tests with fake cmux runner | After P2/P3 integration | No | cmux refs cannot be captured reliably; spawn would require headless flow; unavailable state renders ambiguously |
| P4 | Add wait/monitor/result/status/report lifecycle | P2, P3 | No | delegation core plus Pi runtime/tools tests | `npm run build`, focused lifecycle tests | After P4 | Yes | Parent wait cannot stay bounded/responsive or parsing is ambiguous |
| P5 | Add execution support helpers: worktree metadata, commit checkpoint policy, parent report handling | P4 | No | delegation core policy/store/report tests | `npm run build`, focused policy/report tests | After P5 | Yes if verified | Commit policy cannot distinguish planned checkpoint from final closeout |
| P6 | Smoke tests, docs updates, and final integration verification | P5 | No | tests, plugin docs/release evidence only if useful | `npm run build`, focused tests, renderer snapshots, `npm run test:router` if feasible, `git diff --check` | Final review | Orchestrator-owned final commit | Live cmux smoke fails, preflight misses unavailable cmux, TUI leaks raw transcript/screen, or tool policy allows forbidden mutation |

## Slice Details

### Package P0: Lifecycle And cmux Spike

Purpose: front-load implementation questions before broad coding, including safe unavailable behavior for users without cmux.

Tasks:

- Verify whether child task packet delivery can use `pi.sendUserMessage` during `session_start`.
- If direct `session_start` delivery is unsafe, test delayed delivery or `before_agent_start`-based injection.
- Verify `pi.setActiveTools()` can be applied for delegated profiles at startup without disrupting normal sessions.
- Verify `tool_call` blocking can enforce profile policy for built-in tools and extension tools.
- Verify cmux availability/preflight checks needed before any pane or child-process side effect:
  - `cmux` binary detection;
  - active/usable cmux workspace or surface detection;
  - required command availability for pane create, send or packet-delivery fallback, read-screen, and close;
  - child Pi startup command availability;
  - `.freeflow/delegation/` writability.
- Verify cmux commands needed by `delegate_spawn`, `delegate_capture`, and `delegate_close`:
  - `cmux new-pane`
  - `cmux send` only if fallback needed
  - `cmux read-screen`
  - `cmux close-surface`
- Resolve or explicitly carry forward the spec open questions for:
  - task-packet delivery hook;
  - profile-context injection hook;
  - policy matcher syntax;
  - transcript/screen capture frequency;
  - degraded optional-tool reporting;
  - parent saved-session exceptions.
- Record implementation conclusions in the plan execution notes or a short local task note if needed.

Checks:

- `npm run build:pi-extension`
- focused unavailable-path check with cmux absent or intentionally unreachable;
- focused ad hoc smoke in current cmux workspace when safe.

Stop if:

- Pi cannot auto-deliver a packet through extension APIs and every fallback would require headless or non-pane execution.
- cmux availability cannot be detected before attempting pane/child side effects.

### Package P1: Store, Types, And Protocol Parser

Purpose: make the deterministic state layer before spawning real panes.

Tasks:

- Add `.freeflow/delegation/` to `.gitignore`.
- Add top-level `delegation/` TypeScript build/test wiring and include built artifacts in package files when needed.
- Implement safe path/id helpers that reject traversal, absolute paths, separators, and empty task/agent ids.
- Implement task/agent store helpers for:
  - index metadata;
  - task metadata;
  - registry;
  - task and agent events;
  - manifests;
  - status;
  - model text paths;
  - parsed result/report JSON.
- Implement compact protocol parsing for pipe-delimited row records, not CSV:
  - `TAG|field|field` line shape;
  - literal `|` escaped as `¦`;
  - field newlines collapsed to spaces;
  - raw long details referenced by path/output ID instead of embedded;
- Implement compact protocol parsing for:
  - `FFRESULT ... END_FFRESULT`;
  - blocked/capability request fields;
  - `PLANNING_REPORT`;
  - `EXECUTION_KICKOFF`;
  - `EXECUTION_REPORT`;
  - optional `FFSTATUS` / `FFATTENTION` lines.
- Preserve raw model text under `model/*.txt` before parsing.
- Make malformed required blocks deterministic failures or attention events according to context.

Checks:

- `npm run build`
- node tests for safe path/id rejection, store path creation, event append, raw text preservation, valid parse, invalid parse, delimiter escaping, and newline collapse.

Review checkpoint:

- Review store shape against the spec before integrating spawn logic.

Commit checkpoint:

- Commit after P1 passes build/tests and review.

### Package P2: Delegated Runtime Profiles And Policy Guards

Purpose: let a delegated Pi session know its role/profile and enforce capability boundaries.

Tasks:

- Detect delegation env vars:
  - `FREEFLOW_DELEGATION_STORE`
  - `FREEFLOW_DELEGATION_TASK_ID`
  - `FREEFLOW_DELEGATION_AGENT_ID`
  - `FREEFLOW_PARENT_AGENT_ID`
  - `FREEFLOW_AGENT_ROLE`
  - `FREEFLOW_CONTEXT_PROFILE`
- Preserve normal orchestrator session behavior when env vars are absent.
- Add compact delegated-pane context emphasis for roles:
  - orchestrator
  - planning-parent
  - execution-parent
  - researcher
  - worker
  - reviewer
  - verifier
  - integrator
- Keep skills available; do not hard-gate skill discovery.
- Set active tools by profile.
- Add policy guards for:
  - denied secret paths;
  - write scope;
  - denied push;
  - commit policy;
  - allowed commands for verifier/reviewer/researcher;
  - destructive shell patterns;
  - product-code writes from planning-parent unless explicitly scoped.
- Parse assistant output on `message_end` through the delegation core protocol parser and write status/result/report events through the core store.

Checks:

- `npm run build`
- focused tests for normal session context unchanged;
- delegated session context contains compact delegated profile guidance;
- active tools differ by profile;
- `tool_call` guard blocks representative forbidden calls.

Review checkpoint:

- Review after P2 and P3 are integrated because runtime profiles and spawn tools share contracts.

### Package P3: Delegation Tools And cmux Adapter

Purpose: expose the orchestrator/parent control surface as Pi tools.

Tasks:

- Implement cmux adapter in the delegation core with injectable command runner for tests.
- Implement `ensureDelegationReady()` / preflight helper that returns typed unavailable reasons without pane or child-process side effects.
- Register Pi adapter tools for allowed profiles:
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
- Ensure leaf profiles do not receive delegation tools.
- Implement `delegate_spawn` to:
  - validate role/profile/cwd/write scope;
  - run preflight before pane or child-process side effects;
  - return `DELEGATION_UNAVAILABLE` with reason and route when preflight fails;
  - create run state;
  - compile task packet;
  - open cmux pane;
  - start Pi with env vars and `--no-session` by default;
  - store pane/surface refs;
  - mark state running after startup succeeds.
- Define `delegate_status` output shape for task, tree, single-agent status, and preflight availability.
- Define `delegate_send` behavior for steer, follow-up, and note delivery, including event logging and parent visibility.
- Implement Pi TUI `renderCall`/`renderResult` behavior for delegation tools:
  - collapsed one-line status for spawn/status/wait/result/send/capture/cancel/close/report;
  - expanded details with task id, role/profile, state transitions, pane refs, scope, tool policy, result fields, and evidence paths/output IDs;
  - unavailable/preflight-failed view with reason, action taken, and safe routes;
  - no raw transcript or screen dump in normal output.
- Keep `pi -p` fallback visible-pane-only if it is used at all.

Checks:

- `npm run build`
- tool registration tests;
- fake cmux tests for preflight, command construction, and ref parsing;
- spawn store tests without launching real cmux;
- unavailable-path tests proving `delegate_spawn` does not call `cmux new-pane` or child Pi when preflight fails;
- status output tests for task tree, single-agent, and preflight views;
- renderer snapshot/string tests for collapsed and expanded outputs without raw transcript/screen dumps;
- send behavior tests for event logging and target validation.

Review checkpoint:

- Review after P2 and P3 integration.

Commit checkpoint:

- Commit after P2/P3 integration passes focused tests.

### Package P4: Wait, Monitor, Reports, Cancel, And Close

Purpose: make parent monitoring deterministic and responsive.

Tasks:

- Implement state transitions:
  - created;
  - starting;
  - running;
  - waiting_for_parent;
  - attention;
  - blocked;
  - completed;
  - failed;
  - cancelled;
  - closed.
- Implement `delegate_wait` modes:
  - terminal;
  - attention_or_terminal;
  - all_terminal;
  - first_terminal.
- Treat timeout as heartbeat, not failure.
- Implement `delegate_result` with compact summary and evidence pointers.
- Ensure parent-facing results can cite output-router `outputId`s without injecting raw child transcripts by default.
- Implement `delegate_capture` using cmux read-screen and store `screen.log` snapshots; return compact snapshot metadata and optional bounded excerpt, not full screen dumps by default.
- Implement `delegate_cancel` and `delegate_close` without deleting run evidence.
- Implement `delegate_record_report` for planning/execution reports and kickoffs.

Checks:

- `npm run build`
- lifecycle tests for wait modes, timeout heartbeat, cancel, close, report parse/store;
- result retrieval tests proving compact output/evidence pointers are returned without raw transcript injection by default.

Review checkpoint:

- Review state machine and wait semantics before execution helpers.

Commit checkpoint:

- Commit after P4 passes build/tests/review.

### Package P5: Execution Helpers, Worktrees, And Commit Checkpoints

Purpose: support execution-parent behavior without turning the harness into a Git automation black box.

Tasks:

- Represent work package metadata in task state:
  - package id;
  - role assignment;
  - dependencies;
  - expected write scope;
  - checkout/worktree path;
  - allowed commands;
  - review/check/commit checkpoint state.
- Add helper logic for worktree metadata and branch naming, but keep actual Git operations policy-guarded.
- Enforce one-writer-per-checkout metadata and sequential integration order for parallel packages.
- Implement commit checkpoint validation helpers:
  - checkpoint is planned;
  - review/verification status is present;
  - intended file list is explicit;
  - no sensitive/generated/user-owned surprise files;
  - no `git add .` staging path.
- Ensure final push remains orchestrator/user-owned.
- Ensure worker commits remain blocked by default.

Checks:

- `npm run build`
- policy tests for planned/unplanned commits, push denial, write scope, worktree metadata;
- tests for one-writer-per-checkout metadata and integration merge/apply order.

Review checkpoint:

- Review commit policy carefully before any real commit automation is used.

Commit checkpoint:

- Commit after P5 if fully verified.

### Package P6: Smoke Tests, Documentation, And Final Verification

Purpose: prove the feature works mechanically and does not regress existing Freeflow runtime behavior.

Tasks:

- Add focused smoke tests for:
  - tiny clear task route stays inline without delegation artifacts/tools;
  - task init;
  - unavailable preflight path without pane/child side effects;
  - spawn state creation;
  - task packet compile;
  - result parse;
  - policy guards;
  - wait timeout heartbeat;
  - cancel/close state;
  - profile tool registration;
  - output-router evidence pointer in a child result;
  - delegation TUI collapsed and expanded render output for success, blocked, result, capture, close, and unavailable cases.
- Add a live cmux smoke checklist if full automated cmux testing is not reliable in CI.
- Add a workflow smoke checklist covering:
  - orchestrator -> planning-parent -> researcher -> planning report;
  - orchestrator -> execution-parent -> worker/reviewer/verifier/integrator -> execution report;
  - reviewer capability-gap reroute to verifier;
  - compact parent report consumption without raw transcript injection.
- Update relevant plugin docs only if the feature is ready to document; otherwise keep implementation evidence internal.
- Update release evidence only after smoke/review passes.
- Run final review and verification.

Checks:

- `npm run build`
- focused node tests
- `npm run test:router` when feasible
- `git diff --check`
- unavailable-path smoke:
  - simulate missing/unusable cmux;
  - confirm `delegate_spawn` reports unavailable;
  - confirm no pane opens and no child Pi starts;
  - confirm collapsed/expanded TUI explains the safe routes.
- live cmux smoke:
  - spawn a small child Pi pane;
  - auto-deliver task packet;
  - parse result;
  - include a routed output evidence pointer when a check is run;
  - close pane preserving evidence.

Final review:

- Review spec adherence, context locality, tool enforcement, and no unwanted tmux/custom-harness/dynamic-grant drift.

## Stop Conditions

Stop and route back before continuing if:

- Pi lifecycle cannot support automatic packet delivery without non-pane/headless behavior;
- profile-specific context injection would bloat normal orchestrator sessions;
- tool policy cannot block writes/commands reliably;
- cmux availability cannot be detected before spawn side effects;
- cmux spawn/capture/close cannot be made reliable enough for visible panes;
- delegation TUI rendering cannot avoid raw transcript/screen dumps while still exposing evidence pointers;
- result parsing cannot preserve raw output and canonical JSON state;
- implementation requires dynamic tool grants;
- implementation requires tmux or a custom non-Pi harness;
- source docs/tests/specs conflict with the intended behavior;
- a change would affect public API, security, privacy, billing, data loss, or compatibility beyond the approved spec;
- planned commit checkpoint includes unexpected generated, sensitive, or user-owned files.

## Review Checkpoints

- Review after P1 store/protocol foundation.
- Review after P2/P3 runtime and spawn integration.
- Review after P4 state/wait lifecycle.
- Review after P5 commit/worktree policy before any real commit automation is trusted.
- Final review after P6 smoke tests.

Reviewer findings are evidence, not edit scripts. Execution-parent should adjudicate findings before applying fixes.

## Commit Checkpoints

Planned intermediate commits are allowed after:

- P1 passes build/tests/review;
- P2/P3 integrated behavior passes build/tests/review;
- P4 lifecycle passes build/tests/review;
- P5 policy passes build/tests/review.

Before each checkpoint:

- inspect git status and diff;
- stage explicit intended files only;
- exclude sensitive/generated/user-owned surprise files;
- record checks and review evidence in the execution report.

Final commit/push remains orchestrator-owned.

## Verification

Minimum final checks:

- `npm run build`
- focused delegation tests
- `npm run test:router` when feasible
- `git diff --check`
- unavailable-path smoke without pane/child side effects
- live cmux smoke in a safe workspace

Report separately:

- automated checks passed;
- unavailable-path smoke result;
- live cmux smoke result;
- delegation TUI render evidence;
- anything unverified;
- remaining implementation open questions;
- panes/tasks created during smoke and cleanup status.
