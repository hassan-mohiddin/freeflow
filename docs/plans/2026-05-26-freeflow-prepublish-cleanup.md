# Freeflow Prepublish Cleanup Implementation Plan

> **Superseded Layout Note:** This plan records the earlier `packages/freeflow/` packaging pass. The current release layout uses the repository root as the marketplace shell and `plugins/freeflow/` as the single plugin runtime; root `docs/` holds project docs and `plugins/freeflow/docs/` holds refined user-facing docs.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Freeflow prepublish cleanup: create a clean publishable package, reorganize eval evidence, and update durable docs for a Codex/Claude-first public release.

**Architecture:** Keep the Research repo as the development and evidence workspace, but add `packages/freeflow/` as the clean publishable plugin package. Rename current product identity to Freeflow across tracked content, including the dev plugin path and old candidate wording in docs/reports. Reorganize eval metadata and reports without deleting evidence.

**Tech Stack:** Markdown docs, Codex/Claude plugin manifests, local shell/JQ validation, existing fixture eval harness.

---

## File Structure

- Modify: `docs/freeflow-packaging-and-publishing-design.md` to reflect approved dev-space identity.
- Modify: `AGENTS.md`, `CONTEXT.md`, and current durable docs under `docs/` to use Freeflow as current identity.
- Current dev plugin path: `plugins/freeflow/`.
- Current setup skill path: `plugins/freeflow/skills/setup-freeflow/`.
- Create: `packages/freeflow/` as the clean publishable package.
- Create: `packages/freeflow/README.md`, `LICENSE`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.
- Create: `packages/freeflow/skills/workflow/references/workflow-map.md` with a simple full-pipeline diagram and backward loops.
- Create: `spec-shapes`, `handoff templates`, and `approach-framing` references for the three previously recommended skills.
- Modify: workflow skill to reference `references/workflow-map.md`.
- Reorganize: `plugins/freeflow/evals/` into clearer registry/report/runbook structure while preserving fixtures and reports.
- Update: scripts and docs that reference `plugins/freeflow`.

## Task 1: Update Design Commit For Approved Identity

Status: completed.

**Files:**
- Modify: `docs/freeflow-packaging-and-publishing-design.md`

- [x] **Step 1: Inspect current design**

Run:

```sh
sed -n '1,220p' docs/freeflow-packaging-and-publishing-design.md
```

Expected: doc states Freeflow package direction and includes dev rename.

- [x] **Step 2: Verify no optional setup-skill naming decision remains**

Run:

```sh
rg -n 'Whether to preserve|optional setup|candidate identity' docs/freeflow-packaging-and-publishing-design.md
```

Expected: no unresolved optional rename decision.

- [x] **Step 3: Commit design update**

Run:

```sh
git add docs/freeflow-packaging-and-publishing-design.md docs/plans/2026-05-26-freeflow-prepublish-cleanup.md
git commit -m "Plan Freeflow prepublish cleanup"
```

Expected: commit succeeds.

## Task 2: Rename Development Plugin Path And Product Identity

Status: completed. The dev plugin now lives at `plugins/freeflow/`, the setup skill is `setup-freeflow`, `.freeflow/config.json` is the setup config path, and tracked content no longer preserves the previous candidate identity.

**Files:**
- Move: development plugin directory to `plugins/freeflow/`
- Move: setup skill directory to `plugins/freeflow/skills/setup-freeflow/`
- Modify: scripts, docs, and manifests that referenced the previous dev path
- Modify: `.gitignore`

- [x] **Step 1: Move the plugin directory**

Expected: Git records directory renames into `plugins/freeflow/`.

- [x] **Step 2: Update path references**

Edit all current-product references to the Freeflow identity.

Rewrite old research, handoff, and report text too. The requirement is no previous candidate identity in tracked content.

- [x] **Step 3: Update gitignore**

Expected: `.gitignore` ignores `plugins/freeflow/evals/runs/`.

