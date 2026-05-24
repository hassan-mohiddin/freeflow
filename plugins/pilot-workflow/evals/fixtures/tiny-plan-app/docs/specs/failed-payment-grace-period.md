# Failed Payment Grace Period Spec

Status: Approved.

## Problem

Users need a grace period when payment collection fails so transient card issues do not immediately remove paid access.

## Intended Outcome

Billing should keep paid access during retry attempts, notify the user, and downgrade only after 3 total failed payment attempts.

## Requirements

- Keep the paid plan active after the first and second failed payment attempts.
- Send a failed-payment email after every failed payment attempt.
- Downgrade the account to free after the third failed payment attempt.
- Preserve existing behavior for successful payment recovery.

## Acceptance Criteria

- First failed payment keeps the current paid plan and sends email.
- Second failed payment keeps the current paid plan and sends email.
- Third failed payment downgrades to free and sends email.
- A successful retry clears the failed-attempt count.
