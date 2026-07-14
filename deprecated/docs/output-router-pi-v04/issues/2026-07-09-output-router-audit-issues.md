# Output Router Audit Issues

> **Doc ID:** ISSUE-2026-07-09-output-router-audit
> **Date:** 2026-07-09
> **Type:** Issue inventory
> **Status:** Superseded by `2026-07-10-output-router-pi-completion-audit.md`
> **Area:** Freeflow output router runtime, Pi adapter, routing contracts, vault, performance, and model-visible output
> **Source:** Live source inspection, targeted reviewer subagent audits, local repro snippets, latest output-router handoff, and Context Mode parity reports.

## Purpose

Preserve the initial audit snapshot. Do not use it as an implementation inventory; the seven-specialist consolidated audit at `2026-07-10-output-router-pi-completion-audit.md` supersedes it.

This document is memory, not authority. Live code, tests, accepted ADRs, and explicit owner decisions override it. Reopen the referenced files and rerun focused tests before claiming any issue is fixed.

## Scope Audited

Primary runtime/code paths:

- `router/src/tools/search.ts`
- `router/src/tools/run.ts`
- `router/src/tools/batch.ts`
- `router/src/routing/`
- `router/src/processing/`
- `router/src/transform/`
- `router/src/vault/`
- `router/src/config/`
- `router/tests/`
- `pi-extension/src/router-tools.ts`
- `pi-extension/src/renderers.ts`
- `pi-extension/src/utils.ts`
- `pi-extension/src/schemas.ts`

Context/evidence:

- `docs/handoffs/output-router/2026-06-28-freeflow-context-mode-parity-final-handoff.md`
- `evals/reports/runtime/context-mode-real-deep-final-slice-11-report.md`
- `evals/reports/runtime/context-mode-real-deep-final-slice-11-review.md`
- `plugin-docs/output-router.md`
- `skills/output-router/SKILL.md`

## Severity Key

- **P0:** correctness/security issue that can produce wrong evidence, data isolation risk, or unsafe behavior.
- **P1:** public contract/interface issue or correctness gap likely to confuse tools/agents.
- **P2:** performance, UX, validation, or maintainability issue with clear impact.
- **P3:** cleanup or polish that reduces future friction.

## Summary Table

| ID | Severity | Area | Issue | Primary remedy |
| --- | --- | --- | --- | --- |
| OR-001 | P0 | Run filters | `flags: "g"` can skip matching lines | Reject/strip `g`, or reset `lastIndex` before every `.test()` |
| OR-002 | P0 | Vault sessions | Session IDs collide after lossy sanitization | Use collision-free session path encoding/hash; handle migration/backcompat |
| OR-003 | P1; P0 if mutating delegation execution is enabled | Batch/delegation | Internal delegation batch kinds leak into router core and can mutate concurrently | Split internal delegation batching or serialize/reject mutating steps |
| OR-004 | P1 | Search/transform | `freeflow_search action=transform` has two incompatible result contracts | Wrap processing output in normal transform routed result or split action |
| OR-005 | P1 | Schema/runtime/docs | Transform schema and high-level wording are ambiguous about repo/local deterministic operations | Support repo/local operations or narrow schema/docs/tests |
| OR-006 | P1 | Validation | Validators accept incomplete configs/results | Make validators enforce required fields and route-discriminated contracts |
| OR-007 | P1 | Vault search | Vault `expand` can apply evidence from output A to output B | Validate evidence outputId/stream against requested source |
| OR-008 | P1 | Processing persistence | Stored processing records lack exact recovery identifiers | Let vault helper set exact persistence or include recovery ids |
| OR-009 | P2 | Repo search perf | Repo broad search lacks global traversal budget | Add repo budgets for dirs/files/bytes and tests |
| OR-010 | P2 | Vault index perf | Vault index reads/sorts/rewrites whole JSON sidecar | Add scale benchmark; use bounded topK heap; consider sharding/append-only |
| OR-011 | P2 | Renderer caps | Processing renderer can exceed `maxVisibleBytes` | Subtract truncation marker bytes before slicing |
| OR-012 | P2 | Output UX | Search and tiny outputs are too verbose | Compact search rows and tiny-success output path |
| OR-013 | P2 | Benchmarks | Benchmarks do not fully measure Pi public model-visible text | Add public-path Pi compact renderer benchmarks |
| OR-014 | P3 | Runtime coupling | Pi imports router barrel that exports benchmarks | Add runtime-only barrel/imports |
| OR-015 | P3 | TUI polish | Transform call renderer exists but is not wired | Use it when `action === "transform"` or delete it |

