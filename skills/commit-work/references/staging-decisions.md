# Staging Decisions

Read this when staged, unstaged, or untracked changes have mixed ownership or concerns; a path contains both included and excluded work; existing staged ownership is uncertain; generated, durable, sensitive, or suspicious files appear; or narrowing may require changing existing staged state.

This reference determines what may enter the checkpoint. It does not establish commit authority, verification, review readiness, or permission to alter user-owned work.

## Classify The Changed Units

Classify at the path level only when the whole path has one role. Otherwise classify individual hunks.

- **Checkpoint content:** directly implements or proves the checkpoint claim.
- **Required companion:** tests, documentation, schema, metadata, or generated output required for that same claim.
- **Related but separable:** useful work that does not need to be preserved in this checkpoint.
- **Unrelated or user-owned:** work outside the accepted outcome or whose ownership is not established.
- **Sensitive or unsafe:** secrets, credentials, personal data, environment files, debug output, destructive state, or unexplained artifacts.
- **Unclear:** content whose purpose, generator, ownership, or evidence relationship is not yet supported.

Only checkpoint content and required companions belong.

A broad request such as "commit everything" may authorize broad inclusion, but it does not remove the obligation to inspect unsafe, unclear, or unexpectedly unrelated content.

## Protect Existing Staged State

Existing staged changes may belong to another workflow.

Inspect them, but do not infer that they are intended merely because they are staged. Do not silently:

- absorb them into the checkpoint;
- unstage or reset them;
- amend them into another commit;
- move them through a stash or temporary commit;
- replace the index or use index tricks to bypass ownership ambiguity.

When intended and pre-existing staged work cannot be separated without manipulating ambiguous state, present the smallest safe options and ask which checkpoint the user wants.

## Handle Partial Files Carefully

A file may contain both checkpoint and excluded hunks. Stage only the intended hunks when their behavior and evidence remain independently coherent.

Stop when:

- included and excluded hunks depend on each other;
- partial staging would produce an invalid intermediate state;
- verification ran against the combined working tree and excluded changes may have affected the result;
- the staged version differs materially from the state that was reviewed or verified.

Do not claim an isolated staged checkpoint is supported merely because the combined dirty worktree passed.

## Include Generated Files Deliberately

Include generated files, snapshots, lockfiles, formatter output, or build artifacts only when repository convention or the accepted outcome requires them.

Establish:

- which command or generator produced them;
- whether their changes are expected from the accepted source change;
- whether they are deterministic enough to review;
- whether hand edits are prohibited;
- whether their verification belongs to the checkpoint evidence.

Do not include generated output merely because it changed. Do not hand-edit it unless the repository explicitly expects that workflow.

## Preserve Durable Artifacts Honestly

A Spec, Plan, ADR, policy, public documentation file, or release artifact may have authority and maintenance rules independent of implementation.

Include it only when:

- its change is explicitly covered;
- it belongs to the same coherent checkpoint;
- it describes the same accepted behavior;
- its own maintenance policy permits the update.

Do not edit a durable artifact merely to make implementation appear coherent. Return contradictions to [Workflow](../../workflow/SKILL.md).

Working Records under `.freeflow/tasks/**` are ignored local memory and must never be staged or committed.

## Reject Sensitive Or Suspicious Content

Stop before staging:

- secrets, tokens, credentials, private keys, or local environment files;
- databases, dumps, recordings, or personal data;
- unexplained binaries or generated archives;
- logs, traces, screenshots, or debug output not explicitly required;
- destructive state or files whose inclusion could expose or lose user data.

Do not "clean up" suspicious files by deleting or discarding them. Preserve their state and report the exact paths.

## Verify The Candidate

After staging, compare all three states:

```bash
git diff --cached
git diff
git status --short --branch
```

The checkpoint is narrow only when:

- the index contains exactly the intended checkpoint;
- excluded work remains untouched;
- remaining dirty state is understood;
- verification still supports the staged version rather than only the combined worktree;
- the final report can name everything left behind.
