---
name: output-router
description: Use after the workflow, decision-gate, discovery-light, or full Discover route is clear when choosing between native tools and Freeflow routed tools, retrieving repo/local/vault evidence, transforming bounded evidence, handling unknown-size or broad output, running likely-large/noisy commands, recovering vaulted output, configuring outputRouter/observedRouting/scriptTransform, or handling optional native read/bash safety-net routing.
---

# Output Router

Choose how evidence moves into context.

Freeflow tools are the safe first choice for unknown-size, exploratory, repo-wide, generated/log-adjacent, structured, or likely noisy output, including broad `rg`/`find`/`git`/help/docs scans. Native tools stay direct for known-small, exact, intentionally raw, or mutating work. A post-hoc cap such as `head`, `sed -n`, `tail`, or `wc` does not make a broad producer known-small.

Output Router does not classify the task. Workflow, Decision Gate, discovery-light, or full Discover decide whether to answer, ask, discover, plan, or stop. Output Router starts after that route is clear.

In delegated work, child/scout/reviewer/verifier panes should use routed evidence first for broad repo/search/test/log/doc evidence. Child transcripts are recoverable evidence, not the handoff. Child results and parent reports should carry compact summaries plus recoverable paths or output IDs.

## First Decision

Ask what kind of data you need:

- Existing repo, explicit local, or vault data: use `freeflow_search`.
- New command or script-produced output: use `freeflow_run`.
- Several independent Freeflow operations: use `freeflow_batch`.
- Config/status/vault/script-adapter facts: use `freeflow_status`.
- Enabled MCP/web/fetch/code-search output: call the host tool directly; Pi observed routing runs after the host result when configured.
- Known whole file, intentionally exact shell behavior, cmux/Pi control probes, explicit fallback after a routed-source limitation, or edits: use native `read`, `bash`, `edit`, or `write`.

When unsure how much output will return, use Freeflow first. Bound the producer before using native tools; do not rely on trimming the output after a broad command runs.

## `freeflow_search`: Existing Data

Use `freeflow_search` for repo files, explicit external local files, and vaulted output that already exists.

Actions:

- `locate`: find likely paths/output ids first. Use before reading when you only need candidates.
- `query`: return the best focused evidence packets for a search question.
- `get`: user gave exact-ish text/code/snippet or asks “where is this?” Find the best match and return source coordinates plus matched content.
- `retrieve`: you already know the path/outputId and line range. Return those exact lines. Do not use this as search.
- `expand`: widen a previous evidence packet.
- `explain`: explain a previous routed decision or vault output/recoverability.
- `transform`: compute facts or deterministic subsets from repo/local/vault/file/output data.

Use `source.kind="repo"` for the current checkout. Use `source.kind="local"` for external local docs/files with an explicit absolute `root` and optional relative `path`; do not put local roots in shared config. Use `source.kind="vault"` for previous Freeflow outputs.

Vault search patterns:

- Unknown output id: `source.kind="vault"` without `outputId`, plus `query` and optional `filters`.
- Known output id and unknown line: `action="query"` or `get` with `source.outputId`.
- Known output id and known line range: `action="retrieve"` with `lineRange`.
- Metadata-only result: use `action="explain"`; do not claim raw recovery.

Use `preserve="full"` only when exact fidelity matters. It still means exact-under-caps, not unlimited context injection.

## `freeflow_search action=transform`: Processing Existing Data

Use transform when raw data is too large/structured and you need computed facts.

Good transform cases:

- logs: status counts, error rates, slow examples,
- JSON/CSV: counts, groupings, top values, extracted fields,
- test/build/typecheck output already in the vault,
- MCP/web/fetch/code-search payloads already routed into the vault,
- deterministic regex filtering, match counts, grouping, dedupe, topN, URL/citation extraction, line/size stats.

Prefer deterministic operations when enough:

- `regexFilter`, `countMatches`, `jsonExtract`, `groupByRegex`, `dedupe`, `topN`, `extractUrls`, `extractCitations`, `lineStats`, `sizeStats`.

Use scripts only when deterministic operations cannot express the fact:

- `operation.kind="script"` runs a sandboxed transform over vault sources.
- `script` without `operation` runs the processing-engine script path over repo/local/vault sources.
- Sandboxed scripts require `scriptTransform.enabled=true` and a proof-backed adapter.
- Raw script code is not persisted; metadata stores hashes/labels/limits.
- No sandboxed script path may silently fall back to host shell execution.

Unsafe unsandboxed processing is local-only, explicit per call, and only through the processing script policy. It must say `unsafe/unsandboxed`. Never put that opt-in in shared config.

## `freeflow_run`: New Output

Use `freeflow_run` when the producer creates new output and routed evidence is enough.

Base producers are mutually exclusive:

- `command`: shell command through the host-approved runner.
- `script`: sandboxed code-as-producer with no repo/home/env/network/vault access.

Use `command` for:

- tests, builds, lint, typecheck, CI-like checks,
- broad shell search with unknown output size,
- commands likely to print logs, JSON, status, or diagnostics,
- commands whose exact raw output may need recovery.

