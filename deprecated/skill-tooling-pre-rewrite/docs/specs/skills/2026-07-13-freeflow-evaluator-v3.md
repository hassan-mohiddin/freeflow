# Freeflow Evaluator v3: Efficient Batched, Resumable Evaluation

> **Type:** Technical and behavioral specification
> **Status:** Approved
> **Planning readiness:** Planning-ready with implementation-testable host-resume questions
> **Owner direction:** Prioritize evaluator efficiency before continuing paid skill qualification
> **Review:** Initial architecture review found eight blockers; the approved contract resolves each through explicit fairness, journal, budget, cache, lineage, compatibility, adapter, and acceptance semantics
> **Supersedes:** The no-batching, no-cache, terminal-limit execution boundary in `docs/specs/skills/2026-07-12-freeflow-composition-evaluation-extension.md`
> **Preserves:** Exact input identity, isolated variants, evidence-class honesty, fair comparisons, and atomic accepted publication

## Problem

The current evaluator preserves exact evidence but wastes provider work and model context:

- canonical JSON manifests and semantic packets are also used as model-facing representations;
- one CLI invocation executes one case with no batch scheduler;
- a case-local failure stops the caller's manually managed wave;
- hard turn/output/time limits terminate processes and discard continuation state;
- settled stages cannot resume or be regraded safely;
- preflight validates schema and capabilities but not prompt/tool/evidence/rubric feasibility;
- semantic grading is skipped after any objective failure, hiding useful diagnostic meaning;
- result labels collapse candidate pass, neutral pass/fail/inactive, case defects, and grader defects;
- avoidable case, grader, tool, and cap defects are discovered only after provider requests.

The remaining 24-skill campaign is large enough that optimizing the evaluator now is cheaper and safer than continuing repeated one-case reruns.

## Outcome

Provide one portable evaluator CLI that can plan and execute independent cases in bounded parallel batches, keep exact evidence outside model context, resume paused work where the host supports it, reuse only integrity-valid exact stages, and isolate case-local failures without weakening behavioral evidence.

## Core Invariants

1. Canonical JSON/files/events remain exact, content-addressed evidence outside model context.
2. Model-facing packets contain the smallest sufficient deterministic facts plus exact recovery pointers.
3. Prompt, fixture, tools, host, model, thinking, skill resources, runtime, limits, reducers, and grader identities remain fingerprinted.
4. Cases are isolated. One case-local failure does not cancel unrelated cases.
5. Shared evaluator, host, approval, identity, or publication-root failures stop the batch.
6. Variants within one case remain serial initially; independent cases may run concurrently.
7. A cached stage is replayed evidence, not a new behavioral sample.
8. Subject-facing input changes invalidate subject stages. Grader-only changes may regrade immutable complete subject artifacts without new subject requests.
9. Soft-budget crossing is not failure. Hard safety exhaustion pauses when exact continuation is possible and restarts only the affected case otherwise.
10. Accepted case publication remains atomic: no accepted result appears until all required stages and integrity checks pass.
11. Full batch JSON is retained; default terminal and model-visible output is compact.
12. Pi, Claude, and Codex use one host-neutral scheduler and evidence model through capability-declaring adapters.

## Architectural Decision

Use a staged evaluator engine, not a shell wrapper around the current one-case coordinator and not a runtime dependency on enabled Output Router.

```text
Case compiler
→ content-addressed snapshot store
→ batch scheduler
→ host adapter
→ objective grader
→ semantic grader
→ integrity/publisher

All stages
↔ append-only journal + atomic case state
↔ compact evidence codec + exact recovery store
```

The compact evidence codec should reuse or extract pure Output Router fact-first rendering and reducer concepts. The evaluator ships it directly so Claude, Codex, and Pi do not require Output Router configuration.

## Compact Evidence Contract

Canonical evidence stays JSON. Models receive a deterministic compact view only when it is smaller without changing meaning.

