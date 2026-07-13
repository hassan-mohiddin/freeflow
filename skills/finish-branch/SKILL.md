---
name: finish-branch
description: Use when work on a branch or isolated checkout has reached a stopping point and the next job is to inspect integration readiness, choose merge/PR/keep/discard, verify the integrated result, or clean up branch/worktree state safely.
---

# Finish Branch

Close a development branch without confusing “the code is ready” with “the integration route is approved.”

This skill begins after implementation has reached a verified or explicitly unverified checkpoint. Use `../commit-work/SKILL.md` first when intended work is not yet committed. Use `../release-work/SKILL.md` for versioned releases and `../launch-work/SKILL.md` for production deployment.

## Inspect Before Offering A Route

Inspect:

- current branch, detached state, and repository root;
- base branch or merge base supported by evidence;
- commits and diff relative to the base;
- staged, unstaged, and untracked work;
- upstream, remote, and ahead/behind state;
- worktree ownership and whether the active harness owns cleanup;
- sequential self-check and parallel independent-verifier/final-review status for the branch outcome.

Do not infer the base branch, remote destination, PR target, or workspace ownership when the wrong choice could lose work or affect collaborators.

Read [integration options](references/integration-options.md) when selecting merge, PR, keep, discard, or cleanup behavior.

## Gate The Choice

The user owns whether to:

- integrate locally;
- push and create or update a PR;
- keep the branch or worktree for later;
- discard commits or uncommitted work;
- delete local or remote branches;
- rewrite or force-push history.

Present only routes that fit the observed repository state. Do not force a four-option menu when an option is impossible or unsafe.

A direct call to this skill means “prepare branch closeout,” not approval to merge, push, delete, discard, or clean up.

## Readiness

Before presenting a branch as ready to integrate, require:

- the accepted branch outcome is clear;
- intended commits and remaining dirty state are known;
- fresh direct evidence supports the readiness claim;
- a distinct verifier passed and reviewer resolved in parallel against the same unchanged branch state; unavailable or skipped assurance means the branch may be kept or handed off but not presented as ready;
- no unresolved source conflict, owner decision, or required evidence gap blocks integration.

If checks fail, report that the branch is not ready for merge/PR approval. Keeping the branch, handing off, or choosing a diagnostic route may still be valid.

## Execute The Chosen Route

### Local Integration

- refresh base-branch evidence without overwriting local work;
- integrate using the repo's accepted merge/rebase policy;
- stop on conflicts that require behavior or ownership decisions;
- verify the integrated result, not only the feature branch;
- delete branch/worktree state only after integration and verification succeed.

### Pull Request

- inspect remote/upstream state before pushing;
- push only intended commits;
- create or update the PR using repo conventions;
- report CI, review, or merge requirements still pending;
- preserve the worktree when iteration or review feedback may continue.

### Keep

Report the branch, worktree, dirty state, verification status, and next route. Create a handoff only when continuation needs durable context.

### Discard

Before destructive action, state exactly what would be lost: commits, uncommitted paths, branch, worktree, remote state, and recoverability.

Require explicit confirmation for the concrete discard operation. Do not treat “clean up,” “finish,” or a menu number as confirmation for broader destruction than was shown.

## Cleanup Ownership

Do not remove a worktree, checkout, session, or harness state you did not create or are not authorized to manage.

The harness owns harness-created workspace cleanup. If ownership is unclear, preserve the workspace and report it.

Do not run destructive reset, clean, branch deletion, worktree removal, remote deletion, or force push merely to produce a clean status.

## Conflicts And Backward Routes

- Merge conflict with clear mechanical resolution -> resolve narrowly and verify.
- Conflict changes behavior, source truth, API, data, security, or architecture -> Decision Gate or plan/spec revision.
- Integrated tests fail -> diagnose before cleanup.
- Branch contains mixed or unrelated work -> return to commit/staging decisions.
- Base moved enough to invalidate assumptions -> inspect, diagnose failures, or revise the integration route.
- PR/release/deployment policy is unclear -> ask the owner or follow repo authority.

## Completion

Report:

- branch/base and selected route;
- commits and dirty state handled;
- integration, push, or PR result;
- verification on the final state;
- branch/worktree cleanup performed or deliberately preserved;
- unresolved CI, review, release, or deployment work;
- recoverability and next route.

Branch closeout is complete only for the chosen route. A pushed branch is not merged, a merged branch is not released, and a released artifact is not deployed.