# Project Handoff

Date: 2026-07-02

## Purpose

Durable memory for the manual cmux delegation dogfood run while implementing the Freeflow Pi pane delegation harness.

This handoff is memory, not authority. Reopen the linked files, inspect current panes/diffs, and rerun relevant checks before acting. Live repo evidence overrides this note.

## Stable Context

The delegation harness spec/plan/skill checkpoint was committed as:

- `ee9571b docs: add delegation harness spec and evals`

Current work after that commit is about two follow-up threads discovered during manual delegation:

1. Output Router guidance should more strongly prefer routed tools for broad/unknown output, especially in child/scout/reviewer/verifier contexts.
2. `freeflow_search` should support explicit external local sources, because repo/vault-only search forced children to fall back to native `rg/read` for Pi docs.

Manual delegation is being used as dogfooding before the harness exists. The current manual model is intentionally simple:

```text
user + orchestrator pane
  -> direct child pane A
  -> direct child pane B
```

Do not add a separate execution-parent pane yet. Multiple children are acceptable as sibling panes directly managed by the orchestrator pane.

## Decisions Made

### Manual delegation shape

- The user stays in the loop as the manual event bridge.
- Children notify the user through `cmux notify`; the orchestrator does not receive cmux notifications as model-visible events yet.
- The user tells the orchestrator when a child is done/blocked; then the orchestrator reads the child pane once.
- Child-to-orchestrator direct text injection is deferred to the harness. Do not use `cmux send` into the orchestrator editor as a communication channel.
- Manual children should be `--no-session` by default. The harness state, not child Pi session history, should become the durable state later.

### Child context and tools during manual dogfood

- Manual children should behave like normal Pi sessions with normal repo context/skills/extensions unless a task-specific reason says otherwise.
- Do not strip all skills; the no-skills child became inefficient and bloated context.
- Do not load/prohibit `delegation-harness` for children by default as a hard rule. Instead, give clear prompt policy:
  - direct child managed by orchestrator;
  - do not spawn children;
  - task scope and stop conditions;
  - no stage/commit/push unless explicitly assigned;
  - normal text plus compact `RESULT` footer.
- Guidance and user monitoring are the manual guardrails. Hard enforcement belongs in the harness for secrets, writes outside scope, destructive commands, push, etc.

### Manual review/fix loop

The better manual delegation loop is:

1. Orchestrator/parent reads the child `RESULT`, not the full transcript or diff by default.
2. Spawn an independent reviewer pane for the child diff with source truth, accepted decisions, changed-file scope, pass/fail criteria, and a strict do-not-edit policy.
3. Parent adjudicates reviewer findings: accepted, rejected, question, or needs evidence.
4. Accepted findings go back to the original child to fix. The child should own related implementation/docs/skill/test updates that are inside its assigned scope.
5. Repeat fix/review until pass, question/owner decision, or review-loop cap.
6. Parent owns final integration judgment, verification claim, commit boundary, and user-owned decisions.

Do not let the orchestrator/parent reflexively become the implementer, reviewer, fixer, and verifier for child work. That can be expedient, but it weakens the dogfood signal for the harness. Parent self-fix is acceptable only for tiny integration glue, urgent unblockers, or explicitly chosen bypasses; record that as a deviation.

### Role-specific child output

Do not force every child role into the same generic `RESULT` shape.

- Workers should end with a compact `RESULT` footer: status, summary, files changed, commands run, findings, blockers, recommendation.
- Work reviewers should use the `review-work` output shape: findings grouped by Blocking / Non-blocking / Questions, then an Assessment with ready-to-proceed status and residual risk.
- Artifact reviewers should use the `review-artifact` shape and lenses: pass/blocking/non-blocking/question, with focus on whether a spec, plan, handoff, decision note, or other artifact is fit to guide future work.
- Verifiers should use a concise verification evidence format: checks run, pass/fail result, evidence/output IDs, unverified areas, and whether a completion claim is supported.

The parent/orchestrator consumes those role-native outputs, adjudicates findings, and records compact canonical state. The future harness may parse role-specific report types rather than flattening reviewers and verifiers into worker-style `RESULT` blocks.

### Harness implications from dogfood

Treat manual dogfood failures as harness design pressure, not just operator tips:

