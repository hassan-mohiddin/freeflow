# Storage Policy Benchmark Report - Iteration 1

Date: 2026-06-26

## Scope

Benchmark-only experiment for Freeflow vault storage policies. This report does not change runtime defaults or repo config. It compares exact storage, threshold storage, hybrid metadata/exact storage, and duplicate-output dedupe using deterministic command-output fixtures.

## Summary

- Fixtures: 9
- Policies: 5
- Safe candidates for further evaluation: store-everything, metadata-small-exact-large-hybrid, duplicate-output-dedupe, hybrid-dedupe
- Disqualified by exact-recovery safety: threshold-exact
- Runtime default changed: no

## Policy Results

| Policy | Exact-sensitive recovery | Storage bytes | Index bytes | Exact stored bytes | Storage reduction | Token-surface reduction | Privacy surface | Metadata-only | Duplicate metadata | Latency p50/p95 | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Store everything exactly | 8/8 | 490785 | 185735 | 121022 | 0.00% | 0.00% | 100.00% | 0 | 0 | 1.61/2.97 |  |
| Threshold exact storage | 0/8 | 466984 | 185391 | 120120 | 0.75% | 0.75% | 99.25% | 14 | 0 | 1.17/1.76 | disqualified: exactness-sensitive failure/verification output would lose exact recovery threshold-only policy is unsafe without an exactness-sensitive override |
| Metadata-small / exact-large hybrid | 8/8 | 483256 | 186749 | 120884 | 0.11% | 0.12% | 99.89% | 6 | 0 | 1.30/1.78 | hybrid preserved exact recovery for sensitive fixtures while reducing exact raw storage |
| Duplicate output dedupe | 8/8 | 172791 | 66691 | 30335 | 74.93% | 74.93% | 25.07% | 12 | 12 | 1.06/1.38 | duplicates kept metadata pointers to prior exact output |
| Hybrid exactness + duplicate dedupe | 8/8 | 168371 | 66134 | 30299 | 74.96% | 74.96% | 25.04% | 14 | 8 | 1.05/1.33 | hybrid+dedupe preserved exact-sensitive recovery while metadata-only small output and duplicate pointers reduced exact raw storage |

## Candidate Notes

### Store everything exactly

Current baseline: every command output is vaulted exactly, so recovery is maximally useful and storage/privacy surface is largest.

- Exactness-sensitive recovery: pass
- Metadata-only recovery labeled: yes
- Repeated outputs deduped: no

| Fixture | Iteration | Record | Recovery | Exact bytes | Notes |
| --- | ---: | --- | --- | ---: | --- |
| small-success | 1 | command/exact | exact | 3 | exact combined recovery passed |
| small-failure | 1 | command/exact | exact | 104 | exact combined recovery passed |
| verification-output | 1 | command/exact | exact | 52 | exact combined recovery passed |
| large-log | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| repeated-failure-a | 1 | command/exact | exact | 113 | exact combined recovery passed |
| repeated-failure-b | 1 | command/exact | exact | 113 | exact combined recovery passed |
| repeat-a | 1 | command/exact | exact | 33 | exact combined recovery passed |
| repeat-b | 1 | command/exact | exact | 33 | exact combined recovery passed |
| small-success | 2 | command/exact | exact | 3 | exact combined recovery passed |
| small-failure | 2 | command/exact | exact | 104 | exact combined recovery passed |
| verification-output | 2 | command/exact | exact | 52 | exact combined recovery passed |
| large-log | 2 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 2 | command/exact | exact | 30030 | exact combined recovery passed |
| repeated-failure-a | 2 | command/exact | exact | 113 | exact combined recovery passed |
| repeated-failure-b | 2 | command/exact | exact | 113 | exact combined recovery passed |
| repeat-a | 2 | command/exact | exact | 33 | exact combined recovery passed |
| repeat-b | 2 | command/exact | exact | 33 | exact combined recovery passed |

### Threshold exact storage

Exact storage only when combined output is at least 8192 bytes; smaller outputs are metadata-only. This intentionally tests whether a threshold alone would drop exact failure/verification recovery.

- Exactness-sensitive recovery: fail
- Metadata-only recovery labeled: yes
- Repeated outputs deduped: no

| Fixture | Iteration | Record | Recovery | Exact bytes | Notes |
| --- | ---: | --- | --- | ---: | --- |
| small-success | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-failure | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| verification-output | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| large-log | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| repeated-failure-a | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeated-failure-b | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-a | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-b | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-success | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-failure | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| verification-output | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| large-log | 2 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 2 | command/exact | exact | 30030 | exact combined recovery passed |
| repeated-failure-a | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeated-failure-b | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-a | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-b | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |

### Metadata-small / exact-large hybrid