- [x] **Step 4: Validate no previous identity references remain**

Expected: no tracked text keeps the previous candidate identity.

- [x] **Step 5: Run command-surface audit from new path**

Run:

```sh
plugins/freeflow/evals/scripts/audit-command-surface.sh
```

Expected: audit passes using `plugins/freeflow`.

- [x] **Step 6: Commit rename**

Run:

```sh
git add -A
git commit -m "Rename development plugin to Freeflow"
```

Expected: commit succeeds.

## Task 3: Add Workflow Map Reference

Status: completed.

**Files:**
- Create: `plugins/freeflow/skills/workflow/references/workflow-map.md`
- Modify: `plugins/freeflow/skills/workflow/SKILL.md`

- [x] **Step 1: Create workflow map reference**

Add `plugins/freeflow/skills/workflow/references/workflow-map.md`:

````markdown
# Freeflow Workflow Map

Use this when the user asks how the whole workflow fits together, when writing public docs, or when choosing the next skill in a multi-step task.

```text
                         +-------------------+
                         | conversation mode |
                         | answer / explain  |
                         +---------+---------+
                                   | consequential work
                                   v
 +--------------+     +--------------+     +--------------+
 | research     | --> | grill-context | --> | write-spec   |
 | research-    |     | interview-    |     | review-      |
 | brief        |     | gate          |     | artifact     |
 +------+-------+     +------+-------+     +------+-------+
       |                    |                    |
       +--------------+-----+------------+-------+
                      v                  v
              +--------------+     +--------------+
              | write-plan   | --> | execute-plan |
              +------+-------+     +------+-------+
                     |                    |
                     v                    v
              +--------------+     +--------------+
              | review-work  | --> | verify-work  |
              +------+-------+     +------+-------+
                     |                    |
                     v                    v
              +--------------+     +--------------+
              | commit-work  | --> | handoff /    |
              |              |     | capture-     |
              |              |     | decisions    |
              +--------------+     +--------------+

Backward edge from any point:

new evidence / source conflict / owner decision / failed verification
  -> clarify, research, revise spec, revise plan, diagnose, split scope, or stop
```

Common starts:

- Start at `research-brief` when the repo/domain is unknown.
- Start at `grill-context` when the feature is vague.
- Start at `write-spec` when requirements are agreed but not durable.
- Start at `write-plan` when an approved spec already exists.
- Start at `execute-plan` when an approved plan exists.
- Start at `diagnose-failure` when behavior is broken or unclear.
- Use `bypass` only to skip the next unnecessary workflow gate, not judgment or verification.
````

Expected: diagram is text-only and renders in GitHub Markdown.

- [x] **Step 2: Link from workflow skill**

In `plugins/freeflow/skills/workflow/SKILL.md`, add a concise line:

```markdown
Read `references/workflow-map.md` when the user asks for the full pipeline, public docs need a figure, or the next workflow entry point is unclear.
```

- [x] **Step 3: Check skill length**

Run:

```sh
wc -l plugins/freeflow/skills/workflow/SKILL.md
```

Expected: under 100 lines.

- [x] **Step 4: Commit workflow map**

Run:

```sh
git add plugins/freeflow/skills/workflow
git commit -m "Add Freeflow workflow map"
```

Expected: commit succeeds.

## Task 4: Add Three Recommended References

Status: completed.

**Files:**
- Create: `plugins/freeflow/skills/write-spec/references/spec-shapes.md`
- Create: `plugins/freeflow/skills/handoff/references/templates.md`
- Create: `plugins/freeflow/skills/grill-context/references/approach-framing.md`
- Modify: `plugins/freeflow/skills/write-spec/SKILL.md`
- Modify: `plugins/freeflow/skills/handoff/SKILL.md`
- Modify: `plugins/freeflow/skills/grill-context/SKILL.md`

- [x] **Step 1: Add spec shapes reference**

Create `plugins/freeflow/skills/write-spec/references/spec-shapes.md` with concise shapes for:

