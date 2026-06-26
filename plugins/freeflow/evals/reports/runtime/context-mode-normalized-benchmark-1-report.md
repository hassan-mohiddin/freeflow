# Context Mode Normalized Benchmark Report - Iteration 1

Date: 2026-06-26

## Scope

This benchmark compares Freeflow-owned tools against a normalized Context Mode-style proxy over representative command, docs, logs, JSON/table, repo-search, and batch fixture classes.

The proxy is not the external Context Mode runtime. It stores exact raw fixture payloads behind synthetic handles and returns bounded relevant snippets. Treat results as directionally useful fixture evidence, not a public superiority claim.

## Command

```sh
npm run bench:router:context-mode-normalized
```

The CLI writes machine-readable JSON under `plugins/freeflow/evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

## Summary

- Fixtures: 6
- Freeflow passed: 6/6
- Context Mode proxy passed: 6/6
- Freeflow answer-accurate visible output: 4/6
- Freeflow exact facts preserved: 6/6
- Freeflow recovery available: 6/6
- Freeflow lower model-visible bytes: 0/6
- Freeflow lower tool-call count: 1/6
- Freeflow model-visible reduction: 97.99% (175808 raw bytes to 3535 visible bytes)
- Context Mode proxy model-visible reduction: 98.67% (175808 raw bytes to 2338 visible bytes)
- Public superiority claims allowed: no

## Results

| fixture | category | mode | pass | answer | facts | recovery | tool calls | raw/visible bytes | reduction | storage bytes | latency p50/p95 ms | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| command-test-build-output | command | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 394/561 | -42.39% | 394 | 0.46/0.46 | normalized proxy, not actual Context Mode runtime |
| command-test-build-output | command | freeflow-owned-tools | pass | no | yes | yes | 1 | 394/645 | -63.71% | 6277 | 6.93/6.93 | Command failed or did not complete (executionStatus=failed exitCode=1); selected failure evidence was returned and raw output was vaulted before routing (parser=test-runner confidence=0.92 fidelity=exact). |
| docs-markdown-query | docs | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 352/306 | 13.07% | 352 | 0.18/0.18 | normalized proxy, not actual Context Mode runtime |
| docs-markdown-query | docs | freeflow-owned-tools | pass | yes | yes | yes | 1 | 352/524 | -48.86% | 0 | 3.52/3.52 | Deterministic repo retrieval selected 1 candidate(s); top result docs/output-router.md:5-9 (BM25-style scored section chunk with 12/12 query-token coverage). |
| large-log-search | logs | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 10169/359 | 96.47% | 10169 | 0.22/0.22 | normalized proxy, not actual Context Mode runtime |
| large-log-search | logs | freeflow-owned-tools | pass | yes | yes | yes | 1 | 10169/558 | 94.51% | 41826 | 5.36/5.36 | Command output was vaulted before declarative filters were applied (executionStatus=success exitCode=0; filters: stream=stdout include="RATE_LIMIT"\|"req_critical_42" maxLines=5 selected=1/203 lines; parser=generic confidence=0.35 fidelity=exact). |
| json-table-output | json-csv | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 5904/260 | 95.60% | 5904 | 0.16/0.16 | normalized proxy, not actual Context Mode runtime |
| json-table-output | json-csv | freeflow-owned-tools | pass | yes | yes | yes | 1 | 5904/535 | 90.94% | 36288 | 5.11/5.11 | Command output was vaulted before declarative filters were applied (executionStatus=success exitCode=0; filters: stream=stdout include="JSON_TABLE_NEEDLE"\|"12345" maxLines=8 selected=2/407 lines; parser=generic confidence=0.35 fidelity=exact). |
| repo-text-search-generated-decoy | repo-search | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 148238/326 | 99.78% | 212 | 0.14/0.14 | normalized proxy, not actual Context Mode runtime |
| repo-text-search-generated-decoy | repo-search | freeflow-owned-tools | pass | yes | yes | yes | 1 | 148238/453 | 99.69% | 0 | 3.43/3.43 | Deterministic repo retrieval selected 1 candidate(s); top result src/sandbox.ts:3-5 (BM25-style scored window chunk with 8/8 query-token coverage). |
| batch-multi-command-query | batch | context-mode-normalized-proxy | pass | no | yes | yes | 3 | 10751/526 | 95.11% | 10751 | 0.21/0.21 | normalized proxy, not actual Context Mode runtime |
| batch-multi-command-query | batch | freeflow-owned-tools | pass | no | yes | yes | 1 | 10751/820 | 92.37% | 10053 | 5.84/5.84 | Ran 3 independent Freeflow-owned step(s) with concurrency=3; 1 step(s) failed and 2 step(s) completed. Child results are available in details.result.steps. |

## Decision

No public Context Mode superiority claim is made from this benchmark. It is a normalized fixture comparison used to catch token/recovery regressions before any public naming or docs migration.
