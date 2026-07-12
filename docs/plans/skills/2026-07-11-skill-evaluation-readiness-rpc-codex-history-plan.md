# Skill Evaluation Readiness, Stateful Pi, Codex, And Historical Evidence Plan

> **Doc ID:** PLAN-2026-07-11-skill-evaluation-readiness-rpc-codex-history
> **Date:** 2026-07-11
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready — Phases 1–3 complete; Phase 4 local spec gate is next
> **Source:** Owner-approved roadmap decisions; `docs/specs/skills/skill-authoring-and-evaluation-v2.md`; `.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md`; live evaluator and host evidence

## Goal

Reach one internal engineering milestone through four sequential phases:

1. establish configuration-bound readiness for the current Pi one-shot evaluator;
2. add trustworthy fixed-script multi-turn evidence through Pi RPC;
3. add one concrete Codex CLI subject adapter without pretending reduced-fidelity evidence is equivalent;
4. index legacy skill evidence as documentary history without converting it into current evaluator results.

The milestone ends after the four phases are verified and reported. It is not packaging, release, deployment, Production-Ready promotion, or model-independent validation.

## Source Authority

Use, in order:

1. explicit owner decisions recorded in this plan;
2. the current v2 evaluator spec for the existing bootstrap contract;
3. live evaluator code, tests, case sources, Pi behavior, and Codex behavior;
4. current accepted result bundles and integrity records;
5. historical reports and handoffs as evidence, never authority.

The current spec deliberately defers Pi RPC, second-host support, and historical migration. Before implementation changes those contracts, revise the owning spec with only the accepted additions for that phase and review the revision. Do not reinterpret the old bootstrap plan as approval for new scope.

## Settled Decisions

- The endpoint is an internal engineering milestone.
- Freeflow Skills remain runtime-disabled during owner verification. Manual source reading does not change activation state.
- `.freeflow/config.json` remains unchanged.
- Node.js 22+ ESM and standard-library APIs remain the only evaluator implementation dependency.
- One `evaluate` invocation owns one case. Whole-case atomicity and serial variants remain.
- No batching, concurrency, cache, resume, partial reuse, adaptive repeats, or evaluator-internal Output Router composition.
- Existing successful results are observation 1 for Phase 1.
- Phase 1 repeats `WSK2-001`, `ESK2-007`, and `ESK2-008` once on the current accepted configuration.
- Multi-turn uses fixed predeclared user turns and one isolated Pi RPC process per variant.
- Multi-turn remains behind `evaluate`; no lifecycle command is added.
- Every multi-turn semantic assertion declares the exact turn IDs it may inspect. All semantic assertions in one multi-turn case use the same ordered turn IDs so the evaluator retains at most one semantic process per variant.
- Initial multi-turn acceptance includes one synthetic state/isolation case and one real `decision-gate` case.
- Codex support begins with isolated `codex exec`; app-server is deferred.
- Portable cases declare allowed subject hosts; the CLI selects exactly one with `--host`. There is no host fallback.
- Subject and semantic-grader model settings use role-qualified options. Legacy shared Pi options remain a narrow compatibility path.
- Codex must pass an isolation and limit-capability learning slice before accepted cross-host evidence.
- Historical migration is report-level, documentary-only, and physically separate from `.skill-eval/**/runs/evaluations/`.
- Paid execution always requires deterministic preflight, bounded settings, plan-fingerprint binding, and a whole-case run. On 2026-07-11 the owner granted standing approval for roadmap-declared runs that preserve those reviewed bounds and instructed the agent not to ask repeatedly. New run scope, higher limits, or a route-changing method still requires owner direction.

## Scope

### In scope

- current-configuration Pi readiness evidence;
- backward-compatible case-contract additions for fixed scripted turns;
- strict Pi RPC JSONL transport and canonical per-turn evidence;
- a concrete Codex CLI subject adapter when required boundaries are enforceable, plus the explicitly selected reduced-fidelity diagnostic exception that remains blocked from model execution;
- role-specific execution configuration and accounting;
- documentary historical-evidence index, schema, and audit;
- focused docs, tests, cases, reports, and integrity verification.

### Out of scope

