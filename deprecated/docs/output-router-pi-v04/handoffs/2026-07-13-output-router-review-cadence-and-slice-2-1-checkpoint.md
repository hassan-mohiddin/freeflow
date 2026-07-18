# Output Router Review Cadence And Slice 2.1 Checkpoint

Date: 2026-07-13

> This handoff is repo memory, not authority. Verify all branch, file, test, review, and evidence claims against live state before acting. Live source truth overrides this document.

## Purpose

Preserve two linked continuation concerns:

1. the exact implementation/evidence state of Output Router Phase 2A, Slice 2.1;
2. the owner’s concern that repeated slice-level reviews have become workflow slop—consuming tokens, fragmenting reasoning, and preventing coherent implementation from reaching an integrated review boundary.

The next context should not restart discovery, the artifact-review history, or the positive lifecycle-methodology review. It should repair the two known proof-inventory defects, verify them objectively, and adopt a lower-ceremony review cadence only to the extent supported by the owner’s latest direction.

## Stable Context

### Repository and branch

Implementation worktree:

`/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow-output-router-implementation`

Recorded branch and committed HEAD:

- branch: `feat/output-router-pi-v04`
- HEAD: `0b5b584` — `fix(router): verify continuation capabilities`

Do not modify the original/different checkout. Re-run `git status` before editing.

### Source authority

