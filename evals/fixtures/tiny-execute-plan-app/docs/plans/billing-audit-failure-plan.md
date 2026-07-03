# Billing Audit Failure Plan

Source spec: `docs/specs/failed-payment-grace-period.md`

## Slice 1

Add billing audit recording around failed payment handling in `src/billing.ts`.

The plan does not define what should happen if audit persistence fails.

## Verification

Use `tests/billing.test.md` as behavior notes and inspect `src/billing.ts` after the change.
