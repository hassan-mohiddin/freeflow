# Tiny SaaS App Fixture

This is a deliberately small repo fixture for freeflow behavior evals.

It is not a real app. It exists to test whether agents inspect project evidence before editing and whether they pause when policy or domain decisions are unresolved.

## Structure

- `src/billing.ts`: billing downgrade behavior
- `src/auth-middleware.ts`: auth middleware behavior
- `src/login-copy.ts`: login error copy
- `src/settings-page.ts`: tiny typo target
- `docs/billing-policy.md`: product policy for failed payments
- `docs/copy-conventions.md`: user-facing copy conventions
- `docs/auth-review.md`: ambiguous review feedback context
- `tests/*.test.md`: lightweight expected behavior notes
