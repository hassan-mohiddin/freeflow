> **Doc ID:** PLAN-2026-06-24-freeflow-script-sandbox-adapter-spike
> **Date:** 2026-06-24
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** In progress — Slice 0 package inventory and Slice 1 proof fixture harness implemented; script execution remains blocked
> **Source:** `docs/designs/freeflow-script-derive-sandbox-design.md`, `docs/plans/2026-06-24-freeflow-observed-output-routing-vault-index-script-derive-implementation-plan.md`, current `plugins/freeflow/router/src/script-sandbox.ts`, and owner direction to eventually cover JavaScript, Python, and jq.

# Freeflow Script Sandbox Adapter Spike Plan

## Goal

Find and prove a sandbox adapter path for `freeflow_derive operation.kind="script"` that can eventually cover all target languages:

- JavaScript,
- Python,
- jq or an equivalent jq-compatible structured query runtime.

The spike must preserve the current safety boundary: script derive stays disabled by default, no script code executes through Freeflow until an adapter passes the proof suite, and there is no unsandboxed fallback.

## Source Context

Current source truth says:

- one public `freeflow_derive` tool with `operation.kind="script"`,
- no public `freeflow_script_derive`,
- no Node `vm`, plain Node subprocess, plain Python subprocess, or plain jq subprocess as a sandbox,
- source inputs come from vault records only,
- no repo/home/env/vault direct access,
- no network,
- bounded stdout/stderr/output files,
- adapter availability must be proof-backed and reported through `freeflow_status`,
- Slice 17 execution is blocked until at least one adapter passes required proofs and review.

Owner direction for this spike: do not choose a product direction that only covers JavaScript; the path should eventually cover JavaScript, Python, and jq.

## Current Evidence

- Docker CLI exists locally, but the Docker daemon was unavailable during the spike.
- macOS `sandbox-exec` exists and can launch with an allow-all profile, but it is deprecated and a restrictive local profile was brittle.
- Node `vm` was locally shown to escape to `process`, so it remains rejected.
- External evidence points to WASM/WASI-style runtimes as the most consistent cross-language family:
  - QuickJS/WASM for JavaScript,
  - CPython/MicroPython/Pyodide/Eryx-style WASM for Python,
  - jq WASM packages for jq-compatible queries.
- Node's built-in `node:wasi` documentation warns not to rely on it alone for comprehensive filesystem security, so a proof-backed runtime/package choice is still required.
- Package inventory found plausible primary candidates but no approved dependencies yet:
  - JavaScript: `quickjs-wasi` (~3 MB), `@sebastianwessel/quickjs` (~718 KB plus deps), and low-level QuickJS artifacts,
  - Python: `@bsull/eryx` (~49 MB unpacked), strong controls but large footprint, maturity risk, and a Node.js 24+ / JSPI compatibility gate,
  - jq: `jq-wasm` (~1.2 MB), needs timeout/output proof.

## Non-Goals

Do not:

- enable script execution in this spike,
- enable `scriptDerive.enabled` by default,
- add package/runtime dependencies without an explicit dependency decision,
- silently download runtimes at execution time,
- use Docker, Podman, `sandbox-exec`, Node `vm`, or plain subprocesses as an approved adapter without proof and review,
- weaken the language target to JavaScript-only,
- add network-enabled script derive,
- persist raw script text.

## Candidate Families

### Primary candidate: multi-language WASM/WASI family

Target shape:

- JavaScript adapter: QuickJS-in-WASM with host-provided input/output helpers and no ambient host APIs.
- Python adapter: CPython/MicroPython/Pyodide/Eryx-style WASM runtime with capability-limited filesystem and no network.
- jq adapter: jq compiled to WASM or a jq-compatible WASM query runtime.

Why primary:

- consistent story across all three target languages,
- no Docker daemon dependency,
- no host subprocess access by default,
- can use explicit host APIs and virtual input/output surfaces,
- portable if packages/artifacts are pinned and bundled or optional.

Open risks:

