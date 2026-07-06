> **Doc ID:** PLAN-2026-07-06-delegation-harness-dogfood-fixes
> **Date:** 2026-07-06
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready
> **Source:** `docs/specs/2026-07-04-delegation-harness-dogfood-fixes-spec.md`

# Delegation Harness Dogfood Fixes Implementation Plan

## Goal

Implement the fixes from the delegation harness dogfood spec so Freeflow pane delegation becomes context-efficient, alert-driven, role-safe, and easier for agents to route correctly.

The implementation should preserve the original harness principles:

```text
Store broadly. Return compactly. Promote selectively. Load narrowly.
```

The next implementation must also preserve the new representation split:

```text
Model input prompts        -> human-readable Markdown
Tool outputs / alerts      -> compact pipe rows
Stored canonical state     -> JSON / JSONL
Recoverable raw evidence   -> transcripts, screen logs, routed output IDs
Human debug notes          -> Markdown
```

## Source Authority

Primary source:

- `docs/specs/2026-07-04-delegation-harness-dogfood-fixes-spec.md`

Supporting source:

- `docs/specs/freeflow-pi-pane-delegation-harness-spec.md`
- `docs/plans/2026-07-01-freeflow-pi-pane-delegation-harness-implementation-plan.md`
- `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/execution-report.json`
- `.freeflow/delegation/tasks/dogfood-e2e-delegation-20260704/execution/harness-observations.md`
- `.freeflow/delegation/tasks/skill-trigger-routing-update-20260706/agents/skill-routing-reviewer/result.json`
- `.freeflow/delegation/tasks/mixed-prompt-routing-update-20260706/agents/mixed-prompt-reviewer/result.json`

## Current Worktree Context

Already implemented and reviewed in the current working tree:

- skill routing updates for earlier Discover/design-for-depth triggering;
- discovery-light narrowing;
- harness-first subagent routing wording;
- mixed-prompt question-before-action wording;
- focused evals `DIS-004`, `DFD-003`, `DEL-007`, and `IVG-005`.

Before runtime implementation begins, this accepted skill/spec/eval work should be committed, pushed, and the local Freeflow install should be updated so subsequent dogfood runs use the new routing behavior.

The previously blocked `delegation/tests/delegation.test.js` dogfood diff was reverted and must not be committed as-is.

## Non-Goals

Do not:

- replace cmux;
- add hidden/headless fallback children;
- add dynamic tool grants;
- allow leaf agents to spawn children;
- use raw transcripts as normal parent context;
- turn every planning discussion into delegated planning;
- implement automatic commits or pushes;
- broaden into unrelated output-router, eval harness, or Pi package work.

## Pre-Execution Commit And Local Update Gate

This gate happens after this plan passes review and before runtime implementation starts.

Tasks:

1. Inspect `git status --short` and diff scope.
2. Confirm only accepted files are staged:
   - dogfood fixes spec;
   - this plan;
   - skill/eval routing updates;
   - mixed-prompt eval prompt;
   - no blocked `delegation/tests/delegation.test.js` diff.
3. Adjudicate skill-routing scope before commit:
   - inspect `verify-work` and `diagnose-failure` against the new harness-first subagent routing and design/discovery trigger expectations;
   - either add the same short pointer/eval coverage before commit or explicitly record intentional deferral in the commit/report.
4. Run focused checks:
   - JSON parse for eval registries;
   - `git diff --check`;
   - focused eval evidence for `DIS-004`, `DFD-003`, `DEL-007`, `IVG-005` from current saved runs or rerun if stale.
5. Commit accepted planning/skill/eval work with explicit staged files.
6. Push after user approval or existing explicit push confirmation.
7. Update local Freeflow install/runtime from the pushed source using the repo’s normal update path.
8. Verify the local runtime loads the updated skills before spawning execution-parent for runtime implementation.

Stop if unexpected generated, sensitive, user-owned, or unrelated files appear, or if `verify-work`/`diagnose-failure` need in-scope updates that were not reviewed.

## Likely Files And Modules

Skill/eval slice already touched:

