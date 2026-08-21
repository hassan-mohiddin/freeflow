# Freeflow Output Router Pi Reference Specification

> **Doc ID:** SPEC-2026-07-10-freeflow-output-router-pi-reference
> **Date:** 2026-07-10
> **Owner:** Hassan Mohiddin
> **Type:** Technical, public API, and migration specification
> **Status:** Accepted evolving target — Phase 1 complete; Phase 2 Pi identity evidence incorporated
> **Last Updated:** 2026-07-13
> **Scope:** Host-neutral Output Router core and Pi reference adapter
> **Supersedes where conflicting:** June 2026 Output Router target specs and the 2026-07-09 audit draft
> **Source:** Consolidated audit, live v0.3 source/tests, owner decisions, bounded interface prototypes, consumer/compatibility/V1 matrices, and adjudicated anti-slop review.

## 1. Purpose And Authority

Define the target required to finish the host-neutral Output Router and its Pi reference adapter before Claude Code or Codex adapter design begins.

This is target source truth, not a description of current implementation. Until implementation and acceptance land, live source/tests and current plugin docs remain authoritative for v0.3 behavior.

Owning issue inventory:

- `docs/issues/output-router/2026-07-10-output-router-pi-completion-audit.md`

Rolling execution route:

- `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`

## 2. Objective

Minimize total model-visible tokens and tool calls required to complete a correct task, subject to absolute correctness, evidence integrity, privacy, and host safety.

A smaller response is a failure when it returns the wrong source, omits required facts, causes avoidable follow-up calls, loses exact evidence, changes host semantics unsafely, persists contrary to policy, or makes an unsupported exactness claim.

## 3. Scope

### In scope

- Host-neutral request, outcome, evidence, recovery, persistence, search, processing, and cancellation contracts.
- Pi as the first complete host adapter.
- Explicit search, run, transform, recover, batch, and status operations.
- Opt-in observed routing and native safety-net behavior.
- Vault V2 and isolated owner-operated V1 recovery/export.
- Config/settings/status, package boundaries, and public-path acceptance evidence required for Pi completion.
- Migration from current v0.3 callers/config/results/state to the v0.4 contract.

### Out of scope

- Claude Code/Codex adapter design or implementation.
- Delegation lifecycle or mutation ownership.
- Normal model-facing cross-session memory/search.
- Model-assisted runtime ranking/summarization by default.
- Remote/vector databases by default.
- Redacted persistence.
- Automatic V1→V2 migration or mixed V1/V2 storage/indexing.
- Model-facing V1 recovery/search.
- Silent native-tool blocking or rewriting.
- A supported programmatic npm API beyond the Pi manifest entrypoint.

## 4. Settled Decisions

1. v0.4 may intentionally break the Output Router runtime contract.
2. The public Pi recovery call is `freeflow_search action="recover"`.
3. The Router Engine exposes outcome-level explicit and observed operations. Stage receipts, if used, are private.
4. Public results expose bounded evidence, safe coordinates, diagnostics, and opaque capabilities—not scope, generation, record, representation, journal, blob, or filesystem identity.
5. V1 is isolated and read-only. Recovery/export is an owner-operated offline operation, never a normal model-facing route.
6. V1 and V2 never share writes or indexes. No automatic migration occurs.
7. After the first committed V2 primary transaction for a logical scope/generation, downgrade is unsupported.
8. The only supported v0.4 package entrypoint is the Pi manifest. Internal runtime facades are not public API.
9. Post-tool modes are only `off` and `safety-net`.
10. Pi completion precedes separate future-host design.
11. Recovery-handle validity is non-oracular: malformed, modified, stale, unauthorized, wrong-role, and unknown handles collapse to `invalid_recovery_handle`; only safe non-sensitive recovery conditions receive distinct public codes.
12. One declarative operation catalog is the sole executable public-contract authority. Directional operations do not contribute active schemas/types until promoted by their owning phase; v0.4 release is blocked until every advertised operation is release-promoted.
13. Model-facing replies expose surviving recovery capabilities, not internal cleanup/reconciliation state. Reconciliation remains private or human-status-only unless an explicit owner action is required.

## 5. Core Invariants

1. **Accuracy first:** abstain or widen evidence rather than guess.
2. **Capture before reduction:** required exact source is secured before fallible derivation.
3. **Execute once:** recovery or parser fallback never reruns a producer silently.
4. **Exact is named and verified:** exactness applies to one representation and verified bytes.
5. **Partial is subset:** incomplete/truncated capture is never full exactness.
6. **No lossy replacement without recovery:** failed prerequisites yield no patch.
7. **Trusted context owns scope:** request payloads never select authority.
8. **Canonical records, derived indexes:** indexes are rebuildable, bounded, and non-authoritative.
9. **Typed data remains typed:** media/binary is never base64-expanded into model text or lexical indexes.
10. **Cancellation is end to end:** abort prevents new work and late replacement.
11. **Disabled is inert:** no model schema/context or storage/index/script/routing side effects.
12. **Authorization remains host-owned:** advisory risk cannot grant permission.
13. **Compact content is sufficient:** callers do not depend on hidden Pi details.
14. **Contracts close:** type, schema, decoder, runtime, compact rendering, TUI fixtures, and tests agree.
15. **One policy owner:** callers do not coordinate persistence, commit, cleanup, recovery, reduction, benefit, or no-patch policy.
16. **Compatibility is bounded:** temporary aliases/shims have named consumers, failure behavior, exit conditions, and removal evidence.
17. **One semantic authority:** Pi schemas, decoders, convenience types, result fixtures, safe messages, and human matrices are generated from or exhaustively fingerprint-checked against the operation catalog.
18. **Maturity is not protocol:** directional/executable/release state is build/release metadata and never appears in model requests, results, or tool descriptions.

## 6. Terminology

