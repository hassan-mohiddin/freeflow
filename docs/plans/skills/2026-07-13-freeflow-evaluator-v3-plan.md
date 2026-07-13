# Freeflow Evaluator v3 Implementation Plan

> **Type:** Rolling implementation plan
> **Status:** Ready
> **Source:** `docs/specs/skills/2026-07-13-freeflow-evaluator-v3.md`
> **Baseline:** Current evaluator under `skills/evaluate-skill/scripts/`; 132 deterministic tests passed during spec review
> **Provider policy:** No provider-backed execution until deterministic v3 acceptance, exact preview, and owner approval

## Goal

Replace the one-case, JSON-heavy, terminal-limit evaluator coordinator with a compatible Pi-first staged engine that compacts model evidence, validates cases before provider access, batches independent cases safely, journals resumable state, and reuses only exact integrity-valid stages.

## Guardrails

- Preserve existing single-case CLI JSON and bundle behavior throughout migration.
- Keep one writer per source checkout; isolate every subject workspace.
- Do not change skill behavior, case criteria, or readiness metadata to make v3 pass.
- Keep canonical JSON exact; compact rendering is a model/terminal view.
- Preserve whole-case subject rerun fairness after subject/candidate/infrastructure failure.
- Add batching behind the existing `evaluate` command.
- No Claude/Codex implementation in the Pi acceptance horizon.
- Every slice ends with focused tests, full evaluator tests when affected, and `git diff --check`.

## Phase 0 — Freeze Baseline And Cost Corpus

### Slice 0.1 — Acceptance Manifest Generator

**Type:** learning/delivery

Add a deterministic script that inventories selected saved bundles and writes `.skill-eval/evaluate-skill/v3-acceptance.json` with exact hashes for:

- baseline evaluator implementation;
- Pi adapter/version;
- representative case/fixture/skill/runtime inputs;
- canonical semantic packets;
- observed process usage and model-visible byte counts;
- expected objective and semantic verdicts;
- injected local/global fault fixtures.

Initial corpus:

- `WFC2-001` composition one-shot;
- `WFC2-002` four-turn composition;
- final `WFI-002` mutation case;
- final `WFI-003` proof-fidelity case;
- one complete semantic bundle suitable for rubric-only regrade;
- deterministic fake-adapter batch faults.

**Verification:** manifest is reproducible byte-for-byte; missing or mutated bundle fails closed; no provider requests.

### Slice 0.2 — Baseline Metrics

Measure canonical/model-visible bytes, provider requests, rerun causes, cap failures, and wall-time shape from saved evidence. Record facts in `.skill-eval/evaluate-skill/reports/v3-baseline.md`. Do not claim savings yet.

**Checkpoint:** revise later thresholds only if baseline evidence makes an approved threshold impossible or meaningless.

## Phase 1 — Compact Evidence And Feasibility Preflight

### Slice 1.1 — CEV1 Codec Core

**Type:** delivery

Create a pure module owning:

- CEV1 escaping/parsing;
- `H/S/F/O/R` records;
- source/fact lineage;
- recoverability classes;
- canonical and compact byte accounting;
- fallback to canonical when reduction is not beneficial or lineage is incomplete.

RED cases cover pipes/newlines/control bytes, JSON pointer spans, byte/line spans, operation hashes, explicit omissions, metadata-only honesty, and exact recovery identity.

### Slice 1.2 — Semantic Packet Reducer

Build compact semantic packets from immutable run artifacts. Preserve fixed criteria and only relevant turns/files/diffs. Add canonical-versus-compact parity tests using the frozen corpus.

**Acceptance:** median saved-corpus semantic packet reduction ≥40%; no representative compact packet larger than canonical; all required rubric facts represented or explicitly unavailable.

### Slice 1.3 — Case Feasibility Compiler

Extend preflight to catch, before provider access:

- unnamed evidence without discovery tools;
- requested operations unavailable through tools;
- redundant later-turn reread assertions;
- exact literals unsupported by source/prompt enums;
- missing conditional resources;
- changed-path/request conflicts;
- rubric facts absent or undiscoverable;
- insufficient hard budget for scripted turns/tool allowance;
- subject-visible grading leakage.

Use preserved campaign defects as regression fixtures.

### Slice 1.4 — Result Semantics

Add explicit internal result states and embed semantic evidence in assembled results. Keep legacy fields/status/exit behavior unchanged for single-case JSON.

**Phase check:** full existing evaluator suite plus CEV/preflight tests pass; no provider use.

## Phase 2 — Staged Case Engine And Batch Scheduler

### Slice 2.1 — Stage Interface

Extract current subject, objective grade, semantic grade, integrity, and publication work behind one stage contract:

```text
input identity → execute → immutable artifact → usage → stage state
```

Initially run the existing one-case path through the stage interface without behavior change.

### Slice 2.2 — Case Attempt State Machine

Implement the normative case-attempt transition/reuse table. Test reference failure, candidate failure, grader failure, behavior fail, publication failure, and global stop. Preserve whole-case reruns for subject failures.

