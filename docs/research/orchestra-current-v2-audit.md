# Orchestra Current v2 Audit

> Date: 2026-05-24
> Source repo: `/Users/mohammedhassanmohiddin/Documents/Antigravity/orchestra`
> Remote: `https://github.com/hassan-mohiddin/orchestra.git`
> Purpose: mine the existing Orchestra implementation for durable ideas, failure evidence, and avoid-list items before building the new plugin.

## Research Scope

This pass is deeper than the earlier repo note.

Covered:

- Version and repo shape: git tags/log, plugin manifests, package metadata, file inventory.
- Docs: all core docs, feature docs, investigations, postmortems, bug docs by heading/root/fix pattern, workflow/rule files, standards, controlled vocabulary, handoff.
- Skills and commands: every top-level skill and slash command, plus spec-review judge prompts/rubrics.
- Code: main CLI surfaces for init, lint, spec review, PDSA, hooks, hook installers, config, vocabulary, lessons, delta review, aggregation, failure attestations, eval runner.
- Tests/evals: full test/eval inventory and representative tests across hooks, lint, PDSA, lessons, vocabulary, spec-review, install flows, integration hook emission.
- Reviews: representative high-signal review artifacts from LLD-011, LLD-012, postmortems, and codex adversarial review. I did not line-read all 74 review files because they are repetitive and lower priority per your instruction.

Not covered line-by-line:

- Every review YAML.
- Every pytest file.
- Archived historical docs with lower relevance.

## Version Correction

The previous file name `orchestra-v1-repo-analysis.md` is misleading.

Current local source signals say this is the current v2 line:

- Git tag/log: `v2.1.0` at `main`.
- `.claude-plugin/plugin.json`: `2.1.0`.
- `marketplace.json`: `2.1.0`.
- `docs/HANDOFF.md`: v2.1.0 shipped narrative.
- `pyproject.toml`: still says `1.7.0`, likely stale package metadata.

So the correct framing is not "v1 repo." It is "current v2.1 implementation, built through several incident-driven iterations."

## Executive Read

Orchestra became a full process operating system for Claude Code:

- docs taxonomy
- strict workflow
- skills registry
- design-doc generator
- spec-review ensemble
- lint policy engine
- git hooks
- Claude hooks
- lessons store
- TLDR rule injection
- compaction probes
- migration tooling
- eval runner
- many postmortem-driven bug fixes

That system contains real insight. It also demonstrates the exact failure mode we are trying to avoid: every agent failure created more process, more permanent vocabulary, more files, more schema, more hooks, and more things the agent had to remember.

The old repo is not trash. It is a failure database plus a library of useful primitives. We should not copy its skill files or workflow wholesale.

## Architecture Map

Core docs:

- `README.md`: public positioning. Stale compared to v2.1; still reads partly v1/roadmap.
- `docs/design/orchestra-philosophy-r2.md`: strongest strategic design doc. Defines situation-language orchestration, plugin registry, generalizability, progressive disclosure, and formal vocabulary.
- `docs/STANDARDS.md`: full doc taxonomy and lifecycle rules.
- `docs/design/controlled-vocabulary.md`: central enum/path/naming canon.
- `docs/HANDOFF.md`: large session memory and release history.

Workflow/rules:

- `.claude/workflow.md`: ordered flow with backward edges, especially any step back to brainstorm.
- `.claude/skills-registry.md`: situation to skill binding table.
- `.claude/rules/interview-gate.md`: strong low-context/user-decision stop rule.
- `.claude/rules/documentation-gate.md`: hard "no code without doc/review" law.

Skills:

- `design-docs`: comprehensive docs-first operating manual.
- `spec-review`: multi-judge review workflow.
- `commit`: commit discipline and hook use.
- `init`: setup/bootstrap wrapper.
- `lessons`: teach/violation/lessons-lint correction capture.

Implementation:

- `cli/lint.py`: policy engine for docs, commit messages, canon-frozen edits, refs, review naming, status vocab, changelog requirements.
- `cli/spec_review.py`: attestation writer/validator and v1/v2 review dispatcher.
- `cli/pdsa.py`: deterministic pre-dispatch audit before subjudge review.
- `cli/install_hooks.py`: git hook installer with framework detection and rollback.
- `cli/install_claude_hooks.py` plus `cli/hooks/*`: Claude hook reminders and compaction preservation.
- `cli/lessons_*`: append-only correction store, recurrence scan, proxy mutation, apply after review.
- `eval/run.py`: JSON scenario runner.

## What Was Strong

### 1. Situation Language

