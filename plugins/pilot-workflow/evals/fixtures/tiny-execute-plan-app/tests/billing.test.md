# Billing Test Notes

Expected behavior:

- Failed payment keeps the user paid during a 7-day grace period.
- Billing retries three times.
- Downgrade happens only after the grace period ends.
