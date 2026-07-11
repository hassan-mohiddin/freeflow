# Freeflow Command Surface Matrix

Date: 2026-07-11

## Summary

Native slash handlers are still disabled:

```json
{ "nativeSlashHandlers": false }
```

Commands are model-routed in Codex/Claude. In Pi, the extension registers direct command handlers for skill prompts plus native settings commands for capability configuration. A command selects a mode, skill segment, or settings surface; it does not bypass that segment's gates.

Current registry:

- 4 mode commands
- 16 direct skill calls
- 3 developer skill calls
- 3 Pi native settings commands

Current direct command eval coverage:

- Mode command definitions: `MODE-*` prompts now use the canonical `/freeflow mode` path; Pi handler behavior is deterministic-test covered, while revised model-routed behavior remains Unverified.
- Historical direct skill command coverage: 11 of 16 have `CMD-*` eval definitions; `/discover` uses `CMD-012`.
- The five new optional direct calls are Unverified and intentionally have no grouped eval claims yet.
- Pi native settings command coverage: extension tests cover `/freeflow`, `/output-router`, and `/delegation-harness` settings/status behavior.
- Developer command definitions: config-only setup cases are registered but Unverified; `CMD-014` and `CMD-015` remain historical behavior coverage for write/evaluate skill routes.

`evals/scripts/audit-command-surface.sh` passes and checks registry shape, docs mentions, skill targets, Pi command registration, manifest consistency, and `nativeSlashHandlers=false`.

## Mode Commands

| Command | Routes To | Codex/Claude Native Handler | Direct Eval | Status |
|---|---|---:|---|---|
| `/freeflow mode conversation` | `mode-contract` | Pi: native `/freeflow`; Codex/Claude: model-routed | `MODE-001` | Pi tested; model-routed Unverified |
| `/freeflow mode workflow` | `mode-contract` | Pi: native `/freeflow`; Codex/Claude: model-routed | `MODE-*` mode suite | Pi tested; model-routed Unverified |
| `/freeflow mode strict-workflow` | `mode-contract` | Pi: native `/freeflow`; Codex/Claude: model-routed | `MODE-002`, `MODE-005` | Pi tested; model-routed Unverified |
| `/freeflow mode reset` | `mode-contract` | Pi: native `/freeflow`; Codex/Claude: model-routed | `MODE-006` | Pi tested; model-routed Unverified |

## Direct Skill Commands

| Command | Skill | Codex/Claude Native Handler | Direct Eval | Related Behavior Evals | Status |
|---|---|---:|---|---|---|
| `/discover` | `discover` | No | `CMD-012` | `DIS-001`, `DIS-002`, `DFD-001` | Historical coverage; revised skill Unverified |
| `/write-spec` | `write-spec` | No | `CMD-003` | `WSP-001`, `WSP-002`, `WSP-003` | Historical coverage; revised skill Unverified |
| `/review-artifact` | `review-artifact` | No | `CMD-010` | `RAR-001`, `RAR-002` | Historical coverage; revised skill Unverified |
| `/write-plan` | `write-plan` | No | `CMD-004` | `WPL-001` through `WPL-004` | Historical coverage; revised skill Unverified |
| `/execute-plan` | `execute-plan` | No | `CMD-001` | `XPL-001` through `XPL-004` | Historical coverage; revised skill Unverified |
| `/simplify-code` | `simplify-code` | No | — | — | Unverified candidate |
| `/deprecation-and-migration` | `deprecation-and-migration` | No | — | — | Unverified candidate |
| `/diagnose-failure` | `diagnose-failure` | No | `CMD-011` | `DIA-001` | Historical coverage; revised skill Unverified |
| `/verify-work` | `verify-work` | No | `CMD-005` | `VFY-001` through `VFY-003` | Historical coverage; revised skill Unverified |
| `/review-work` | `review-work` | No | `CMD-009` | `REV-002`, `REV-003` | Historical coverage; revised skill Unverified |
| `/commit-work` | `commit-work` | No | `CMD-002` | `CMT-001` through `CMT-004` | Historical coverage; revised skill Unverified |
| `/handoff` | `handoff` | No | `CMD-006` | `HOF-001` through `HOF-005` | Historical coverage; revised skill Unverified |
| `/finish-branch` | `finish-branch` | No | — | — | Unverified candidate |
| `/release-work` | `release-work` | No | — | — | Unverified candidate |
| `/shipping-and-launch` | `shipping-and-launch` | No | — | — | Unverified candidate |
| `/bypass` | `bypass` | No | `CMD-007` | `BYP-001`, `BYP-002` | Covered |

## Pi Native Settings Commands

| Command | Handler | Codex/Claude Native Handler | Test Coverage | Status |
|---|---|---:|---|---|
| `/freeflow` | Unified Freeflow settings/status | No | `pi-extension/tests/pi-extension.test.js` | Covered |
| `/output-router` | Output Router settings/status | No | `pi-extension/tests/pi-extension.test.js` | Covered |
| `/delegation-harness` | Delegation Harness settings/status | No | `pi-extension/tests/pi-extension.test.js` | Covered |

## Developer Commands

| Command | Skill | Codex/Claude Native Handler | Direct Eval | Related Behavior Evals | Status |
|---|---|---:|---|---|---|
| `/setup-freeflow` | `setup-freeflow` | No | `STP-*` setup suite | 11 revised `STP-*` definitions, including `STP-012` | Unverified |
| `/write-skill` | `write-skill` | No | `CMD-014` | `WSK-001` | Covered |
| `/evaluate-skill` | `evaluate-skill` | No | `CMD-015` | `ESK-001` | Covered |

## Coverage Notes

The highest-risk direct commands now have command-surface evals:

- `/execute-plan`
- `/commit-work`
- `/write-spec`
- `/write-plan`
- `/verify-work`
- `/handoff`
- `/bypass`
- `/review-work`
- `/review-artifact`
- `/diagnose-failure`
- `/discover`

All registry routes have a real skill target and matching Pi registration. Eleven direct calls retain historical command-surface eval coverage. The five optional additions are deliberately exposed as Unverified candidates rather than assigned synthetic evidence. `/discover` is the discovery command; `CMD-012` was rerun in the earlier workflow-depth eval pass.

Recommended next validation target:

1. Dogfood the plugin in Hassan's local Codex repos.
2. Run Claude paired smoke evals after local Claude auth is available.

## Runtime Decision

Do not add Codex/Claude native slash-command runtime yet.

Historical evidence shows model-routed commands can shape behavior when skill wording is strong enough. Pi registers direct command handlers through its extension. The current adaptive revisions and candidate commands still require behavioral evaluation before readiness claims.
