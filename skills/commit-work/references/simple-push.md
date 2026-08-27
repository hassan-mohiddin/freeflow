# Simple Push

Read this before performing any push through Commit Work.

A **simple push** sends inspected local commits from the current named branch to one explicit or established remote branch without force, deletion, tag publication, integration, pull-request creation, release, or deployment.

Use [Finish Branch](../../finish-branch/SKILL.md) when the route requires choosing how to integrate, share, preserve, rewrite, or clean up branch state.

## Confirm Push Authority

Push requires authority separate from local commit.

Confirm:

- which commits are intended;
- the local branch;
- the destination remote and branch;
- whether setting a new upstream is included;
- that no force, deletion, tag, or history rewrite is implied.

Do not infer a remote, destination branch, pull-request target, or shared-branch policy when the wrong choice could affect collaborators.

## Inspect The Route

Inspect:

```bash
git branch --show-current
git status --short --branch
git branch -vv
git remote -v
git log -1 --oneline --decorate
```

When an upstream exists, inspect:

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{upstream}
git rev-list --left-right --count @{upstream}...HEAD
```

Ahead/behind state is only as fresh as the local remote-tracking reference. Do not claim current remote state unless it was freshly observed.

Stop before pushing when:

- `HEAD` is detached;
- destination or upstream is unclear;
- unexpected commits or dirty state change the route;
- protected or shared-branch policy disallows the push or leaves its route unclear;
- local and observed upstream history diverge;
- the push would require force, deletion, tag publication, or another separately controlled action.

## Push The Exact Branch

Use the established upstream when it clearly matches the approved route.

When no upstream exists, set one only when the remote and branch destination are explicit and the configuration change is included in the accepted route.

Do not push additional branches or tags.

A force push is not a simple push. Return an explicitly requested history rewrite to Workflow or Finish Branch.

## Handle Rejection Without Escalation

If the push is rejected or fails:

- preserve the complete result;
- do not automatically pull, merge, rebase, force, change remotes, or change destination;
- inspect whether any remote update occurred;
- return authentication, divergence, policy, or destination decisions to [Workflow](../../workflow/SKILL.md) or Finish Branch.

A failed push does not invalidate the local commit.

## Verify And Report

After a successful push, inspect:

```bash
git status --short --branch
git branch -vv
```

Report:

- pushed commit range;
- remote and destination branch;
- whether an upstream was created or changed;
- command result and strongest observed remote-state evidence;
- remaining unpushed commits or dirty state;
- CI, review, integration, release, or deployment work not established by the push.

A successful push proves transfer to the observed destination. It does not prove pull-request creation, merge, release, deployment, or remote CI success.
