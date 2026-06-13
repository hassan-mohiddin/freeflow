# Workflow Context Hook Eval Report - Iteration 1

Date: 2026-06-13

## Scope

Added plugin-bundled context hooks for the setup/workflow lifecycle gap:

- load `workflow/SKILL.md` and `workflow/references/workflow-map.md` at session start
- report whether repo setup appears complete, partial, or missing

This is context loading only. No tool blocking, permission changes, CLI checks, native slash handlers, or repo-local hook files were added.

Same-session setup loading is owned by `setup-freeflow`: after successful setup verification, the setup skill reads the workflow skill and workflow map before its final response.

Host trust UI was not exercised. If a host skips untrusted plugin hooks, setup still succeeds but future session-start workflow context will not load until the user trusts the hooks and restarts, resumes, clears, or compacts.

## Failure Preserved

A user installed Freeflow, ran setup later, then compacted or resumed, but the agent still behaved as though it only had a directly invoked skill and not the full workflow lifecycle.

The failure has two parts:

- setup state was not visible early enough
- the workflow map was not loaded unless the `workflow` skill itself was selected

## Deterministic Check

Added:

- `plugins/freeflow/hooks/hooks.json`
- `plugins/freeflow/hooks/freeflow-runtime-context.mjs`
- `plugins/freeflow/evals/scripts/check-runtime-context-hook.sh`

The check verifies:

- hook JSON parses
- `SessionStart` covers `startup|resume|clear|compact`
- no `PostToolUse` hook is registered
- `FREEFLOW_DISABLE_RUNTIME_CONTEXT=1` suppresses context output for clean baseline evals
- Claude-shaped startup output uses `hookSpecificOutput.additionalContext`
- Codex-shaped startup output is plain developer context
- startup output includes setup status, effective repo default mode, the full workflow skill, and workflow map
- missing or invalid config reports fallback to `workflow`
- direct `PostToolUse` invocation emits no context

## Result

`check-runtime-context-hook.sh`: pass.

## Workflow Following Eval

`WRC-001` checks whether a completed consequential phase closes with a workflow route instead of an ordinary "next step" phrase.

Baseline fixture runs now set `FREEFLOW_DISABLE_RUNTIME_CONTEXT=1` before launching nested agents so installed lifecycle hooks do not inject workflow context into the baseline.

Results:

- `WRC-001` clean baseline: fail. The agent made no file changes, but it did not include the required `Next:` route.
- `WRC-001` with `workflow/SKILL.md` and `workflow/references/workflow-map.md`: pass. The agent made no file changes and ended with `Next: Forward to write-spec`.

Saved evidence:

- `evals/runs/workflow-context-1/wrc-001-baseline-clean-output.md`
- `evals/runs/workflow-context-1/wrc-001-with-workflow-output.md`

## Verification

Commands:

```sh
plugins/freeflow/evals/scripts/check-runtime-context-hook.sh
plugins/freeflow/evals/scripts/grade-fixture-eval.sh WRC-001 --output plugins/freeflow/evals/runs/workflow-context-1/wrc-001-baseline-clean-output.md
plugins/freeflow/evals/scripts/grade-fixture-eval.sh WRC-001 --output plugins/freeflow/evals/runs/workflow-context-1/wrc-001-with-workflow-output.md
plugins/freeflow/evals/scripts/validate-release-metadata.sh --mode prepublish --release-version 0.1.0
```

## Recommendation

Keep context hooks separate from setup output. Setup should create activation/config files; the installed plugin should own lifecycle hooks.

Do not add enforcement hooks unless a future eval shows a deterministic behavior failure that concise skill wording and context loading do not solve.