Small non-sensitive outputs become metadata-only; exactness-sensitive or >= 8192 byte outputs remain exactly recoverable.

- Exactness-sensitive recovery: pass
- Metadata-only recovery labeled: yes
- Repeated outputs deduped: no

| Fixture | Iteration | Record | Recovery | Exact bytes | Notes |
| --- | ---: | --- | --- | ---: | --- |
| small-success | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-failure | 1 | command/exact | exact | 104 | exact combined recovery passed |
| verification-output | 1 | command/exact | exact | 52 | exact combined recovery passed |
| large-log | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| repeated-failure-a | 1 | command/exact | exact | 113 | exact combined recovery passed |
| repeated-failure-b | 1 | command/exact | exact | 113 | exact combined recovery passed |
| repeat-a | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-b | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-success | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-failure | 2 | command/exact | exact | 104 | exact combined recovery passed |
| verification-output | 2 | command/exact | exact | 52 | exact combined recovery passed |
| large-log | 2 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 2 | command/exact | exact | 30030 | exact combined recovery passed |
| repeated-failure-a | 2 | command/exact | exact | 113 | exact combined recovery passed |
| repeated-failure-b | 2 | command/exact | exact | 113 | exact combined recovery passed |
| repeat-a | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-b | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |

### Duplicate output dedupe

First occurrence is stored exactly; exact duplicates become metadata-only records that point at the prior exact output.

- Exactness-sensitive recovery: pass
- Metadata-only recovery labeled: yes
- Repeated outputs deduped: yes

| Fixture | Iteration | Record | Recovery | Exact bytes | Notes |
| --- | ---: | --- | --- | ---: | --- |
| small-success | 1 | command/exact | exact | 3 | exact combined recovery passed |
| small-failure | 1 | command/exact | exact | 104 | exact combined recovery passed |
| verification-output | 1 | command/exact | exact | 52 | exact combined recovery passed |
| large-log | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 1 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_294d89a41483b7dab6ce642b |
| repeated-failure-a | 1 | command/exact | exact | 113 | exact combined recovery passed |
| repeated-failure-b | 1 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_628d69c7cbc7feab3175cbcc |
| repeat-a | 1 | command/exact | exact | 33 | exact combined recovery passed |
| repeat-b | 1 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_7beaa2a950f6ebdf3a9110a0 |
| small-success | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_dc9fd59fb47c5aa74b86124a |
| small-failure | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_c717966f003e72a574c6c819 |
| verification-output | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_1f14dc17fb2a201311d662a5 |
| large-log | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_294d89a41483b7dab6ce642b |
| large-log-repeat | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_294d89a41483b7dab6ce642b |
| repeated-failure-a | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_628d69c7cbc7feab3175cbcc |
| repeated-failure-b | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_628d69c7cbc7feab3175cbcc |
| repeat-a | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_7beaa2a950f6ebdf3a9110a0 |
| repeat-b | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_7beaa2a950f6ebdf3a9110a0 |

### Hybrid exactness + duplicate dedupe

Exactness-sensitive or >= 8192 byte outputs stay exactly recoverable; exact duplicates of those outputs become metadata pointers; small non-sensitive outputs are metadata-only.

- Exactness-sensitive recovery: pass
- Metadata-only recovery labeled: yes
- Repeated outputs deduped: yes

| Fixture | Iteration | Record | Recovery | Exact bytes | Notes |
| --- | ---: | --- | --- | ---: | --- |
| small-success | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-failure | 1 | command/exact | exact | 104 | exact combined recovery passed |
| verification-output | 1 | command/exact | exact | 52 | exact combined recovery passed |
| large-log | 1 | command/exact | exact | 30030 | exact combined recovery passed |
| large-log-repeat | 1 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_dc794d837600afc85c0520c7 |
| repeated-failure-a | 1 | command/exact | exact | 113 | exact combined recovery passed |
| repeated-failure-b | 1 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_c00d649118203b72321d2654 |
| repeat-a | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-b | 1 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-success | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| small-failure | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_bac9a1ffea891a65f4ef9620 |
| verification-output | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_c8d7d65501504bd00afcdb57 |
| large-log | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_dc794d837600afc85c0520c7 |
| large-log-repeat | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_dc794d837600afc85c0520c7 |
| repeated-failure-a | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_c00d649118203b72321d2654 |
| repeated-failure-b | 2 | metadata/metadata_only | duplicate-ref | 0 | metadata duplicate points to exact outputId=ffout_c00d649118203b72321d2654 |
| repeat-a | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |
| repeat-b | 2 | metadata/metadata_only | metadata-only | 0 | metadata-only record intentionally has no raw exact recovery |

## Decision Boundary

This benchmark intentionally stops before changing defaults. Any storage default change still needs a product/safety decision because metadata-only storage changes exact recovery semantics and privacy surface.