- Substantive task and fix packets should be file-backed or extension-injected, not typed into an active TUI with simulated multiline input.
- The harness should model communication as structured alert/state, not open chat or duplex conversation:
  - parent/orchestrator to child: initial task packet plus explicit `delegate_send` follow-up/steer/note events when needed;
  - child to parent/orchestrator: sparse terminal/attention alerts backed by stored result/status/report state;
  - parent consumes state through `delegate_status`, `delegate_result`, role-specific report retrieval, and explicit watch-mode `delegate_wait`, not raw notifications or transcript dumps.
- `cmux notify` is only a manual user-visible bridge. It is not model-visible parent communication.
- The normal harness path should not poll. Child completion, blocker, failure, cancellation, attention, and capability-gap outcomes should alert the direct parent once, with coalescing/rate limits; routine progress/tool/check events should stay store-only.
- `delegate_wait` should be explicit watch mode with timeout and retry cap, not an autonomous polling loop.
- Role-native reviewer/verifier outputs should become first-class parse/store/report types where useful, not worker-shaped `RESULT` everywhere.
- Every state and alert should have a failure contract: who may set it, whether it is terminal, what evidence is required, whether it wakes the parent, and what recovery path applies.

### Prompt/input transport lessons

- Bad: start Pi TUI, then raw `cmux send` a multiline prompt with literal newlines. Pi split it into multiple user messages/ghost inputs.
- Bad: bracketed paste (`\e[200~...\e[201~`) through `cmux send`; Pi showed artifacts and still split oddly.
- Risky: long active-TUI follow-ups via `cmux send` plus `shift+enter`, especially after a child has completed and when the prompt contains code/probe snippets. In P1, this split into queued/steering prompts instead of one clean follow-up.
- Works only for short/simple follow-ups: send each line and use `shift+enter` between lines, then final `enter`.
- Better for substantive follow-ups/fix packets: write the follow-up to a temp or repo-local task file, then send one short prompt telling the child to read and execute that file.
- Works for initial task: launch interactive Pi with the initial prompt as a command argument. This kept one logical first user message while preserving visible interactive progress.
- Bad for visible children: `pi -p` one-shot. It is visible as a process but silent until completion and not good for monitoring.

Recommended manual startup pattern:

```sh
pi --no-session --name child-name "$(cat prompt-file)"
```

Recommended manual follow-up pattern for substantive packets:

```sh
# parent writes /tmp/freeflow-child-followup.md or a gitignored task-packet file
cmux send --surface surface:N 'Read and execute /tmp/freeflow-child-followup.md exactly. Do not stage, commit, push, or spawn children. Notify when done.'
cmux send-key --surface surface:N enter
```

Short follow-ups may still use `shift+enter`, but avoid that path for long packets, reviewer probes, code blocks, or post-result fix instructions.

### Layout

Default visual layout for dogfooding and future harness:

```text
left side:
  orchestrator
  optional short-lived reviewer/verifier dock later

right side:
  child/parent panes
```

For current direct-child dogfood, use:

```text
left: orchestrator
right top: Child A
right bottom: Child B
```

For the future full harness, the user proposed:

```text
left: orchestrator
  bottom: short-lived reviewer/verifier when orchestrator-owned

right tab: planning parent
  top: planning-parent
  bottom: planning children

right tab: execution parent
  top: execution-parent
  bottom: execution children
```

Keep layout configurability for later; do not over-design it now.

### Output Router and local-source decisions

- Output Router compact tool output uses pipe-delimited rows like `TAG|field|field`, not CSV. Literal `|` is escaped as `¦`; field newlines collapse to spaces.
- Manual child results should use normal text with a plain `RESULT` footer. `FFRESULT`/pipe protocol is for the implemented harness/parser, not manual dogfood.
- The user prefers guidance-first over enforcement. Improve guidance first; reserve hard enforcement for dangerous boundaries.
- Accepted local-source API decisions from Child B proposal:
  - source kind name: `local`;
  - explicit per-call absolute `root` required;
  - optional relative `path` under root;
  - no shared config allowlist in the first slice;
  - first implementation slice: search/retrieve/expand plus processing-engine transform for explicit local files;
  - defer deterministic local operation transforms and script-local sources.

## Live Evidence

Primary artifacts to reopen:

- `docs/specs/freeflow-pi-pane-delegation-harness-spec.md`
- `docs/plans/2026-07-01-freeflow-pi-pane-delegation-harness-implementation-plan.md`
- `skills/delegation-harness/SKILL.md`
- `skills/delegation-harness/references/task-packets-and-results.md`
- `skills/output-router/SKILL.md`
- `skills/output-router/references/safety-policy.md`
- `evals/reports/by-skill/delegation-harness-1-report.md`
- `evals/reports/by-skill/workflow-2-report.md`

