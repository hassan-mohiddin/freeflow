# Pilot Workflow Reference Stack Comparison

> **Doc ID:** RESEARCH-2026-05-26-pilot-reference-stack-comparison
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Research
> **Status:** Current
> **Source:** Live Pilot Workflow repo, Matt Pocock skills, Obra/Superpowers skills, Anthropic skill-creator, and local Orchestra repo.

## Purpose

Capture the research conclusions from comparing Pilot Workflow's 19 skills against the current reference stack:

- Matt Pocock skills for concise skill wording, sharp failure-prevention rules, low ceremony, and practical engineering judgment.
- Obra/Superpowers skills for lifecycle coverage: planning, execution, debugging, review, verification, and branch completion.
- Anthropic `skill-creator` for skill structure, progressive disclosure, eval mechanics, and measured iteration.
- Orchestra for team artifact standards, spec review, commit discipline, CLI enforcement, hook durability, and cautionary failure evidence.

This document is research memory, not an implementation plan. Future agents should use live repo evidence before editing.

## Executive Judgment

Pilot Workflow is directionally correct because it does not copy any reference stack wholesale.

Its strongest differentiator is proportional workflow pressure:

- conversation mode does not force artifacts
- workflow mode guides consequential work
- strict-workflow mode strengthens gates for high-risk work
- the agent re-enters clarification when new ambiguity would change the next action

Pilot should absorb Orchestra's best artifact and team-readiness lessons without inheriting Orchestra's process weight. The target is not "Orchestra v3." The target is a portable workflow layer that can scale from solo-founder work to team and enterprise use through opt-in stricter profiles.

## Reference Stack Roles

| Reference | Use it for | Do not copy |
| --- | --- | --- |
| Matt Pocock skills | Interaction shape, concise wording, practical defaults, low-ceremony engineering loops. | Repo-specific course/product assumptions. |
| Obra/Superpowers | Workflow lifecycle coverage, TDD, debugging, planning, verification, review, worktree/branch completion. | Mandatory ceremony or always-on lifecycle pressure. |
| Anthropic `skill-creator` | Skill authoring structure, progressive disclosure, bundled resources, baseline-vs-with-skill evals. | Large authoring manuals inside Pilot skills. |
| Orchestra | Artifact identity, owner/status headers, conditional changelog, spec-review lenses, commit discipline, CLI/hook lessons. | Full design-doc operating system, mandatory spec-review YAMLs, canon-frozen enforcement, broad hooks by default. |

## Overall Strengths

Pilot is already strongest at:

- stopping silent product/source-truth changes
- preserving low ceremony
- routing questions as questions, not surprise artifacts
- treating plans, handoffs, reviews, and prompts as evidence, not authority
- using evals to tighten wording after real failures
- separating conversation, workflow, and strict-workflow pressure

The references remain stronger at:

- Matt: rich debugging playbooks and terse skill phrasing
- Obra/Superpowers: fully delegated implementation plans, systematic TDD, branch/review/finish lifecycle machinery
- Anthropic: complete skill authoring/eval methodology and progressive-disclosure packaging
- Orchestra: team-facing document identity, ownership/status tracking, formal spec review, commit-time discipline, CLI enforcement, and hook durability

## Orchestra Lessons To Rescue

Orchestra's most useful ideas:

- Doc identity: `Doc ID` made specs, reviews, plans, handoffs, and commits referenceable.
- Ownership: `DRI` made responsibility explicit. Pilot should prefer the more general term `Owner`, with `DRI` as an accepted alias.
- Status: readers can tell whether a doc is draft, approved, implemented, rejected, outdated, or deprecated.
- Type: readers know whether a doc is a spec, plan, decision, bug note, runbook, or research artifact.
- Conditional changelog: useful when a long-lived doc changes after creation.
- Review lenses: structure, semantic correctness, evidence, repo fit, architectural fit, and adversarial risk catch different failures.
- Commit discipline: staging should respect semantic boundaries, user-owned changes, generated files, and durable-doc status transitions.
- Lessons layer: repeated process failures should become proposed skill/eval improvements, not forgotten chat context.
- CLI/hook evidence: markdown-only discipline can decay in long sessions, but enforcement should be added only after eval pressure proves need.

Orchestra behavior to avoid:

- mandatory design docs before all code
- mandatory spec review for normal work
- mandatory Mermaid diagrams or changelogs for ordinary artifacts
- global `Refs:` line enforcement
- six-judge YAML review as the default path
- canon-frozen lifecycle rules for normal docs
- full `STANDARDS.md` installation into every repo
- large controlled-vocabulary parser before vocabulary drift is proven
- hook-first enforcement before skill wording and evals are validated

