# Output Router operation-authority redesign checkpoint

> **Date:** 2026-07-12
> **Scope:** Output Router pre-implementation artifacts only
> **Worktree:** `/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow-output-router-phase1`
> **Branch:** `fix/output-router-audit-phase1`
> **Recorded base HEAD:** `048f6ce`
> **Status:** Design C approved, encoded, independently re-reviewed, and included in the owner-authorized docs checkpoint

## Why the route moved backward

Four broad artifact passes kept finding undefined or contradictory public contracts. The failure was not missing reviewer effort. The artifacts had duplicated semantic authorities and prematurely froze immature operations.

The route moved from patching request/result types back to public-interface design. Three alternatives were compared. The owner approved **design C: staged declarative operation authority**.

## Accepted design

- One finite operation catalog is the sole executable public-contract authority.
- Operation maturity is `directional → executable → release`; maturity is build/release metadata, never model protocol.
- Directional operations contribute no active schema/type until their owning phase defines exact request, action-specific success, terminal failures, authority, side effects, and installed-Pi evidence.
- Phase 1 promotes only public `search.recover` and hidden `observe.fetch_text` to `executable`.
- The public action remains `freeflow_search action="recover"`; `search.recover_text` is only an internal proof label.
- Phase 1 uses a private `0.0.0`, `private:true`, unreleased eval manifest. It registers only the promoted proof surface and cannot be published/presented as v0.4.
- v0.4 release is blocked until every advertised target operation is `release`-promoted.
- Public terminal replies expose verified surviving recovery capabilities. Cleanup/reconciliation stays private or human-status-only unless explicit owner action is required.
- Shared terminal replies remain small. If action-specific exceptions accumulate, keep the catalog and generate per-action replies rather than widening a generic property bag.

## Throwaway prototype evidence

Location:

`/tmp/freeflow-output-router-contract-redesign/catalog-prototype/`

Contents:

- `catalog.json`
- `generate.mjs`
- `catalog.test.mjs`
- generated request/reply schemas, decoder table, fixtures, safe messages, TypeScript projection, human matrix, fingerprints, and release gate

Verification:

```bash
cd /tmp/freeflow-output-router-contract-redesign/catalog-prototype
node --check generate.mjs
node --check catalog.test.mjs
node --test catalog.test.mjs
```

Result after terminal-review correction: **19 passed, 0 failed**.

The correction moved exact range/budget, success, and terminal-reply definitions out of generator code and into catalog-owned `$defs`; made `RecoveredText.coordinates` required; narrowed Phase 1 budget to positive `textBytes`; and added request/reply fixture and projection-equivalence checks.

The prototype proves design viability only. It is not production code, source authority, release evidence, or an implementation dependency.

Synthesis report:

`/tmp/freeflow-output-router-contract-redesign/reports/07-catalog-prototype-results.md`

## Governing artifact changes

Revised:

- `docs/issues/output-router/2026-07-10-output-router-pi-completion-audit.md`
- `docs/specs/output-router/2026-07-10-freeflow-output-router-pi-reference-spec.md`
- `docs/plans/output-router/2026-07-10-freeflow-output-router-pi-completion-plan.md`
- `docs/README.md`

The spec now:

- removes the contradictory monolithic future request/result unions;
- resolves vault exact access as `recover`, never vault `retrieve`;
- defines the authority/promotion model;
- defines only the exact Phase 1 `RecoverRequest`/`RecoverReply` contract;
- inventories later operations directionally;
- closes Phase 1 failure/diagnostic/validation codes;
- keeps typed delivery and reconciliation private.

The plan now:

- makes the production operation catalog Slice 1.1;
- requires generated/fingerprint-checked projections;
- contains Phase 1 in a private eval-only tarball/manifest;
- blocks partial/mixed release;
- promotes later entries only in their owning phases.

## Verification completed

- corrected prototype tests: 19/19 passed;
- every catalog `$ref` resolves inside the catalog;
- request/reply schema, decoder, fixtures, TypeScript result, safe messages, matrix, and fingerprints agree on the Phase 1 contract;
- Markdown fences, relative links, and allowed whitespace passed for the eight governing/history/handoff files;
- all 76 P0/P1 audit IDs appear exactly once in plan traceability;
- all 16 catalog operations appear exactly once in the spec's Phase 1/directional authority section;
- previous dangling public symbols are absent;
- vault `retrieve` contradiction is absent;
- `git diff --check` passed.

No production source, build output, dist, package manifest, or original dirty checkout was changed.

## Terminal re-review adjudication

Three fresh reviewers re-reviewed the redesigned set. Two independently found the same narrow authority mismatch: range/budget definitions lived in generator code, while catalog/spec success fields disagreed about coordinates. The third passed the architecture with checkpoint-status cleanup. Parent adjudication accepted the authority/result mismatch and checkpoint ambiguity, rejected irrelevant missing-root-file findings, and preserved design C. The owner approved the exact range/budget convention, and the corrected 19-test loop now covers the accepted blockers. This is the bounded confirmation route; do not restart the previous broad review loop.

## Remaining route

1. Create a clean implementation worktree from this governing docs commit and then-current `main`.
2. Record ancestry, dependency/package inventory, clean status, and current v0.3 baseline evidence.
3. Implement Slice 1.1's production operation catalog and generated projections.
4. Build the private packed-Pi text proof before any horizontal V2/search/config/package work.

Do not run another equivalent broad artifact review. Reopen design only if deterministic closure fails, the implementation needs a second semantic authority, shared terminal replies become a property bag, or the private eval artifact cannot be kept out of release.