The versioned `CEV1` record grammar is line-oriented. `|`, newline, carriage return, backslash, and control bytes use deterministic backslash escaping. Every derived fact or excerpt carries its own lineage; an aggregate source footer is insufficient.

```text
H|CEV1|case=VQ-002|role=candidate|host=pi@0.80.6|model=gpt-5.5
S|s1|kind=file|path=events.json|sha256=<hash>|bytes=164|recovery=exact
F|runtime|value=0.79.0|source=s1|span=json:/runtime_version|op=json-pointer@<hash>|recovery=exact-source
F|driver|value=direct-callback|source=s1|span=json:/proof_driver|op=json-pointer@<hash>|recovery=exact-source
F|hostDispatch|value=0|source=s1|span=json:/host_dispatch_events|op=json-pointer@<hash>|recovery=exact-source
O|kind=omitted|reason=irrelevant-to-fixed-criteria|count=12
R|bundle=<id>|canonicalSha256=<hash>|recovery=exact
```

Record types:

- `H`: schema and execution identity;
- `S`: canonical source identity, path/output id, content hash, size, and recoverability class;
- `F`: fact/excerpt with source id, exact JSON pointer or byte/line span, reducer/operation identity hash, and fact-level recoverability;
- `O`: explicit truncation, omission, unavailability, or cap record;
- `R`: canonical packet/bundle recovery identity.

Recoverability values are `exact`, `exact-source`, `metadata-only`, `hint-only`, or `none`, matching Output Router vocabulary. Every reducer is pure, versioned, content-hashed, and receives explicit source aliases. Compact rendering fails closed to canonical rendering when lineage cannot be expressed.

Rules:

- preserve ordered facts and source ordering;
- never call metadata-only evidence exact;
- keep small natural-language prompts and skill text uncompressed;
- use thresholds so tiny JSON is not transformed when transformation costs more;
- retain full canonical packets for audit and recovery;
- report canonical bytes, compact bytes, omitted bytes, and recovery class separately;
- validate semantic-packet fact parity against canonical source fields before provider access.

Semantic graders receive only fixed criteria, relevant turn responses, deterministic objective facts, changed paths and bounded diffs/content, fact-level source pointers, and explicit omissions/unavailability. They do not receive full manifests or unrelated event streams.

## Batch CLI Contract

Preserve `doctor`, `init`, and `evaluate`. Extend `evaluate` rather than adding a separate public lifecycle.

Planning example:

```bash
skill-eval evaluate \
  --suite phase5-methods \
  --concurrency 3 \
  --plan-only
```

Execution example:

```bash
skill-eval evaluate \
  --suite phase5-methods \
  --concurrency 3 \
  --owner-approved \
  --expect-batch-plan <sha256>
```

Single `--skill --case` execution remains compatible.

A batch plan fingerprints:

- ordered case fingerprints;
- concurrency and scheduling policy;
- per-stage soft/hard limits;
- aggregate approved provider-turn and spend envelopes;
- host-adapter identities;
- compact-evidence codec/reducer identities;
- cache/resume policy;
- evaluator implementation.

Legacy single-case invocation preserves default JSON stdout, statuses, fields, and exit codes. Batch invocation defaults to compact progress rows; `--format json` emits full machine JSON, and `--format rows` opts a single case into compact rows. Golden CLI tests cover legacy JSON and batch rows.

## Scheduler, Failure Unit, And Publication

Definitions:

- **Batch:** approved scheduling envelope containing independent cases.
- **Case attempt:** atomic fairness and accepted-publication unit for one case fingerprint.
- **Variant subject stage:** one reference or candidate host session inside an attempt.
- **Grade stage:** objective or semantic judgment over one complete variant subject artifact.
- **Published case:** immutable accepted case bundle; it is independent of later sibling outcomes.

A case attempt follows:

```text
queued → preflight → snapshotted
→ reference-subject → reference-objective → reference-semantic
→ candidate-subject → candidate-objective → candidate-semantic
→ integrity → published
```

