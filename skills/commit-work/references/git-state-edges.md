# Git State Edges

Read this when Git reports an in-progress operation, unmerged paths, detached `HEAD`, submodule ambiguity, or an empty candidate; a requested commit would amend, be empty, or bypass hooks; or any commit or hook fails.

These states can change the meaning or recoverability of a commit. Inspect before choosing a recovery action.

## In-Progress Operations

A commit during merge, rebase, cherry-pick, or revert may complete or advance that operation rather than create an ordinary checkpoint.

Stop and establish:

- which operation is active;
- whether the current checkpoint is intended to conclude it;
- whether all conflicts and behavior decisions are settled;
- which owner should continue the operation;
- what verification is required on the resulting state.

Do not use Commit Work to finish an operation merely because Git currently permits `commit`.

Unmerged paths always stop an ordinary commit.

## Detached HEAD

A detached-`HEAD` commit may be valid but can become difficult to recover or push.

Before committing, require an explicit preservation route naming how the resulting commit will remain reachable. Use [Finish Branch](../../finish-branch/SKILL.md) when branch creation, integration, or checkout ownership must be decided.

Do not silently create or switch branches.

## Amend And Empty Commits

`git commit --amend` rewrites an existing checkpoint. Use it only when the user explicitly requests amendment and the exact target commit, included changes, authorship effects, and remote-history state are known.

If the target may already be shared or pushed, return to [Workflow](../../workflow/SKILL.md) or Finish Branch before rewriting it.

Use `--allow-empty` only for an explicitly requested empty checkpoint with a named repository purpose. An accidentally empty index is not authorization for an empty commit.

## Hooks

Do not bypass hooks merely because they block the commit.

When a hook fails:

1. preserve its complete result;
2. inspect `HEAD`, the index, and working tree;
3. determine whether a commit was created despite the reported failure;
4. determine whether the hook changed files or staged content;
5. return implementation, verification, policy, or environment failures to their owning route.

When a hook changes repository content, the previously supported state may no longer be the state being committed. Reinspect the complete diff and obtain affected verification before retrying.

Use `--no-verify` only when the user explicitly requests that exact bypass and repository policy permits it. Report which checks were skipped and which claims therefore remain unsupported.

## Commit Command Failures

After any failed or interrupted commit attempt, inspect:

```bash
git status
git diff
git diff --cached
git log -1 --oneline --decorate
```

Do not assume failure means no commit was created or no state changed.

For identity, signing, credential-helper, editor, lock, filesystem, or permission failures:

- do not change global or repository Git configuration without authority;
- do not delete lock files while process ownership is unclear;
- do not retry through a materially different command without a supported cause;
- report the exact blocker and preserved state.

Use [Diagnose Failure](../../diagnose-failure/SKILL.md) when the cause remains unclear or a retry repeats the failure.

## Submodules

A parent commit records a submodule pointer, not the submodule's uncommitted contents.

Inspect:

- the recorded pointer change;
- whether the nested worktree is dirty;
- whether the intended checkpoint includes the pointer update;
- whether nested changes have their own preservation route.

Do not claim nested changes are preserved by committing only the parent repository.

## Return Safely

Return to Commit Work only when the repository has one supported, recoverable checkpoint candidate.

Otherwise preserve the exact Git state and return to Workflow, Finish Branch, Diagnose Failure, or the producing activity whose responsibility changed.
