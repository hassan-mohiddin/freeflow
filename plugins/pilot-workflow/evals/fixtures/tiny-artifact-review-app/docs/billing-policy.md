# Billing Policy

When a recurring payment fails:

1. Keep paid access active during a 7-day grace period.
2. Retry payment until there are 3 total failed payment attempts.
3. Email the user after each failed payment attempt.
4. Downgrade to the free plan only after the third failed payment attempt.

Do not immediately downgrade on the first failed payment.
