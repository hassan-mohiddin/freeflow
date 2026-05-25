# Review Work Eval Report - Iteration 4

Date: 2026-05-26

## Scope

Updated `review-work` for outgoing reviewer prompts and subagent review context.

Owned paths:

- `plugins/pilot-workflow/skills/review-work/`
- review-work prompts, fixtures, and fixture registry entries

No hooks, CLI commands, review execution tooling, or global review standard were added.

## Skill Changes

`review-work/SKILL.md` now:

- has a trigger description that covers preparing reviewer prompts and subagent review context
- points to `references/reviewer-prompt.md` for outgoing review prompts, strict/high-risk reviews, and review handoff context
- keeps incoming-feedback handling and partial-apply rules in the main skill
- states that reviewer prompts must include source truth, changed files, risk lenses, and pass/fail criteria, not only previous-agent summaries or chat history

Added:

- `review-work/references/reviewer-prompt.md`

The reference keeps reviewer-prompt detail out of always-loaded text:

- source-truth and changed-file context
- risk lenses for source-truth, regression, security, billing, public API, data safety, tests, and reviewability
- severity-based output shape
- a compact reusable prompt template

Final main skill length: 73 lines.

## Eval Added

Added:

- `REV-004`: prepare a reviewer prompt for completed billing webhook work.

Expected behavior:

- create `docs/review/billing-webhook-reviewer-prompt.md`
- inspect the previous-agent summary plus approved spec, plan, billing policy, tests, or implementation files
- tell the reviewer to verify source truth, not trust the previous-agent summary
- include files to inspect and risk lenses for auth, payload shape, idempotency, audit logging, and grace-period behavior
- avoid editing implementation files or source-truth docs

## Results

`REV-004` baseline: pass.

- Created a focused reviewer prompt.
- Included summary, source files, approved requirements, review focus areas, and severity-based output.
- Did not edit implementation files.

`REV-004` current skill before revision: pass.

- Created a useful reviewer prompt with relevant docs/files and billing/security/idempotency risks.
- Did not edit implementation files.

`REV-004` after revision: pass.

- Read `references/reviewer-prompt.md`.
- Created a reviewer prompt that explicitly treats previous-agent claims as context only.
- Included source truth, concrete files to inspect, risk lenses, output shape, and pass/fail criteria.
- Did not run the review or edit implementation files.

Regression after the final `SKILL.md` structure and description update:

- `REV-003`: pass.
- Applied only the settings title typo fix.
- Preserved billing behavior because immediate downgrade conflicts with billing policy and tests.
- Ended with a direct billing-policy choice question.

## Evidence

Saved runs:

- `evals/runs/review-work-9/rev-004-baseline-output.md`
- `evals/runs/review-work-9/rev-004-with-skill-output.md`
- `evals/runs/review-work-10/rev-004-with-skill-output.md`
- `evals/runs/review-work-10/rev-003-with-skill-output.md`

Key diffs:

- `evals/runs/review-work-9/rev-004-baseline-output.diff`
- `evals/runs/review-work-9/rev-004-with-skill-output.diff`
- `evals/runs/review-work-10/rev-004-with-skill-output.diff`
- `evals/runs/review-work-10/rev-003-with-skill-output.diff`

`REV-004` is protective rather than differentiating: current baseline behavior is already careful on this fixture. The skill/reference change is justified by the reference-stack recommendation and by preserving the prompt shape as progressive disclosure.

## Verification

Commands:

```sh
jq empty plugins/pilot-workflow/evals/fixture-evals.json
wc -l plugins/pilot-workflow/skills/review-work/SKILL.md plugins/pilot-workflow/skills/review-work/references/reviewer-prompt.md
git diff --check
git diff --cached --check
```

Nested `codex exec` required escalation outside the sandbox, consistent with prior fixture evals.
