# Output Router Setup

Use this when setup reaches the optional capabilities branch or explicitly asks for output-router, observed-routing, generated-path, native safety-net, vault, threshold, script-transform adapters, or script-transform repo config (`scriptTransform`).

## Defaults

- The output router has built-in defaults. A repo does not need optional config for normal search/run/transform behavior.
- Minimal `/setup-freeflow` must still write only `defaultMode`.
- Ask one capabilities decision point. If declined, do not write `outputRouter`, `observedRouting`, or `scriptTransform`, and do not install script adapters.
- Observed routing is opt-in per producer/server. The user must choose persistence for each enabled entry before setup writes config.
- Do not create a separate `setup-output-router` skill.

If the user says only “set up the output router” with no requested knobs, say the router works with built-in defaults and ask which optional config they want persisted. Recommend no repo config unless they need observed routing, repo-specific hints, script transform setup, or safety-net behavior.

## Config Shape

Write only keys the user explicitly requests. Do not dump all defaults and do not create empty `outputRouter`, `observedRouting`, or `scriptTransform` objects. Do not write removed `capture` or `providers` config.

Supported high-level repo config keys:

```json
{
  "defaultMode": "workflow",
  "outputRouter": {
    "enabled": true,
    "profile": "standard",
    "postToolRouting": "off",
    "largeOutputBytes": 64000,
    "largeOutputLines": 1000,
    "vaultRoot": "~/.cache/freeflow-router/vault",
    "vaultRetentionDays": 7,
    "generatedPaths": ["graphify-out/**"],
    "noisyCommandHints": ["npm test"]
  },
  "observedRouting": {
    "enabled": true,
    "onRoutingFailure": "fail-open",
    "mcp": {
      "servers": {
        "github": { "enabled": true, "persistence": "exact" },
        "gmail": { "enabled": true, "persistence": "metadata-only" }
      }
    },
    "web": { "enabled": true, "persistence": "exact" },
    "fetch": { "enabled": true, "persistence": "exact" },
    "codeSearch": { "enabled": true, "persistence": "exact" }
  },
  "scriptTransform": {
    "enabled": true,
    "sandbox": "auto",
    "languages": ["javascript", "python", "jq"],
    "network": "off",
    "limits": {
      "timeoutMs": 5000,
      "maxInputBytes": 1048576,
      "maxOutputBytes": 65536
    },
    "rawScriptPersistence": "disabled"
  }
}
```

Rules:

- `outputRouter.enabled` defaults to `true`; write it only as an intentional high-level decision.
- `outputRouter.profile` currently supports `standard`; write it only when the user chooses the evidence-routing branch.
- `postToolRouting` defaults to `off`. Use `safety-net` only when explicitly requested. Treat `strict` as reserved; ask before writing it.
- `largeOutputBytes`, `largeOutputLines`, and `vaultRetentionDays` must be positive integers.
- `vaultRoot` must be a non-empty string. Repo-local storage requires explicit user choice.
- `generatedPaths` are broad-scan generated-path hints. Explicit file or directory retrieval must remain available.
- `noisyCommandHints` is parsed as hint config. Do not add it unless the user explicitly asks for command-pattern hints.
- `observedRouting.enabled` defaults to `false`; write it only when the user chooses observed routing.
- `observedRouting.onRoutingFailure` currently supports `fail-open`; write it only when persisting observed routing.
- `observedRouting.mcp.servers` must contain explicit server entries only. Setup may discover configured servers for a multi-select, but must not persist a volatile inventory of every installed tool.
- `observedRouting.web`, `observedRouting.fetch`, and `observedRouting.codeSearch` are Pi observed-routing producers. Enable only the producers the user chose.
- Every enabled observed-routing entry needs a user-chosen persistence mode: `exact`, `metadata-only`, or `none`.
- Recommend `exact` for public-ish evidence producers such as GitHub, web, fetch, and code search. Recommend `metadata-only` for sensitive or unknown producers such as Gmail, Slack, private customer systems, or likely-secret outputs.
- Do not offer or write `redacted`; it is reserved for future work and currently falls back to `metadata-only` with a warning if hand-edited.
- Pi public `freeflow_capture` and the separate `providers` setup surface have been removed. Do not write removed `capture` or `providers` config.
- `scriptTransform.enabled` defaults to `false`; write it only after an explicit script-execution opt-in.
- If the user opts into script transform setup and adapters are missing or unavailable, recommend installing global adapters. On consent, resolve `../../router/dist/setup/script-transform-adapters.js` relative to `skills/setup-freeflow/SKILL.md` and run `node <plugin-root>/router/dist/setup/script-transform-adapters.js install --config .freeflow/config.json`.
- The installer uses `~/.cache/freeflow-script-adapters` by default, or `FREEFLOW_SCRIPT_TRANSFORM_ADAPTERS_HOME` when set. It installs `quickjs-wasi@3.0.1`, `jq-wasm@1.2.0-jq-1.8.2`, `@bsull/eryx@0.5.0`, and `node@24` for the Python JSPI child runner, writes `freeflow-adapter-env.sh`, probes sandbox proofs, and updates `scriptTransform.languages` with only proof-passing languages.
- Freeflow auto-discovers adapters from that global cache. The explicit roots `FREEFLOW_QUICKJS_WASI_ROOT`, `FREEFLOW_JQ_WASM_ROOT`, and `FREEFLOW_ERYX_ROOT` remain overrides for custom installs.
- Python/Eryx is installed by setup and uses the setup-installed child Node process launched with `--experimental-wasm-jspi` when the host process lacks JSPI. It must not be marked available unless that child runner passes the required sandbox probes.
- `scriptTransform.languages` supports `javascript`, `python`, and `jq`; enable only languages whose adapters passed sandbox proofs.
- `scriptTransform.sandbox` currently supports `auto`, `network` supports only `off`, and `rawScriptPersistence` supports only `disabled`.
- `scriptTransform.limits.timeoutMs`, `maxInputBytes`, and `maxOutputBytes` must be positive integers within product caps. Per-call script limits may only tighten configured values.

## Verify

After writing optional evidence-routing config, use `freeflow_status` or equivalent direct inspection to verify effective behavior:

- JSON parses.
- `defaultMode` is valid.
- Minimal setup still contains only `defaultMode` when capabilities were declined.
- Optional `outputRouter`, `observedRouting`, and `scriptTransform` sections contain only requested keys.
- Invalid router/observed-routing/script-transform values are not written.
- Observed routing, native safety-net routing, and script transform are not enabled unless explicitly requested.
- If script transform setup was accepted, global adapter install completed or a clear install/probe failure was reported, and enabled languages match proof-passing adapters.
- No observed-routing entry uses `redacted`, and every enabled entry has explicit persistence.
- `freeflow_status` shows effective defaults and migration recommendations without rewriting config.
- No repo-local hooks, skill files, setup-output-router skill, docs inventories, or repo-local storage directories were created.
