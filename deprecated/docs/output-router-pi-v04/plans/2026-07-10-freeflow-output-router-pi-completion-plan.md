# Freeflow Output Router Pi Completion Plan

> **Doc ID:** PLAN-2026-07-10-freeflow-output-router-pi-completion
> **Date:** 2026-07-10
> **Owner:** Hassan Mohiddin
> **Type:** Rolling implementation and migration plan
> **Status:** Ready — Slice 2.1 complete; execute the deep binding/transaction learning slice
> **Last Updated:** 2026-07-13
> **Source:** `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
> **Issue inventory:** `docs/issues/output-router/2026-07-10-output-router-pi-completion-audit.md`

## Goal And Source Authority

Finish the host-neutral Output Router and Pi reference adapter through reversible, proof-bearing work. Minimize complete-task model-visible tokens and calls subject to correctness, integrity, privacy, and host safety.

The specification owns required behavior. The audit owns accepted defects and evidence gaps. Live code, tests, installed behavior, and current plugin docs own current v0.3 facts. This plan owns only the current execution route and changes when evidence changes the next safe action.

## Stable Scope

In scope:

- closed v0.4 operation contracts and exact V2 recovery;
- trusted conversation/task authority boundaries;
- one deep V2 transaction owner for authority, lifecycle, quota, visibility, and disposition;
- isolated owner-operated V1 detection/export;
- migration of supported Pi routing, search/run/transform/batch, config, package, and docs;
- installed-Pi correctness, privacy, package, and complete-task efficiency evidence.

Out of scope until its owning evidence exists:

- Claude Code or Codex implementation;
- model-facing or automatic V1 migration/recovery;
- mixed V1/V2 writes or indexes;
- preserving unsupported v0.3 quirks or deep imports;
- public storage, scope, generation, record, or host identities;
- silent compatibility contraction or destructive state handling.

Output Router and Delegation Harness remain off by default. Partial v0.4 work remains private/eval-only and absent from the public v0.3 package. Typed media remains typed.

## Completed Evidence

### Governing contract and baseline

Complete. The accepted docs checkpoint established one staged operation catalog and a clean implementation baseline. The baseline recorded 466/466 passing tests and isolated the ambient Eryx/Node support-cache issue from Router correctness.

### Installed Pi text outcome proof

Complete and package-private/eval-only. Commits through `0b5b584` prove the Phase 1 catalog, exact text representation, opaque recovery and continuations, atomic publication/readback, cancellation/reconciliation behavior, trusted observed tuple correlation, registered Pi callback/executor behavior, fact-complete smaller replacement, structural no-patch failures, and public-package containment.

Phase 1 promoted only public `search.recover` and hidden `observe.fetch_text` to private `executable` maturity. The v0.4 release gate remains false. It did not claim native Pi lifecycle dispatch, final V2 storage/lifecycle, media, indexes, multi-host support, or release readiness.

### Installed Pi identity and lifecycle proof

Complete and package-private/eval-only. The private installed Pi 0.80.6 probe and external runner now derive every bounded authority-absence category from exact identifier inventories over pinned public declarations and observations. Package/tool/schema/dependency claims derive from the installed import/registration inventory and exact tar contents rather than constants.

Fresh self-verification passed the focused 5/5 lifecycle tests, packed installed-Pi smoke, complete 115/115 Pi suite, public-package containment, exact Pi/declaration hashes, no-model/tool event inventory, and diff checks. Lower-level evidence confirms stable correlation, copy/concurrency collisions, in-memory non-durability, repeated lifecycle callbacks, and the absence of named principal/claim/grant/generation/durable-close/exclusive-ownership facts only within the pinned inspected seams.

Result: Pi session ID is a logical correlation fact, not an `OpaqueScopeBinding`; persistent authority needs Freeflow-owned collision/exclusivity state. The slice closed through sequential self-verification and bounded self-review without another independent reviewer.

### Deep binding and transaction learning

Complete as disposable learning evidence. Both the committed-directory and built-in SQLite candidates pass the same 15-row matrix, including copy/concurrent collision failures, atomic two-representation exact commits, quota and tombstone races, exact/metadata-only/none structural behavior, restart recovery, caller-interface depth, and exact lost-response retry. A trusted `occurrenceKey` returns the existing exact capabilities after an `after_visibility` response loss; conflicting reuse fails with byte-identical durable state. Durable replay is intentionally exact-only so metadata-only retains no supplied identifier/fingerprint and none remains stateless.

The candidates do not tie on mechanism. In two fresh 100-commit probes, the snapshotting file candidate took 4.2–4.9 seconds and accumulated 10,202 files/6.6 MB before reconciliation; SQLite took 55–63 milliseconds and held one 160 KB database. The file protocol also owns PID-liveness reclamation, full-snapshot copying, application cleanup, and a weaker untested rename-to-directory-fsync crash interval. Discard that implementation shape from production consideration while retaining its contract evidence.

SQLite is the leading transaction-learning mechanism because one database transaction localizes the semantic failure unit and restart recovery, not because a production substrate has been selected. `node:sqlite` is experimental on the attested Node 22.22.3 runtime and is unavailable on older/custom builds. Final substrate/dependency choice remains an owner gate. The candidates also expose an unresolved policy choice—whether metadata-only integer accounting contributes to quota—which is not substrate-specific and must be settled before production semantics.

Fresh self-verification passed both 15/15 suites with stable source hashes, regenerated reports, redacted caller enumeration, durable-state inspection, and two consistent bounded comparison runs. Bounded self-review found no reason to split transaction authority, but rejected the file candidate's measured amplification and preserved SQLite portability/power-loss limits as explicit decision evidence.

### Read-only V1 detector learning

Complete as disposable Darwin-arm64 learning evidence after the owner selected the recommended minimal native descriptor-relative helper. The source-derived inventory covers all four published v0.3 writers (`command`, `text`, `metadata`, and `repo-file`), primary object/session linkage, derived `index/v1` state, locks, and temporary writer artifacts. Fixtures come from the integrity-pinned published runtime rather than hand-authored current-source substitutes.

A synchronous N-API snapshot now owns root `O_NOFOLLOW`, `openat`/`fstatat` descent, symlink/hard-link/special-file rejection, bounded reads, and before/after identity/stability checks. JavaScript validates the immutable snapshot and emits only categorical classifications and counts. Caller-provided limits can lower but not raise the hard bounds. Path-based traversal remains rejected.

Two fresh complete runs passed 34/34 tests each. Evidence covers all writer kinds together and independently; busy/partial artifacts; corrupt, orphan, dangling, malformed, unknown, collision, permission, and limit cases; root/directory/object/file links; FIFO state; deterministic file mutation and directory replacement; exact zero byte/count/hash mutation; source-derived coverage; and output privacy canaries. The arm64 Mach-O links only libSystem and Node N-API symbols. Disposable report: `/tmp/freeflow-output-router-v1-detector-learning/report.json`.

Bounded self-review fixed a file-size race between `fstatat` and `openat`, bounded all caller limits, and added claimed-path linkage plus deterministic directory replacement. The surviving limits are explicit: the proof covers only Darwin arm64/Node 22.22.3; production needs reviewed prebuilt artifacts because install scripts remain disallowed; signing, clean packed loading, other OS/architectures, and the final offline execution boundary remain unproved. Promote the native snapshot contract, not the disposable implementation.

### V2 marker and forward-only transition learning

Complete as disposable semantic evidence. The authoritative format marker belongs inside the same transaction as binding/generation, the first exact occurrence, both required representations, capabilities, and charge. Directory/database creation, schema creation, journals, and external marker files do not establish V2. The first successful `COMMIT` is the forward-only point.

Two fresh runs passed 15/15 tests and 23 evidence rows. Faults after database open, transactional schema, marker insertion, complete primary rows, and `COMMIT` prove rollback versus exact lost-response replay. Exact replays preserve capabilities and charge; conflicting occurrence/binding/opener state fails byte-identically; concurrent replays serialize. Complete/partial V1, mixed, malformed, unknown, linked, quota-rejected, and future roots fail closed. The pinned v0.3 writer can physically add isolated legacy paths but cannot read or continue V2 authority; subsequent V2 access rejects the mixed root without changing V2 bytes. Disposable report: `/tmp/freeflow-output-router-v2-marker-learning/report.json`.

Bounded self-review rejects an external marker and preserves the in-transaction marker semantics. It also found a production blocker not resolved by the passing matrix: the native snapshot closes its verified database descriptor before experimental `node:sqlite` reopens the file by pathname. A concurrent mutable-store attacker could replace that path between checks. The candidate therefore proves marker/transaction semantics only under its explicit trusted-root assumption, not the accepted mutable-store-compromise boundary.

## Current Executable Horizon — Transaction Substrate Security Decision

Choose whether to preserve the mutable-store-compromise boundary and deepen native storage, or narrow/defer it:

1. preserve the boundary and authorize a bounded comparison between a descriptor-relative native SQLite/custom-VFS owner and a redesigned openat-owned append/manifest protocol without full-snapshot amplification;
2. narrow V2 to a trusted-root threat model and proceed with experimental `node:sqlite` path reopening;
3. defer durable V2 storage.

Recommendation: option 1. Do not promote the passing `node:sqlite` candidate by silently weakening the threat model.

## Next Directional Horizon — Phase 2 Decision Checkpoint

### Phase 2 learning checkpoint

Combine the evidence before asking the owner to decide:

- ordinary-conversation principal semantics;
- exact persistence for in-memory sessions;
- copied/restored/moved-session recovery or fail-closed-only behavior;
- explicit close/abandon control;
- final transaction substrate and dependency consequences;
- final V2 marker/namespace and forward-only point.

No production authority/store delivery begins before the relevant decisions are settled. A phase ending does not itself trigger independent review. If the owner wants a formal second opinion on the combined high-risk decision package, obtain scoped authorization for that boundary rather than reviewing every learning slice.

## Later Provisional Outcomes

### Production V2 and legacy isolation

Promote the accepted conversation authority provider and transaction substrate; add retention, tombstone/purge, root/permission hardening, V1 detector/export, mixed-root isolation, stale-handle behavior, and derived-index rebuild from authoritative enumeration. Keep task grants behind a delegation-owned future provider.

### Complete the Pi capability surface

Migrate explicit run and native disposition, then search/index/transform/reducers/batch, installed producer families, typed media, config/settings/status, package facade, compatibility consumers, and current docs. Promote catalog operations one at a time from direct installed evidence; do not add independent review per operation.

### Packaged Pi acceptance

Close every accepted P0/P1 issue; run untouched correctness/privacy/recovery/cancellation/resource holdouts; prove clean source/dist/package/Git/tarball installs; measure complete-task efficiency; update release evidence; and obtain owner acceptance before any future-host implementation.

## Migration Boundaries

- V1 writers/indexes move to isolated offline detection/export plus separate V2 storage before removal.
- Broad Router/deep-dist consumers move to one narrow internal Pi facade before contraction.
- v0.3 request/result/`ffout_` consumers receive structured upgrade/stale-handle behavior, not a permissive dual schema.
- Legacy config aliases move through findings and explicit migration, never silent rewrite.
- Router delegation batch kinds move only after delegation-owner handoff.
- Old disposition paths remain until migrated callers pass parity and fault checks.

Temporary compatibility machinery must name consumers, observable differences, failure behavior, owner, exit condition, and removal evidence. New-path success is not old-path absence proof.

## Feedback, Review, And Assurance

### Normal slice feedback

The implementing agent owns the normal loop:

1. implement or experiment;
2. self-verify through direct checks;
3. only when supported, self-review once against source truth and route;
4. correct clear local reversible defects and rerun affected checks;
5. diagnose repeated or unexplained failure before redesigning.

Independent review is not scheduled because a slice or phase ends, a plan changes, or ordinary mistakes remain possible. Learning slices may fail safely.

### Artifact assurance

The governing spec/plan package already received its selected artifact-review route. This rolling-plan update uses source alignment, direct evidence-path checks, and bounded self-review. Do not restart independent artifact review without new evidence that changes readiness or risk.

### Final implementation assurance

After the final implementation slice and sequential final self-check:

1. freeze one source identity;
2. run one fresh independent verifier and one different fresh reviewer in parallel against that same state;
3. collect and adjudicate both results before claiming completion.

Any later code change stales both. Another independent dispatch then requires a new self-check and user authorization. Additional intermediate independent contexts also require scoped authorization.

### Commit and handoff

Commit only a coherent verified rollback point and only when authorized. Use handoff for continuity, not as authority or proof.

## Dynamic Route Triggers

Revise only the affected route when evidence shows:

- a clear local defect: fix and verify;
- repeated or unexplained failure: diagnose;
- diagnosed structural pressure: design-for-depth;
- changed behavior, scope, API, compatibility, privacy, or failure semantics: revise spec or ask the owner;
- changed ordering, slice boundary, mechanism, or evidence path: revise this plan;
- no safe in-scope path: defer or stop.

Ordinary bugs and local verifier mistakes do not require replanning or formal review.

## Final Direct Evidence Package

The final package must include, as applicable:

```bash
npm run build
npm run test:router
npm run test:delegation
npm run test:pi-extension
npm run check:router-contract
git diff --check
bash evals/scripts/check-runtime-context-hook.sh
bash evals/scripts/validate-release-metadata.sh
bash evals/scripts/check-runtime-import-graph.sh
bash evals/scripts/smoke-pi-package-tarball.sh
bash evals/scripts/smoke-pi-package-git.sh
npm pack --dry-run --json
```

Add only direct holdout, migration, crash/concurrency, privacy, recovery, and performance checks required by the final accepted claims. Missing scripts remain future deliverables, not current evidence.

## Residual Risks

- Pi 0.80.6 supplies stable correlation but no proven exclusive conversation authority.
- Final principal, in-memory, copy/restore, close/abandon, transaction, and marker decisions remain open.
- V1 export coverage and compatibility removal remain unproved.
- Native Pi lifecycle/model dispatch, final media/index breadth, complete migration, and release readiness remain deferred.
- Current Phase 2 work is uncommitted and private/eval-only; transaction candidates are not yet implemented.

## Change Log

- **2026-07-13:** Closed Slice 2.1 from evidence-derived identifier/import/registration/tar oracles and moved the current horizon to disposable deep binding/transaction candidates.
- **2026-07-13:** Simplified the plan for the updated Freeflow philosophy: one detailed executable horizon, one directional learning horizon, provisional later outcomes, sequential self-checks as primary feedback, no slice/phase-triggered independent review, and one final parallel verifier/reviewer boundary.
- **2026-07-12:** Established the staged operation catalog and private installed-Pi text proof as the first executable horizon.
