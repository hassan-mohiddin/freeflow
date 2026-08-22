# QuickJS Script Derive Execution Report 1

> **Date:** 2026-06-24
> **Status:** Passed QuickJS-only execution smoke
> **Scope:** Partial Slice 17 execution engine. JavaScript can execute only through an explicitly registered/provided QuickJS adapter; script derive remains disabled by default.

## What Changed

- Added dependency-free QuickJS adapter support in router core.
- Adapter loading is explicit. The Pi adapter discovers QuickJS only when `FREEFLOW_QUICKJS_WASI_ROOT` points to an installed `quickjs-wasi` package root.
- No `package.json` dependency was added.
- No runtime artifact is downloaded by Freeflow.
- Python remains unavailable.
- jq remains proof-backed but not product-enabled in this slice.

## Execution Boundary

QuickJS exposes only these host APIs to guest JavaScript:

- `readText(alias)` — reads copied vault-source input by alias.
- `writeText(text)` — writes to captured stdout.
- `console.log(...)` — writes bounded stdout.
- `console.error(...)` — writes bounded stderr.

The adapter does not expose `process`, `require`, host filesystem APIs, `fetch`, package loading, repo paths, vault paths, or home paths.

## Verification Evidence

### Product-path smoke

A local smoke used the temp-installed package root:

```text
/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/quickjs-wasi
```

It executed `freeflowDerive` with:

- `scriptDerive.enabled=true`,
- `languages=["javascript"]`,
- `network="off"`,
- one vault source alias `log`,
- a JavaScript script that filtered source lines containing `ERROR`.

Result excerpt:

```json
{
  "toolStatus": "ok",
  "outputId": "ffout_1b9511127021d96d579578b7",
  "summary": "Script derive javascript completed with 10 stdout bytes and 0 stderr bytes.",
  "operation": {
    "kind": "script",
    "language": "javascript",
    "codeSha256": "sha256_c5834b4ad4d0974718d47258aa6bf8fc633d08c45433f65a936b15986076226b"
  }
}
DERIVED="ERROR beta"
```

Raw script text was not persisted in the routed result; the operation records only `codeSha256`.

### Output cap regression smoke

A real QuickJS product-path smoke used a configured adapter proof cap of `4096` bytes and a per-call `limits.maxOutputBytes=10` with:

```js
writeText('x'.repeat(100));
```

Result excerpt:

```json
{
  "toolStatus": "ok",
  "failure": {
    "kind": "derive_execution_failure",
    "message": "Script derive javascript failed. QuickJS execution exceeded maxOutputBytes. stdoutBytes=10 stderrBytes=0."
  },
  "deriveExecution": {
    "status": "failed",
    "failureKind": "derive_execution_failure"
  },
  "persistence": {
    "status": "not_persisted",
    "recoverability": "none"
  }
}
```

This confirms truncated output is not persisted as a successful exact result.

### Pi status smoke

With `FREEFLOW_QUICKJS_WASI_ROOT=/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/quickjs-wasi`, `buildFreeflowStatusReport` reports:

```json
{
  "enabled": false,
  "adapterAvailable": true,
  "adapterStatus": "available",
  "availableLanguages": ["javascript"],
  "registeredAdapters": [{ "id": "quickjs-wasi", "version": "3.0.1", "languages": ["javascript"] }],
  "executionStatus": "disabled"
}
```

This proves explicit adapter discovery does not enable script execution while `scriptDerive.enabled` remains false.

### Targeted tests

```text
npm run build:router && node --test router/tests/derive.test.js router/tests/script-sandbox.test.js
```

Result:

```text
29 targeted tests passed
```

Coverage added:

- script derive remains disabled by default,
- source resolution still returns adapter unavailable without a registered adapter,
- a proof-backed registered adapter can execute and persist exact derived stdout,
- adapter timeout/failure returns structured `derive_execution_failure`,
- output-limit failures return structured `derive_execution_failure` without exact recovery,
- proof fixture coverage remains complete,
- invalid `FREEFLOW_QUICKJS_WASI_ROOT` fails closed as adapter unavailable.

### Full router suite

```text
npm run test:router
```

Result:

```text
273 tests passed
```

## Current Availability

| Language | Status |
| --- | --- |
| JavaScript | Product execution path implemented for explicitly registered/provided QuickJS adapter roots; disabled by default. |
| Python | Unavailable. Eryx candidate blocked before proofs. |
| jq | Proof-backed candidate only; not product-enabled in this slice. |

## Remaining Gates

Before public docs can present script derive as generally available:

1. Add durable setup/config UX for optional adapter installation if desired.
2. Run full router suite and focused review for this implementation slice.
3. Decide whether to product-enable jq after separate security review of the Worker-boundary large-output caveat.
4. Find or fix a Python WASM candidate.
