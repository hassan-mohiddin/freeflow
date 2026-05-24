# Write Plan Next Handoff

Date: 2026-05-25

## Purpose

After compaction, continue Pilot Workflow artifact-skill development with `write-plan`.

Do not restart `write-spec` or `review-artifact` unless new evidence appears.

This handoff is memory, not authority. Inspect live files before editing.

## Read First

- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/`
- `docs/research/pilot-workflow-artifact-skills.md`
- `plugins/pilot-workflow/skills/write-spec/SKILL.md`
- `plugins/pilot-workflow/skills/review-artifact/SKILL.md`
- `plugins/pilot-workflow/evals/write-spec-1-report.md`
- `plugins/pilot-workflow/evals/write-spec-2-report.md`
- `plugins/pilot-workflow/evals/write-spec-3-report.md`
- `plugins/pilot-workflow/evals/review-artifact-1-report.md`
- `plugins/pilot-workflow/evals/review-artifact-2-report.md`

Reference skills for next work:

- Matt `write-a-skill`: concise skill shape.
- Obra/Superpowers `writing-plans`: lifecycle reference for executable plans.
- Obra/Superpowers `executing-plans`: plan-consumption stop conditions.
- Anthropic `skill-creator`: baseline vs with-skill eval method.

## Current State

Added `write-spec`.

Validated paths:

- `WSP-001`: source-truth override from stale handoff.
  - Baseline `4/10`.
  - With skill `10/10`.
  - Final with-skill diff `0` bytes.
- `WSP-002`: rich grilling context to spec.
  - Baseline `10/10`.
  - With skill `10/10`.
  - Happy path guard, not lift.
- `WSP-003`: cold spec call without source context.
  - Baseline `2/10`.
  - With skill `10/10`.
  - Final with-skill diff `0` bytes.

Key lesson:

- Adjacent repo evidence is not source context.
- A spec can change source truth.
- The original request is not override confirmation after a conflict is found.

Added `review-artifact`.

Validated paths:

- `RAR-001`: artifact conflicts with billing policy.
  - Baseline `4/10`.
  - With skill `10/10`.
  - Final with-skill diff `0` bytes.
- `RAR-002`: clean artifact review pass.
  - Baseline `10/10`.
  - With skill `10/10`.
  - Both final diffs `0` bytes.

Key lesson:

- Review first. Edit second.
- "Fix directly" is not approval to invert an artifact's intent.
- A clean artifact should pass without invented findings.
- Fresh reviewer prompt exists at `plugins/pilot-workflow/skills/review-artifact/references/reviewer-prompt.md`.

## Dirty / Untracked Work To Preserve

Expected untracked or modified files include:

- `docs/research/pilot-workflow-artifact-skills.md`
- `docs/handoffs/2026-05-25-artifact-skills-handoff.md`
- `docs/handoffs/2026-05-25-write-plan-next.md`
- `plugins/pilot-workflow/skills/write-spec/`
- `plugins/pilot-workflow/skills/review-artifact/`
- `plugins/pilot-workflow/evals/prompts/wsp-001.txt`
- `plugins/pilot-workflow/evals/prompts/wsp-002.txt`
- `plugins/pilot-workflow/evals/prompts/wsp-003.txt`
- `plugins/pilot-workflow/evals/prompts/rar-001.txt`
- `plugins/pilot-workflow/evals/prompts/rar-002.txt`
- `plugins/pilot-workflow/evals/fixtures/tiny-artifact-review-app/`
- `plugins/pilot-workflow/evals/write-spec-1-report.md`
- `plugins/pilot-workflow/evals/write-spec-2-report.md`
- `plugins/pilot-workflow/evals/write-spec-3-report.md`
- `plugins/pilot-workflow/evals/review-artifact-1-report.md`
- `plugins/pilot-workflow/evals/review-artifact-2-report.md`
- modified `plugins/pilot-workflow/evals/fixture-evals.json`

Do not delete or rewrite these as cleanup.

## Next Target

Draft `write-plan/SKILL.md`.

Expected behavior:

- Prefer an approved spec as source context.
- If no spec exists but task context is explicit enough, allow a lightweight plan.
- If both spec and sufficient context are missing, stop and route to grilling/interview.
- Plans must not invent product behavior, API behavior, billing/security/privacy/data-loss behavior, compatibility, or architecture decisions.
- Bug-fix plans require a repro or feedback loop unless the user explicitly accepts diagnostic risk.
- Plans should be executable but not Obra-level verbose by default.

Use Obra `writing-plans` for lifecycle ideas:

- source spec/context
- files likely touched
- vertical slices
- tests/checks per slice
- commands where known
- stop conditions
- review/verification checkpoints

Use Matt style for wording:

- concise
- failure-focused
- no long manual
- priority rules first

## First Useful Write-Plan Evals

Start with focused evals, not a full suite:

1. Approved spec exists.
   - Agent writes vertical executable plan with checks.
   - Does not re-spec or over-ask.
2. No spec but context is clear.
   - Agent says spec is preferred but writes a lightweight plan.
3. Hidden user-owned decision.
   - Plan would require billing/security/API/product decision.
   - Agent stops and asks instead of inventing.

Prefer adversarial fixture evals with baseline vs with-skill and saved diffs.

## Do Not

- Do not add hooks.
- Do not create one broad `write-artifact` skill.
- Do not make Orchestra-style six-judge review.
- Do not require Obra-level plan verbosity by default.
- Do not commit until user asks.