Completed manual child panes from this dogfood run:

- Child A: Output Router guidance/eval update. Completed, reviewed, committed, and pushed.
- Child B: local-source implementation slice. Completed, reviewed, committed, and pushed.
- P1 worker/reviewer: delegation store/protocol foundation. Completed review/fix loop and committed as `6325301 Add delegation store and protocol foundation`.
- Failure-contract skill scout: proposal-only/read-only. Completed with recommendation to add evals first, then update existing skills rather than create a new skill.

Important: run `git status --short` before any commit or further edits. Treat pane summaries as memory; live repo evidence wins.

Child A reported changed files:

- `skills/output-router/SKILL.md`
- `evals/prompts/otr-003.txt`
- `evals/registries/fixture-evals.json`
- `evals/registries/skill-evidence.json`
- `evals/reports/by-skill/output-router-3-report.md`

Child A validation reported:

- registry `jq` validation;
- `OTR-003`, `OTR-002`, `CMD-016` dry-runs;
- `skill-evidence` validation;
- `git diff --check`.

Child B implementation result to verify from live repo evidence:

- added `router/src/local/local-traversal.ts` and built `router/dist/local/`;
- updated public schema/Pi adapter/renderer/compact output for `source.kind="local"`;
- updated router search/retrieve/expand support for local sources;
- updated processing-engine transform support for explicit local files;
- added focused tests in `router/tests/tools/search.test.js` and `router/tests/pi/pi-extension-search.test.js`;
- deferred deterministic local operation transforms and broader script-local source support.

Parent verification after Child B finished:

- `npm run build` passed.
- `node --test router/tests/tools/search.test.js router/tests/pi/pi-extension-search.test.js` passed: 57/57.
- `node --test router/tests/processing/engine.test.js` passed: 21/21.
- `git diff --check` passed.

## Next Focus

Current repo state after P1 checkpoint:

1. Commit or deliberately park this handoff/spec/plan documentation update.
2. Push `6325301` and the documentation update when accepted.
3. If updating skills for failure-contract-first design, follow `evaluate-skill`: add/update eval artifacts first, then make minimal wording changes.
4. Recommended skill-eval follow-up from the scout:
   - main home: `design-for-depth`;
   - also small phase-specific updates to `delegation-harness`, `write-spec`, `write-plan`, `execute-plan`, `review-work`, and `verify-work`;
   - optional one routing sentence in `workflow`;
   - no new skill unless later eval evidence shows a distinct trigger/job/failure mode.
5. Resume delegation harness implementation at P2/P3 only after docs are accepted:
   - P2: delegated runtime profiles, sparse terminal/attention events, failure contracts, policy guards;
   - P3: tools/cmux adapter, file-backed send/follow-up, preflight, TUI renderers;
   - P4 later owns alert queue, parent wake/coalescing, explicit watch-mode `delegate_wait`, cancel/close/report lifecycle.

## Stop Conditions

Stop and ask before:

- changing the accepted public API shape away from `source.kind="local"` with explicit absolute `root`;
- adding shared repo config for local roots;
- broadening local-source implementation to deterministic transforms or script-local sources;
- committing Child A guidance/eval changes without reviewing the diff;
- committing Child B implementation without focused tests/build evidence;
- accepting child work without an independent reviewer pass when the change is non-trivial;
- parent/orchestrator doing substantial child-scope fixes instead of sending accepted review findings back to the child, unless explicitly choosing a bypass/deviation;
- using direct child-to-orchestrator `cmux send` as a communication mechanism;
- treating child outputs as authority when live repo evidence disagrees;
- pushing commits.

## Superseded Or Deferred Work

- Superseded manual pattern: raw multiline `cmux send` into an open Pi TUI.
- Superseded manual pattern: `pi -p` for visible child work.
- Deferred harness feature: alert-first parent notification bridge: child terminal/attention outcomes write store state and alert the direct parent without user mediation.
- Deferred harness feature: configurable layouts.
- Deferred harness feature: first-class review/fix loop state: child result -> reviewer -> parent adjudication -> original child fix -> repeat until pass/loop cap.
- Deferred local-source scope: deterministic operation transforms and script-local sources for `source.kind="local"`.
- Deferred enforcement: hard command/tool policy for broad native output. Guidance-first wording/evals are the current approach; hard guards remain for high-risk boundaries.
- Deferred skill work: failure-contract-first philosophy should be integrated through eval-backed updates, not direct wording edits first.