- **Scope:** one conversation session or delegation task evidence boundary.
- **Generation:** immutable scope namespace revision rotated by destructive reset/deletion.
- **Principal:** trusted caller identity and role supplied by the host adapter.
- **Canonical representation:** immutable bytes plus a versioned codec identifier.
- **Observed projection:** exact ordered host content seen at the Freeflow post-tool hook.
- **Typed source:** producer-native structured content mapped by a host codec.
- **Derived evidence:** facts, snippets, reductions, or transforms linked to canonical parents.
- **Recovery capability:** opaque, provenance-checked authority to recover one named V2 representation under current access policy.
- **Expansion capability:** opaque authority to widen one evidence packet against its original source/range.
- **No patch:** post-tool middleware returns no result mutation; Pi preserves the original event structurally.
- **Disposition:** retained recoverable evidence or durable cleanup/reconciliation state after a commit attempt.

## 7. System Boundary And Deep Interface

### 7.1 Router Engine

The host-neutral core exposes two outcome-level operations:

- **execute:** accepts one catalog-decoded executable operation plus trusted `OperationContext`; returns that operation's generated public reply and, only when required, a private opaque host-delivery bundle;
- **observe:** accepts one private captured host value plus its host codec and trusted `OperationContext`; returns private `NoPatch` or one already validated opaque replacement.

The catalog descriptor token crossing the decoder/engine boundary is private and unforgeable. Raw model arguments never reach operation logic without catalog decoding. Neither caller coordinates capture, authorization, canonicalization, persistence, derivation, benefit, cancellation, cleanup, or recovery verification.

The observed data flow is fixed:

1. Pi extracts the trusted installed registration/call/result tuple without changing the current event and wraps it as an opaque captured host value.
2. Pi supplies a host codec that can canonicalize the value, measure the original host rendering, validate/encode a host-neutral replacement view, and return an opaque host patch. The core calls the codec but never imports Pi block types or interprets Pi internals.
3. The core owns authorization, canonical commit/readback, reduction, fact completeness, benefit, cancellation, and disposition. It returns `NoPatch` or a replacement carrying the validated opaque patch plus an optional bounded public reply.
4. For observed work, Pi applies that opaque patch unchanged or returns no mutation. Pi does not revise core policy after the decision.
5. For explicit typed-media recovery, the codec materializes verified canonical bytes into a private opaque delivery bundle paired atomically with public media metadata. The bundle is never serialized into details/model text/public results and cannot exist before authorization/integrity verification.

`NoPatch`, replacement patches, catalog tokens, and typed-delivery bundles are private transports—not public APIs, receipts, or recovery capabilities.

### 7.2 Core-owned policy

The core owns:

- closed request decoding and validation order;
- operation context and cancellation/deadline semantics;
- persistence planning and disposition;
- canonical store/search/index/processing policy;
- replacement eligibility and fact completeness;
- bounded public result projection and compact presentation model;
- config/effective-state semantics and migration findings.

### 7.3 Host-owned adapters

The Pi adapter owns:

- tool registration, active visibility, and context injection;
- trusted session/task identity, principal, claims, grants, and lifecycle acquisition;
- Pi content codecs and typed media mapping;
- host approval/execution/process APIs;
- MCP/web/fetch/provider tuple extraction;
- post-tool hook application and final handler constraints;
- TUI rendering and Pi settings transport;
- diagnostics about Pi-owned session/details persistence.

The core must not import Pi block types, delegation stores/types, pane identities, or Pi filesystem/session implementation.

Installed Pi 0.80.6 evidence constrains that ownership: Pi session IDs are stable logical correlation facts across reload, resume, compaction, and process restart and rotate on new/fork, but copied session files and concurrent opens can present the same ID. Session file/header/path, cwd, and fork lineage are corroboration or provenance only. Pi lifecycle callbacks are observations and may repeat for one installed RPC transition; they must be handled idempotently and cannot themselves issue/rotate authority or mark a scope closed/abandoned. Absence findings are bounded to the inspected public extension, RPC, and session-manager seams; a future stronger identity provider requires its own trusted contract and evidence.

### 7.4 Required ports

The engine depends on narrow capability ports whose implementations may vary:

- **Authority:** validates trusted binding, claims, grants, and requested action.
- **Canonical codec:** converts supported host/source values to immutable bytes and safe coordinates; Pi codecs live in the adapter and can materialize verified recovered media as private `OpaqueHostDelivery`.
- **Atomic evidence store:** commits/recover/verifies/tombstones canonical representations without exposing internal IDs publicly.
- **Producer/execution:** performs one explicit host operation or supplies captured observed input.
- **Derived index/search:** consumes committed records and verifies candidates against canonical/live source.
- **Presentation:** constructs bounded, non-throwing host-neutral previews/replacement views. The supplied host codec validates, measures, and encodes the view into an opaque host patch.

These ports hide real variation and test seams. No registry/factory hierarchy is required beyond demonstrated adapters.

## 8. Operation Context And Authority

Every operation receives trusted context:

```ts
type OperationContext = {
  callId: string;
  eventId?: string;
  scope: OpaqueScopeBinding;
  principal: OpaquePrincipal;
  claims: readonly Claim[];
  grants: readonly OpaqueGrant[];
  signal: AbortSignal;
  deadlineMs?: number;
  hostCapabilities: Readonly<Record<string, boolean>>;
};
```

The opaque values above are internal and never serialized into public model results.

A raw Pi session ID is not an `OpaqueScopeBinding`. Persistent conversation binding must combine the Pi-owned logical correlation fact with Freeflow-owned collision/exclusivity state from trusted host context outside mutable transcript content. Session path, header bytes, cwd, lineage, and file identity may corroborate or detect conflict but cannot grant access alone. A copied session or concurrent opener that cannot be distinguished safely fails before store access; no automatic rebind, new-scope inference, or authority sharing occurs. In-memory Pi IDs are non-durable and cannot silently receive exact persistent scope authority.

