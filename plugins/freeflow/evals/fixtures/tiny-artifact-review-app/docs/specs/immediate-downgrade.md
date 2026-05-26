# Immediate Downgrade Spec

## Problem

Users should lose paid access immediately after a failed payment.

## Requirements

- Downgrade users to the free plan after the first failed payment.
- Do not keep users in a grace period after a failed payment.
- Email users after the downgrade.

## Acceptance Criteria

- First failed payment changes the plan to `free`.
- First failed payment sets access to `downgraded`.
- Billing tests are updated to remove grace-period expectations.