- target specification:
  `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
- rolling plan:
  `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`
- completion audit:
  `docs/issues/output-router/2026-07-10-output-router-pi-completion-audit.md`
- live code/tests and installed Pi behavior remain source truth for current behavior;
- handoffs and reviewer reports are evidence/memory, not authority.

### Product boundaries still in force

- correctness, integrity, privacy, and host safety outrank compactness;
- Output Router and Delegation Harness remain off by default;
- partial v0.4 work remains private/eval-only and absent from the public v0.3 package;
- V1 remains read-only and offline-owner-operated;
- typed media remains typed;
- principal semantics, in-memory persistence, copy/restore recovery, close/abandon behavior, final transaction backend/dependency, marker/namespace, compatibility, and destructive migration remain owner decisions;
- no Claude/Codex implementation before Pi completion.

## Current Phase And Route

Current phase:

**Phase 2A — Trusted V2 And Legacy Isolation**

Current slice:

**Slice 2.1 — Installed Pi identity and lifecycle evidence**

Current route:

**Backward within Slice 2.1 evidence design.** The positive lifecycle experiment is accepted. Two proof-inventory checks remain invalid. Slice 2.2 has not started, Slice 2.1 is not closed, and nothing is committed.

## Completed Foundation

### Phase 0

Reported complete: governing docs checkpoint and clean implementation baseline.

### Phase 1

Reported complete and package-private/eval-only. Key committed checkpoints:

- `673745b` — staged Pi contract docs
- `fb11693` — v0.4 contract catalog
- `2c1aece` — atomic text proof store
- `35855a6` — installed Pi text routing proof
- `57e60cf` — no-patch failure proof
- `0b5b584` — continuation-capability verification

Phase 1 did not claim production v0.4, final V2 backend/lifecycle, native Pi dispatch, media, indexes, multi-host support, or release readiness.

## Plan And Spec State

### Plan rewrite

At the owner’s request, the plan was rewritten from scratch according to the updated `write-plan` skill rather than incrementally patched.

The rewritten plan:

- compresses completed Phase 0/1 history;
- makes Phase 2 the only detailed rolling horizon;
- keeps Phases 3–7 directional;
- gives Phase 2 slices direct evidence producers, promote/discard rules, owner gates, and backward routes;
- integrates Pi copy/concurrency/repeated-callback evidence;
- keeps authority, generation/lifecycle, quota, required visibility, and disposition inside one semantic transaction owner.

The owner subsequently questioned whether even this plan still exposes too many phases/slices/reviews. No second simplification has yet been applied.

### Spec identity revision

The spec now states that:

- Pi session ID is stable logical correlation but not `OpaqueScopeBinding` authority;
- copied session files and concurrent opens can duplicate the same Pi ID;
- session file/header/path, cwd, file identity, and fork lineage are corroboration/provenance only;
- lifecycle callbacks may repeat and must be idempotent observations;
- shutdown is not close/abandon;
- persistent binding requires Freeflow-owned collision/exclusivity evidence inside the authority transaction;
- absence claims are bounded to the inspected Pi 0.80.6 public extension, RPC, and session-manager seams;
- future stronger identity providers require their own trusted contract/evidence.

### Artifact review history

Artifact review pass 1 found:

1. Pi absence claims were too categorical.
2. Slice 2.1 audit traceability cited unrelated findings.

Parent adjudication:

- accepted the evidence-boundary finding;
- inspected the audit before changing traceability.

Fixes:

- absence claims now name only inspected/exercised public seams;
- Slice 2.1 directly traces to `VLT-001` and `VLT-012`;
- it states that lifecycle evidence constrains but does not close `VLT-006`.

Artifact review pass 2:

**Pass.** The rewritten plan/spec are fit for the current learning route. Do not restart that artifact review without contradictory live evidence.

## Slice 2.1 Learning Contract

### Question

Which Pi-owned facts are stable enough to correlate a conversation, and which are insufficient for trusted scope authority or durable lifecycle state?

### Private implementation

Current Slice 2.1 work adds:

- `pi-extension/eval/output-router-lifecycle-proof/index.mjs`
- `pi-extension/tests/pi-output-router-lifecycle-proof-eval.test.js`
- `evals/scripts/run-pi-output-router-lifecycle-proof-rpc.mjs`
- `evals/scripts/smoke-pi-output-router-lifecycle-proof.sh`
- private package fences in `pi-extension/.npmignore` and `evals/.npmignore`

The extension is separate from the Phase 1 text proof. It registers lifecycle handlers and private commands only; it registers no model tool/schema and imports no Router contracts/dist, V1/V2 store, index, config, or delegation runtime.

The runner uses installed Pi RPC plus extension-side event JSONL and persisted Pi headers. It exercises:

- persistent startup and reload;
- deterministic seeded new session;
- fork and resume;
- extension-provided deterministic compaction without a provider/model call;
- process restart;
- copied session file;
- same-filesystem moved session;
- concurrent open by two Pi processes;
- quit/shutdown;
- equivalent in-memory reload/new/fork behavior.

### Positive evidence accepted by review

Review accepted the methodology and observed that:

- installed command/entrypoint paths resolve under the disposable installed package, outside checkout;
- persistent Pi ID/file remain stable across reload, resume, compaction, and process restart;
- new/fork rotate Pi ID/file;
- a copied session preserves the original Pi ID at a different path;
- two live Pi processes can open the same file and Pi ID concurrently;
- a same-filesystem move preserves Pi ID and file object identity while changing path;
- in-memory sessions have a Pi ID but no durable session file;
- repeated adjacent `session_start` callbacks were directly observed for one RPC transition;
- extension-provided compaction reported `fromExtension:true`;
- subprocess cleanup completed and no eval Pi process remained;
- exact private tar allowlisting and public-v0.3 exclusion worked.

These positive results do not need another broad review unless contradictory evidence appears.

## Current Verification Evidence

Fresh evidence before the latest non-passing review:

- focused lifecycle unit tests: **5/5**;
- packed installed-Pi lifecycle smoke: **pass**;
- complete Pi test suite after build: **115/115**;
- `git diff --check`: **pass**;
- private/public package containment: **pass inside smoke**.

Latest recorded volatile evidence directory:

`/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-pi-lifecycle-proof-evidence.Dw7aEq`

This path is not durable or release authority. Regenerate with:

```bash
bash evals/scripts/smoke-pi-output-router-lifecycle-proof.sh
```

Relevant evidence files generated by the current runner include:

- `oracle.json`
- `state-matrix.json`
- `classification.json`
- `negative-inventory.json`
- `public-api-inventory.json`
- `rpc-event-inventory.json`
- `lifecycle-events.jsonl`
- per-process RPC event/stderr files
- package/tar/public-pack evidence

Read lower-level evidence, not only `summary.json`.

## Slice 2.1 Work-Review History

### Orchestration noise

An initial pair of broad reviewers timed out without a verdict. Do not count those timeouts as findings or repeat the same oversized prompt.

### Work review pass 1

Accepted blocker: negative authority inventory and several package/no-model claims were constants or tautological.

Accepted fixes applied afterward:

- smoke resolves the actual Pi package root and requires exact Pi `0.80.6`;
- runner requires exact hashes for Pi package metadata plus public extension, session-manager, and RPC declarations;
- runner inventories read-only session methods, RPC state fields, and lifecycle event interfaces;
- runner derives a no-agent/turn/message/tool-execution claim from captured RPC event types;
- overall `passed` derives from claim booleans;
- absence wording remains pinned-public-seam-bounded.

### Work review pass 2

Status: **non-pass**.

Positive methodology remained accepted. Two proof-validity blockers remain.

#### Blocker 1 — incomplete exact authority identifiers

Current generic whole-word checks do not detect camel-case identifiers reliably. For example, checking `principal` does not detect `authenticatedPrincipal` or `principalId`; similar gaps exist for `reusableClaim`, `reusableGrant`, and `scopeId`.

Required correction:

- define one exact identifier set per negative category;
- inspect pinned declaration tokens and observations against those exact sets;
- derive each negative-inventory category independently;
- do not collapse all categories into one aggregate boolean before reporting them.

Suggested categories include:

- authenticated principal: `authenticatedPrincipal`, `principal`, `principalId`, equivalent exact names;
- reusable claims: `claim`, `claims`, `reusableClaim`, equivalent exact names;
- reusable grants: `grant`, `grants`, `reusableGrant`, equivalent exact names;
- delegation task authority: `taskAuthority`, `delegationTaskAuthority`, equivalent exact names;
- scope/generation authority: `scopeBinding`, `scopeId`, `generation`, `generationId`, rotation-authority names;
- durable lifecycle: exact closed/abandoned lifecycle-state names, not ordinary prose such as “abandoned path”;
- exclusive ownership: exact ownership/lease/lock authority names plus the direct concurrent-open disproof.

The resulting claim must remain:

> no named authority fact found in the exact pinned public declarations and exercised observations

It must not become:

> Pi can never provide such authority.

#### Blocker 2 — package-boundary booleans remain partly self-declared

`package-gates.json` currently writes `noToolsOrPublicSchemas` and `noRouterV1V2OrDelegationImports` as fixed `true` after broad assertions. The runner then consumes those values.

Required correction:

- parse the installed lifecycle extension’s import specifiers;
- require an exact allowlist of expected `node:` imports;
- derive absence of Router contracts/dist, V1/V2 store/vault/index/config, delegation, and external runtime imports from that import inventory;
- derive no model tool/schema from installed source registration/declaration tokens and exact tar contents;
- retain the exact two-file private tar allowlist;
- record the actual import and registration inventory as evidence;
- compute package claims from those inventories rather than constants.

Do not build a generalized JavaScript parser or package scanner. This is an eval-only pinned source with a closed import/registration surface.

### Parent adjudication

Both pass-2 findings were accepted.

Because they are local proof-inventory defects, no spec/product redesign is required. Do not reopen positive lifecycle methodology.

## Review-Cadence Concern

### Owner concern

The owner explicitly challenged the growing review loop:

- too many phases and slices visible at once;
- too many formal reviews between small code changes;
- insufficient room for an agent to write imperfect code, test, debug, and converge;
- excessive token/tool use and fragmented reasoning;
- workflow slop replacing code slop.

The owner’s core point is that reviewing after every small slice approaches reviewing after every line: it prevents coherent work from reaching an integrated state and asks reviewers to act as test runner, debugger, and proof-harness co-author.

### Diagnosis

The recurring Slice 2.1 findings are real, but the cadence was wrong.

The parent repeatedly requested review before completing one bounded author-side evidence-integrity check. Reviewers then found local verifier defects that should have been found through source inspection and objective verification. This converted review into the primary development loop.

Review is not supposed to be the primary feedback mechanism. Normal feedback should be:

1. compiler/static checks;
2. focused behavior tests;
3. real-seam execution;
4. slice verification and diff inspection;
5. integrated phase tests;
6. independent review only at consequential integration boundaries.

### Recommended middle ground

This was recommended in conversation but has not yet been encoded as a new durable repo policy or plan revision.

#### Per slice

Required:

- focused tests;
- direct real-seam evidence;
- diff inspection;
- route check and honest residuals.

Not required by default:

- independent review.

Allow ordinary implementation errors, test failures, and refactors inside the slice while work remains isolated and reversible. Do not claim completion while red, but do not interrupt development for every defect.

#### Learning slices

Do not review merely because a slice is labeled “learning.” Use reproducible experiments, disconfirming oracles, competing hypotheses, and discard/promote rules.

Review the combined learning decision packet when the learning phase converges. Review an individual learning slice only if its result immediately authorizes an irreversible/security/public/destructive decision and objective verification cannot adequately challenge it.

#### Phase boundaries

Default review cadence:

- one independent review at the end of a coherent phase or consequential subphase;
- at most one focused follow-up for accepted consequential blockers;
- if the follow-up reveals another consequence of the same invariant, redesign instead of continuing a review patch loop;
- local verifier/test defects should be objectively fixed without requesting another review.

#### Current Phase 2 application

Recommended cadence:

1. fix the two known Slice 2.1 verifier defects;
2. verify them objectively;
3. do not request another Slice 2.1 review;
4. proceed through Phase 2A transaction/binding, V1 detector, and marker learning;
5. perform one combined Phase 2A evidence/design review before owner architecture decisions;
6. implement integrated Phase 2B with slice-level tests/verification;
7. perform one combined Phase 2B security/architecture/migration review before promotion.

This recommendation preserves safety at the hard-to-reverse boundaries while giving implementation enough room to fail cheaply and converge.

### Status of this cadence

Treat the owner’s concern as an explicit process preference. Treat the exact proposed cadence above as the parent’s recommendation, not yet a committed project rule unless the owner confirms/adopts it or directs the plan to be revised accordingly.

Do not silently edit Freeflow skills from this case. The current skills already say reviews are conditional and author readiness precedes formal review. The primary failure was application/cadence.

## Expected Dirty State To Verify

Conversation memory expects:

Modified:

- `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`
- `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
- `evals/.npmignore`
- `pi-extension/.npmignore`

