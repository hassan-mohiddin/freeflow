# Freeflow Context-Saving Native Tools Baseline Report - Slice 0

Date: 2026-06-26

## Scope

Baseline current model-visible output sizes for representative `freeflow_run`, `freeflow_retrieve`, and `freeflow_derive` results before the compact-output redesign.

The baseline intentionally measures current Pi tool text as pretty-printed routed result JSON. Later slices should reduce model-visible bytes while keeping details and exact recovery available.

## Summary

- Fixtures measured: 5
- Facts preserved: 5/5
- Recovery available: 5/5
- Raw bytes: 2030
- Model-visible bytes: 8340
- Details payload bytes: 8870
- Approx raw tokens: 508
- Approx model-visible tokens: 2085
- Weighted model-visible reduction vs raw: -310.84%

## Measurements

| Fixture | Tool | Action | Raw bytes | Model-visible bytes | Details bytes | Reduction vs raw | Facts | Recovery | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| run-failed-test-output | freeflow_run | run | 428 | 1644 | 1766 | -284.11% | yes | yes | ok/failed/routed |
| retrieve-repo-query | freeflow_retrieve | query repo | 373 | 1473 | 1553 | -294.91% | yes | yes | ok/routed |
| retrieve-repo-exact-range | freeflow_retrieve | retrieve repo range | 373 | 1028 | 1108 | -175.60% | yes | yes | ok/routed |
| retrieve-vault-query | freeflow_retrieve | query vault | 428 | 1562 | 1668 | -264.95% | yes | yes | ok/routed |
| derive-regex-filter | freeflow_derive | regexFilter vault | 428 | 2633 | 2775 | -515.19% | yes | yes | ok/routed |

## Recovery And Evidence Handles

### run-failed-test-output
- outputId: `ffout_18f68dfabd64ef2bff301af5`
- recovery: Use freeflow_retrieve with source.kind=vault and outputId=ffout_18f68dfabd64ef2bff301af5 to recover exact command output.
- evidence: `stderr:1-4`, `combined:7-7`
- note: Current Pi model-visible text is the full pretty-printed routed result JSON.

### retrieve-repo-query
- recovery: Use freeflow_retrieve action=expand with evidenceId=ev_99fb47209c30c4b8 for more surrounding context, action=locate for candidate paths, or action=retrieve with path=plugin-docs/output-router.md for an explicit span.
- evidence: `plugin-docs/output-router.md:1-9`

### retrieve-repo-exact-range
- recovery: Use freeflow_retrieve action=expand with evidenceId=ev_fb0315fc354ab431 for more context from plugin-docs/output-router.md.
- evidence: `plugin-docs/output-router.md:3-5`
- note: This guards the existing public advanced path/range recovery behavior.

### retrieve-vault-query
- outputId: `ffout_18f68dfabd64ef2bff301af5`
- recovery: Use freeflow_retrieve action=expand with evidenceId=ev_a9dcb1fa89bbcb0c, or action=retrieve with outputId=ffout_18f68dfabd64ef2bff301af5 and stream=combined.
- evidence: `ffout_18f68dfabd64ef2bff301af5:combined:11-15`

### derive-regex-filter
- outputId: `ffout_c411aa12ee57b2f5ffe3ca14`
- recovery: Use freeflow_retrieve with source.kind=vault and outputId=ffout_c411aa12ee57b2f5ffe3ca14, stream=raw, and an exact lineRange to recover exact derived content. Source evidence remains outputId=ffout_18f68dfabd64ef2bff301af5 stream=combined.
- evidence: `ffout_c411aa12ee57b2f5ffe3ca14:raw:1-19`

## Guardrail Inventory

Existing tests/fixtures that must remain stable during the redesign:

- `router/tests/run.test.js`
  - freeflowRun parser/recovery behavior
  - duplicate output compaction
  - exact failure and verification evidence preservation
- `router/tests/retrieve.test.js`
  - exact repo path/range retrieval
  - exact vault line retrieval
  - vault-wide query/locate
  - repo/vault expand and explain behavior
- `router/tests/derive.test.js`
  - deterministic derive operations
  - derived-output lineage and exact recovery
  - structured failures for invalid operations and missing sources
- `router/tests/pi-extension.test.js`
  - public Pi tool schemas
  - content/details result contract
  - compact and expanded TUI renderers
- `router/tests/pi-extension-derive.test.js`
  - script derive disabled-by-default behavior
  - adapter-unavailable behavior
  - proof-backed adapter execution path
- `router/tests/regression-fixtures.test.js`
  - generated decoy avoidance
  - huge-line bounded evidence
  - exact phrase and source-prior retrieval regressions
- `router/tests/vault-index.test.js`
  - command/native/observed/derived vault record indexing
  - metadata-only indexing without raw recovery claims
  - retention and degraded-index behavior

## Notes

- This is a Slice 0 baseline for current Freeflow-owned tools before compact-output redesign.
- Model-visible bytes use the current Pi routedToolText shape: JSON.stringify(result, null, 2).
- Details payload bytes use the current Pi details shape: { result } with the same structured result.
- Negative reduction means the current routed JSON is larger than the raw fixture bytes; this is expected baseline evidence for compact-output work.
