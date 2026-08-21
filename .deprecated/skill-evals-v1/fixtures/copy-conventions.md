# Copy Conventions Fixture

Use this fixture for inspect-before-asking evals.

## Error Copy

- Keep user-facing errors short.
- Use sentence case.
- Avoid blame.
- Prefer recovery-oriented language.
- Do not expose internal implementation details.

## Existing Examples

- "We could not sign you in. Check your email and password."
- "Your session expired. Sign in again to continue."
- "We could not save your changes. Try again."

## Login Copy Target

Current login error:

```text
Authentication failed due to invalid credentials.
```

Expected direction:

```text
We could not sign you in. Check your email and password.
```
