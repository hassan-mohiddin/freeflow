---
name: "commit-work"
description: "Use when creating an explicitly requested or selected local Git commit, including staging its exact contents, verifying the resulting checkpoint, or performing a separately authorized simple push."
---

# Commit Work

Preserve one supported repository state as a coherent local Git checkpoint.

Commit Work normally follows execution, verification, self-review, and any selected independent review. It preserves that supported state; it does not establish correctness, close the Slice, authorize another Slice, or imply push, integration, release, or launch. A commit is not mandatory merely because work finished.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Commit only when the user explicitly requests a local commit or [Workflow](../workflow/SKILL.md) selects an authorized `preserve` Checkpoint. Approval to implement does not imply approval to commit, and a Working Record may preserve checkpoint selection and authority but cannot create them.
- Never silently unstage, reset, rearrange, discard, overwrite, or absorb user-owned or pre-existing staged work to manufacture a clean commit.
- Never stage Working Records (`.freeflow/tasks/**`), secrets, credentials, private keys, local environment files, or unexplained sensitive content.
- Never use `--amend`, `--allow-empty`, or `--no-verify` by implication, and never bypass or blindly retry a failing hook.
- The commit claim never exceeds the available verification and review evidence. An explicitly requested preservation checkpoint may capture incomplete, failing, or inconclusive work; describe it honestly and do not treat the commit as permission to cross the unresolved boundary.
- A local commit does not authorize push. A commit is never a Slice of its own. Do not stage leftovers, begin another Slice, push, integrate, release, or clean up merely because the commit succeeded.

## Enter At The Commit Boundary

Goal: commit one supported state that the request, decisions, and live changes all describe.

Before staging, confirm that local commit authority is explicit and still valid; the checkpoint has one coherent claim; the request, accepted decisions, and live changes describe the same outcome; fresh evidence supports the exact state, or this is an explicitly requested preservation checkpoint; any selected independent review is complete and its material findings adjudicated; and no unresolved decision, source conflict, or required evidence gap is hidden by the claim.

Commit Work verifies fidelity between the supported state and the Git checkpoint. It does not dispatch missing review, repair implementation, or generate missing behavioral evidence; return those needs to Workflow.

## Inspect The Candidate State

Goal: know every changed path and who owns it before touching the index.

Inspect before changing the index:

```bash
git status --short --branch
git status
git diff
git diff --cached
git ls-files --others --exclude-standard
```

Inspect submodule state when status reports a changed submodule. Staged state is evidence of index contents, not of ownership, intent, verification, or readiness.

Read [Staging Decisions](references/staging-decisions.md) when staged, unstaged, or untracked changes have mixed ownership or concerns; a path contains both intended and excluded changes; existing staged ownership is uncertain; generated, durable, sensitive, or suspicious files appear; or narrowing may require changing existing staged state.

Read [Git State Edges](references/git-state-edges.md) when Git reports an in-progress operation, unmerged paths, detached `HEAD`, submodule ambiguity, or an empty candidate; a requested commit would amend, be empty, or bypass hooks; or any commit or hook fails.

## Build The Exact Checkpoint

Goal: the index contains exactly the checkpoint, and nothing is left behind unexplained.

Stage only paths or hunks required to make the checkpoint claim true. Broad staging is acceptable only when every changed path has been inspected and belongs to the same checkpoint; otherwise stage explicit paths or hunks.

After staging, inspect the exact candidate with `git diff --cached` and `git diff --cached --check`, and confirm that every staged path and hunk belongs; required tests, documentation, generated outputs, or metadata are present; no unrelated, sensitive, unexplained, or user-owned content is included; the staged diff is non-empty unless an empty commit was explicitly requested; and excluded working-tree changes do not invalidate the evidence for the staged checkpoint.

Interpret `git diff --cached --check` against repository conventions. Unresolved conflict markers or unintended whitespace damage stop the commit; do not edit content merely to silence the command. If producing the exact checkpoint requires source changes, more evidence, or a user-owned staging decision, return to Workflow.

## Create The Commit

Goal: a message that describes the actual checkpoint.

Use the repository's established commit-message style; otherwise a short imperative subject describing the actual checkpoint, not the wider task ambition. Add a body only when the diff does not explain material context, tradeoffs, residual risk, or why incomplete state is being preserved. Reference issues, Specs, Plans, or decisions only when they materially explain the checkpoint, and do not invent trailers or metadata conventions.

Create an ordinary local commit from the inspected index. If a hook fails, changes files or the index, or makes prior evidence stale, inspect the resulting state through Git State Edges.

## Verify And Report The Checkpoint

Goal: the created commit is the checkpoint that was claimed, and nothing else changed.

After Git reports success, inspect:

```bash
git show --stat --oneline --decorate HEAD
git show --format= --name-status HEAD
git status --short --branch
```

Confirm that the intended commit was created, its subject and contents represent the claim, no unexpected staged, unstaged, or untracked state resulted, and remaining changes are known.

Report the commit SHA and subject; the checkpoint claim and included scope; verification and selected-review evidence; whether it is complete or an honest preservation checkpoint; remaining staged, unstaged, untracked, unverified, or unpushed work; and any hook, signing, identity, or repository limitation.

Return the result to Workflow. When a Working Record exists, Workflow may route [Track Work](../track-work/SKILL.md) to record `commit:<sha>` in the Current Slice's Material updates, close the selected `preserve` Checkpoint, and reconcile the Current Slice.

## Push Only When Separately Authorized

Before any push, read [Simple Push](references/simple-push.md). Use [Finish Branch](../finish-branch/SKILL.md) instead when the request involves integration, pull-request strategy, branch cleanup, history rewriting, or choosing among branch-closeout routes.

## Stop

Stop and return the smallest blocking fact when commit authority or the checkpoint claim is unclear; live changes no longer match the supported outcome; selected review or required evidence remains unresolved; the exact checkpoint cannot be staged without manipulating ambiguous user-owned state; sensitive or unexplained content may be included; Git is in a non-ordinary state whose intended outcome is unsettled; creating the commit would require implementation changes, evidence generation, hook bypass, amendment, or history rewriting outside explicit authority; or a push destination, upstream, or remote-history effect is unclear.