- package maturity and maintenance,
- artifact size and publish footprint,
- memory/time/fuel support varies by runtime,
- Python WASM support may require larger artifacts or newer Node features,
- jq WASM packages may not expose resource controls directly.

### Secondary candidate: container family

Target shape:

- language-specific images for JavaScript, Python, and jq,
- `--network none`, read-only root filesystem, read-only input mount, write-only/capped output mount, no Docker socket, no privileged mode, resource limits, timeout.

Why secondary:

- naturally covers all three languages,
- stronger OS boundary when configured correctly.

Open risks:

- Docker/Podman/Colima daemon dependency,
- image management and offline behavior,
- platform differences,
- operational complexity for a Pi plugin.

### Rejected/default-unapproved candidates

- Node `vm`: not a security sandbox.
- Plain Node/Python/jq subprocesses: no isolation.
- macOS `sandbox-exec` as default: deprecated and locally brittle; can remain a research candidate only if a restrictive profile and proof suite are demonstrated.

## Dependency Decision Gate

Before adding dependencies, stop and choose one packaging policy:

1. **Optional pinned adapters:** Freeflow publishes core without heavyweight runtime dependencies; users install adapter packages/artifacts explicitly. Status reports unavailable until installed and proven.
2. **Bundled pinned adapters:** Freeflow ships selected WASM runtimes/artifacts. Better default UX, larger package and stronger maintenance burden.
3. **External executable adapters:** Freeflow depends on installed executables such as Docker/Podman/Wasmtime. Better separation, worse setup portability.

Decision: use optional pinned adapters first. Freeflow core should not add heavyweight runtime dependencies or silently download runtime artifacts. Adapter packages/artifacts are explicit opt-ins, and `freeflow_status` reports unavailable until an adapter is installed and passes proofs.

## Slices

### Slice 0: Candidate Matrix And Dependency Inventory

Purpose: turn external claims into repo-local evidence before coding adapters.

Steps:

1. Create a short spike report comparing candidate packages/runtimes for JavaScript, Python, and jq.
2. For each candidate, record:
   - package/artifact name and license,
   - runtime host requirements,
   - artifact size/install impact,
   - filesystem model,
   - network model,
   - timeout/memory/output controls,
   - whether it supports no runtime downloads,
   - whether it can expose a tiny Freeflow input/output API.
3. Keep Node `vm`, plain subprocesses, and default `sandbox-exec` in the rejected section unless new proof changes source truth.
4. Do not install dependencies in this slice.

Checks:

- report cites current docs/source truth and candidate evidence,
- no source code executes untrusted scripts,
- `git diff --check`.

Stop if:

- no candidate can plausibly cover all three languages without weakening the contract.

Slice 0 progress:

- Added concrete npm/package inventory to `docs/research/freeflow-script-sandbox-adapter-spike-report.md` without installing dependencies.
- Current best candidate set is `quickjs-wasi` for JavaScript, `@bsull/eryx` for Python pending footprint/maturity approval, and `jq-wasm` for jq pending timeout/output proof.
- Dependency packaging policy is decided as optional pinned adapters; actual runtime package additions remain unapproved until a specific adapter proof slice needs them.

### Slice 1: Proof Harness Interface, No Runtime Dependencies

Purpose: make adapter proofs executable against fake/test adapters before selecting real runtimes.

Steps:

1. Extend the existing `script-sandbox` test harness so every required proof can be expressed as a named adversarial fixture:
   - env access denied,
   - home access denied,
   - repo access denied,
   - vault access denied,
   - network access denied,
   - input read-only,
   - output escape denied,
   - stdout/stderr bounded,
   - timeout enforced.
2. Add fake adapter tests proving the harness rejects incomplete proof reports and accepts complete proof reports.
3. Keep `freeflow_derive` execution unavailable.
4. Keep `freeflow_status` proof-backed.

Checks:

- `node --test plugins/freeflow/router/tests/script-sandbox.test.js`,
- `npm run test:router`,
- `git diff --check && git diff --cached --check`.

Stop if:

- the harness can mark a language available without all required proofs,
- the harness requires real runtime dependencies before a dependency decision.

Slice 1 progress:

- Added a no-dependency proof fixture registry in `plugins/freeflow/router/src/script-sandbox.ts` for every required proof across JavaScript, Python, and jq.
- Added coverage tests ensuring every target language has an adversarial fixture and adapter-level assertion for each required proof.
- No runtime adapters were added, no dependencies were installed, and script execution remains unavailable.

### Slice 2: WASM/WASI JavaScript Adapter Probe Spike

Purpose: prove or reject the JavaScript member of the multi-language WASM family without committing to script execution.

Steps:

1. After dependency approval, add the smallest optional/pinned QuickJS/WASM candidate behind an adapter module.
2. Implement only probe/eval behavior first, not `freeflow_derive` script execution.
3. Run adversarial proof fixtures against the candidate:
   - no `process`, `require`, host `fs`, host env, or host network,
   - only mounted virtual inputs are readable,
   - output writes are bounded and escape attempts are rejected,
   - timeout/memory behavior is deterministic enough for status.
4. Keep Python and jq unavailable until their own candidates pass.

Checks:

- JS proof fixture tests pass or candidate is rejected,
- deterministic derive tests still pass,
- status reports JS available only if every proof passes,
- no raw script text is persisted.

Stop if:

- QuickJS/WASM needs host APIs that violate the contract,
- timeout/output caps cannot be enforced deterministically.

### Slice 3: Python WASM Adapter Probe Spike

Purpose: prove or reject the Python member of the multi-language WASM family.

Steps:

1. After dependency approval, test one CPython/MicroPython/Pyodide/Eryx-style WASM candidate.
2. Run the same proof fixtures as Slice 2, adapted to Python syntax.
3. Measure package/artifact size and startup latency.
4. Keep execution unavailable until proof and review pass.

Checks:

- Python proof fixture tests pass or candidate is rejected,
- status reports Python available only if every proof passes,
- package/runtime impact is documented.

Stop if:

- Python runtime exposes ambient host capabilities,
- package/runtime footprint is too large without owner approval.

### Slice 4: jq WASM Adapter Probe Spike

Purpose: prove or reject the jq-compatible member of the multi-language WASM family.

Steps:

1. After dependency approval, test a jq WASM candidate.
2. Prove no network, no host filesystem, bounded input/output, timeout, and jq error handling.
3. Decide whether the Freeflow script surface treats jq as code text, query text, or structured operation while keeping `operation.kind="script"`.

Checks:

- jq proof fixture tests pass or candidate is rejected,
- status reports jq available only if every proof passes,
- jq errors are bounded and structured.

Stop if:

- jq candidate lacks timeout/output controls,
- jq input model would require broad host filesystem access.

### Slice 5: Adapter Selection Review And Slice 17 Gate

Purpose: decide whether script execution can move forward.

Steps:

1. Review proof results for JavaScript, Python, and jq.
2. If one or more languages pass, update source truth with the approved adapter family and remaining unavailable languages.
3. If all fail, keep Slice 17 blocked and report unavailable.
4. Run security/artifact review before any execution path is wired into `freeflow_derive`.

Checks:

- artifact review of spike report and adapter proof results,
- implementation review of any adapter probe modules,
- full `npm run test:router`,
- `git diff --check && git diff --cached --check`.

Stop if:

- adapter proof results require weakening the sandbox contract,
- dependency/package decisions are still owner-owned,
- any execution path could run scripts before review approval.

## Final Verification For The Spike

- `npm run test:router`
- targeted `script-sandbox` tests
- `npm run build`
- `git diff --check && git diff --cached --check`
- artifact review of the spike report/plan before enabling any runtime adapter

## Handoff Criteria

A future agent can proceed to Slice 17 only when:

- at least one adapter has passed every required proof,
- dependency/packaging policy is explicitly approved,
- status reports only proof-backed available languages,
- no raw script text persistence is introduced,
- security/artifact review passes,
- the source plan no longer marks Slice 17 blocked for that language.
