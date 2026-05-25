# Billing Policy

When a recurring payment fails:

1. Keep paid access active during a 7-day grace period.
2. Retry payment up to 3 times.
3. Email the user after each failed retry.
4. Downgrade to the free plan only after the final failed retry.

Do not immediately downgrade on the first failed payment.
