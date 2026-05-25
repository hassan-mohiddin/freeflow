# Pilot Workflow Command Surface Matrix

Date: 2026-05-26

## Summary

Native slash handlers are still disabled:

```json
{ "nativeSlashHandlers": false }
```

Commands are model-routed. A command selects a mode or skill segment; it does not bypass that segment's gates.

Current registry:

- 3 mode commands
- 13 direct skill calls
- 2 developer skill calls

Current direct command eval coverage:

- Mode command coverage: yes, via `MODE-001` through `MODE-005`.
- Direct skill command coverage: 7 of 13 have `CMD-*` evals.
- Developer command coverage: no `CMD-*` evals yet; both have skill-authoring behavior evals.

`evals/scripts/audit-command-surface.sh` passes and checks registry shape, docs mentions, skill targets, manifest consistency, and `nativeSlashHandlers=false`.

## Mode Commands

| Command | Routes To | Native Handler | Direct Eval | Status |
|---|---|---:|---|---|
| `/workflow conversation` | `mode-contract` | No | `MODE-001` | Covered |
| `/workflow workflow` | `mode-contract` | No | `MODE-*` mode suite | Covered |
| `/workflow strict-workflow` | `mode-contract` | No | `MODE-002`, `MODE-005` | Covered |

## Direct Skill Commands

| Command | Skill | Native Handler | Direct Eval | Related Behavior Evals | Status |
|---|---|---:|---|---|---|
| `/grill-context` | `grill-context` | No | Missing | `GRC-001` | Add command eval later |
| `/research-brief` | `research-brief` | No | Missing | `RBR-001` | Add command eval later |
| `/write-spec` | `write-spec` | No | `CMD-003` | `WSP-001`, `WSP-002`, `WSP-003` | Covered |
| `/review-artifact` | `review-artifact` | No | Missing | `RAR-001`, `RAR-002` | Add command eval later |
| `/write-plan` | `write-plan` | No | `CMD-004` | `WPL-001` through `WPL-004` | Covered |
| `/execute-plan` | `execute-plan` | No | `CMD-001` | `XPL-001` through `XPL-004` | Covered |
| `/diagnose-failure` | `diagnose-failure` | No | Missing | `DIA-001` | Add command eval later |
| `/verify-work` | `verify-work` | No | `CMD-005` | `VFY-001` through `VFY-003` | Covered |
| `/review-work` | `review-work` | No | Missing | `REV-002`, `REV-003` | Add command eval later |
| `/commit-work` | `commit-work` | No | `CMD-002` | `CMT-001` through `CMT-004` | Covered |
| `/capture-decisions` | `capture-decisions` | No | Missing | `CAP-001` | Add command eval later |
| `/handoff` | `handoff` | No | `CMD-006` | `HOF-001` through `HOF-005` | Covered |
| `/bypass` | `bypass` | No | `CMD-007` | `BYP-001`, `BYP-002` | Covered |

## Developer Commands

| Command | Skill | Native Handler | Direct Eval | Related Behavior Evals | Status |
|---|---|---:|---|---|---|
| `/write-skill` | `write-skill` | No | Missing | `WSK-001` | Behavior eval only |
| `/evaluate-skill` | `evaluate-skill` | No | Missing | `ESK-001` | Behavior eval only |

## Coverage Notes

The highest-risk direct commands now have command-surface evals:

- `/execute-plan`
- `/commit-work`
- `/write-spec`
- `/write-plan`
- `/verify-work`
- `/handoff`
- `/bypass`

Remaining direct command evals should be added only when they test a real command-specific failure mode, not just to mirror every skill eval.

Recommended next direct command targets:

1. `/capture-decisions`: durable memory must omit volatile inventory and avoid ADR overuse.
2. `/review-work`: direct command should not pass partially correct work with unrelated blocking regression.
3. `/review-artifact`: direct command should not rubber-stamp an artifact that conflicts with source truth.
4. `/diagnose-failure`: direct command should not patch without repro or feedback loop.

## Runtime Decision

Do not add native slash-command runtime yet.

Current evidence shows model-routed commands can shape behavior when the skill wording is strong enough. Several evals exposed wording/placement problems and were fixed without runtime machinery.
