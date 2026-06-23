# Output Router Setup

Use this when setup reaches the optional evidence-routing branch or explicitly asks for output-router, capture, provider, generated-path, native safety-net, vault, or threshold repo config.

## Defaults

- The output router and Freeflow-mediated capture have built-in defaults. A repo does not need optional config to use them.
- Minimal `/setup-freeflow` must still write only `defaultMode`.
- Ask one evidence-routing decision point. If declined, do not write `outputRouter`, `capture`, or `providers`.
- Do not create a separate `setup-output-router` skill.

If the user says only “set up the output router” with no requested knobs, say the router works with built-in defaults and ask which optional config they want persisted. Recommend no repo config unless they need provider enablement, repo-specific hints, or safety-net behavior.

## Config Shape

Write only keys the user explicitly requests. Do not dump all defaults and do not create empty `outputRouter`, `capture`, or `providers` objects.

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
  "capture": {
    "freeflowMediated": "raw",
    "directHostTools": "off"
  },
  "providers": {
    "enabled": [
      { "id": "serena", "mode": "discovery", "categories": ["symbols", "references", "diagnostics"] }
    ]
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
- `capture.freeflowMediated` currently supports only `raw` for Freeflow-mediated read-only calls. Metadata-only/off semantics need a later explicit implementation before setup may write them.
- `capture.directHostTools` currently supports only `off`; broad direct host-tool capture needs a separate design/confirmation before other policies are written.
- `providers.enabled` accepts provider ids or objects with `id`, optional `mode` (`discovery` or `read-only`), and optional read-only categories (`symbols`, `references`, `diagnostics`, `graph`, `architecture`, `search`).
- Custom provider manifests are user-owned, must validate as single-line structured fields, and are labeled `custom/unverified`.

## Verify

After writing optional evidence-routing config, use `freeflow_status` or equivalent direct inspection to verify effective behavior:

- JSON parses.
- `defaultMode` is valid.
- Minimal setup still contains only `defaultMode` when evidence routing was declined.
- Optional `outputRouter`, `capture`, and `providers` sections contain only requested keys.
- Invalid router/capture/provider values are not written.
- Native safety-net routing is not enabled unless explicitly requested.
- Direct host-tool capture remains `off` unless explicitly requested and supported.
- `freeflow_status` shows effective defaults and migration recommendations without rewriting config.
- No repo-local hooks, skill files, setup-output-router skill, docs inventories, or repo-local storage directories were created.
