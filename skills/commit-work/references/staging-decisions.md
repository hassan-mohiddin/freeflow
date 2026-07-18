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
- **Durable artifact:** Spec, policy, ADR, or Plan that belongs to the same accepted checkpoint while retaining its own authority and lifecycle.
- **Durable continuation memory:** Working Record or Handoff describing the same checkpoint without becoming authority over live evidence.
- **Related but separable:** useful work that should remain outside this checkpoint.
- **Unrelated or user-owned:** not part of the current outcome.
- **Sensitive or unsafe:** secrets, private data, debug output, destructive state, or unclear generated content.

Do not infer ownership from staging state.

## Narrow Checkpoint

A narrow commit is safe when:

- an explicit request, user-approved Plan, or explicitly approved discussion authorizes the local checkpoint;
- its outcome and source requirement are clear;
- every included path belongs to that outcome;
- verification supports the claim represented by the commit;
- selected review status is known and [Workflow](../../workflow/SKILL.md) supports the checkpoint route;
- excluded changes can remain untouched without loss;
- the final report names remaining dirty state.

Plan approval does not prove that every current path belongs. Stage explicit paths or hunks. If narrowing requires unstaging, rearranging, regenerating, or modifying user-owned work, stop unless the user or repo workflow already authorized that operation.

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

Specs, policies, and ADRs may govern behavior. Plans preserve approved strategy; Working Records and Handoffs preserve memory. Include any of them with code only when they belong to the same coherent checkpoint and their own maintenance rules support the change.

Do not revise a durable artifact merely to make the commit appear coherent. Return a material inconsistency to [Workflow](../../workflow/SKILL.md); use [Decision Gate](../../decision-gate/SKILL.md) when one user-owned choice or source conflict blocks the checkpoint.

## Existing Staged State

Existing staged changes may belong to another workflow. Inspect them, but do not silently unstage, amend, discard, or absorb them.

When ownership remains ambiguous, present the smallest safe staging options and ask which checkpoint the user wants.
