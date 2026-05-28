# Freeflow Published Memory Handoff

> **Date:** 2026-05-26
> **Type:** Memory handoff
> **Status:** Current
> **Repo:** `https://github.com/hassan-mohiddin/freeflow`
> **Current commit:** `6499794 Simplify Freeflow marketplace layout`

## Purpose

This handoff records the state after Freeflow was cleaned up, packaged, published to GitHub, and verified as discoverable by Codex from a marketplace-style repository layout.

Use this as durable continuation memory for future Freeflow development. Live repo evidence, explicit user decisions, accepted ADRs, manifests, and eval reports still override this handoff if anything conflicts.

## What Freeflow Is Now

Freeflow is a lightweight workflow plugin/skill pack for coding agents. It is not a new agent, CLI framework, hook system, or old Orchestra repackaged.

It provides three modes:

- `conversation`: answer, explain, critique, or explore without workflow pressure.
- `workflow`: default for consequential work; use the workflow spine and scale detail to risk.
- `strict-workflow`: high-risk or hard-to-reverse work with stronger gates.

Core principle:

```text
Move forward when context is sufficient.
Re-enter clarification when new ambiguity would change the next action.
```

## Current Repository Shape

The repo root is the public marketplace repository. The installable runtime is under `plugins/freeflow/`.

```text
freeflow/
  .agents/plugins/marketplace.json
  .claude-plugin/marketplace.json
  README.md
  LICENSE
  CHANGELOG.md
  AGENTS.md
  CONTEXT.md
  docs/
  plugins/freeflow/
    .codex-plugin/plugin.json
    .claude-plugin/plugin.json
    command-surface.json
    skills/
    docs/
    evals/
```

Root `docs/` is the main project documentation workspace for planning, current state, research, handoffs, and durable project decisions.

`plugins/freeflow/docs/` is the refined user-facing plugin documentation that ships with the plugin runtime.

`plugins/freeflow/` is the single source of truth for runtime skills, references, evals, manifests, command-surface metadata, and plugin docs. Do not recreate a generated `packages/freeflow/` mirror.

## How Publishing Works

GitHub repo:

```text
https://github.com/hassan-mohiddin/freeflow
```

Codex discovers Freeflow through:

```text
.agents/plugins/marketplace.json
```

That marketplace points to:

```json
"path": "./plugins/freeflow"
```

Codex then reads the plugin manifest at:

```text
plugins/freeflow/.codex-plugin/plugin.json
```

Claude discovers Freeflow through:

```text
.claude-plugin/marketplace.json
```

That marketplace also points to:

```text
./plugins/freeflow
```

Claude then reads:

```text
plugins/freeflow/.claude-plugin/plugin.json
```

The tested important detail: Codex did not discover an installable plugin when the marketplace source path was `"."`. It did discover the plugin when the source path was `"./plugins/freeflow"`.

## Current Git State

Local `main` and `origin/main` are aligned at:

```text
6499794 Simplify Freeflow marketplace layout
```

Recent relevant commits:

- `6499794 Simplify Freeflow marketplace layout`
- `dfbbba6 Document Freeflow marketplace install`
- `8fdfcca Add Codex marketplace index for Freeflow`
- `e7d4d19 Record Freeflow GitHub publication`
- `fb1475f Record Freeflow prepublish verification`

The earlier GitHub repo contents were replaced with `git push --force-with-lease origin main:main` because the temporary public repo history diverged from the real local development history. The repo did not need to be deleted and recreated.

## What Was Done

The project was renamed/reframed from the earlier Pilot Workflow/Research shape into Freeflow.

The plugin was cleaned into one runtime:

- Kept root marketplace files for Codex and Claude.
- Kept root README, license, changelog, project docs, `AGENTS.md`, and `CONTEXT.md`.
- Moved the installable plugin runtime to `plugins/freeflow/`.
- Removed old duplicate/generated package mirrors.
- Removed the old `packages/freeflow/` direction from current docs.
- Kept root `docs/` as project memory and planning docs.
- Kept `plugins/freeflow/docs/` as refined plugin-user docs.
- Moved `command-surface.json` to `plugins/freeflow/command-surface.json`.
- Updated `.gitignore` so generated eval runs are ignored while eval definitions, fixtures, scripts, and reports remain tracked.

The README was rewritten around:

- concise problem statement,
- workflow diagram,
- backward-edge diagram,
- install instructions,
- usage examples,
- docs links,
- eval evidence table,
- “What Freeflow Is Not,”
- MIT license notice.

Workflow docs were updated with a compact Mermaid workflow map and a backward-edge diagram.

Reference files were added or adjusted for:

- `write-spec/references/spec-shapes.md`
- `handoff/references/templates.md`
- `grill-context/references/approach-framing.md`
- `workflow/references/workflow-map.md`

The `grill-context` behavior was corrected so questions come before recommendations when the user’s answer is needed to avoid premature guidance.

## Verification Already Done

Local verification passed after the single-runtime cleanup:

