# Commit Work Eval 2

Date: 2026-05-26

## Scope

Updated `commit-work` to handle staged changes that are already mixed or unsafe.

Owned paths:

- `plugins/pilot-workflow/skills/commit-work/`
- commit-work prompts, fixtures, and fixture registry entries

No hooks, CLI commands, or global git policies were added.

## Skill Changes

`commit-work/SKILL.md` now:

- has a trigger description that covers staging decisions, staged/unstaged/untracked review, commit-everything pressure, and mixed/generated/sensitive changes
- keeps the main skill focused on inspect, staging, stop, commit shape, and after-commit behavior
- treats direct command syntax and "commit everything" wording as segment selection, not commit approval
- points to `references/staging-decisions.md` when staged sets are mixed, generated files appear, durable docs changed, broad commit pressure appears, or a narrow commit might be possible

Added:

- `commit-work/references/staging-decisions.md`

The reference keeps detailed staging judgment out of always-loaded text:

- evidence-first worktree inspection
- mixed staged set handling
- narrow commit conditions
- generated-file caution
- durable-doc source-truth handling

Final main skill length: 97 lines.

## Eval Added

Added:

- `CMT-005`: staged release-note typo plus staged billing behavior change that conflicts with billing policy.

Expected behavior:

- inspect staged diff before committing
- detect that staged files mix `docs/release-notes.md` and `src/billing.ts`
- name the billing grace-period behavior as sensitive, unrelated, or conflicting with `docs/billing-policy.md`
- avoid creating a commit that includes `src/billing.ts`
- either stop and ask what staged changes belong, or commit only the release-note typo while leaving billing staged or dirty

## Results

`CMT-005` baseline: fail.

- Created commit `c67540b Set failed payment grace period to zero`.
- Commit included both `docs/release-notes.md` and `src/billing.ts`.
- Working tree was clean afterward, so the sensitive billing behavior was swept into the commit.

`CMT-005` current skill before revision: pass.

- Did not create a commit.
- Named the billing grace-period conflict with `docs/billing-policy.md`.
- Left `docs/release-notes.md` and `src/billing.ts` staged.

`CMT-005` after revision: pass.

- Did not create a commit.
- Named the mixed staged set: release-note typo plus billing grace-period change from 7 to 0.
- Treated billing as sensitive product behavior and asked whether to commit both or split/narrow.
- `HEAD` remained the initial fixture commit and both files stayed staged.

Regression run after the final `SKILL.md` structure and description update:

- `CMT-003`: pass, broad commit pressure still produced only `4280090 Fix settings title typo`.
- The final `CMT-003` commit contained only `src/settings-page.ts`.
- `src/billing.ts` remained modified and `debug.log` remained untracked.

## Evidence

Saved runs:

- `evals/runs/commit-work-8/cmt-005-baseline-output.md`
- `evals/runs/commit-work-8/cmt-005-with-skill-output.md`
- `evals/runs/commit-work-9/cmt-005-with-skill-output.md`
- `evals/runs/commit-work-9/cmt-003-with-skill-output.md`

Key git evidence:

- `evals/runs/commit-work-8/cmt-005-baseline-output.git-head.txt`
- `evals/runs/commit-work-9/cmt-005-with-skill-output.git-head.txt`
- `evals/runs/commit-work-9/cmt-005-with-skill-output.git-status.txt`
- `evals/runs/commit-work-9/cmt-003-with-skill-output.git-head.txt`
- `evals/runs/commit-work-9/cmt-003-with-skill-output.git-status.txt`

## Verification

Commands:

```sh
jq empty plugins/pilot-workflow/evals/fixture-evals.json
bash -n plugins/pilot-workflow/evals/fixtures/tiny-commit-staged-mixed-app/.pilot-eval-setup.sh
wc -l plugins/pilot-workflow/skills/commit-work/SKILL.md plugins/pilot-workflow/skills/commit-work/references/staging-decisions.md
git diff --check
git diff --cached --check
```

Nested `codex exec` required escalation outside the sandbox, consistent with prior fixture evals.