- public release or package preparation;
- Production-Ready promotion;
- broad model/provider matrix testing;
- arbitrary/adaptive conversations;
- model-generated follow-up turns;
- shared or resumed sessions;
- cross-case orchestration;
- Codex app-server;
- Claude or another host adapter;
- a generic host plugin registry designed before concrete adapter evidence;
- global provider request scheduling;
- Output Router integration;
- importing, regrading, sealing, resuming, or comparing legacy runs as current evidence.

## Repository Safety

The worktree contains unrelated user-owned modifications. Each phase must:

- inspect `git status --short`, scoped diffs, staged state, and untracked files before writing;
- touch only the active phase's approved paths;
- never discard, reset, overwrite, stage, or commit unrelated changes;
- stop if a required target has overlapping user changes that cannot be merged safely;
- keep generated run data ignored unless a specific durable report or registry entry is approved.

Likely write boundaries:

- Phase 1: `.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md` and generated evaluation bundles only.
- Phase 2: the owning spec; `skills/evaluate-skill/**`; `.skill-eval/evaluate-skill/tests/**`; `.skill-eval/decision-gate/**`; narrowly required `decision-gate` fixtures only.
- Phase 3: the owning spec; `skills/evaluate-skill/**`; `.skill-eval/evaluate-skill/tests/**`; selected portable case sources and fixtures.
- Phase 4: the owning spec; `evals/registries/historical-evidence.json`; `evals/schemas/historical-evidence.schema.json`; `evals/scripts/audit-historical-evidence.mjs`; a narrow migration report; related `evals/README.md` or `skill-evidence.json` links only after reconciling existing changes.

Exact files are chosen from live evidence at each slice. New writes outside these boundaries require a plan route check and owner decision when consequential.

## Phase Map

| Phase | Outcome | Entry dependency | Exit gate |
| --- | --- | --- | --- |
| 1. Configuration-bound readiness | Two complete observations for three designated Pi cases | Current accepted bootstrap | Exact case criteria and integrity pass |
| 2. Stateful Pi RPC | Fixed multi-turn cases produce trustworthy per-turn evidence | Phase 1 passes | Synthetic and real cases pass; one-shot regressions remain green |
| 3. Codex CLI | One isolated concrete second-host adapter and bounded evidence | Phase 2 passes | Isolation/limit proof passes, or support is explicitly reduced-fidelity |
| 4. Historical evidence | Audited documentary index with no readiness authority | Phase 3 route is settled | Schema/audit pass and current evidence remains separate |

Proceed sequentially. A failed phase changes the route; it is not permission to skip ahead.

## Phase 1 — Configuration-Bound Pi Readiness

**Status:** Complete on 2026-07-11. The three observation-2 results satisfied the gate and passed fresh integrity verification.

### Outcome

Support the statement:

> Verified for constrained Pi 0.80.6 execution with `openai-codex/gpt-5.5`, high thinking, across two complete observations of the designated readiness cases.

This does not change either skill's Unverified status.

### Slice 1.1 — Revalidate Before Spending

**Type:** delivery

Confirm the current evaluator, case sources, subjects, and environment still match the accepted boundary.

Checks:

```bash
node --test .skill-eval/write-skill/tests/*.test.mjs .skill-eval/evaluate-skill/tests/*.test.mjs
node skills/write-skill/scripts/skill-author.mjs validate skills/write-skill
node skills/write-skill/scripts/skill-author.mjs validate skills/evaluate-skill
node skills/evaluate-skill/scripts/skill-eval.mjs doctor
pi --version
```

For each designated case, run `evaluate --plan-only` with:

- provider `openai-codex`;
- model `gpt-5.5`;
- thinking `high`;
- 180,000 ms timeout;
- 8 MiB retained-output limit;
- 8 turns per process;
- `$2.00` soft case ceiling.

Record the fresh fingerprint, process count, worst-case approved turns, source identities, host version, and limitations. Make zero provider requests.

**Stop conditions:** any deterministic failure; changed required case criteria; Pi version/configuration drift; unsupported capability; source-identity surprise; or a plan that does not match the accepted limits.

### Slice 1.2 — Run One Complete Repeat Per Case

**Type:** delivery

Confirm that the fresh plan remains within the owner's standing approval, bind execution with `--expect-plan`, and run one case per invocation. Do not ask repeatedly when the reviewed scope and bounds are unchanged.

Acceptance:

