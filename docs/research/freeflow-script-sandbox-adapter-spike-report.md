# Freeflow Script Sandbox Adapter Spike Report

> **Date:** 2026-06-24
> **Status:** Preliminary Slice 0 evidence; Slice 1 proof fixtures added; JavaScript QuickJS/WASI and jq-wasm proof spikes passed; Python Eryx candidate blocked before proofs
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

## Package Inventory

No repo dependencies were installed. Metadata came from `npm view <package> --json` and fetched project docs; leading candidates were also installed in a temporary directory with lifecycle scripts disabled for footprint/API inspection.

| Package | Target | Version | License | Unpacked size | Dependency notes | Relevant controls / caveats |
| --- | --- | ---: | --- | ---: | --- | --- |
| `@sebastianwessel/quickjs` | JavaScript / TypeScript | 3.1.0 | MIT | ~718 KB | Depends on `memfs`, `quickjs-emscripten-core`, `rate-limiter-flexible`; peer `typescript`. | Runtime options expose `executionTimeout`, `maxStackSize`, `memoryLimit`, virtual FS, `allowFs`, `allowFetch`, `env`, and host console hooks. Freeflow would need `allowFetch: false`, no env, no host FS, and bounded console/output handling. |
| `@jitl/quickjs-ng-wasmfile-release-sync` | JavaScript runtime artifact | 0.32.0 | MIT | ~676 KB | QuickJS WASM artifact package. | Useful low-level artifact for a custom wrapper; still needs Freeflow-owned host API, output caps, and timeout/memory proof. |
| `quickjs-emscripten` | JavaScript runtime | 0.32.0 | MIT | ~2.4 MB | Pulls several wasmfile variants plus core. | Mature QuickJS WASM binding; more variants/size than a single pinned artifact. Needs custom host API and proof fixtures. |
| `quickjs-wasi` | JavaScript runtime | 3.0.1 | MIT | ~3.0 MB | Ships `quickjs.wasm`; caller supplies bytes/module. | Docs say it performs no implicit filesystem or network I/O; exposes memory limit and interrupt handler for timeout. WASI overrides must be audited. Good JS candidate. Temp install size: 2,976 KB; `quickjs.wasm`: 1,552 KB. |
| `@bsull/eryx` | Python | 0.5.0 | MIT OR Apache-2.0 | ~48.9 MB | Depends on `@bytecodealliance/preview2-shim`; ships CPython/WASM runtime. | Docs claim no filesystem/network by default, resource limits, cancellation, VFS, host-controlled networking. Strong Python candidate on paper, but current temp probes failed before Python execution because `@bytecodealliance/preview2-shim/filesystem` does not export `_setFileData` for the tested dependency sets. Temp install size: 47,876 KB; largest WASM core: 26,620 KB; stdlib tarball: 3,012 KB. |
| `jq-wasm` | jq | 1.2.0-jq-1.8.2 | MIT | ~1.2 MB | No native dependency shown in metadata. | Runs jq in WASM and returns stdout/stderr/exitCode. Proof runner passed 9/9 using Worker termination for timeout and wrapper caps before Worker result crosses to host. Caveat: `jq-wasm` can generate large strings inside the Worker before truncation, so implementation/security review must decide whether that boundary is sufficient. Temp install size: 1,180 KB. |
| `jq-web` | jq | 0.6.2 | ISC | ~3.3 MB | Older Emscripten jq package. | Browser-oriented; less attractive than `jq-wasm` unless proof shows better controls. |
| `@wasm-sandbox/runtime` | generic WASM runtime | 1.3.0 | MIT | ~20 KB wrapper | Optional platform-native packages for OS/arch. | Potential generic runtime layer; needs deeper API review and optional binary package-size inventory before use. |

Temp install command used a temporary directory with `npm install --ignore-scripts --no-audit --no-fund`; no repo dependencies were added. Combined temp `node_modules` for `quickjs-wasi`, `@bsull/eryx`, and `jq-wasm` was 52,588 KB.

API notes from installed package files:

- `quickjs-wasi` exposes `memoryLimit`, `interruptHandler`, optional WASI overrides, and caller-supplied WASM bytes/module. It looks suitable for a Freeflow-owned JS wrapper that exposes only `readText`/`writeText`-style helpers.
- `@bsull/eryx` JavaScript API exposes `Sandbox.execute(code)`, stdout/stderr/result capture, callbacks, and a virtual file tree. README requires Node.js 24+ with `--experimental-wasm-jspi`; this is a compatibility gate before adoption.
- `jq-wasm` exposes `raw(json, query, flags)` returning stdout/stderr/exitCode. It needs a wrapper-level timeout/cancellation proof because the README does not advertise resource controls.

## Candidate Matrix

### Multi-language WASM/WASI family

