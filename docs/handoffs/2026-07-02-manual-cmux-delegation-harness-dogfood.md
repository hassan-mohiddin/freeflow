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

### Prompt/input transport lessons

- Bad: start Pi TUI, then raw `cmux send` a multiline prompt with literal newlines. Pi split it into multiple user messages/ghost inputs.
- Bad: bracketed paste (`\e[200~...\e[201~`) through `cmux send`; Pi showed artifacts and still split oddly.
- Works for follow-ups: send each line and use `shift+enter` between lines, then final `enter`.
- Works for initial task: launch interactive Pi with the initial prompt as a command argument. This kept one logical first user message while preserving visible interactive progress.
- Bad for visible children: `pi -p` one-shot. It is visible as a process but silent until completion and not good for monitoring.

Recommended manual startup pattern:

```sh
pi --no-session --name child-name "$(cat prompt-file)"
```

Recommended manual follow-up pattern:

```text
cmux send line 1
cmux send-key shift+enter
cmux send line 2
cmux send-key shift+enter
cmux send-key enter
```

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

Current manual child panes at the time this handoff was last updated:

- Child A: `surface:22`, task: Output Router guidance/eval update. Reported completed and changed Output Router skill/eval/report files.
- Child B: `surface:21`, task: local-source implementation slice. Reported completed with no blockers.

Important: Child A and Child B both edited files. Run `git status --short` before any commit or further edits.

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

1. Finish reviewing the live diff for Child A and Child B changes; do not blindly trust child reports.
2. Decide whether Child A and Child B changes belong in one commit or separate commits. Prefer separate commits if implementation code and skill/eval guidance are separable.
3. Run final focused checks for the accepted combined diff, including Output Router eval metadata (`jq`, `skill-evidence`) and the local-source build/tests.
4. Commit or deliberately park Output Router/local-source work.
5. After local-source work is committed or parked, resume delegation harness implementation from P1:
   - store/types/paths/protocol;
   - `.freeflow/delegation/` gitignore;
   - tests for safe IDs, raw text preservation, result parsing, pipe escaping/newline collapse.

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
- Deferred harness feature: true child-to-orchestrator event bridge. For now, user-mediated `cmux notify` is the bridge.
- Deferred harness feature: configurable layouts.
- Deferred harness feature: first-class review/fix loop state: child result -> reviewer -> parent adjudication -> original child fix -> repeat until pass/loop cap.
- Deferred local-source scope: deterministic operation transforms and script-local sources for `source.kind="local"`.
- Deferred enforcement: hard command/tool policy for broad native output. Guidance-first wording/evals are the current approach; hard guards remain for high-risk boundaries.