## Fix-First Shortlist

Fix these before contract/performance/UX work:

1. **OR-001** — run filters can omit matching evidence lines.
2. **OR-002** — vault session path collisions can cross session boundaries.
3. **OR-007** — vault expand can mix evidence from one output with another.
4. **OR-008** — processing result persistence can lose exact recovery identifiers.

---

## OR-001 — `freeflow_run` filters drop matches when `flags: "g"` is allowed

**Severity:** P0
**Area:** command output filtering / evidence selection

### Evidence

- Validation allows `g`: `router/src/routing/run-filters.ts:75-76`
- Regexes are reused across line `.test()` calls: `router/src/routing/run-filters.ts:137-144`
- Pi schema also describes `g` as allowed for regex flags: `pi-extension/src/schemas.ts:18-23`

### Problem

JavaScript `RegExp` instances with the `g` flag keep mutable `lastIndex`. Reusing the same global regex across adjacent lines can skip every other match.

The router can therefore omit evidence lines that match the user's filter.

### Local Repro

A local snippet against the current compiled dist accepted `{ include: "foo", flags: "g" }` and selected only two lines from `foo\nfoo\nfoo`.

### Why It Matters

Filtered output is often used for test/build/error evidence. Dropped matching lines can lead to incorrect debugging, incomplete verification evidence, and misleading summaries.

### Smallest Safe Fix

Prefer rejecting or stripping `g` for run filters. If compatibility requires accepting `g`, reset `regex.lastIndex = 0` before every `.test()` for include and exclude checks.

### Regression Test

Add a run-filter test where adjacent matching lines and `flags: "g"` select all matching lines.

---

## OR-002 — Vault session IDs collide after lossy sanitization

**Severity:** P0
**Area:** vault isolation / privacy / recovery

### Evidence

- Session index path uses `safeSegment(sessionId)`: `router/src/vault/vault.ts:711`
- `safeSegment` replaces non-safe characters with `_`: `router/src/vault/vault.ts:833`

### Problem

Different session IDs can map to the same directory. Example collision:

```text
tenant/a -> tenant_a
tenant_a -> tenant_a
```

A local repro stored a record under `tenant/a` and successfully read it through `tenant_a` when the output ID was known.

### Why It Matters

Vault records can contain exact command, web, MCP, fetch, or transformed output. Session ID collision is a data isolation bug and can undermine recovery boundaries.

### Smallest Safe Fix

Use collision-free session path names, such as:

- `sid_<sha256(sessionId)>`, with session ID stored in index metadata; or
- reversible URL/base64url encoding that cannot collide.

Because existing local vaults may already use sanitized paths, implementation should include an explicit compatibility/migration strategy before changing lookup behavior.

### Regression Test

Store under two colliding legacy IDs and assert reads are isolated under the new session path scheme.

### Stop Condition

Ask before deleting, migrating, or invalidating existing user vault data. Compatibility is user-impacting.

---

## OR-003 — Internal delegation batch kinds leak into output-router core and can mutate concurrently

**Severity:** P1, with P0 potential if mutating delegation execution is used
**Area:** batch contract / delegation harness integration / parallel safety

### Evidence

Public surface says `freeflow_batch` step kinds are `run` and `search` only:

- Latest handoff: `docs/handoffs/output-router/2026-06-28-freeflow-context-mode-parity-final-handoff.md:41`
- Public docs: `plugin-docs/output-router.md:21`
- Pi schema: `pi-extension/src/schemas.ts:230-243`

Core types and implementation include internal delegation kinds:

- `router/src/config/types.ts:19`
- `router/src/tools/batch.ts:76-86`

Mutating delegation kinds require `confirmMutation=true`, but this gates only confirmation, not concurrent scheduling:

- Validation gate: `router/src/tools/batch.ts:187-188`
- Parallel executor: `router/src/tools/batch.ts:103-110`, `router/src/tools/batch.ts:633-650`