## Artifact Standard Recommendation

Add one progressive-disclosure reference first:

`plugins/pilot-workflow/skills/write-spec/references/artifact-standards.md`

This should define a compact Pilot artifact header for durable, team-facing, strict-workflow, or future-agent-facing artifacts:

```md
> **Doc ID:** SPEC-001-team-invitations
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** docs/research/team-invitations.md
```

Optional team/company fields:

```md
> **Approver:** Platform Lead
> **Reviewers:** Security, Billing
> **Last Updated:** 2026-05-27
```

Recommended tiny status sets:

| Artifact type | Statuses |
| --- | --- |
| Spec / PRD / Design Brief | `Draft`, `Approved`, `Implemented`, `Rejected` |
| Plan | `Draft`, `Ready`, `Executed`, `Abandoned` |
| Decision / ADR | `Proposed`, `Accepted`, `Rejected`, `Superseded` |
| Bug / Diagnosis | `Investigating`, `Fixed`, `Verified`, `Rejected` |
| Runbook / Living Design Doc | `Current`, `Outdated`, `Deprecated` |
| Research Brief / Handoff | Usually no status unless repo convention asks for one |

Changelog rule:

- Do not require a changelog on first creation.
- Add `## Change Log` only after a material revision, status transition, or implementation divergence.
- Always use changelogs for living docs, runbooks, policies, and long-lived architecture docs.
- Never use changelog as a transcript. It records meaningful document evolution.

Mode behavior:

- Conversation mode: no artifact header pressure.
- Workflow mode: use headers for durable specs, plans, decisions, bug notes, and handoffs that future agents or teammates will rely on.
- Strict-workflow mode: require header and explicit owner/status for security, billing, privacy, public API, migration, data-loss, and architecture work.
- Team settings: recommend owner, approver/reviewers, and status.
- Solo settings: owner and status are usually enough.

## All 19 Skills