- `WSK2-001`: every candidate assertion passes and comparison remains `improved`.
- `ESK2-007`: case verdict is `pass`.
- `ESK2-008`: every candidate assertion passes and the comparison is not `regressed`; `inconclusive` remains acceptable.
- each bundle is complete and passes `verifyBundleIntegrity` against its published directory;
- required usage/accounting fields are available and limitations contain no new trust-boundary failure.

An incomplete infrastructure attempt is not an observation. Diagnose first; if a source-backed fix is needed, re-run deterministic verification, create a new plan fingerprint, obtain approval, and rerun the whole case. A complete behavioral failure counts and is not rerun to chase a pass.

### Slice 1.3 — Update The Acceptance Record

**Type:** delivery

Update the bootstrap acceptance report with:

- observation 1 and observation 2 result paths;
- exact configuration and source revisions;
- integrity results;
- per-case verdicts, requests, tokens, cost, and unavailable fields;
- whether the configuration-bound statement is supported;
- unchanged Unverified and non-production boundaries.

Do not silently replace the earlier acceptance decision. Record the new readiness effect as a later evidence section or explicit revision.

### Backward Checkpoint

- **Continue to Phase 2 if:** all three complete repeats satisfy their case-specific criteria and integrity checks.
- **Diagnose if:** an attempt is incomplete or accounting/integrity is inconsistent.
- **Re-enter evaluation design if:** a complete result exposes invalid criteria or evidence classes.
- **Stop for owner direction if:** a complete behavioral result fails the gate or the target configuration changes.

### Phase Checkpoint

Run a focused parent evidence audit. Commit only the updated durable acceptance report when a coherent verified checkpoint is useful and authorized. Generated bundles remain governed by existing repository policy.

## Phase 2 — Fixed-Script Stateful Pi RPC

**Status:** Complete.

The contracts below were settled from Phase 1 evidence before execution.

### Outcome

The existing `evaluate` operation can execute a case-declared fixed user-turn script in one isolated Pi RPC session per variant and publish trustworthy per-turn and session evidence.

### Slice 2.1 — Capture The RPC Contract In Source Truth

**Type:** delivery

Revise the v2 spec before runtime code to add:

- backward-compatible `schema_version: 1` fields;
- one-shot `prompt` versus multi-turn `turns[]` exclusivity;
- stable unique turn IDs and fixed prompt text;
- `execution.mode: "rpc-scripted"` for Pi;
- exact semantic `turn_ids` visibility declarations;
- aggregate process limits and whole-case failure behavior;
- canonical transcript and per-turn workspace evidence;
- explicit no-fallback rule.

Review the spec delta against this plan and current one-shot behavior. Do not redesign the completed bootstrap.

### Slice 2.2 — Prove The RPC Transport Boundary

**Type:** learning

**Question:** Can the installed Pi RPC protocol be driven deterministically without widening the evaluator lifecycle?

Build a strict LF-delimited JSONL client boundary with correlated command IDs. Use a fake RPC process for most tests and a no-provider handshake against installed Pi for capability proof.

Required behavior:

- start one `pi --mode rpc --no-session` process per variant;
- use isolated config, explicit skill, explicit root guard, no context files, and allowed tools;
- disable automatic retry and automatic compaction;
- send only `prompt` commands;
- require command acceptance and `agent_settled` for every scripted turn;
- reject `steer`, `follow_up`, session switching, extension UI, unexpected retry, and unexpected compaction;
- parse JSONL using LF framing rather than Node `readline` semantics;
- terminate and clean the complete process tree on failure.

**Discard-or-promote rule:** promote only if command correlation, settlement, EOF, timeout, abort, and cleanup are deterministic under fault injection. Otherwise keep evidence diagnostic and revise the design before provider work.

### Slice 2.3 — Add Aggregate Limits And Canonical Turn Evidence

**Type:** delivery

Extend the concrete Pi adapter, process outcomes, and ledger without adding a public lifecycle state.

For every settled scripted turn, capture:

- turn ID and prompt hash;
- accepted command response;
- canonical entries added during the turn;
- final assistant text without hidden reasoning;
- tool calls/results;
- provider-request, turn, tool, token, cost, and duration deltas;
- workspace status, changed paths, non-mutating diff/manifest evidence;
- skill snapshot integrity;
- termination state.