- `skills/discover/SKILL.md`
- `skills/design-for-depth/SKILL.md`
- `skills/workflow/SKILL.md`
- `skills/delegation-harness/SKILL.md`
- `skills/review-artifact/SKILL.md`
- `skills/review-work/SKILL.md`
- `skills/write-plan/SKILL.md`
- `skills/execute-plan/SKILL.md`
- `skills/interview-gate/SKILL.md`
- `evals/registries/fixture-evals.json`
- `evals/registries/skill-evidence.json`
- `evals/prompts/ivg-005.txt`

Runtime implementation likely touches:

- `delegation/src/types.ts`
- `delegation/src/paths.ts`
- `delegation/src/store.ts`
- `delegation/src/protocol.ts`
- `delegation/src/packet.ts`
- `delegation/src/profiles.ts`
- `delegation/src/policy.ts`
- `delegation/src/cmux.ts`
- `delegation/src/index.ts`
- `delegation/tests/delegation.test.js`
- `pi-extension/src/delegation/runtime.ts`
- `pi-extension/src/delegation/tools.ts`
- `pi-extension/src/delegation/renderers.ts`
- `pi-extension/src/delegation/index.ts`
- `pi-extension/src/router-tools.ts`
- `router/src/tools/batch.ts`
- relevant `router/tests/pi/*delegation*.test.js` or `pi-extension/tests/*` if present
- `pi-extension/dist/**`, `delegation/dist/**`, and other generated dist only after build if this repo convention requires them

Find existing test/build patterns before adding new test files.

## Execution Map

| Package | Goal | Depends On | Parallel? | Expected Write Set | Checks | Review Checkpoint | Stop Conditions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Land accepted planning/skill/eval updates and update local Freeflow | reviewed plan | No | docs/specs, docs/plans, skills, eval registries/prompts | JSON parse, focused evals, diff check | Before commit | dirty unrelated files, stale eval evidence, local update path unclear |
| P1 | Align parent report field contract before new result tooling | P0 | No | `delegation/src/profiles.ts`, `delegation/tests/*`, possibly `protocol.ts` | focused delegation tests | After P1 | docs/parser/profile mismatch remains |
| P2 | Split parent-control tools from child lifecycle tools | P1 | No | `delegation/src/types.ts`, `profiles.ts`, `policy.ts`, `pi-extension/src/delegation/*`, tests | build + focused policy/tool tests | After P2/P3 | leaf can spawn/close children, or lifecycle tools unavailable to leaf roles |
| P3 | Add `delegate_finish`, `delegate_attention`, and optional `delegate_progress` | P2 | No | store/protocol/tools/runtime/renderers/tests | focused lifecycle/result tests | After P2/P3 | full result still requires chat output; schema ambiguous |
| P4 | Render task packet prompts as Markdown | P2 | Can follow P3 | `delegation/src/packet.ts`, renderer/tests | packet tests + spawn smoke | After P4 | pipe rows still dominate child prompt |
| P5 | Add parent inbox, alert ack, and user attention notification contract | P3 | No | store/tools/runtime/cmux/renderers/tests | alert/inbox/ack tests | After P5 | relies on `delegate_wait` for normal supervision |
| P6 | Harden canonical state and `delegate_status` | P3 | Can follow P5 interfaces | store/status/execution-map helpers/tests | malformed-state tests | After P6 | status can crash on invalid JSON/schema |
| P7 | Tighten reviewer/verifier role result schemas | P3 | Yes with P6 if files do not overlap | profiles/protocol/tools/tests/skills | result schema tests, verifier malformed-status test | After P7 | verifier can return `STATUS|PASS` as valid top-level result |
| P8 | Add pane retention/auto-close policy and role-aware layout | P5/P6 | No | cmux/tools/runtime/renderers/tests | fake cmux tests + live smoke | After P8 | auto-close loses needed context or layout unsupported |
| P9 | Broaden `freeflow_batch` to safe delegation operations | P5/P6 | No | `router/src/tools/batch.ts`, `pi-extension/src/router-tools.ts`, tests | batch tests | After P9 | mutating parallel operations are unsafe/ungated |
| P10 | Final smoke, docs/evidence, and local update verification | P8/P9 | No | tests/docs/release evidence only if ready | build, focused tests, live cmux smoke | Final | no alert-driven dogfood proof |

