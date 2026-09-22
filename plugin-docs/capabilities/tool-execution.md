# Tool Execution

Tool Execution is an experimental native-Pi capability for bounded tool output, exact recovery, revisioned operations, restricted local programs, deterministic discovery, cooperating adapters, and factual efficiency reporting. It keeps Pi's ordinary tools available and does not turn Freeflow into a universal child-tool dispatcher.

The current package candidate is exercised through source-built native fixtures and an extracted npm-artifact fixture that loads its Worker and QuickJS WASM from a path containing spaces. This does not establish publication, installation into a user's Pi process, real-model program quality, provider billing, or PiFlow support.

## Availability and boundaries

- Tool Execution is disabled by default.
- It is available only through the native Pi extension path; the current PiFlow path reports it unavailable.
- The stable native tools remain visible while execution-time gates enforce current availability.
- Native Pi Bash is the built-in output-capture integration. An unknown custom Bash keeps its ordinary Pi behavior and is not reshaped.
- Live child operations run in their declared execution world and cooperating policy. They do not inherit every native or third-party Pi hook.
- QuickJS capability restriction is not an audited OS sandbox. Disable programs when stronger process isolation is required.
- Context Control v2 remains out of scope.

## Configuration

Configure Tool Execution under `toolExecution` in `.freeflow/config.json` or `.freeflow/local.json`:

```json
{
  "toolExecution": {
    "enabled": true,
    "capture": {
      "enabled": true,
      "maxInlineBytes": 8192,
      "maxStoredBytes": 268435456
    },
    "programs": {
      "mode": "reduction",
      "timeoutMs": 30000,
      "maxParallelReads": 4
    },
    "workspace": {
      "enabled": false,
      "write": false,
      "denyPaths": [".git"]
    },
    "discovery": { "enabled": true },
    "adapters": { "allow": [] },
    "accounting": { "enabled": true }
  }
}
```

Use `/freeflow settings local` for personal overrides or `/freeflow settings repo` for shared defaults. The Settings TUI exposes the full Tool Execution schema in Capture and recovery, Programs, Workspace, Cooperating adapters, discovery, and accounting groups. Quick presets atomically select Off, Read-only local, or All local built-ins while preserving advanced limits, roots, denied paths, and adapter allowlists. Local leaves can independently inherit repository values. Enabling exact workspace replacement, directly or through the full-local preset, requires an explicit confirmation; saving settings reloads the runtime when the host supports reload.

Omitted Tool Execution feature gates default disabled; omitted limit fields use the bounded values shown above. `programs.mode` accepts:

| Mode | Guest capabilities |
| --- | --- |
| `off` | `freeflow_run` is unavailable. |
| `reduction` | Programs may read only explicitly granted captured results. |
| `adapters` | Programs may also invoke exact allowlisted operation revisions that pass current routing, configuration, adapter and effect-fence checks. |

`workspace.enabled` opts into Freeflow's bounded local-workspace execution world. `workspace.write` independently enables exact replacement. `workspace.root` may select a configured local root; it defaults to the activated repository root only after workspace enablement. `denyPaths` adds denied relative prefixes; `.git` is always denied.

`adapters.allow` is an explicit list of trusted in-process adapter IDs. Announcing an adapter does not enable it. Loading an extension is the trust decision; the v1 endpoint does not authenticate hostile extensions sharing the process.

Configuration changes may require `/reload`. Use `/freeflow status` to inspect the effective mode, catalog and adapter counts, retained capture failures, program failures, and unresolved-effect fences.

## Stable model-facing tools

Tool Execution registers three stable Pi tools:

| Tool | Purpose |
| --- | --- |
| `freeflow_tools` | Search bounded operation metadata, describe complete exact contracts, or make one direct revision-bound call. |
| `freeflow_run` | Execute bounded JavaScript in a fresh QuickJS/WASM Worker with explicit capabilities and explicit `emit`. |
| `freeflow_result` | Read a verified exact byte range from a captured result without rerunning its producer. |

