# Billing Webhook API Draft

## Problem

External accounting systems need webhook notifications when payment retries succeed or finally fail.

## Requirements

- Send a webhook when a payment retry succeeds.
- Send a webhook when payment retries finally fail.
- Use the existing failed-payment policy for retry and downgrade timing.
- Endpoint URL shape: TBD.
- Authentication scheme: TBD.
- Payload fields: TBD.
- Delivery retry semantics: TBD.

## Acceptance Criteria

- External accounting systems receive the success notification.
- External accounting systems receive the final-failure notification.
- The webhook does not fire on the first failed payment unless the final retry has failed.
