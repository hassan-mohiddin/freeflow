# Push

The stops and prohibitions below are binding; the inspection commands are judgment.

This route is a **simple push**: inspected local commits from the current named branch to one explicit or established remote branch, with no force, deletion, tag publication, integration, pull request, release or deployment. When the request needs any of those, or a choice of how to integrate, share, preserve, rewrite or clean up branch state, use [branch closeout](branch-closeout.md) or [release](release.md) instead.

## Confirm What The Yes Covers

Confirm which commits are intended, the local branch, the destination remote and branch, and whether setting a new upstream is included. Do not infer a remote, destination branch, pull-request target or shared-branch policy when the wrong choice could affect collaborators.

## Inspect The Route

```bash
git branch --show-current
git status --short --branch
git branch -vv
git remote -v
git log -1 --oneline --decorate
```

When an upstream exists, also:

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{upstream}
git rev-list --left-right --count @{upstream}...HEAD
```

Ahead and behind counts are only as fresh as the local remote-tracking reference; do not claim current remote state unless you observed it freshly.

Stop before pushing when:

- `HEAD` is detached;
- the destination or upstream is unclear;
- unexpected commits or dirty state change the route;
- protected or shared-branch policy disallows the push or leaves it unclear;
- local and observed upstream history diverge;
- the push would need force, deletion, tag publication or another separately controlled action.

## Push The Exact Branch

Use the established upstream when it clearly matches the approved route. Set a new upstream only when the remote and branch are explicit and the configuration change is part of the approved route. Push no other branches or tags. A force push is not a simple push: take an explicitly requested history rewrite to branch closeout.

## Handle Rejection Without Escalation

If the push is rejected or fails, keep the complete result and check whether any remote update happened. Do not automatically pull, merge, rebase, force, change remotes or change destination; return authentication, divergence, policy or destination decisions to the user or to branch closeout. A failed push does not invalidate the local commit.

## Check The Result

After a successful push, inspect `git status --short --branch` and `git branch -vv`, and report whether an upstream was set or changed. A push proves transfer to the observed destination, not a pull request, merge, release, deployment or passing remote CI.
