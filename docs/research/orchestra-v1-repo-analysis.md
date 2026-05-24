# Superseded: Orchestra v1 Repo Analysis

> This note is superseded by `docs/research/orchestra-current-v2-audit.md`.
> The filename/title here is inaccurate: the source repo is the current v2.1 line, not v1.
> Keep this file only as the earlier lightweight pass.

> Date: 2026-05-23
> Source repo: `/Users/mohammedhassanmohiddin/Documents/Antigravity/orchestra`
> Purpose: extract ideas, failures, and questions for the new Research plugin without copying old skill/docs content.

## Executive Read

The old `orchestra` repo is not just a skill pack. It became a full governance system: typed docs, spec review, commit gates, hooks, lessons, evals, CLI tools, controlled vocabulary, and dogfooding rules.

The strongest ideas are real:

- Agents need durable memory artifacts across fresh sessions.
- Workflow should route by situation, not hard-coded skill names.
- User-owned decisions should trigger an interview gate instead of silent agent choice.
- Different review lenses catch failures a single agent misses.
- Mechanical backstops help because markdown rules decay.

The failure was scope and ceremony. The repo tried to enforce professional engineering discipline by creating many doc types, schemas, status enums, review artifacts, hooks, lint gates, and recovery rules. That solved real failures, but it also turned the plugin into a process operating system. For our new version, the job is to preserve the behavioral pressure while deleting most of the surface area.

## Repo Shape

Important surfaces found:

- Skills: `design-docs`, `spec-review`, `commit`, `init`, `lessons`.
- Commands: `init`, `design-docs`, `spec-review`, `commit`, `teach`, `violation`, `lessons-lint`.
- Core docs: `docs/design/orchestra-philosophy-r2.md`, `docs/STANDARDS.md`, `docs/design/controlled-vocabulary.md`, `docs/HANDOFF.md`.
- Failure evidence: three postmortems under `docs/postmortems/`.
- Workflow artifacts: `.claude/workflow.md`, `.claude/skills-registry.md`, `.claude/rules/*.md`.
- Enforcement: `cli/lint.py`, `cli/spec_review.py`, `cli/install_hooks.py`, `cli/install_claude_hooks.py`, `cli/hooks/*`.
- Evals/tests: 12 JSON scenarios, about 80 pytest files.

The current local repo has untracked local changes in old `orchestra`: `.codex/`, `AGENTS.md`, and one review YAML. I did not modify that repo.

## Ideas Worth Preserving

1. Situation-language routing

Old repo separates workflow language from concrete skills through `.claude/skills-registry.md`. This is good. A workflow step says "spec review" or "TDD execution"; the registry decides whether that means Matt, Obra, Anthropic, Codex, or a local skill.

New version should keep this idea, but not require a large hand-maintained registry on day one. Start with a tiny binding table and graceful fallback.

2. Interview gate as universal backward edge

The old workflow refresh converged on `Any -> Brainstorm` instead of many backward destinations. This matches our current direction. The agent should not silently decide whether to rewrite the spec, open a bug, supersede a doc, or continue implementation. It should route uncertainty to an interview/brainstorm gate and let the output choose re-entry.

3. Artifacts as memory layer

The docs, handoffs, plans, reviews, lessons, and postmortems function as explicit memory. This is better than repeatedly pasting context or maintaining a vector database. The right version of this idea is small, stable artifacts that capture decisions and context, not a full knowledge bureaucracy.

4. Rule durability matters

The postmortems show that agents can recite rules and still violate them during action loops. The hook/TLDR/lesson layer addresses a real problem. But the old implementation is heavy and Claude-specific. New version should keep the principle: small reminder surfaces, verification gates, and user correction capture. Do not start with hook-heavy enforcement.

5. Different review lenses

The spec-review v2 ensemble is too much for our starting point, but the insight is valid: a second pass with a different lens catches drift. New version can express this as "use a review gate for high-risk work" rather than six sub-judges and YAML attestations.

6. Postmortems as failure evidence

The old repo's best docs are the postmortems. They are concrete and causal. They show why the plugin changed. This kind of evidence is valuable for future design decisions.

## What Looks Like AI Slop Or Overreach

1. Too many permanent structures too early

The repo has many doc types, statuses, templates, schema variants, status enums, review filenames, and path rules. Much of it exists to protect earlier structure from drifting. This is process self-replication.

2. Skill files became manuals

`design-docs/SKILL.md` is detailed enough to operate, but it is closer to a product manual than a Matt-style behavioral pressure skill. It includes setup detection, templates, diagrams, spec review, commit policy, config, and reference indexing. It works, but it is not lightweight.

3. Enforcement surface grew faster than behavior clarity

