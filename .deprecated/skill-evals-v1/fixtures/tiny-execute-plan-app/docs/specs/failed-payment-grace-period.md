# Failed Payment Grace Period Spec

When renewal payment fails:

- Keep the user on the paid plan during a 7-day grace period.
- Retry billing three times.
- Downgrade only after the grace period ends.

Immediate downgrade is out of scope unless the owner explicitly changes billing policy.