### Problem

The router core contains delegation-specific operations even though the public output-router batch contract is documented as `run`/`search` only. The implementation also allows `delegate_close` / `delegate_ack_alert` to run with `concurrency > 1` after confirmation.

### Why It Matters

This blurs module ownership:

- Output router batch is supposed to batch evidence transport operations.
- Delegation harness mutation is a separate lifecycle/state domain.
- Mutating harness state concurrently can produce race conditions.

### Smallest Safe Fix

Either:

1. Move delegation batching into the delegation module/adapter and keep output-router core public batch kinds to `run`/`search`; or
2. Keep an explicitly internal batch seam, but split public `BatchStepKind` from internal delegation step kinds and serialize/reject mutating steps when `concurrency > 1`.

### Regression Test

If delegation steps remain supported internally, add a test proving mutating steps are serialized or rejected under concurrency.

### Stop Condition

Ask before changing the public `freeflow_batch` API or exposing delegation step kinds publicly.

---

## OR-004 — `freeflow_search action=transform` has two incompatible result contracts

**Severity:** P1
**Area:** public action contract / Pi renderer / agent interface

### Evidence

Pi dispatches two different implementations for the same public action:

- `operation` present -> `freeflowTransform`: `pi-extension/src/router-tools.ts:223-239`
- `operation` absent -> `processSource`: `pi-extension/src/router-tools.ts:240-245`

Renderer special-cases the processing-engine skeleton:

- `pi-extension/src/renderers.ts:487-493`

Processing result has `implementation: "processing-engine-skeleton-v1"`, `status`, and `visibleText`; transform engine returns a normal routed transform result with routing/persistence/evidence shape.

### Problem

One public action returns two schemas. Clients, renderers, tests, and future agents must know implementation-specific shape instead of relying on a stable routed result interface.

### Why It Matters

This makes tool output harder to consume and increases the chance of broken renderer/benchmark behavior when transform internals evolve.

### Smallest Safe Fix

Recommended: wrap processing-engine output into a normal `TransformRoutedResult` before it leaves the Pi public tool path.

Alternative: split processing into a separate action/contract. That is a public interface decision and should not be done silently.

### Regression Test

Assert `freeflow_search action=transform` always returns a result with stable routed fields (`toolStatus`, `routing`, `preserve`, `source`, `evidence`/`recovery` as appropriate), regardless of whether it used deterministic operation or processing reducer/script path.

---

## OR-005 — Transform schema and high-level wording are ambiguous about repo/local deterministic operations

**Severity:** P1
**Area:** schema/runtime/docs consistency

### Evidence

Public docs describe transform over repo/local/vault sources, while the deterministic operations section says current operations remain focused on vaulted output:

- `plugin-docs/output-router.md:194-198`

Pi schema exposes `source.kind` as `repo | local | vault` and exposes `operation` under `freeflow_search` without conditionally excluding repo/local operation combinations:

- `pi-extension/src/schemas.ts:55-145`

Runtime rejects deterministic `operation` unless source is vault:

- `pi-extension/src/router-tools.ts:30-60`

### Problem

A currently schema-admitted call such as:

```json
{
  "action": "transform",
  "source": { "kind": "repo", "path": "logs/build.log" },
  "operation": { "kind": "countMatches", "pattern": "ERROR" }
}
```

is rejected at runtime.

### Why It Matters

Tool schemas are part of the model-facing interface. If a schema-admitted call fails because of hidden runtime restrictions, agents will waste turns and may choose native broad tools instead.

### Smallest Safe Fix

Choose one path:

1. Support repo/local deterministic operation sources by loading or vaulting the explicit source before transform; or
2. Narrow schema/docs to state that `operation` currently applies to vaulted output only, while reducer/script processing without `operation` supports explicit repo/local/vault sources.

### Regression Test

Add tests for both accepted and rejected transform source/operation combinations.

---

## OR-006 — Validators accept incomplete configs/results

**Severity:** P1
**Area:** config/result contract validation

### Evidence

`RouterConfig` requires `enabled` and `profile`:

- `router/src/config/types.ts:543-551`

`validateRouterConfig` does not check those fields:

- `router/src/config/schema.ts:631-665`

`CommandRoutedResult` requires `outputId` and `execution`:

- `router/src/config/types.ts:267-285`

`validateRoutedResult` treats `execution` and `outputId` as optional:

- `router/src/config/schema.ts:584-600`

Local repro: a config missing `enabled/profile` passed, and a `route: "run"` result missing `outputId/execution` passed.

### Problem

The validator gives false confidence. Tests and downstream clients can validate incomplete objects that TypeScript interfaces say should not exist.

### Why It Matters

Validation should be the interface test surface. If it is looser than the actual contract, future refactors can silently break result consumers.

### Smallest Safe Fix

Make validation route-discriminated:

- `route: "run"` requires `outputId` and `execution`.
- `route: "transform"` requires transform execution/persistence fields according to transform status.
- `route: "batch"` requires step counts/steps.
- `route: "retrieve"` requires evidence array and/or source/recovery according to action.
- Router config requires `enabled`, `profile`, `postToolRouting`, `storagePolicy`, `thresholds`, and `vault` after normalization.

---

## OR-007 — Vault `expand` can mix evidence from one output with another output

**Severity:** P1
**Area:** exact recovery / evidence identity

### Evidence

Vault expand validates that evidence is vault-shaped but not that the evidence output ID matches the requested source output ID:

- `router/src/tools/search.ts:590-604`
- `router/src/tools/search.ts:615-637`

Local repro:

1. Query output A and capture its evidence packet.
2. Call `expand` with `source.outputId` for output B but pass output A's evidence packet.
3. Result excerpt comes from B, while preserving A's evidence ID.

### Problem

Evidence identity can drift. A caller can accidentally or intentionally expand the wrong output while retaining a previous evidence handle.

### Why It Matters

Exact recovery must not mix coordinates. This can create misleading citations or wrong debugging context.

### Smallest Safe Fix

Before expanding vault evidence, validate:

- `evidence.source.kind === "vault"`
- `evidence.source.outputId === options.source.outputId`
- evidence stream is compatible with requested stream or default resolved stream
- evidence line range parses and is valid for that output

Return a structured error on mismatch.

### Regression Test

Query output A, expand against B, and assert `toolStatus: "error"` or failed routing with a clear mismatch message.

---

## OR-008 — Processing result records lack exact recovery identifiers in stored persistence

**Severity:** P1
**Area:** processing persistence / vault recovery

### Evidence

`persistProcessingResultText` passes custom persistence into `storeTextOutput`:

- `router/src/processing/engine.ts:547-555`

`storeTextOutput` normally creates exact persistence with `outputId` and `recoveryOutputId`.

Local repro:

- `processSource()` result persistence included an output ID.
- `readVaultRecord(...).persistence` for that output was only `{ status: "vaulted", recoverability: "exact" }`.

### Problem

The returned result and stored vault record disagree. The stored record says exact, but lacks explicit recovery identifiers.

### Why It Matters

Vault index/status/recovery code may depend on persistence identity fields. Missing identifiers weaken exact recovery contracts and can produce inconsistent explanations.

### Smallest Safe Fix

Omit the custom `persistence` argument so `storeTextOutput` sets exact persistence, or pass exact persistence with `outputId`/`recoveryOutputId` after record creation through a helper that cannot drift.

### Regression Test

Process a repo file, read the stored vault record, and assert exact persistence includes `outputId` and `recoveryOutputId`.

---

## OR-009 — Repo broad search lacks global traversal budget

**Severity:** P2
**Area:** repo search performance / memory / responsiveness

### Evidence

Repo traversal only has per-file size skip and skip dirs; it does not track total directories, files, or bytes:

- `router/src/repo/repo-traversal.ts:87-100`

Local traversal has budgets:

- `router/src/local/local-traversal.ts:33-35`
- `router/src/local/local-traversal.ts:257-272`

Search reads every collected repo file into memory before scoring:

- `router/src/tools/search.ts:1351-1406`

### Problem

Broad repo search can traverse and read too much in large repos. Skipping `node_modules`, build outputs, and large files helps, but does not bound total work.

### Why It Matters

Output router is supposed to reduce context and avoid runaway producer output. A repo-wide search should also avoid runaway traversal latency/memory.

### Smallest Safe Fix

Mirror local traversal budgets for broad repo scans:

- max directories
- max files
- max total bytes

When exceeded, return a routed error telling the agent to narrow `source.path` or query. Keep explicit path retrieval available.

### Benchmark/Test

Add a synthetic large-repo fixture that exceeds file/byte budgets and asserts bounded failure behavior.

---

## OR-010 — Vault index uses whole-JSON read/sort/write paths

**Severity:** P2
**Area:** vault-wide search performance / storage scale

### Evidence

Index write reads full state, filters, pushes entries, and writes pretty JSON:

- `router/src/vault/vault-index.ts:167-186`
- `router/src/vault/vault-index.ts:333-349`

Query reads full state, scores all filtered entries, sorts all matches, then slices topK:

- `router/src/vault/vault-index.ts:199-211`

Current vault-index benchmark has small fixture coverage.

### Problem

This is acceptable for small local vaults but will degrade as sessions accumulate many routed outputs/chunks.

### Why It Matters

Vault-wide retrieval is one of the router's recovery and context-saving features. Slow query/write paths can make agents avoid it or fall back to broad native tools.

### Smallest Safe Fix

First add scale evidence:

- 1k and 10k indexed chunks
- p50/p95 query latency
- write latency
- RSS/memory if practical

Then optimize only measured bottlenecks:

- maintain bounded topK heap instead of sorting all matches;
- consider compact JSON write if pretty formatting is material;
- consider append-only or sharded sidecar before adopting SQLite or persistent indexing by default.

### Stop Condition

Ask before adopting a new persistent index backend or making persistent indexing default behavior.

---

## OR-011 — Processing renderer can exceed `maxVisibleBytes`

**Severity:** P2
**Area:** model-visible output cap / renderer contract

### Evidence

Truncation appends marker after slicing up to `maxBytes`:

- `router/src/processing/renderers.ts:219-238`

Local repro: `maxVisibleBytes: 20` returned 36 bytes because `\n… [truncated]` was added after the slice.

### Problem

`maxVisibleBytes` is not a hard cap in the normal truncation path.

### Why It Matters

Renderer caps are part of output-router's context-saving promise. A cap that can be exceeded makes benchmark and safety assumptions fuzzy.

### Smallest Safe Fix

Subtract marker bytes before slicing in the non-required-prefix path. Keep any intentional safety-prefix exception explicit and covered by tests.

### Regression Test

Assert byte length is `<= maxVisibleBytes` for normal truncation.

---

## OR-012 — Search and tiny outputs are still too verbose

**Severity:** P2
**Area:** model-visible output UX / context savings

### Evidence

Latest final Context Mode comparison says search is correct but verbose:

- Freeflow search: 5/5 correct, 13/13 facts, 12,480 visible bytes, 29.79% reduction, ~22ms avg.
- Context Mode search: 5/5 correct, 13/13 facts, 6,714 visible bytes, 62.23% reduction, ~1.2ms avg.
- See `docs/handoffs/output-router/2026-06-28-freeflow-context-mode-parity-final-handoff.md:100-106` and `evals/reports/runtime/context-mode-real-deep-final-slice-11-review.md:37-44`.

Tiny raw outputs are also verbose:

- 20B -> 545B for metadata-only small success.
- 20B -> 370B for preserve-full small success.
- See `evals/reports/runtime/context-mode-real-deep-final-slice-11-report.md:49-51`, `63-71`.

### Problem

Correctness and exact recovery improved, but model-visible output still carries too much routing/recovery overhead for small or search-heavy cases.

### Why It Matters

This is the next explicit handoff priority. If agents see hundreds or thousands of bytes for tiny/simple evidence, they may avoid routed tools.

### Smallest Safe Fix

- Add a tiny-success compact path in Pi compact text and/or run renderer.
- Compact `freeflow_search` evidence rows while preserving path, line range, excerpt, and exact recovery hints.
- Keep full structured details in `details.result`.

### Regression/Benchmark

Gate with fixture rows for:

- small successful command default storage;
- small successful command `preserve=full`;
- repo query rows from the Context Mode comparison;
- compact renderer output byte budgets.

---

## OR-013 — Benchmarks do not fully measure Pi public model-visible text

**Severity:** P2
**Area:** benchmark fidelity

### Evidence