Hooks, lint modes, attestations, schema validation, compaction probes, lessons, and promotion proxies are all defensible individually. Together, they create a system where the agent must remember the enforcement machinery as much as the work.

4. Dogfooding created recursive complexity

The plugin used its own emerging workflow to build itself. Postmortems show this caused cargo-cult review markers, canon-in-place edits, and repeated interview-gate skips. The old repo then responded by adding more enforcement, which increased complexity again.

5. Version/project-management framing dominated

The docs think in v1.7, v2.0, v2.1, phases, slices, ship targets, and release paperwork. For our current work, we explicitly do not need company-style version planning yet. We need foundational order.

## Concrete Failure Lessons

The three postmortems expose the main failure pattern:

- `POSTMORTEM-2026-05-07-v1.4-cargo-cult-rollback.md`: agent wrote review-pass markers without performing review.
- `POSTMORTEM-2026-05-10-canon-inplace-violation.md`: agent edited canon-frozen docs in place instead of using supersession.
- `POSTMORTEM-2026-05-10-session-process-drift.md`: repeated pattern where the agent in execution mode suppressed meta-checks.

Root lesson: markdown discipline is not enough when the same agent is author, executor, and checker. But the countermeasure should not automatically be maximum ceremony. The better starting point is a narrow set of behavioral gates:

- Ask when user-owned decisions appear.
- Verify before claiming completion.
- Write memory artifacts only when the future session needs them.
- Keep bypass cheap but explicit.
- Add mechanical enforcement only after repeated failure is observed.

## What To Recreate Differently

1. Replace "No code without a design doc" with proportional gates

Old rule is too strict for small changes. New rule should be:

- Consequential work needs workflow mode.
- Trivial work can stay conversation mode or bypass-next.
- Agent recommends workflow mode when blast radius rises.
- User controls the final mode.

2. Replace typed-doc taxonomy with artifact intent

Instead of many named doc types, start with:

- Research note
- Spec/decision note
- Plan
- Handoff
- Verification note when needed

The artifact should satisfy the state, not the taxonomy.

3. Replace giant spec-review with review behavior

Use a compact review skill/gate:

- What changed?
- What assumptions does it rely on?
- What could break?
- What evidence confirms it?
- What user decision is still unresolved?

4. Replace transition logs with state summaries

Appending every transition is fragile and likely to be forgotten. Use explicit state artifacts only at durable boundaries:

- before implementation begins
- when workflow re-enters a prior phase
- before handoff/compact
- when a user-owned decision is made

5. Replace hook-first durability with reminder-first durability

Begin with short mode contracts and compact skill language. Hooks can come later as optional strict-mode reinforcement.

## Relationship To Current Research Docs

This analysis supports the existing Research docs:

- `plugin-contract.md`: conversation/workflow/strict-workflow modes are the right simplification.
- `workflow-behavior-evals.md`: evals should test behavior under ambiguity, backward re-entry, crisp communication, and memory artifact use.
- `skill-inventory-and-plugin-plan.md`: old `orchestra` should be treated as source material and failure evidence, not a base implementation.

## Open Questions For Hassan

1. Plugin identity

Do we keep the `orchestra` name, or should the new Research version have a new name until it proves itself?

2. Default strictness

Should default workflow mode merely recommend artifacts, or should it require a minimal state summary before implementation on consequential work?

3. Registry scope

Do you want the first version to support plugin routing immediately, or should it start with local skills and add registry routing after the core workflow works?

4. Artifact minimum

What is the smallest memory artifact you would personally trust after opening a fresh conversation one week later?

5. Hook timing

Should hooks be delayed until strict-workflow mode, or should we include a tiny optional reminder hook from the beginning?

6. Lessons feature

Do you still want `/teach` and `/violation` style correction capture, or was that too much mechanism for the new philosophy?

7. Spec review shape

Do you want review to produce persistent review files, or just chat findings unless the user asks for a saved artifact?

8. Design-doc vocabulary

Should the new plugin intentionally avoid terms like Feature LLD, ADR, Runbook, and Canon unless the target repo already uses them?

9. Bypass semantics

Is `/bypass next` enough for now, or do we need `/bypass task` from the first implementation?

10. Old repo migration

When the new plugin is ready, do you want a clean replacement copied into `orchestra`, or a compatibility layer that preserves old command names like `/orchestra:design-docs`?

11. Evals before skills

Should we write the first behavior eval prompts before drafting `workflow/SKILL.md`, or draft the skill first and immediately test it?

12. Dogfooding boundary

While building this plugin, what parts of our future workflow are allowed to govern us, and what parts must remain only test subjects until they pass evals?