Access is enforced before known-output recovery, search, expansion, transform input, deletion, or index lookup. Missing, ambiguous, conflicting, or untrusted identity causes a structured explicit failure with no side effects, or no patch for observed middleware. Authority issuance/validation and any collision/exclusivity transition are idempotent and owned by the same semantic transaction as generation/lifecycle validation; repeated lifecycle callbacks are triggers to revalidate, not failures or canonical state transitions.

Conversation scopes own ordinary evidence. Delegation task scopes own delegated evidence. Parents may receive capability-gated task access; leaves receive owned and explicitly granted evidence. Sibling handles are not authority. Normal cross-session model search does not exist.

## 9. Capability Defaults And Effective State

After valid setup:

- Skills default on unless explicitly disabled;
- Output Router defaults off;
- Delegation Harness defaults off.

Missing/invalid setup or master-off makes all layers ineffective. Under master-on, Skills, Router, and Harness are independent.

When Router is ineffective:

- router tools are not model-visible;
- router skill/runtime context is absent;
- observed/native middleware returns no patch;
- scripts, vault/index work, and router telemetry are inert;
- direct invocation of a Router-owned executor returns the closed `disabled` result.

`freeflow_status` remains a master-level model tool for valid master-on setup even when all capability layers are off. It is hidden for missing/invalid/master-off setup.

Effective-state reads must be consistent for one hook/call and refreshed at Pi lifecycle boundaries. Process-global warning dedupe must not suppress warnings in another repo/session.

## 10. Public Pi Capability Inventory

This section names the intended v0.4 Pi capability surface. It is not a second wire-contract authority. Exact active schemas, replies, failures, messages, and maturity come only from the operation catalog in Section 11.

### 10.1 `freeflow_search`

- `locate`: rank bounded candidate sources/records or abstain;
- `query`: return focused evidence or abstain;
- `get`: locate supplied exact-ish text/code;
- `retrieve`: read a known repository/external-local source and optional exact range;
- `recover`: redeem one opaque V2 recovery capability;
- `expand`: widen one prior evidence packet under its original authority;
- `explain`: explain a prior public result through opaque correlation;
- `transform`: run auto/deterministic/allowed-script processing over repository, external-local, or V2 vault evidence.

`retrieve`, `recover`, and `expand` remain distinct. Vault exact reads are capability-addressed `recover`, never source-addressed `retrieve`. V1 handles are never accepted by the V2 model-facing path.

### 10.2 `freeflow_run`

Producer forms remain semantically distinct:

- `shell`: shell text under an explicit shell policy;
- `exec`: executable plus argv, never joined into shell text;
- `script`: explicitly enabled proof-backed sandbox execution.

Each operation executes once. Per-request timeout, fidelity, and budget values may only tighten configured policy. The exact request fields are defined only when the owning operation is promoted.

### 10.3 `freeflow_batch`

Batch owns independent promoted search, run, and transform child operations only. It does not own delegation lifecycle, mutation, arbitrary MCP orchestration, dependencies, nested batch, or unsafe writers.

### 10.4 `freeflow_status`

- `status`: concise configured/effective health;
- `doctor`: bounded findings and suggested recovery actions;
- `migration`: read-only findings, always `applied:false`.

Model-facing status is current-scope and non-correlatable. Permission repair, quarantine, config migration, deletion, and global diagnostics remain explicit human/settings control-plane actions with preview and confirmation.

## 11. Declarative Operation Authority And Promotion

### 11.1 Sole authority

One finite machine-readable operation catalog owns every executable public semantic:

- stable operation key, Pi tool, and discriminator;
- visibility (`public` or private/hidden);
- maturity;
- exact request branch, required/optional fields, unknown-field policy, and semantic decoder rules;
- action-specific success value;
- allowed shared terminal replies and closed failure codes;
- bounded safe public message templates;
- authority and side-effect class;
- public recovery behavior and private delivery requirements.

Pi JSON schemas, decoder tables, convenience types, compact/TUI fixtures, safe messages, tool descriptions, human matrices, and package release gates are generated directly from this catalog. If a host projection cannot be generated, it must carry the catalog fingerprint and pass exhaustive branch/field/failure equivalence tests. Prose may explain semantics but cannot redefine them.

A deterministic contract check fails on:

- undefined public references;
- duplicate operation keys or Pi discriminators;
- action/request/result/failure mismatch;
- open public failure codes or messages;
- directional operations contributing active schemas/types;
- mixed v0.3/v0.4 public schemas;
- illegal source/action combinations, including vault `retrieve`;
- leaked scope, generation, record, representation, journal, blob, filesystem, receipt, or host-block identity;
- media bytes/base64 in model-visible text/results;
- generated projections that do not match the catalog fingerprint.

### 11.2 Promotion states

| State | Meaning | Allowed projection |
|---|---|---|
| `directional` | intended capability boundary; exact contract still owned by a later phase | capability inventory and planning prose only |
| `executable` | exact closed contract is implemented for a named proof/eval slice | unpublished eval-only registration/artifact; not an advertised v0.4 product surface |
| `release` | implementation, installed-Pi behavior, migration, docs, package, and release evidence all pass | advertised supported Pi surface |

Maturity is build/release metadata. It never appears in model requests, results, or tool descriptions. v0.4 cannot release while any advertised target operation is below `release`.

Promotion is monotonic only when evidence holds. A failed proof demotes or redesigns the entry; it does not add a permissive schema, compatibility bag, or undocumented fallback.

### 11.3 Phase 1 promoted contract

The first vertical proof contains exactly two executable entries. This matrix is the pre-implementation semantic seed for Slice 1.1, not a parallel runtime authority; once the production catalog exists, the checked generated matrix replaces this handwritten projection and any divergence blocks progress.

