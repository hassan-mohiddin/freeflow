# Staging Decisions

Use this for mixed staged sets, generated files, durable docs, or broad commit pressure.

## Evidence First

Read staged, unstaged, and untracked state before deciding:

- `git status --short`
- `git diff --cached`
- `git diff`
- `git ls-files --others --exclude-standard`

Diff evidence beats "staged means ready", "commit everything", and "include all leftovers".

## Mixed Staged Sets

Staged changes can still be wrong.

Stop or make a narrow commit when the staged set mixes separable concerns, such as:

- release note or copy edits plus product behavior
- source code plus local debug output
- generated files plus hand edits
- source-truth docs plus implementation changes that have not been confirmed
- security, billing, permissions, privacy, migration, or public API behavior with unrelated work

If a sensitive staged change conflicts with docs, tests, policy, or contracts, do not commit it just because it is staged.

## Narrow Commit Rule

Make a narrow commit only when:

- the intended scope is clear
- the included files are all part of that scope
- excluded changes can remain staged or dirty without being lost
- the final response reports remaining staged/dirty/untracked work

If excluding files would require unstaging or rearranging user-owned work, ask first unless the repo clearly supports a safe path.

## Generated Files

Do not commit generated files, logs, snapshots, lockfiles, build outputs, or formatter churn unless the task or repo convention makes them part of the intended change.

If generated output is required, name the generator or verification that produced it.

## Durable Docs

Durable specs, ADRs, policies, handoffs, and runbooks are source truth. Commit them with code only when they describe the same confirmed change.

If a durable doc changes policy, status, ownership, public API behavior, billing, privacy, security, data loss, migration, or compatibility, treat that as a user-owned decision unless already confirmed.
