# Output Router Codex Large Repo Index/SQLite Ad Hoc Benchmark

Date: 2026-06-18

## Scope

Ad hoc large-repo benchmark requested during Slice 8 follow-up. This is not an adoption decision and did not change product defaults.

Repository:

- URL: `https://github.com/openai/codex`
- Local path: `/tmp/freeflow-codex-large-benchmark/codex`
- Commit: `e12dd73`
- Git-tracked files: 5,118
- Working tree size after shallow clone: ~70 MB

Modes measured:

1. Existing `freeflow_retrieve` scanner default.
2. Slice 8 no-dependency experimental local index.
3. Improved no-dependency prototype with slimmer symbol/section index.
4. Python stdlib SQLite FTS5 ad hoc comparator.
5. SQLite FTS5 with deterministic reranking and tuned candidate limit.
6. Scanner-hardening changes derived from this benchmark.

SQLite/FTS used only Python standard-library `sqlite3` with FTS5 available. No npm/package dependency was added.

## Baseline Result

| mode | build/load | query p50 | query p95 | strict path pass | avg context bytes | notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| scanner default | none | 5,663 ms | 8,929 ms | 3/8 | 1,230 | live scan each query |
| Slice 8 no-dep local index | failed after 10,013 ms | n/a | n/a | n/a | n/a | `RangeError: Invalid string length` while serializing cache |
| SQLite FTS5 AND | 3,934 ms | 0.18 ms | 2.24 ms | 2/8 | 135 | very fast but low recall from strict AND query construction |
| SQLite FTS5 OR + camel split | 8,145 ms | 42.97 ms | 50.94 ms | 3/8 | 322 | same strict pass count as scanner, much faster query-only |

## Improvement Attempts

Changes tried in temp prototypes:

- no-dep index: remove duplicated line-window text; use symbol/Markdown chunks plus coarse blocks; store token counts and metadata only.
- no-dep ranking: camel/Pascal split, exact compound boosts, source/test path priors, symbol-definition boosts, path-intent boosts, phrase-sequence boosts, candidate prefiltering.
- SQLite: OR query for recall, ordered FTS candidate set, deterministic reranking with the same scoring features, candidate-limit tuning.

Best observed variants:

| mode | build/load | query p50 | query p95 | strict path pass | avg context bytes | cache/size | notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| no-dep V1 slim | 42,496 ms | 23,814 ms | 42,197 ms | 5/8 | 1,397 | 169.5 MB JSON estimate | accuracy improved, speed unacceptable |
| no-dep V2 candidate prefilter | 73,755 ms | 1,973 ms | 2,933 ms | 5/8 | 1,542 | 156.4 MB JSON estimate | query faster, build/cache unacceptable |
| no-dep V3 symbol/section only | 41,048 ms | 1,484 ms | 2,720 ms | 5/8 | 1,413 | 97.5 MB JSON estimate | best no-dep profile, still heavy |
| SQLite FTS rerank limit=1000 | 1,936 ms | 137 ms | 287 ms | 5/8 | 1,128 | in-memory FTS | best overall prototype |

## Scanner Hardening Applied

Changes applied to the default scanner from this evidence:

- skip broad traversal of `generated/` directories while preserving explicit generated-path retrieval,
- add code symbol chunks for enum/struct/function/impl-style matches,
- split CamelCase/PascalCase/snake/path identifiers for scoring,
- preserve stopwords for exact phrase matching while keeping scoring stopword-filtered,
- add bounded symbol chunk evidence instead of narrow ±2-line snippets,
- add source/test path priors,
- add definition, path-intent, ordered-phrase, and complete-query-coverage boosts,
- use structural chunks first and line-window chunks only as a fallback for unstructured files.

Follow-up speed pass kept the same scanner result while reducing overhead:

- build BM25 stats only for chunks that pass the cheap `chunkMightMatch` prefilter,
- memoize token and phrase-sequence normalization per chunk,
- reuse tokenized chunk content for ordered-phrase scoring,
- read eligible repo text files with bounded concurrency while preserving deterministic traversal order,
- skip expensive identifier-splitting regexes for plain tokens without separators or case boundaries.

Measured scanner-hardening result on the same Codex repo/query set:

