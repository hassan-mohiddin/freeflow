# Tool Execution

Tool Execution is an experimental native-Pi capability for bounded tool output, exact recovery, purpose-shaped direct operations, revisioned catalog calls, restricted local programs, and factual efficiency reporting. New execution artifacts and Guidance events use a per-origin Freeflow Session Store; Pi's ordinary tools remain available. It is not a universal child-tool dispatcher.

The current local candidate is exercised through source-built native fixtures and an extracted npm tarball that opens a checkpointed store, runs direct read/search/dry-run patch operations, and loads its Worker and QuickJS WASM from a path containing spaces. That is not publication, installation into a user's Pi process, real-model tool choice, provider billing, or qualification of other host distributions.

## Availability and boundaries

- Tool Execution is disabled by default.
- It requires native Pi 0.87.1 or a compatible 0.87.x host; Pi 0.85.x is unsupported. Source and fixtures do not establish behavior in an installed host.
- The stable generic tools remain catalog-visible with execution-time gates. `freeflow_read`, `freeflow_search`, and `freeflow_patch` appear only when Tool Execution and the current Session Store binding are ready; they augment rather than hide Pi-native tools.
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

Tool Execution exposes three generic Pi tools and, when the v2 store is ready, three direct tools:

| Tool | Purpose |
| --- | --- |
| `freeflow_read` | Batch focused project-relative line ranges, preserving byte fidelity, revisions and unserved reasons. |
| `freeflow_search` | Find ignore-aware paths or search text with `files`, `count`, `matches` or `context` detail when the qualified ripgrep backend is available. |
| `freeflow_patch` | Dry-run or apply an update-only, revision-bound patch with per-file receipts; no multi-file transaction. |
| `freeflow_tools` | Search bounded operation metadata, describe exact contracts, or call one registered revision. |
| `freeflow_run` | Execute bounded JavaScript in a fresh QuickJS/WASM Worker with explicit capabilities and explicit `emit`. |
| `freeflow_result` | Read a verified exact byte range of a granted legacy capture or v2 artifact without rerunning its producer. |

The generic tools retain concise collapsed call/result views and expanded detail views. They publish bounded diagnostic progress through Pi's native tool-update channel: catalog/direct-call activity, program child counts and emissions, and captured-range verification. Progress is throttled, omits program inputs and child outputs, and is never canonical state. Final tool results, run manifests, and settled effect facts remain authoritative; mutation success is not shown before the kernel returns a settled effect.

Discovery does not add every operation schema as a native Pi tool. Search returns bounded metadata; describe returns complete contracts or an explicit limit error. Exact operation revisions are required for calls and programs. Registry/config changes produce a new catalog generation and revoke stale admission.

A simple known operation should normally be called directly. Use discovery when its current revision/contract is missing. Use a program for mechanical dependent work whose next steps are already determined.

## On-demand guidance

The stable system cue makes bounded direct read/search self-describing. Before a program, patch, exact artifact recovery or unfamiliar catalog operation, load the Tool Execution skill and the relevant reference; programs use exact generated core bindings or a complete described long-tail contract. Reading the complete packaged skill can establish its introduction. Delivery is claimed only when its exact body is observed in a qualified completed request; loading or delivery does not prove model comprehension. If Guidance is unavailable, its absence does not grant permission or bypass mechanical gates.

## Captured output and exact recovery

With `capture.enabled`, qualified successful native Bash text above the inline threshold may publish immutable v2 bytes and a bounded native result through the Session Store. Existing `freeflow-tool-capture-v1` files and `result.read@1` remain read-only compatible; new v2 artifacts use `result.read@2`. `freeflow_result` routes exact granted IDs to the appropriate reader. A v2 range may return lossless base64 when bytes are binary or split UTF-8 instead of fabricating text.

Readers check the originating session and branch, native result or minimal anchor, granted ID, stored size/hash, range and coverage. Capture occurs at Freeflow's `tool_result` observer; producer output may already be truncated, and a later result hook may change the final representation. Missing or changed origin data is unavailable, not empty or silently recreated.

## Session Store and recovery

One private per-origin-session store holds Execution and Guidance events, descriptors and immutable artifacts beside Pi's native session. A writer lease, acknowledged journal head, per-artifact/run/session/total limits and bounded exact reads prevent a pointer from granting access by itself. New effects remain truthful if optional publication or presentation fails; they are never rerun automatically.

