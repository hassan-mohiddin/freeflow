# Release Evidence

Freeflow v0.1 is based on local fixture evals and release acceptance runs from the development repository.

## Acceptance Summary

The local v0.1 acceptance suite passed after measured fixes and was rerun during prepublish verification on 2026-05-26.

High-signal behaviors covered:

- Source-truth conflicts stop before edits.
- Strict public API specs ask for owner decisions.
- Execution stops when verification reveals a bad plan.
- Commit flow refuses mixed staged sensitive changes.
- Research checkpoints replace separate research, grilling, and decision-capture commands for discovery work.
- Bypass skips ceremony, not judgment.

## Command Surface

The development registry covers:

- 4 mode commands.
- 11 direct workflow skill calls.
- 2 contributor skill calls.

Codex/Claude native slash handlers are not shipped in v0.1. In those hosts, commands are model-routed through natural language and skill activation. Pi registers direct Freeflow commands through its extension.

## Runtime Context

Freeflow ships plugin-bundled context hooks that load the existing `workflow` skill, workflow map, and `interview-gate` skill at session start. The Pi extension also loads output-router context, including its safety-policy reference, when the routed tools are available. These hooks do not run after edit/write tools, enforce behavior, block tools, or create repo-local hook files.

For the same session that runs setup, `setup-freeflow` reads the workflow skill, workflow map, and interview-gate skill after successful setup verification before saying workflow and interview-gate context is loaded.

Host trust prompts for plugin hooks are expected host behavior. Local metadata validation checks hook packaging and deterministic output, not end-to-end host trust UI.

## Release Metadata

Run `plugins/freeflow/evals/scripts/validate-release-metadata.sh` for local prepublish checks across marketplace metadata, host manifests, command-surface routing, release-boundary docs, package cleanliness, and deferred install-smoke status.

Run `plugins/freeflow/evals/scripts/check-runtime-context-hook.sh` after changing lifecycle context hooks.

## Known Deferred Work

- Live Claude smoke evals after Hassan confirms Claude testing is available again.
- GitHub-install smoke tests in separate Codex, Claude, and fresh Pi environments.
- Enforcement hooks or CLI checks only after repeated behavior failures justify them.
- Public marketplace submission only after GitHub install works for required hosts.

Full eval reports are development evidence and are not included in the runtime package.
