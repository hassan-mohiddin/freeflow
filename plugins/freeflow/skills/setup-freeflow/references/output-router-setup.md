# Output Router Setup

Use this only when setup explicitly asks for output-router repo config, generated-path hints, native safety-net routing, vault settings, or output thresholds.

## Defaults

- The output router has built-in defaults. A repo does not need `outputRouter` config to use it.
- Minimal `/setup-freeflow` must still write only `defaultMode`.
- Do not ask every setup user about router config.
- Do not create a separate `setup-output-router` skill.

If the user says only “set up the output router” with no requested knobs, say the router works with built-in defaults and ask which optional config they want persisted. Recommend no repo config unless they need a repo-specific hint or safety-net behavior.

## Config Keys

Write only keys the user explicitly requests. Do not dump all defaults and do not create an empty `outputRouter` object.

Supported repo config keys:

```json
{
  "defaultMode": "workflow",
  "outputRouter": {
    "postToolRouting": "off",
    "largeOutputBytes": 64000,
    "largeOutputLines": 1000,
    "vaultRoot": "~/.cache/freeflow-router/vault",
    "vaultRetentionDays": 7,
    "generatedPaths": ["graphify-out/**"],
    "noisyCommandHints": ["npm test"]
  }
}
```

Rules:

- `postToolRouting` defaults to `off`. Use `safety-net` only when explicitly requested. Treat `strict` as reserved; ask before writing it.
- `largeOutputBytes`, `largeOutputLines`, and `vaultRetentionDays` must be positive integers.
- `vaultRoot` must be a non-empty string.
- `generatedPaths` are broad-scan generated-path hints. Explicit file or directory retrieval must remain available.
- `noisyCommandHints` is parsed as hint config. Do not add it unless the user explicitly asks for command-pattern hints.

## Verify

After writing optional router config:

- JSON parses.
- `defaultMode` is valid.
- `outputRouter` contains only requested keys.
- Invalid router values are not written.
- Native safety-net routing is not enabled unless explicitly requested.
- No repo-local hooks, skill files, setup-output-router skill, or docs inventories were created.
