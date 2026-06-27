# jq-wasm Sandbox Proof Spike Report

> **Date:** 2026-06-24
> **Status:** Passed proof spike for jq candidate
> **Scope:** Proof-only evaluation. No Freeflow script execution path is enabled.

## Candidate

- Package: `jq-wasm@1.2.0-jq-1.8.2`
- License: MIT
- Package root: `/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/jq-wasm`
- Entry point: `/tmp/freeflow-sandbox-candidates-xVAJBl/node_modules/jq-wasm/dist/index.js`
- Runtime version: `jq-1.8.2-dirty`
- Timeout: 500ms via Worker termination
- Output cap: 4096 bytes across stdout + stderr before Worker result crosses to host
- Worker resource limits: `maxOldGenerationSizeMb=64`, `maxYoungGenerationSizeMb=16`

## Package Files

- `dist/build/jq.d.ts` — 118 bytes
- `dist/build/jq.js` — 1181780 bytes
- `dist/index.d.ts` — 1133 bytes
- `dist/index.js` — 3242 bytes
- `LICENSE` — 1051 bytes
- `package.json` — 1981 bytes
- `README.md` — 3088 bytes

## Positive API Probe

- Status: success
- Output: `"INFO setup\nERROR target\n"`
- Error: none

## Required Proof Results

| Proof | Result | Evidence |
| --- | --- | --- |
| env_access_denied | pass | jq exposed only fixed runtime env, not ambient host env or secrets; status=success; exitCode=0; durationMs=29; outputBytes=126; stdoutBytes=126; stderrBytes=0; rawStdoutBytes=126; rawStderrBytes=0; truncated=false |
| home_access_denied | pass | home/secret paths were not exposed; status=success; exitCode=3; durationMs=27; outputBytes=61; stdoutBytes=0; stderrBytes=61; rawStdoutBytes=0; rawStderrBytes=61; truncated=false |
| repo_access_denied | pass | repo files were not exposed; status=success; exitCode=3; durationMs=29; outputBytes=61; stdoutBytes=0; stderrBytes=61; rawStdoutBytes=0; rawStderrBytes=61; truncated=false |
| vault_access_denied | pass | vault records were not exposed; status=success; exitCode=3; durationMs=27; outputBytes=62; stdoutBytes=0; stderrBytes=62; rawStdoutBytes=0; rawStderrBytes=62; truncated=false |
| network_access_denied | pass | jq has no ambient network primitive; synthetic fetch errored boundedly; status=success; exitCode=5; durationMs=30; outputBytes=48; stdoutBytes=0; stderrBytes=48; rawStdoutBytes=0; rawStderrBytes=48; truncated=false |
| input_read_only | pass | input mutation include was unavailable; status=success; exitCode=3; durationMs=29; outputBytes=71; stdoutBytes=0; stderrBytes=71; rawStdoutBytes=0; rawStderrBytes=71; truncated=false |
| output_escape_denied | pass | output escape include was unavailable; status=success; exitCode=3; durationMs=28; outputBytes=63; stdoutBytes=0; stderrBytes=63; rawStdoutBytes=0; rawStderrBytes=63; truncated=false |
| stdout_stderr_bounded | pass | stdout and stderr flood output was truncated before crossing the worker boundary; status=success; exitCode=0; durationMs=353; outputBytes=4096; stdoutBytes=2048; stderrBytes=2048; rawStdoutBytes=5299999; rawStderrBytes=6399999; truncated=true |
| timeout_enforced | pass | recursive jq loop was interrupted by worker termination; status=timed_out; exitCode=null; durationMs=501; outputBytes=0; stdoutBytes=0; stderrBytes=0; rawStdoutBytes=0; rawStderrBytes=0; truncated=false |

## Notes

- This proof runner uses a temporary installed `jq-wasm` package root passed explicitly by the caller.
- It does not add repo dependencies and does not wire the adapter into `freeflow_derive` execution.
- Timeout proof uses Node Worker termination because in-thread recursive jq blocks the event loop.
- Output proof caps what crosses the Worker boundary; `jq-wasm` itself can still generate large in-Worker strings before the wrapper truncates them.
- Passing this spike only supports jq adapter feasibility; Python remains unavailable until a Python candidate passes proofs.
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
