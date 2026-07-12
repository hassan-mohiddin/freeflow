# Staging Decisions

Use this when staged state is mixed, generated files or durable docs appear, broad commit/push language conflicts with the diff, or producing a narrow checkpoint may touch user-owned work.

## Evidence First

Inspect:

- `git status --short`
- `git diff --cached`
- `git diff`
- `git ls-files --others --exclude-standard`

Diff evidence beats “staged means ready,” “commit everything,” “push all changes,” and “include every leftover.”

## Classify Paths

For each changed path, classify:

- **Checkpoint:** directly implements or proves the intended slice.
- **Required generated output:** repo convention or task requires it and its generator is known.
- **Durable source truth:** spec, policy, ADR, or plan describing the same confirmed change.
- **Durable continuation memory:** handoff describing the same checkpoint without becoming authority over live evidence.
- **Related but separable:** useful work that should remain outside this checkpoint.
- **Unrelated or user-owned:** not part of the current outcome.
- **Sensitive or unsafe:** secrets, private data, debug output, destructive state, or unclear generated content.

Do not infer ownership from staging state.

## Narrow Checkpoint

A narrow commit is safe when:

- its outcome and source requirement are clear;
- every included path belongs to that outcome;
- verification supports the claim represented by the commit;
- required review status is known;
- excluded changes can remain untouched without loss;
- the final report names remaining dirty state.

Stage explicit paths or hunks. If narrowing requires unstaging, rearranging, regenerating, or modifying user-owned work, stop unless the user or repo workflow already authorized that operation.

## Mixed Concerns

Separate changes when combining them harms review, diagnosis, or rollback, especially:

- behavior plus unrelated refactoring;
- source code plus local debug output;
- generated artifacts plus unexplained hand edits;
- durable source-truth changes plus implementation that has not been confirmed;
- security, privacy, billing, permissions, migration, data-loss, compatibility, or public API behavior plus unrelated work;
- learning-slice evidence plus production changes that have not passed promotion criteria.

A single coherent behavior with its tests and matching docs may belong together.

## Generated Files

Commit generated files, snapshots, lockfiles, build outputs, or formatter changes only when the task or repo convention makes them part of the checkpoint.

Name the generator or command that produced required output. Do not hand-edit generated files unless the repo explicitly expects it.

## Durable Artifacts

Specs, ADRs, policies, plans, and handoffs can carry authority or future memory. Include them with code only when they describe the same settled change.

If a durable artifact changes behavior, ownership, status, policy, API, compatibility, security, privacy, billing, permissions, migration, or data-loss expectations, use the decision gate unless that change is already explicit.

## Existing Staged State

Existing staged changes may belong to another workflow. Inspect them, but do not silently unstage, amend, discard, or absorb them.

When ownership remains ambiguous, present the smallest safe staging options and ask which checkpoint the user wants.