## Execution-Parent Routing Rule

Execution-parent routing is package/global, not slice-local.

For this multi-slice runtime implementation, execution-parent should coordinate and assign implementation to a worker stream instead of self-implementing because the next slice looks small. A single worker may carry multiple sequential slices while context remains useful and the write scope stays coherent.

Spawn a fresh worker only for a real context boundary, parallelism, changed capability/write scope, stale context, or isolation need. Parent inline edits are limited to coordination, reporting, or mechanical integration; product/runtime edits by the parent require an explicit note explaining why they are not worker-owned.

## Slice Details

### P0: Accepted Skill/Eval And Planning Checkpoint

Purpose: land the routing behavior changes before using the harness for the larger runtime implementation.

Tasks:

- Preserve the accepted skill-routing slice and mixed-prompt slice.
- Keep the dogfood fixes spec and this plan.
- Exclude the reverted blocked dogfood test diff.
- Run or recover evidence for:
  - `DIS-004` baseline fail / with-skill pass;
  - `DFD-003` baseline fail / with-skill pass;
  - `DEL-007` baseline fail / with-skill pass;
  - `IVG-005` baseline fail / with-skill pass;
  - eval registry JSON parse;
  - `git diff --check`.
- Stage explicit intended files only.
- Commit and push after final confirmation.
- Update local Freeflow install/runtime from the pushed source.

Expected result: subsequent runtime implementation dogfood uses the updated skill routing.

### P1: Parent Report Field Alignment

Purpose: remove the known source-truth conflict before building new result/report tooling on top of it.

Tasks:

- Align planning-parent default return fields with parser/docs:
  - `status`, `goal`, `artifact_paths`, `review_status`, `settled_decisions`, `open_questions`, `execution_autonomy`, `user_checkpoints`, `execution_guidance`, `risks`, `evidence`.
- Align execution-parent default return fields with parser/docs:
  - `status`, `summary`, `source_references`, `work_packages`, `commits`, `reviews`, `checks`, `files_changed`, `plan_deviations`, `stop_conditions_hit`, `open_questions`, `risks`, `final_recommendation`, `evidence`.
- Re-add the parent packet test from the dogfood idea, but assert the full field contract.
- Keep prompt rendering unchanged in this slice unless unavoidable.

Checks:

- `node --test delegation/tests/*.test.js`
- `git diff --check`

### P2: Parent-Control vs Child Lifecycle Tool Split

Purpose: make role/tool authority explicit and avoid the contradiction where leaf roles need result submission but must not control delegation.

Tasks:

- Define tool classes in core types/profiles:
  - parent-control: task init, spawn, send, close, cancel, broad status, record report;
  - child lifecycle: finish, attention, progress for current delegated agent only;
  - read/recovery: result, own status, evidence pointers when scoped.
- Update profile active tools so leaf roles do not receive parent-control tools.
- Permit leaf roles to use child lifecycle tools scoped to their own task/agent.
- Ensure runtime task packets match actual active tools; if Pi cannot apply scoped profile tools or lifecycle tools, fail closed or route to explicit fallback before child launch.
- Do not advertise `delegate_finish`, `delegate_attention`, or `delegate_progress` in a child prompt unless the tool is actually active for that child.
- Validate write scopes at spawn/packet compile time: support multiple explicit scopes or reject prose/combined scope strings with a clear expected format.
- Update execution-parent profile/task guidance so broad or multi-slice implementation is assigned to a worker stream, not self-implemented slice by slice.
- Update worker guidance so one worker may own multiple sequential slices when context remains useful; do not spawn a fresh worker per slice by default.
- Update policy guards so lifecycle tools cannot target other agents/tasks.
- Add tests for allowed/blocked role-tool combinations, active-tool mismatch fail-closed behavior, write-scope normalization/rejection, and execution-parent routing guidance.

Checks:

- build/typecheck command used by repo;
- focused profile/policy tests;
- Pi adapter registration tests.

### P3: Structured Result And Attention Submission

Purpose: replace chat-printed final blocks as the primary result transport.

Tasks:

- Implement `delegate_finish`:
  - validate role-specific schema;
  - write canonical `result.json` or report JSON;
  - append events;
  - update status;
  - enqueue direct-parent alert;
  - return tiny confirmation to child.
- Treat natural-language claims such as “stored with delegate_finish” as non-results unless canonical result/report JSON, terminal status, event, and parent alert exist.
- Make `delegate_result` report pending/malformed with recovery pointers when a child claims completion but no canonical result exists.
- Implement `delegate_attention`:
  - validate blocker/attention shape;
  - write status/event;
  - enqueue direct-parent alert;
  - support terminal and non-terminal attention where needed.
- Implement optional `delegate_progress` as store-only/no-wake.
- Keep legacy chat parser fallback, but mark it as fallback.
- Dedupe direct lifecycle submission and legacy parser fallback so one terminal result creates one parent alert.
- Ensure tool output is compact pipe rows, not full JSON.
- Add renderer tests proving no full result echo.

Checks:

- store/result tests;
- malformed schema tests;
- child role tool availability tests;
- alert creation tests.

### P4: Markdown Task Packet Prompt Rendering

Purpose: make model input prompts readable while preserving compact machine outputs elsewhere.

Tasks:

- Keep canonical task packet as structured object/JSON.
- Add Markdown prompt renderer for child model input.
- Keep compact pipe renderer for TUI/tool output and evidence envelopes.
- Render source pointers and output-router evidence handles clearly.
- Include return schema in readable form, with pipe examples only for legacy fallback.
- Update packet tests to assert Markdown shape and no pipe-heavy prompt body.
- Smoke spawn a tiny child and inspect prompt readability.

Checks:

- packet tests;
- renderer tests;
- live cmux prompt smoke when safe.

### P5: Parent Inbox, Alert Ack, And User Attention

Purpose: make normal supervision event-driven instead of `delegate_wait` polling.

Tasks:

- Add direct-parent inbox state and unread alert queries.
- Add `delegate_inbox`, `delegate_ack_alert`, and `delegate_ack_all`.
- Update `delegate_status` to default to compact counts/current task/direct-parent unread alerts, not stale dumps or global historical counts.
- Keep historical/global alerts recoverable only through explicit status/inbox options.
- Dedupe terminal result alerts by task, agent, result status, result path/content hash, and event type.
- Add `delegate_user_attention` or equivalent harness-owned user-attention tool.
- Default channel: cmux notification/attention marker plus TUI badge/inbox.
- Optional channel: desktop notification when configured.
- Notify user only for user-attention states or configured task completion, not routine leaf completion.
- Deduplicate/coalesce user attention and child completion summaries.

Decision checkpoints before implementing notification defaults:

- completion notification default: enabled for autonomous task done, opt-in, or task-configurable;
- desktop backend: macOS cmux/TUI only first, desktop later, or configurable now.

Checks:

- alert enqueue tests;
- duplicate terminal-result dedupe tests;
- ack tests;
- status unread/stale/current-task scoping tests;
- cmux notification fake adapter tests.

### P6: Canonical State And Status Robustness

Purpose: prevent `delegate_status` and related tools from crashing when canonical state is malformed or manually overwritten.

Decision checkpoint before implementation:

- Decide whether canonical execution-map updates are owned by a dedicated tool such as `delegate_update_execution_map`, existing report/result tools, or both.
- Treat that choice as a public harness tool/state contract. If the answer is not source-backed by the spec and current code, stop for owner confirmation before implementing.

Tasks:

- Add schema validation for execution-map/status/report/registry reads.
- Return degraded status with reason and recovery pointers instead of internal exceptions.
- Implement the chosen execution-map update ownership path so models do not overwrite canonical JSON directly.
- Preserve last-known-good state when feasible.
- Add tests for missing arrays, invalid JSON, unknown state, and partial files.

Checks:

