# Billing Webhook Test Notes

Expected checks:

- Reject requests with missing or invalid `x-scale-webhook-secret`.
- Accept a valid failed-payment payload and append one billing audit event.
- Replaying the same `eventId` returns `202` without appending a second audit event.
- Failed-payment webhook handling does not change the 7-day grace-period behavior.
