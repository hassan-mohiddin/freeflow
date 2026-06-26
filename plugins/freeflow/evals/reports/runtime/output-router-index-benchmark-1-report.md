# Output Router Index Benchmark Report - Iteration 1

Date: 2026-06-26

## Scope

Repo Search Backend Benchmark for `freeflow_retrieve`. The scanner remains the product default; this benchmark compares scanner-only retrieval, the no-dependency local lexical index, a conservative hybrid scanner+index path, and records whether an FTS5/BM25/trigram candidate is available.

The index cache is keyed by repo root and stores outside the repo by default. No external service, vector DB, or native dependency is required for the local lexical index.

## Command

```sh
npm run bench:router:index
```

The CLI writes machine-readable JSON under `plugins/freeflow/evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

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
- Cold build p50/p95: 0.52/0.56 ms
- Warm query p50/p95: 0.03/0.06 ms
- Stale refresh p50/p95: 0.62/0.73 ms
- Index warm context reduction: 99.54% (310411 raw bytes to 1441 context bytes)

## Results

| fixture | mode | correctness | checks | path | lines | candidates | raw/context bytes | context reduction | latency p50/p95 ms | build/query ms | index mode | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| index-exact-copied-text | scanner-default | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/1203 | -753.19% | 1.66/8.82 | 0.00/0.52 | - | Deterministic repo retrieval selected 2 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-exact-copied-text | index-cold | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/678 | -380.85% | 1.43/2.63 | 0.52/0.04 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-eWRbuy/9e85ae3c1ae8e10623e9e55a.json |
| index-exact-copied-text | index-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/678 | -380.85% | 1.79/1.79 | 0.38/0.03 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-pAZhKC/7d5505fb95ae631672538492.json |
| index-exact-copied-text | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 162/677 | -317.90% | 2.23/2.29 | 0.73/0.03 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-dhRlnI/cc5d5860c52db5bdcf524948.json; refresh=1 added |
| index-exact-copied-text | fts5-bm25-trigram | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 141/204 | -44.68% | 1.13/2.20 | 0.20/0.20 | - | SQLite FTS5 trigram MATCH with bm25 rank -0.000006 |
| index-exact-copied-text | hybrid-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md, decoy.md | 141/169 | -19.86% | 1.97/2.02 | 0.36/0.42 | warm-loaded | selection=scanner-index-agree; scannerQueryMs=0.39; indexQueryMs=0.03 |
| index-generated-artifact-decoy | scanner-default | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-9 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/1396 | 99.55% | 1.80/1.83 | 0.00/0.43 | - | Deterministic repo retrieval selected 1 candidate(s); top result docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-9 (BM25-style scored section chunk with 7/7 query-token coverage). |
| index-generated-artifact-decoy | index-cold | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/441 | 99.86% | 1.90/2.10 | 0.56/0.08 | cold-built | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-izuPFM/520e56e077a3d6a374331cad.json |
| index-generated-artifact-decoy | index-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/441 | 99.86% | 2.48/2.74 | 0.47/0.06 | warm-loaded | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-A3flwz/7030c182ecc638432e6172d2.json |
| index-generated-artifact-decoy | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310241/441 | 99.86% | 2.85/3.06 | 0.62/0.04 | stale-refreshed | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-tkkakf/5c60ca87135fc21dd76dae0f.json; refresh=1 added |
| index-generated-artifact-decoy | fts5-bm25-trigram | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/315 | 99.90% | 1.80/1.84 | 0.25/0.25 | - | SQLite FTS5 trigram MATCH with bm25 rank -0.000007 |
| index-generated-artifact-decoy | hybrid-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-9 | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 310220/236 | 99.92% | 2.78/2.82 | 0.41/0.46 | warm-loaded | selection=scanner-index-agree; scannerQueryMs=0.41; indexQueryMs=0.05 |
| index-stale-refresh | scanner-default | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/875 | -1650.00% | 0.72/0.76 | 0.00/0.23 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-stale-refresh | index-cold | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/322 | -544.00% | 0.82/0.86 | 0.29/0.02 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-bpOM0k/f0960a20c2ed907324ffc625.json |
| index-stale-refresh | index-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/322 | -544.00% | 1.14/1.15 | 0.24/0.02 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-QwURah/01b7f6625198a04b47bf610a.json |
| index-stale-refresh | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/322 | -544.00% | 1.28/1.33 | 0.31/0.02 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-fjxtCX/6d2a7ea48c1288a88e0aa623.json; refresh=1 changed |
| index-stale-refresh | fts5-bm25-trigram | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/180 | -260.00% | 0.80/0.86 | 0.22/0.22 | - | SQLite FTS5 trigram MATCH with bm25 rank -0.000004 |
| index-stale-refresh | hybrid-warm | pass | path ✓ span ✓ excerpt ✓ recall@3 ✓ gen-fp ✓ | target.md | 1-3 | target.md | 50/169 | -238.00% | 1.27/1.31 | 0.21/0.21 | warm-loaded | selection=scanner-index-agree; scannerQueryMs=0.20; indexQueryMs=0.01 |

## Adoption Decision

Index adopted by default: no. This slice only records benchmark evidence; scanner behavior remains the default until a later adoption checkpoint explicitly approves otherwise.

## Regression Status

Warm experimental index, FTS5/BM25/trigram, and hybrid modes passed all gated fixtures without generated-artifact false positives.
