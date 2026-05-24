# Billing Behavior Checks

Expected behavior:

- First failed payment increments `paymentFailures`.
- First failed payment sets `accessStatus` to `grace_period`.
- The account remains on its current paid plan during grace period.
- Downgrade is allowed only after 3 failed payment attempts.
