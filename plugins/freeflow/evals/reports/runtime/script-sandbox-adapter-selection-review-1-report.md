# Script Sandbox Adapter Selection Review 1

> **Date:** 2026-06-24
> **Status:** Conditional pass for adapter-family selection; execution remains blocked
> **Scope:** Artifact/security gate after JavaScript, Python, and jq sandbox proof spikes. No Freeflow script execution path is enabled.

## Decision Summary

Select the optional pinned **WASM/WASI adapter family** as the current script-sandbox direction.

Proof-backed partial candidates:

| Language | Candidate | Gate result | Current availability decision |
| --- | --- | --- | --- |
| JavaScript | `quickjs-wasi@3.0.1` | Required proof fixtures passed 9/9. | Candidate can proceed to adapter implementation planning after owner approval for optional package addition. |
| jq | `jq-wasm@1.2.0-jq-1.8.2` | Required proof fixtures passed 9/9 using Worker termination and bounded Worker-to-host output. | Candidate can proceed to adapter implementation planning after owner approval for optional package addition and security review of the in-Worker large-output caveat. |
| Python | `@bsull/eryx@0.5.0` | Blocked before Python execution by package/transitive compatibility. Proofs not run. | Unavailable. Do not add dependency until a compatible Eryx set or alternate Python WASM candidate passes proofs. |

This is not approval to wire execution into `freeflow_derive`. Slice 17 remains blocked until the owner explicitly approves the runtime package additions and the implementation/security review accepts the adapter boundaries.

## Source Evidence

- JavaScript proof report: `plugins/freeflow/evals/reports/runtime/quickjs-wasi-proof-spike-1-report.md`
  - `quickjs-wasi@3.0.1`
  - proofs passed 9/9
  - no repo dependency added
  - no script execution path enabled
- Python proof report: `plugins/freeflow/evals/reports/runtime/eryx-python-proof-spike-1-report.md`
  - `@bsull/eryx@0.5.0`
  - failed before Python execution because `@bytecodealliance/preview2-shim/filesystem` did not export `_setFileData`
  - proofs not run
- jq proof report: `plugins/freeflow/evals/reports/runtime/jq-wasm-proof-spike-1-report.md`
  - `jq-wasm@1.2.0-jq-1.8.2`
  - proofs passed 9/9
  - timeout proof uses Worker termination
  - output proof caps stdout/stderr before Worker result crosses to host
  - residual caveat: jq can generate large in-Worker strings before wrapper truncation

## Security Review Notes

### Accepted Direction

- Keep the public surface as `freeflow_derive operation.kind="script"` only.
- Keep script derive disabled by default.
- Keep no unsandboxed fallback.
- Keep runtime packages optional and pinned; Freeflow core should not add heavyweight runtime dependencies silently.
- Keep JavaScript, Python, and jq as the target language set. JavaScript and jq can become partial availability states, not a narrowed product direction.

### Required Before Execution Implementation

Before Slice 17 can enable any real adapter execution, the owner must decide:

1. Whether to add optional pinned adapter package support for `quickjs-wasi`.
2. Whether to add optional pinned adapter package support for `jq-wasm`.
3. Whether `jq-wasm`'s Worker boundary is acceptable even though jq can allocate large strings inside the Worker before wrapper truncation.
4. Whether Slice 17 should implement JavaScript first, jq first, or JavaScript and jq in one execution slice.

### Must Remain Blocked

- Python script derive remains unavailable.
- `@bsull/eryx` must not be added as a dependency yet.
- No script code may execute through Freeflow until an approved adapter implementation passes the proof-backed availability checks inside product code.
- No runtime artifacts may be downloaded during script execution.
- Raw script text must not be persisted.

## Recommended Slice 17 Entry

If the owner approves dependency/security decisions, execute Slice 17 as a narrow partial-availability implementation:

1. Add optional adapter discovery for approved package roots or installed optional dependencies.
2. Register only proof-backed languages.
3. Keep unsupported languages returning structured unavailable.
4. Preserve current disabled-by-default behavior.
5. Implement one adapter at a time unless the owner explicitly approves bundling JavaScript and jq.
6. Re-run adversarial proofs against the actual product adapter, not only the proof runner.
7. Keep exact recovery false for truncated script output.

## Current Gate State

- Adapter family selected: WASM/WASI with optional pinned adapters.
- JavaScript: proof-backed candidate, not product-enabled.
- jq: proof-backed candidate with security caveat, not product-enabled.
- Python: unavailable.
- Slice 17: still blocked pending explicit owner dependency/security approval.