- product spec
- technical design
- public API spec
- migration spec
- decision note

Each shape should be a short section list, not a full template.

- [x] **Step 2: Add handoff templates reference**

Create `plugins/freeflow/skills/handoff/references/templates.md` with short handoff shapes for:

- continuation handoff
- blocked handoff
- review handoff
- eval/run handoff

Each template must omit volatile file inventories unless they are necessary for resumption.

- [x] **Step 3: Add approach framing reference**

Create `plugins/freeflow/skills/grill-context/references/approach-framing.md` with concise framing patterns:

- options with recommendation
- reversible versus hard-to-reverse choice
- owner decision versus implementation detail
- source-truth conflict
- strict-workflow escalation

- [x] **Step 4: Link references from skill bodies**

Add one line to each relevant `SKILL.md` telling the agent when to read the reference. Keep all three skill files under 100 lines.

- [x] **Step 5: Verify lengths**

Run:

```sh
wc -l plugins/freeflow/skills/write-spec/SKILL.md plugins/freeflow/skills/handoff/SKILL.md plugins/freeflow/skills/grill-context/SKILL.md
```

Expected: all under 100 lines.

- [x] **Step 6: Commit references**

Run:

```sh
git add plugins/freeflow/skills/write-spec plugins/freeflow/skills/handoff plugins/freeflow/skills/grill-context
git commit -m "Add Freeflow publishing references"
```

Expected: commit succeeds.

## Task 5: Create Clean Publishable Package

Status: completed. The package lives under `packages/freeflow/` with runtime skills, Codex metadata, Claude metadata, public README, MIT license, and changelog. The package excludes evals, research notes, handoffs, command-surface evidence, hooks, CLI tooling, and native slash handlers.

**Files:**
- Create: `packages/freeflow/`
- Copy: current skill set from `plugins/freeflow/skills/`
- Create: package manifests and public docs

- [x] **Step 1: Create package directories**

Run:

```sh
mkdir -p packages/freeflow/.codex-plugin packages/freeflow/.claude-plugin packages/freeflow/docs
cp -R plugins/freeflow/skills packages/freeflow/skills
```

Expected: package contains only skills and package metadata directories.

- [x] **Step 2: Create Codex manifest**

Create `packages/freeflow/.codex-plugin/plugin.json`:

```json
{
  "name": "freeflow",
  "version": "0.1.0",
  "description": "Lightweight workflow for coding agents.",
  "author": {
    "name": "Hassan Mohiddin"
  },
  "homepage": "https://github.com/hassan-mohiddin/freeflow",
  "repository": "https://github.com/hassan-mohiddin/freeflow",
  "license": "MIT",
  "keywords": [
    "workflow",
    "skills",
    "agents",
    "planning",
    "verification",
    "codex",
    "claude"
  ],
  "skills": "./skills/",
  "interface": {
    "displayName": "Freeflow",
    "shortDescription": "Lightweight workflow for coding agents.",
    "longDescription": "Freeflow guides coding agents through conversation, workflow, and strict-workflow modes with interview gates, source-truth checks, planning, execution, review, verification, commit discipline, handoffs, and durable decision capture.",
    "developerName": "Hassan Mohiddin",
    "category": "Coding",
    "capabilities": [
      "Interactive",
      "Read",
      "Write"
    ],
    "defaultPrompt": [
      "Use Freeflow workflow mode for this task.",
      "Keep this in conversation mode.",
      "Use strict-workflow for this risky change.",
      "Verify before claiming completion."
    ],
    "websiteURL": "https://github.com/hassan-mohiddin/freeflow",
    "privacyPolicyURL": "https://github.com/hassan-mohiddin/freeflow/blob/main/README.md",
    "termsOfServiceURL": "https://github.com/hassan-mohiddin/freeflow/blob/main/LICENSE"
  }
}
```

- [x] **Step 3: Create Claude manifest and marketplace**

