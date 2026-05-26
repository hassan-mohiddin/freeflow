# Freeflow Prepublish Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Pilot Workflow to Freeflow across the dev workspace, create a clean publishable package, reorganize eval evidence, and update durable docs for a Codex/Claude-first public release.

**Architecture:** Keep the Research repo as the development and evidence workspace, but add `packages/freeflow/` as the clean publishable plugin package. Rename current product identity to Freeflow across tracked content, including the dev plugin path and old candidate wording in docs/reports. Reorganize eval metadata and reports without deleting evidence.

**Tech Stack:** Markdown docs, Codex/Claude plugin manifests, local shell/JQ validation, existing fixture eval harness.

---

## File Structure

- Modify: `docs/freeflow-packaging-and-publishing-design.md` to reflect approved dev-space rename.
- Modify: `AGENTS.md`, `CONTEXT.md`, and current durable docs under `docs/` to use Freeflow as current identity.
- Move/rename: `plugins/pilot-workflow/` to `plugins/freeflow/`.
- Move/rename: `plugins/freeflow/skills/setup-pilot-workflow/` to `plugins/freeflow/skills/setup-freeflow/`.
- Create: `packages/freeflow/` as the clean publishable package.
- Create: `packages/freeflow/README.md`, `LICENSE`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.
- Create: `packages/freeflow/skills/workflow/references/workflow-map.md` with a simple full-pipeline diagram and backward loops.
- Create: `spec-shapes`, `handoff templates`, and `approach-framing` references for the three previously recommended skills.
- Modify: workflow skill to reference `references/workflow-map.md`.
- Reorganize: `plugins/freeflow/evals/` into clearer registry/report/runbook structure while preserving fixtures and reports.
- Update: scripts and docs that reference `plugins/pilot-workflow`.

## Task 1: Update Design Commit For Approved Rename

**Files:**
- Modify: `docs/freeflow-packaging-and-publishing-design.md`

- [ ] **Step 1: Inspect current design**

Run:

```sh
sed -n '1,220p' docs/freeflow-packaging-and-publishing-design.md
```

Expected: doc states Freeflow package direction and includes dev rename.

- [ ] **Step 2: Verify no optional `setup-pilot-workflow` decision remains**

Run:

```sh
rg -n 'Whether to preserve `setup-pilot-workflow`|optional|Pilot Workflow' docs/freeflow-packaging-and-publishing-design.md
```

Expected: no unresolved optional rename decision.

- [ ] **Step 3: Commit design update**

Run:

```sh
git add docs/freeflow-packaging-and-publishing-design.md docs/superpowers/plans/2026-05-26-freeflow-prepublish-cleanup.md
git commit -m "Plan Freeflow prepublish cleanup"
```

Expected: commit succeeds.

## Task 2: Rename Development Plugin Path And Product Identity

**Files:**
- Move: `plugins/pilot-workflow/` -> `plugins/freeflow/`
- Move: `plugins/freeflow/skills/setup-pilot-workflow/` -> `plugins/freeflow/skills/setup-freeflow/`
- Modify: scripts, docs, and manifests that reference `plugins/pilot-workflow`
- Modify: `.gitignore`

- [ ] **Step 1: Move the plugin directory**

Run:

```sh
git mv plugins/pilot-workflow plugins/freeflow
git mv plugins/freeflow/skills/setup-pilot-workflow plugins/freeflow/skills/setup-freeflow
```

Expected: Git records a directory rename.

- [ ] **Step 2: Update path references**

Run:

```sh
rg -l 'plugins/pilot-workflow|pilot-workflow|Pilot Workflow|setup-pilot-workflow' AGENTS.md CONTEXT.md docs plugins/freeflow .gitignore | sort
```

Edit all current-product references:

- `plugins/pilot-workflow` -> `plugins/freeflow`
- `pilot-workflow` -> `freeflow`
- `Pilot Workflow` -> `Freeflow`
- `setup-pilot-workflow` -> `setup-freeflow`

Rewrite old research, handoff, and report text too. The requirement is no old candidate identity in tracked content.

