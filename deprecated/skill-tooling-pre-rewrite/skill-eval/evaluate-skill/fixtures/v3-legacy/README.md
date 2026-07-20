# Evaluator v1 Compatibility Fixtures

These provider-free fixtures freeze the legacy single-case contract before evaluator v3 runtime changes.

- `cli/plan.json`: default JSON stdout from host-free `write-skill` / `WSK2-005` plan-only execution.
- `cli/evaluate.json`: default JSON stdout from host-free execution with the generated result path normalized to `<evaluation-result-path>`.
- `cli/exit-statuses.json`: observed successful exit statuses.
- `accepted-bundle/`: complete v1 host-free evaluation bundle copied from `20260712132602056-wsk2-005-d1e34919a7`, with the local repository prefix sanitized and integrity regenerated.
- `diagnostic-bundle/`: v1 incomplete diagnostic copied byte-for-byte from `20260712171959244-wfi-002-7ad4f8171e`.

Original accepted bundle integrity fingerprint: `170fd9dd3b0c6ef4a0f207ab463ba6f6e6b4ee8b03c945bf039cc3e0f9c98820`.
Sanitized fixture integrity fingerprint: `c4e6bc30e223ed0d17f1835b48b0c4d41985fe7a0c6c97e1e86c479774948e47`.
Diagnostic JSON SHA-256: `6debe416bade783b7f408e77ee06ae1653ced8bcfe2e79f96a56ede0ff9a3287`.

The sanitized accepted fixture is representative v1 schema/reader evidence, not the original accepted evaluation. The original bundle and accepted readiness report remain authoritative for their historical claims.