Normative reuse/publication matrix:

| Event | Reference subject | Candidate subject | Grades | Publication |
| --- | --- | --- | --- | --- |
| Subject input/source changes | rerun | rerun | rerun | forbidden until complete |
| Reference subject failure | discard attempt | not started | discard | diagnostics only |
| Candidate subject/infrastructure failure | discard attempt | discard attempt | discard | diagnostics only; next attempt reruns both subjects |
| Live-session soft-budget continuation | same attempt/session | same attempt/session | unchanged | still forbidden until complete |
| Grader-only failure after both subject stages complete | retain exact subjects | retain exact subjects | rerun failed grader | forbidden until all grades/integrity pass |
| Rubric/grader-only change with complete sufficient captured evidence | retain as replayed evidence | retain as replayed evidence | create separate regrade | original result unchanged; new adjudication is not a behavioral rerun |
| Global batch failure after case publication | immutable | immutable | immutable | already published case remains accepted |
| Global batch failure before case publication | stop/pause case | stop/pause case | stop | no case publication |

Thus v3 preserves whole-case subject reruns after candidate or subject infrastructure failure. It does not reuse a settled reference across a new subject attempt. A continuation of the same exact live session is not a new attempt.

Case states are `paused-limit`, `case-invalid`, `grader-invalid`, `infrastructure-failed`, `behavior-complete`, or `published`. Case-local failure leaves siblings queued/running. Global approval, evaluator/adapter identity, shared runtime, publication-root, or scheduler corruption stops nonpublished work. Concurrency is bounded and positive; no writable root is shared.

## Durable Journal And Resume

The append-only `journal.jsonl` commit log is authoritative. `state.json` files are disposable projections rebuilt from it.

Commit ordering on one filesystem:

1. write artifact to a temporary sibling;
2. fsync artifact, rename atomically, then fsync parent directory where supported;
3. append one length-prefixed, sequence-numbered, previous-hash-linked journal record naming artifact hashes;
4. fsync the journal;
5. atomically refresh projected state.

On recovery, scan the hash chain to the last complete valid record, discard a torn/unparseable tail, verify every committed artifact hash, and rebuild state. A state/journal disagreement always resolves in favor of the valid journal prefix. Cross-filesystem artifact commits are forbidden.

Resume requires exact plan/resource hashes plus an adapter checkpoint containing host session id, session artifact hash, last settled host event id, workspace hash, and pending scripted turn. A soft-budget extension may continue the same live session. After process/CLI restart, use host-native resume only when conformance tests prove exact restoration; otherwise discard the attempt and restart both subjects for that case. Never reconstruct conversation state from summaries.

Continuation within the approved hard envelope retains the original fingerprint. Extending a hard envelope requires owner approval and a chained continuation fingerprint. No partial journal can publish an accepted case. Pi exact restart resume is an implementation learning slice; v3 acceptance does not depend on it.

## Budget Contract

Every budget is classified:

- **hard-enforced:** Pi/provider-turn root guard, wall clock, retained bytes, raw transport bytes, process count, concurrency;
- **soft:** expected turns/time/bytes and host-reported cost warnings;
- **observed:** provider requests or spend the host cannot independently reserve/enforce.

Before launching a concurrent process, the scheduler atomically reserves its worst-case hard-enforced turns/process slot/raw/retained capacity from the approved batch envelope. A stage that cannot reserve does not start. Reservations release only after settlement. Spend/provider-request observations never masquerade as hard enforcement.

Soft crossing journals a warning and continues within the reserved hard envelope. Hard crossing becomes `paused-limit` only when an exact same-attempt checkpoint exists; otherwise the case attempt fails. No automatic resume or restart may exceed the approved hard envelope. Any extension requires a newly approved chained fingerprint.

Defaults are calibrated from saved-run p50/p95 by process shape—no-tool, one-shot tool, fixed multi-turn, semantic grader, and adapter—not one universal number. Plans report hard maxima, soft expectations, reservations, and observed-only limitations separately.

