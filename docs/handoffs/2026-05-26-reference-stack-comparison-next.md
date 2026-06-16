# Reference Stack Comparison Handoff

Date: 2026-05-26

## Status Update

This handoff is superseded for implementation state. Batches A-H from the reference-stack comparison have landed with targeted eval reports, and the formerly optional `spec-shapes`, handoff template, and approach-framing references later landed by explicit product direction. See:

- `docs/research/freeflow-reference-stack-comparison.md`
- `docs/plans/skill-inventory-and-plugin-plan.md`

Do not use this handoff as authority for missing-reference status; inspect live skill directories first.

## Purpose

Continue Freeflow improvement work from the completed comparison against Matt Pocock skills, Obra/Superpowers, Anthropic `skill-creator`, and the local Orchestra repo.

Primary research artifact:

- `docs/research/freeflow-reference-stack-comparison.md`

Read that first. It is the durable source for the 19-skill comparison, Orchestra lessons, extra-file recommendations, artifact standard proposal, and parallelization plan.

## Current State

No implementation changes have been made from this research pass yet.

Known current facts:

- Freeflow has 19 skills under `plugins/freeflow/skills/`.
- `review-artifact` already has `references/reviewer-prompt.md`.
- The strongest next addition is likely `write-spec/references/artifact-standards.md`.
- The artifact standard should borrow Orchestra's useful header/changelog ideas without copying Orchestra's full process system.
- Do not add hooks, CLI commands, or a global `STANDARDS.md` yet.

## Key Conclusions

Use the reference stacks this way:

- Matt: concise wording and low-ceremony engineering judgment.
- Obra/Superpowers: lifecycle coverage for planning, debugging, execution, review, and verification.
- Anthropic `skill-creator`: progressive disclosure and baseline-vs-with-skill eval method.
- Orchestra: team artifact identity, owner/status headers, conditional changelog, spec-review lenses, commit discipline, and enforcement cautionary evidence.

Freeflow should become more institutionally legible for team/company use, but remain proportional:

- conversation mode: no artifact pressure
- workflow mode: durable artifacts get lightweight identity when useful
- strict-workflow mode: owner/status/review expectations become stronger

## Recommended First Work

Start with Batch A from the research doc:

- Add `plugins/freeflow/skills/write-spec/references/artifact-standards.md`.
- Update `write-spec/SKILL.md` only if necessary to point to that reference.
- Add or update evals for:
  - durable spec includes compact header
  - tiny chat answer does not create a header/artifact
  - strict-workflow billing/API spec asks when owner is unknown
  - changed existing spec adds changelog
  - new unchanged spec does not add changelog by default

Do not create a full repo-wide `STANDARDS.md`.

## Parallel Work Plan

If Hassan wants to parallelize through fresh conversations, assign batches by path ownership.

Safe parallel batches:

1. Artifact standards:
   - Owns `plugins/freeflow/skills/write-spec/`.
   - Should go first or publish stable wording early.

2. Diagnosis depth:
   - Owns `plugins/freeflow/skills/diagnose-failure/`.
   - Add debugging references and targeted evals.

3. Eval method:
   - Owns `plugins/freeflow/skills/evaluate-skill/`.
   - Add eval-pattern references and grading guidance.

4. Setup profiles:
   - Owns `plugins/freeflow/skills/setup-freeflow/`.
   - Add host setup/profile reference. No hooks by default.

5. Commit discipline:
   - Owns `plugins/freeflow/skills/commit-work/`.
   - Add staging-decision reference. No git hooks yet.

6. Planning/review work:
   - Owns `plugins/freeflow/skills/write-plan/` and `plugins/freeflow/skills/review-work/`.
   - Add plan shapes and outgoing reviewer prompt if needed.

7. Decision destinations:
   - Owns `plugins/freeflow/skills/capture-decisions/`.
   - Add destination guide.

8. Artifact review:
   - Owns `plugins/freeflow/skills/review-artifact/`.
   - Can expand existing reviewer prompt with strict/team artifact lenses.

Low-priority batch:

- `handoff` templates only if evals show bloated or wrong-destination handoffs.

Coordinator-only files:

- `docs/plans/skill-inventory-and-plugin-plan.md`
- `plugins/freeflow/command-surface.json`
- shared eval runbooks/matrices
- ADRs

Batch sessions should not edit coordinator-only files unless explicitly assigned.

## Suggested Skills

Use:

- `write-skill` for modifying skill wording or adding references.
- `evaluate-skill` before changing behavior meaningfully.
- `review-artifact` to review new reference files.
- `commit-work` before committing finished batches.
- `handoff` if a batch stops mid-change.

## Stop Conditions

Stop and ask before:

- adding hooks or CLI enforcement
- adding a global `STANDARDS.md`
- making artifact headers mandatory in conversation mode
- changing all 19 skills at once
- copying long text from Matt, Obra, Anthropic, or Orchestra
- editing user-owned product behavior or repo authority rules

If a batch discovers a cross-skill rule, record it in its own notes and hand it to the coordinator instead of editing unrelated skills.
