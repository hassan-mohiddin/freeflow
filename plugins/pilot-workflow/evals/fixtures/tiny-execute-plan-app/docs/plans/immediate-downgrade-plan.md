# Immediate Downgrade Plan

Source spec: `docs/specs/failed-payment-grace-period.md`

## Slice 1

Change `src/billing.ts` so `failedPaymentOutcome()` immediately returns a free plan after the first failed payment.

Check:

- Inspect `src/billing.ts`.
