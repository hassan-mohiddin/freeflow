# Freeflow Evaluator v3 Implementation Plan

> **Type:** Historical rolling implementation plan
> **Status:** Superseded before implementation
> **Source:** `docs/specs/skills/2026-07-13-freeflow-evaluator-v3.md` (superseded)
> **Current direction:** [`skills/evaluate-skill/SKILL.md`](../../../../skills/evaluate-skill/SKILL.md) and its fresh `run`/`view` implementation
> **Historical baseline:** Retired evaluator under `.deprecated/skill-tooling-pre-rewrite/`
> **Historical review:** Passed artifact review after one revision pass; four initial blockers were resolved
> **Historical progress:** Phases 0–1 and accepted Phase 1 review corrections were self-verified before this plan was superseded

The instructions below are documentary history only. They do not authorize or describe the active evaluator; compatibility, semantic grading, readiness, caps, journals, caches, resume, and `evaluate --plan-only` were rejected by the replacement.

## Goal

Replace the one-case, JSON-heavy, terminal-limit evaluator coordinator with a compatible Pi-first staged engine that compacts model evidence, validates cases before provider access, batches independent cases safely, journals resumable state, and reuses only exact integrity-valid stages.

## Guardrails

- Preserve existing single-case CLI JSON and bundle behavior throughout migration.
- Keep one writer per source checkout; isolate every subject workspace.
- Do not change skill behavior or case criteria to make v3 pass.
- At the first v3 runtime implementation change, mark `evaluate-skill` Unverified and preserve the accepted v2 report as historical evidence. Restore readiness only after Slice 5.5. `write-skill` readiness remains independent unless its source changes.
- Keep canonical JSON exact; compact rendering is a model/terminal view.
- Preserve whole-case subject rerun fairness after subject/candidate/infrastructure failure.
- Add batching behind the existing `evaluate` command.
- No Claude/Codex implementation in the Pi acceptance horizon.
- Every slice ends with sequential self-check: focused direct verification, broader evaluator tests when affected, then one bounded self-review only when evidence supports the outcome; `git diff --check` remains structural evidence.
- Intermediate slices and phase endings do not dispatch independent reviewers or verifiers. Additional independent checkpoints require explicit scoped authorization.

## Phase 0 — Freeze Baseline And Cost Corpus

### Slice 0.1 — Preliminary Baseline Corpus Lock

**Type:** learning/delivery

Add a deterministic script that inventories selected saved bundles and writes `.skill-eval/evaluate-skill/v3-baseline-lock.json` with exact hashes for:

- baseline evaluator implementation;
- Pi adapter/version;
- representative case/fixture/skill/runtime inputs;
- canonical semantic packets;
- observed process usage and model-visible byte counts;
- expected baseline objective and semantic verdicts.

This lock is a preliminary input to later acceptance. It contains no candidate identity, cannot authorize provider execution, and is never renamed or mutated into the final acceptance manifest. Slice 5.4 generates `.skill-eval/evaluate-skill/v3-acceptance.json` from the immutable baseline lock plus the completed v3 candidate, codec/reducers, limits, tools, and fault fixtures.

Initial corpus:

- `WFC2-001` composition one-shot;
- `WFC2-002` four-turn composition;
- final `WFI-002` mutation case;
- final `WFI-003` proof-fidelity case;
- one complete semantic bundle suitable for rubric-only regrade.

**Verification:** the baseline lock is reproducible byte-for-byte; missing or mutated bundle fails closed; no provider requests.

### Slice 0.2 — Baseline Metrics

Measure canonical/model-visible bytes, provider requests, rerun causes, cap failures, and wall-time shape from saved evidence. Record facts in `.skill-eval/evaluate-skill/reports/v3-baseline.md`. Do not claim savings yet.

**Checkpoint:** revise later thresholds only if baseline evidence makes an approved threshold impossible or meaningless.

### Slice 0.3 — Legacy Compatibility Fixtures

Freeze representative v1 single-case plan/evaluate JSON, exit statuses, and accepted/diagnostic bundle-reader fixtures before changing runtime code. Golden tests must compare normalized volatile fields while preserving schema, required fields, statuses, and exit behavior.

