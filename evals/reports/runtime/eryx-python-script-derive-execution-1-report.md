# Eryx Python Script Derive Execution Report 1

> **Date:** 2026-06-24
> **Status:** Passed Eryx Python execution smoke
> **Scope:** Slice 17 execution engine. Python can execute only through an explicitly registered/provided Eryx adapter; script derive remains disabled by default.

## Summary

- Added dependency-free Eryx Python adapter support in router core.
- Adapter loading is explicit. The Pi adapter discovers Python only when `FREEFLOW_ERYX_ROOT` points to an installed `@bsull/eryx` package root.
- Eryx requires the parent Node process to run with `--experimental-wasm-jspi`.
- No `package.json` dependency was added.
- No runtime artifacts are installed, downloaded, or vendored during execution.
- Script derive remains disabled by default.

## Adapter Surface

The Eryx adapter runs CPython/WASM inside a Node Worker. The guest Python program receives:

- `read_text(alias)` — reads copied vault-source input by alias,
- `write_text(text)` — writes to captured stdout,
- `sources` — a Python dict keyed by source alias.

The adapter does not expose host repo paths, home paths, vault paths, ambient environment variables, process APIs, package loading, direct host filesystem access, or network APIs.

The adapter uses a temp-copied Eryx package tree and rewrites Eryx's preview2-shim imports to browser/in-memory preview2 shims. It also replaces the temp-copied Eryx network shim with a deny-only shim that records TCP/TLS `not-permitted` events during proofs.

Timeouts are enforced by Worker termination. Output is capped before the Worker result crosses to the host. If output is truncated, execution returns a structured `derive_execution_failure`; truncated stdout is not persisted as an exact result.

Residual caveat: Eryx/Python can still generate large strings inside the Worker before wrapper truncation. The Worker uses resource limits and timeout termination, but output cap enforcement is not streaming inside Python itself.

## Product Path

Execution requires all of:

- `scriptDerive.enabled=true`,
- `scriptDerive.languages` includes `python`,
- a proof-backed Eryx adapter is registered/provided,
- Pi can discover `FREEFLOW_ERYX_ROOT`, or the caller passes the adapter directly,
- the parent Node process has `--experimental-wasm-jspi`,
- `network="off"`,
- raw script persistence remains disabled.

## Actual Adapter Proof Selection

With package root:

```text
/tmp/freeflow-eryx-proof-run-87KaRW/node_modules/@bsull/eryx
```

`probeScriptSandboxAdapters` reported:

```json
{
  "probeStatus": "available",
  "availableLanguages": ["python"],
  "passed": 9,
  "failed": 0
}
```

Command evidence: `ffout_b223c00fa8c1f7b82ce6ab15`.

The dedicated proof report is `evals/reports/runtime/eryx-python-proof-spike-2-report.md`.

## Product Execution Smoke

A real `freeflowDerive` smoke used a vaulted stdout source:

```text
alpha
```

and Python code:

```python
write_text(read_text('log').upper())
```

Result excerpt:

```json
{
  "deriveStatus": "ok",
  "failure": null,
  "outputId": "ffout_569831f03c6f0d79149a2c58",
  "raw": "ALPHA",
  "leakedScript": false
}
```

Raw script text was not persisted in the routed result; the operation records only `codeSha256`.

Command evidence: `ffout_b223c00fa8c1f7b82ce6ab15`.

## Output Cap Regression Smoke

A real Eryx product-path smoke used a configured adapter proof cap of `4096` bytes and a per-call `limits.maxOutputBytes=10` with:

```python
write_text('x' * 100)
```

Result excerpt:

```json
{
  "failure": "derive_execution_failure",
  "message": "Script derive python failed. Eryx Python execution exceeded maxOutputBytes. stdoutBytes=5 stderrBytes=0.",
  "outputId": null,
  "recoverability": "none"
}
```

This confirms truncated Python output is not persisted as a successful exact result. The adapter splits the output cap between stdout and stderr so both streams retain bounded evidence under flood conditions.