Apply timeout, retained-output, raw-transport, provider-turn, tool-call observation, and observed-cost accounting across the full RPC process. Before sending a later scripted prompt, check remaining known turn and spend allowance. Never start an extra known-over-limit provider request.

Per-turn workspace capture must not mutate the fixture Git index. Preserve evidence that an early unauthorized edit occurred even if a later turn reverts it.

The whole case is incomplete if any required RPC command, settlement, transcript boundary, capture, integrity check, limit, or cleanup fails. Behavioral assertion failure remains a complete result.

### Slice 2.4 — Add Turn-Scoped Grading

**Type:** delivery

- Require every multi-turn semantic assertion to declare exact `turn_ids`.
- Require all semantic assertions in one multi-turn case to use the same ordered `turn_ids`; reject differing scopes in preflight.
- Retain at most one fresh one-shot semantic process per variant and include that count in the existing plan/accounting boundary.
- Give that grader only the shared selected frozen turn texts and required objective facts for the pending rubrics.
- Do not reveal unrelated turns, another variant's evidence, comparison role, expected outcome, or hidden reasoning.
- Add turn-scoped objective assertions only where the evidence type requires them; session-level assertions stay explicitly session-level.
- Objective evidence continues to outrank semantic interpretation.

### Slice 2.5 — Synthetic State And Isolation Acceptance

**Type:** delivery

Create one deterministic two-turn comparison fixture with distinct immutable skill tokens per variant:

1. turn 1 reads/uses the assigned skill state;
2. turn 2 recalls the state without cross-variant leakage.

Prove separate RPC sessions, correct token/state continuity, per-turn capture, read-only skill integrity, and whole-case publication. Use fixed criteria written before outputs.

### Slice 2.6 — Real `decision-gate` Acceptance

**Type:** delivery

Create one two-turn adversarial fixture:

1. a consequential unresolved decision requires the agent to stop, make no unauthorized edit, and ask one focused question;
2. a fixed owner answer resolves the decision, after which the agent remembers it, does not re-ask, and takes only the authorized action.

Use per-turn filesystem evidence to prove the turn-1 stop and turn-2 action. Semantic assertions see only their declared turns.

Every paid invocation receives plan-only preview, explicit bounded settings, and fingerprint binding under the owner's standing approval. Escalate only when scope, bounds, or method changes.

### Verification

- focused RPC protocol and fault-injection tests;
- complete evaluator deterministic suite;
- existing one-shot Pi cases remain valid, including `ESK2-007` as an honest one-shot unsupported-evidence case;
- both new result bundles pass integrity verification;
- published report states exact Pi/model configuration and limitations.

### Backward Checkpoint

- **Continue if:** RPC state, isolation, counters, per-turn evidence, and cleanup are deterministic and both acceptance cases pass.
- **Revise design if:** session lifecycle leaks into callers, transport requires resume/recovery state, or per-turn evidence cannot be bounded canonically.
- **Revise spec if:** failure semantics or observable case behavior changes.
- **Stop if:** repeated one-shot regressions, cross-variant leakage, hidden provider work, or unsupported hard limits appear.

### Phase Checkpoint

Use one fresh independent review of the architecture-bearing RPC delta and one final evidence review only if the first review's accepted findings require confirmation. Parent adjudicates. Three passes remain the absolute cap, but this phase should finish in one or two.

Phase 2 passed after three bounded review passes. Pass 1 accepted the behavioral evidence but found non-LF EOF framing and canonical retained-output accounting gaps. Pass 2 confirmed those fixes and found one remaining pre-next-prompt accounting order gap. Pass 3 confirmed the final fix and was clean.

Accepted evidence:

- `.skill-eval/decision-gate/reports/rpc-acceptance.md`
- `.skill-eval/decision-gate/runs/evaluations/20260711191613370-dg2-001-93d3e65f3e/result.json`
- `.skill-eval/decision-gate/runs/evaluations/20260711191700932-dg2-002-66122b1b86/result.json`
- 112 deterministic tests passed; installed-Pi doctor reported RPC readiness with zero model requests.
- Both final bundles passed fresh integrity checks with all assertions passing, no unavailable evidence, no residual uncertainty, no protocol failure, exact semantic turn visibility, and bounded canonical transcript bytes.

## Phase 3 — Concrete Codex CLI Subject Adapter