Before a durable checkpoint, recovery verifies the committed journal prefix. After a verified checkpoint, that checkpoint and its acknowledged tail are authoritative for current state; older journal bytes remain on disk for audit but damage only to those older bytes no longer blocks startup. Damage to the selected checkpoint, head or committed tail fails closed. Uncommitted tail bytes are excluded and require explicit quarantine before append. An ambiguous or stale lease is not reclaimed automatically; there is no automatic expiry or deletion of session-retained artifacts. A same-storage-root fork may read an inherited artifact only while its exact origin store and native anchor are available. Export without that origin reports unavailable.

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

The first tranche keeps the original revisions and adds exact v2 operations:

| Operation | Behavior |
| --- | --- |
| `result.read@1` | Legacy verified captured-text range; its contract is unchanged. |
| `result.read@2` | Verified v2 artifact range with UTF-8 or lossless base64 and explicit coverage. |
| `project.readText@1` | Original bounded UTF-8 read with complete-file SHA-256. |
| `project.readRanges@1` | Batched one-based inclusive line ranges, revisions, exact byte fidelity and per-request unserved reasons. |
| `project.searchText@1` | Original literal search under allowed paths. |
| `project.findPaths@1` | Ignore-aware path discovery with bounded continuation. |
| `project.searchText@2` | Ignore-aware text `files`, `count`, `matches` and `context` modes with byte coordinates and bounded continuation. |
| `project.replaceExact@1` | Original one-occurrence revision-bound replacement. |
| `project.applyPatch@1` | Update-only revision-bound patch with `dryRun`, a verified applied prefix and per-file applied/unchanged/not-applied/unknown receipts. |

The workspace adapter rejects absolute, traversal, outside-root and denied paths, including intermediate symlinks in explicit search roots. Reads preserve BOM and line endings; search limits its canonical operation value, not the outer `freeflow_tools` envelope. V2 path/text search requires a qualified ripgrep backend and does not fall back to the v1 scanner when unavailable. The current backend execution evidence is macOS arm64; Linux execution has not been separately qualified. Patches update existing UTF-8 files only, never create/delete/rename them or promise a multi-file transaction. Hostile concurrent filesystem races and cross-process compare-and-swap remain outside this local coordination guarantee.

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

The report keeps prepared request, response header, persisted assistant, final tool result, run, child-operation, capture and recovery observations distinct. Numeric usage and cost fields are known sums; per-field availability reports observed versus missing values and completeness, so a reported zero is distinguishable from an absent metric. It groups by profile, assignment, run and operation. Provider-normalized usage/cost and tool-reported usage/cost remain separate; reasoning is reported separately and is not added to output.

Byte fields are measurements at named local boundaries, not billed tokens. `modelViewBytes` can overlap the final serialized result bytes; `artifactBytes` counts acknowledged payload bytes, not journal, manifest, orphan or filesystem overhead. Captured and exact recovered bytes are distinct observations, and program children are not counted as extra outer model results. Unknown fields remain missing, not reported zero. Provider cache hits are never inferred from matching prefixes or local catalog hits. Export is bounded and reports omitted observations; normal accounting does not persist prompts, credentials, program bodies or full tool results.

The offline evaluation runner compares fixed scripted scenarios, including a competent batched/capped native baseline, and reports request/byte/category deltas only. The live runner is not part of default checks and requires explicit approval, fixed tasks and acceptance criteria, a credential source, quality tolerance, and total run/cost budget. No live evaluation has been run for this candidate.

## Evidence limits

Current deterministic evidence establishes the source-built native-Pi scripted lifecycle and provider-view boundary, legacy/v2 reader compatibility, effect and checkpoint recovery, direct/generic/program integration, and execution of the exact local npm candidate's Worker/WASM, Session Store, direct read/search and dry-run patch in a temporary extraction using the locally installed Pi TUI peer. A macOS arm64 offline 28 MB session with an aged synthetic sidecar met the cold-start and warmed-hook CPU targets in the measured runs; its first request still paid one-time historical indexing cost. This is neither a general latency service level nor an installed-user-host observation.

It does not establish:

- publication or installation into a user's Pi process;
- behavior on other host distributions;
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
