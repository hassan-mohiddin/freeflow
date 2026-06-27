---
name: commit-work
description: Use when committing completed work, preparing a git commit, deciding what to stage, reviewing staged/unstaged/untracked changes, handling commit-everything pressure, pushing committed work, or checking generated, sensitive, user-owned, or mixed changes before commit or push.
---

# Commit Work

Commit or push only reviewed, verified, intended work.

This skill is a closeout guard for commits and simple pushes. It is not a release process, PR flow, or hook installer.

Direct command syntax selects this segment, not commit or push approval. `--all`, "commit everything", "push all changes", "exactly as-is", and "do not leave leftovers" never prove files belong. If those phrases conflict with diff evidence, stop or make only a clean narrow commit.

Hard stop: if untracked logs/debug output or user-owned behavior changes appear, do not commit or push them. If the prompt forbids leftovers or requires exactly-as-is, stop and ask.

Read `references/staging-decisions.md` when staged changes are mixed, generated files appear, durable docs changed, the user says "commit staged/everything" or "push all changes", or a narrow commit might be possible.

## Preconditions

Before committing consequential work, confirm:

- the implementation scope is clear
- review confidence exists for the diff being committed
- fresh verification evidence exists, or the commit message/final response names what is unverified

If verification failed, do not commit a success/fix/feature claim. Stop and report the failing evidence.

## Inspect

Before staging or committing, inspect:

```bash
git status --short
git diff
git diff --cached
git ls-files --others --exclude-standard
```

Diff evidence beats intent. If the worktree contains changes outside the requested scope, treat them as unrelated until proven otherwise.

## Staging Rule

Never use broad staging when unrelated, unreviewed, generated, or user-owned changes are present.

Avoid `git add .` and `git add -A`.

Stage explicit paths or hunks that match the completed task.

If files are already staged, verify they belong in this commit. Do not preserve mystery staged changes just because they are staged.

## Stop

Stop before committing when:

- staged changes include unrelated or unreviewed work
- unstaged changes make the intended commit ambiguous
- a user-owned change may be included accidentally
- generated files, logs, debug output, or secrets appear without evidence they should be committed
- pre-commit, lint, test, build, or formatter checks fail
- the requested commit would mix separable product/code/doc/test concerns in a way that hurts review or rollback

Name the blocker and ask which path to follow. If a clean narrow commit is possible without touching unrelated work, make it and leave unrelated changes untouched.

## Commit Shape

Keep commits small enough to review, debug, and roll back.

Use the repo's existing commit style. If none is obvious, use a short imperative subject:

```text
Fix settings title typo
```

Add a body only when it helps future readers understand why.

Reference specs, plans, ADRs, issues, or decisions when they materially explain the commit. Do not invent mandatory `Refs:` lines for repos that do not require them.

## Push Rule

Push only commits you inspected. Before pushing, inspect branch, upstream, remote, and ahead/behind state.
Do not push to protected/shared branches, set upstream, use `--force`, or rewrite remote history unless explicitly requested and branch evidence supports it. Use `--force-with-lease` only for an intended rewrite of the user's own branch.
If branch state is stale, diverged, missing upstream, or likely needs PR/CI/release judgment, stop and ask.

## After Commit Or Push

Verify what landed:

```bash
git show --stat --oneline --name-only HEAD
git status --branch --short
```

Final response should state:

- commit SHA, subject, and push result if pushed
- what was committed
- what verification supports it
- any remaining uncommitted, unpushed, or unverified changes
