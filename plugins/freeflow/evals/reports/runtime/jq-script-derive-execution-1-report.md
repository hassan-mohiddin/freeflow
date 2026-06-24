# jq Script Derive Execution Report 1

> **Date:** 2026-06-24
> **Status:** Passed jq execution smoke
> **Scope:** Partial Slice 17 execution engine. jq can execute only through an explicitly registered/provided jq-wasm adapter; script derive remains disabled by default.

## Summary

- Added dependency-free jq-wasm adapter support in router core.
- Adapter loading is explicit. The Pi adapter discovers jq only when `FREEFLOW_JQ_WASM_ROOT` points to an installed `jq-wasm` package root.
- No `package.json` dependency was added.
- No runtime artifacts are installed, downloaded, or vendored during execution.
- Python remains unavailable.

## Adapter Surface

The jq adapter runs `jq-wasm` inside a Node Worker. The guest jq program receives a JSON object keyed by source alias. For a source alias `log`, the jq program reads `.log`.

The adapter does not expose host repo paths, home paths, vault paths, ambient process APIs, package loading to guest jq, or network APIs.

Timeouts are enforced by Worker termination. Output is capped before the Worker result crosses to the host. If output is truncated, execution returns a structured `derive_execution_failure`; truncated stdout is not persisted as an exact result.

Residual caveat: `jq-wasm` can still generate large strings inside the Worker before wrapper truncation. The Worker uses resource limits and timeout termination, but output cap enforcement is not streaming inside jq itself.

## Product Path

Execution requires all of:

- `scriptDerive.enabled=true`,
- `scriptDerive.languages` includes `jq`,
- a proof-backed jq adapter is registered/provided,
- Pi can discover `FREEFLOW_JQ_WASM_ROOT`, or the caller passes the adapter directly,
- `network="off"`,
- raw script persistence remains disabled.

## Actual Adapter Proof Selection

With package root:

```text
/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/jq-wasm
```

`probeScriptSandboxAdapters` reported:

```json
{
  "adapterAvailable": true,
  "availableLanguages": ["jq"],
  "failedProofs": [],
  "passedProofs": [
    "env_access_denied",
    "home_access_denied",
    "repo_access_denied",
    "vault_access_denied",
    "network_access_denied",
    "input_read_only",
    "output_escape_denied",
    "stdout_stderr_bounded",
    "timeout_enforced"
  ],
  "reason": "jq-wasm passed every required jq sandbox proof.",
  "runtime": {
    "name": "jq-wasm",
    "version": "1.2.0-jq-1.8.2 entry:4a5bd373cb59"
  }
}
```

## Product Execution Smoke

A real `freeflowDerive` smoke used a vaulted stdout source:

```text
INFO alpha
ERROR beta
```

and jq code:

```jq
.log | split("\n") | map(select(test("ERROR"))) | .[]
```

Result excerpt:

```json
{
  "toolStatus": "ok",
  "operation": {
    "kind": "script",
    "language": "jq",
    "codeSha256": "sha256_e5e69ac26a62710aa0313ddaa13e6619c21bd0c1e2adffa0230b63de82c68c0c"
  },
  "summary": "Script derive jq completed with 12 stdout bytes and 0 stderr bytes.",
  "derived": "\"ERROR beta\"",
  "persistence": {
    "status": "vaulted",
    "recoverability": "exact"
  }
}
```

Raw script text was not persisted in the routed result; the operation records only `codeSha256`.

## Output Cap Regression Smoke

A real jq product-path smoke used a configured adapter proof cap of `4096` bytes and a per-call `limits.maxOutputBytes=10` with:

```jq
range(0; 1000) | "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Result excerpt:

```json
{
  "toolStatus": "ok",
  "failure": {
    "kind": "derive_execution_failure",
    "message": "Script derive jq failed. jq-wasm execution exceeded maxOutputBytes. stdoutBytes=10 stderrBytes=0."
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

This confirms truncated jq output is not persisted as a successful exact result.

## Timeout Smoke

A real jq timeout smoke used:

```jq
def loop: loop; loop
```

Result excerpt:

```json
{
  "toolStatus": "ok",
  "failure": {
    "kind": "derive_execution_failure",
    "message": "Script derive jq timed_out. jq-wasm execution exceeded timeoutMs. stdoutBytes=0 stderrBytes=0."
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

## Pi Status Smoke

With `FREEFLOW_JQ_WASM_ROOT=/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/jq-wasm`, `buildFreeflowStatusReport` reports:

```json
{
  "enabled": false,
  "executionStatus": "disabled",
  "adapterAvailable": true,
  "availableLanguages": ["jq"],
  "registeredAdapters": [
    { "id": "jq-wasm", "version": "1.2.0-jq-1.8.2", "languages": ["jq"] }
  ]
}
```

This proves explicit adapter discovery does not enable script execution while `scriptDerive.enabled` remains false.

## Tests

Targeted check passed:

```text
npm run build:router && node --test plugins/freeflow/router/tests/derive.test.js plugins/freeflow/router/tests/script-sandbox.test.js
```

Result: 32/32 targeted tests passed.

Coverage includes:

- script derive remains disabled by default,
- jq execution works through a registered proof-backed adapter,
- adapter timeout/failure returns structured `derive_execution_failure`,
- output-limit failures return structured `derive_execution_failure` without exact recovery,
- invalid `FREEFLOW_JQ_WASM_ROOT` fails closed as adapter unavailable.

## Current Availability

| Language | Status |
| --- | --- |
| JavaScript | Product execution path implemented for explicitly registered/provided QuickJS adapter roots; disabled by default. |
| jq | Product execution path implemented for explicitly registered/provided jq-wasm adapter roots; disabled by default. |
| Python | Unavailable. Eryx candidate blocked before proofs. |

## Remaining Work

Before script derive can be described as complete across target languages:

1. Run focused implementation/security review for jq product execution.
2. Run the full router suite.
3. Find or fix a Python WASM candidate.
4. Keep public docs precise: JavaScript and jq are explicit opt-in; Python remains unavailable; script derive is disabled by default.
