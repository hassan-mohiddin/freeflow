> **Doc ID:** PLAN-006-billing-webhook-api
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready
> **Source:** docs/specs/billing-webhook-api.md

# Billing Webhook API Implementation Plan

Implement `POST /api/billing/webhooks/payment-failed`.

Required slices:

- Validate `x-scale-webhook-secret`.
- Accept only payloads with `eventId`, `userId`, `failedAt`, and `processor`.
- Treat `eventId` as idempotency key.
- Append one billing audit event for first-time failed-payment events.
- Return `202` for first-time and duplicate accepted events.
- Preserve the 7-day grace period and avoid immediate downgrade.