Refine exact implementation slices only after Phase 2. Do not extract a generic host framework before the concrete adapter works.

### Outcome

Implement and deterministically verify one concrete `codex exec` diagnostic adapter with explicit skill invocation, isolated configuration, honest unavailable accounting, and no paid run or accepted cross-host claim.

### Owner Route Decision

The no-provider capability proof passed isolation, ambient suppression, explicit skill, network, symlink, timeout, process-tree, retained-output, and raw-transport boundaries. Codex CLI 0.144.1 does not expose a hard provider-request cap or monetary spend accounting.

On 2026-07-12 the owner selected the reduced-fidelity diagnostic route:

- implement the concrete adapter and portable planning contract;
- use fake processes and no-provider probes only;
- allow public planning/doctor to run only `codex --version`, while keeping auth access, runtime materialization, all other Codex processes, and model startup blocked;
- report provider requests and cost unavailable rather than zero;
- make no accepted Codex or cross-host readiness claim;
- do not introduce an external proxy, app-server, or generic host abstraction.

Capability evidence:

- `/tmp/freeflow-phase3-codex-capability-proof-20260712.md`
- `/tmp/freeflow-phase3-codex-capability-review-20260712.md`
- `/tmp/freeflow-phase3-codex-capability-review-20260712-pass2.md` — clean deterministic proof with the paid-work boundary still unsupported
- `/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-codex-capability-dLlNhG/evidence/`

### Slice 3.1 — Isolation And Limit Capability Proof

**Type:** learning

Use installed `codex-cli 0.144.1` and current official source behavior. Before any model request, prove with `codex sandbox` or equivalent deterministic probes that an evaluator-owned configuration can enforce:

- isolated `CODEX_HOME` with copied authentication only;
- evaluator-owned config, `--strict-config`, `--ephemeral`, and ignored exec-policy rules;
- bundled system skills disabled;
- only the declared target skill under `CODEX_HOME/skills/<name>`;
- `project_doc_max_bytes = 0`, so ambient `AGENTS.md` is absent;
- fixture writable and subject snapshot read-only;
- undeclared repository/home reads denied;
- writes and symlink escapes outside the fixture denied;
- direct network unavailable to model-generated commands;
- bounded process time and retained/raw output;
- a trustworthy bound, or an explicit unsupported state, for provider turns and spend.

Relevant source facts to revalidate at execution time:

- `codex exec` submits plain text input;
- explicit `$skill-name` text selects an unambiguous discovered skill;
- user skills are discovered under `CODEX_HOME/skills`;
- app-server remains experimental and deferred.

**Discard-or-promote rule:** if read/write isolation, ambient-context suppression, explicit skill selection, or required paid-work bounds cannot be enforced, do not claim accepted cross-host evidence. The adapter may remain a diagnostic reduced-fidelity path only if that narrower outcome is still useful and explicitly labelled; otherwise stop Phase 3.

### Slice 3.2 — Capture The Host Contract In Source Truth

**Type:** delivery

**Status:** Complete.

After the capability proof and owner route decision, revise the spec with the proven diagnostic contract:

- cases declare allowed subject hosts;
- `--host pi|codex` selects exactly one host and never falls back;
- existing fixed-host cases remain backward-compatible;
- portable cases require explicit selection;
- host, adapter, executable version, model, reasoning, isolation profile, and limits enter the plan fingerprint;
- subject and grader configurations are distinct;
- one invocation remains one case on one subject host;
- the semantic grader remains a separately identified/accounted fresh Pi process when required.

Role-qualified options:

```text
--subject-provider
--subject-model
--subject-thinking
--grader-provider
--grader-model
--grader-thinking
```

Fixed Pi cases preserve legacy-only shared settings and reject role-qualified settings. Portable cases require role-qualified settings and reject legacy or mixed forms. For Codex, `--subject-provider` must be literal `openai` and binds strict config to the built-in provider; custom or fallback providers are rejected. Reject grader options when no semantic assertions exist. Blocked Codex plans emit no executable rerun command.

Portable Codex cases must declare exactly `tools: ["read", "write"]`. That declaration selects immutable isolation profile `codex-diagnostic-macos-v1`; it does not map arbitrary Pi tool declarations to Codex.

### Slice 3.3 — Implement The Concrete Adapter

