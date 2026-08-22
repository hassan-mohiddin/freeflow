# Release Evidence

Freeflow v0.5.0 is based on fresh deterministic Pi-extension, Skill Author, and Skill Eval suites; targeted local baseline/candidate evaluation of the revised authoring and evaluation packages; and the historical acceptance evidence identified below. Retired Output Router evidence is documentary and preserved under `.deprecated/output-router/`. Runtime and configuration checks cover the current Interaction Lifecycle, layered configuration, Interaction Contract, and Workflow bootstrap. Evidence remains case-, host-, model-, and configuration-specific and does not establish universal skill readiness.

The exact-commit Freeflow development snapshot is an integration input, not release evidence. It must not be treated as a published version, production source, or proof of a clean GitHub installation.

## Acceptance Summary

The local v0.1 acceptance suite passed after measured fixes and was rerun during prepublish verification on 2026-05-26.

High-signal behaviors covered:

- Source-truth conflicts stop before edits.
- Strict public API specs ask for owner decisions.
- Execution stops when verification reveals a bad plan.
- Commit flow refuses mixed staged sensitive changes.
- Discovery checkpoints replace separate briefing, grilling, and decision-capture commands for discovery work.
- Bypass skips ceremony, not judgment.

The 2026-07-21 prepublish source checkpoint passed the then-current retired Router suite, 102 Pi-extension tests, 19 Skill Author tests, 66 Skill Eval tests, and the then-current package structure. That Router evidence is retained only in `.deprecated/output-router/`; the exact npm tarball also passed a clean installed-package Pi entrypoint import.

The 2026-08-03 host-surface candidate included the now-retired Output Router as a separate Pi capability. Its Router evidence remains historical and is not part of the active runtime claim. The host-surface, lifecycle, activation, skill-routing, release metadata, formatting, build, marketplace, and isolated npm-tarball checks remain documentary evidence for the candidate they covered.

The 2026-08-13 v0.5.0 candidate adds session-only mode controls and lifecycle restoration for Codex and Claude. Deterministic hook checks cover same-turn natural-language and native controls, reset, per-session isolation, resume and compact restoration, Claude's host-process-scoped one-shot `/clear` handoff across changed session identifiers, overlapping-clear isolation, atomic claim under concurrent starts, stale-handoff rejection, Codex SessionEnd isolation, atomic plugin-owned state, config immutability, ordinary-prompt silence, and non-activation for questions, hypotheticals, and configured-default requests. A fixed Mode Contract baseline/candidate evaluation changed from a silent `.freeflow/local.json` edit to no file changes plus one personal-versus-shared scope question. Remote GitHub installation and live cross-host model behavior remain deferred until the versioned source is pushed.

## Skill Authoring And Evaluation Tooling

The fresh Skill Author surface provides minimal scaffold creation, structural validation, recursive contained-resource checks, and factual inspection without wording, quality, or readiness judgments.

The fresh Skill Eval surface provides exactly baseline/candidate groups, description and explicit-body evaluation, one-shot and persistent multi-turn Pi subjects, isolated fixtures and declared context, deterministic append-only grading, ordered serial batch continuation, and grade-first generated views over canonical evidence. Subject evidence remains separate from derived grades, and the evaluator does not own semantic judgment, promotion, or production readiness.

Tracked deterministic tests establish these mechanics. Targeted live Pi runs informed the package rewrite, but generated local run stores remain excluded from the npm artifact and do not create a broad readiness claim.

## Command Surface

The development registry covers:

- 4 mode commands.
- 19 direct skill calls: 17 canonical commands plus 2 published Pi compatibility aliases.
- 3 developer skill calls.
- 2 Pi native settings commands.

Freeflow uses host-native skill invocation instead of duplicate manifest command handlers. Claude exposes plugin skills as namespaced slash commands; Codex exposes skills through `/skills` and `$skill` mentions; Pi registers direct Freeflow commands through its extension, including unified `/freeflow` and `/freeflow profile <standard|reasoning|auto>`.

## Runtime Context

Freeflow ships one shared runtime hook that stays inert until `.freeflow/config.json` is valid and any `.freeflow/local.json` core layer is missing or valid. At `SessionStart`, it loads the Interaction Contract when effective, the full Workflow skill once per context epoch while Skills are effective, and precise configured/resolved/effective mode state after supported startup, resume, clear, and compact boundaries. At `UserPromptSubmit`, it changes plugin-owned session mode only for explicit native or conservative natural-language controls and otherwise emits nothing. The Pi extension appends effective compact context before every agent turn, stores Workflow as one hidden persistent custom message, and independently loads enabled active Pi capabilities. An effective top-level disabled state suppresses Freeflow context and capabilities; an effective Skills-disabled state suppresses Workflow and mode effectiveness while the Interaction Contract remains independently controlled. Session overrides sit above configured mode values but cannot bypass missing or invalid repository activation. Mode Contract, Decision Gate, and other workflow skills remain on demand. These hooks do not run after edit/write tools, enforce behavior, block tools, or create repo-local hook files.

For the same session that runs setup, `setup-freeflow` reads newly effective Interaction Contract, Workflow, and Mode Contract following successful verification. It reports those direct reads separately from automatic lifecycle delivery.

Host trust prompts for plugin hooks are expected host behavior. Setup reports runtime delivery as confirmed, unavailable, or unconfirmed. `STP-012` registers the untrusted-hook pressure case but remains Unverified. Local metadata validation checks hook packaging and deterministic output, not end-to-end host trust UI.

Isolated local install smoke passed for Codex marketplace add/install, Claude marketplace validation/add/install, Pi local-package install, and npm-tarball extension registration. Remote GitHub installation and live model behavior remain deferred.

## Retired Output Router Evidence

The former Output Router implementation, benchmarks, sandbox proofs, and observed-routing reports remain available under `.deprecated/output-router/` for historical reference and possible future v2 design work. They do not establish current runtime support or package behavior.

## Release Metadata

Run `scripts/validation/validate-release-metadata.sh` for local prepublish checks across marketplace metadata, host manifests, command-surface routing, release-boundary docs, package cleanliness, and deferred install-smoke status. The npm runtime tarball excludes GitHub-only `plugin-docs/`, `.skill-eval/`, and `.deprecated/` content.

Run `hooks/tests/check-runtime-context-hook.sh` after changing lifecycle context hooks.

## Known Deferred Work

- Live Claude smoke evals after Hassan confirms Claude testing is available again.
- GitHub-install smoke tests in separate Codex, Claude, and fresh Pi environments.
- Enforcement hooks or CLI checks only after repeated behavior failures justify them.
- Public marketplace submission only after GitHub install works for required hosts.

Full eval reports are development evidence and are not included in the runtime package.
