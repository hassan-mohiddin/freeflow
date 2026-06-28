---
name: output-router
description: Use after the workflow, interview-gate, or discover route is clear when choosing between native tools and Freeflow routed tools, retrieving repo/vault evidence, transforming bounded evidence, handling unknown-size or broad output, running likely-large/noisy commands, recovering vaulted output, configuring outputRouter/observedRouting/scriptTransform, or handling optional native read/bash safety-net routing.
---

# Output Router

Route output deliberately. Freeflow tools are the safe first choice for unknown-size, exploratory, repo-wide, generated/log-adjacent, or likely noisy output.

Output Router chooses evidence transport. It does not classify the workflow route. For product/API/tool/runtime/design questions, use Interview Gate and Discover before choosing tools.

Native tools stay direct unless explicit config enables the safety net. Use native output only when it is intentionally direct, small, exact, or bounded.

## Tool Choice

- Unsure how much output a read/search/command will produce: use Freeflow first.
- Need existing repo or vault information: use `freeflow_search`.
- Need candidate paths first: use `freeflow_search action=locate`.
- Need a best evidence packet: use `freeflow_search action=query`; for vault-wide search use `source.kind=vault` without `outputId`.
- Need exact known repo/vault lines: use `freeflow_search action=retrieve` with `source.path` or `source.kind=vault` plus `outputId` and `lineRange` when exact lines matter.
- Need more around prior evidence: use `freeflow_search action=expand`.
- Need to explain a routed result or vault id: use `freeflow_search action=explain`.
- Need to run a likely-large, broad, exploratory, or noisy command: use `freeflow_run`.
- Need to run code as the base producer without repo/home/env/network access: use `freeflow_run` with `script`.
- Need enabled Pi MCP/web/fetch/code-search output: call the host tool directly; observed routing runs after the tool result when configured.
- Need deterministic filtering, extraction, counts, grouping, dedupe, topN, URL/citation extraction, or stats from vaulted evidence: use `freeflow_search action=transform`.
- Need script transform over existing evidence: use `freeflow_search action=transform operation.kind=script`. Both transform scripts and `freeflow_run` script producers are disabled-by-default sandboxed branches. JavaScript, Python, and jq can execute only with explicit scriptTransform opt-in and available proof-backed adapters. Do not use script transform or script producer as unsandboxed code execution.
- Need effective Freeflow router, observed-routing, script-transform, vault writability, or migration recommendations: use `freeflow_status`.
- Need a whole known file/artifact and direct file contents are intended: use native read.
- Need direct shell behavior with expected-small exact output: use native bash.
- Need to edit files: use native edit/write.

## Broad Native Output Guard

Do not run broad native shell commands just to see what comes back. Unknown output size means Freeflow first.

Likely-large native commands include repo-wide `rg`, `grep -R`, `find`, package scans, generated-artifact scans, session/eval log scans, broad `git diff/log`, test suites, builds, lint/typecheck output, and one-off host scripts whose output size is unknown.

For these, choose one:

- Use `freeflow_search action=query` or `locate` for repo evidence discovery, or for vault-wide indexed evidence when `source.kind=vault` omits `outputId`.
- Use `freeflow_run` when the broad shell command or sandboxed script producer is intentional and routed evidence is enough.
- Use `freeflow_search action=transform` when the broad output is already vaulted and a deterministic subset/stat is enough.
- Use native bash only when the command is intentionally bounded/excluded and exact small raw output is needed, for example a targeted file/path search, `head`/`sed` cap, or explicit generated/log exclusions.

## Hard Rules

- Do not pretend routed output is native output.
- Do not silently shorten native output. If the safety net transforms it, the result must say Freeflow routed it and include recovery instructions.
- Capture raw output before transforming it.
- Treat `preserve: full` as exact fidelity, not unlimited context injection. Over cap, return exact chunks or retrieval pointers.
- Freeflow mode changes guidance strength only. It must not enable `postToolRouting`.
- Keep `toolStatus`, `execution.status`, and `routing.status` separate.

