---
name: finish-branch
description: Use when deciding how to integrate, preserve, or discard work on a branch or isolated checkout.
---

# Finish Branch

Close a branch or isolated checkout without confusing readiness, integration, publication, and cleanup authority.

A verified branch does not authorize merge or push. A chosen integration route does not automatically authorize branch deletion, worktree removal, release, or deployment.

## Inspect The Exact State

Before offering or executing a route, inspect:

- current branch, detached state, repository root, and worktree ownership;
- base branch or merge base supported by repository evidence;
- commits and diff relative to the base;
- staged, unstaged, and untracked work;
- upstream, remote, and ahead/behind state;
- fresh verification, silent self-review, and any selected independent-review status;
- CI, policy, or repository gates relevant to the intended route.

Do not infer the base, remote destination, pull-request target, or workspace owner when the wrong choice could lose work or affect collaborators.

After inspecting branch, base, remote, dirty state, verification, and workspace ownership, read [integration options](references/integration-options.md) before choosing local integration, pull request, preservation, discard, or cleanup. Use [Commit Work](../commit-work/SKILL.md) when the selected route requires a local commit or simple push; do not commit merely to make branch status look finished.

Use [Release Work](../release-work/SKILL.md) for a separately approved versioned release and [Launch Work](../launch-work/SKILL.md) for a separately approved production deployment or rollout.

## Keep Route Authority Explicit

Loading this skill, asking whether a branch is ready, or approving a general implementation Plan does not authorize merge, rebase, push, pull-request creation, branch deletion, worktree removal, discard, force push, release, or deployment.

The user owns whether to:

- integrate locally and by which repository-supported method;
- push or create/update a normal or draft pull request;
- preserve the branch, worktree, or dirty state;
- discard commits or uncommitted work;
- delete local or remote branches;
- rewrite or force-push history;
- clean up a checkout or worktree.

Present only routes supported by the observed state. Do not force a fixed menu when an option is impossible, unsafe, or irrelevant. Approval of one route covers only the scope shown and accepted.

## State Readiness Honestly

Present a branch as ready for its intended integration boundary only when:

- the accepted branch outcome is clear;
- intended commits and remaining dirty state are known;
- fresh direct evidence supports the branch claim;
- silent self-review has no unresolved material issue;
- any selected independent review is resolved for the unchanged state;
- no source conflict, owner decision, required evidence gap, or repository gate blocks the route.

Read [Verify Work](../verify-work/SKILL.md) when matching branch-readiness claims to evidence. A feature-branch pass does not prove the integrated result.

Unverified or failing work may still be preserved, handed off, or shared through an explicitly approved draft route. State the gaps; do not describe it as integration-ready.

## Execute Only The Chosen Route

### Local Integration

- refresh base evidence without overwriting local work;
- use the repository's accepted merge or rebase policy;
- stop when a conflict requires a behavior, source, or owner decision;
- verify the integrated result on the resulting base state;
- delete branch or worktree state only when cleanup was included in the approved route and integration verification succeeded.

### Pull Request

- inspect remote and upstream state before pushing;
- push only intended commits to the accepted destination;
- create or update the pull request using repository conventions;
- mark incomplete or failing work as draft when that is the approved route;
- report CI, review, merge, migration, release, or launch requirements still pending;
- preserve the worktree when iteration or feedback may continue.

A pull-request URL proves creation, not readiness or merge.

### Preserve

Report the branch, worktree, commit and dirty state, evidence status, reason preserved, and next approved route. Read [Handoff](../handoff/SKILL.md) only when continuation needs durable transfer context.

### Discard

Before destructive action, state exactly which commits, paths, branches, worktrees, and remote state would be lost and what remains recoverable. Require explicit confirmation for that concrete scope.

Do not treat “finish,” “clean up,” a menu number, or approval of integration as confirmation for broader destruction.

## Protect Workspace Ownership

Do not remove a worktree, checkout, session, or harness state you did not create or are not authorized to manage. If ownership is unclear, preserve it and report the uncertainty.

Do not run destructive reset, clean, branch deletion, worktree removal, remote deletion, or force push merely to produce a clean status.

## Return Conflicts And Failures

Resolve a conflict locally only when both sides' intended behavior is settled and the resolution is mechanical. Return behavior, source-truth, API, data, security, compatibility, or architecture conflicts to [Workflow](../workflow/SKILL.md).

Use [Diagnose Failure](../diagnose-failure/SKILL.md) when integrated checks fail without a supported cause. Return mixed or unrelated branch contents to [Commit Work](../commit-work/SKILL.md), which owns staging decisions. Preserve branch state before re-entering another owning activity.

## Report The Chosen Outcome

Report:

- branch, base, and selected route;
- commit and dirty state handled or preserved;
- integration, push, or pull-request result;
- verification on the final observed state;
- selected-review and repository-gate status;
- cleanup performed or deliberately omitted;
- unresolved CI, review, migration, release, or deployment work;
- recoverability and next approved route.

Branch closeout is complete only for the chosen route. A pushed branch is not merged, a merged branch is not released, and a released artifact is not deployed.