- [ ] **Step 3: Update gitignore**

Replace:

```gitignore
plugins/pilot-workflow/evals/runs/
```

With:

```gitignore
plugins/freeflow/evals/runs/
```

- [ ] **Step 4: Validate no current-path references remain**

Run:

```sh
rg -n 'plugins/pilot-workflow|pilot-workflow|Pilot Workflow|setup-pilot-workflow' AGENTS.md CONTEXT.md docs plugins/freeflow .gitignore
```

Expected: no matches. If any tracked text still uses the old identity, fix it.

- [ ] **Step 5: Run command-surface audit from new path**

Run:

```sh
plugins/freeflow/evals/scripts/audit-command-surface.sh
```

Expected: audit passes using `plugins/freeflow`.

- [ ] **Step 6: Commit rename**

Run:

```sh
git add -A
git commit -m "Rename Pilot Workflow to Freeflow"
```

Expected: commit succeeds.

## Task 3: Add Workflow Map Reference

**Files:**
- Create: `plugins/freeflow/skills/workflow/references/workflow-map.md`
- Modify: `plugins/freeflow/skills/workflow/SKILL.md`

- [ ] **Step 1: Create workflow map reference**

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

- [ ] **Step 2: Link from workflow skill**

In `plugins/freeflow/skills/workflow/SKILL.md`, add a concise line:

```markdown
Read `references/workflow-map.md` when the user asks for the full pipeline, public docs need a figure, or the next workflow entry point is unclear.
```

- [ ] **Step 3: Check skill length**

Run:

```sh
wc -l plugins/freeflow/skills/workflow/SKILL.md
```

Expected: under 100 lines.

- [ ] **Step 4: Commit workflow map**

Run:

```sh
git add plugins/freeflow/skills/workflow
git commit -m "Add Freeflow workflow map"
```

Expected: commit succeeds.

## Task 4: Add Three Recommended References

**Files:**
- Create: `plugins/freeflow/skills/write-spec/references/spec-shapes.md`
- Create: `plugins/freeflow/skills/handoff/references/templates.md`
- Create: `plugins/freeflow/skills/grill-context/references/approach-framing.md`
- Modify: `plugins/freeflow/skills/write-spec/SKILL.md`
- Modify: `plugins/freeflow/skills/handoff/SKILL.md`
- Modify: `plugins/freeflow/skills/grill-context/SKILL.md`

- [ ] **Step 1: Add spec shapes reference**

Create `plugins/freeflow/skills/write-spec/references/spec-shapes.md` with concise shapes for:

- product spec
- technical design
- public API spec
- migration spec
- decision note

Each shape should be a short section list, not a full template.

- [ ] **Step 2: Add handoff templates reference**

Create `plugins/freeflow/skills/handoff/references/templates.md` with short handoff shapes for:

- continuation handoff
- blocked handoff
- review handoff
- eval/run handoff

Each template must omit volatile file inventories unless they are necessary for resumption.

- [ ] **Step 3: Add approach framing reference**

Create `plugins/freeflow/skills/grill-context/references/approach-framing.md` with concise framing patterns:

- options with recommendation
- reversible versus hard-to-reverse choice
- owner decision versus implementation detail
- source-truth conflict
- strict-workflow escalation

- [ ] **Step 4: Link references from skill bodies**

Add one line to each relevant `SKILL.md` telling the agent when to read the reference. Keep all three skill files under 100 lines.

- [ ] **Step 5: Verify lengths**

Run:

```sh
wc -l plugins/freeflow/skills/write-spec/SKILL.md plugins/freeflow/skills/handoff/SKILL.md plugins/freeflow/skills/grill-context/SKILL.md
```

Expected: all under 100 lines.

- [ ] **Step 6: Commit references**

Run:

```sh
git add plugins/freeflow/skills/write-spec plugins/freeflow/skills/handoff plugins/freeflow/skills/grill-context
git commit -m "Add Freeflow publishing references"
```

Expected: commit succeeds.

## Task 5: Create Clean Publishable Package

