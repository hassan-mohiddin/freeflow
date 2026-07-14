# Vault Index Storage Spike Report - Iteration 1

Date: 2026-06-24

## Scope

Slice 11/12 storage-interface and write-path spike for the Freeflow vault index. The benchmark checks that a fresh index starts empty, persisted appends become queryable incrementally through automatic write-through indexing, metadata-only records do not index raw content, and the selected storage engine stays hidden behind the vault-index interface.

## Command

```sh
npm run bench:router:vault-index
```

## Summary

- Fixtures per iteration: 3
- Iterations: 3
- Selected engine: local-json-sidecar
- Selected reason: Portable deterministic sidecar files satisfy automatic incremental write-through semantics without adding a native dependency.
- Local sidecar passed: yes
- Scanner baseline passed: yes
- SQLite FTS status: not-run
- Local append p50/p95: 1.34/3.31 ms
- Local query p50/p95: 0.34/5.16 ms
- Scan query p50/p95: 0.20/0.38 ms
- Local query result reduction: -8.32%

## Candidates

| candidate | status | adopted | append p50/p95 ms | query p50/p95 ms | raw/result bytes | reduction | checks | notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| local-json-sidecar | pass | yes | 1.34/3.31 | 0.34/5.16 | 15681/16986 | -8.32% | fresh index starts empty; each persisted append is queryable immediately; metadata-only raw content is not indexed; no native dependency | Selected for the Slice 11 interface and exercised through the Slice 12 write path because it is portable and dependency-free. |
| vault-session-scan-baseline | pass | no | - | 0.20/0.38 | - | - | finds fixture evidence by reading vault records directly | Baseline remains source-truth fallback but query cost grows with vaulted text. |
| sqlite-fts | not-run | no | - | - | - | - | not introduced during Slice 11 | Deferred: adding a native dependency or relying on experimental runtime SQLite needs explicit owner approval. |

## Decision

Use the deterministic local JSON sidecar behind the vault-index interface for the next slices. Do not adopt SQLite/FTS in this slice because introducing a native dependency or relying on experimental runtime SQLite needs separate owner approval. The vault remains source truth; the index is a rebuildable sidecar.