- malformed-state tests;
- status renderer tests;
- restart/recovery-style tests.

### P7: Reviewer And Verifier Result Contracts

Purpose: make role-native results first-class and prevent malformed verifier outputs.

Decision checkpoint before implementation:

- Define or confirm the exact public schema for reviewer findings and verifier evidence before coding validators or task prompts.
- Decide which fields are required versus optional for first implementation and which remain legacy fallback only.
- If the schema choice changes user-visible output, public tool API, compatibility, or role authority, stop for owner confirmation before implementing.

Tasks:

- Implement the confirmed role-native schemas for reviewer findings and verifier evidence.
- Ensure top-level lifecycle statuses are only canonical statuses.
- Allow check statuses such as `pass`/`fail` only inside check rows/objects.
- Provide schema hints in task prompts and validation errors.
- Parse/store reviewer/verifier outputs via `delegate_finish`.
- Keep legacy `FFRESULT` fallback clear and strict.

Checks:

- verifier `STATUS|PASS` rejected with clear hint;
- verifier check pass accepted inside check object;
- reviewer finding grouping tests;
- child prompt includes role-specific result schema.

### P8: Retention And Layout

Purpose: reduce pane clutter and make visual layout match role ownership.

Tasks:

- Add retention modes:
  - `auto`;
  - `keep-open`;
  - `debug`.
- Default normal runs to `auto`; dogfood/debug can use `debug`.
- Auto-close successful reviewer/verifier/researcher panes after parent consumes/acks result while preserving evidence.
- Treat reviewer results with blocking, question, or needs-evidence findings as non-passing even when the process status is `completed`; keep those panes open through adjudication, fix, and re-review unless the parent/user explicitly closes them.
- Keep failed/blocked/attention panes open.
- Keep worker panes through review/fix loop, then close when package accepted or parked.
- Before closing or cancelling a parent, detect active descendants and require an explicit close, cancel, adopt, or park decision for each descendant.
- Completed descendant results should be consumed/acked or explicitly parked before parent close; active descendants must not be silently orphaned.
- Reject `delegate_send` follow-ups to terminal children unless the harness creates an explicit new attempt with its own state/result identity.
- Add role-aware layout policy:
  - orchestrator left;
  - planning parent/children grouped;
  - execution parent/children grouped;
  - reviewer/verifier short-lived dock.
- Keep manual `direction` override.

Decision checkpoint before implementation:

- auto-close on parent read or explicit ack.

Checks:

- fake cmux close tests;
- retention policy tests;
- parent-close descendant reconciliation tests;
- terminal-child `delegate_send` rejection or explicit-attempt tests;
- layout target selection tests;
- execution-parent dogfood smoke: broad/multi-slice work is assigned to a worker stream rather than parent self-implementation;
- live smoke if cmux supports needed operations.

### P9: `freeflow_batch` Delegation Operations

Purpose: reduce tool-call overhead for independent harness operations.

Tasks:

- Add batch operation metadata:
  - reads harness state;
  - writes evidence;
  - mutates harness state;
  - mutates repo state;
  - parallel-safe / conditional / denied.
- Add safe initial operations:
  - `delegate_status`;
  - `delegate_inbox`;
  - `delegate_result`;
  - `delegate_capture`;
  - `delegate_close`;
  - `delegate_ack_alert`.
- Ensure mutating operations are gated and explicit.
- Keep arbitrary shell/tool batching out of scope.
- Add query synthesis over child results similar to existing batch queries.

Checks:

- batch read operation tests;
- batch mutating operation policy tests;
- result query synthesis tests;
- no unsafe parallel writer behavior.

### P10: Final Smoke And Evidence

Purpose: prove the fixes change harness behavior.

Runtime-load rule: live cmux smoke must exercise the installed/reloaded Freeflow runtime, not the current already-loaded session. If the current session cannot load the WIP runtime, live smoke moves after commit, push, and local runtime update/reload. Do not claim final completion until that post-push smoke passes or its failure is reported with a follow-up fix route.

Tasks:

