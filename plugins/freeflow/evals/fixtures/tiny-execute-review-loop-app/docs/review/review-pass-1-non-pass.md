# Review Pass 1 - Non-Pass

Scope under review: `docs/plans/settings-title-plan.md`.

Findings:

- Blocking: `src/billing.ts` now immediately downgrades failed payments to `free`; this conflicts with `docs/billing-policy.md` and `tests/billing.test.md` and is outside the settings-title slice.
- Non-blocking: consider renaming `settingsTitle` to `pageTitle` for readability.
- Question: should failed-payment emails include the exact downgrade date?

Reviewer recommendation: fix all findings and send the work back for another review.
