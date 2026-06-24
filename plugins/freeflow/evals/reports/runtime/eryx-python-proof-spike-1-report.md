# Eryx Python Sandbox Proof Spike Report

> **Date:** 2026-06-24
> **Status:** Blocked before sandbox proofs
> **Scope:** Compatibility-only evaluation. No Freeflow script execution path is enabled.

## Candidate

- Package: `@bsull/eryx@0.5.0`
- Target: Python / CPython WASM
- License: MIT OR Apache-2.0
- Candidate role: primary Python member of the multi-language WASM/WASI adapter family
- Temp install policy: temporary directories only; no repo dependencies added

## Result

`@bsull/eryx@0.5.0` could not be imported far enough to execute Python proof fixtures.

The failure occurs before Python code runs:

```text
SyntaxError: The requested module '@bytecodealliance/preview2-shim/filesystem' does not provide an export named '_setFileData'
```

This means the candidate is currently **unproven/unavailable**, not sandbox-proof failed. The required Python proofs were not executed.

## Evidence

### Existing temp install

- Package root: `/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/@bsull/eryx`
- Installed transitive dependency: `@bytecodealliance/preview2-shim@0.17.9`
- Probe command used `node --experimental-wasm-jspi` and failed at module import.
- Vault evidence: `ffout_bbe8fe7589be6c905b70681c`

Failure excerpt:

```text
import { _setFileData } from "@bytecodealliance/preview2-shim/filesystem";
         ^^^^^^^^^^^^
SyntaxError: The requested module '@bytecodealliance/preview2-shim/filesystem' does not provide an export named '_setFileData'
```

### Explicit transitive pin probe

A separate temp-only install pinned `@bytecodealliance/preview2-shim@0.17.0`:

```text
freeflow-eryx-pin-vugjrk@1.0.0 /private/tmp/freeflow-eryx-pin-vUgJRk
├─┬ @bsull/eryx@0.5.0
│ └── @bytecodealliance/preview2-shim@0.17.0 deduped
└── @bytecodealliance/preview2-shim@0.17.0
```

It failed the same way under `Node.js v25.8.1` with `--experimental-wasm-jspi`.

- Vault evidence: `ffout_0dba96a3cde626f6c462aef8`

Failure excerpt:

```text
import { _setFileData } from "@bytecodealliance/preview2-shim/filesystem";
         ^^^^^^^^^^^^
SyntaxError: The requested module '@bytecodealliance/preview2-shim/filesystem' does not provide an export named '_setFileData'
```

## Required Proof Status

| Proof | Result | Reason |
| --- | --- | --- |
| env_access_denied | not run | Candidate import failed before Python execution. |
| home_access_denied | not run | Candidate import failed before Python execution. |
| repo_access_denied | not run | Candidate import failed before Python execution. |
| vault_access_denied | not run | Candidate import failed before Python execution. |
| network_access_denied | not run | Candidate import failed before Python execution. |
| input_read_only | not run | Candidate import failed before Python execution. |
| output_escape_denied | not run | Candidate import failed before Python execution. |
| stdout_stderr_bounded | not run | Candidate import failed before Python execution. |
| timeout_enforced | not run | Candidate import failed before Python execution. |

## Decision

Do not add `@bsull/eryx` as a Freeflow dependency yet.

Keep Python script derive unavailable until one of these is true:

1. A compatible Eryx package/transitive dependency set imports successfully and then passes every Python proof fixture.
2. A different Python WASM candidate is selected, inventoried, and proof-tested.
3. The owner explicitly approves revising the Python adapter plan.

## Notes

- This report does not weaken the product target. JavaScript, Python, and jq remain target languages.
- This report does not enable script execution.
- No optional adapter package was added to `package.json`.
- No runtime download during script execution was introduced.
