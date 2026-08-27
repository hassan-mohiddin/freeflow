---
name: "commit-work"
description: "Use when creating an explicitly requested or selected local Git commit, including staging its exact contents, verifying the resulting checkpoint, or performing a separately authorized simple push."
---

# Commit Work

Preserve one supported repository state as a coherent local Git checkpoint.

Commit Work normally follows execution, verification, self-review, and any selected independent review. It preserves that supported state; it does not establish correctness, close the Slice, authorize another Slice, or imply push, integration, release, or launch.

A commit is not mandatory merely because work finished. Enter only when the user explicitly requests a local commit or [Workflow](../workflow/SKILL.md) selects an authorized Local commit checkpoint.

An explicitly requested preservation checkpoint may capture incomplete, failing, or inconclusive work. Describe that state honestly and do not treat the commit as permission to cross the unresolved boundary.

## Enter At The Commit Boundary

Before staging, confirm:

- local commit authority is explicit and still valid;
- the checkpoint has one coherent claim;
- the request, accepted decisions, and live changes still describe the same outcome;
- fresh evidence supports the exact state being preserved, or this is an explicitly requested preservation checkpoint;
- any selected independent review is complete and its material findings are adjudicated;
- no unresolved decision, source conflict, or required evidence gap is hidden by the checkpoint claim.

A Working Record may preserve checkpoint selection and authority but cannot create them. Approval to implement does not imply approval to commit.

Commit Work verifies fidelity between the supported state and the Git checkpoint. It does not dispatch missing review, repair implementation, or generate missing behavioral evidence. Return those needs to Workflow.

## Inspect The Candidate State

Inspect before changing the index:

```bash
git status --short --branch
git status
git diff
git diff --cached
git ls-files --others --exclude-standard
```

Inspect submodule state when status reports a changed submodule.

Read [Staging Decisions](references/staging-decisions.md) when:

- staged, unstaged, or untracked changes have mixed ownership or concerns;
- a path contains both intended and excluded changes;
- existing staged ownership is uncertain;
- generated, durable, sensitive, or suspicious files appear;
- narrowing the checkpoint may require changing existing staged state.

Read [Git State Edges](references/git-state-edges.md) when Git reports an in-progress operation, unmerged paths, detached `HEAD`, submodule ambiguity, or an empty candidate; a requested commit would amend, be empty, or bypass hooks; or any commit or hook fails.

Treat staged state as evidence of index contents, not evidence of ownership, intent, verification, or readiness.

## Build The Exact Checkpoint

Stage only paths or hunks required to make the checkpoint claim true.

Broad staging commands are acceptable only when every changed path has been inspected and belongs to the same checkpoint. Otherwise stage explicit paths or hunks.

Do not silently unstage, rearrange, discard, overwrite, or absorb user-owned work to manufacture a clean commit.

After staging, inspect the exact candidate:

```bash
git diff --cached
git diff --cached --check
```

Confirm:

- every staged path and hunk belongs;
- required tests, documentation, generated outputs, or metadata are present;
- no unrelated, sensitive, unexplained, or user-owned content is included;
- the staged diff is non-empty unless an empty commit was explicitly requested;
- the commit claim does not exceed available verification and review evidence;
- excluded working-tree changes do not invalidate evidence for the staged checkpoint.

Interpret `git diff --cached --check` against repository conventions. Unresolved conflict markers or unintended whitespace damage stop the commit; do not edit content merely to silence the command.

If producing the exact checkpoint requires source changes, additional evidence, or a user-owned staging decision, return to Workflow rather than performing that work here.

## Create The Commit

Use the repository's established commit-message style. Otherwise use a short imperative subject describing the actual checkpoint, not the wider task ambition.

Add a body only when the diff does not adequately explain material context, tradeoffs, residual risk, or why incomplete state is being preserved. Reference existing issues, Specs, Plans, or decisions only when they materially explain the checkpoint. Do not invent trailers or metadata conventions.

Create an ordinary local commit from the inspected index.

Do not use `--amend`, `--allow-empty`, or `--no-verify` by implication. Read Git State Edges when one is explicitly requested or becomes relevant.

If a hook fails, changes files or the index, or makes prior evidence stale, do not bypass or blindly retry it. Inspect the resulting state through Git State Edges.

## Verify The Checkpoint

After Git reports a successful commit, inspect:

```bash
git show --stat --oneline --decorate HEAD
git show --format= --name-status HEAD
git status --short --branch
```

Confirm that:

- the intended commit was created;
- its subject and contents represent the checkpoint claim;
- no unexpected staged, unstaged, or untracked state resulted;
- remaining changes are known and were not silently absorbed.

Report:

- commit SHA and subject;
- the checkpoint claim and included scope;
- verification and selected-review evidence;
- whether the commit is complete or an honest preservation checkpoint;
- remaining staged, unstaged, untracked, unverified, or unpushed work;
- any hook, signing, identity, or repository limitation;
- the route returned to Workflow.

Return the checkpoint result to Workflow. When a Working Record exists, Workflow may route [Track Work](../track-work/SKILL.md) to record `commit:<sha>`, settle the selected checkpoint, and reconcile the Current Slice.

Do not stage leftovers, begin another Slice, push, integrate, release, or clean up merely because the commit succeeded.

## Push Only When Separately Authorized

A local commit does not authorize push.

Before any push, read [Simple Push](references/simple-push.md). Use [Finish Branch](../finish-branch/SKILL.md) instead when the request involves integration, pull-request strategy, branch cleanup, history rewriting, or choosing among branch-closeout routes.

## Stop

Stop and return the smallest blocking fact when:

- commit authority or the checkpoint claim is unclear;
- live changes no longer match the supported outcome;
- selected review or required evidence remains unresolved;
- the exact checkpoint cannot be staged without manipulating ambiguous user-owned state;
- sensitive or unexplained content may be included;
- Git is in a non-ordinary state whose intended outcome is unsettled;
- creating the commit would require implementation changes, evidence generation, hook bypass, amendment, or history rewriting outside explicit authority;
- push destination, upstream, or remote-history effect is unclear.