Create `packages/freeflow/.claude-plugin/plugin.json`:

```json
{
  "name": "freeflow",
  "description": "Lightweight workflow for coding agents. Conversation, workflow, and strict-workflow skills for planning, execution, review, verification, handoff, and decision capture.",
  "version": "0.1.0",
  "author": {
    "name": "Hassan Mohiddin"
  },
  "homepage": "https://github.com/hassan-mohiddin/freeflow",
  "repository": "https://github.com/hassan-mohiddin/freeflow",
  "license": "MIT",
  "keywords": [
    "workflow",
    "skills",
    "agents",
    "planning",
    "verification",
    "claude-code",
    "codex"
  ]
}
```

Create `packages/freeflow/.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "freeflow",
  "description": "Lightweight workflow for coding agents.",
  "owner": {
    "name": "Hassan Mohiddin",
    "url": "https://github.com/hassan-mohiddin"
  },
  "plugins": [
    {
      "name": "freeflow",
      "description": "Conversation, workflow, and strict-workflow skills for coding agents.",
      "version": "0.1.0",
      "category": "development",
      "source": "./",
      "author": {
        "name": "Hassan Mohiddin"
      },
      "homepage": "https://github.com/hassan-mohiddin/freeflow"
    }
  ]
}
```

- [x] **Step 4: Create README in Matt style**

Create `packages/freeflow/README.md` with these sections:

```markdown
# Freeflow

Lightweight workflow for coding agents.

Most agent workflow plugins solve one side of the problem.

Matt Pocock's skills are sharp, practical, and low ceremony. They are excellent at specific engineering moves: TDD, triage, PRDs, issues, and clean handoffs.

Obra's Superpowers gives agents a strong lifecycle: brainstorm, plan, TDD, execute, review, finish. It is the best reference for disciplined forward motion.

Other workflow systems often add the missing enforcement layer: hooks, CLIs, doc taxonomies, review files, gates, schemas, and command runtimes.

The gap is the middle.

Agents need enough structure to avoid silent product decisions, source-truth rewrites, fake verification, and messy handoffs. They do not need a process operating system for every change.

Freeflow is that middle layer.

It gives Codex, Claude, and similar coding agents a portable workflow spine:

```text
conversation -> workflow -> strict-workflow
research -> grill -> spec -> review -> plan -> execute -> review -> verify -> commit -> handoff/capture
```

The important part is the backward edge:

```text
new evidence / source conflict / failed verification / owner decision
  -> clarify, research, revise spec, revise plan, diagnose, split scope, or stop
```

Freeflow is better when you want:

- less ceremony than a full governance framework
- stronger user-control gates than ordinary skill packs
- source-truth conflict handling before edits
- verification before completion claims
- handoffs and durable memory without file-inventory sludge
- one workflow layer that works across Codex and Claude

## Install

### Codex

Install from GitHub once the repo is published:

```text
/plugins
```

Search for `freeflow`, or install from the GitHub plugin source when supported by your Codex environment.

### Claude Code

Register the marketplace or install directly from GitHub:

```bash
/plugin marketplace add hassan-mohiddin/freeflow
/plugin install freeflow
```

### Other agents

Copy the `skills/` directory into the agent's skills/plugin system and make sure the agent can read `SKILL.md` files with bundled `references/`.

## Usage

Use natural language first:

```text
Use Freeflow workflow mode for this task.
Keep this in conversation mode.
Use strict-workflow for this billing change.
Verify before claiming completion.
Capture the durable decision.
```

Slash-style prompts are model-routed in v0.1:

```text
/workflow conversation
/workflow workflow
/workflow strict-workflow
/write-spec
/write-plan
/execute-plan
/verify-work
/commit-work
/handoff
```

Freeflow does not ship native slash handlers yet. The commands work as skill-routing language.

## Evidence

Freeflow v0.1 passed the local acceptance suite after measured fixes:

- source-truth conflicts stop before edits
- strict public API specs ask for owner decisions
- execution stops when verification reveals a bad plan
- commit flow refuses mixed staged sensitive changes
- decision capture asks before inventing memory conventions
- bypass skips ceremony, not judgment

See the development report in the Research repo: `plugins/freeflow/evals/reports/acceptance/v0.1-acceptance-report.md`.

## What Freeflow is not

- not a new agent
- not a CLI framework
- not a hook system
- not old Orchestra with a smaller README
- not a replacement for Matt's skills or Superpowers

It is the lightweight workflow layer between them.
```

