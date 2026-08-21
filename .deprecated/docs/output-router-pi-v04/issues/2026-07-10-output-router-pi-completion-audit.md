# Output Router Pi Completion Audit

> **Doc ID:** ISSUE-2026-07-10-output-router-pi-completion
> **Date:** 2026-07-10
> **Owner:** Hassan Mohiddin
> **Type:** Consolidated issue inventory
> **Status:** Open
> **Last Updated:** 2026-07-12
> **Area:** Host-neutral Output Router core and Pi reference adapter
> **Source:** Live source/tests through `048f6ce`; seven specialist audits; targeted and fresh-context artifact reviews; bounded interface prototypes; current-consumer, migration, and contract matrices; eight-agent anti-slop review with parent adjudication; focused runtime evidence.

## Purpose

Record the evidence and findings that must be resolved before the host-neutral Output Router core and Pi adapter can be called complete.

This supersedes the narrower `2026-07-09-output-router-audit-issues.md`. Settled target behavior and the rolling execution route live in:

- `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
- `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`

Live source, tests, current plugin docs, and installed behavior remain authoritative for v0.3. This audit records defects, risks, consumer evidence, and gaps. It does not claim the target is implemented.

## Evidence Boundary

The review covered core contracts, vault/recovery, search/indexing, processing, run/batch, observed routing, native safety-net/lifecycle, Pi integration, configuration, packaging, benchmarks, and compatibility.

A bounded learning slice compared:

- a deep outcome-level Router Engine; and
- a caller-composed `capture → commit → derive → decide` receipt pipeline.

The outcome-level direction hid more policy and prevented more unsafe caller choreography. Receipts remain useful only as private capabilities. Neither prototype proved production storage, real Pi recovery, or crash behavior.

A later anti-slop review inspected current source rather than equating size with complexity. It found four root complexity generators:

1. overlapping result states instead of closed outcomes;
2. request/config meaning duplicated across core types, validators, Pi schemas, and adapters;
3. persistence/disposition/replacement policy owned independently by run, observed, and native paths;
4. compatibility reach broader than the intended product boundary.

Focused parent verification on 2026-07-12 passed 133/133 search, batch, vault/index, observed-producer, and Pi extension tests against tracked dist. Those tests characterize current behavior; they do not prove the target. A broader reviewer run reported 329/330 router tests, with one ambient-cache-dependent Eryx integration failure. No clean build, dist-equivalence check, or installed-Pi target smoke has passed yet.

## Severity

- **P0:** isolation/privacy breach, evidence loss, unsafe unbounded work, or false accuracy/integrity claim.
- **P1:** public contract, compatibility, cancellation, recovery, correctness, or integration defect blocking Pi completion.
- **P2:** performance, resilience, packaging, UX, migration, or maintainability issue requiring an acceptance gate.
- **P3:** local cleanup that must not distract from P0/P1 work.

## Executive Findings

The router has earned complexity worth preserving: containment checks, bounded UTF-8 evidence, exact-range recovery, producer-specific abstaining reducers, script isolation, observed-before-native precedence, typed Pi rendering, and tracked ready-to-run dist.

It is not implementation-ready under the previous artifact shape because:

- recovery handles were not callable through the public request contract;
- public results exposed scope, generation, record, representation, and storage machinery;
- result variants overlapped and validators accepted optional-property bags;
- callers separately coordinated commit, cleanup, cancellation, reduction, replacement, and failure;
- V1 lacks collision-safe identity, trusted access, verified recovery, atomic visibility, and enforced deletion;
- V1 component markers were treated too much like a whole-vault version;
- Pi-specific representation/storage mechanics were frozen into the host-neutral core;
- the plan was horizontal and integrated the installed Pi seam too late;
- current packaging physically exposes broad internals without defining support;
- compatibility, stale handles, config aliases, and removal proof were incomplete.

Accuracy and complete-task efficiency remain the objective. A smaller response is not success if it loses facts, forces avoidable calls, weakens privacy, or makes recovery unreliable.

---

## A. Vault, Persistence, Recovery, And Legacy State

### VLT-001 — P0 — Scope identity is collision-prone

Lossy session sanitization lets distinct IDs share indexes and locks; cwd fallback merges conversations.

**Required outcome:** collision-safe opaque scope/generation supplied by the host; no cwd fallback.

### VLT-002 — P0 — Event, record, output, and blob identity are conflated

Current IDs derive from one payload hash while mutable metadata and scope semantics remain separate.

**Required outcome:** unique scope-owned event and representation records; immutable exact blobs; internal dedupe cannot leak equality.

### VLT-003 — P0 — Persistence labels do not enforce stored shape

Metadata-only can retain or index content-bearing metadata, while other shapes imply exactness without exact bytes.

**Required outcome:** structural `exact`, `metadata-only`, and `none`; metadata-only contains no Freeflow content, paths, identifiers, hashes, fingerprints, excerpts, error text, or searchable tokens.

### VLT-004 — P0 — Writes lack one authoritative visibility transaction

Bytes and metadata can exist before session-index append; a reported failure can leave orphan content.

**Required outcome:** private staging, one canonical visibility point, truthful retained/cleanup disposition, derived indexes after commit, and crash reconciliation.

### VLT-005 — P0 — Exact recovery does not verify integrity

Current recovery trusts session membership, object metadata, and stored paths without complete containment/linkage/hash/count checks.

**Required outcome:** verify scope, generation, authorization, containment, record/representation linkage, stream, bytes, and digest before returning content.

### VLT-006 — P0 — Retention is metadata, not deletion

Current reads ignore expiry; `deleteExpired` removes only derived sidecar entries. An invalid timestamp can remove all finite-expiry sidecar entries.

**Required outcome:** active/closed/abandoned/tombstoned/purged lifecycle; immediate denial at tombstone; asynchronous physical purge; no V1 deletion claim from index cleanup.

### VLT-007 — P1 — Index health can be falsely reported

Missing/corrupt/stale indexes do not reliably compare against or rebuild from canonical records.

**Required outcome:** canonical records are authoritative; indexes are bounded, derived, partitioned, verifiable, and rebuildable.

### VLT-008 — P1 — Recovery lineage and source identity can cross

Source, projection, stream, and derived coordinates can be applied to the wrong representation.

**Required outcome:** internal representation identity and lineage remain explicit; public callers receive opaque evidence/recovery capabilities rather than storage IDs.

### VLT-009 — P1 — Metadata and filesystem privacy are underspecified

Permissions depend on ambient umask and roots/path metadata can expose user data.

**Required outcome:** owner-only files/directories, safe roots, realpath containment, private staging, permission audit/repair, and no unnecessary model-visible paths.

### VLT-010 — P2 — Active-scope growth is unbounded

TTL does not bound active scopes and one operation can consume the store.

**Required outcome:** evidence-driven quotas, reservation for explicit producers, warnings before hard failure, and no silent active eviction.

### VLT-011 — P0 — Exact representations lack a stable codec contract

Typed Pi blocks, strings, command streams, media, and derived values are not canonicalized consistently.

**Required outcome:** host-neutral canonical representation contract; host codecs own Pi block mechanics; binary remains typed and outside model text/indexes.

### VLT-012 — P0 — Trusted principals and grants are absent

Request-provided roots/session IDs and output IDs are treated as authority.

**Required outcome:** adapter-supplied scope binding, principal, claims, and grants enforced before direct recovery, expansion, transform, search, and deletion.

### VLT-013 — P0 — Quota and explicit-producer overflow semantics are undefined

Observed output can pass through after persistence rejection, but explicit run has no pre-existing host output to fall back to.

**Required outcome:** preflight bounded reservation, execute-once capture, truthful exact subset at limit, and no unbounded fallback.

### VLT-014 — P1 — V1 has no whole-root version marker

`session index version:1` and `index/v1` are component markers; `index/v1` alone may be orphaned derived state.

**Required outcome:** read-only detector reports primary, derived-only, corrupt, mixed, unclassified, and unsupported state separately; detection never creates, locks, renames, or deletes.

### VLT-015 — P0 — Normal model-facing V1 recovery cannot satisfy V2 access rules

V1 identities collide and lack principal/grant binding. A caller-supplied root/session/output interface would expose cross-session risk.

**Required outcome:** V1 remains isolated and owner-operated offline recovery/export only; no model-facing V1 search/recovery; no V2 handles or V2 writes from export.

### VLT-016 — P1 — Downgrade and stale-handle behavior were incomplete

Old binaries can ignore V2 state and resume V1 writes; old transcript handles can survive code upgrades.

**Required outcome:** first committed V2 primary transaction makes that logical scope forward-only; stale V1 handles return a bounded `legacy_handle` finding without filesystem reads; V1 and V2 never share writes or indexes.

---

## B. Search, Retrieval, And Indexing

### SRC-001 — P0 — Request data can override trusted scope

**Required outcome:** trusted context is injected, never caller-selected.

### SRC-002 — P0 — Regex can block the Pi event loop

**Required outcome:** bounded RE2-compatible deterministic subset; advanced matching only in explicitly enabled proof-backed sandbox.

### SRC-003 — P1 — Global/sticky regex can skip matches

**Required outcome:** safe compilation and adversarial Unicode/multiline/empty/global/sticky tests.

### SRC-004 — P1 — Full fidelity and range caps disagree

**Required outcome:** exact-under-cap plus opaque continuation/recovery; never unlimited model injection.

### SRC-005 — P1 — Chunking can omit searchable lines

**Required outcome:** complete bounded searchable coverage; current bytes verified before evidence emission.

### SRC-006 — P1 — Repository work can become superlinear

**Required outcome:** evidence-selected per-worktree derived index with bounded live fallback.

### SRC-007 — P1 — Persistent indexing does not yet meet worktree semantics

**Required outcome:** tracked plus untracked non-ignored live text, worktree isolation, generated/sensitive exclusions, and stale-candidate verification.

### SRC-008 — P1 — Vault search reparses whole state

**Required outcome:** scope-local producer-partitioned derived index; benchmark backend before adoption.

### SRC-009 — P2 — External-root persistence lacks consent

**Required outcome:** bounded live traversal and temporary scope-local index by default; persistent root requires separate consent.

### SRC-010 — P1 — Confidence lacks calibrated abstention

**Required outcome:** deterministic operations report validation/integrity; inferential routes use route-specific calibrated top-one/top-K/abstention.

### SRC-011 — P0 — Recovery capabilities were publicly unreachable

Results exposed recovery handles, but no request branch redeemed them.

**Required outcome:** `freeflow_search action="recover"` redeems an opaque V2 capability under trusted scope/access checks. Source-based `retrieve` and evidence `expand` remain distinct.

### SRC-012 — P1 — Public results reveal source/storage machinery

The previous target exposed worktree/root/scope/generation/record/representation IDs directly.

**Required outcome:** public evidence uses safe source labels/coordinates and opaque capabilities; internal identity remains private.

---

## C. Core Contracts, Processing, Disposition, And Batch

### CORE-001 — P0 — Runtime results are overlapping optional-property bags

Types and validators do not close route-local fields; batch and renderers infer variants by probing.

**Required outcome:** small versioned public outcome union plus separate internal transaction/diagnostic records. Distinct tool, execution, and routing facts survive only in branches where they apply.

### CORE-002 — P0 — Validation can throw or happen after side effects

**Required outcome:** closed request decoder validates before reads, execution, persistence, or child dispatch; invalid input returns structured guidance.

### CORE-003 — P1 — Transform has competing contracts

**Required outcome:** one `freeflow_search action=transform` contract over repo/local/vault.

### CORE-004 — P0 — Script enablement can widen unexpectedly

**Required outcome:** omitted and `languages:[]` disable; explicit allowlist; proof-backed isolation; no ambient host fallback or reusable persisted code hash.

### CORE-005 — P1 — Cancellation is not end to end

**Required outcome:** one operation context reaches all work; pre/post-commit behavior is explicit; late work cannot patch final output.

### CORE-006 — P1 — Reducers can select stale or invented facts

**Required outcome:** fact provenance, terminal-run semantics, missing remains missing, ambiguity returns candidates or abstention. Existing reducers are retained unless eval evidence disproves value.

### CORE-007 — P1 — Router batch owns delegation lifecycle

Unknown delegation payloads are cast to router results and status is probed with `any`.

**Required outcome:** router batch owns independent search/run/transform only; delegation migrates to its own lifecycle and narrow evidence seam before removal.

### CORE-008 — P1 — Command arrays lose argv boundaries

**Required outcome:** shell text and executable/argv remain distinct.

### CORE-009 — P1 — Run can lose evidence before durable capture

**Required outcome:** validate → execute once → capture → required exact commit → derive → render; parser failure uses same capture.

### CORE-010 — P2 — Config semantics drift across layers

**Required outcome:** one config/effective-state authority and a field-by-field migration contract.

### CORE-011 — P0 — One scalar result cannot describe multiple representations safely

The previous remedy overcorrected by exposing internal descriptors publicly.

**Required outcome:** internal canonical records may be rich; public results expose bounded evidence and opaque recovery only.

### CORE-012 — P1 — Expansion handles are not source-bound

**Required outcome:** opaque expansion capabilities bind the original safe source and range before reading.

### CORE-013 — P1 — Caller budgets can widen hard caps

**Required outcome:** per-call budgets only tighten configured limits; final wrappers are included.

### CORE-014 — P1 — Batch identity/status is ambiguous

**Required outcome:** unique client step IDs, server call IDs, closed child outcomes, and coordinator state separate from child status.

### CORE-015 — P0 — Disposition policy is scattered

Run, observed routing, and native safety net independently decide persistence, dedupe, reduction, recovery, cancellation, warning patches, and cleanup.

**Required outcome:** outcome-level Router Engine with explicit and observed operations; one private disposition/commit owner; lifecycle-specific adapters remain distinct; receipts are private.

### CORE-016 — P1 — Post-commit failure can escape the closed outcome

Preview/render errors or best-effort discard can leave durable orphaned evidence without a truthful outcome.

**Required outcome:** preview is bounded and non-throwing; after commit the outcome records retained recoverability or durable reconciliation—never an unverified cleanup claim.

### CORE-017 — P2 — Singleton/reserved options create speculative state axes

`profile`, `strict`, `redacted`, and other one-value choices are normalized/displayed despite no supported variation.

**Required outcome:** fixed security invariants remain reported capabilities; unsupported/reserved choices become migration findings, not permanent config axes.

### CORE-018 — P2 — Local duplication obscures ownership

Repo/local action dispatch, neutral traversal mechanics, sandbox-adapter discovery, warning dedupe, and duplicate render helpers add avoidable coordination.

**Required outcome:** simplify only when the owning contract is stable; preserve local privacy policy and package compatibility; do not let cleanup distract from the vertical proof.

---

## D. Observed MCP, Web, Fetch, Code Search, And Native Safety

### OBS-001 — P0 — Real MCP direct/proxy shapes are not reliably identified

### OBS-002 — P0 — Fetch content can be flattened or lose typed media

### OBS-003 — P1 — Full-content retrieval bypasses policy/lineage

### OBS-004 — P0 — Replacement can occur without fact-complete recoverability

### OBS-005 — P1 — Per-server persistence is too coarse

### OBS-006 — P1 — Web/fetch/code-search policies are mixed

### OBS-007 — P1 — Host error and advisory risk observations disappear

### OBS-008 — P0 — Fail-open can return the wrong Pi representation

### OBS-009 — P1 — Settings can silently alter displayed persistence

### OBS-010 — P1 — Host-tool identity/filtering is inconsistent

**Required observed outcome:** use full installed registration/call/result/lifecycle fixtures; preserve ordered typed content, host details, and `isError`; keep producer families separately configured and off by default; exact tool override precedes server default; conflicts or unsupported shapes return no patch and no observed persistence.

### SAFE-001 — P0 — Truncated native output can be labeled exact

### SAFE-002 — P0 — Metadata-only/none cannot support lossy replacement

### SAFE-003 — P1 — Hooks can route one event twice

### SAFE-004 — P1 — Hook-stage exactness is overclaimed

### SAFE-005 — P1 — Broad native enforcement lacks evidence

**Required native outcome:** only `off|safety-net`; safety-net opt-in; complete capture and exact recovery before replacement; subset remains subset; idempotent observed-before-native ordering; guidance-first native behavior; no patch on failure.

---

## E. Pi Adapter, Configuration, Packaging, And Tests

### PI-001 — P1 — Preserve current effective-state behavior and close side-effect gaps

Current main already hides/blocks disabled layers and refreshes context. Preserve it while proving the complete truth table and zero disabled side effects.

### PI-002 — P1 — Pi schemas and core validators disagree

**Required outcome:** one semantic decoder and shared contract fixtures; Pi supplies JSON schema and trusted host context without re-owning meaning.

### PI-003 — P1 — Compact output is not consistently sufficient or bounded

**Required outcome:** one safe presentation view model feeds compact model output and richer TUI; no raw duplication.

### PI-004 — P1 — Freeflow details can duplicate raw content

**Required outcome:** bounded Freeflow-owned details; measure but do not claim control over host-owned session persistence.

### PI-005 — P1 — Settings writes are unsafe for malformed/concurrent config

**Required outcome:** lock, validate, backup, atomic replace; failure reports unsaved and triggers no success reload.

### PI-006 — P1 — Status, doctor, and migration are conflated

**Required outcome:** bounded action-specific diagnostics; migration findings are non-destructive.

### PI-007 — P1 — Release can publish stale generated runtime

**Required outcome:** clean build, source/dist equivalence, runtime import graph, package allowlist, and installed manifest smokes.

### PI-008 — P2 — Current docs describe superseded behavior

**Required outcome:** update user docs only after implementation evidence exists.

### PI-009 — P1 — The intended package support boundary was undefined

The package physically exposes router internals, benchmarks, experiments, Pi source/tests, and eval history without an exports fence.

**Required outcome:** v0.4 supports the Pi manifest entrypoint only. Pi uses one narrow internal runtime facade; deep/barrel subpaths are compatibility debt, not new API.

### PI-010 — P1 — Pi adapter owns core policy

`native-safety-net.ts`, `router-tools.ts`, status/settings, and renderers duplicate routing, persistence, request, config, and recovery meaning.

**Required outcome:** Pi decodes/injects/applies; core owns contracts and disposition; Pi keeps host codecs, lifecycle, execution, TUI, and hook mechanics.

### PI-011 — P2 — Config warnings are process-global

One repo/session can suppress another's identical warning.

**Required outcome:** scope warning dedupe by repo/session when this area is migrated.

### PI-012 — P2 — Sandbox integration tests depend on ambient cache discovery

A package directory can be discovered without a working runtime, making tests environment-sensitive.

**Required outcome:** hermetic unit adapters and explicit provisioned integration gates before release claims.

---

## F. Compatibility, Migration, And Removal

### MIG-001 — P1 — Consumer inventory is incomplete

Known consumers include Pi source/dist, tests/evals, docs/skills, config files, V1 state, transcripts/handles, package paths, and delegation batch. External npm/Git/deep-import consumers and historical V1 roots remain unknown.

**Required outcome:** distinguish supported Pi entrypoint, internal facade, accidental packed paths, persisted state, and unknown consumers. Missing telemetry is not zero usage.

### MIG-002 — P1 — v0.3 → v0.4 differences lack one removal contract

Requests, results, run forms, batch, status, config, recovery, observed replacement, and package paths all change.

**Required outcome:** expand–migrate–contract by consumer unit; temporary shims only with named consumers, owner, failure behavior, exit condition, and removal proof.

### MIG-003 — P1 — Legacy config behavior is scattered

Known aliases include top-level observed/script sections and flat threshold/vault/hint fields; `strict`, `redacted`, `capture`, providers, and legacy storage policy are obsolete.

**Required outcome:** canonical field table; findings without silent rewrite; explicit confirmed migration; malformed values never become defaults; legacy requests get structured upgrade guidance.

### MIG-004 — P1 — V1 recovery/export and deletion were conflated

Detection, logical isolation, physical move, export, and deletion have different safety contracts.

**Required outcome:** detection is read-only; logical isolation is automatic; offline owner export is explicit and contained; physical move/delete is separately confirmed after writer quiescence.

### MIG-005 — P1 — Package compatibility is accidentally broad

**Required outcome:** migrate Pi/evals to the narrow internal facade, prove packed install, define an export fence, then remove broad barrel/subpaths only after consumer evidence and a declared compatibility route.

### MIG-006 — P1 — Delegation batch removal needs an owner handoff

**Required outcome:** migrate delegation consumers to delegation-owned lifecycle first; preserve mutation confirmation until replacement is verified; then remove router kinds/casts.

### MIG-007 — P2 — Historical evals and docs can look current

**Required outcome:** preserve audit history, mark superseded reports, keep maintained commands resolvable, and publish only the curated evidence required by the approved package contract.

---

## G. Performance And Acceptance Evidence

### PERF-001 — P1 — Benchmarks do not measure complete public Pi tasks

### PERF-002 — P1 — Accuracy is not the primary gate everywhere

### PERF-003 — P2 — Cold and warm costs are mixed

### PERF-004 — P2 — Comparator paths are not consistently public/fair

### PERF-005 — P2 — Resource ceilings are unproven

**Required outcome:** packed Pi manifest path; absolute correctness first; complete-task bytes/tokens/calls including retries/recovery/setup; disjoint calibration/selection/final holdouts; cold/warm distributions; memory/event-loop/cancellation/I/O evidence; strict Pareto default.

---

## H. Integration And Plan Risk

### INT-001 — P1 — Implementation ancestry remains a gate

The docs worktree is based on `048f6ce`; main can move before implementation.

**Required outcome:** commit accepted governing artifacts, then create a clean implementation worktree descending from the docs commit and current main; record ancestry.

### INT-002 — P1 — Original checkout contains unrelated delegation/Pi WIP

**Required outcome:** never write or regenerate dist there; one integration owner reconciles later.

### INT-003 — P2 — Older specs conflict with this target

**Required outcome:** this spec supersedes target behavior where conflicting; live docs remain current until implementation.

### INT-004 — P1 — The previous plan was horizontal and integrated Pi too late

It froze broad contracts/storage/search before proving a callable installed outcome, increasing the risk of another large unverified architecture.

**Required outcome:** first implementation horizon is one packed-Pi text-only vertical proof; later phases remain directional and are refined from evidence.

### INT-005 — P2 — Over-cleanup could destroy earned behavior

Reducers, containment, tracked dist, typed Pi content, V1 evidence, and compatibility surfaces can look large or old without being removable.

**Required outcome:** simplify behavior-preservingly; migrate consumers before deletion; preserve historical evidence; use removal proof rather than line count.

## Evidence Index

This dated index makes the findings independently traceable. Live files/tests are the primary evidence; reviews and prototypes are interpretation aids, not implementation proof.

| Audit IDs | Primary live evidence at `048f6ce` | Characterization/verification evidence |
|---|---|---|
| `VLT-001–016`, `MIG-004` | `router/src/vault/vault.ts`, `router/src/vault/vault-index.ts`, `router/src/config/types.ts`, `router/src/config/config.ts`, `router/src/tools/search.ts` | `router/tests/vault/vault.test.js`, `router/tests/vault/vault-index.test.js`, vault/search cases in `router/tests/tools/search.test.js` |
| `SRC-001–012` | `router/src/tools/search.ts`, `router/src/evidence/**`, `router/src/repo/repo-traversal.ts`, `router/src/local/local-traversal.ts`, transform/regex modules | `router/tests/tools/search.test.js`, repo/local/evidence/transform suites, isolated regex/shape repros from the 2026-07-10 audit |
| `CORE-001–018` | `router/src/config/types.ts`, `router/src/config/schema.ts`, `router/src/config/config.ts`, `router/src/tools/{search,run,batch}.ts`, `router/src/processing/**`, `router/src/routing/**` | config/schema, tools, processing, reducer, cancellation, and batch suites under `router/tests/**` |
| `OBS-001–010` | `router/src/routing/observed-routing.ts`, `pi-extension/src/observed-tool-routing.ts`, `pi-extension/src/host-producer-identification.ts` | `pi-extension/tests/pi-observed-producers.test.js`, observed cases in `pi-extension/tests/pi-extension.test.js`, installed-shape research summarized by the specialist audit |
| `SAFE-001–005` | `pi-extension/src/native-safety-net.ts`, `pi-extension/src/index.ts`, Pi built-in result handling | native/ordering/fail-open cases in `pi-extension/tests/pi-extension.test.js` |
| `PI-001–012` | `pi-extension/src/{index,router-tools,schemas,renderers,utils,runtime-context,status,settings-ui}.ts`, `router/src/index.ts`, `package.json`, `pi-extension/freeflow/index.js` | `pi-extension/tests/**`, runtime-context checks, package metadata validator, package inventory/dry-run |
| `MIG-001–007` | current config normalizers/settings/status, v0.3 result/output IDs, V1 layout, router barrel/imports, batch delegation kinds, docs/skills/evals | source/import searches, old/new contract matrix, config fixtures, package inventory, stale-handle/V1 fixture requirements |
| `PERF-001–005` | `router/src/benchmarks/**`, benchmark scripts and current eval reports | `evals/README.md`, later runtime reports including the final Context Mode deep slice; public-path gaps remain findings |
| `INT-001–005` | Git/worktree state, docs map, current main ancestry, original dirty checkout manifest, prior specs/plans | `git status`, `git rev-parse`, worktree containment checks, docs link/structure verification |

Recorded commands/results used by this revision:

- `node --test router/tests/tools/search.test.js router/tests/tools/batch.test.js router/tests/vault/vault.test.js router/tests/vault/vault-index.test.js pi-extension/tests/pi-observed-producers.test.js pi-extension/tests/pi-extension.test.js` — 133/133 passed on 2026-07-12 against tracked dist.
- focused V1 vault suites — 17/17 passed during the migration review.
- Pi tracked-dist suite — 106/106 passed during package review.
- broad tracked-dist router suite — 329/330 passed; one Eryx integration was ambient-cache-dependent and remains `PI-012`, not a product pass/fail claim.
- `npm pack --dry-run --json` — observed broad physical package exposure; it does not prove publication or external consumption.
- `git diff --check`, Markdown fence/link/whitespace checks, and worktree status — passed for the governing-doc rewrite before review pass 1.

The bounded interface prototypes were temporary learning artifacts: the outcome-level engine suite passed 10/10 and the authoritative receipt-pipeline suite passed 11/11. Independent comparison favored the outcome-level public topology while retaining private single-use receipts. A later staged operation-catalog prototype passed 19/19 closure/security/maturity checks after a terminal review exposed and corrected duplicate range/budget definitions and a missing recovery-coordinate projection. The corrected catalog owns request/reply schemas, exact range/budget semantics, success/terminal shapes, codes/messages, fixtures, and projection fingerprints; it generates the decoder table, convenience types, human matrix, and false release gate. These prototypes support the design direction but are not release evidence or production source authority.

Eight fresh anti-slop review roles covered inventory, core/tools, vault/migration, Pi adapter, package/tests/evals, holistic design depth, consensus adjudication, and contrarian earned-complexity protection. Their accepted findings are consolidated into IDs above. Rejected preference/over-deletion findings are not requirements.

## Settled Owner Decisions

The owner approved these directions:

- optimize complete-task tokens/tool calls subject to absolute correctness, evidence integrity, privacy, and safety;
- adaptive deterministic retrieval with route-specific confidence and abstention;
- only `exact`, `metadata-only`, and `none`; no redacted mode;
- typed media remains typed and outside model text/text indexes;
- trusted session/task scope, generation, principals, claims, and grants;
- unique records, immutable exact content, verified recovery, retention lifecycle, quotas, and confirmed deletion;
- per-worktree live-verified repo index and scope-local producer-partitioned vault index;
- replacement only when fact-complete, exactly recoverable, and meaningfully smaller; otherwise no patch;
- only `off|safety-net`; Router and Harness off by default; Skills on after valid setup;
- explicit allowlisted scripts with proof-backed isolation and no unsafe fallback;
- router batch owns search/run/transform only;
- shell and argv execution remain distinct;
- tracked dist remains, gated by clean equivalence and real install smokes;
- v0.4 may intentionally break the Router runtime contract;
- legacy config produces findings without silent rewrite; legacy requests get structured upgrade guidance; translators exist only with consumer evidence;
- V1 remains isolated, read-only, and owner-operated offline recovery/export only; no model-facing V1 route, no mixed writes/indexes, no automatic migration;
- first committed V2 primary transaction is forward-only; downgrade is unsupported;
- `freeflow_search action="recover"` redeems V2 opaque recovery capabilities;
- recovery-handle validity is non-oracular: malformed, modified, stale, unauthorized, wrong-role, and unknown handles collapse to `invalid_recovery_handle`; only safe non-sensitive failures have distinct public codes;
- the Router Engine exposes outcome-level explicit/observed operations; receipts are private;
- public results hide scope/generation/record/representation/storage identity;
- one staged declarative operation catalog is the sole executable public-contract authority; directional operations contribute no active schema/type until their owning phase promotes them;
- Phase 1 exposes only executable public `search.recover` and hidden `observe.fetch_text` through a private eval-only manifest; v0.4 release remains blocked until every advertised operation is release-promoted;
- public model replies expose verified surviving recovery capabilities while cleanup/reconciliation stays private or human-status-only unless explicit owner action is required;
- v0.4 supports only the Pi manifest as a public package entrypoint;
- complete and verify Pi before beginning Claude/Codex adapter design.

## Exit Criteria

This issue closes only when:

1. every P0/P1 finding is fixed, migrated, or explicitly reclassified with evidence;
2. the reference specification's installed Pi completion gates pass;
3. the rolling plan's migration/removal gates prove old consumers/state are handled before deletion;
4. public-path benchmarks pass absolute correctness and the default strict Pareto rule;
5. source/dist/package/install verification passes from a clean checkout;
6. current user docs describe implemented behavior and historical evidence is clearly marked;
7. no implementation depends on or overwrites unrelated delegation/Pi WIP;
8. the owner accepts the Pi completion report.

## Change Log

- **2026-07-12:** Incorporated source-backed consumer/migration matrices, interface-learning evidence, accepted V1 recovery/export and v0.4 compatibility policy, anti-slop adjudication, the callable recovery API, outcome-level engine direction, Pi-only package boundary, the rolling-plan defect, the staged operation-authority/promotion design, and terminal-review correction of catalog/result projection closure.