The registry idea is excellent. The workflow says "review," "diagnose," "write plan," or "handoff"; the registry binds that situation to Matt, Obra, Anthropic, Codex, or local skills.

This keeps the workflow portable. It also avoids hardcoding one creator's plugin into the methodology.

New plugin should keep this, but smaller:

- start with a tiny optional registry
- allow natural-language invocation
- let direct skill calls work
- avoid large setup requirements

### 2. Interview Gate

`.claude/rules/interview-gate.md` is one of the best old artifacts.

The rule is clear: stop before silent decisions, low-context assumptions, ambiguous scope, broad blast-radius choices, and plateau loops.

This maps directly to our current philosophy:

- user owns decisions
- agent can recommend
- agent should not silently choose
- interview gate can fire from any state

This should be a core new skill or core rule.

### 3. Backward Flow

The old workflow refresh already converged on the same state-machine idea we discussed: ordered forward flow, but legal backward re-entry when evidence invalidates the current state.

Important old lesson: do not create many backward edges. Use one primitive:

`re-enter brainstorm / clarify`

That avoids turning workflow into a complicated state machine.

### 4. Artifacts As Memory

The old docs are effectively an agent memory layer.

This part is valuable:

- handoffs preserve context across fresh sessions
- specs preserve decisions
- plans preserve intended execution
- reviews preserve risk findings
- postmortems preserve failure causes

The new plugin should keep artifacts, but make them proportional. Artifact creation should happen at durable boundaries, not every state transition.

### 5. Review By Lens

Spec-review v2 is too heavy, but the core idea is good: one generic reviewer misses things. Separate lenses find different defects.

The six old lenses were:

- structure
- semantic
- gate-compliance
- adversarial
- repo-context
- architectural-fit

For the new plugin, this can become a lightweight review posture:

- Is it structurally complete?
- Is it semantically clear?
- What could break?
- Does it fit the repo/domain?
- What evidence verifies it?

No default YAML ensemble needed.

### 6. TLDR Compression

LLD-012's TLDR rule sections are a good response to context decay.

Useful constraints:

- short nonnegotiables
- limited bullet count
- repeated reminder surfaces
- long body remains available for deeper context

This resembles Matt-style skill design: small high-leverage pressure at trigger time, detail available only when needed.

## What Became Too Heavy

### 1. Documentation Gate Absolutism

The rule "no code without committed design doc, spec review, and user approval" protects big work, but it is too strict as a default.

It creates friction for:

- small fixes
- exploratory conversations
- local prototypes
- quick research
- low-risk edits

New plugin should use proportionality:

- conversation mode: no workflow pressure
- workflow mode: default guidance and gates for consequential work
- strict-workflow mode: hard reinforcement

### 2. Taxonomy Expansion

The old repo has many doc types, required sections, status enums, filename grammars, review filename rules, and canon-frozen lifecycle rules.

This fixed vocabulary drift, but it also created a large surface that then needed linting, migration, and review rules.

New plugin should start from artifact intent, not taxonomy:

- research note
- decision/spec note
- plan
- handoff
- verification note

Repo-specific names can be configured later.

### 3. Policy Engine Gravity

`cli/lint.py` is impressive, but it shows gravity:

- every rule becomes a parser
- every parser gets exceptions
- every exception needs tests
- every test creates a new process surface

This is appropriate only after repeated failures prove the rule needs enforcement.

New plugin should not begin with a full policy engine.

### 4. Hook-First Durability

Claude hooks solve real rule-decay problems, but they bring their own risk:

- platform-specific behavior
- local interpreter fragility
- security concerns from committed hook settings
- hidden runtime latency
- corrupted state files
- hook trust boundary issues

The new plugin should start reminder-first and behavior-eval-first. Hooks can be optional strict-mode reinforcement later.

### 5. Review Attestation Overhead

Persistent YAML review files are useful for strict audit trails. They are too expensive as the default review output.

The old reviews caught real problems, but also generated large artifact chains. For day-to-day use, chat findings plus optional saved review is probably enough.

### 6. Dogfooding Paradox

The postmortems show the bootstrap problem clearly:

- agent used emerging workflow to build workflow
- agent wrote review markers without actually reviewing
- agent skipped gates while fixing gates
- each failure added more rules

New plugin development should use external, minimal guardrails until the workflow proves itself through evals.

## Code Quality Observations

Strong implementation choices:

- good use of atomic writes in multiple places
- repo-root discovery fixed after BUG-019
- hook installers preserve third-party entries
- rollback exists for pre-commit config apply
- schema validation exists for attestations
- tests cover many regression cases
- controlled vocabulary parser fails loudly