- [x] **Step 5: Create LICENSE and CHANGELOG**

Create `packages/freeflow/LICENSE` with MIT license text using Hassan Mohiddin as copyright holder.

Create `packages/freeflow/CHANGELOG.md`:

```markdown
# Changelog

## 0.1.0 - 2026-05-26

- Initial Freeflow package.
- Ships the accepted v0.1 workflow skill set.
- Supports Codex and Claude plugin metadata.
- Keeps native slash handlers, hooks, and CLI enforcement out of scope.
```

- [x] **Step 6: Validate package JSON**

Run:

```sh
jq empty packages/freeflow/.codex-plugin/plugin.json
jq empty packages/freeflow/.claude-plugin/plugin.json
jq empty packages/freeflow/.claude-plugin/marketplace.json
```

Expected: all parse.

- [x] **Step 7: Commit package scaffold**

Run:

```sh
git add packages/freeflow
git commit -m "Package Freeflow plugin"
```

Expected: commit succeeds.

## Task 6: Reorganize Eval Evidence

Status: completed. Eval evidence now uses registries, report buckets, runbooks, suites, and a directory README. Acceptance, harness, and runtime reports have their own buckets instead of being forced into skill-family reports.

**Files:**
- Modify: `plugins/freeflow/evals/`
- Modify: eval runner scripts if paths move
- Modify: docs that link eval files

- [x] **Step 1: Create eval subdirectories**

Run:

```sh
mkdir -p plugins/freeflow/evals/registries plugins/freeflow/evals/reports/by-skill plugins/freeflow/evals/reports/by-command-surface plugins/freeflow/evals/reports/iterations plugins/freeflow/evals/reports/harness plugins/freeflow/evals/reports/acceptance plugins/freeflow/evals/reports/runtime plugins/freeflow/evals/runbooks plugins/freeflow/evals/suites
```

- [x] **Step 2: Move registries**

Run:

```sh
git mv plugins/freeflow/evals/fixture-evals.json plugins/freeflow/evals/registries/fixture-evals.json
git mv plugins/freeflow/evals/evals.json plugins/freeflow/evals/registries/legacy-evals.json
git mv plugins/freeflow/evals/handoff-evals.json plugins/freeflow/evals/registries/handoff-evals.json
git mv plugins/freeflow/evals/verify-work-evals.json plugins/freeflow/evals/registries/verify-work-evals.json
git mv plugins/freeflow/evals/adversarial-evals.json plugins/freeflow/evals/registries/adversarial-evals.json
```

- [x] **Step 3: Move reports, runbooks, suites**

Run:

```sh
git mv plugins/freeflow/evals/iteration-*-report.md plugins/freeflow/evals/reports/iterations/
git mv plugins/freeflow/evals/command-surface-*-report.md plugins/freeflow/evals/reports/by-command-surface/
git mv plugins/freeflow/evals/command-surface-matrix.md plugins/freeflow/evals/reports/by-command-surface/
git mv plugins/freeflow/evals/claude-harness-1-report.md plugins/freeflow/evals/reports/harness/
git mv plugins/freeflow/evals/eval-harness-1-report.md plugins/freeflow/evals/reports/harness/
git mv plugins/freeflow/evals/v0.1-acceptance-report.md plugins/freeflow/evals/reports/acceptance/
git mv plugins/freeflow/evals/always-on-runtime-1-report.md plugins/freeflow/evals/reports/runtime/
git mv plugins/freeflow/evals/*-report.md plugins/freeflow/evals/reports/by-skill/
git mv plugins/freeflow/evals/*runbook.md plugins/freeflow/evals/runbooks/
git mv plugins/freeflow/evals/v0.1-acceptance-suite.md plugins/freeflow/evals/suites/v0.1-acceptance-suite.md
```