| Operation key | Visibility | Discriminator | Request | Success | Failures | Authority/side effects |
|---|---|---|---|---|---|---|
| `search.recover` | public | `freeflow_search action:"recover"` | required `recoveryHandle`; optional exact line/byte `range`; optional positive `budget.textBytes` that only tightens policy; unknown/cross-branch fields reject | bounded verified `RecoveredText` with required safe coordinates plus optional continuation handle | `invalid_recovery_handle`, `legacy_handle`, `invalid_range`, `integrity_failed`, `recovery_unavailable`, `recovery_failed` through shared terminal replies | trusted context only; read/verify exact V2 evidence; no write |
| `observe.fetch_text` | hidden | private installed-Pi fetch-family path | trusted captured Pi text result plus private host codec/context | structural `NoPatch` or one fact-complete smaller replacement | private no-patch on any unmet prerequisite | execute producer once; exact commit/readback before replacement |

The public action remains `recover`. `search.recover_text` may be an internal capability/test label but is not a public discriminator.

Phase 1 produces an unreleased eval-only tarball/manifest that registers only the promoted public recovery branch and hidden observed-text proof path. It must be impossible to publish or present that artifact as v0.4. Existing v0.3 tools are not copied into this manifest; no process exposes mixed v0.3/v0.4 Router schemas.

### 11.4 Directional inventory

The catalog inventories but does not yet activate these public operations:

| Operation key | Settled semantic boundary |
|---|---|
| `search.locate` | bounded ranked candidates with calibrated confidence or abstention |
| `search.query` | bounded focused evidence with calibrated confidence or abstention |
| `search.get` | supplied exact-ish text/code search |
| `search.retrieve` | source-addressed repository/external-local retrieval only |
| `search.expand` | context widening bound to prior evidence and authority |
| `search.explain` | opaque-correlation explanation without public raw call IDs |
| `search.transform` | bounded repository/external-local/V2-vault processing |
| `run.shell` | one shell-text execution plus bounded evidence |
| `run.exec` | one argv-preserving execution plus bounded evidence |
| `run.script` | one allowlisted sandbox execution plus bounded evidence |
| `batch.execute` | independent eligible child outcomes with coordinator state |
| `status.status` | bounded configured/effective health |
| `status.doctor` | bounded read-only findings and guidance |
| `status.migration` | bounded read-only migration findings with `applied:false` |

These names prevent accidental scope loss; they do not freeze fields. Each owning phase must promote only after defining its exact request, success value, failure closure, authority, side effects, renderer fixtures, and installed-Pi evidence.

## 12. Shared Terminal Replies And Phase 1 Public Types

### 12.1 Small shared reply

Promoted operations use action-specific success values inside a small closed terminal reply:

```ts
type Diagnostic<D extends string> = {
  code: D;
  severity: "info" | "warning" | "error";
  message: string;
};

type ValidationIssue<V extends string> = { path: string; code: V; message: string };

type RecoveryCapability = {
  handle: string;
  coverage: "full" | "captured_subset";
  role: "source";
};

type Reply<T, E extends string, D extends string, V extends string> =
  | { outcome: "ok"; value: T; diagnostics: Diagnostic<D>[] }
  | { outcome: "invalid"; issues: ValidationIssue<V>[] }
  | { outcome: "disabled"; reason: "master_off" | "router_off" | "invalid_setup" | "missing_setup" }
  | { outcome: "cancelled"; recovery: RecoveryCapability[]; diagnostics: Diagnostic<D>[] }
  | { outcome: "failed"; error: { code: E; message: string }; recovery: RecoveryCapability[]; diagnostics: Diagnostic<D>[] };
```

`recovery` lists only verified callable capabilities that survive the operation. An empty array means none. Internal cleanup, revocation, staging, transaction, and reconciliation state never enters model replies. Human status may expose bounded non-sensitive reconciliation findings and explicit owner actions without identifiers. If later promoted operations need materially different terminal semantics, the catalog remains authoritative but generates per-operation replies rather than widening this union into a property bag.

Diagnostics, validation issues, and errors use closed catalog code/message branches: each code permits exactly one bounded safe message, and validation paths are restricted to public request fields. They never serialize raw internal exceptions, paths, IDs, capability fragments, authorization distinctions, or an unsettled generic retry policy.

### 12.2 Exact Phase 1 request/reply

Before the production catalog exists, this is the accepted Phase 1 semantic seed. Slice 1.1 encodes it and thereafter this block must be generated or catalog-fingerprint checked; it cannot be edited independently.

```ts
type ExactRange =
  | { startLine: number; endLine: number }
  | { startByte: number; endByte: number };

type RecoverTextBudget = {
  textBytes: number;
};

type RecoverRequest = {
  action: "recover";
  recoveryHandle: string;
  range?: ExactRange;
  budget?: RecoverTextBudget;
};

type RecoveredText = {
  coverage: "full" | "range";
  text: string;
  coordinates: ExactRange;
  continuationHandle?: string;
};

type RecoveryFailureCode =
  | "invalid_recovery_handle"
  | "legacy_handle"
  | "invalid_range"
  | "integrity_failed"
  | "recovery_unavailable"
  | "recovery_failed";

type RecoveryDiagnosticCode = "range_limited" | "continuation_available";

type RecoverValidationCode =
  | "missing_field"
  | "unknown_field"
  | "invalid_type"
  | "invalid_value"
  | "invalid_range"
  | "budget_exceeds_policy";

type RecoverReply = Reply<RecoveredText, RecoveryFailureCode, RecoveryDiagnosticCode, RecoverValidationCode>;
```