## Phase 1 — Compact Evidence And Feasibility Preflight

### Slice 1.1 — CEV1 Codec Core And Readiness Transition

**Type:** delivery

Before the first evaluator runtime source edit, update the evidence registry/current readiness documentation so `evaluate-skill` is Unverified during v3 implementation. Preserve the accepted v2 evidence and leave `write-skill` readiness unchanged.

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

#### Slice 1.3a — Feasibility Contract Learning

**Question:** Which checks can be derived safely from the existing case, fixture, tool, assertion, and limit schema, and which require explicit author declarations rather than prompt/rubric heuristics?

Compare:

- heuristic-only inference from natural language;
- declaration-only feasibility manifests;
- a hybrid where mechanical checks derive from existing fields and only non-inferable semantics use bounded declarations.

Use preserved campaign defects as the experiment corpus. Reject any design that recreates hidden grading keys, requires duplicating the rubric, or lets optional declarations bypass mechanical checks. Promote only the smallest contract that makes each required check deterministic and emits source spans; otherwise revise this slice before production code.

#### Slice 1.3b — Compiler And Exact Report

Implement the selected contract and catch, before provider access:

- unnamed evidence without discovery tools;
- requested operations unavailable through tools;
- redundant later-turn reread assertions;
- exact literals unsupported by source/prompt enums;
- overconstrained equivalent classifications or setup seams;
- missing conditional resources;
- changed-path/request conflicts;
- rubric facts absent or undiscoverable;
- declarative, non-executable fixture oracles that do not establish the claimed pressure;
- insufficient hard budget for scripted turns and tool round trips;
- compact packet and raw transport exceeding their separate limits;
- subject-visible grading leakage.

Preflight emits compact warnings/errors for operators and a canonical exact report with the check id, source span, evidence, severity, and blocking reason. Blocking findings make zero provider requests.

**Acceptance:** regression cases cover discovery/read-tool absence, exact-literal leakage, redundant rereads, equivalent setup seams, non-reproducing fixture pressure, non-execution plus symlink/path containment for fixture oracles, and compact/raw limit mismatch.

### Slice 1.4 — Result Semantics

Implement objective and semantic grading as separate axes. Objective failure still blocks acceptance, but complete safe artifacts may receive diagnostic semantic grading labelled non-promotable; unsafe, partial, capped, or integrity-invalid artifacts must not reach semantic grading. Embed the semantic verdict, rationale, uncertainty, and promotability directly in assembled results instead of placeholder text.

Tests cover objective-fail with safe complete evidence, objective-fail with unsafe/incomplete evidence, semantic-grader failure, and legacy external projection. Keep legacy fields/status/exit behavior unchanged for single-case JSON.

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

### Slice 5.4 — Final Acceptance Manifest And Provider Preview

Generate and freeze `.skill-eval/evaluate-skill/v3-acceptance.json` from the immutable baseline lock and completed v3 candidate. It includes exact candidate, Pi/model/provider/thinking, codec/reducer, prompt, tool, limit, expected assertion, and local/global fault-fixture identities. Generate exact execution fingerprints and obtain owner approval.

### Slice 5.5 — Behavioral And Cost Qualification And Final Assurance

Run the frozen suite. Require:

- no candidate objective regression;
- no semantic pass→fail/uncertain regression;
- compact byte target met;
- zero subject requests for grader-only correction;
- unaffected siblings complete under case-local fault;
- integrity and exact recovery pass.

Then run the final sequential self-check, freeze one exact source/evidence identity, and dispatch one fresh verifier plus one different fresh reviewer in parallel against that same state. Neither receives the other's output. Completion and readiness restoration require verifier Pass plus resolved review with no later implementation change. Any code change stales both results; self-check the correction and ask before another independent dispatch.

Only then restore `evaluate-skill` readiness for the exact v3 Pi configuration. Preserve the v2 report as historical evidence and leave `write-skill` readiness unchanged.

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

Implement Phase 0 and Phase 1 only. They provide cost evidence and prevent known architectural defects before scheduler/resume complexity is introduced. After the complete feasibility compiler and compact semantic packet tests pass, run the sequential phase self-check and reassess the plan route without dispatching an independent context merely because the phase ended.