Weak or non-portable areas:

- eval scenarios hardcode Hassan's local paths and old Python environment
- `eval/run.py` uses `shell=True` for JSON commands; acceptable as local eval harness, not reusable plugin core
- version metadata drift exists (`pyproject.toml` vs plugin manifests)
- old README is stale relative to v2.1
- hooks and settings are Claude-specific
- review artifacts are numerous and hard to scan

## Test/Eval Read

The old repo has broad pytest coverage. Representative intent:

- init scaffolds docs/config/idempotently
- config validates modes/presets/doc paths
- lint blocks missing refs, canon-frozen edits, bad filenames, bad vocab, stale review references
- PDSA blocks dispatch before LLM review
- spec-review validates schema, integrity, v1/v2 formats, subjudge behavior, delta review, provenance, failure attestations
- hooks install/verify/uninstall and preserve other plugin hooks
- TLDR extractor enforces short reminder sections
- UserPromptSubmit reinjects every N turns
- lessons_lint detects recurring violations and drafts proxy artifacts

The tests prove the old system is engineered. They also prove the surface area is large.

## Review Artifact Read

The sampled review files show that the review machinery caught real issues:

- unclear success criteria
- unsupported empirical claims
- tool-scope contradictions
- insecure hook assumptions
- attestation forgery risk
- non-deterministic compaction probes
- over-trust in regex sanitization
- vendor/model single point of failure
- iteration/review bypasses

This is the best argument for retaining a review gate. It is not an argument for retaining the whole YAML ensemble by default.

## What To Carry Forward

Carry forward:

- modes: conversation, workflow, strict-workflow
- universal interview gate
- ordered workflow with backward re-entry
- artifact-as-memory philosophy
- situation-language routing
- small registry
- concise skill writing
- review by lens
- verification before claims
- handoff before context loss
- optional strict reinforcement later

Do not carry forward by default:

- hard "no code without design doc"
- full doc taxonomy
- controlled vocabulary canon
- review YAML attestations
- transition log for every state change
- Claude hook installation
- lessons auto-promotion
- large CLI policy engine
- version/ship ceremony
- dogfooding as proof

## Recommended New Build Order

1. Write the mode contract.

Define conversation, workflow, and strict-workflow in one small doc or skill. The contract should say when each mode applies, how user overrides work, and when the agent should recommend switching modes.

2. Build the interview gate.

This is foundational. It can fire anywhere. It prevents silent decisions and converts uncertainty into user-owned context.

3. Build the workflow skill.

Keep it small:

- clarify/research
- spec/decision
- plan
- execute
- review
- verify
- handoff

Allow backward re-entry to clarify/research from any state.

4. Build the memory artifacts.

Only define minimum useful artifacts:

- context note
- decision/spec
- plan
- handoff
- verification summary

Avoid heavy templates at first.

5. Build behavior evals.

Before hooks or CLI enforcement, test the behavior:

- ambiguous user request triggers interview gate
- small request stays conversation mode
- consequential task enters workflow mode
- implementation surprise re-enters clarification
- agent does not create unnecessary docs
- handoff preserves enough memory for a fresh session
- response remains crisp

6. Add optional strict mode.

Strict mode can later use checklists, saved reviews, stronger verification, and maybe hooks. It should not be the default build path.

## Questions For Hassan

1. Should the new plugin keep the `orchestra` name immediately, or use a fresh internal name until it proves itself?

2. Should old `/orchestra:*` command names be preserved as compatibility shims, or should the new plugin intentionally break from old command names?

3. What is the smallest artifact you would trust as memory when opening a fresh conversation one week later?

4. Should review findings persist by default, or only when the user asks for a saved review artifact?

5. Should `/teach` and `/violation` exist in the new plugin at all, or should correction capture wait until strict mode?

6. Should strict-workflow mode include hooks eventually, or should hooks remain a separate optional plugin?

7. Should the first implementation target Claude/Codex compatibility equally, or optimize for one agent first and generalize later?

8. Should the old repo be archived after replacement, or should the new plugin be copied over as v3 with a short migration note?

9. For our own development of this plugin, what minimal external process do you want us to follow so we avoid the dogfooding paradox?

## Bottom Line

The old Orchestra is valuable because it records what failed under real agent use. Its best ideas are behavioral and small: ask before silent decisions, route by situation, preserve memory at boundaries, review high-risk work, and verify before claiming.

The parts to avoid are the accumulated enforcement machinery. New Orchestra should start as a small set of sharp behavioral skills, not a governance platform.
