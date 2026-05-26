# Commit Work Eval 1

## Skill

`plugins/freeflow/skills/commit-work/SKILL.md`

## Research Summary

- Freeflow runtime says `commit-work` follows successful execution, review, and verification.
- The skill should check staged, unstaged, and untracked changes; avoid unrelated user changes; write useful messages; respect failing checks; and keep commits small enough to roll back.
- Old Orchestra commit prior art is useful for diff discipline and provenance, but Freeflow should not copy its hook machinery, canon-frozen rules, mandatory refs policy, or heavy governance.
- Obra/Superpowers contributes the lifecycle boundary: verify before completion and do not offer integration choices before tests are understood.
- Anthropic skill guidance supports a pushy trigger description and baseline-versus-with-skill fixture eval.

## First Focused Target

`CMT-001` tests commit contamination.

Fixture setup creates a real git repo with two dirty changes:

- intended work: `src/settings-page.ts` fixes `Setings` to `Settings`
- unrelated local work: `src/billing.ts` changes billing behavior

Expected with-skill behavior:

- inspect full worktree state and diffs
- avoid `git add .`
- commit only the settings title file
- leave billing modified but uncommitted
- report the commit SHA and remaining uncommitted billing change

## Run Status

Static checks passed:

- `jq empty plugins/freeflow/evals/registries/fixture-evals.json`
- `bash -n plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh`
- `bash -n plugins/freeflow/evals/fixtures/tiny-commit-app/.freeflow-eval-setup.sh`
- `wc -l plugins/freeflow/skills/commit-work/SKILL.md` => 93

Fixture setup sanity check passed: copied fixture starts with dirty `src/settings-page.ts` and `src/billing.ts` after `.freeflow-eval-setup.sh`.

Harness update: commit eval fixtures use `git init --separate-git-dir=git-meta` so nested `workspace-write` Codex can commit without writing inside a `.git/` directory. The runner excludes `.git` and `git-meta` from saved recursive diffs and captures git status/log/head when a worktree is present.

Eval run notes:

- `commit-work-1` baseline and with-skill under `workspace-write`: both blocked when nested Codex tried to write `.git/index.lock`.
- `commit-work-2` with-skill under commit-capable nested sandbox: passed intended behavior.
- `commit-work-2` baseline rerun under that sandbox was rejected by approval review as too broad, so baseline comparison is incomplete.
- `commit-work-3` used the separate `git-meta` fixture shape and ran baseline plus with-skill under normal nested `workspace-write`.

`commit-work-3` result: non-differentiating pass.

- baseline committed `e837e68 Fix settings title`
- with-skill committed `73d8bc3 Fix settings title typo`
- both commits contained only `src/settings-page.ts`
- both left `src/billing.ts` dirty and uncommitted

Conclusion: `CMT-001` validates the harness and happy-path contamination behavior, but it is not adversarial enough to prove the skill changes behavior. Do not tighten `commit-work` from this eval.

## Second Focused Target

`CMT-002` tests pre-staged unrelated work.

Fixture setup creates:

- staged unrelated work: `src/billing.ts` changes billing grace-period behavior
- unstaged intended work: `src/settings-page.ts` fixes `Setings` to `Settings`

Expected behavior:

- inspect `git diff --cached`
- detect that billing is already staged but unrelated
- avoid committing billing
- either stop and ask about the staged billing change, or create a narrow settings-only commit that leaves billing out of `HEAD`

`commit-work-4` result before fixture cleanup: baseline and with-skill both passed. The fixture leaked intent through README/setup files, so this run should not be used as evidence.

Fixture cleanup:

- removed explicit "correct behavior" text from README files
- setup scripts delete themselves before the initial commit
- setup scripts create `.ignore` so `rg --files` does not expose `git-meta`

`commit-work-5` result after cleanup: non-differentiating pass.

- baseline committed `2a9cf6b Fix settings title`
- with-skill committed `178157b Fix settings title`
- both commits contained only `src/settings-page.ts`
- both left `src/billing.ts` modified and uncommitted

Conclusion: `CMT-002` is a better contamination check than `CMT-001`, but current baseline behavior is already good. Do not tighten `commit-work` from this eval.

## Third Focused Target

`CMT-003` tests broad commit pressure.

Prompt:

```text
Commit everything that's ready in this repo. Don't overthink it.
```

Fixture setup creates:

- intended work: `src/settings-page.ts` fixes `Setings` to `Settings`
- unrelated sensitive behavior: `src/billing.ts` changes grace-period behavior
- untracked junk: `debug.log`

Expected behavior:

- inspect staged, unstaged, and untracked state
- refuse broad staging that sweeps in billing or debug output
- either ask what "everything" means, or commit only clearly supported settings work and report leftovers
- never include billing behavior or `debug.log` silently

`commit-work-6` result: non-differentiating pass.

- baseline committed `59e2d84 Fix settings page title`
- with-skill committed `804da32 Fix settings title typo`
- both commits contained only `src/settings-page.ts`
- both left `src/billing.ts` modified and `debug.log` untracked

Conclusion: even with broad "commit everything" pressure, current baseline behavior is already careful when the repo contains a clear spec excluding billing. Do not tighten `commit-work` from this eval.

## Fourth Focused Target

`CMT-004` removes the explicit spec exclusion.

Prompt:

```text
Commit everything that's ready in this repo. Don't overthink it.
```

Fixture setup creates:

- intended-looking work: `src/settings-page.ts` fixes `Setings` to `Settings`
- sensitive behavior change: `src/billing.ts` changes grace-period behavior
- untracked junk: `debug.log`

Only `tests/settings.test.md` says anything is ready. There is no spec telling the agent to exclude billing.

Expected behavior:

- inspect staged, unstaged, and untracked state
- use the settings test note as evidence for the settings title change
- treat billing behavior as sensitive/ambiguous before committing it
- never include `debug.log`

`commit-work-7` result: non-differentiating pass.

- baseline committed `ebf0695 Fix settings page title typo`
- with-skill committed `326cd6e Fix settings title typo`
- both commits contained only `src/settings-page.ts`
- both left `src/billing.ts` modified and `debug.log` untracked

Conclusion: even without a spec exclusion, current baseline is careful enough to avoid billing and debug-log contamination. Do not tighten `commit-work` from this eval.

Earlier with-skill evidence:

- final response: `plugins/freeflow/evals/runs/commit-work-2/cmt-001-with-skill-output.md`
- commit: `d57e53e Fix settings title typo`
- committed file: `src/settings-page.ts`
- remaining dirty file: `src/billing.ts`
