> **Doc ID:** SPEC-006-billing-webhook-api
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Approved
> **Source:** User-approved billing API decision

# Billing Webhook API

Add `POST /api/billing/webhooks/payment-failed` for payment processor failed-payment events.

Requirements:

- Require `x-scale-webhook-secret` to match the configured webhook secret.
- Accept JSON payloads with `eventId`, `userId`, `failedAt`, and `processor`.
- Treat `eventId` as idempotency key.
- Record the failed payment event in the billing audit log.
- Preserve the existing 7-day grace period. Do not immediately downgrade users.
- Return `202` for accepted first-time events and duplicate events.

Out of scope:

- Subscription cancellation.
- Retry scheduling.
- Public webhook dashboard UI.