**Type:** delivery

**Status:** Complete on the reduced-fidelity, no-paid-run route.

Add a Codex-specific adapter that:

- materializes only declared skill resources into isolated `CODEX_HOME` under separate isolated `HOME`;
- invokes `codex exec --strict-config --json --ephemeral --ignore-rules` with explicit `$skill-name` selection, built-in `openai` provider, explicit model/reasoning, immutable `codex-diagnostic-macos-v1` permissions, never-approve policy, cwd, output, and config settings;
- captures JSONL, final response, tool/process events, usage when reported, workspace evidence, and failure flags;
- treats cost or provider-request data as unavailable rather than zero when Codex does not report it;
- returns the existing deep subject outcome shape;
- keeps Codex-specific protocol inside the adapter.

After both concrete adapters work, normalize only the outcome fields the coordinator genuinely needs. Do not add a registry, plugin API, or speculative third-host extension point.

### Slice 3.4 — Acceptance Evidence

**Type:** delivery

**Status:** Deferred by the reduced-fidelity route. No Codex model run is authorized in this phase.

The original accepted-fidelity route would have:

1. Run a synthetic explicit-invocation/isolation case on Codex.
2. Run one real one-shot `decision-gate` case independently on Pi and Codex using the same fixed case contract.
3. Verify each result bundle independently.
4. Write a documentary comparison that links both results without merging or converting either `result.json`.

This original paid route is superseded and inactive. Current standing approval does not authorize a Codex model run because the required provider-request and spend bounds failed. Any future paid route requires a new spec revision, capability proof, and explicit owner decision.

The original configuration-bound wording below is forbidden under the selected diagnostic route:

> Verified for Codex CLI 0.144.1 with `<model>`, high reasoning, under the recorded isolation profile.

### Backward Checkpoint

- **Continue to accepted Codex evidence if:** explicit skill loading, ambient suppression, filesystem isolation, evidence capture, and required limits pass. This condition is not met because provider-request and spend bounds are unavailable.
- **Remain diagnostic if:** deterministic adapter execution works while provider-request and cost accounting remain unavailable. This is the selected route.
- **Re-enter design if:** a generic host abstraction starts driving the concrete adapter, or app-server becomes necessary.
- **Stop for owner direction if:** implementation would weaken the selected diagnostic boundary, enable model startup, add external sandboxing/proxy control, or introduce public behavior beyond the reviewed portable blocked-plan contract.

### Phase Checkpoint

Use fresh independent review for isolation/security and for the final normalized outcome/accounting seam. Parent adjudicates findings against source truth. Do not exceed three passes for the same phase scope.

Phase 3 passed on the owner-selected reduced-fidelity route:

- `.skill-eval/evaluate-skill/reports/codex-diagnostic.md`
- no-provider capability evidence passed after reproducibility fixes;
- contract review pass 3 was clean;
- implementation review pass 2 was clean;
- 126 deterministic tests passed with zero failures/skips/cancellations;
- doctor reports Codex `0.144.1`, diagnostic planning ready, model execution false, and zero model requests;
- public Codex routes remain blocked before auth access, runtime materialization, `codex exec`, sandbox probes, or model startup;
- no paid Codex run or accepted Codex/cross-host result exists.

## Phase 4 — Documentary Historical-Evidence Index

### Outcome

Make legacy skill evidence searchable and auditable without granting it current result or readiness authority.

### Slice 4.1 — Capture The Historical Contract And Schema

**Type:** delivery

Before creating migration artifacts, revise and review the owning spec with the documentary-only scope, fixed non-authority fields, inclusion/exclusion roots, and prohibition on current-result conversion. This local gate repeats the global source-authority rule so Phase 4 cannot start from the plan alone.

Then create:

```text
evals/registries/historical-evidence.json
evals/schemas/historical-evidence.schema.json
```

Initial report scope:

- `evals/reports/by-skill/`;
- `evals/reports/by-command-surface/`;
- `evals/reports/iterations/`;
- `evals/reports/acceptance/`.

Exclude `runtime/` and `harness/`; they have different evidence lifecycles and must not be silently demoted.

Every report-level record includes:

- stable historical record ID;
- source report path and SHA-256;
- reported date;
- related current skills and reported eval IDs;
- host, model, and method only when explicitly stated;
- reported outcome summary labelled as reported, never regraded;
- referenced run artifacts with `present`, `missing`, or `ignored` status and hashes when present;
- limitations and supersession relationships;
- indexing revision and date;
- fixed authority fields:

```json
{
  "authority": "historical-documentary-only",
  "readiness_eligible": false,
  "convertible_to_current_result": false
}
```

Do not create synthetic precision for missing versions, revisions, model settings, costs, or artifacts.

### Slice 4.2 — Add A Deterministic Audit

**Type:** delivery

Create `evals/scripts/audit-historical-evidence.mjs` using Node standard-library APIs only. It verifies:

- schema shape and version;
- unique record IDs;
- report existence and hashes;
- valid path containment;
- referenced-artifact status and hashes;
- current-skill mappings;
- mandatory non-authority labels;
- absence of current evaluation result destinations;
- explicit inclusion/exclusion scope.

The script must not run models, grade, reinterpret, repair, import, or publish evaluator results.

### Slice 4.3 — Populate And Report

**Type:** delivery

Populate the index from live reports, auditing every recorded claim against the source report. Add a concise migration report describing scope, missing artifacts, supersession, and why the index cannot affect readiness.

Update `evals/README.md` and `skill-evidence.json` only where a link is necessary and only after reconciling their existing user-owned modifications.

### Verification

- audit exits zero;
- independent spot checks cover at least one present artifact, one missing/ignored artifact, one superseded report, and one report without stated host/model;
- no file appears under `.skill-eval/**/runs/evaluations/` because of migration;
- no current `result.json`, readiness field, or acceptance report incorporates historical records as observations;
- scoped diff contains documentary files only.

### Backward Checkpoint

- **Continue if:** every indexed statement is source-backed and authority labels are invariant.
- **Revise schema if:** inconsistent reports cannot be represented without guessing.
- **Stop if:** migration requires regrading, reconstructing missing runs, changing current readiness, or treating historical claims as current evidence.

### Phase Checkpoint

Use one fresh artifact review of the schema, populated index, audit output, and authority boundary. A clean pass is valid. Do not create a review loop for wording preference.

## Requirement-To-Evidence Traceability

| Requirement | Evidence |
| --- | --- |
| Configuration-bound Pi readiness | Two complete results per designated case, exact plans, integrity, revised acceptance report |
| Stateful continuity | Synthetic second-turn state recall in one RPC session |
| Cross-variant isolation | Distinct synthetic variant tokens and separate process/session evidence |
| Decision-gate behavior | Turn-1 no-edit stop plus turn-2 authorized action |
| Semantic transcript containment | Assertion-declared turn IDs and grader packets containing only selected turns |
| Codex explicit skill use | Isolated discovered skill plus explicit `$skill-name` invocation and observed output |
| Codex isolation | Deterministic sandbox probes and synthetic isolation case |
| Honest host portability | Independent host results, no fallback, exact host/version/profile fingerprints |
| Historical non-authority | Fixed schema labels, audit checks, no current-result destination or readiness linkage |

## Dynamic Plan-Health Triggers

Freeze the active phase and route backward when:

- a second unexpected defect appears at the same seam;
- caller knowledge, public states, flags, retries, or lifecycle concepts grow;
- a slice requires batching, cache, resume, concurrency, adaptive turns, app-server, external request proxying, or another deferred subsystem;
- a fix invalidates accepted evidence;
- paid reruns exceed the fixed evidence plan;
- case criteria change after output exists;
- semantic graders need unrelated transcript or variant identity;
- host isolation or accounting must be weakened silently;
- historical records begin influencing current verdicts;
- remaining work grows after a checkpoint or the next bounded finish path cannot be stated clearly.

At a trigger:

1. stop edits and paid work;
2. preserve the valid evidence and dirty state;
3. name the invalidated assumption and affected phase;
4. classify the issue as local defect, design pressure, spec gap, plan defect, unsupported capability, or owner decision;
5. revise only the affected downstream contract after the correct route is approved.

## Review, Commit, And Handoff Policy

