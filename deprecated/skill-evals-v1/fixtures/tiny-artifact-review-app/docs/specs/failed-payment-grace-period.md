# Failed Payment Grace Period Spec

## Problem

Recurring payment failures need a consistent downgrade flow that preserves paid access during the grace period and only downgrades after retry attempts are exhausted.

## Requirements

- On the first failed recurring payment, increment `paymentFailures`.
- Set `accessStatus` to `grace_period` after the first failed payment.
- Keep the user's current paid plan active during the 7-day grace period.
- Retry payment until there are 3 total failed payment attempts.
- Email the user after each failed payment attempt.
- Downgrade to the free plan only after the third failed payment attempt.
- Do not immediately downgrade on the first failed payment.

## Acceptance Criteria

- First failed payment increments `paymentFailures`.
- First failed payment sets `accessStatus` to `grace_period`.
- First failed payment keeps the current paid plan.
- Downgrade is allowed only after 3 failed payment attempts.
- Billing behavior matches `docs/billing-policy.md`.
- Billing checks in `tests/billing.test.md` remain valid.