The request branch requires non-empty `recoveryHandle` and rejects unknown fields. Line ranges are 1-based and inclusive: returned bytes begin at the first byte of `startLine` and end immediately before the first byte of the line after `endLine`, preserving original line terminators; the final line ends at EOF. Byte ranges are 0-based, half-open UTF-8 byte offsets `[startByte,endByte)` with `endByte > startByte`; both endpoints must be scalar boundaries. `budget.textBytes` is a positive integer and may only tighten the configured text-byte cap. Other generic budget fields reject. Trusted scope, generation, principal, grants, record identity, representation identity, and filesystem roots are never request fields.

Malformed, modified, stale, unauthorized, wrong-role, and unknown handles all fail with `invalid_recovery_handle` and zero recovered bytes. `legacy_handle`, `invalid_range`, `integrity_failed`, `recovery_unavailable`, and `recovery_failed` are used only when the condition is safe to reveal without confirming another capability or scope.

`RecoveredText.coordinates` reports the actual returned range. A full recovery without a requested range uses 0-based half-open UTF-8 byte coordinates over the canonical representation. Automatic bounding ends at a UTF-8 scalar boundary and returns an opaque continuation capability. A subset is never labelled full. Phase 1 recovery is text-only; typed media remains private/directional until its codec, atomic public-metadata/private-delivery pairing, and installed-Pi proof are promoted. Media bytes, base64, and Pi block types never enter public results.

### 12.3 Cross-operation result rules

- public results contain safe source labels/coordinates only after their operation is promoted;
- internal scope, generation, record, representation, journal, blob, root, raw vault path, receipt, and transaction identity are forbidden;
- producer outcome, protocol outcome, and evidence disposition remain distinct where the owning operation needs them;
- observed post-tool `NoPatch` has no replacement result;
- opaque explanation/correlation handles are defined only when `search.explain` is promoted; raw Pi call IDs are not public contract fields;
- batch cannot nest, and its exact child/coordinator algebra is deferred to `batch.execute` promotion;
- previews and renderers are total/non-throwing and cannot weaken a reply after exact commit;
- compact model and richer TUI projections share one generated presentation view and cannot disagree about outcome, recovery, evidence, or omissions.

## 13. Evidence, Compact Output, And Presentation

Each public evidence item includes safe source identity, exact coordinates, deterministic value/excerpt, selection method, inferential confidence only when applicable, recovery state, and omissions/continuation.

Compact model output includes enough to choose the next action:

- outcome and key facts;
- safe source coordinates;
- exact/subset/none state;
- callable recovery or expansion capability when available;
- omissions;
- decision-relevant failure or advisory risk.

Freeflow-owned details never duplicate raw output. One host-neutral presentation view model feeds compact model content and richer Pi TUI rendering. The two channels remain distinct but cannot disagree about status, recovery, evidence, or omissions.

Final UTF-8 text bytes, block count, media count/bytes, and pre-render work are bounded. Per-call values never widen hard caps. Tiny complete output may remain unchanged when smaller than a routed wrapper.

## 14. Failure And Disposition Contract

| Point | Required behavior |
|---|---|
| invalid request/context | no read, execution, child dispatch, index, or persistence; structured explicit failure or no patch |
| before canonical commit | no public handle, durable primary visibility, or quota charge; private staging is reconciled |
| commit rejected/failed | explicit tool returns bounded failure; observed/native returns no patch |
| cancellation before commit | no primary visibility; no new work starts |
| commit succeeds then cancellation/failure | explicit result reports surviving recoverable evidence; observed/native records retained or durably scheduled cleanup and returns no patch |
| reduction/benefit/render failure | committed evidence remains truthful; no observed replacement |
| index failure after commit | canonical evidence remains recoverable; index reports degraded/rebuildable state |
| recovery integrity/access failure | no content returned; bounded reason only |

One operation-scoped signal reaches producer execution, capture, hashing, storage, indexing, processing, batching, hooks, and rendering. Dependencies must not complete into a late replacement after abort.

A best-effort `discard()` is not a completed disposition. Post-commit cleanup failure is durable reconciliation state. Private receipts/capabilities are single-use where needed, but callers never orchestrate transaction stages.

## 15. Canonical Representations

The core representation contract is host-neutral:

```ts
type CanonicalRepresentation = {
  codecId: string;
  bytes: Uint8Array;
  byteLength: number;
  digest: Uint8Array;
  role: InternalRepresentationRole;
  parents: readonly OpaqueInternalReference[];
};
```

Core-supported codec families include exact UTF-8 text, validated canonical JSON, exact host-provided byte streams, and closed derived values. Pi supplies the codec for ordered Pi content blocks, media, errors, and host references.

Requirements:

- codec IDs and schemas are versioned;
- bytes are immutable snapshots;
- digest/count are computed over exactly those bytes;
- unsupported host values cannot claim exactness;
- no newline/BOM normalization unless named by the codec;
- coordinates are representation-specific;
- media blobs remain binary/typed;
- arbitrary host `details` is excluded unless a named adapter maps a field into a separate representation;
- derived values identify canonical parents internally without exposing storage identity publicly.

## 16. Persistence Modes

### `exact`

Stores required canonical bytes and a closed safe record. Verified recovery is available for the named representation.

### `metadata-only`

Stores only closed, content-independent fields required for lifecycle, access, fixed-enum state, timestamps, and integer accounting. It stores no free-form content, host/server/tool/path/URL/command/error strings, media metadata, excerpts, source/script hashes, fingerprints, or searchable tokens. It has no content recovery.

### `none`

Stores no Freeflow evidence/content metadata beyond ephemeral operation state.

Default planning:

- exact when omission/reduction/filter/transform/failure evidence requires recovery;
- none for small successful unchanged output;
- metadata-only only when explicitly configured;
- observed/native replacement requires exact observed-projection commit first.

Raw script source and reusable code hashes are never persisted or model-visible.

## 17. Vault V2

### 17.1 Identity and access

Each occurrence and canonical representation receives unique internal scope-owned identity. Immutable blob dedupe may exist internally but cannot merge event/producer/access metadata or leak equality across scopes.