- Use one writer for the active checkout.
- Prefer fresh-context, read-only independent reviews for architecture, isolation, and durable evidence boundaries.
- Reviewer findings are evidence; the parent classifies them as Accepted, Rejected, Question, or Needs evidence.
- A non-passing review ends the phase with adjudication and route. Do not edit from that batch in the same turn.
- Aim for one review plus one narrow confirmation. Three passes are the hard cap for a phase's unchanged scope.
- Commit only coherent, freshly verified rollback points when authorized. Stage exact paths because unrelated user changes exist.
- Create a handoff only when continuation cannot safely remain in the plan and linked evidence.

## Final Acceptance

The roadmap is complete only when:

- Phase 1's exact readiness statement is supported or honestly rejected;
- Pi RPC cases prove fixed multi-turn state, isolation, per-turn evidence, limits, and whole-case atomicity;
- Codex support is labelled accepted, reduced-fidelity, or unsupported from observed capability evidence;
- historical evidence is indexed and audited without current authority;
- full deterministic evaluator tests and skill structural validation pass on the final code;
- every accepted paid result passes integrity verification;
- final reports name exact hosts, versions, models, reasoning settings, limits, usage, cost/unavailable fields, source revisions, and residual risks;
- `.freeflow/config.json` and unrelated user changes remain untouched;
- no forbidden scale, release, or Production-Ready claim entered the milestone.

## Residual Risks

- Model behavior can vary even within the same configuration; two observations support constrained readiness, not universal reliability.
- Pi RPC transport may expose new lifecycle edge cases despite deterministic protocol tests.
- Codex CLI may not expose a hard provider-turn or spend boundary equivalent to Pi. That can limit Phase 3 to reduced-fidelity evidence.
- Codex sandbox behavior is version/platform-specific and must be re-probed for future versions.
- Historical reports are inconsistent and frequently reference ignored or missing run artifacts; the index preserves that uncertainty rather than repairing it.
- The evaluator still has no batching, cache, resume, concurrency, or cross-evaluation budget scheduler by design.

## Artifact Review

Pass 1 used a fresh-context native reviewer because the Freeflow delegation harness is disabled. The reviewer found no blocker, question, or evidence gap and one non-blocking locality improvement: repeat the global spec-revision gate inside Phase 4. The parent accepted and applied that finding by adding the owning spec to Phase 4's write boundary and making spec revision/review the first local action.

Pass 2 inspected only the accepted change and residual risk. It passed with no blocking, non-blocking, question, or needs-evidence finding. The plan is fit to guide Phase 1 Slice 1.1.

Review evidence:

- `/tmp/freeflow-roadmap-plan-review-20260711.md` — SHA-256 `04794963fe72ec355de62b9f1828d90225a97f44885bd03b1c00a1798adfa1de`
- `/tmp/freeflow-roadmap-plan-review-20260711-pass2.md` — SHA-256 `d59f3573cda31106a84ce88ecfea3810032dd906978e9ce40a525a60dfa013d8`

The native subagent wrapper labelled both runs failed because its acceptance detector did not recognize the fenced structured report. Both complete review artifacts were saved, read, and parent-adjudicated; this transport-level wrapper failure did not change their findings.

## Change Log

- 2026-07-11: Applied the accepted pass-1 Phase 4 source-contract locality finding and recorded the clean pass-2 confirmation.
- 2026-07-11: Recorded Phase 1 completion and the owner's standing approval for unchanged roadmap-bounded runs.
- 2026-07-11: Applied the accepted Pi RPC spec-review finding by preserving one shared semantic turn scope and one semantic process per variant; narrow confirmation passed.
- 2026-07-11: Completed Phase 2 with strict fixed-script Pi RPC execution, bounded canonical evidence, two accepted cases, fresh integrity verification, and a clean final implementation review.
- 2026-07-11: Paused before Phase 3 at the owner's request; no Codex implementation or historical indexing began.
- 2026-07-12: Completed the no-provider Codex capability proof, confirmed native provider-request/spend bounds are unavailable, and selected a no-paid-run reduced-fidelity diagnostic adapter.
- 2026-07-12: Completed Phase 3 with a deterministic, publicly blocked Codex diagnostic adapter, 126 passing tests, and a clean follow-up implementation review; no model request was made.

## Next Executable Route

Begin Phase 4 Slice 4.1 only through its local gate: revise and review the owning spec for documentary-only historical evidence before creating the schema or registry.

Do not begin Codex model evidence, external request control, generic host abstraction, or historical indexing before that spec review passes.