All three tools have concise collapsed call/result views and expanded detail views. They publish bounded diagnostic progress through Pi's native tool-update channel: catalog/direct-call activity, program child counts and emissions, and captured-range verification. Progress is throttled, omits program inputs and child outputs, and is never canonical state. Final tool results, run manifests, and settled effect facts remain authoritative; mutation success is not shown before the kernel returns a settled effect.

Discovery does not add every operation schema as a native Pi tool. Search returns bounded metadata; describe returns complete contracts or an explicit limit error. Exact operation revisions are required for calls and programs. Registry/config changes produce a new catalog generation and revoke stale admission.

A simple known operation should normally be called directly. Use discovery when its current revision/contract is missing. Use a program for mechanical dependent work whose next steps are already determined.

## Captured output and exact recovery

When enabled, qualified successful native Bash text results above the inline threshold can be stored as immutable UTF-8 sidecars. The model receives a bounded native result that names its capture ID and coverage. `freeflow_result` and `result.read@1` verify:

- current ancestry and the exact originating native call/result;
- final result representation;
- immutable file identity, size and SHA-256;
- requested UTF-8 byte boundaries;
- attached-recovery result grants when recovery is active.

Capture happens at Freeflow's `tool_result` observer. Upstream output may already be truncated, and later result hooks may change the final representation. Coverage records that limit; it never promotes observed bytes into a universal producer-complete claim.

Captured files are retained until explicit deletion. Disabling new capture does not delete existing sidecars. Storage, publication or integrity failure preserves the native tool result and makes the capture unavailable; it never silently reruns the producer.

## Restricted programs

`freeflow_run` accepts the body of an async JavaScript function. Guest return values are hidden; only `emit(value)` becomes model-visible in the final canonical result. While a run is active, the TUI may stream bounded counts and lifecycle status, but not emitted values or hidden intermediates.

```js
const captured = await results.read(input.captureId, {
  offsetBytes: 0,
  maxBytes: 32768,
});
const matches = captured.text
  .split("\n")
  .filter((line) => line.includes("FAIL"));
emit({ matches, nextOffsetBytes: captured.nextOffsetBytes });
```

The candidate declares exact runtime dependencies `quickjs-emscripten-core@0.32.0` and `@jitl/quickjs-wasmfile-release-sync@0.32.0`. Their installed artifacts include the upstream MIT licenses for quickjs-emscripten and QuickJS. Dependency updates require requalification; the engine is not presented as audited.

The guest receives only:

- frozen lossless-JSON `input`;
- `results.read` for outer-granted capture IDs;
- `tools.invoke` for outer-declared exact operation revisions;
- `emit` for deliberate model-visible output;
- `mapLimit` for bounded ordered concurrency.

It receives no Node `process`, `require`, `Buffer`, filesystem, network, timers, module loader, routing controls, model calls, catalog mutation, or recursive `freeflow_run`. The Date intrinsic and random output are disabled. The host bounds source/input bytes, QuickJS heap/stack, elapsed time, frames, pending/total calls, transfer, emissions and final result size.

Independent reads may overlap. Admission and delivery remain ordered. Mutations run exclusively and keep their barrier through output validation and effect-settlement acknowledgement.

## Built-in operation catalog

The initial finite local catalog is:

| Operation | Behavior |
| --- | --- |
| `result.read@1` | Reads a verified range from an explicitly granted immutable capture. |
| `project.readText@1` | Reads a bounded UTF-8 range plus a complete-file SHA-256 from an allowed local file. |
| `project.searchText@1` | Searches a literal string under explicit allowed paths with deterministic ordering, bounded acquisition and revision-bound continuation. |
| `project.replaceExact@1` | Replaces one unambiguous occurrence under an expected complete-file SHA-256 and reports before/after hashes. |