| Pilot skill | Final judgment | Reference comparison | Improvement note |
| --- | --- | --- | --- |
| `workflow` | Strong core. Better than Orchestra because it stays proportional and mode-aware. | Obra has the richer lifecycle; Orchestra has a stricter process OS. | Keep one-file. Maybe later add a tiny situation-routing reference shared by setup/docs. |
| `mode-contract` | Pilot-specific and necessary. | No direct Matt/Obra equivalent; Orchestra lacked a clean proportional mode contract. | Keep one-file. Add invalid/missing config examples only if evals show drift. |
| `setup-pilot-workflow` | Important and under-leveraged. | Matt setup skills are practical; Anthropic helps structure; Orchestra init shows profiles, migration, and verification. | Add `references/host-setup.md`. Consider `scripts/validate-setup.sh` only after repeated setup validation failures. |
| `interview-gate` | One of Pilot's best skills. Better as a universal stop gate than Orchestra's broad design-doc gate. | Matt `grill-me` and Obra brainstorming are richer for dialogue, but Pilot's gate is sharper. | Keep lean. Do not add examples unless repeated failures recur. |
| `grill-context` | Good low-ceremony alternative to formal design-doc flow. | Matt/Obra are stronger for deep brainstorming; Orchestra is too formal by default. | Optional `references/approach-framing.md` after dogfooding. |
| `research-brief` | Strong Pilot-specific research posture, especially against biased framing and source-truth conflicts. | Obra context exploration is adjacent; Orchestra investigations became too formal. | Keep one-file unless external/current-source tasks expand. |
| `write-spec` | Strong behaviorally, but needs the biggest team-readiness upgrade. | Matt `to-prd` gives concise synthesis; Orchestra gives artifact identity/header/status/changelog; Anthropic gives structure/evals. | Add `references/artifact-standards.md` and possibly `references/spec-shapes.md`. |
| `review-artifact` | Strong general artifact reviewer. Already has `references/reviewer-prompt.md`. | Orchestra spec-review's lens separation is excellent but too heavy as six-judge YAML default. | Expand reviewer prompt with strict-mode lenses: semantic, owner/status, stale-doc, implementation-risk, adversarial risk. |
| `write-plan` | Strong at scaling pressure and blocking bug plans without repro; weaker than Obra for cold delegated plans. | Obra `writing-plans` is richer for full delegation; Matt TDD helps vertical slices. | Add `references/plan-shapes.md` for light/normal/strict plans. |
| `execute-plan` | Strong on plan/source conflict and missing verification gates. | Obra execution has more subagent/checkpoint machinery; Orchestra lifecycle is more formal. | Keep one-file for now. Add checkpoint/subagent patterns only if execution scope grows. |
| `diagnose-failure` | Correct but thin. | Matt `diagnose` and Obra `systematic-debugging` are stronger; Orchestra bug iteration logs are useful. | Add `references/feedback-loop-catalog.md` and `references/flaky-and-performance.md`. |
| `verify-work` | Clean and portable. | Obra `verification-before-completion` is more forceful; Orchestra shows possible CLI/hook enforcement. | Keep one-file unless missed-verification eval failures recur. |
| `review-work` | Strong at partial apply and source-truth conflict. | Obra review skills cover request/receive lifecycle; Orchestra adversarial review informs strict mode. | Add `references/reviewer-prompt.md` for outgoing review/subagent context. |
| `commit-work` | Good closeout guard; should borrow more commit discipline from Orchestra. | Obra finishing branch helps lifecycle; Orchestra commit skill is strongest on staging semantics and durable-doc edits. | Add `references/staging-decisions.md`. Do not add hooks yet. |
| `capture-decisions` | Strong destination classification and volatile-context exclusion. | Matt `grill-with-docs` is adjacent; Orchestra controlled vocabulary warns against scattered meanings. | Add `references/destination-guide.md`; reference artifact standards where useful. |
| `handoff` | Stronger than Matt on temp vs memory and authority boundaries. | Orchestra shows handoffs can become durable memory, but they should not become authority. | Optional `references/templates.md` only if handoffs become bloated or wrong-destination. |
| `bypass` | Strong Pilot-specific pressure-release valve. | No direct equivalent; Orchestra had too little escape from strict process. | Keep one-file. Runtime state/hooks should wait for eval pressure. |
| `write-skill` | Good concise skill-writing governor. | Matt `write-a-skill` is concise; Anthropic is deeper; Orchestra warns against overbuilding. | Consider `references/resource-decision-guide.md`; do not copy Anthropic docs. |
| `evaluate-skill` | Very important. Pilot's eval-before-wording rule is healthier than Orchestra's hook-first tendency. | Anthropic is strongest on eval method; Orchestra scenario runner is useful for deterministic CLI surfaces. | Add `references/eval-patterns.md`, `references/grading-priority.md`, and maybe later an audit script. |

## Best Current Skills

Best Pilot skills right now:

- `interview-gate`
- `write-spec`
- `write-plan`
- `execute-plan`
- `review-work`
- `handoff`
- `bypass`
- `setup-pilot-workflow`

They have distinct jobs, clear failure-prevention rules, and evidence from current evals or repo direction.

Skills most likely to improve from extra depth:

- `write-spec`
- `diagnose-failure`
- `evaluate-skill`
- `setup-pilot-workflow`
- `commit-work`
- `write-plan`

## Extra File Recommendations

Add files only where progressive disclosure earns its keep.

Implementation status as of 2026-05-26: the main high- and medium-priority progressive-disclosure files from this recommendation have landed with eval reports. Treat this section as the original recommendation; use the implementation status table below for live follow-up state.

High priority:

| Skill | Suggested files | Reason |
| --- | --- | --- |
| `write-spec` | `references/artifact-standards.md`, `references/spec-shapes.md` | Team-readable artifact identity, owner/status, conditional changelog, spec variants. |
| `setup-pilot-workflow` | `references/host-setup.md` | Codex/Claude activation, config shape, host-specific setup and verification. |
| `evaluate-skill` | `references/eval-patterns.md`, `references/grading-priority.md` | Baseline-vs-with-skill patterns, fixture evals, scoring priority, artifact requirements. |
| `diagnose-failure` | `references/feedback-loop-catalog.md`, `references/flaky-and-performance.md` | Richer debugging playbook without bloating `SKILL.md`. |

Medium priority:

| Skill | Suggested files | Reason |
| --- | --- | --- |
| `commit-work` | `references/staging-decisions.md` | Staged/unstaged/untracked/generated/user-owned/durable-doc examples. |
| `write-plan` | `references/plan-shapes.md` | Light/normal/strict plan examples and delegated-plan expectations. |
| `review-work` | `references/reviewer-prompt.md` | Fresh reviewer/subagent context and strict-mode review lenses. |
| `capture-decisions` | `references/destination-guide.md` | Glossary vs ADR vs spec vs handoff vs decision note. |