If a broad wildcard fails because no files remain in the source directory, continue after confirming all reports have moved.

- [x] **Step 4: Update scripts for new registry path**

In `plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh`, change default registry from:

```sh
$plugin_root/evals/fixture-evals.json
```

To:

```sh
$plugin_root/evals/registries/fixture-evals.json
```

Update any docs/scripts that reference moved registry/report/runbook/suite paths.

- [x] **Step 5: Add eval README**

Create `plugins/freeflow/evals/README.md`:

```markdown
# Freeflow Evals

- `registries/`: eval definitions.
- `fixtures/`: tiny repo fixtures used by fixture evals.
- `prompts/`: prompts referenced by registries.
- `scripts/`: local runners and audits.
- `reports/by-skill/`: skill-family eval reports.
- `reports/by-command-surface/`: slash-style command routing reports and matrix.
- `reports/iterations/`: early broad iteration reports.
- `reports/harness/`: eval runner and harness reports.
- `reports/acceptance/`: release acceptance reports.
- `reports/runtime/`: always-on runtime evidence.
- `runbooks/`: how to run specific eval families.
- `suites/`: curated release or acceptance suites.
- `runs/`: ignored generated output.

Use `registries/fixture-evals.json` for current adversarial fixture coverage. Prefer the latest acceptance report over old smoke evals when evidence conflicts.
```

- [x] **Step 6: Verify eval registry and acceptance IDs**

Run:

```sh
jq empty plugins/freeflow/evals/registries/fixture-evals.json
plugins/freeflow/evals/scripts/audit-command-surface.sh
```

Expected: JSON parses and audit passes.

- [x] **Step 7: Commit eval organization**

Run:

```sh
git add -A plugins/freeflow/evals docs AGENTS.md CONTEXT.md
git commit -m "Organize Freeflow eval evidence"
```

Expected: commit succeeds.

## Task 7: Consolidate Core Docs And Durable Memory

Status: completed. Current-state docs now separate current release facts from historical research and handoffs. Package public docs now live under `packages/freeflow/docs/`.

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTEXT.md`
- Modify/create: concise docs under `docs/`

- [x] **Step 1: Identify current read-first docs**

Run:

```sh
sed -n '1,160p' AGENTS.md
sed -n '1,180p' CONTEXT.md
```

Expected: both describe Freeflow as the current product and do not call it a candidate.

- [x] **Step 2: Create concise current-state doc**

Create `docs/freeflow-current-state.md` with:

```markdown
# Freeflow Current State

Freeflow is a portable workflow skill pack for coding agents.

Current status:

- Name: Freeflow.
- Package target: `packages/freeflow/`.
- Development plugin: `plugins/freeflow/`.
- v0.1 local acceptance suite: passed.
- First publish targets: Codex and Claude.
- Native slash handlers: not shipped.
- Hooks/CLI enforcement: not shipped.
- Old Orchestra: prior art and failure evidence, not the release package.

