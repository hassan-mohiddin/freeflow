# Branch Closeout

This reference covers a simple push, first, and then closing a branch or isolated checkout. The closeout part is judgment; its confirmation, ownership and conflict stops are binding. A verified branch does not authorize a merge or push, and a chosen integration route does not authorize branch deletion, worktree removal, release or deployment.

## Simple Push

Its stops and prohibitions are binding; the inspection commands are judgment.

This route is a **simple push**: inspected local commits from the current named branch to one explicit or established remote branch, with no force, deletion, tag publication, integration, pull request, release or deployment. When the request needs any of those, or a choice of how to integrate, share, preserve, rewrite or clean up branch state, use the branch routes below or [release](release.md) instead.

### Confirm What The Yes Covers

Confirm which commits are intended, the local branch, the destination remote and branch, and whether setting a new upstream is included. Do not infer a remote, destination branch, pull-request target or shared-branch policy when the wrong choice could affect collaborators.

### Inspect The Route

[push-route](../scripts/push-route.mjs) (`node <deliver-work-directory>/scripts/push-route.mjs [--remote <name>]`) reports the branch, upstream or destination, the commits it would send and the stop conditions below that local state shows, and prints the push command without running it. By hand:

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

### Push The Exact Branch

Use the established upstream when it clearly matches the approved route. Set a new upstream only when the remote and branch are explicit and the configuration change is part of the approved route. Push no other branches or tags. A force push is not a simple push: take an explicitly requested history rewrite to the branch routes below.

### Handle Rejection Without Escalation

If the push is rejected or fails, keep the complete result and check whether any remote update happened. Do not automatically pull, merge, rebase, force, change remotes or change destination; return authentication, divergence, policy or destination decisions to the user or to the branch routes below. A failed push does not invalidate the local commit.

### Check The Result

After a successful push, inspect `git status --short --branch` and `git branch -vv`, and report whether an upstream was set or changed. A push proves transfer to the observed destination, not a pull request, merge, release, deployment or passing remote CI.

## Inspect The Exact State

Before offering or executing a route, inspect:

- current branch, detached state, repository root and worktree ownership;
- the base branch or merge base that repository evidence supports;
- commits and diff relative to the base;
- staged, unstaged and untracked work;
- upstream, remote, and ahead or behind state;
- fresh verification, self-review and any selected independent review;
- CI, policy or repository gates for the intended route.

Do not infer the base, remote destination, pull-request target or workspace owner when the wrong choice could lose work or affect collaborators.

## Offer Only Supported Routes

The user decides whether to integrate locally and by which method, push or open a normal or draft pull request, keep the branch, worktree or dirty state, discard commits or uncommitted work, delete local or remote branches, rewrite or force-push history, and clean up a checkout or worktree.

Present only the routes the observed state supports; drop a route that is impossible, unsafe or irrelevant rather than forcing a fixed menu. Ask as [Discuss Work](../../discuss-work/SKILL.md)'s "Ask One Question" describes, with the supported routes as the options. Approval of one route covers only the scope shown and accepted. When a route needs a local commit, use the trunk's Commit steps; do not commit merely to make the branch look finished.

## State Readiness Honestly

Call a branch ready for its integration boundary only when the agreed outcome is clear, intended commits and remaining dirty state are known, fresh direct evidence supports the branch claim, self-review left no unresolved material issue, any selected independent review is resolved for the unchanged state, and no source conflict, owner decision, evidence gap or repository gate blocks the route. A feature-branch pass does not prove the integrated result.

Unverified or failing work may still be kept, handed off, or shared through an explicitly approved draft route: state the gaps, and do not call it ready to integrate.

## Hand Over For Acceptance

Goal: the user can accept or refuse the change from the hand-over alone, without rereading the conversation.

The pull-request description, or the final report when there is no pull request, carries:

- what done looks like, from the work agreement, against what was done, naming anything left out or changed on the way;
- choices the user has not seen, from Discuss Work's decision list: its `new`, `changed` and `default` items, each with where it shows;
- the evidence: each check run on the final state and its result;
- the review outcome: self-review only, or each independent review's judgment with every Rejected finding and why.

Build it from the Working Record ([Track Work](../../track-work/SKILL.md)) when one exists, not from memory. When the repository has a pull-request template or convention, fit these into it. Otherwise write a short briefing from which a reviewer who has the diff can accept or reject the change: why it exists; what changed; its scope, including what it deliberately leaves out; what else it could affect and how risky that is; and the hand-over above.

## Execute Only The Chosen Route

### Local Integration

1. Keep or resolve dirty state deliberately.
2. Refresh base evidence without overwriting local work.
3. Integrate with the repository's merge or rebase policy, without rewriting unrelated history.
4. Run the checks that prove the combined result on the resulting base.
5. Inspect the final log and status.
6. Remove branch or worktree state only when cleanup was part of the approved route and integration verification succeeded.

### Pull Request

Fits when review, CI, collaboration, protected branches or remote integration owns the next gate.

- Inspect remote and upstream state, then push only the intended commits to the accepted destination, as [Simple Push](#simple-push) checks them.
- Capture the target branch, commit range, residual risks, migrations, rollout or compatibility notes, and the reviewers or checks repository policy requires.
- Create or update the pull request by repository convention, with the hand-over as its description; mark incomplete or failing work as draft when that is the approved route.
- Keep the worktree when iteration or feedback may continue.

A pull-request URL proves creation, not readiness or merge.

### Keep For Later

Fits when the work is valid but integration is deferred, feedback is expected, or environment ownership prevents cleanup. Report the trunk's lines plus why the branch is kept and what would end the wait. Read Track Work's [handoff](../../track-work/references/handoff.md) only when continuing needs durable transfer context.

### Discard

Classify what is recoverable before deleting anything: uncommitted changes may be unrecoverable; local commits may be recoverable through the reflog for a limited time; pushed commits may affect collaborators; worktrees may be owned by a harness; deleting a remote branch reaches further than local cleanup. State exactly which commits, paths, branches, worktrees and remote state would be lost and what stays recoverable, and require explicit confirmation of that concrete scope. "Finish", "clean up", a menu number or approval of integration is not confirmation of broader destruction.

## Protect Workspace Ownership

Do not remove a worktree, checkout, session or harness state you did not create or are not authorized to manage; if ownership is unclear, keep it and report the uncertainty. Do not assume a detached checkout is disposable: an IDE, CI system, coding harness or worktree manager may own it, so offer only routes that environment supports, such as creating a named branch, keeping the checkout, exporting a patch, or asking the harness to close it.

## Return Conflicts And Failures

Deliver Work's Stop list says when a conflict stops the route. Stop and report it with its evidence also when resolving it would make a user-owned choice (Discuss Work), or choose between changed tests and changed implementation, incompatible migrations or data ownership, or two architecture directions; the next route may be Discuss Work, review, diagnosis, or a Spec or Plan revision.

Use Execute Work's [diagnose](../../execute-work/references/diagnose.md) when integrated checks fail without a supported cause. Take mixed or unrelated branch contents back to the [commit](commit.md) staging decisions. Keep branch state before handing to another activity.