## Safe Cache Contract

| Stage | Complete cache key | Revalidation / invalidation |
| --- | --- | --- |
| Capability probe | adapter executable/config/env identity, probe source hash, OS/runtime, capability schema | freshness TTL plus execution-time lightweight recheck; never indefinite |
| Git/resource materialization | revision, root/path, ordered resource hashes, path-policy version | recheck source object ids and destination hashes |
| Fixture snapshot | case hash, fixture tree hash, path-policy version | recheck source tree before attempt |
| Runtime envelope | adapter/runtime implementation, kernel/workflow/profile hashes | recheck all inputs before delivery |
| Compact rendering | canonical packet hash, CEV schema, reducer/operation hashes, limits | verify fact lineage/parity |
| Objective grade | immutable before/after/transcript/case/assertion/grader hashes | all artifact hashes must match |
| Semantic grade | exact compact packet, rubric, model/provider/thinking, grader implementation, limits | reused as same judgment, never a new sample |
| Subject stage for regrade | complete subject fingerprint, settled transcript/final/diff/workspace/event/usage hashes | only downstream rubric/grader may differ |

A **complete subject artifact** contains every prompt/turn, settled host events, final responses, before/after manifests, full changed files/diff under caps with explicit omissions, activation/runtime evidence, usage/process status, and integrity hashes. Regrade preflight must prove every new criterion is decidable from those immutable artifacts; otherwise fresh subjects are required.

Partial/corrupt output, changed subject-facing input, cross-host/model reuse, and replay-as-repeat are forbidden. Cache hits state `reused_exact_stage` and point to original evidence identity.

## Immutable Regrading

A complete subject stage may be regraded without new subject calls when only the rubric or grader changes.

The evaluator creates a separate adjudication record containing:

- original subject fingerprint and artifact hashes;
- new rubric/grader identity;
- new semantic packet hash;
- previous and new verdicts;
- evidence boundary and limitations.

It never overwrites the original result or calls the regrade a behavioral rerun. Subject-facing changes still require fresh variants.

## Preflight Compiler

Before provider access, validate:

- all named files and resources exist and are non-symlinked/contained;
- rubric-required evidence is named or discoverable through allowed tools;
- requested actions are possible through the tool allowlist;
- turn-scoped activation assertions do not require redundant rereads;
- exact literals come from a prompt/source enum;
- accepted equivalent classifications/setup seams are not forbidden accidentally;
- changed-path assertions agree with requested outputs;
- conditional skill references are declared;
- fixture oracle reproduces the pressure;
- estimated process budgets cover scripted turns plus tool round trips;
- compact packet and raw transport fit separate limits;
- no expected outcome, grader key, handoff, or review artifact leaks to subjects.

Preflight produces compact warnings/errors and a full exact report. Blocking errors make zero provider requests.

## Grading And Result Semantics

Objective and semantic grading are separate axes.

An objective failure still blocks candidate acceptance, but a diagnostic semantic grader may run when complete safe artifacts exist. Diagnostic semantics cannot repair objective failure and are labelled non-promotable.

Internal result states distinguish:

- candidate pass / reference pass;
- candidate pass / reference fail;
- candidate pass / reference inactive;
- candidate fail;
- both fail;
- case invalid;
- grader invalid;
- paused limit;
- infrastructure failed.

Final result embeds semantic evidence and uncertainty directly instead of leaving placeholder text.

## Host Adapter Contract

v3 production acceptance is Pi-first. Claude and Codex consume the same portable core only after separate adapter conformance and behavioral qualification; Codex remains diagnostic and Claude is deferred initially.

Adapters implement normalized operations `probe`, `start`, `sendTurn`, `settle`, `checkpoint`, `resume`, `cancel`, and `usage`. Normalized events are `session_started`, `prompt_sent`, `assistant_settled`, `tool_started`, `tool_finished`, `usage`, `checkpoint`, `limit`, `process_exit`, and `error`, each with monotonic event id, session id, timestamp, adapter identity, and exact payload hash.