```text
find plugins/freeflow .agents .claude-plugin -name '*.json' -print0 | xargs -0 -n1 jq empty
```

```text
python3 /Users/mohammedhassanmohiddin/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/freeflow
```

```text
plugins/freeflow/evals/scripts/audit-command-surface.sh
```

Command-surface audit result:

```text
Command surface audit passed: 13 direct skill calls, 2 developer skill calls, 3 mode commands, native slash handlers disabled.
```

```text
git diff --check
```

A temporary Codex marketplace test passed with the current layout:

- Temporary marketplace pointed to a copy of the repo.
- Marketplace source path used `./plugins/freeflow`.
- `codex plugin list` showed Freeflow as available under the temporary marketplace.
- The temporary marketplace was removed afterward.

Generated eval run output is ignored under:

```text
plugins/freeflow/evals/runs/
```

## Current Install Commands

Codex:

```bash
codex plugin marketplace add https://github.com/hassan-mohiddin/freeflow.git
codex plugin marketplace upgrade freeflow
codex plugin add freeflow@freeflow
codex plugin list | rg freeflow
```

If the marketplace is already added:

```bash
codex plugin marketplace upgrade freeflow
codex plugin add freeflow@freeflow
codex plugin list | rg freeflow
```

Claude Code:

```text
/plugin marketplace add hassan-mohiddin/freeflow
/plugin install freeflow
```

or:

```text
/plugin install hassan-mohiddin/freeflow
```

## How To Make Changes Going Forward

Treat `plugins/freeflow/` as the runtime source of truth.

For skill behavior changes:

1. Edit the relevant `plugins/freeflow/skills/<skill>/SKILL.md`.
2. Update or add a reference only if it prevents real drift or keeps the skill file short.
3. Update `plugins/freeflow/command-surface.json` only if the command surface changes.
4. Add or update eval prompts/fixtures/registries when behavior changes materially.
5. Add or update reports after running the relevant eval.
6. Run JSON validation, plugin validation, command-surface audit, and `git diff --check`.
7. Commit the runtime, docs, and eval report together.
8. Push to `origin/main`.
9. Run `codex plugin marketplace upgrade freeflow` in a consumer environment before testing install behavior.

For docs changes:

- Use root `docs/` for project planning, current state, design notes, research, handoffs, and durable development decisions.
- Use `plugins/freeflow/docs/` for refined user-facing plugin docs.
- Keep README short and install-focused.
- Avoid duplicating long explanations across README, root docs, and plugin docs. Link instead.

For publishing changes:

- Keep `.agents/plugins/marketplace.json` pointing to `./plugins/freeflow`.
- Keep `.claude-plugin/marketplace.json` pointing to `./plugins/freeflow`.
- Keep plugin version in both manifests aligned:
  - `plugins/freeflow/.codex-plugin/plugin.json`
  - `plugins/freeflow/.claude-plugin/plugin.json`
- Do not add native slash handlers unless the runtime truly supports them and evals cover them.
- Do not add hooks or CLI enforcement until skill wording and evals prove enforcement is needed.

## Path Forward

Immediate next work:

1. Install Freeflow from the GitHub marketplace in a separate Codex environment.
2. Install Freeflow from the GitHub marketplace in Claude Code.
3. Dogfood Freeflow in a real repo, starting with Orchestra as the user suggested.
4. Record any install or behavior failures as docs/eval follow-up, not ad hoc memory.
5. Decide whether to tag `v0.1.0` and create a GitHub release after install smoke tests pass.

Likely next cleanup:

- Organize eval directories if the current eval layout becomes hard to navigate.
- Keep old research/historical docs in root `docs/` unless the user explicitly decides on a new archive policy.
- Add clearer release smoke-test runbook if install testing exposes repeated steps.
- Consider a short old-Orchestra README note after Freeflow is confirmed installable and dogfooded.

Do not do task 7/tag/release until Hassan explicitly asks.

## Known Non-Goals For v0.1

- No native slash-command runtime.
- No hooks.
- No CLI enforcement.
- No old Orchestra command compatibility.
- No generated package mirror.
- No broad public announcement before GitHub install and dogfood pass.

## Suggested Skills For Future Agents

- Use `workflow` for normal Freeflow development tasks.
- Use `strict-workflow` for publishing, manifests, install behavior, GitHub release, compatibility, or destructive repo operations.
- Use `write-spec` before changing public behavior or install semantics.
- Use `write-plan` before multi-file runtime/docs/eval changes.
- Use `execute-plan` when implementing an approved plan.
- Use `review-work` and `verify-work` before claiming completion.
- Use `commit-work` before commits.
- Use `handoff` when creating continuation memory.
- Use `skill-creator` when changing skill trigger descriptions, structure, or eval methodology.

## Important Guardrails

- Handoffs are memory, not authority.
- Live repo evidence overrides stale docs.
- User instruction overrides all docs.
- Do not silently choose user-owned decisions.
- Do not turn Freeflow into a heavy process system.
- Do not let README, plugin docs, root docs, manifests, and command-surface metadata drift after behavior changes.
