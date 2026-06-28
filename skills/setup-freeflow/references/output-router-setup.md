# Output Router Setup

Use this when setup reaches the optional evidence-routing branch or explicitly asks for output-router, observed-routing, provider, generated-path, native safety-net, vault, threshold, or script-transform repo config (`scriptDerive`).

## Defaults

- The output router has built-in defaults. A repo does not need optional config for normal search/run/transform behavior.
- Minimal `/setup-freeflow` must still write only `defaultMode`.
- Ask one evidence-routing decision point. If declined, do not write `outputRouter`, `observedRouting`, `capture`, `providers`, or `scriptDerive`.
- Observed routing is opt-in per producer/server. The user must choose persistence for each enabled entry before setup writes config.
- Do not create a separate `setup-output-router` skill.

If the user says only “set up the output router” with no requested knobs, say the router works with built-in defaults and ask which optional config they want persisted. Recommend no repo config unless they need provider enablement, repo-specific hints, or safety-net behavior.

## Config Shape

Write only keys the user explicitly requests. Do not dump all defaults and do not create empty `outputRouter`, `observedRouting`, `capture`, `providers`, or `scriptDerive` objects.

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
  "providers": {
    "enabled": [
      { "id": "serena", "mode": "discovery", "categories": ["symbols", "references", "diagnostics"] }
    ]
  },
  "scriptDerive": {
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
- Pi public `freeflow_capture` has been removed. Do not write `capture.freeflowMediated` during Pi setup.
- `capture.directHostTools` currently supports only `off`; broad direct host-tool capture needs a separate design/confirmation before other policies are written.
- `providers.enabled` accepts provider ids or objects with `id`, optional `mode` (`discovery` or `read-only`), and optional read-only categories (`symbols`, `references`, `diagnostics`, `graph`, `architecture`, `search`).
- Custom provider manifests are user-owned, must validate as single-line structured fields, and are labeled `custom/unverified`.
- `scriptDerive.enabled` defaults to `false`; write it only after an explicit script-execution opt-in.
- Setup must not install, download, or vendor script runtimes. For Pi JavaScript execution, the user must separately provide a `quickjs-wasi` package root through `FREEFLOW_QUICKJS_WASI_ROOT`; for Pi Python execution, the user must separately provide an `@bsull/eryx` package root through `FREEFLOW_ERYX_ROOT` and run Node with `--experimental-wasm-jspi`; for Pi jq execution, the user must separately provide a `jq-wasm` package root through `FREEFLOW_JQ_WASM_ROOT`.
- `scriptDerive.languages` supports `javascript`, `python`, and `jq`; enable only the languages whose explicit package roots and runtime requirements the user chose.
- `scriptDerive.sandbox` currently supports `auto`, `network` supports only `off`, and `rawScriptPersistence` supports only `disabled`.
- `scriptDerive.limits.timeoutMs`, `maxInputBytes`, and `maxOutputBytes` must be positive integers within product caps. Per-call script limits may only tighten configured values.

## Verify

After writing optional evidence-routing config, use `freeflow_status` or equivalent direct inspection to verify effective behavior:

- JSON parses.
- `defaultMode` is valid.
- Minimal setup still contains only `defaultMode` when evidence routing was declined.
- Optional `outputRouter`, `observedRouting`, `capture`, `providers`, and `scriptDerive` sections contain only requested keys.
- Invalid router/observed-routing/capture/provider/script-transform values are not written.
- Observed routing, native safety-net routing, and script transform are not enabled unless explicitly requested.
- No observed-routing entry uses `redacted`, and every enabled entry has explicit persistence.
- Direct host-tool capture remains `off` unless explicitly requested and supported.
- `freeflow_status` shows effective defaults and migration recommendations without rewriting config.
- No repo-local hooks, skill files, setup-output-router skill, docs inventories, or repo-local storage directories were created.
