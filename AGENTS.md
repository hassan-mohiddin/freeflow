# Freeflow Agent Memory

This repo develops `freeflow`, a feedback-based control system for coding agents: a portable skill pack and runtime guidance that steer an existing agent such as Codex, Claude Code or Pi through consequential work, plus a native Pi extension. It is not a new agent.

This file governs contributing to the Freeflow repository. It does not define the model-facing workflow or task-memory method; those belong to the runtime context and active skills. Repository-specific constraints here still apply to changes made in this repo.

## Read First

Use the smallest current source set relevant to the change:

- Read `dev-docs/README.md` for the architecture and the developer docs index, then the subsystem doc or guide for the area you change. Read `plugin-docs/README.md` for user-facing behavior when the change touches it.
- Before treating behavior as a bug, read its subsystem doc's decisions and intended behavior that looks wrong; listed behavior is a design choice for the user to change, not a fix.
- Read `dev-docs/adr/` when the change touches a durable decision.
- Recover the active Working Record through Track Work when an ongoing task has one.
- Before designing or changing a capability, check this repository's task records for related tasks and read their `record.md`, `specs/`, and `plans/`. Accepted designs and their rationale often live only there. Records outside a Task Memory project are in `.freeflow/tasks/`, which is Git-ignored: `.ignore` keeps it visible to ripgrep-based search, but tools that honor only `.gitignore` skip it, so search that path explicitly. Once the repository is linked to a project, its records are in the project's store, reached through the `.freeflow/project` link; search that path explicitly too, since search tools do not follow links by default.
- Read a handoff only when a point-in-time transfer is needed or the current record does not cover it.
- Read the relevant live skill, runtime contract, test, package metadata, or release-evidence record before editing.
- Inspect `.skill-eval/` and the accepted bundle when changing or evaluating a skill's evidence. Historical v1 cases and reports under `.deprecated/skill-evals-v1/` are documentary only and never establish current readiness.

Historical plans, research, handoffs, issues, and evidence under `.deprecated/` (the former `docs/` tree is `.deprecated/project-docs/`) preserve project context but are not current product authority. Live repository evidence and current `plugin-docs/` and `dev-docs/` pages override them.

## External Host Source Provenance

When work depends on Pi or another external host's source, API, lifecycle, or documentation:

- Do not use installed, bundled, cached, or locally generated host documentation as current source authority.
- Clone or fetch the upstream repository into an ignored temporary checkout, resolve the current tip to an exact commit before reading it, and use that pinned checkout's source and docs for design work.
- Record the remote, exact commit, relevant package version, and source/artifact hashes in task evidence when the claim is consequential.
- For behavior of an installed or bundled artifact, identify the exact artifact and establish correspondence to the source commit when possible. A current upstream checkout does not prove an older artifact's behavior; qualify the artifact through an isolated fixture and state the boundary when correspondence is unavailable.
- Do not float to a newer upstream commit during one qualification or implementation slice without recording the source change and reconciling affected evidence.
- Network fetches, temporary clones, and artifact qualification remain covered environment effects; this rule does not authorize them by itself.

## Development Snapshot Boundary

Pi development consumes a committed Freeflow snapshot, not this checkout's working tree:

```bash
npm run snapshot:refresh
```

