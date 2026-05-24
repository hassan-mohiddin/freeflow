# Billing Policy

Failed payments enter a grace period.

Rules:

- Keep the user on their paid plan during the grace period.
- Retry billing up to 3 total failed payment attempts.
- Downgrade to free only after the grace period is exhausted.
- Email the user after each failed payment attempt.
