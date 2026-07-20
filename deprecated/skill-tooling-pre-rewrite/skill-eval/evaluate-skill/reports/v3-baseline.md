# Evaluator v3 Baseline

> **Status:** Provider-free saved-artifact measurement
> **Authority:** Preliminary cost/context baseline only; cannot authorize execution or establish v3 savings
> **Corpus:** `3a3aef5d053c57735057b19feb52d97468309ae40c4e83d5d3b959858ecc148f`
> **Evaluator:** `a5c9e8812b3b0d45797eba40613674e69f574a2db9bbc5b7528add5575b9c4ce`
> **Semantic grader implementation:** `171f695d3dbd19b4a9a897041df5205f3563985410cc7fc229fbd6d4047c684a`

## Exact Corpus Totals

- Bundles: 4
- Provider requests / turns: 73 / 73
- Tool calls: 67
- Tokens: 343793
- Cost: $1.009198
- Canonical bundle bytes: 3319077
- Saved semantic packets: 4
- Semantic packet bytes: 21049
- Minified semantic packet bytes: 20095
- JSON whitespace bytes: 954
- Structural key bytes (all occurrences): 870

## Semantic Packet Detail

| Case | Variant | Canonical bytes | Minified bytes | Whitespace bytes | Structural key bytes (all occurrences) |
| --- | --- | ---: | ---: | ---: | ---: |
| WFI-002 | reference | 5912 | 5586 | 326 | 250 |
| WFI-002 | candidate | 6488 | 6162 | 326 | 250 |
| WFI-003 | reference | 4325 | 4174 | 151 | 185 |
| WFI-003 | candidate | 4324 | 4173 | 151 | 185 |

## Local Campaign Attempt Snapshot

- Complete evaluation bundles: 90
- Diagnostic attempts: 10
- Total attempts: 100
- Cap-trigger diagnostics: 0 (0.00%)
- Provider requests: 1051
- Tokens: 3211192
- Cost: $14.353388
- Diagnostic causes: `{"process_infrastructure":6,"runtime_delivery":1,"semantic_grader":3}`

This snapshot includes every local result/diagnostic JSON currently retained under `.skill-eval/*/runs/`. It is diagnostic accounting, not the immutable acceptance corpus.

## Evidence Boundary

This report measures exact saved bundle usage and saved `semantic-packet.json` bytes. It does not reconstruct unsaved provider prefixes, prove future CEV reduction, or treat observed spend as a hard cap. WFC2 composition bundles contain no saved semantic grader packet and therefore contribute usage/bundle totals but not grader-packet totals. Diagnostic cause classification uses failure text and does not establish root cause beyond that text.
