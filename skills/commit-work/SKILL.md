---
name: commit-work
description: Use when committing work, including selecting and staging the intended changes, creating and verifying the commit, or explicitly pushing committed work.
---

# Commit Work

Commit an intended, coherent checkpoint. A commit preserves rollback and provenance; it does not prove correctness or approve the next route.

This skill covers commits and simple pushes, not branch integration, release, or deployment orchestration. Use [Finish Branch](../finish-branch/SKILL.md), [Release Work](../release-work/SKILL.md), or [Launch Work](../launch-work/SKILL.md) for those later jobs.

A local commit is authorized by an explicit user request, a checkpoint in a user-approved Plan, or a checkpoint explicitly approved during discussion. A Working Record may preserve that authorization but cannot create it. Plan approval does not authorize push, integration, migration, deprecation, release, or launch.

A planned checkpoint remains conditional on live state. Do not force it when its intended outcome, evidence, review status, or change boundary no longer holds; return the deviation to [Workflow](../workflow/SKILL.md).

A commit does not select or trigger independent review. Complete only review selected by Workflow, an approved Plan, or repository policy. Commit Work does not adjudicate findings or authorize corrections or follow-up review. Fresh verification is required for the claim the commit represents.

Read [staging decisions](references/staging-decisions.md) when changes are mixed, generated files or durable docs appear, existing staged state is unclear, or broad commit/push language conflicts with diff evidence.

## Route Check

Before staging, confirm:

- the slice or work package has one coherent outcome;
- source truth and owner decisions still support it;
- fresh evidence supports the claim represented by the commit, or an explicitly requested preservation checkpoint names its incomplete claim honestly;
- any selected review has ended, its adjudicated status is known, and Workflow supports the checkpoint route;
- no unresolved blocker, required evidence gap, or route-changing assumption is hidden by the checkpoint claim;
- the checkpoint remains authorized and useful for rollback, integration, handoff, or repository workflow.

When review or evidence leaves unresolved work, return it to Workflow rather than deciding readiness here. If the user explicitly requests a preservation checkpoint of incomplete, unverified, blocked, or inconclusive work, label that state honestly and include only what is safe and useful to preserve. The commit does not authorize crossing the unresolved boundary.

## Inspect

Inspect before staging or committing:

```bash
git status --short
git diff
git diff --cached
git ls-files --others --exclude-standard
```

Diff evidence beats “staged,” “commit everything,” “push all,” “exactly as-is,” or “do not leave leftovers.” Treat unrelated changes as user-owned until proven otherwise.

## Stage Narrowly

Stage explicit paths or hunks that implement the coherent checkpoint.

Avoid `git add .` and `git add -A` when unrelated, unreviewed, generated, sensitive, or user-owned changes are present.

Verify existing staged changes rather than inheriting them blindly. Do not unstage, rearrange, discard, or overwrite user-owned changes merely to manufacture a clean commit without permission.

## Stop

Stop before commit or push when:

- included changes are unrelated, unreviewed when review is required, or outside the accepted outcome;
- staged and unstaged edits make commit ownership ambiguous;
- logs, debug output, secrets, generated artifacts, lockfiles, or formatter churn lack evidence they belong;
- durable docs and implementation describe different behavior or authority;
- verification failed or proves less than the commit message would claim;
- the commit mixes separable concerns in a way that harms review, diagnosis, or rollback;
- product, security, privacy, billing, permissions, data-loss, compatibility, public API, migration, or architecture behavior changed without an explicit decision.

Use [Decision Gate](../decision-gate/SKILL.md) when the safe commit path depends on an owner or source-truth decision. If a clean narrow commit is possible without touching unrelated work, prefer it and report what remains.

## Commit Shape

Keep the checkpoint independently understandable and revertible.

Use the repo's established message style. Otherwise use a short imperative subject. Add a body only when source context, tradeoffs, residual risk, or the reason for the checkpoint would not be clear from the diff.

Reference specs, plans, ADRs, issues, or decisions only when they materially explain the change. Do not invent metadata conventions.

A learning-slice commit must distinguish diagnostic or exploratory output from production behavior. A deepening commit should not silently change behavior. A delivery commit should name the behavior it adds or changes.

## Push

Push only inspected commits when the user request and branch state make the route clear.

Before pushing, inspect branch, upstream, remote, and ahead/behind state. Stop before protected/shared branches, upstream changes, force pushes, remote-history rewrites, divergence, or release/PR decisions that were not explicitly requested.

Use `--force-with-lease` only for an intended rewrite of the user's own branch with explicit approval and supporting branch evidence.

## Verify The Checkpoint

After commit or push, inspect:

```bash
git show --stat --oneline --name-only HEAD
git status --branch --short
```

Report:

- commit SHA and subject;
- what the checkpoint contains;
- verification and review evidence;
- push result when applicable;
- remaining staged, unstaged, untracked, unpushed, or unverified work;
- recommended next route.

When a Working Record exists, use [Track Work](../track-work/SKILL.md) to record the commit SHA, checkpoint result, remaining state, and next useful action.

Do not continue to the next slice, push, or integrate merely because the commit succeeded. Return the result to [Workflow](../workflow/SKILL.md), or use [Finish Branch](../finish-branch/SKILL.md) when branch closeout is selected.