## Safety Policy

Read `references/safety-policy.md` before changing routing policy, reviewing router behavior, or routing exactness-sensitive output.

## Recovery Pattern

For routed command or native safety-net output, recover exact text with:

```json
{
  "action": "retrieve",
  "source": { "kind": "vault", "outputId": "ffout_...", "stream": "stdout|stderr|combined|raw" },
  "lineRange": { "start": 1, "end": 20 },
  "preserve": "full"
}
```

Use `query` first when the needed lines are unknown. Use `expand` when a previous evidence packet is too narrow.

## Config

The router works with built-in defaults. Use `freeflow_status` to inspect effective defaults and non-destructive migration recommendations. Persist `outputRouter`, `observedRouting`, or `scriptTransform` config only after the setup evidence-routing/script-execution decision point or an explicit request; `setup-freeflow` owns repo setup/config changes.

Supported `outputRouter` keys are `enabled`, `profile`, `postToolRouting`, `storagePolicy`, `largeOutputBytes`, `largeOutputLines`, `vaultRoot`, `vaultRetentionDays`, `generatedPaths`, and `noisyCommandHints`. `storagePolicy` supports `hybrid-dedupe` (default for `freeflow_run` command/script capture) and `store-everything` (compatibility/diagnostic override). Supported `observedRouting` keys are `enabled`, `onRoutingFailure`, `mcp.servers`, `web`, `fetch`, and `codeSearch`, with persistence modes `exact`, `metadata-only`, and `none`. Supported `scriptTransform` keys are `enabled`, `sandbox`, `languages`, `network`, `limits`, and `rawScriptPersistence`; defaults keep it disabled with no unsandboxed fallback. Local-only `.freeflow/local.json` may enable internal processing `unsafeUnsandboxed`; shared `.freeflow/config.json` must not.

`outputRouter.postToolRouting` controls native read/bash safety-net routing:

- `off`: native outputs pass through unchanged.
- `safety-net`: large/noisy native read/bash output may be vaulted and labeled.
- `strict`: reserved for stronger future guards; do not invent blocking behavior.

Rules:

- Minimal setup stays only `defaultMode`.
- Metadata-only run records must never claim exact recovery. Exact duplicate metadata may point to a prior exact `outputId`; plain metadata-only records only get rerun guidance.
- Do not dump defaults or create empty `outputRouter`, `observedRouting`, or `scriptTransform` objects. Do not write removed `capture` or `providers` config.
- `generatedPaths` affects broad scans only; explicit path retrieval remains available.
- Freeflow mode changes guidance strength only. It must not enable `postToolRouting`.
- `observedRouting` is explicit opt-in per producer/server. The user must choose persistence for each enabled entry.
- `scriptTransform.enabled` defaults to false. Setup may install global adapters and enable proof-passing `scriptTransform.languages` only after explicit consent. No script code may execute without an approved sandbox adapter. Freeflow auto-discovers setup-installed adapters under `~/.cache/freeflow-script-adapters`; `FREEFLOW_QUICKJS_WASI_ROOT`, `FREEFLOW_JQ_WASM_ROOT`, and `FREEFLOW_ERYX_ROOT` remain custom-root overrides. Python/Eryx uses the setup-installed `node@24` child process with `--experimental-wasm-jspi` when needed and is enabled only after that runner passes proofs.
- Unsafe unsandboxed processing is local-only: `.freeflow/local.json` can enable it for this checkout, each call must still request `script.policy="unsafe-unsandboxed"`, and results must say `unsafe/unsandboxed`. Do not put this opt-in in shared `.freeflow/config.json`.
- Do not offer or write `redacted`; it is future-only and currently falls back to `metadata-only` if hand-edited.
- Invalid config must fall back safely with a warning.
