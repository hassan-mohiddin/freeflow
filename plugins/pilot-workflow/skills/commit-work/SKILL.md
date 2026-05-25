---
name: commit-work
description: Use when committing completed work, preparing a git commit, writing a commit message from a diff, deciding what to stage, or checking whether staged/untracked changes are safe to commit after implementation, review, and verification.
---

# Commit Work

Commit only reviewed, verified, intended work.

This skill is a closeout guard. It is not a release process, PR flow, or hook installer.

## Preconditions

Before committing consequential work, confirm:

- the implementation scope is clear
- review confidence exists for the diff being committed
- fresh verification evidence exists, or the commit message/final response names what is unverified

If verification failed, do not commit a success/fix/feature claim. Stop and report the failing evidence.

## Inspect The Whole Worktree

Before staging or committing, inspect:

```bash
git status --short
git diff
git diff --cached
git ls-files --others --exclude-standard
```

Use equivalent commands if the repo has local conventions.

Diff evidence beats intent. If the worktree contains changes outside the requested scope, treat them as unrelated until proven otherwise.

## Staging Rule

Never use broad staging when unrelated, unreviewed, generated, or user-owned changes are present.

Avoid:

```bash
git add .
git add -A
```

Stage explicit paths or hunks that match the completed task.

If files are already staged, verify they belong in this commit. Do not preserve mystery staged changes just because they are staged.

## Stop Conditions

Stop before committing when:

- staged changes include unrelated or unreviewed work
- unstaged changes make the intended commit ambiguous
- a user-owned change may be included accidentally
- generated files appear without evidence they should be committed
- pre-commit, lint, test, build, or formatter checks fail
- the requested commit would mix separable product/code/doc/test concerns in a way that hurts review or rollback

Name the blocker and ask which path to follow. If a clean narrow commit is possible without touching unrelated work, make that commit and leave unrelated changes untouched.

## Commit Shape

Keep commits small enough to review, debug, and roll back.

Use the repo's existing commit style. If none is obvious, use a short imperative subject:

```text
Fix settings title typo
```

Add a body only when it helps future readers understand why.

Reference specs, plans, ADRs, issues, or decisions when they materially explain the commit. Do not invent mandatory `Refs:` lines for repos that do not require them.

## After Commit

Verify what landed:

```bash
git show --stat --oneline --name-only HEAD
git status --short
```

Final response should state:

- commit SHA and subject
- what was committed
- what verification supports it
- any remaining uncommitted or unverified changes