Use this doc for current project status. Use research docs for history.
```

- [x] **Step 3: Reduce read-first list**

Update `AGENTS.md` read-first guidance to point at:

- `CONTEXT.md`
- `docs/freeflow-current-state.md`
- `docs/freeflow-packaging-and-publishing-design.md`
- latest acceptance report under `plugins/freeflow/evals/reports/`
- `docs/adr/`

Move older research docs into "History / research, not current authority."

- [x] **Step 4: Update CONTEXT.md**

Make `CONTEXT.md` describe Freeflow's durable language:

- exactly three modes
- source-truth conflict rule
- backward edge rule
- eval-before-hooks rule
- Freeflow package/dev paths

Do not include volatile task inventory.

- [x] **Step 5: Search old active identity**

Run:

```sh
rg -n 'candidate plugin|not final branding|pilot-workflow|setup-pilot-workflow|PILOT_WORKFLOW|\.pilot-workflow|agent-workflow-plugin' AGENTS.md CONTEXT.md docs packages/freeflow plugins/freeflow
```

Expected: no current-authority matches. Historical handoffs and research may preserve old context when clearly historical.

- [x] **Step 6: Commit durable docs**

Run:

```sh
git add AGENTS.md CONTEXT.md docs
git commit -m "Update Freeflow durable docs"
```

Expected: commit succeeds.

## Task 8: Final Verification

Status: completed. Fresh prepublish fixture runs were saved under `plugins/freeflow/evals/runs/freeflow-prepublish/`.

**Files:**
- No planned edits unless verification exposes broken paths.

- [x] **Step 1: Validate JSON**

Run:

```sh
find plugins/freeflow packages/freeflow -name '*.json' -print0 | xargs -0 -n1 jq empty
```

Expected: all JSON parses.

- [x] **Step 2: Run audits**

Run:

```sh
plugins/freeflow/evals/scripts/audit-command-surface.sh
git diff --check
```

Expected: both pass.

- [x] **Step 3: Run v0.1 acceptance suite from renamed path**

Run the suite in `plugins/freeflow/evals/runs/freeflow-prepublish/` using the moved registry path.

Expected: required fixture evals pass semantically, especially `WSP-006`, `CAP-002`, and `XPL-004`.

- [x] **Step 4: Check package cleanliness**

Run:

```sh
find packages/freeflow -maxdepth 4 -type f | sort
rg -n 'Freeflow|freeflow|plugins/freeflow|setup-freeflow' packages/freeflow
```

Expected: package contains only publishable assets. For old identity/dev-only scans, use:

```sh
rg -n 'pilot-workflow|setup-pilot-workflow|PILOT_WORKFLOW|\.pilot-workflow|plugins/freeflow/evals|Research repo|command-surface|nativeSlashHandlers' packages/freeflow
```

- [x] **Step 5: Final commit if needed**

- [x] **Step 5: Confirm old identity is gone from tracked content**

Run:

```sh
rg -n 'Freeflow|freeflow|plugins/freeflow|setup-freeflow' .
```

Expected: this command is obsolete because Freeflow is the current identity. Use targeted old-identity scans instead:

```sh
rg -n 'pilot-workflow|setup-pilot-workflow|PILOT_WORKFLOW|\.pilot-workflow|pilot_workflow' AGENTS.md CONTEXT.md docs plugins/freeflow packages/freeflow .gitignore
```

- [x] **Step 6: Final commit if needed**

Run:

```sh
git status --short
```

If verification fixes were needed:

```sh
git add -A
git commit -m "Verify Freeflow prepublish package"
```

Expected: clean worktree.

## Self-Review

- Spec coverage: covers all user requirements: publish all current skills, Matt-style README, plugin comparison, install/use docs, workflow map reference and README diagram, the three recommended references, eval reorganization with clearer report families, core docs cleanup, durable memory updates, AGENTS/CONTEXT updates, and full rename.
- Placeholder scan: no placeholder tokens remain. Open product choices are resolved in favor of Freeflow, MIT, `hassan-mohiddin/freeflow`, and package path `packages/freeflow/`.
- Type/path consistency: plan uses `plugins/freeflow/` after rename and `packages/freeflow/` for the public package.
- Risk: Task 2 and Task 5 are broad path moves. Keep them in separate commits and run audits immediately after each.

> **Superseded Layout Note:** This plan records the earlier `packages/freeflow/` packaging pass. The current release layout uses the repository root as the marketplace shell and `plugins/freeflow/` as the single plugin runtime; root `docs/` holds project docs and `plugins/freeflow/docs/` holds refined user-facing docs.
