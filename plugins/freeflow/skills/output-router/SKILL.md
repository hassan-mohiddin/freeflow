---
name: output-router
description: Use when choosing between native tools and Freeflow routed tools, retrieving repo/vault evidence, running likely-large or noisy commands, recovering vaulted output, configuring outputRouter, or handling optional native read/bash safety-net routing.
---

# Output Router

Route output deliberately. Native tools stay direct unless explicit config enables the safety net.

## Tool Choice

- Need existing repo or vault information: use `freeflow_retrieve`.
- Need candidate paths first: use `freeflow_retrieve action=locate`.
- Need a best evidence packet: use `freeflow_retrieve action=query`.
- Need exact known repo/vault lines: use `freeflow_retrieve action=retrieve` with `source.path` or `source.kind=vault`, plus `lineRange` when exact lines matter.
- Need more around prior evidence: use `freeflow_retrieve action=expand`.
- Need to explain a routed result or vault id: use `freeflow_retrieve action=explain`.
- Need to run a likely-large or noisy command: use `freeflow_run`.
- Need a whole known file/artifact: use native read.
- Need direct shell behavior or expected-small exact output: use native bash.
- Need to edit files: use native edit/write.

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
