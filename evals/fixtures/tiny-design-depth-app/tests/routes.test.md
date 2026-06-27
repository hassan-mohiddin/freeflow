# Route Tests

Current tests mock `sendEmail`, `sendSms`, and `logNotificationFailure` directly for every route.

The tests know:

- retry counts,
- fallback ordering,
- telemetry event names,
- provider helper names.

This coupling is intentional fixture evidence for the design-for-depth eval.