Low priority:

| Skill | Suggested files | Reason |
| --- | --- | --- |
| `handoff` | `references/templates.md` | Only if agents repeatedly write bloated or wrong-destination handoffs. |
| `grill-context` | `references/approach-framing.md` | Only after dogfooding shows repeated weak framing. |

Do not add files yet for:

- `workflow`
- `mode-contract`
- `interview-gate`
- `research-brief`
- `verify-work`
- `execute-plan`
- `bypass`

Their value is that the core rule is active immediately.

## Implementation Status

Reference-stack follow-up batches completed as of 2026-05-26:

| Batch | Status | Landed evidence |
| --- | --- | --- |
| A: Artifact Standards | Done | `write-spec/references/artifact-standards.md`; `plugins/pilot-workflow/evals/write-spec-4-report.md` |
| B: Artifact Review | Done | `review-artifact` uses artifact identity guidance; `plugins/pilot-workflow/evals/review-artifact-3-report.md` |
| C: Diagnosis Depth | Done | `diagnose-failure/references/feedback-loop-catalog.md`, `flaky-and-performance.md`; `plugins/pilot-workflow/evals/diagnose-failure-2-report.md` |
| D: Eval Method | Done | `evaluate-skill/references/eval-patterns.md`, `grading-priority.md`; `plugins/pilot-workflow/evals/evaluate-skill-2-report.md` |
| E: Setup Profiles | Done | `setup-pilot-workflow/references/host-setup.md`; `plugins/pilot-workflow/evals/setup-pilot-workflow-3-report.md` |
| F: Commit Discipline | Done | `commit-work/references/staging-decisions.md`; `plugins/pilot-workflow/evals/commit-work-2-report.md` |
| G: Planning And Review Work | Done | `write-plan/references/plan-shapes.md`, `review-work/references/reviewer-prompt.md`; `plugins/pilot-workflow/evals/write-plan-3-report.md`, `review-work-4-report.md` |
| H: Decision Destinations | Done | `capture-decisions/references/destination-guide.md`; `plugins/pilot-workflow/evals/capture-decisions-2-report.md` |
| I: Optional Handoff Templates | Deferred | Only add if future handoff evals show bloat or wrong-destination failures. |

Remaining evidence-gated possibilities:

- `write-spec/references/spec-shapes.md`: not added yet. Add only if future write-spec evals show repeated shape drift that `artifact-standards.md` cannot solve.
- `handoff/references/templates.md`: defer until repeated handoff failures justify another reference.
- `grill-context/references/approach-framing.md`: low priority; add only after dogfooding shows weak framing.

Do not treat the completed batches as permission to add hooks, CLI enforcement, a global `STANDARDS.md`, or mandatory artifact headers in conversation mode.

## CLI And Hook Position

Orchestra's CLI is evidence for future hardening, not a v1 requirement.

Potential future CLI surfaces:

- `pilot verify-setup`
- `pilot lint-artifact`
- `pilot check-skill-pack`
- `pilot eval-skill`

Do not add now:

- hook installers
- canon-frozen enforcement
- mandatory review YAML
- global `Refs:` checks
- controlled-vocabulary parser
- docs viewer

Add tooling only when:

- a repeated eval failure exists
- the check is deterministic
- a script is better than direct shell commands
- the behavior cannot reliably be preserved by a concise skill rule

## Parallelization Plan

The safest way to parallelize is to run several fresh conversations or worktrees where each batch owns disjoint file paths. Every batch may read all docs, but it should edit only its owned skill, references, prompts, fixtures, and reports.

Use a coordinator session for shared decisions:

- keep this research doc as the common source
- avoid simultaneous edits to `docs/skill-inventory-and-plugin-plan.md`, `plugins/pilot-workflow/command-surface.json`, and shared eval runbooks
- merge or reconcile shared-index updates after batch work lands
- ensure no batch introduces a new hard rule that conflicts with `workflow`, `mode-contract`, or `interview-gate`

Recommended independent batches:

