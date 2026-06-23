---
name: output-router
description: Use when choosing between native tools and Freeflow routed tools, retrieving repo/vault evidence, capturing read-only provider evidence, deriving bounded evidence, handling unknown-size or broad output, running likely-large/noisy commands, recovering vaulted output, configuring outputRouter, or handling optional native read/bash safety-net routing.
---

# Output Router

Route output deliberately. Freeflow tools are the safe first choice for unknown-size, exploratory, repo-wide, generated/log-adjacent, or likely noisy output.

Native tools stay direct unless explicit config enables the safety net. Use native output only when it is intentionally direct, small, exact, or bounded.

## Tool Choice

- Unsure how much output a read/search/command will produce: use Freeflow first.
- Need existing repo or vault information: use `freeflow_retrieve`.
- Need candidate paths first: use `freeflow_retrieve action=locate`.
- Need a best evidence packet: use `freeflow_retrieve action=query`.
- Need exact known repo/vault lines: use `freeflow_retrieve action=retrieve` with `source.path` or `source.kind=vault`, plus `lineRange` when exact lines matter.
- Need more around prior evidence: use `freeflow_retrieve action=expand`.
- Need to explain a routed result or vault id: use `freeflow_retrieve action=explain`.
- Need to run a likely-large, broad, exploratory, or noisy command: use `freeflow_run`.
- Need supported read-only service/protocol output with routing and recovery: use `freeflow_capture`.
- Need deterministic filtering, extraction, counts, grouping, dedupe, topN, URL/citation extraction, or stats from vaulted evidence: use `freeflow_derive`.
- Need a whole known file/artifact and direct file contents are intended: use native read.
- Need direct shell behavior with expected-small exact output: use native bash.
- Need to edit files: use native edit/write.

## Broad Native Output Guard

Do not run broad native shell commands just to see what comes back. Unknown output size means Freeflow first.

Likely-large native commands include repo-wide `rg`, `grep -R`, `find`, package scans, generated-artifact scans, session/eval log scans, broad `git diff/log`, test suites, builds, and lint/typecheck output.

For these, choose one:

- Use `freeflow_retrieve action=query` or `locate` for repo evidence discovery.
- Use `freeflow_run` when the broad shell command is intentional and routed evidence is enough.
- Use `freeflow_derive` when the broad output is already vaulted and a deterministic subset/stat is enough.
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

The router works with built-in defaults. Persist `outputRouter` config only when explicitly requested; `setup-freeflow` owns repo setup/config changes.

Supported repo keys are `postToolRouting`, `largeOutputBytes`, `largeOutputLines`, `vaultRoot`, `vaultRetentionDays`, `generatedPaths`, and `noisyCommandHints`.

`outputRouter.postToolRouting` controls native read/bash safety-net routing:

- `off`: native outputs pass through unchanged.
- `safety-net`: large/noisy native read/bash output may be vaulted and labeled.
- `strict`: reserved for stronger future guards; do not invent blocking behavior.

Rules:

- Minimal setup stays only `defaultMode`.
- Do not dump defaults or create an empty `outputRouter` object.
- `generatedPaths` affects broad scans only; explicit path retrieval remains available.
- Freeflow mode changes guidance strength only. It must not enable `postToolRouting`.
- Invalid config must fall back safely with a warning.