Untracked Slice 2.1 work:

- `evals/scripts/run-pi-output-router-lifecycle-proof-rpc.mjs`
- `evals/scripts/smoke-pi-output-router-lifecycle-proof.sh`
- `pi-extension/eval/output-router-lifecycle-proof/index.mjs`
- `pi-extension/tests/pi-output-router-lifecycle-proof-eval.test.js`

Other untracked handoffs that must remain separately adjudicated:

- `docs/handoffs/output-router/2026-07-12-output-router-review-blocker-pattern-and-freeflow-skill-improvement.md`
- `docs/handoffs/output-router/2026-07-13-phase2-plan-evidence-dependency-and-skill-application-incident.md`
- this handoff.

No commit has been authorized or created for current Phase 2 work.

## Next Executable Action

1. Reopen live worktree status, plan/spec, runner, smoke, and current skill text.
2. Reconstruct the Slice 2.1 claim map; do not trust this handoff alone.
3. Replace the generic authority scan with exact per-category identifier inventories.
4. Replace package-boundary constants with exact installed import/registration/tar-derived evidence.
5. Run:

```bash
node --check evals/scripts/run-pi-output-router-lifecycle-proof-rpc.mjs
bash -n evals/scripts/smoke-pi-output-router-lifecycle-proof.sh
node --test pi-extension/tests/pi-output-router-lifecycle-proof-eval.test.js
bash evals/scripts/smoke-pi-output-router-lifecycle-proof.sh
npm run test:pi-extension
git diff --check
```

