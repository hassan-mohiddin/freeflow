# V2 large-app image

The image for V2's large-app groups (`../groups/warm-large.json`, `../groups/cold-large.json`): Node 22 and npm for the bookmarks service and the graders, curl to drive it over HTTP, git and procps, and the fixture's one-commit Git history at `/opt/bookmarks.git` (with `GIT_DIR` and `GIT_WORK_TREE` set, so `git log` and `git status` work in `/testbed`). The notes-CLI groups keep V0's `freeflow-v0-notes` image, which has no curl.

Build and pin, from the repository root, with the V2 folder as the build context:

```bash
docker build -t freeflow-v2-bookmarks -f .skill-eval/verify-work-v2/image/Dockerfile .skill-eval/verify-work-v2
docker image inspect freeflow-v2-bookmarks --format '{{index .RepoDigests 0}}'
```

Put the printed `freeflow-v2-bookmarks@sha256:…` into `configuration.environment.image` in both large-app groups and commit it before a canonical run. A build's digest differs from machine to machine, so a Mac and a cloud session each pin their own. The digest pinned now was built on Hassan's Mac (Colima, arm64).

Rebuild and re-pin after any change to `fixtures/bookmarks/` or `image/`: the image's HEAD must hold the fixture exactly, so `git status` in the container shows only the subject's changes. The reference recipe's `Verified at` names that commit (`decfdc4`).

Hand-made answers are graded without a model by `../scripts/grade.sh`, which runs the graders in this image; the wrong answers in `../wrong/` each fail one intended test when laid over the reference (`no-recipe` over the bare fixture).
