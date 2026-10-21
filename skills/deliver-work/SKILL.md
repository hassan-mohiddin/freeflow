---
name: deliver-work
description: "Use when committing, pushing, merging or opening a pull request, cleaning up a branch or worktree, releasing (version, changelog, tag, publish), or a deploy, rollout or rollback. Not for judging readiness (Review Work) or moving users or data to a replacement (Execute Work)."
---

# Deliver Work

Take finished work into a commit, a pushed or merged branch, a pull request, a release or production, only as far as the user said yes.

The **Rules** are binding; if one cannot be met, stop and say why. Everything else is judgment: adapt it when another choice serves its goal better.

## Routes

| Situation | Read |
| --- | --- |
| An ordinary commit of your own changes | Commit, below |
| Committing with mixed owners or concerns, a file holding included and excluded changes, or generated, sensitive or unexplained files; Git mid-operation, unmerged, detached or with a changed submodule; nothing to commit; amend, empty commit or skipped hooks asked for; a failed commit or hook | [commit](references/commit.md) |
| Pushing to a remote branch | [push](references/push.md) |
| Merging, a pull request, or keeping, discarding or deleting a branch or worktree | [branch closeout](references/branch-closeout.md) |
| A version, release notes, tag or registry publication | [release](references/release.md) |
| Deploying, exposing a change to users, rolling back or restoring production | [launch](references/launch.md) |

A request spanning routes, such as "commit and push": take them in order, each within its own yes, and stop at the first that fails.

## Rules

- Merging, a pull request, deleting or discarding a branch, worktree or uncommitted work, deploying, and every exposure stage need their own yes, like commit, push and release. Loading this skill, a readiness question or an approved plan gives none, and one route's success never authorizes the next.
- Never use `--amend`, `--allow-empty`, `--no-verify`, a force push, a history rewrite, a moved release tag or an overwritten published version unless the user asked for that exact action; never bypass or blindly retry a failing hook or check.
- Never stage or publish Working Records (`.freeflow/tasks/**`), secrets, credentials, private keys, local environment files or unexplained sensitive content.
- Never absorb or unstage pre-existing staged changes, or remove a worktree, checkout or other state you did not create.
- After a commit, push, publication or deployment step fails or loses its acknowledgement, inspect what changed before retrying, and stop while it stays unknown; a network error does not mean nothing happened.

## Commit

Goal: one commit that holds exactly the supported state.

1. **Boundary.** The user asked for this commit, or a `preserve` Checkpoint they selected is due; a Working Record can carry that selection, not create it. Fresh checks support the state, or the user asked to preserve incomplete work; a review they selected is done, its findings settled.
2. **Inspect** before touching the index:
   ```bash
   git status --short --branch
   git diff
   git diff --cached
   git ls-files --others --exclude-standard
   ```
   Staged does not mean yours. If the second Routes row matches, read [commit](references/commit.md) now.
3. **Stage** only what the claim needs: explicit paths or hunks, with the tests, docs and generated output it requires; stage broadly only when every changed path was inspected and belongs. Then `git diff --cached --check`: conflict markers or whitespace damage stop the commit.
4. **Message** in the repository's style; otherwise a short imperative subject naming what this commit holds, and a body only for what the diff cannot show: why, trade-offs, residual risk, why incomplete work is kept. Invent no trailers.
5. **Check** `git show --stat --oneline HEAD` and `git status --short --branch`: the claimed contents, nothing unexpected left.
6. **Record** `commit:<sha>` in the Current Slice's Material updates and close the selected `preserve` Checkpoint through [Track Work](../track-work/SKILL.md), when a Working Record exists.

Rules for a commit:

- Claim no more than the checks and selected review support. A preservation commit the user asked for may hold incomplete or failing work: say so, and do not take it as leave to cross what is unresolved.
- A commit is never a Slice of its own; after it, stage no leftovers and begin no other Slice.

## Other Owners

A choice that is the user's goes to [Agree Work](../agree-work/SKILL.md), with the supported routes as options; what a check supports, to [Verify Work](../verify-work/SKILL.md); a failure without a known cause, to Execute Work's [diagnose](../execute-work/references/diagnose.md); a selected review not yet run, reported for [Review Work](../review-work/SKILL.md).

## Stop

Stop and return the smallest blocking fact when:

- what a route's yes covers is unclear;
- live state differs from what was verified, reviewed or approved: changes, source commit, version, artifact, configuration or target;
- required evidence or a selected review is missing;
- a destination is unclear: remote, branch, base, pull-request target, registry, channel or environment;
- a conflict needs a behavior, source-of-truth or owner decision.

## Report

End with the lines that apply:

```text
Route:      <route and stage, and what the yes covered>
Identity:   <SHA and subject, branch and remote, pull-request URL, version and tag, artifact and target>
Evidence:   <each check on the final state and what it shows; the selected review's outcome>
Not shown:  <what this does not establish (pushed is not merged, merged not released, released not deployed); what went unverified>
Remaining:  <unpushed or uncommitted work, pending CI or review, observation windows left, temporary machinery with its owner and cleanup, partial failures and recovery>
Next:       <the next route as a question, and whose call it is>
```