Scope, generation, principal, claims, grants, and persistent binding collision/exclusivity are checked for every operation. Deletion rotates generation so stale handles cannot address new evidence. Repeated host lifecycle observations cannot create a second binding or rotate generation twice. Ambiguous copy/restore or concurrent-open state remains denied until the canonical authority transaction resolves it or an explicit owner-approved recovery path exists.

### 17.2 Atomic visibility

The store must provide one durable primary visibility point for a transaction containing all records required for the outcome.

Before that point:

- bytes remain private/unreferenced;
- no public handle or success exists;
- cancellation can prevent visibility.

After that point:

- the outcome must report retained recoverability or durable reconciliation;
- exact recovery readback verifies the committed bytes;
- indexes update separately and may degrade without invalidating primary evidence.

The concrete journal/manifest/database mechanism remains implementation-testable. It must prove atomic visibility, process/crash recovery, orphan cleanup, multi-process serialization, and cancellation races.

### 17.3 Recovery

Recovery verifies trusted access, handle provenance, generation, representation role/coverage, canonical linkage, containment where files are involved, byte count, and digest. Integrity failure returns no bytes.

### 17.4 Lifecycle, retention, deletion

Active scopes do not age out. Closed/abandoned scopes use a configurable seven-day default before tombstone. Tombstone immediately denies access and rotates generation. Purge is asynchronous, idempotent, retryable, and observable.

Deletion supports per-scope and full-vault operations. Active/full deletion requires strong confirmation, writer quiescence, and optional force cancellation. No silent active eviction occurs.

### 17.5 Quotas

Per-scope logical usage and global physical usage are distinct. Warnings precede hard limits. Explicit producers reserve bounded worst-case amplification before execution. Observed/native quota failure returns no patch. Capture limit produces a truthful exact subset and `output_limit`, never false full recovery.

### 17.6 Filesystem privacy

Vault/staging directories are owner-only; files are owner-only. Unsafe repo/shared/system/network/synced roots are rejected by default. Realpath containment and parent exposure are checked. Doctor can audit/repair permissions. Model output avoids raw vault paths.

## 18. Legacy V1 Contract

V1 is compatibility data, not a V2 storage adapter.

### 18.1 Detection

Detection is read-only and classifies:

- absent/empty;
- legacy primary state;
- derived `index/v1` only;
- legacy corrupt/partial;
- mixed V1/V2;
- unclassified files;
- explicit unsupported future version.

Detection never creates directories, acquires/deletes locks, rewrites, renames, indexes, quarantines physically, or follows unsafe links.

`index/v1` alone is not a whole-vault version marker.

### 18.2 Logical isolation

Automatic “quarantine” means refusal to open V1 through V2 runtime/search/write paths. Mixed roots fail closed. Physical move/delete is a separate confirmed owner operation after writer quiescence and destination/durability checks.

### 18.3 Owner-operated offline recovery/export

The offline utility:

- requires an owner-selected V1 root and explicit destination;
- is not callable through `freeflow_search` or any model tool;
- performs bounded inventory, containment, symlink, schema, linkage, hash/count checks where the V1 kind permits;
- reports exact, metadata-only, missing, corrupt, and unverifiable outcomes honestly;
- exports raw archival metadata only inside an explicitly requested owner-only archive;
- otherwise emits a sanitized neutral manifest;
- never writes/indexes V2, issues V2 handles, or infers V2 principals from V1 sessions.

Declining export/deletion leaves V1 untouched and isolated.

### 18.4 Stale handles and downgrade

V1 transcript results are inert historical data. Supplying a V1 output ID/instruction to V2 returns a bounded `legacy_handle` finding without reading the filesystem and points to the offline owner route.

The first committed V2 primary transaction makes the logical scope/generation forward-only. Old binaries or V1 roots cannot resume that scope. Operational rollback may restore code only with a V2-capable reader; it cannot materialize/reopen V1 as downgrade support.

## 19. Search, Retrieval, And Indexes

### Repository

Maintain one disposable derived index per real Git worktree over tracked plus untracked non-ignored live text. Exclude generated/dependency/sensitive/binary/oversized broad-scan content. Verify every candidate against current bytes before evidence. Cross-worktree search is not implicit.

### External local

Require explicit absolute contained root. Use bounded live traversal and temporary scope-local indexes by default. Persistent per-root indexing requires separate consent. Broad home/system roots are rejected.

### Vault

Use scope-local producer-partitioned derived indexes over committed V2 records only. Metadata-only never enters a text index. Direct recovery and indexed lookup use the same authority checks. Corruption triggers bounded fallback/rebuild and cannot broaden access.

### Retrieval policy

Layer exact text/path/symbol/heading, identifier-aware lexical ranking, BM25-style ranking, bounded typo matching, and live verification. High-confidence top-one is route-specific and calibrated; otherwise adaptive top-K or abstention.

Backend, caps, confidence thresholds, and scale limits are selected by preregistered calibration and selection validation, not by implementation preference.

## 20. Run, Transform, Reducers, And Batch

### Run

```text
validate trusted request/context
→ reserve bounded capture
→ host approval/execution once
→ canonical capture
→ required exact commit/readback
→ parse/filter/reduce from same capture
→ optional linked derived commit
→ bounded result
```

Shell and argv remain distinct. Parser failure falls back to generic evidence without rerun. Execution success/nonzero/timeout/cancel/adapter failure remain distinct facts.

### Transform

`freeflow_search action=transform` is the only public transform surface over repo/local/vault. Deterministic operations are closed and bounded. Scripts require explicit allowlist and proof-backed sandbox with no ambient filesystem/repo/vault/env/network/package access or unsafe host fallback.

### Reducers

Existing measured reducers are earned behavior, not deletion candidates. They remain producer-specific, deterministic, provenance-bearing, and abstaining. Missing remains missing. Repeated runs are segmented. Contradiction/ambiguity yields bounded candidates or abstention.