- Run focused automated tests for touched modules before commit.
- Commit/push only after review and automated checks pass, using explicit staging and existing user push confirmation.
- Update/reload local Freeflow from the pushed source.
- Run live cmux dogfood smoke after reload:
  - spawn a child with Markdown prompt;
  - child prompt lists only tools actually active for that child;
  - child uses `delegate_finish` without full chat result;
  - natural-language fake finish without canonical result is reported pending/malformed, not successful;
  - parent receives one deduped inbox alert without `delegate_wait`;
  - parent acks/consumes compact result;
  - successful verifier/reviewer pane auto-closes under policy;
  - parent close/cancel refuses or explicitly reconciles active descendants;
  - follow-up to a terminal child is rejected or represented as an explicit new attempt, not a stale wait state;
  - final user attention uses cmux/TUI notification channel when configured.
- Save or update runtime evidence only when useful and accepted.

Minimum pre-push checks:

- `npm run build`
- focused delegation tests
- relevant Pi adapter tests
- `git diff --check`

Minimum post-push/reload checks:

- live cmux smoke evidence

### P11: Compact Delegation Tool Envelopes

Purpose: make delegation tool output sufficient for normal parent decisions without reading `.json` files.

Tasks:

- Extend the model-visible compact pipe-row formatter for `delegate_status`, `delegate_wait`, `delegate_result`, `delegate_send`, inbox/ack, and lifecycle outputs.
- Include state, route, alert summaries, result summaries, changed files, checks/output IDs, evidence pointers, blockers/requests/findings, recommendations/residual risk, retention action, and recovery paths.
- Keep canonical JSON/JSONL as recovery evidence only; do not dump raw transcripts, screens, full parsed rows, or full JSON into normal tool output.
- Keep row counts bounded with `*_more` summaries.
- Update docs/skill references to say JSON reads are exceptional.

Checks:

- unit tests asserting `delegate_status`, `delegate_wait`, and `delegate_result` content includes enough decision facts without reading JSON;
- no raw `FFRESULT` or transcript dump in compact content;
- build and router tests pass;
- focused smoke with a fresh runtime if output behavior is user-visible enough to warrant it.

## Review Checkpoints

Use harness reviewers, not hidden/native subagents, when delegation is available.

- Review P0 before commit/push/update.
- Review P1 after parent report field alignment.
- Review P2/P3 together because tool authority and result submission share interfaces.
- Review P4 prompt rendering separately for UX/context impact.
- Review P5/P6 together because alerts/status/state share store contracts.
- Review P7 role schemas before relying on verifier outputs.
- Review P8/P9 before commit/push because they affect user-visible behavior and operation batching.
- Final code review before commit/push after automated checks pass.
- Final smoke review after post-push/reload P10 smoke.

Reviewer findings are evidence. Parent/execution-parent adjudicates before fixes. When a review returns blocking, question, or needs-evidence findings, keep that reviewer pane open for the narrowed re-review unless the parent/user explicitly chooses to close it.

## Stop Conditions

Stop and route back before editing or continuing if:

- source docs/specs/tests conflict with intended behavior;
- Pi extension APIs cannot support child lifecycle tools or scoped tool policy, and the fallback would advertise unavailable tools or misrepresent enforcement;
- write-scope input cannot be made explicit enough to avoid prose/combined scope ambiguity;
- alerts cannot be surfaced without polling and no acceptable degraded path exists;
- cmux cannot support the needed notification/layout/close behavior after reload;
- status robustness requires hiding malformed canonical state instead of reporting it;
- result submission would require raw result injection into parent context;
- batch delegation operations cannot be made concurrency-safe;
- notification defaults or auto-close timing require owner decisions not yet made;
- implementation would affect public API, security, privacy, billing, data loss, compatibility, or permissions beyond the spec.

## Final Handoff Criteria

Before claiming complete:

- report committed/pushed revision and local update/reload evidence;
- report automated pre-push checks;
- report post-push live cmux smoke outcome;
- report verified alert/inbox behavior without normal `delegate_wait` supervision;
- report any remaining open questions or deferred optional channels;
- name any panes/tasks left open and cleanup status.