**Files:**
- Create: `packages/freeflow/`
- Copy: current skill set from `plugins/freeflow/skills/`
- Create: package manifests and public docs

- [ ] **Step 1: Create package directories**

Run:

```sh
mkdir -p packages/freeflow/.codex-plugin packages/freeflow/.claude-plugin packages/freeflow/docs
cp -R plugins/freeflow/skills packages/freeflow/skills
```

Expected: package contains only skills and package metadata directories.

- [ ] **Step 2: Create Codex manifest**

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

- [ ] **Step 3: Create Claude manifest and marketplace**

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

- [ ] **Step 4: Create README in Matt style**

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

See the development report in the Research repo: `plugins/freeflow/evals/v0.1-acceptance-report.md`.

## What Freeflow is not

- not a new agent
- not a CLI framework
- not a hook system
- not old Orchestra with a smaller README
- not a replacement for Matt's skills or Superpowers

It is the lightweight workflow layer between them.
```

- [ ] **Step 5: Create LICENSE and CHANGELOG**

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

- [ ] **Step 6: Validate package JSON**

Run:

```sh
jq empty packages/freeflow/.codex-plugin/plugin.json
jq empty packages/freeflow/.claude-plugin/plugin.json
jq empty packages/freeflow/.claude-plugin/marketplace.json
```

Expected: all parse.

- [ ] **Step 7: Commit package scaffold**

Run:

```sh
git add packages/freeflow
git commit -m "Package Freeflow plugin"
```

Expected: commit succeeds.

## Task 6: Reorganize Eval Evidence

**Files:**
- Modify: `plugins/freeflow/evals/`
- Modify: eval runner scripts if paths move
- Modify: docs that link eval files

- [ ] **Step 1: Create eval subdirectories**

Run:

```sh
mkdir -p plugins/freeflow/evals/registries plugins/freeflow/evals/reports/by-skill plugins/freeflow/evals/reports/by-command-surface plugins/freeflow/evals/reports/iterations plugins/freeflow/evals/runbooks plugins/freeflow/evals/suites
```

- [ ] **Step 2: Move registries**

Run:

```sh
git mv plugins/freeflow/evals/fixture-evals.json plugins/freeflow/evals/registries/fixture-evals.json
git mv plugins/freeflow/evals/evals.json plugins/freeflow/evals/registries/legacy-evals.json
git mv plugins/freeflow/evals/handoff-evals.json plugins/freeflow/evals/registries/handoff-evals.json
git mv plugins/freeflow/evals/verify-work-evals.json plugins/freeflow/evals/registries/verify-work-evals.json
git mv plugins/freeflow/evals/adversarial-evals.json plugins/freeflow/evals/registries/adversarial-evals.json
```

- [ ] **Step 3: Move reports, runbooks, suites**

Run:

```sh
git mv plugins/freeflow/evals/iteration-*-report.md plugins/freeflow/evals/reports/iterations/
git mv plugins/freeflow/evals/command-surface-*-report.md plugins/freeflow/evals/reports/by-command-surface/
git mv plugins/freeflow/evals/*-report.md plugins/freeflow/evals/reports/by-skill/
git mv plugins/freeflow/evals/*runbook.md plugins/freeflow/evals/runbooks/
git mv plugins/freeflow/evals/v0.1-acceptance-suite.md plugins/freeflow/evals/suites/v0.1-acceptance-suite.md
```

If a broad wildcard fails because no files remain in the source directory, continue after confirming all reports have moved.

- [ ] **Step 4: Update scripts for new registry path**

In `plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh`, change default registry from:

```sh
$plugin_root/evals/fixture-evals.json
```

To:

```sh
$plugin_root/evals/registries/fixture-evals.json
```

Update any docs/scripts that reference moved registry/report/runbook/suite paths.

- [ ] **Step 5: Add eval README**

Create `plugins/freeflow/evals/README.md`:

```markdown
# Freeflow Evals

- `registries/`: eval definitions.
- `fixtures/`: tiny repo fixtures used by fixture evals.
- `prompts/`: prompts referenced by registries.
- `scripts/`: local runners and audits.
- `reports/by-skill/`: skill-family eval reports.
- `reports/by-command-surface/`: slash-style command routing reports.
- `reports/iterations/`: early broad iteration reports.
- `runbooks/`: how to run specific eval families.
- `suites/`: curated release or acceptance suites.
- `runs/`: ignored generated output.

Use `registries/fixture-evals.json` for current adversarial fixture coverage. Prefer the latest acceptance report over old smoke evals when evidence conflicts.
```

- [ ] **Step 6: Verify eval registry and acceptance IDs**

Run:

```sh
jq empty plugins/freeflow/evals/registries/fixture-evals.json
plugins/freeflow/evals/scripts/audit-command-surface.sh
```

Expected: JSON parses and audit passes.

- [ ] **Step 7: Commit eval organization**

Run:

```sh
git add -A plugins/freeflow/evals docs AGENTS.md CONTEXT.md
git commit -m "Organize Freeflow eval evidence"
```

Expected: commit succeeds.

## Task 7: Consolidate Core Docs And Durable Memory

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTEXT.md`
- Modify/create: concise docs under `docs/`

- [ ] **Step 1: Identify current read-first docs**

Run:

```sh
sed -n '1,160p' AGENTS.md
sed -n '1,180p' CONTEXT.md
```

Expected: both describe Freeflow, not Pilot Workflow.

- [ ] **Step 2: Create concise current-state doc**

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

- [ ] **Step 3: Reduce read-first list**

Update `AGENTS.md` read-first guidance to point at:

- `CONTEXT.md`
- `docs/freeflow-current-state.md`
- `docs/freeflow-packaging-and-publishing-design.md`
- latest acceptance report under `plugins/freeflow/evals/reports/`
- `docs/adr/`

Move older research docs into "History / research, not current authority."

- [ ] **Step 4: Update CONTEXT.md**

Make `CONTEXT.md` describe Freeflow's durable language:

- exactly three modes
- source-truth conflict rule
- backward edge rule
- eval-before-hooks rule
- Freeflow package/dev paths

Do not include volatile task inventory.

- [ ] **Step 5: Search old active identity**

Run:

```sh
rg -n 'Pilot Workflow|pilot-workflow|plugins/pilot-workflow|setup-pilot-workflow' AGENTS.md CONTEXT.md docs plugins/freeflow packages/freeflow
```

Expected: no matches in tracked content.

- [ ] **Step 6: Commit durable docs**

Run:

```sh
git add AGENTS.md CONTEXT.md docs
git commit -m "Update Freeflow durable docs"
```

Expected: commit succeeds.

## Task 8: Final Verification

**Files:**
- No planned edits unless verification exposes broken paths.

- [ ] **Step 1: Validate JSON**

Run:

```sh
find plugins/freeflow packages/freeflow -name '*.json' -print0 | xargs -0 -n1 jq empty
```

Expected: all JSON parses.

- [ ] **Step 2: Run audits**

Run:

```sh
plugins/freeflow/evals/scripts/audit-command-surface.sh
git diff --check
```

Expected: both pass.

- [ ] **Step 3: Run v0.1 acceptance suite from renamed path**

Run the suite in `plugins/freeflow/evals/runs/freeflow-prepublish/` using the moved registry path.

Expected: required fixture evals pass semantically, especially `WSP-006`, `CAP-002`, and `XPL-004`.

- [ ] **Step 4: Check package cleanliness**

Run:

```sh
find packages/freeflow -maxdepth 4 -type f | sort
rg -n 'Pilot Workflow|pilot-workflow|plugins/pilot-workflow|setup-pilot-workflow' packages/freeflow
```

Expected: package contains only publishable assets and no old identity references.

- [ ] **Step 5: Final commit if needed**

- [ ] **Step 5: Confirm old identity is gone from tracked content**

Run:

```sh
rg -n 'Pilot Workflow|pilot-workflow|plugins/pilot-workflow|setup-pilot-workflow' .
```

Expected: no matches except `.git` internals if searched accidentally. If there are tracked matches, update them.

- [ ] **Step 6: Final commit if needed**

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
