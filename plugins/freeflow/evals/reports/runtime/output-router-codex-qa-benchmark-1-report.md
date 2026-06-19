# Codex Structured Q&A Macro Benchmark Report - Iteration 1

Date: 2026-06-19

## Scope

Fast, deterministic Stage 1 macro benchmark for the Codex CLI agent-harness research corpus. The benchmark asks one structured Q&A question derived from the Sandbox Permissions pass and grades retrieval-backed answer quality, citation quality, evidence quality, context size, and latency.

The fixture uses existing Freeflow research docs as oracle scaffolding and includes a generated `graphify-out` decoy to preserve the original broad-retrieval failure shape. Upstream Codex source citation comparison is marked skipped until a source snapshot is explicitly supplied.

## Command

```sh
npm run bench:router:codex-qa
```

The CLI writes machine-readable JSON under `plugins/freeflow/evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

## Summary

- Iterations per mode: 1
- Fixtures: 1
- Improved Freeflow Router gated pass: 1/1
- Native broad-search proxy pass: 0/1
- Sandbox failure fixed: yes
- Generated false positives observed: 1/2 mode results
- Improved answer/citation/evidence: 1/1 answer, 1/1 citation, 1/1 evidence
- Improved weighted byte/token reduction: 99.50% / 99.50% (580499/145125 raw to 2892/723 context)

## Results

| fixture | mode | correctness | checks | path | lines | raw bytes/tokens | context bytes/tokens | byte/token reduction | latency p50/p95 ms | proxy calls | answer | notes |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
|sandbox-permissions-structured-qa | native-broad-search-proxy | fail | answer ✗ citation ✗ evidence ✗ gen-fp ✗ | graphify-out/graph.html | 1-3 | 580499/145125 | 580058/145015 | 0.08%/0.08% | 11.67/11.67 | 1 | Sandbox Permissions evidence from graphify-out/graph.html:1-3 did not include enough plain-language definitions to answer. | lexical score=40000 |
|sandbox-permissions-structured-qa | improved-freeflow-router | pass | answer ✓ citation ✓ evidence ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 1-28 | 580499/145125 | 2892/723 | 99.50%/99.50% | 3.66/3.66 | 2 | Sandbox Permissions are documented at docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:1-28. UseDefault: run with the turn's normal sandbox. RequireEscalated: request unsandboxed execution. WithAdditionalPermissions: stay sandboxed but widen permissions for this one command. | Deterministic repo retrieval selected 1 candidate(s); top result docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-17 (BM25-style scored section chunk with 14/14 query-token coverage).; Expanded repo evidence ev_178fc507730e20fc to docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:1-28. |

## Fixture Questions

- sandbox-permissions-structured-qa: Find the Sandbox Permissions section, report file/lines, and explain UseDefault, RequireEscalated, and WithAdditionalPermissions.
  - expected doc: `docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md`
  - upstream source citation comparison: skipped-unavailable

## Skipped External Comparators

- Graphify: Skipped unless a fresh graph for the benchmark fixture is explicitly supplied.
- Claude Context: Skipped unless an index is configured and fresh for the benchmark fixture.