Command evidence: `ffout_ef09471811902881360f0416`.

## Timeout Smoke

A real Eryx timeout smoke used:

```python
while True:
    pass
```

with per-call `limits.timeoutMs=250`.

Result excerpt:

```json
{
  "failure": "derive_execution_failure",
  "message": "Script derive python timed_out. Eryx Python execution exceeded timeoutMs. stdoutBytes=0 stderrBytes=0.",
  "outputId": null,
  "recoverability": "none"
}
```

Command evidence: `ffout_ef09471811902881360f0416`.

## Targeted Tests

```text
npm run build && node --test router/tests/derive.test.js router/tests/script-sandbox.test.js router/tests/pi-extension-derive.test.js router/tests/pi-extension.test.js
```

Result:

```text
69 passed, 1 skipped
```

The skipped test is the optional Eryx integration path, which requires `FREEFLOW_ERYX_ROOT` and Node `--experimental-wasm-jspi`.

Coverage included:

- script derive remains disabled by default through the Pi public tool,
- invalid `FREEFLOW_ERYX_ROOT` fails closed as adapter unavailable,
- Pi status and derive wiring still build and pass focused tests,
- proof fixture coverage remains complete.

## Optional Eryx Integration Test

```text
FREEFLOW_ERYX_ROOT=/tmp/freeflow-eryx-proof-run-87KaRW/node_modules/@bsull/eryx \
  node --experimental-wasm-jspi --test router/tests/derive.test.js --test-name-pattern "Eryx adapter"
```

Result:

```text
25 tests passed, including:
✔ freeflowDerive script operation executes Python through discovered Eryx adapter when configured
```

Command evidence: `ffout_b1fbb65e96d814268c0aa0c2`; post-full-tree-fingerprint rerun evidence: `ffout_f7ccfed70b4323788ce921c7`; post-mutation-check rerun evidence: `ffout_4a0268f37ecc9436804fcab5`.

## Pi Status Smoke

With `FREEFLOW_ERYX_ROOT=/tmp/freeflow-eryx-proof-run-87KaRW/node_modules/@bsull/eryx` and Node `--experimental-wasm-jspi`, `buildFreeflowStatusReport` reports:

```json
{
  "enabled": false,
  "executionStatus": "disabled",
  "adapterAvailable": true,
  "adapterStatus": "available",
  "availableLanguages": ["python"],
  "registeredAdapters": [
    { "id": "eryx-python", "version": "0.5.0", "languages": ["python"] }
  ]
}
```

This proves explicit adapter discovery does not enable script execution while `scriptDerive.enabled` remains false.

Command evidence: `ffout_d321f5f2d24d548d935e5a9f`.

## Full Router Suite

```text
env -u FREEFLOW_ERYX_ROOT npm run test:router
```

Result:

```text
278 passed, 1 skipped
```

The skipped test is the optional Eryx integration path.

Command evidence: `ffout_8b08d9c1893023bb3a74c702`; post-full-tree-fingerprint rerun evidence: `ffout_002c6ed4ff25a713538bb738`; post-mutation-check rerun evidence: `ffout_d88f87f47353dfa6351e22a9`.

## Current Availability

| Language | Status |
| --- | --- |
| JavaScript | Product execution path implemented for explicitly registered/provided QuickJS adapter roots; disabled by default. |
| Python | Product execution path implemented for explicitly registered/provided Eryx adapter roots plus Node JSPI; disabled by default. |
| jq | Product execution path implemented for explicitly registered/provided jq-wasm adapter roots; disabled by default. |

## Remaining Gates

Before presenting script derive as generally available:

1. Keep setup UX explicit: Freeflow must not install or download adapter packages.
2. Run full router suite and focused review for this implementation slice.
3. Document Eryx's JSPI and in-Worker large-output caveats in user-facing docs.
4. Keep network, raw-script persistence, direct repo inputs, and output-file collection disabled unless separate proof/review approves them.
