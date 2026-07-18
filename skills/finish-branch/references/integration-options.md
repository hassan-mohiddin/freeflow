# Integration Options

Use this after inspecting branch, base, remote, dirty state, verification, and workspace ownership.

## Local Integration

Appropriate when the user wants the branch integrated locally and repository policy permits it.

Before cleanup:

1. preserve or resolve dirty state deliberately;
2. update base evidence safely;
3. integrate without rewriting unrelated history;
4. run the checks that prove the combined result;
5. inspect final log and status;
6. remove branch/worktree state only after success.

A feature-branch pass does not prove the merged result.

## Pull Request

Appropriate when review, CI, collaboration, protected branches, or remote integration owns the next gate.

Capture:

- target branch and commit range;
- intended push/upstream behavior;
- PR summary and source requirements;
- verification already run;
- known residuals, migrations, rollout, or compatibility notes;
- required reviewers or checks from repo policy.

A draft pull request may preserve or share incomplete work when that route is explicitly approved. State failing or unavailable evidence. Do not claim merge readiness from a pull-request URL alone.

## Keep For Later

Appropriate when work is valid but integration is deferred, feedback is expected, or environment ownership prevents cleanup.

Report:

```text
Branch / worktree:
Commit and dirty state:
Review / verification:
Reason preserved:
Next action:
Stop conditions:
```

## Discard

Classify what is recoverable before deleting:

- uncommitted changes may be unrecoverable;
- local commits may be recoverable through reflog for a limited time;
- pushed commits may affect collaborators;
- worktrees may be harness-owned;
- remote branch deletion has a different scope from local cleanup.

Show the exact destructive operations and require explicit confirmation that matches their scope.

## Detached Or Managed Checkouts

Do not assume a detached checkout is disposable. It may be owned by an IDE, CI system, coding harness, or external worktree manager.

Offer only routes supported by that environment, such as creating a named branch, preserving the checkout, exporting a patch, or asking the harness to close it.

## Conflict Handling

Mechanical conflict resolution is safe only when both sides' intended behavior is already settled.

Stop when conflict resolution would choose between:

- competing product or API behavior;
- changed tests versus changed implementation;
- incompatible migrations or data ownership;
- security, privacy, billing, permissions, or compatibility policies;
- two architecture directions.

Return the conflict and evidence to Workflow. The next route may be review, diagnosis, Decision Gate, Spec revision, or Plan revision—not “take ours” or “take theirs.”