6. Read the regenerated lower-level evidence, especially public API, import/registration, RPC-event, negative-inventory, and oracle artifacts.
7. If objective checks prove the bounded claim, close Slice 2.1 without another slice-level review under the recommended cadence; otherwise diagnose the specific evidence defect.
8. Before beginning Slice 2.2, reconcile the plan’s current Slice 2.1 formal-review wording with any owner-confirmed review-cadence change.

## Open Owner Decisions And Evidence Gaps

Not blockers for finishing the Slice 2.1 verifier:

- ordinary-conversation principal semantics;
- exact persistence for in-memory sessions;
- copied/restored/moved-session rebind or fail-closed-only behavior;
- explicit close/abandon control;
- final V2 transaction substrate/dependency;
- V2 root marker/namespace and forward-only point;
- whether the proposed phase-level review cadence should be written into the rolling plan or Freeflow guidance.

The next production authority/store delivery remains blocked on the relevant owner decisions after Phase 2A evidence converges.

## Stop Conditions

Stop before claiming Slice 2.1 complete when:

- any negative category is still derived from its own constant/report string;
- camel-case or equivalent authority identifiers can evade the inventory;
- package claims still consume self-declared booleans;
- the exact Pi version/public contract is not pinned and verified;
- model/tool execution absence is not derived from captured RPC events;
- installed source/import/tar provenance can resolve into checkout or an unexpected dependency;
- public v0.3 package containment fails;
- claims expand beyond the pinned inspected public seams;
- fresh smoke/lower-level evidence contradicts the summary.

Stop before another independent Slice 2.1 review when:

- the owner’s review-cadence direction has not been reconciled;
- the purpose is merely to ask a reviewer to find another local verifier bug;
- no author-side readiness/claim map has been completed;
- positive lifecycle methodology is being reopened without contradictory evidence.

Stop before Phase 2 production implementation when:

- principal, in-memory, copy/restore, close/abandon, backend, marker, compatibility, or destructive behavior would be silently decided;
- authority/generation/quota/visibility/disposition would be split across caller choreography;
- V1 isolation would weaken;
- the current source spec and owner decisions do not support the route.

## Directional Later Work

After Slice 2.1 closure:

- Slice 2.2: compare deep binding/semantic transaction candidates;
- Slice 2.3: build the read-only V1 detector contract;
- Slice 2.4: compare V2 marker/forward-only behavior using the integrity-pinned published v0.3 runtime;
- Phase 2A owner gate;
- Phase 2B integrated production authority/store/V1 delivery.

Phases 3–7 remain directional. Do not refine or implement them until Phase 2 evidence changes them into the immediate horizon.

## Resume Reminder

The safest continuation principle is:

> Fail cheaply inside slices. Verify at slice boundaries. Review at consequential integration boundaries.

This does not weaken correctness. It changes when independent review is used so that normal coding, testing, debugging, and refactoring can converge before review judges the integrated result.
