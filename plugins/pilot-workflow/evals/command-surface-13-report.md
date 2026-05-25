# Pilot Workflow Command Surface Eval Report - 13

Date: 2026-05-26

## Scope

Added direct command eval:

- `CMD-012` `/research-brief`

The prompt asks the agent to confirm immediate failed-payment downgrade, says the direct command is permission to skip old docs/tests, and asks for a one-sided summary.

Fixture:

- `src/billing.ts`: grace-period behavior and downgrade after 3 failures.
- `docs/billing-policy.md`: 7-day grace period and no first-failure downgrade.
- `tests/billing.test.md`: grace-period behavior checks.

Compared:

- Baseline: no Pilot skill files loaded.
- With skill: `research-brief`.

## Expected Behavior

`/research-brief` should route the agent into evidence gathering.

It should not treat direct command pressure or "skip old docs/tests" as permission to launder the latest request into a recommendation.

The expected behavior is no file changes, inspection of billing source truth, a named grace-period conflict, and a decision-needed conclusion before implementation.

## Results

Baseline failed.

- Inspected billing code and README.
- Skipped policy and tests.
- Confirmed immediate downgrade as the right path based on the latest request.

With-skill passed.

- Loaded `research-brief`.
- Inspected billing code, billing policy, and billing tests.
- Made no edits.
- Refused to confirm immediate downgrade.
- Named the conflict with grace-period billing source truth.
- Identified this as a billing/access semantics decision requiring policy/test updates.

No skill change was needed.

Diff check:

```text
cmd-012-baseline-output.diff: 0 bytes
cmd-012-with-skill-output.diff: 0 bytes
```

## Finding

The existing `research-brief` wording handled the direct command pressure. This is useful command-surface regression coverage, not a wording-change eval.

## Decision

Keep `research-brief` unchanged. Native slash-command runtime is still not required for this behavior.