| Target | Candidate examples | Strengths | Risks / gaps | Current decision |
| --- | --- | --- | --- | --- |
| JavaScript | QuickJS WASM packages such as `@sebastianwessel/quickjs`, `quickjs-emscripten`, `quickjs-wasi` | WASM isolation; can omit fetch/fs/env by default; host can expose tiny APIs; no Docker daemon. | Need dependency approval; package/runtime maturity; timeout/memory behavior must be tested; some packages expose optional fetch/fs that must stay disabled. | Primary path to test first after dependency decision. |
| Python | CPython/MicroPython/Pyodide/Eryx-style WASM runtimes; Wasmtime-backed Python sandboxes | Plausible no-network/no-filesystem-by-default story; can align with WASI capabilities. | Artifact size may be large; startup latency; package maturity; Node version/JSPI requirements for some packages; pure-Python vs CPython compatibility tradeoff. | Primary path, but dependency/package impact is a hard owner decision. |
| jq | `jq-web`, `jq-wasm`, other jq-to-WASM builds | Avoids shell/jq subprocess; can run as pure WASM/JS package. | `jq-wasm` needs Worker-level timeout and wrapper-level output caps; package maturity; input model must avoid host fs. | `jq-wasm` proof spike passed as a partial-availability candidate, with the in-Worker large-output caveat pending security/implementation review. |

Overall: this is the best fit for the owner requirement that Freeflow eventually cover JavaScript, Python, and jq without requiring a daemon or OS-specific sandbox.

Open risks:

- package maturity and maintenance,
- artifact size and publish footprint, especially Python at roughly 49 MB unpacked for `@bsull/eryx`,
- memory/time/fuel support varies by runtime,
- Python WASM support may require larger artifacts or newer Node features,
- jq WASM packages may not expose resource controls directly,
- Node's built-in `node:wasi` explicitly warns that it is not itself a comprehensive filesystem security model.

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

Within that family, the current best candidate set to investigate is:

- JavaScript: `quickjs-wasi` first, with `@sebastianwessel/quickjs` or low-level `quickjs-emscripten` as alternatives.
- Python: `@bsull/eryx` is blocked before proof execution on package/transitive compatibility; next Python path needs either a compatible Eryx dependency set or an alternate Python WASM candidate.
- jq: `jq-wasm` proof spike passed using Worker termination and wrapper-level output caps, with in-Worker large-output generation left as a security/implementation review caveat.

Do not implement script execution yet. Current proof routing:

1. JavaScript QuickJS/WASM has proof-spike evidence and remains a partial-availability candidate only.
2. Python WASM is blocked on Eryx package/transitive compatibility; revisit only with a compatible Eryx dependency set or an alternate Python WASM candidate.
3. jq WASM can continue independently next, because Python being blocked does not weaken the JavaScript + Python + jq product target or require enabling script execution.

Keep the product target as JavaScript + Python + jq. A JavaScript or jq adapter may land first only as a partial availability state, not as a JavaScript-only or jq-only product direction.

## Dependency Packaging Decision

Decision: use optional pinned adapter packages/artifacts first.

Rejected for now:

- Bundled pinned adapters, because Python/WASM artifacts may materially increase package size.
- External executable/runtime requirements as the default, because Docker/Podman/Wasmtime-style dependencies reduce portability and were not locally available/proven.

Implications:

- Freeflow core should not add heavyweight runtime dependencies.
- Adapter packages/artifacts are explicit opt-ins.
- Runtime artifacts must not be downloaded during script execution.
- `freeflow_status` should report unavailable until an optional adapter is installed and passes proofs.

## Implemented During This Spike

- Added a proof fixture registry for the current required proof set across JavaScript, Python, and jq.
- The fixtures are adversarial programs plus adapter-level assertions; they do not execute untrusted code by themselves.
- Added tests that every required proof has fixture coverage for every target language.
- Added a proof-only QuickJS/WASI runner: `plugins/freeflow/evals/scripts/run-quickjs-wasi-proof-spike.js`.
- Ran the QuickJS/WASI runner against the temporary installed `quickjs-wasi@3.0.1` package root; required JavaScript proof fixtures passed 9/9.
- Report: `plugins/freeflow/evals/reports/runtime/quickjs-wasi-proof-spike-1-report.md`.
- Tested `@bsull/eryx@0.5.0` from temp-only installs; both the default transitive `@bytecodealliance/preview2-shim@0.17.9` and explicit `0.17.0` pin failed before Python execution because `_setFileData` was not exported from `@bytecodealliance/preview2-shim/filesystem`.
- Report: `plugins/freeflow/evals/reports/runtime/eryx-python-proof-spike-1-report.md`.
- Added a proof-only jq/WASM runner: `plugins/freeflow/evals/scripts/run-jq-wasm-proof-spike.js`.
- Ran the jq/WASM runner against the temporary installed `jq-wasm@1.2.0-jq-1.8.2` package root; required jq proof fixtures passed 9/9.
- Report: `plugins/freeflow/evals/reports/runtime/jq-wasm-proof-spike-1-report.md`.
- No repo dependencies or runtime adapters were added, and no Freeflow script execution path was enabled.

## Next Evidence To Gather

For each candidate package/runtime:

- full transitive dependency footprint including optional native/WASM artifacts,
- exact package size impact after install,
- Node version requirements in this repo's supported environments,
- no runtime-download guarantee under package/bundler conditions,
- timeout/memory controls under adversarial fixtures,
- filesystem/network control model under adversarial fixtures,
- API for virtual inputs and bounded output,
- whether proof fixtures can run deterministically in CI.

## Stop Conditions

Stop and keep script derive unavailable if:

- a candidate needs host filesystem, env, process, child process, or network access,
- timeout/output caps cannot be enforced,
- runtime artifacts must be downloaded during execution,
- package size or dependency model requires owner approval that has not been given,
- all candidates for a language fail and the only path is weakening the sandbox contract.
