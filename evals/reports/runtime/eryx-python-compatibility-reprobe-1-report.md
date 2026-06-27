# Eryx Python Compatibility Reprobe Report

> **Date:** 2026-06-24
> **Status:** Still unavailable for product execution; temp-only package/exports workaround looks viable enough for a dedicated proof spike
> **Scope:** Compatibility-only evaluation. No Freeflow script execution path is enabled.

## Candidate

- Package: `@bsull/eryx@0.5.0`
- Transitive shim installed by npm: `@bytecodealliance/preview2-shim@0.17.9`
- Target: Python / CPython WASM for `freeflow_derive operation.kind="script"`
- Probe location: `/tmp/freeflow-eryx-compat-D1q0Dr`
- Install policy: temporary directory only; no repo dependency added

## Result

The current npm package still fails under default Node package resolution before Python code can run:

```text
SyntaxError: The requested module '@bytecodealliance/preview2-shim/filesystem' does not provide an export named '_setFileData'
```

This keeps Python script derive **unavailable** in product code.

A temp-only patch that rewrote Eryx's generated preview2-shim imports to the shim's browser implementations imported successfully and executed small Python smokes. This suggests the blocker is likely package/export-condition integration, not a fundamental inability to run Eryx under Node.

## Evidence

### Default import remains blocked

- Temp package root: `/tmp/freeflow-eryx-compat-D1q0Dr/node_modules/@bsull/eryx`
- Eryx version: `0.5.0`
- Preview2 shim version: `0.17.9`
- Vault evidence: `ffout_5981d87e952d39c35ad8bdc1`

Default import probe:

- Command: `node --experimental-wasm-jspi --input-type=module`
- Vault evidence: `ffout_30b56712c13ca7cfe49c700e`
- Result: failed at module import.

Failure excerpt:

```text
file:///private/tmp/freeflow-eryx-compat-D1q0Dr/node_modules/@bsull/eryx/index.js:27
import { _setFileData } from "@bytecodealliance/preview2-shim/filesystem";
         ^^^^^^^^^^^^
SyntaxError: The requested module '@bytecodealliance/preview2-shim/filesystem' does not provide an export named '_setFileData'
```

### Cause shape

`@bytecodealliance/preview2-shim@0.17.9` exports `./*` with `node` before `default`:

```json
"./*": {
  "types": "./types/*.d.ts",
  "node": "./lib/nodejs/*.js",
  "default": "./lib/browser/*.js"
}
```

Under Node, `@bytecodealliance/preview2-shim/filesystem` resolves to the Node filesystem shim. That shim exposes `_setPreopens`, `_addPreopen`, and related host-preopen helpers, but not `_setFileData`.

The browser filesystem shim does expose `_setFileData` and `_getFileData`, which matches Eryx's high-level JS package expectation.

Eryx's generated binding also imports preview2 shims through bare package subpaths:

```text
@bytecodealliance/preview2-shim/cli
@bytecodealliance/preview2-shim/clocks
@bytecodealliance/preview2-shim/filesystem
@bytecodealliance/preview2-shim/io
@bytecodealliance/preview2-shim/random
```

So a product adapter must not simply rely on default Node resolution.

### Temp browser-shim patch imports

A temp-only patch rewrote Eryx imports to explicit browser-shim files under the installed `preview2-shim` package. The first relative-path attempt failed, then the corrected patch imported successfully.

- Failed wrong-path patch evidence: `ffout_334568e4abb050aa1867960b`
- Corrected patch import evidence: `ffout_2139be5a08101cacdcde58d0`

Successful import excerpt:

```json
{
  "status": "import_ok",
  "exports": [
    "Sandbox",
    "_fileTree",
    "execute",
    "setCallbackHandler",
    "setCallbacks",
    "setOutputHandler",
    "setResultVariable",
    "setTraceHandler"
  ]
}
```

### Tiny execution and safety smoke

After the temp browser-shim import patch, a tiny smoke ran:

- `hello`: success
- `env`: success with fixed Python runtime env only: `PYTHONHOME`, `PYTHONPATH`, `PYTHONUNBUFFERED`
- `host_fs_denied`: error reading `/workspace/package.json`
- `network_denied`: error opening `https://example.com`
- Vault evidence: `ffout_488ddd54b10245f04b399cdd`
- Filtered structured-result evidence: `ffout_b3509ea5a72f0481f58b7f81`

The run emitted many `[filesystem] FLAGS FOR` / `[filesystem] RENAME AT` debug lines from the preview2 browser filesystem shim. A product adapter would need to suppress or strictly bound that output before routing.

### Worker timeout smoke

The high-level Eryx JS API does not expose resource-limit or timeout options. A Freeflow adapter would need host-level isolation.

A tiny Node Worker smoke showed that an infinite Python loop can be stopped by terminating the Worker from the host after 500ms:

- Explicit Worker `execArgv: ["--experimental-wasm-jspi"]` is rejected by Node: `ffout_735b62ec823a3614f4a9f5a2`
- When the parent Node process starts with `--experimental-wasm-jspi`, the Worker inherits enough support and terminates successfully: `ffout_cb09bc89aa0f8237c1fe50b2`

Success excerpt:

```json
{"status":"terminated_after_timeout","terminateCode":1}
```

## Required Proof Status

| Proof | Result | Reason |
| --- | --- | --- |
| env_access_denied | smoke-pass, not full proof | Temp browser-shim run exposed only fixed Python runtime env values, but full proof suite not run. |
| home_access_denied | not run | Needs full proof spike. |
| repo_access_denied | smoke-pass, not full proof | `/workspace/package.json` read failed, but full proof suite not run. |
| vault_access_denied | not run | Needs full proof spike. |
| network_access_denied | smoke-pass, not full proof | `urllib.request` failed, but full proof suite not run. |
| input_read_only | not run | Needs adapter design for mounted/copied input. |
| output_escape_denied | not run | Needs adapter design for output collection. |
| stdout_stderr_bounded | not run | Preview2 browser shim emits noisy debug logs; output caps must be proof-tested. |
| timeout_enforced | smoke-pass, not full proof | Worker termination stopped `while True`, but full proof suite not run. |

## Decision

Do not enable Python script derive yet.

Do not add `@bsull/eryx` to repo dependencies yet.

Eryx can move from "blocked before import" to a dedicated proof spike only if the next slice explicitly chooses one of these paths:

1. Wait for upstream Eryx/preview2-shim packaging to expose the intended in-memory filesystem path under Node.
2. Build a Freeflow-local temp-copy wrapper that rewrites or aliases Eryx's preview2-shim imports to browser/in-memory shims from an explicit `FREEFLOW_ERYX_ROOT` package root, then runs in a Worker.
3. Use a different Python WASM candidate.

Any product adapter must still pass all nine script-sandbox proofs, run only from an explicit package root, avoid runtime downloads, avoid raw script persistence, enforce output caps before routing, and return structured unavailable/no-recovery failures when proof or execution fails.

## Follow-up Risks

- Eryx JS API lacks direct resource-limit configuration; host Worker termination is necessary and memory isolation remains to be proven.
- Preview2 browser filesystem debug logs can flood stdout unless suppressed or capped.
- A temp import-rewrite wrapper is more invasive than the QuickJS/jq package-root adapters and needs focused security review.
- Node requires parent process startup with `--experimental-wasm-jspi`; Worker-level `execArgv` cannot add that flag after the fact.
- Browser/in-memory shim use must be audited against Eryx generated bindings so no host filesystem preopens or ambient env/network capabilities are accidentally selected.
