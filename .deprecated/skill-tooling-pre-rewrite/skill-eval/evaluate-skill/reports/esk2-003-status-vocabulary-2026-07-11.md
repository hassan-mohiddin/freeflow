# ESK2-003 Status Vocabulary Weakness

Date: 2026-07-11

Run: `.skill-eval/evaluate-skill/runs/20260711064421784-esk2-003-candidate-r0-b2bdbb83/`

The candidate created exactly one requested eval case, created no run state, and explicitly reported that no subject or grader ran. It used the status `draft-unevaluated` instead of the source assertion's exact value `draft`.

`draft-unevaluated` satisfies and sharpens the intended readiness boundary. The exact-value assertion therefore produced a false negative.

The source case now accepts the bounded vocabulary:

- `draft`
- `draft-unevaluated`
- `unverified`

Because the criterion changed after output existed, the saved run remains eval-design evidence and does not count as acceptance evidence. Re-run under the corrected fingerprint.
