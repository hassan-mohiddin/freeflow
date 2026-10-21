# Commit: Staging Decisions And Git State

This reference is judgment about what enters a commit and how to handle unusual Git state; each "do not" and each stop is binding. It grants no commit authority and no permission to alter work that is not yours.

## Classify The Changed Units

Classify at the path level only when the whole path has one role; otherwise classify hunks.

- **Commit content:** implements or proves the commit's claim.
- **Required companion:** tests, documentation, schema, metadata or generated output the same claim needs.
- **Related but separable:** useful, but not needed in this commit.
- **Unrelated or not yours:** outside the agreed outcome, or ownership not established.
- **Sensitive or unsafe:** secrets, credentials, personal data, environment files, debug output, destructive state or unexplained artifacts.
- **Unclear:** purpose, generator, ownership or evidence relationship not yet supported.

Only commit content and required companions belong. "Commit everything" may authorize broad inclusion; it does not remove the need to inspect unsafe, unclear or unexpectedly unrelated content.

## Protect Existing Staged State

Staged changes may belong to another workflow. Inspect them, but do not treat them as intended because they are staged. Do not silently absorb them, unstage or reset them, amend them into another commit, move them through a stash or temporary commit, or replace the index to get around the ambiguity.

When your changes and pre-existing staged work cannot be separated without touching ambiguous state, present the smallest safe options and ask which commit the user wants.

## Stage Partial Files Carefully

Stage only the intended hunks of a mixed file when their behavior and evidence hold on their own. Stop when:

- included and excluded hunks depend on each other;
- partial staging would leave an invalid intermediate state;
- checks ran against the combined working tree and excluded changes may have affected the result;
- the staged version differs materially from what was reviewed or verified.

A combined dirty worktree passing does not show that the staged subset is supported.

## Include Generated And Durable Files Deliberately

Include generated files, snapshots, lockfiles, formatter output or build artifacts only when repository convention or the agreed outcome requires them. Establish which command produced them, whether their change follows from the source change, whether they can be reviewed, and whether hand edits are prohibited. Do not include generated output merely because it changed, and do not hand-edit it unless the repository expects that.

A Spec, Plan, ADR, policy, public documentation file or release artifact has its own authority and maintenance rules. Include it only when its change is covered, belongs to the same commit, describes the same agreed behavior, and its own policy permits the update. Do not edit a durable artifact to make the implementation look coherent; settle contradictions through [Agree Work](../../agree-work/SKILL.md).

## Reject Sensitive Or Suspicious Content

Besides the trunk's never-stage list, stop before staging databases, dumps, recordings, personal data, unexplained binaries or archives, logs, traces, screenshots or debug output not explicitly required, and files whose inclusion could expose or lose user data. Do not delete or discard suspicious files to tidy up: preserve them and report their exact paths.

## Verify The Candidate

After staging, compare `git diff --cached`, `git diff` and `git status --short --branch`. The commit is narrow only when the index holds exactly the intended change, excluded work is untouched, remaining dirty state is understood, checks still support the staged version rather than only the combined worktree, and the report can name everything left behind.

## In-Progress Operations

A commit during a merge, rebase, cherry-pick or revert may complete or advance that operation instead of creating an ordinary commit. Establish which operation is active, whether this commit is meant to conclude it, whether every conflict and behavior decision is settled, who should continue it, and what must be verified on the result. Do not finish an operation merely because Git permits `commit`. Unmerged paths always stop an ordinary commit.

## Detached HEAD

A detached-`HEAD` commit can be hard to recover or push. Before committing, require an explicit way the commit will stay reachable; when a branch, integration or checkout ownership must be decided, use [branch closeout](branch-closeout.md). Do not silently create or switch branches.

## Amend And Empty Commits

Amend only when the user asked for it and the target commit, included changes, authorship effects and remote-history state are known. If the target may already be shared or pushed, ask before rewriting it. An empty commit needs an explicit request with a named purpose; an accidentally empty index is not one.

## Hooks

When a hook fails:

1. keep its complete output;
2. inspect `HEAD`, the index and the working tree;
3. check whether a commit was created despite the failure;
4. check whether the hook changed files or staged content;
5. send implementation, verification, policy or environment failures to their owner.

When a hook changes content, the state being committed is no longer the one that was checked: reinspect the whole diff and rerun the affected checks before retrying. Skip hooks with `--no-verify` only when the user asked for that exact bypass and repository policy permits it, and report which checks were skipped and which claims that leaves unsupported.

## Failed Commit Commands

After a failed or interrupted commit, inspect `git status`, `git diff`, `git diff --cached` and `git log -1 --oneline --decorate`; do not assume no commit was created or nothing changed. For identity, signing, credential-helper, editor, lock, filesystem or permission failures, do not change global or repository Git configuration without authority, do not delete lock files while their owner is unclear, do not retry through a materially different command without a supported cause, and report the exact blocker and the preserved state. Use [Diagnose Failure](../../diagnose-failure/SKILL.md) when the cause stays unclear or a retry repeats the failure.

## Submodules

A parent commit records a submodule pointer, not the submodule's uncommitted contents. Inspect the pointer change, whether the nested worktree is dirty, whether this commit should include the pointer update, and whether nested changes have their own way to be preserved. Do not claim nested changes are preserved by committing only the parent.

## Return

Go back to the trunk's Commit steps only when the repository has one supported, recoverable candidate. Otherwise preserve the exact Git state and hand over to branch closeout, Diagnose Failure, or the activity whose responsibility changed.
