# QuickJS WASI Sandbox Proof Spike Report

> **Date:** 2026-06-24
> **Status:** Passed proof spike for JavaScript candidate
> **Scope:** Proof-only evaluation. No Freeflow script execution path is enabled.

## Candidate

- Package: `quickjs-wasi@3.0.1`
- License: MIT
- Package root: `/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/quickjs-wasi`
- WASM bytes: 1587119
- WASM SHA-256: `66629761271fe05c63622c15c7169e2d386985db43cb3917fca4bd43caffdc84`
- Timeout: 250ms
- Memory limit: 8388608 bytes
- Output cap: 4096 bytes

## Positive API Probe

- Status: success
- Output: `INFO setup\nERROR target\n`
- Error: none

## Required Proof Results

| Proof | Result | Evidence |
| --- | --- | --- |
| env_access_denied | pass | ambient environment was not exposed; status=success; durationMs=2; outputBytes=0; stdoutBytes=0; stderrBytes=0; truncated=false |
| home_access_denied | pass | home/secret paths were not exposed; status=success; durationMs=1; outputBytes=14; stdoutBytes=14; stderrBytes=0; truncated=false |
| repo_access_denied | pass | repo files were not exposed; status=success; durationMs=3; outputBytes=14; stdoutBytes=14; stderrBytes=0; truncated=false |
| vault_access_denied | pass | vault records were not exposed; status=success; durationMs=2; outputBytes=14; stdoutBytes=14; stderrBytes=0; truncated=false |
| network_access_denied | pass | network/fetch capability was absent; status=success; durationMs=2; outputBytes=17; stdoutBytes=17; stderrBytes=0; truncated=false |
| input_read_only | pass | input mutation was not possible through host filesystem APIs; status=success; durationMs=1; outputBytes=14; stdoutBytes=14; stderrBytes=0; truncated=false |
| output_escape_denied | pass | output symlink/file escape was not possible through host filesystem APIs; status=success; durationMs=2; outputBytes=14; stdoutBytes=14; stderrBytes=0; truncated=false |
| stdout_stderr_bounded | pass | stdout and stderr flood capture was truncated within the cap; status=timed_out; durationMs=253; outputBytes=4096; stdoutBytes=2076; stderrBytes=2020; truncated=true; error=interrupted |
| timeout_enforced | pass | infinite loop was interrupted by runtime timeout; status=timed_out; durationMs=251; outputBytes=0; stdoutBytes=0; stderrBytes=0; truncated=false; error=interrupted |

## Notes

- This proof runner uses a temporary installed `quickjs-wasi` package root passed explicitly by the caller.
- It does not add repo dependencies and does not wire the adapter into `freeflow_derive` execution.
- Passing this spike only supports JavaScript adapter feasibility; Python and jq remain unavailable until their own proof slices pass.
- Before product execution, this must still go through implementation/security review and source-plan update.

## Required Proof Set

- env_access_denied
- home_access_denied
- repo_access_denied
- vault_access_denied
- network_access_denied
- input_read_only
- output_escape_denied
- stdout_stderr_bounded
- timeout_enforced