The workspace adapter rejects absolute/traversal/outside-root/denied paths, escaped or searched symlinks, unsupported files, invalid UTF-8 and oversized acquisition. Search does not claim a transactionally consistent filesystem snapshot. Replacement coordination is limited to one Freeflow runtime instance; cross-process compare-and-swap and hostile filesystem races are not promised.

No arbitrary Bash, network fetch, deletion, general write, installation, or remote-native fallback is added to the program catalog. Ordinary Pi tools remain available through their normal path.

## Cooperating adapters

A trusted extension may import the v1 adapter API from the installed package's `pi-extension/dist/tool-runtime/adapters/protocol.js` and register a bundle through `registerCooperatingAdapter`.

A conforming bundle declares:

- protocol version, stable adapter ID/revision and execution world;
- per-call authorization, `AbortSignal` cancellation and effect-aware settlement;
- closed bounded input/output schemas;
- exact operation IDs/revisions, effect classification and invocation exposure;
- a disposer.

Freeflow validates a bundle atomically. Configuration allowlisting activates it; removal revokes new admission and changes the catalog generation. Started calls retain their captured implementation and must settle. The same inactive implementation may reactivate; changed callbacks under one revision conflict, while an explicit new revision can replace an inactive one.

The endpoint is an in-process cooperation contract, not a credential or hostile-extension security boundary.

## Cancellation, effects and recovery

Mutations receive an acknowledged native `freeflow-tool-effect-v1` start fact before execution and a settlement fact afterward. If settlement is absent or unknown, Freeflow reconstructs a session effect fence after reload/navigation. It does not replay the mutation.

- Cancellation before the body reports no effect.
- Cancellation after an applied write preserves the completed effect fact.
- A non-cooperative mutation gets a bounded drain grace; the program returns an interrupted `reconcile-effects` envelope while the original effect remains fenced.
- Session/routing/catalog changes are rechecked immediately before execution.
- `needs-model` stops further admissions and returns a model-decision continuation; guest state is not invisibly parked across approval.
- Attached evidence recovery allows granted capture reads but denies programs and live operations.

An unresolved live effect blocks new live work, a clean completed worker return and accepted routing-unit closure. A truthful partial/blocked report, passive status and exact admitted capture reads remain available.

## Efficiency reporting and evaluation

When `accounting.enabled` is effective:

```text
/freeflow efficiency
/freeflow efficiency export
```

The report keeps prepared request, response header, persisted assistant, final tool result, run, child-operation, capture and recovery observations distinct. It groups by profile, assignment, run and operation. Provider-normalized usage/cost and tool-reported usage/cost remain separate; reasoning is reported separately and is not added to output.

Byte fields are serialized UTF-8 measurements at named local boundaries. They are not billed tokens. Provider cache hits are never inferred from matching prefixes or local catalog hits. Export is bounded and reports omitted observations; normal accounting does not persist prompts, credentials, program bodies or full tool results.

The offline evaluation runner compares fixed scripted scenarios, including a competent batched/capped native baseline, and reports request/byte/category deltas only. The live runner is not part of default checks and requires explicit approval, fixed tasks and acceptance criteria, a credential source, quality tolerance, and total run/cost budget. No live evaluation has been run for this candidate.

## Evidence limits

Current deterministic evidence establishes source behavior, native scripted dispatch, effect and recovery semantics, request construction, stable schema exposure, and execution of the packed candidate's Worker/WASM in an extracted temporary installation.

It does not establish:

- publication or installation into a user's Pi process;
- PiFlow behavior;
- an audited sandbox or protection from malicious same-process extensions;
- arbitrary native/third-party tool-hook parity;
- real-model program generation or task quality;
- provider cache hits, billing savings, pricing or cost per accepted task;
- release or deployment.

## Related documentation

- [Pi integration](../integrations/pi.md)
- [Capabilities](README.md)
- [Cognitive Routing](cognitive-routing.md)
- [Getting Started](../getting-started.md)
- [Architecture](../architecture.md)