| mode | query p50 | query p95 | strict path+excerpt pass | avg context bytes | notes |
| --- | ---: | ---: | ---: | ---: | --- |
| scanner before hardening | 5,663 ms | 8,929 ms | 3/8 | 1,230 | baseline live scan |
| scanner after hardening | 8,776 ms | 12,668 ms | 5/8 | 2,178 | more accurate but slower and larger context |
| scanner after speed pass | 5,112 ms | 8,269 ms | 5/8 | 2,307 | accuracy kept; latency below baseline scanner p50/p95 |

Interpretation: scanner hardening produced a real accuracy gain (**+2/8 strict fixtures**) but initially regressed latency/context. The speed pass recovered the latency regression and kept the accuracy gain, although context remains larger because symbol chunks return fuller evidence.

## Before/After Summary

Against scanner default:

- Scanner hardening plus speed pass improved accuracy from **3/8** to **5/8** and improved query p50 from **5,663 ms** to **5,112 ms**.
- Accuracy improved from **3/8** strict expected-path matches to **5/8** for no-dep V3, SQLite FTS rerank, and scanner hardening/speed pass.
- SQLite FTS rerank query p50 improved from **5,663 ms** to **137 ms**: about **41× faster query-only**.
- SQLite FTS rerank query p95 improved from **8,929 ms** to **287 ms**: about **31× faster query-only**.
- Scanner total for eight baseline queries was about **47.6 s**; initial scanner-hardening total was about **78.1 s**; after the speed pass it was about **45.5 s**.
- SQLite FTS rerank total was about **3.3 s including build**: about **14× faster end-to-end for this query batch** versus baseline scanner.
- SQLite FTS rerank context was slightly smaller than baseline scanner: **1,230 avg bytes → 1,128 avg bytes** (~8% lower). Scanner hardening increased context to **2,178-2,307 avg bytes** because symbol chunks return fuller evidence.
- No-dep V3 warm queries were faster than baseline scanner, but cold build/cache costs made it unattractive on this repo.

## Misses Remaining

The best strict result was still only **5/8**. The repeated misses indicate ranking/query-intent problems, not just speed problems:

- Some broad queries legitimately have multiple plausible targets.
- Test/source intent is hard to infer from query text alone.
- Path-intent queries like `apply_patch prompt codex prompts lib` remain sensitive: some scanner variants selected the thin re-export file, but the final green scanner selected the deeper implementation handler.
- FTS candidate generation and deterministic reranking need a more principled query classifier before automatic routing is safe.

## Interpretation

- The current no-dependency local index is **not ready for large repos**. It needs a more compact cache format and fewer or more targeted chunks before it is worth productizing.
- SQLite/FTS is **promising enough to keep as an optional benchmark/comparator**. It produced better strict accuracy than scanner and much better speed in this ad hoc run.
- SQLite/FTS is **not ready to become product behavior**. Accuracy is still mid, and adding SQLite/FTS has packaging/portability implications that need an explicit dependency decision.
- A future `hybrid:auto` could be valuable only after a proper benchmark shows reliable query classification, fallback behavior, and no accuracy regression.

## Decision

- Keep scanner as default for now, with the applied hardening guarded by tests.
- Keep no-dependency local index experimental; redesign its large-repo chunk/cache strategy before further adoption discussion.
- Do not add SQLite/FTS as a product dependency yet.
- Keep SQLite/FTS as an optional large-repo benchmark comparator candidate.
- Do not implement `hybrid:auto` yet; the evidence supports future research, not default behavior.
- Before further accuracy hardening, keep the speed-pass benchmark in the loop so ranking gains do not silently become latency regressions.

## Raw Evidence Pointers

Temporary files from this ad hoc run:

- `/tmp/freeflow-codex-large-benchmark/scanner-sqlite-results.json`
- `/tmp/freeflow-codex-large-benchmark/sqlite-results.json`
- `/tmp/freeflow-codex-large-benchmark/sqlite-or-results.json`
- `/tmp/freeflow-codex-large-benchmark/improved-index-results.json`
- `/tmp/freeflow-codex-large-benchmark/improved-index-v2-results.json`
- `/tmp/freeflow-codex-large-benchmark/improved-index-v3-results.json`
- `/tmp/freeflow-codex-large-benchmark/results-symbols-only.json`
- `/tmp/freeflow-codex-large-benchmark/scanner-sqlite-final-green-output.json`
- `/tmp/freeflow-codex-large-benchmark/scanner-sqlite-speed-pass-output.json`
