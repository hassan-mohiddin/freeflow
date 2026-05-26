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

Register the marketplace:

```bash
/plugin marketplace add hassan-mohiddin/freeflow
/plugin install freeflow
```

Or install directly from GitHub:

```bash
/plugin install hassan-mohiddin/freeflow
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

## Modes

- `conversation`: answer, explain, or discuss without workflow pressure.
- `workflow`: default for consequential work; scale process to risk.
- `strict-workflow`: high-risk or hard-to-reverse work with stronger gates.

## Evidence

Freeflow v0.1 passed the local acceptance suite after measured fixes:

- source-truth conflicts stop before edits
- strict public API specs ask for owner decisions
- execution stops when verification reveals a bad plan
- commit flow refuses mixed staged sensitive changes
- decision capture asks before inventing memory conventions
- bypass skips ceremony, not judgment

Full eval reports live in the development repository and are not shipped in this runtime package.

## What Freeflow Is Not

- not a new agent
- not a CLI framework
- not a hook system
- not old Orchestra with a smaller README
- not a replacement for Matt's skills or Superpowers

It is the lightweight workflow layer between them.
