# Output Router Setup

Use this when setup reaches the optional capabilities branch or explicitly asks for Output Router, observed routing, generated-path hints, native safety-net routing, vault, thresholds, script-transform adapters, script-transform repo config, or Delegation Harness.

## Defaults

- Minimal `/setup-freeflow` writes only `defaultMode`; the presence of a parseable `.freeflow/config.json` is what activates Freeflow for the repo.
- Output Router is disabled by default. Delegation Harness is disabled by default.
- Missing optional sections mean built-in defaults, not setup failure.
- Ask one capabilities decision point. If declined, do not write `enabled`, `skills`, `outputRouter`, `delegationHarness`, or script adapter config, and do not install script adapters.
- If the user opts into Output Router during setup, write `outputRouter.enabled: true` directly. Do not make them run `/output-router` or `/freeflow` afterward.
- If the user opts into Delegation Harness during setup, write `delegationHarness.enabled: true` directly. Do not make them run `/delegation-harness` or `/freeflow` afterward.
- Observed routing is opt-in per producer/server. The user must choose persistence for each enabled entry before setup writes config.
- Do not create a separate `setup-output-router` skill.

If the user says only “set up the output router” with no requested knobs, explain that enabling Output Router is enough for the router tools/guidance, then ask which optional subfeatures, if any, they want persisted. Recommend no subfeature config unless they need observed routing, repo-specific hints, script transform setup, or native safety-net behavior.

## Config Shape

Write only keys the user explicitly requests. Do not dump defaults and do not create empty optional objects. Output-router-related config lives under `outputRouter`. Do not write removed `capture` or `providers` config.

Supported shape:

```json
{
  "defaultMode": "workflow",
  "outputRouter": {
    "enabled": true,
    "postToolRouting": "safety-net",
    "thresholds": {
      "largeOutputBytes": 64000,
      "largeOutputLines": 2000
    },
    "vault": {
      "root": "~/.cache/freeflow-router/vault",
      "retention": { "strategy": "ttl", "ttlDays": 7 }
    },
    "hints": {
      "generatedPathGlobs": ["graphify-out/**"],
      "noisyCommandPatterns": ["npm test"]
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
  },
  "delegationHarness": {
    "enabled": true
  }
}
```

Rules:

- Top-level `enabled` and `skills.enabled` default to true after setup; write them only when the user explicitly wants to disable Freeflow or the skills layer.
- `outputRouter.enabled` defaults to `false`; write `true` only when the user chooses Output Router.
- `delegationHarness.enabled` defaults to `false`; write `true` only when the user chooses Delegation Harness.
- `postToolRouting` defaults to `off`. Do not write `off`; use `safety-net` only when explicitly requested. Treat `strict` as reserved; ask before writing it.
- `thresholds.largeOutputBytes`, `thresholds.largeOutputLines`, and `vault.retention.ttlDays` must be positive integers.
- `vault.root` must be a non-empty string. Repo-local storage requires explicit user choice.
- `hints.generatedPathGlobs` are broad-scan generated-path hints. Explicit file or directory retrieval must remain available.
- `hints.noisyCommandPatterns` is parsed as hint config. Do not add it unless the user explicitly asks for command-pattern hints.
- `observedRouting.enabled` defaults to `false`; write it only when the user chooses observed routing.
- `observedRouting.onRoutingFailure` currently supports `fail-open`; omit it unless a caller needs an explicit non-default once supported.
- `observedRouting.mcp.servers` must contain explicit server entries only. Setup may discover configured servers for selection, but must not persist a volatile inventory of every installed tool.
- `observedRouting.web`, `observedRouting.fetch`, and `observedRouting.codeSearch` are Pi observed-routing producers. Enable only the producers the user chose.
- Every enabled observed-routing entry needs a user-chosen persistence mode: `exact`, `metadata-only`, or `none`.
- Recommend `exact` for public-ish evidence producers such as GitHub, web, fetch, and code search. Recommend `metadata-only` for sensitive or unknown producers such as Gmail, Slack, private customer systems, or likely-secret outputs.
- Do not offer or write `redacted`; it is reserved for future work and currently falls back to `metadata-only` with a warning if hand-edited.
- Pi public `freeflow_capture` and the separate `providers` setup surface have been removed. Do not write removed `capture` or `providers` config.
- `scriptTransform.enabled` defaults to `false`; write `true` only after an explicit script-execution opt-in.
- If the user opts into script transform setup and adapters are missing or unavailable, recommend installing global adapters. On consent, resolve `../../router/dist/setup/script-transform-adapters.js` relative to `skills/setup-freeflow/SKILL.md` and run `node <plugin-root>/router/dist/setup/script-transform-adapters.js install --config .freeflow/config.json`.
- The installer uses `~/.cache/freeflow-script-adapters` by default, or `FREEFLOW_SCRIPT_TRANSFORM_ADAPTERS_HOME` when set. It installs `quickjs-wasi@3.0.1`, `jq-wasm@1.2.0-jq-1.8.2`, `@bsull/eryx@0.5.0`, and `node@24` for the Python JSPI child runner, writes `freeflow-adapter-env.sh`, probes sandbox proofs, and updates `outputRouter.scriptTransform.languages` with only proof-passing languages.
- Freeflow auto-discovers adapters from that global cache. The explicit roots `FREEFLOW_QUICKJS_WASI_ROOT`, `FREEFLOW_JQ_WASM_ROOT`, and `FREEFLOW_ERYX_ROOT` remain overrides for custom installs.
- Python/Eryx is installed by setup and uses the setup-installed child Node process launched with `--experimental-wasm-jspi` when the host process lacks JSPI. It must not be marked available unless that child runner passes the required sandbox probes.
- `scriptTransform.languages` supports `javascript`, `python`, and `jq`; enable only languages whose adapters passed sandbox proofs.
- `scriptTransform.sandbox` currently supports `auto`, `network` supports only `off`, and `rawScriptPersistence` supports only `disabled`.
- `scriptTransform.limits.timeoutMs`, `maxInputBytes`, and `maxOutputBytes` must be positive integers within product caps. Per-call script limits may only tighten configured values.

## Verify

After writing optional capability config, use `freeflow_status` or equivalent direct inspection to verify:

- JSON parses.
- `defaultMode` is valid.
- Minimal setup still contains only `defaultMode` when capabilities were declined.
- Optional `enabled`, `skills.enabled`, `outputRouter`, `outputRouter.observedRouting`, `outputRouter.scriptTransform`, and `delegationHarness` sections contain only requested keys.
- Invalid router/observed-routing/script-transform/delegation values are not written.
- Output Router, Delegation Harness, observed routing, native safety-net routing, and script transform are not enabled unless explicitly requested.
- If script transform setup was accepted, global adapter install completed or a clear install/probe failure was reported, and enabled languages match proof-passing adapters.
- No observed-routing entry uses `redacted`, and every enabled entry has explicit persistence.
- `freeflow_status` shows effective defaults and migration recommendations without rewriting config.
- No repo-local hooks, skill files, setup-output-router skill, docs inventories, or repo-local storage directories were created.
