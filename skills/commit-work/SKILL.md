---
name: commit-work
description: Use when creating a git commit or simple push, deciding whether a verified slice is a coherent rollback checkpoint, inspecting staged, unstaged, untracked, generated, sensitive, or mixed changes, or handling broad “commit everything” pressure.
---

# Commit Work

Commit an intended, coherent checkpoint. A commit preserves rollback and provenance; it does not prove correctness or approve the next route.

This skill covers commits and simple pushes, not branch integration, release, or deployment orchestration. Use `../finish-branch/SKILL.md`, `../release-work/SKILL.md`, or `../shipping-and-launch/SKILL.md` for those later jobs.

Review is conditional. Require it when the plan, risk, accumulated change, or repository policy calls for it—not after every slice by habit. Fresh verification is required for the claim the commit represents.

Read [staging decisions](references/staging-decisions.md) when changes are mixed, generated files or durable docs appear, existing staged state is unclear, or broad commit/push language conflicts with diff evidence.

## Route Check

Before staging, confirm:

- the slice or work package has one coherent outcome;
- source truth and owner decisions still support it;
- fresh evidence proves the claim represented by the commit;
- required review has passed or its non-blocking residuals are explicit;
- no unresolved blocker, required evidence gap, or route-changing assumption remains inside the checkpoint;
- a commit is useful now for rollback, integration, handoff, or repository workflow.

If the user explicitly requests a checkpoint of incomplete or unverified work, label it honestly and do not present it as a completed feature or verified fix. Stop when the requested commit would hide an unsafe or ambiguous state.

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

Use `../decision-gate/SKILL.md` when the safe commit path depends on an owner or source-truth decision. If a clean narrow commit is possible without touching unrelated work, prefer it and report what remains.

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

Do not continue to the next slice or integrate the branch merely because the commit succeeded. Return to the execution route check or `finish-branch` when branch closeout is the selected route.