Use `script` for:

- generating data with code when no repo/home/env/network access is needed,
- safe code-as-producer execution through the same sandbox engine as transforms,
- stdout/stderr capture that should route like command output.

Do not use `freeflow_run script` when the code needs repo files, environment variables, network, package imports, or host filesystem access. Use a host command intentionally, or transform an explicitly captured source.

Run modifiers:

- `goal`: tell the router why the run exists, e.g. `verification`, `diagnosis`, `build`, `log analysis`.
- `filters`: deterministic line filtering over captured stdout/stderr/combined.
- `scriptFilter`: sandboxed script over already captured stdout/stderr/combined. It never reruns the base producer.
- `preserve="full"`: request exact output under caps with vault recovery over cap.

Run storage:

- Default `hybrid-dedupe` stores exact output when exactness-sensitive and metadata-only for small non-sensitive successes.
- Failures, verification/test/build/typecheck/diagnosis output, `preserve="full"`, filters, script filters, reducers, script producers, and large/noisy output are exactness-sensitive.
- Exact duplicates may store current metadata pointing to a previous exact `outputId`.
- Plain metadata-only records get rerun guidance, not exact recovery claims.

## `freeflow_batch`: Independent Freeflow Work

Use `freeflow_batch` when several Freeflow-owned `run` or `search` steps can happen independently.

Good batch cases:

- run several bounded searches in parallel,
- run independent checks and ask `queries[]` to extract facts from child evidence,
- gather multiple repo/local/vault facts without injecting every child result.

Do not use batch for:

- sequenced workflows,
- arbitrary external tool orchestration,
- mutating work,
- steps where one child needs another child’s output.

Child outputs remain in `details.result.steps`; exact child run output remains recoverable by child `outputId`.

## Native Tools

Use native tools when direct behavior is the point:

- `read`: known whole file or exact direct file content is intended.
- `bash`: expected-small exact shell behavior, host access, cmux/Pi control probes, or bounded producer behavior is intentionally needed.
- `edit` / `write`: mutations.

Native `bash`/`read` remain valid for known-small exact checks, cmux/Pi control probes, exact file reads, or explicit fallback after a routed-source limitation; name the limitation and keep the fallback narrow.

Do not run broad native commands just to see what comes back. `head`, `sed -n`, `tail`, `wc`, or similar output caps bound visible text, not producer scope or relevance. Likely-large native commands include repo-wide `rg`, `grep -R`, `find`, package scans, generated-artifact scans, docs/help scans, logs, broad `git diff/log`, full tests/builds/lints/typechecks, and one-off scripts with unknown output size.

If native read/bash safety net is enabled, large/noisy native output may be replaced with labeled Freeflow-routed output. It must include an `outputId` and recovery instructions. If safety-net routing fails, native output passes through with a warning.

## Observed Routing

For enabled Pi MCP/web/fetch/code-search producers, call the host tool directly. Freeflow observes the completed result after host execution.

Observed routing:

- is off by default,
- is explicit per producer/server,
- does not grant permissions or block host tools,
- can persist exact output, metadata-only, or nothing depending on config,
- fails open with original host output if routing fails.

Mutating MCP/tool calls still require normal workflow/interview judgment before the host call. Observed routing is not permission approval.

## Hard Rules

- Do not pretend routed output is native output.
- Do not silently shorten native output.
- Capture raw output before transforming it.
- Keep raw source recovery separate from transformed/reduced output recovery.
- Treat `preserve="full"` as exact fidelity under caps, not unlimited context injection.
- Preserve exact failure and verification evidence lines.
- Keep `toolStatus`, `execution.status`, and `routing.status` separate.
- Metadata-only records must never claim exact raw recovery.
- Freeflow mode changes guidance strength only. It must not enable `postToolRouting`.
- Do not write removed `capture` or `providers` config.
- Do not offer `redacted`; it is future-only.

## Recovery Pattern

For routed run/native/observed/transform output, recover exact text with:

```json
{
  "action": "retrieve",
  "source": { "kind": "vault", "outputId": "ffout_...", "stream": "stdout|stderr|combined|raw" },
  "lineRange": { "start": 1, "end": 20 },
  "preserve": "full"
}
```

When line numbers are unknown, use `query` or `get` first. Use `expand` when a returned evidence packet is too narrow. Use `explain` when recoverability is unclear.

## Config

Use `freeflow_status` to inspect effective config, vault writability/index state, script adapters, observed routing, and migration recommendations.

Persist optional config only after an explicit setup branch/request:

- `outputRouter`: `enabled`, `profile`, `postToolRouting`, `storagePolicy`, thresholds, vault root/retention, generated paths, noisy command hints.
- `observedRouting`: explicit MCP servers and web/fetch/codeSearch producer persistence.
- `scriptTransform`: enabled flag, languages, sandbox/network/limits/raw-script persistence.

Minimal setup stays only `defaultMode`. Missing optional sections mean built-in defaults.

Read `references/safety-policy.md` before changing routing policy, reviewing router behavior, or handling exactness-sensitive output.
