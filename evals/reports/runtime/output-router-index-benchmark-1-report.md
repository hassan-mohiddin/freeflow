# Output Router Index Benchmark Report - Iteration 1

Date: 2026-06-28

## Scope

Repo Search Backend Benchmark for `freeflow_search`. The scanner remains the product default; this benchmark compares scanner-only retrieval, the no-dependency local lexical index, a conservative hybrid scanner+index path, and records whether an FTS5/BM25/trigram candidate is available.

The index cache is keyed by repo root and stores outside the repo by default. No external service, vector DB, or native dependency is required for the local lexical index.

## Command

```sh
npm run bench:router:index
```

The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

## Summary

- Fixtures: 3
- Scanner remains default: yes
- Index adopted by default: no
- Scanner pass: 3/3 (recall@3: 3/3)
- Index warm pass: 3/3 (recall@3: 3/3)
- FTS5/BM25/trigram pass: 3/3 (skipped: 0; recall@3: 3/3)
- Hybrid warm pass: 3/3 (recall@3: 3/3)
- FTS5/BM25/trigram candidate: available — Node node:sqlite is available and supports SQLite FTS5 trigram tokenization with bm25 ranking.
- Generated false positives: 0/18
- Cold build p50/p95: 0.56/0.60 ms
- Warm query p50/p95: 0.04/0.05 ms
- Stale refresh p50/p95: 0.60/0.77 ms
- Index warm context reduction: 99.54% (310411 raw bytes to 1441 context bytes)

## Results

| fixture | mode | correctness | checks | path | lines | candidates | raw/context bytes | context reduction | latency p50/p95 ms | build/query ms | index mode | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| index-exact-copied-text | scanner-default | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/1201 | -751.77% | 1.84/8.82 | 0.00/0.49 | - | Deterministic repo retrieval selected 2 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-exact-copied-text | index-cold | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/678 | -380.85% | 1.45/2.77 | 0.56/0.05 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-z1mRAH/f172de04b87566a9fe7f030c.json |
| index-exact-copied-text | index-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/678 | -380.85% | 2.36/2.50 | 0.42/0.04 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-DDeXo1/dd4502aad39189e59f4c0d1c.json |
| index-exact-copied-text | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 162/677 | -317.90% | 2.28/2.50 | 0.77/0.03 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-6fTIT9/36a8bb3d60c28d09e4dfd81f.json; refresh=1 added |
| index-exact-copied-text | fts5-bm25-trigram | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 141/204 | -44.68% | 1.07/2.11 | 0.21/0.21 | - | SQLite FTS5 trigram MATCH with bm25 rank -0.000006 |
| index-exact-copied-text | hybrid-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/169 | -19.86% | 1.88/1.91 | 0.32/0.42 | warm-loaded | selection=scanner-index-agree; scannerQueryMs=0.39; indexQueryMs=0.03 |
| index-generated-artifact-decoy | scanner-default | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-9 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/1394 | 99.55% | 1.82/1.86 | 0.00/0.45 | - | Deterministic repo retrieval selected 1 candidate(s); top result docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-9 (BM25-style scored section chunk with 7/7 query-token coverage). |
| index-generated-artifact-decoy | index-cold | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/441 | 99.86% | 2.06/2.09 | 0.60/0.09 | cold-built | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-KqjOyP/28f108bffdc59e8c6fc367d1.json |
| index-generated-artifact-decoy | index-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/441 | 99.86% | 2.28/2.30 | 0.40/0.05 | warm-loaded | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-3yJwOY/2c1e76270adc1a02188256db.json |
| index-generated-artifact-decoy | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310241/441 | 99.86% | 2.77/3.02 | 0.60/0.04 | stale-refreshed | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-vHpgJg/9242bdc233ce6203c5a6e6fe.json; refresh=1 added |
| index-generated-artifact-decoy | fts5-bm25-trigram | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/315 | 99.90% | 1.82/1.89 | 0.22/0.22 | - | SQLite FTS5 trigram MATCH with bm25 rank -0.000007 |
| index-generated-artifact-decoy | hybrid-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-9 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/236 | 99.92% | 2.69/2.82 | 0.41/0.49 | warm-loaded | selection=scanner-index-agree; scannerQueryMs=0.44; indexQueryMs=0.05 |
| index-stale-refresh | scanner-default | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/873 | -1646.00% | 0.82/0.89 | 0.00/0.30 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-stale-refresh | index-cold | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/322 | -544.00% | 0.97/1.09 | 0.38/0.02 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-IgHl0y/da51d69855603b1095f746c9.json |
| index-stale-refresh | index-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/322 | -544.00% | 1.09/1.09 | 0.23/0.02 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-QNBb5t/04e813a08b0f962846486858.json |
| index-stale-refresh | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/322 | -544.00% | 1.29/1.94 | 0.54/0.03 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-DvsbMu/ecaeda95e6acb158b7eca6cf.json; refresh=1 changed |
| index-stale-refresh | fts5-bm25-trigram | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/180 | -260.00% | 0.89/1.00 | 0.21/0.21 | - | SQLite FTS5 trigram MATCH with bm25 rank -0.000004 |
| index-stale-refresh | hybrid-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/169 | -238.00% | 1.38/1.42 | 0.23/0.26 | warm-loaded | selection=scanner-index-agree; scannerQueryMs=0.24; indexQueryMs=0.02 |

## Adoption Decision

Index adopted by default: no. This slice only records benchmark evidence; scanner behavior remains the default until a later adoption checkpoint explicitly approves otherwise.

## Regression Status

Warm experimental index, FTS5/BM25/trigram, and hybrid modes passed all gated fixtures without generated-artifact false positives.
