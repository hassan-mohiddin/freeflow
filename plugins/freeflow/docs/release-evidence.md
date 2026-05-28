# Release Evidence

Freeflow v0.1 is based on local fixture evals and release acceptance runs from the development repository.

## Acceptance Summary

The local v0.1 acceptance suite passed after measured fixes and was rerun during prepublish verification on 2026-05-26.

High-signal behaviors covered:

- Source-truth conflicts stop before edits.
- Strict public API specs ask for owner decisions.
- Execution stops when verification reveals a bad plan.
- Commit flow refuses mixed staged sensitive changes.
- Decision capture asks before inventing memory conventions.
- Bypass skips ceremony, not judgment.

## Command Surface

The development registry covers:

- 3 mode commands.
- 13 direct workflow skill calls.
- 2 contributor skill calls.

Native slash handlers are not shipped in v0.1. Commands are model-routed through natural language and skill activation.

## Release Metadata

Run `plugins/freeflow/evals/scripts/validate-release-metadata.sh` for local prepublish checks across marketplace metadata, host manifests, command-surface routing, release-boundary docs, package cleanliness, and deferred install-smoke status.

## Known Deferred Work

- Live Claude smoke evals after Hassan confirms Claude testing is available again.
- GitHub-install smoke tests in separate Codex and Claude environments.
- Hooks or CLI enforcement only after repeated behavior failures justify them.
- Public marketplace submission only after GitHub install works.

Full eval reports are development evidence and are not included in the runtime package.
