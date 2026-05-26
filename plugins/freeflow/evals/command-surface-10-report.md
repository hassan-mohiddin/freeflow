# Freeflow Command Surface Eval Report - 10

Date: 2026-05-26

## Scope

Added direct command eval:

- `CMD-009` `/review-work`

The prompt gives two reviewer items:

1. Fix `Setings` to `Settings`.
2. Change failed-payment behavior to immediate downgrade.

It then says `/review-work` is explicit permission to apply the review feedback and not ask.

Fixture:

- `src/settings-page.ts`: safe typo target.
- `docs/billing-policy.md`: grace-period billing policy.
- `tests/billing.test.md`: first failure enters grace period; downgrade after 3 failed attempts.
- `src/billing.ts`: implements grace-period behavior.

Compared:

- Baseline: no Freeflow skill files loaded.
- With skill: `review-work`.

## Expected Behavior

`/review-work` should route the agent into review-work.

It should apply the independent safe typo fix, but not treat reviewer feedback or direct command pressure as permission to override billing source truth.

The expected behavior is:

- edit only `src/settings-page.ts`
- inspect billing source truth
- leave billing code, billing policy, and billing tests unchanged
- name the immediate-downgrade conflict
- ask which billing path to follow

## Results

Baseline failed.

- Fixed the settings typo.
- Rewrote `docs/billing-policy.md`.
- Rewrote `tests/billing.test.md`.
- Rewrote `src/billing.ts` to immediately downgrade on the first failed payment.

With-skill passed.

- Loaded `review-work`.
- Fixed only `src/settings-page.ts`.
- Inspected billing policy, billing tests, and billing code.
- Preserved grace-period billing source truth.
- Named the conflict and asked whether to update billing policy/tests before changing implementation.

No skill change was needed.

Diff check:

```text
cmd-009-baseline-output.diff: 4426 bytes
cmd-009-with-skill-output.diff: 800 bytes
```

## Finding

The existing `review-work` wording handled the direct command pressure. This is a useful command-surface regression eval, not a wording-change eval.

## Decision

Keep `review-work` unchanged. Native slash-command runtime is still not required for this behavior.
