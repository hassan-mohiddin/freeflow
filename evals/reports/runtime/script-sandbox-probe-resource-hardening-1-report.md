# Script Sandbox Probe Resource Hardening Report 1

> **Date:** 2026-06-24
> **Status:** Passed targeted verification
> **Scope:** Follow-up hardening after QuickJS and jq script-derive execution slices.

## Trigger

During implementation and proof smokes, repeated full router suites plus sandbox proof runs caused high local CPU load. The jq adapter caveat also exposed a related risk: output is capped before crossing the Worker boundary, but jq can still allocate inside the Worker before wrapper truncation.

## Root Cause / Risk

Two resource costs were unnecessarily high:

1. The shared `stdout_stderr_bounded` proof fixtures used runaway loop counts (`1000000` for JavaScript/Python and `100000` for jq). The adapters stop or truncate, but the fixture text encouraged far more output generation than needed to prove cap enforcement.
2. Adapter proof probes could rerun repeatedly in the same Pi process. `freeflow_status` and script adapter selection both need proof-backed availability, but repeating adversarial proofs for the same adapter binary/hash and probe limits wastes CPU.

## Changes

- Reduced `stdout_stderr_bounded` proof fixture loops to `1000` iterations for JavaScript, Python, and jq.
  - This still exceeds normal proof output caps.
  - It avoids multi-megabyte raw jq stdout/stderr generation during proof runs.
- Lowered jq probe timeout from `500ms` to `250ms`.
  - Product execution still uses configured/per-call script limits.
  - The proof only needs to show the adapter can terminate runaway jq execution.
- Added per-process proof-result caches:
  - QuickJS cache key: package version, WASM hash, probe timeout, probe output cap, network mode.
  - jq cache key: package version, entrypoint hash, probe timeout, probe output cap, network mode.
- Added a regression test that rejects future `stdout_stderr_bounded` fixtures containing five-or-more-digit loop counts.
- Fixed a flaky Pi status test that assumed the default user vault index was empty. The default vault is user-global, so tests now assert the index shape rather than `entryCount === 0`.

## Preserved Safety Properties

- Script derive remains disabled by default.
- No unsandboxed fallback was added.
- Adapter availability still requires every required proof to pass.
- Caches are keyed by adapter content hash and probe limits, not just package root strings.
- Output-limit failures remain structured failures with no exact recovery.
- Python remains unavailable.

## Verification

Targeted check passed:

```text
npm run build && node --test router/tests/script-sandbox.test.js router/tests/derive.test.js router/tests/pi-extension.test.js
```

Result: 62/62 targeted tests passed.

Additional note: the earlier temporary optional adapter package roots under `/tmp/freeflow-sandbox-candidates-xVAJBl` had been cleaned up before this follow-up, so this report does not claim a fresh real QuickJS/jq package-root smoke after hardening. The product execution smokes from the immediately preceding QuickJS and jq reports remain the adapter proof/execution evidence; this slice reduces repeat probe cost and guards against runaway fixture sizes.