The deep Context Mode benchmark uses a custom `freeflowText()` extractor:

- `router/src/benchmarks/context-mode-real-deep-benchmark.ts:1404+`

Pi public tools return compact text from Pi utilities:

- `pi-extension/src/router-tools.ts:403-409` for search result content
- `pi-extension/src/utils.ts:82+` for compact search/run/batch text helpers

### Problem

The benchmark may not match actual model-visible text emitted by Pi tools. It can overstate or understate the real UX impact.

### Why It Matters

Future output compacting work should measure the public path that agents actually see.

### Smallest Safe Fix

Add public-path benchmark rows that render through Pi compact helpers for `freeflow_search`, `freeflow_run`, `freeflow_batch`, transform, and tiny-output cases.

---

## OR-014 — Pi runtime imports broad router barrel that also exports benchmarks

**Severity:** P3
**Area:** runtime module seam / startup coupling

### Evidence

Pi imports from the root router barrel:

- `pi-extension/src/router-tools.ts:1`
- Similar imports appear in `pi-extension/src/native-safety-net.ts`, `runtime-context.ts`, `observed-tool-routing.ts`, `status.ts`, and `settings-ui.ts`.

The barrel exports benchmarks:

- `router/src/index.ts:4-12`
- `router/src/index.ts:28`

### Problem

Pi runtime import surface is coupled to benchmark/eval modules and their transitive load surface.

### Why It Matters

It increases startup fragility and makes runtime package boundaries harder to reason about.

### Smallest Safe Fix

Add a runtime-only barrel, or import needed runtime modules directly from compiled subpaths.

---

## OR-015 — Transform call renderer exists but is not wired

**Severity:** P3
**Area:** TUI polish / shallow code

### Evidence

`renderFreeflowTransformCall` exists:

- `pi-extension/src/renderers.ts:281-286`

`freeflow_search` always uses generic call renderer:

- `pi-extension/src/router-tools.ts:413-415`

### Problem

Transform calls lose operation labels in TUI, and the unused helper adds shallow-module noise.

### Smallest Safe Fix

Use `renderFreeflowTransformCall` when `args.action === "transform"`, or delete it if generic rendering is intentional.

---

## Cross-Cutting Observations

### Large files are carrying too many concepts

Current file sizes:

```text
router/src/transform/engine.ts    ~2541 lines
router/src/tools/search.ts        ~1611 lines
router/src/tools/run.ts           ~1558 lines
pi-extension/src/renderers.ts      ~929 lines
router/src/vault/vault.ts          ~861 lines
router/src/tools/batch.ts          ~700 lines
```

Not every large file is wrong, but the audit found issues where public contracts, normalization, routing, persistence, rendering, and benchmarks are tangled. Future fixes should prefer deepening modules around stable seams rather than adding more conditionals to these files.

Likely seams:

- `search` action contract/result shaping
- transform result adapter/wrapper
- vault session identity/pathing
- repo traversal budget policy
- compact renderer byte budgets
- public batch step kinds vs internal delegation operations

### Handoffs remain guidance, not authority

The latest handoff correctly identified search verbosity and tiny-output overhead as next priorities. It did not mention several correctness/security issues found in this audit. Fix correctness/security first, then return to compactness.

## Suggested Fix Order

1. OR-001, OR-002, OR-007, OR-008 — correctness and exact recovery.
2. OR-003 — batch/delegation ownership and mutation scheduling.
3. OR-004, OR-005, OR-006 — public transform/schema/validation contracts.
4. OR-009, OR-010 — performance guardrails and scale evidence.
5. OR-011, OR-012, OR-013 — renderer caps, compact output, public-path benchmarks.
6. OR-014, OR-015 — runtime seam and TUI cleanup.

## Useful Verification Commands

Run only after accounting for unrelated working-tree changes.

```sh
npm run build:router
npm run test:router
node --test router/tests/tools/run.test.js
node --test router/tests/tools/search.test.js
node --test router/tests/vault/vault.test.js router/tests/vault/vault-index.test.js
node --test router/tests/processing/renderers.test.js router/tests/processing/engine.test.js
npm run bench:router:context-mode-real-deep
npm run bench:router:context-mode-normalized
npm run bench:router:vault-index
git diff --check && git diff --cached --check
```
