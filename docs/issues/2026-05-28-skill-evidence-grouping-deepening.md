# Skill Evidence Grouping Deepening

> **Date:** 2026-05-28
> **Type:** Issue
> **Status:** Open
> **Area:** Freeflow eval evidence

## Summary

Freeflow's skill evidence is shallow because evidence for one skill is spread across eval registries, prompt files, fixture roots, command-surface metadata, suites, reports, and generated runs.

Deepen this into one skill evidence grouping module with a small maintainer-facing interface and source-specific adapters.

## Evidence

Discovery artifact:

- [Architecture review candidates](artifacts/2026-05-28-architecture-review-candidates.html)

Focused interface review:

- [Skill evidence grouping interface review](artifacts/2026-05-28-skill-evidence-grouping-interface-review.html)

Current files:

- `evals/README.md`
- `evals/registries/fixture-evals.json`
- `evals/registries/verify-work-evals.json`
- `evals/registries/handoff-evals.json`
- `command-surface.json`
- `evals/suites/v0.1-acceptance-suite.md`
- `evals/reports/by-skill/`
- `evals/reports/by-command-surface/command-surface-matrix.md`
- `evals/runs/`

## Problem

The current evidence shape has weak locality:

- skill behavior evidence is not grouped by skill
- command-surface evidence is separate from behavior eval evidence
- acceptance-suite membership must be read separately from reports and registries
- multiple registries already exist, so `fixture-evals.json` alone is not enough
- reports summarize results but do not define pass criteria
- generated runs are useful internal evidence but must not leak into public plugin artifacts
- maintainers must grep across many source types to answer "what proves this skill works?"

The module is shallow because every caller must understand the whole evidence layout.

## Recommendation

Use a hybrid design:

```text
evals/scripts/skill-evidence.sh <skill> [--format summary|json|commands]
  -> getSkillEvidence({
       subject: { kind: "skill", name: skill },
       freshness: "acceptance-over-smoke",
       audience: "public"
     })
       -> RegistryAdapter(...)
       -> CommandSurfaceAdapter(...)
       -> SuiteAdapter(...)
       -> ReportAdapter(...)
       -> RunPolicyAdapter(...)
```

This combines:

- a trivial common-caller CLI
- one queryable evidence grouping module
- source-specific adapters
- explicit public/internal run-output policy
- optional grouping metadata only where inference is weak

Do not move prompts, fixtures, or reports into per-skill directories yet. That improves visual locality but risks duplicating source truth and weakening shared eval coverage.

## Desired Interface

Common caller:

```sh
evals/scripts/skill-evidence.sh verify-work
evals/scripts/skill-evidence.sh write-plan --format commands
evals/scripts/skill-evidence.sh review-work --format json
```

Internal module shape:

```text
getSkillEvidence(params) -> SkillEvidenceBundle
validateSkillEvidence(params) -> ValidationResult
```

Core params:

- `subject`: skill first; command, suite, or eval later if needed
- `include`: eval definitions, prompts, fixtures, command surface, suites, reports, runs
- `freshness`: `acceptance-over-smoke`, `latest-report`, or `all`
- `audience`: `public` or `internal`

## Invariants

- skill names must resolve to `skills/<skill>/SKILL.md`
- eval IDs must resolve through configured registry adapters
- `command-surface.json` is authority for command routing
- command-surface matrix is a report/view, not command authority
- suites are curated gates, not duplicated eval definitions
- reports are result evidence, not definition authority
- generated runs are internal evidence unless explicitly requested
- public output must not include generated run bodies or package `evals/runs/`
- diff, git, and output evidence outrank final-response claims
- latest acceptance evidence outranks older smoke reports when freshness matters
- missing prompt, fixture, report, suite, or command links must be surfaced as gaps

## Adapter Strategy

Use one deep grouping module with shallow adapters:

- `RegistryAdapter`: reads `fixture-evals.json`, `verify-work-evals.json`, `handoff-evals.json`, and future registries.
- `PromptAdapter`: resolves inline prompts and `evals/prompts/` references.
- `FixtureAdapter`: validates fixture roots and baseline fixture roots.
- `CommandSurfaceAdapter`: reads `command-surface.json` as authority.
- `SuiteAdapter`: reads curated acceptance-suite membership and skill-file mappings.
- `ReportAdapter`: indexes reports by skill, command, eval ID, run link, and freshness.
- `RunPolicyAdapter`: enforces public/internal generated-run behavior.

Keep the module as the leverage point. Reports, suites, future dashboards, and runner dry-runs should depend on the same normalized evidence interface instead of rebuilding their own joins.

## Follow-Up Checklist

Use this as a readiness checklist for future work, not as an approved implementation plan.

- [ ] Decide whether the first public caller is `skill-evidence.sh`, a JSON module, or both.
- [ ] Decide whether grouping metadata belongs in a new `skill-evidence.json` or in existing eval registry fields.
- [ ] Add or update eval coverage before changing evidence behavior.
- [ ] Preserve registry source truth for eval definitions.
- [ ] Preserve `command-surface.json` as command routing authority.
- [ ] Preserve generated-run privacy and package exclusions.
- [ ] Support multiple registry adapters, not only `fixture-evals.json`.
- [ ] Validate missing prompt, fixture, report, suite, command, and skill links.
- [ ] Prefer fresh acceptance evidence over older smoke reports where relevant.
- [ ] Avoid ID-prefix-only grouping such as `VFY-* -> verify-work`.
- [ ] Update eval docs only after the interface shape is clear.
- [ ] Run relevant eval registry, command-surface, and package validation.
- [ ] Run `git diff --check`.

## Non-Goals

- Do not add hooks.
- Do not add native slash handlers.
- Do not publish generated eval runs.
- Do not make reports canonical.
- Do not move all prompts, fixtures, and reports into per-skill directories as a first step.
- Do not turn this into a broad search engine without source precedence rules.

## Open Questions

- Should the evidence grouping module start skill-only, or support skill, command, suite, and eval subjects from day one?
- Should explicit grouping metadata be additive only, or should it replace ID-prefix inference entirely?
- Should Markdown reports be parsed for run links, or should reports emit a machine-readable sidecar later?
- Should `skill-evidence.sh --format commands` call the fixture runner dry-run, or construct commands directly from registry evidence?