Commit intended Freeflow changes before refreshing; uncommitted and ignored files are not in a snapshot. Snapshots are development-only, and a snapshot does not establish host support or runtime delivery. How the tool builds one: [Pi extension](dev-docs/subsystems/pi-extension.md#development-boundary).

## Working Rules

- Use ADRs sparingly for hard-to-reverse, surprising, tradeoff-driven decisions.
- Do not hardcode volatile repo facts, directory inventories, or stack summaries into durable memory.
- Do not add enforcement hooks until skill wording and evals prove the behavior needs mechanical enforcement.
- Before editing a skill or other instruction text in this repository (a `SKILL.md`, its references, `AGENTS.md`, `runtime/prompts/`, or a tool's description), read and follow [Write Skill](skills/write-skill/SKILL.md). Its [Guidance Placement](skills/write-skill/references/guidance-placement.md) decides where each behavior lives: on the lowest rung that reaches the agent in time, with one owner.

## Prompt Cache

Freeflow must never make a user pay more than native Pi for the same work. Read [Prompt cache rules](dev-docs/guides/prompt-cache.md) before changing prompts, tools, projection, request history, routing, tool results, or provider support.

- Never change content a provider has already cached: no edits, reordering, truncation, or re-rendering of earlier messages or tool results.
- Append new content after what the requester already received; do not insert it earlier.
- Keep the Freeflow system section and tool definitions fixed between settings changes. Gates and the Runtime State express changing state; a settings change or another unavoidable event may change what is sent, at one cache write.
- Route generated per-turn content through request history so it keeps its position.
- Prove every request-assembly change with a test in which a later request starts with the earlier one.
- Gate provider-specific request changes on provider documentation or a recorded live probe; leave unqualified routes untouched.
- Advise on host cache settings such as retention; never override them.
- Report cache diagnostics to `/freeflow status`, not the footer.

## Request-Path Performance

Freeflow runs on every Pi turn and request, so its work delays every model call and can grow with session length unnoticed. Read [Performance](dev-docs/guides/performance.md) before changing Freeflow's event handlers or anything they call.

- Follow its rules: memory-first state, ask Pi for the branch once per change (`cachedBranch()`), hash once, extend whole-history values incrementally, write only on change, and keep diagnostics off the request path.
- Keep `pi-extension/tests/integration/request-path-budget.test.js` passing, and add a count there for any new work that could grow with the session.
- Run `npm run perf:request` before and after a request-path change, and report the numbers when they move.

## Documentation And Changelog Policy

- Agents may update `CHANGELOG.md` under `## Unreleased` for verified consumer-visible work when the task authorization covers that update. Use only the canonical categories `Breaking Changes`, `Added`, `Changed`, `Fixed`, and `Removed`; keep each entry as a bullet under exactly one category. Defer the entry until the final implementation slice unless bounded write-ahead authorization says otherwise.
- Run `npm run check:changelog` after changelog changes. Never hand-edit versioned release sections or ask automation to infer a category; release preparation only normalizes already categorized entries.
- Never edit released changelog sections.
- Two kinds of documentation, each for its own reader: user docs in `plugin-docs/` (installing, configuring, using Freeflow) and developer docs in `dev-docs/` (architecture, subsystems, maintainer guides, decision records). Write and update both with the [Write Docs](skills/write-docs/SKILL.md) skill.
- Developer docs change in the same commit as the behavior they describe, without separate authorization; `npm run check` fails (`check:dev-docs`) when code a developer doc covers changes in a commit that neither changes the doc nor moves its `Verified at` past it.
- Changes to `plugin-docs/`, public contract or install guidance, ADRs, or release evidence require explicit authorization and should be deferred to the final documentation slice.
- If leaving a document stale would make the repository misleading, stop and ask rather than silently editing it.

## Release And CI

- Use `deliver-work`'s release route for version classification, release preparation, artifact checks, publication, recovery, and consumer-side verification.
- `npm run check` is the deterministic local/CI gate. It does not run model-based skill evaluations or require publication credentials.
- Release preparation may update version metadata and move verified `Unreleased` notes into a version section, but it must not commit, tag, push, publish, or create a GitHub Release by itself.
- A Git tag in the form `vX.Y.Z` is the human-controlled release boundary; what the tag workflow does is in the [Release process](dev-docs/guides/release.md).
- Never reuse an npm version or force-move a release tag. If publication partially succeeds, inspect remote state before retrying; recovery is allowed only when the existing registry artifact matches the candidate checksum and provenance.
- Do not run `npm run snapshot:refresh` as part of a production release.

## Implementation Pointers

The repository root is the single source of truth: skills, runtime prompts, docs, `.skill-eval/` definitions and command-surface metadata are never copied into a second maintained tree. Where each part lives: the [developer docs](dev-docs/README.md) Code Map.
