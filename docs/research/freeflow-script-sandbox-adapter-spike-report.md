# Freeflow Script Sandbox Adapter Spike Report

> **Date:** 2026-06-24
> **Status:** Preliminary Slice 0 evidence; Slice 1 no-dependency proof fixtures added
> **Related plan:** `docs/plans/2026-06-24-freeflow-script-sandbox-adapter-spike-plan.md`
> **Source truth:** `docs/designs/freeflow-script-derive-sandbox-design.md`, current `plugins/freeflow/router/src/script-sandbox.ts`

## Question

Which sandbox adapter path can eventually support Freeflow script derive for JavaScript, Python, and jq without weakening the current security contract?

## Required Contract

A candidate is unavailable until it proves all current `SCRIPT_SANDBOX_REQUIRED_PROOFS`:

- env access denied,
- home access denied,
- repo access denied,
- vault access denied,
- network access denied,
- input read-only,
- output escape denied,
- stdout/stderr bounded,
- timeout enforced.

It must also preserve these source-truth rules:

- one public `freeflow_derive` tool,
- script derive disabled by default,
- no unsandboxed fallback,
- no runtime downloads during execution,
- no raw script text persistence,
- JavaScript, Python, and jq remain target languages.

## Local Probe Results

| Probe | Result | Decision |
| --- | --- | --- |
| Docker CLI/daemon | Docker CLI exists; daemon unavailable locally. | Keep as secondary/fallback candidate only. |
| macOS `sandbox-exec` allow-all | Launches simple command. | Not enough; allow-all proves nothing. |
| macOS `sandbox-exec` restrictive profile | Simple restrictive `cat` probe aborted. | Not a default path; research only if a reliable profile and proof suite exists. |
| Node `vm` escape probe | Script reached host `process` via constructor escape. | Rejected. |

## Candidate Matrix

### Multi-language WASM/WASI family

| Target | Candidate examples | Strengths | Risks / gaps | Current decision |
| --- | --- | --- | --- | --- |
| JavaScript | QuickJS WASM packages such as `@sebastianwessel/quickjs`, `quickjs-emscripten`, `quickjs-wasi` | WASM isolation; can omit fetch/fs/env by default; host can expose tiny APIs; no Docker daemon. | Need dependency approval; package/runtime maturity; timeout/memory behavior must be tested; some packages expose optional fetch/fs that must stay disabled. | Primary path to test first after dependency decision. |
| Python | CPython/MicroPython/Pyodide/Eryx-style WASM runtimes; Wasmtime-backed Python sandboxes | Plausible no-network/no-filesystem-by-default story; can align with WASI capabilities. | Artifact size may be large; startup latency; package maturity; Node version/JSPI requirements for some packages; pure-Python vs CPython compatibility tradeoff. | Primary path, but dependency/package impact is a hard owner decision. |
| jq | `jq-web`, `jq-wasm`, other jq-to-WASM builds | Avoids shell/jq subprocess; can run as pure WASM/JS package. | Timeout/output control may be weak; package maturity; input model must avoid host fs; may need wrapper-level caps. | Primary jq direction if timeout/output proofs pass. |

Overall: this is the best fit for the owner requirement that Freeflow eventually cover JavaScript, Python, and jq without requiring a daemon or OS-specific sandbox.

### Container family

| Candidate | Strengths | Risks / gaps | Current decision |
| --- | --- | --- | --- |
| Docker/Colima/Podman adapter | Can cover JavaScript, Python, and jq with normal runtimes; OS-level isolation; supports no-network, read-only mounts, and resource caps when configured. | Requires daemon/runtime availability; image management; offline behavior; cross-platform differences; Docker socket risks; local Docker daemon unavailable. | Secondary fallback/proof harness, not default. |

### macOS `sandbox-exec`

| Strengths | Risks / gaps | Current decision |
| --- | --- | --- |
| Built into macOS; can theoretically deny filesystem/network with profiles. | Deprecated; platform-specific; profile language is brittle; restrictive local probe aborted; does not help Linux/Windows users. | Not a default adapter. Only revisit if WASM/container candidates fail and a restrictive profile is proven. |

### Rejected mechanisms

| Mechanism | Reason |
| --- | --- |
| Node `vm` | Not a security sandbox; local probe escaped to `process`. |
| Plain Node subprocess | Ambient host filesystem/env/network access. |
| Plain Python subprocess | Ambient host filesystem/env/network/import access. |
| Plain jq subprocess | Still a host process without filesystem/network/output boundary. |

## External Evidence Summary

- `sandbox-exec` man page marks the command deprecated: https://keith.github.io/xcode-man-pages/sandbox-exec.1.html
- Docker security docs emphasize that bind mounts are writable by default and security depends on explicit configuration: https://docs.docker.com/engine/storage/bind-mounts/ and https://docs.docker.com/engine/security/
- Wasmtime states WebAssembly is designed to execute untrusted code in a sandbox, with WASI/capability context still needing correct host configuration: https://docs.wasmtime.dev/security.html
- Node's WASI docs warn not to rely on `node:wasi` alone for comprehensive filesystem security: https://nodejs.org/api/wasi.html
- QuickJS WASM packages expose configurable fetch/filesystem options, which means Freeflow must keep them disabled unless explicitly proven safe: https://sebastianwessel.github.io/quickjs/docs/runtime-options.html

## Preliminary Recommendation

Use a **multi-language WASM/WASI adapter family** as the primary direction.

Do not implement script execution yet. First prove adapters in this order:

1. JavaScript QuickJS/WASM probe, because it is the smallest likely adapter.
2. Python WASM probe, because it is the largest dependency/compatibility risk.
3. jq WASM probe, because it may need wrapper-level timeout/output caps.

Keep the product target as JavaScript + Python + jq. A JavaScript adapter may land first only as a partial availability state, not as a JavaScript-only product direction.

## Required Owner Decision Before Dependencies

Choose the packaging policy before installing runtime packages:

1. Optional pinned adapter packages/artifacts.
2. Bundled pinned adapter packages/artifacts.
3. External executable/runtime requirements.

Recommendation: optional pinned adapters first, because it preserves the lightweight core package and keeps unavailable languages explicit in status.

## Implemented During This Spike

- Added a proof fixture registry for the current required proof set across JavaScript, Python, and jq.
- The fixtures are adversarial programs plus adapter-level assertions; they do not execute untrusted code by themselves.
- Added tests that every required proof has fixture coverage for every target language.
- No dependencies or runtime adapters were added.

## Next Evidence To Gather

For each candidate package/runtime:

- license,
- transitive dependency footprint,
- artifact size,
- Node version requirements,
- no runtime-download guarantee,
- timeout/memory controls,
- filesystem/network control model,
- API for virtual inputs and bounded output,
- whether proof fixtures can run deterministically in CI.

## Stop Conditions

Stop and keep script derive unavailable if:

- a candidate needs host filesystem, env, process, child process, or network access,
- timeout/output caps cannot be enforced,
- runtime artifacts must be downloaded during execution,
- package size or dependency model requires owner approval that has not been given,
- all candidates for a language fail and the only path is weakening the sandbox contract.