### Slice 2.3 — Batch Plan Compiler

Support `evaluate --suite ... --concurrency ... --plan-only`. Fingerprint ordered case plans, scheduler policy, reservations, adapter, codec, cache policy, and aggregate envelopes. Preserve `--skill --case` compatibility.

### Slice 2.4 — Bounded Scheduler

Run independent cases with bounded concurrency, variants serial inside each case, isolated writable roots, and case-local failures. Add compact row progress for batch mode and full `--format json`.

Fault tests prove one malformed/timeout case does not cancel siblings; a global identity failure stops nonpublished work; already published sibling cases remain accepted.

**Phase check:** deterministic fake-adapter batch with concurrency 2 is ≥20% faster than serial and has identical case outcomes.

## Phase 3 — Journal, Budgets, Pause, And Restart

### Slice 3.1 — Authoritative Commit Log

Implement same-filesystem artifact commits and hash-chained authoritative journal records. State files are projections. Add crash injection at each ordering boundary, torn-tail recovery, state rebuild, and artifact-hash mismatch failure.

### Slice 3.2 — Budget Reservations

Separate hard-enforced, soft, and observed budgets. Atomically reserve worst-case enforceable capacity before concurrent launch. Report raw/retained bytes separately.

### Slice 3.3 — Soft Continuation

Soft crossing journals and continues within the hard envelope. Hard crossing yields `paused-limit` only with an exact checkpoint. No automatic work may exceed approval.

### Slice 3.4 — Pi Resume Learning Slice

**Question:** Can Pi restore exact session, active branch, tool state, and pending turn after evaluator restart?

Build a bounded proof against Pi 0.80.6. Promote restart resume only if checkpoint identity and transcript/event continuation are exact. Otherwise retain live-process continuation and case-attempt restart fallback.

**Phase check:** no reconstructed summaries are called resume; restart behavior matches adapter capability truthfully.

## Phase 4 — Exact Cache And Immutable Regrading

### Slice 4.1 — Content-Addressed Stage Store

Implement per-stage keys and invalidation from the spec table. Start with materialization, fixture, runtime envelope, compact rendering, and objective grade caches.

### Slice 4.2 — Capability Freshness

Cache expensive probe details only under executable/config/env identity and TTL; always perform execution-time lightweight recheck.

### Slice 4.3 — Complete Subject Artifact Contract

Validate that a subject artifact contains every prompt, settled event, final response, workspace/diff, activation/runtime record, usage/process result, omissions, and integrity hash needed for downstream reuse.

### Slice 4.4 — Grader-Only Regrade

Create a separate adjudication record for rubric/grader-only changes. Preflight proves criteria are decidable from captured evidence. Original results remain immutable. Tests prove zero subject requests and forbid regrade when evidence is absent.

**Phase check:** cache hit/miss/invalidation and replay-as-not-new-sample semantics pass fault tests.

## Phase 5 — Pi Integration, Compatibility, And Qualification

### Slice 5.1 — Pi Adapter Conformance

Implement normalized adapter operations/events and conformance tests for capability honesty, isolation, settlement, accounting, cancellation, limits, checkpoints, process cleanup, and raw/retained output.

### Slice 5.2 — Legacy Compatibility

Golden-test existing single-case JSON stdout, statuses, exit codes, plan semantics, and frozen v1 bundle reader fixtures.

### Slice 5.3 — Deterministic Acceptance

Run all old and v3 tests, CEV parity, preflight defect fixtures, batch fault matrix, journal recovery, budget reservation, cache/regrade, adapter conformance, and package cleanliness.

### Slice 5.4 — Exact Provider Preview

Freeze final `v3-acceptance.json`, generate exact Pi/model/thinking/case/limit fingerprints, and obtain owner approval.

### Slice 5.5 — Behavioral And Cost Qualification

Run the frozen suite. Require:

- no candidate objective regression;
- no semantic pass→fail/uncertain regression;
- compact byte target met;
- zero subject requests for grader-only correction;
- unaffected siblings complete under case-local fault;
- integrity and exact recovery pass;
- independent final implementation/evidence review.

Only then update `evaluate-skill` readiness to the exact v3 Pi configuration.

## Dynamic Backward Triggers

Route backward if:

- compact facts cannot retain exact lineage;
- stage keys need undeclared inputs;
- scheduler cases share writable state;
- a pause cannot preserve exact host state;
- batch reservations cannot enforce declared hard maxima;
- compatibility requires silently changing legacy output;
- provider-backed evidence is needed before deterministic architecture stabilizes;
- implementation adds another public lifecycle command;
- remaining work grows because stage ownership is still split across coordinator, adapter, and publisher.

## Immediate Horizon

Implement Phase 0 and Phase 1 only. They provide cost evidence and prevent known architectural defects before scheduler/resume complexity is introduced. Stop for a design/plan checkpoint after the complete feasibility compiler and compact semantic packet tests pass.
