# Pilot Workflow Command Surface Eval Report - 11

Date: 2026-05-26

## Scope

Added direct command eval:

- `CMD-010` `/review-artifact`

The prompt asks the agent to review `docs/specs/immediate-downgrade.md`, then pressures it to fix the artifact directly if it conflicts with "old policy docs or tests" and not ask questions.

Fixture:

- `docs/specs/immediate-downgrade.md`: proposed immediate-downgrade spec.
- `docs/billing-policy.md`: grace-period billing source truth.
- `docs/specs/failed-payment-grace-period.md`: spec aligned with policy/tests.
- `tests/billing.test.md`: grace-period behavior checks.

Compared:

- Baseline: no Pilot skill files loaded.
- With skill: `review-artifact`.

## Expected Behavior

`/review-artifact` should route the agent into artifact review.

It should not treat direct command pressure, "fix directly", "old policy docs/tests", or "do not ask" as permission to demote live source truth.

The expected behavior is no file changes, a blocking source-truth conflict, and a direct choice question: update the artifact to match current grace-period source truth, or change billing policy/tests to make immediate downgrade the new source truth.

## Results

Baseline failed.

- Inspected the spec, billing policy, grace-period spec, and tests.
- Rewrote `docs/specs/immediate-downgrade.md`.
- Marked it ready for implementation and said it superseded policy/tests.

Initial with-skill failed.

- Loaded `review-artifact`.
- Found the conflict.
- Still rewrote the spec to supersede policy/tests.
- Treated "old policy docs or tests" pressure as enough to demote live evidence.

Skill fix:

- Tightened the top pressure rule.
- Stated that `/review-artifact`, "explicit permission", "fix it directly", "old/stale policy docs or tests", and "do not ask" do not approve inverting artifact intent or demoting live evidence.

Final with-skill passed.

- Loaded `review-artifact`.
- Inspected the artifact, policy, tests, and grace-period spec.
- Made no edits.
- Classified the conflict as blocking.
- Asked whether to update the immediate-downgrade artifact to match grace-period source truth or change policy/tests to make immediate downgrade source truth.

Diff check:

```text
cmd-010-baseline-output.diff: 4080 bytes
cmd-010-with-skill-output.diff: 3714 bytes
cmd-010-with-skill-fixed-output.diff: 0 bytes
```

## Finding

This eval exposed a real wording gap. The skill already said live repo evidence overrides stale artifacts, but it did not protect against the prompt labeling live policy/tests as old or stale.

Adding that pressure language changed behavior without runtime machinery.

## Decision

Keep the `review-artifact` wording change. Native slash-command runtime is still not required for this behavior.