Conformance tests cover capability honesty, isolated roots, native skill delivery/read evidence, event settlement, accounting, soft/hard limits, cancellation/process-tree cleanup, checkpoint identity, resume truthfulness, raw/retained output separation, and normalized error classes. Unsupported capability blocks only requiring cases.

## Compatibility

- Existing case/suite files remain valid.
- Existing single-case CLI preserves default JSON, statuses, fields, exit codes, and plan semantics.
- A versioned bundle reader loads frozen v1 result/diagnostic fixtures; v3 writes schema-versioned bundles without rewriting v1.
- Old fingerprints remain historical and are never reinterpreted as v3 evidence.
- v3 implementation changes reset `evaluate-skill` readiness to Unverified until exact acceptance passes.
- `write-skill` readiness remains bounded to its accepted source/configuration unless its source changes.

## Acceptance

### Deterministic

- compact codec round-trips source identity and exact recovery;
- compact packets are smaller than canonical packets on representative saved bundles;
- tiny inputs remain direct when reduction is not beneficial;
- one malformed case does not stop valid siblings;
- global identity failure stops the batch;
- concurrency never shares writable roots;
- injected timeout/output/provider/process/publication faults produce correct case states;
- soft crossing continues; hard crossing pauses/restarts only the case;
- CLI restart resumes journaled work without accepting partial evidence;
- exact stage cache hits and invalidations are correct;
- grader-only correction makes zero subject requests;
- existing single-case and composition tests remain compatible;
- preflight catches the tool-discovery, exact-literal, redundant-reread, and equivalent-setup defects preserved in campaign diagnostics.

### Behavioral And Cost

Before implementation behavior runs, create and review `.skill-eval/evaluate-skill/v3-acceptance.json`. It freezes full hashes for the current baseline evaluator, v3 candidate, Pi adapter/version, model/provider/thinking, CEV codec/reducers, cases, fixtures, prompts, tools, limits, and expected candidate assertions. The initial corpus includes composition one-shot/four-turn, one artifact case, one multi-turn mutation case, one grader-only correction fixture, and injected local/global failures.

Acceptance thresholds:

- 100% objective assertion parity with the frozen baseline cases;
- no candidate semantic pass becomes fail or uncertain on the frozen behavioral cases;
- every canonical fact required by a rubric is present or explicitly unavailable in CEV parity checks;
- median semantic-grader model-visible bytes are at least 40% lower than canonical packet bytes, and no representative compact packet is larger than canonical;
- grader-only correction makes zero new subject requests;
- one case-local injected failure leaves every unaffected sibling complete;
- with concurrency `2`, batch wall time is at least 20% lower than serial on the deterministic fake-adapter suite; provider-backed wall-time improvement is reported but not a release gate because service variance is external;
- no architecture-defect fixture reaches provider access;
- no cache replay is counted as a new sample;
- exact integrity/recovery and one independent final evidence review pass.

Production readiness is Pi 0.80.6 and the exact frozen provider/model/thinking configuration only. Claude/Codex are not part of v3 readiness until their adapter-specific acceptance passes.

## Deferred

- adaptive model-generated follow-up prompts;
- unbounded concurrency;
- model-assisted evidence reduction by default;
- Claude and Codex adapter implementation/readiness until Pi v3 is accepted;
- cross-host readiness claims before each adapter's own evidence;
- treating cached outputs as statistical repeats;
- unsafe unsandboxed transforms.

## Stop Conditions

Stop and revise architecture if:

- batching requires shared writable subject state;
- compact rendering can hide source identity or weaken exact recovery;
- resume reconstructs rather than restores host state;
- cache correctness depends on undeclared inputs;
- case-local failure can publish a partial accepted result;
- concurrency or compression changes comparison fairness;
- another public lifecycle command becomes necessary without explicit owner approval.