| Batch | Scope | Owned paths | Dependencies | Exit criteria |
| --- | --- | --- | --- | --- |
| A: Artifact Standards | Add Pilot artifact standards and spec shapes. | `plugins/pilot-workflow/skills/write-spec/`, write-spec eval prompts/reports if needed. | Should run first or publish its reference path early because other batches may cite it. | `write-spec` knows when to use headers/changelogs without forcing them on chat answers. |
| B: Artifact Review | Upgrade artifact review lenses for strict/team docs. | `plugins/pilot-workflow/skills/review-artifact/`, review-artifact eval prompts/reports. | Can reference Batch A's artifact standards; avoid editing Batch A files. | Reviewer checks owner/status/changelog/stale-doc risk only when relevant. |
| C: Diagnosis Depth | Add debugging references. | `plugins/pilot-workflow/skills/diagnose-failure/`, diagnose eval prompts/reports. | Independent. | Skill gains feedback-loop, flaky, and performance guidance without bloating `SKILL.md`. |
| D: Eval Method | Add eval pattern references. | `plugins/pilot-workflow/skills/evaluate-skill/`, eval-skill fixtures/prompts/reports. | Independent; should not edit every skill's evals. | Future skill edits have clearer eval artifact requirements and grading priority. |
| E: Setup Profiles | Add host setup reference and setup profile guidance. | `plugins/pilot-workflow/skills/setup-pilot-workflow/`, setup eval prompts/reports. | Independent, but should not introduce hooks or CLI by default. | Setup distinguishes solo/team/strict/enterprise guidance and Codex/Claude activation. |
| F: Commit Discipline | Add staging decision reference. | `plugins/pilot-workflow/skills/commit-work/`, commit eval prompts/reports. | Independent. | Commit behavior handles staged/unstaged/untracked/generated/user-owned/durable-doc changes. |
| G: Planning And Review Work | Add plan shapes and outgoing reviewer prompt. | `plugins/pilot-workflow/skills/write-plan/`, `plugins/pilot-workflow/skills/review-work/`, related eval prompts/reports. | Independent if it does not edit `execute-plan`. | Plans scale light/normal/strict; outgoing review context is reusable. |
| H: Decision Destinations | Add destination guide for durable decisions. | `plugins/pilot-workflow/skills/capture-decisions/`, capture-decision eval prompts/reports. | Can cite Batch A artifact standards, but should not modify them. | Agent chooses glossary/ADR/spec/handoff/decision note correctly. |
| I: Optional Handoff Templates | Only if handoff failures recur. | `plugins/pilot-workflow/skills/handoff/`, handoff eval prompts/reports. | Low priority. | Handoff examples reduce bloat without turning handoff into authority. |

Recommended batch order:

1. Batch A first, because artifact standards become shared vocabulary.
2. Batches C, D, E, F can run in parallel immediately.
3. Batches B, G, H can run in parallel after Batch A publishes stable artifact-standard wording, or earlier if they only reference the planned path.
4. Batch I should wait for evidence.
5. Coordinator session updates shared docs, inventory, and any global eval matrix after all batch branches are reviewed.

Conflict prevention rules:

- One batch owns one skill directory unless explicitly listed.
- Do not edit shared docs from batch sessions unless assigned.
- Do not change `command-surface.json` unless a skill name/trigger actually changes.
- Do not add hooks, CLI commands, or global standards from a batch without a separate decision.
- If a batch discovers a cross-skill rule, record it in its report and hand it to the coordinator instead of editing other skill files.
- Each batch should run targeted evals or at least document why evals were not run.

## Suggested Eval Additions

Artifact standards:

- normal durable spec includes compact header
- tiny chat answer does not create artifact/header
- strict-workflow billing/API spec asks if owner is unknown
- changed existing spec adds changelog
- newly-created unchanged spec does not add changelog unless repo convention requires it

Commit discipline:

- staged user change is preserved and not silently included
- generated/untracked files are called out before commit
- durable doc status flip is treated as special
- unrelated code and doc changes are split or explained

Diagnosis depth:

- bug report without repro routes to feedback-loop setup
- flaky failure avoids one-off patching
- performance regression asks for measurement before fix

Evaluate skill:

- proposed skill wording change is blocked without baseline-vs-with-skill evidence
- eval report distinguishes failure caused by prompt, fixture, grading, or skill wording
- script/tooling is suggested only when deterministic and repeated

Setup:

- Codex-only repo receives Codex activation without Claude assumptions
- Claude-only repo receives Claude activation without Codex assumptions
- existing user rules are preserved
- invalid/missing Pilot config is reported without silent rewrite

## Change Log

| Date | Change |
| --- | --- |
| 2026-05-26 | Initial research memory created from Pilot/Matt/Obra/Anthropic/Orchestra comparison and parallelization discussion. |
| 2026-05-26 | Added implementation status after Batches A-H landed with targeted eval reports; deferred optional handoff templates and other evidence-gated references. |