### Batch

Batch owns independent search/run/transform only. It validates all children, enforces unique step IDs and bounded concurrency, launches no new child after cancellation, preserves child outcomes/recovery, and keeps coordinator state separate.

Delegation migrates to a delegation-owned lifecycle and narrow evidence service before router `delegate_*` compatibility is removed.

## 21. Observed Producers And Native Safety Net

Supported producer evidence covers the installed registration → call → result → later lifecycle tuple, not synthetic `details.result` alone.

Observed families are independently configured and off by default:

- generic MCP protocol adapter with exact-tool override then server default;
- web search;
- fetch/full-content lineage;
- code search only when a real installed provider/version is pinned;
- unknown/unsupported shapes.

Identity/risk conflicts remain advisory facts and never grant authorization. Unconfigured, conflicting, unsupported, or incomplete input returns no patch and no observed persistence.

Replacement requires:

1. complete named capture;
2. immutable canonical exact commit and readback;
3. required facts immediately visible;
4. exact recovery for every omitted representation;
5. host-valid replacement;
6. strict final size benefit including wrappers;
7. no cancellation/failure.

Otherwise Pi receives no patch. Ordered content blocks, media bytes/MIME, host details, and `isError` remain structurally unchanged. Private diagnostics may record the reason without mutating output.

Native modes are only `off|safety-net`. Safety-net remains opt-in and guidance-first. Pi full-output artifacts are separate representations from the observed projection. Partial/unreadable/deleted/unverifiable sources pass through. Observed matching precedes native matching. Stable event identity prevents double routing.

## 22. Configuration And Migration

One host-neutral descriptor owns schema, normalization, effective state, diagnostics, and explicit migration operations. Pi renders and writes only the returned operation.

Canonical rules:

- malformed config fails safely and is never overwritten silently;
- omitted script config and `languages:[]` disable execution;
- observed enablement requires an explicit persistence choice;
- only `off|safety-net` is accepted post-tool behavior;
- migration is read-only until explicit confirmation;
- failed writes leave `changed:false`, `saved:false`, perform no rewrite, and trigger no success reload;
- writes use lock, validation, backup, and atomic replace.

Known legacy mapping:

| Legacy surface | Canonical destination/behavior | Migration treatment |
|---|---|---|
| top-level `observedRouting` | `outputRouter.observedRouting` | exact-value finding; explicit move only |
| top-level `scriptTransform` | `outputRouter.scriptTransform` | exact-value finding; explicit move only |
| flat large-output byte/line fields | `outputRouter.thresholds.*` | finding; explicit move only |
| `vaultRoot` | `outputRouter.vault.root` | finding; explicit move only |
| `vaultRetentionDays` / `vault.retentionDays` | closed retention object | finding; explicit conversion only |
| flat generated/noisy hints | `outputRouter.hints.*` | finding; explicit move only |
| `outputRouter.profile` | no singleton profile axis until evidence supports alternatives | finding; do not silently retain or default |
| `observedRouting.onRoutingFailure` | fixed target no-patch failure contract | finding; caller-selected failure mode is removed |
| `strict` | unsupported; target behavior is `safety-net` | finding; never silently revive |
| `redacted`, `capture`, provider/storage-policy legacy fields | removed | finding/reject; no silent default |
| legacy request/result/output IDs | v0.3 historical contract | structured upgrade/`legacy_handle` guidance; no permissive dual schema |

Exact read compatibility for aliases may be retained temporarily only when consumer evidence proves the mapping is semantics-preserving. Every such shim records purpose, consumers, owner, failure behavior, exit condition, and removal proof. Invalid values never translate to defaults.

## 23. Package And Release Contract

### Supported boundary

The only supported v0.4 package entrypoint is the Pi manifest path `pi-extension/freeflow/index.js`. Public Pi commands/tools are the user API. No router dist barrel or deep subpath is a supported programmatic API.

Pi imports one narrow internal runtime facade. It must not import benchmarks, experiments, eval runners, or development modules. An export/package fence prevents accidental new consumers while any temporary v0.3 compatibility files are explicitly classified.

### Tracked dist

Tracked dist remains required for ready-to-run Git/Pi installs. Source is authoritative. One integration owner regenerates dist after source reconciliation; router-only slices must not overwrite unrelated delegation/Pi artifacts.

### Release gates

1. every advertised target operation is `release`-promoted and the catalog release gate is true;
2. generated schema/decoder/type/message/fixture/tool-description fingerprints match the catalog; no directional/executable-only or v0.3 branch enters the product manifest;
3. clean dependency install and build;
4. modified and untracked dist equivalence checks;
5. runtime import-graph and tracked-file assertions;
6. tests after regenerated artifacts;
7. reviewed package allowlist/dry-run excludes the private Phase 1 eval manifest/tree;
8. fresh tarball install into isolated Pi home/repo;
9. clean-Git install without build/regeneration;
10. both execute the Pi manifest, defaults, activation, disabled behavior, and exact recovery;
11. release evidence identifies supported producer versions and residual unsupported cases.

Historical evals remain source history. Only curated maintained evidence required by the package contract ships.

## 24. Benchmark And Acceptance Protocol

Every scenario freezes required/forbidden facts, acceptable sources/coordinates, abstention, exact recovery bytes, task start/completion, and allowed variants before implementation choices.

A run is efficiency-eligible only after absolute correctness, privacy, recovery, cancellation, and resource gates pass.

Complete-task accounting includes all model turns, router-attributable schema/context, tool arguments/results, retries, recovery/expand calls, setup/index work, unnecessary follow-ups, and completion. UTF-8 bytes are primary; token claims pin tokenizer/model/version.

Acceptance loads the freshly packed Pi manifest and captures final model-visible output after the handler chain. Internal helper imports and custom summarizers are forbidden.

