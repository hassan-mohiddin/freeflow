# Freeflow Command Surface Matrix

Date: 2026-06-17

## Summary

Native slash handlers are still disabled:

```json
{ "nativeSlashHandlers": false }
```

Commands are model-routed in Codex/Claude. In Pi, the extension registers direct command handlers that send the equivalent skill prompt. A command selects a mode or skill segment; it does not bypass that segment's gates.

Current registry:

- 4 mode commands
- 12 direct skill calls
- 2 developer skill calls

Current direct command eval coverage:

- Mode command coverage: yes, via `MODE-001` through `MODE-006`.
- Direct skill command coverage: 12 of 12 have `CMD-*` evals.
- Developer command coverage: yes, via `CMD-014` and `CMD-015`.

`evals/scripts/audit-command-surface.sh` passes and checks registry shape, docs mentions, skill targets, manifest consistency, and `nativeSlashHandlers=false`.

## Mode Commands

| Command | Routes To | Codex/Claude Native Handler | Direct Eval | Status |
|---|---|---:|---|---|
| `/workflow conversation` | `mode-contract` | No | `MODE-001` | Covered |
| `/workflow workflow` | `mode-contract` | No | `MODE-*` mode suite | Covered |
| `/workflow strict-workflow` | `mode-contract` | No | `MODE-002`, `MODE-005` | Covered |
| `/workflow reset` | `mode-contract` | No | `MODE-006` | Covered |

## Direct Skill Commands

| Command | Skill | Codex/Claude Native Handler | Direct Eval | Related Behavior Evals | Status |
|---|---|---:|---|---|---|
| `/research` | `research` | No | `CMD-012` | `RES-001`, `RES-002` | Covered |
| `/write-spec` | `write-spec` | No | `CMD-003` | `WSP-001`, `WSP-002`, `WSP-003` | Covered |
| `/review-artifact` | `review-artifact` | No | `CMD-010` | `RAR-001`, `RAR-002` | Covered |
| `/write-plan` | `write-plan` | No | `CMD-004` | `WPL-001` through `WPL-004` | Covered |
| `/execute-plan` | `execute-plan` | No | `CMD-001` | `XPL-001` through `XPL-004` | Covered |
| `/diagnose-failure` | `diagnose-failure` | No | `CMD-011` | `DIA-001` | Covered |
| `/verify-work` | `verify-work` | No | `CMD-005` | `VFY-001` through `VFY-003` | Covered |
| `/review-work` | `review-work` | No | `CMD-009` | `REV-002`, `REV-003` | Covered |
| `/commit-work` | `commit-work` | No | `CMD-002` | `CMT-001` through `CMT-004` | Covered |
| `/handoff` | `handoff` | No | `CMD-006` | `HOF-001` through `HOF-005` | Covered |
| `/bypass` | `bypass` | No | `CMD-007` | `BYP-001`, `BYP-002` | Covered |
| `/output-router` | `output-router` | No | `CMD-016` | `OTR-001`, `OTR-002` | Covered |

## Developer Commands

| Command | Skill | Codex/Claude Native Handler | Direct Eval | Related Behavior Evals | Status |
|---|---|---:|---|---|---|
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
- `/research`
- `/output-router`

All direct skill commands and developer commands now have command-surface evals.

Recommended next validation target:

1. Dogfood the plugin in Hassan's local Codex repos.
2. Run Claude paired smoke evals after local Claude auth is available.

## Runtime Decision

Do not add Codex/Claude native slash-command runtime yet.

Current evidence shows model-routed commands can shape behavior when the skill wording is strong enough. Pi registers direct command handlers through its extension. Several evals exposed wording/placement problems and were fixed without Codex/Claude slash-command runtime machinery.