Use disjoint calibration, selection-validation, and untouched final holdout sets. Report cold build, fresh process/existing index, warm, incremental refresh, and fallback separately. Predeclare samples, warmups, trial counts, thresholds, and comparison rules. Report p50/p95 and resource evidence where applicable.

Default efficiency pass is strict Pareto: no declared efficiency dimension increases and at least one improves after all correctness gates. Owner-approved non-Pareto tradeoffs are reported separately and do not count as the default pass.

## 25. Migration Lifecycle

### Expand

- add the staged operation catalog, directional target inventory, generated projections, and private outcome/disposition seam;
- executable-promote only the Phase 1 public recovery and hidden observed-text entries through an isolated private eval manifest;
- prove the replacement through packed Pi;
- add separate V2 root/marker/store;
- add read-only V1 detector/export utility;
- add narrow internal Pi runtime facade;
- keep compatibility zones explicit and frozen.

### Migrate

Move consumers in bounded units:

1. installed Pi observed-text path;
2. public recovery and result rendering;
3. explicit run;
4. native safety-net;
5. search/index/transform;
6. router batch away from delegation;
7. config writers/docs/fixtures;
8. Pi/eval runtime imports;
9. settings/status/package/release evidence.

For each unit: capture baseline, migrate through intended seam, verify behavior/failure/privacy, preserve forward recovery, and recount remaining consumers.

### Contract

Remove old writers/types/adapters/aliases/barrels/tests/docs only when:

- no supported in-repo consumer remains;
- external/unknown consumer uncertainty has an owner-approved compatibility route;
- replacement passes packed Pi behavior without the old path;
- state/config is reconciled or deliberately retained;
- V1 export/deletion obligations are satisfied;
- rollback/forward-recovery window is complete;
- historical audit evidence remains available.

## 26. Acceptance Criteria

Pi is complete only when:

1. every P0/P1 audit item is fixed, migrated, or evidence-reclassified;
2. every advertised operation is release-promoted and its generated closed request/result/no-patch fixtures pass through installed Pi;
3. exact V2 recovery is callable and byte-verified;
4. V1 is detected/read/exported only through the approved offline boundary;
5. mixed roots, stale handles, downgrade, access, permission, tamper, cancellation, crash, quota, retention, and deletion tests pass;
6. search/index/reducer scenarios pass absolute oracles and live-source verification;
7. supported installed MCP/web/fetch/provider tuples pass; unsupported shapes return no patch;
8. disabled effective-state paths are model-hidden and side-effect-free;
9. source/dist/import/package/install gates pass cleanly;
10. public-path benchmarks pass correctness and the strict Pareto default or report explicit non-Pareto exceptions;
11. current user docs describe implementation rather than target intent;
12. the owner accepts the Pi completion report.

## 27. Implementation-Testable Questions

These do not block the completed installed-text horizon and must be resolved through named plan gates:

- concrete Freeflow-owned conversation binding/collision/exclusivity mechanism satisfying Sections 7–8 and 17 without treating Pi session ID, path, header, cwd, lineage, or lifecycle callbacks as sufficient authority;
- concrete atomic store/journal mechanism satisfying Section 17;
- repo/vault index backend;
- text/media/work/quota/capture limits;
- confidence thresholds and score-drop windows;
- supported installed producer package/version matrix;
- exact request/success/failure/authority contracts for each still-directional operation, resolved only in its owning phase;
- exact temporary read-compatibility window for semantics-preserving config aliases;
- whether internal exact-blob dedupe earns its physical complexity.

Before Phase 2 production delivery, the owner must decide ordinary-conversation principal semantics, exact-persistence behavior for in-memory sessions, the explicit close/abandon control, and whether copied/restored/moved sessions have any explicit rebind/recovery path beyond fail-closed denial. These decisions do not block transaction/binding learning prototypes that write only disposable eval state.

Evidence that invalidates a public, privacy, compatibility, or failure contract routes back to this spec. Local reversible implementation choices do not.

## 28. Implementation Boundaries

### Always

- test observable/failure behavior before changing it;
- preserve current and target truth separately;
- use isolated clean worktrees;
- verify through public seams;
- keep one writer for overlapping source/dist.

### Ask first

- public API outside this contract;
- weaker privacy/access/recovery semantics;
- native enforcement/blocking;
- remote services/new network dependencies;
- delegation ownership changes;
- non-Pareto release defaults.

### Never

- modify unrelated dirty delegation/Pi WIP;
- claim exactness for partial/unverified bytes;
- replace output without required recovery;
- enable scripts/observed/safety-net/delegation implicitly;
- hide validation/storage/routing failure as success;
- mix V1/V2 writes/indexes or auto-migrate V1;
- expose V1 recovery to the model;
- begin Claude/Codex implementation before Pi acceptance.

## Change Log

- **2026-07-13:** Incorporated installed Pi 0.80.6 lifecycle evidence: session ID is stable logical correlation but not exclusive authority; copies and concurrent opens duplicate it; path/header/file identity and fork lineage are corroboration only; in-memory IDs are non-durable; lifecycle callbacks can repeat and never mean close/abandon. Required a Freeflow-owned idempotent collision/exclusivity binding inside the authority transaction and exposed the remaining principal, in-memory, lifecycle-control, and copy/restore owner decisions.
- **2026-07-12:** Replaced the horizontal, machinery-exposing target with the owner-approved callable recovery API, outcome-level engine, private receipts, staged declarative operation authority, Phase 1-only executable recovery/observed-text contract, small shared terminal replies, private reconciliation, host-supplied codecs, owner-operated offline V1 boundary, explicit migration lifecycle, Pi-manifest-only release support, and rolling-evidence readiness contract. Terminal review then closed catalog-owned line/UTF-8 byte semantics, positive text-only budget, required actual-range recovery coordinates, exact code/message branches, safe validation paths, and removal of unsettled generic retry policy.
