# V3 image

Build and pin, from the repository root, with the V3 folder as the build context (the image builds the fixture's Git history from `fixtures/discounts` and `image/history/v1`):

```bash
docker build -t freeflow-v3-discounts -f .skill-eval/verify-work-v3/image/Dockerfile .skill-eval/verify-work-v3
docker image inspect freeflow-v3-discounts --format '{{index .RepoDigests 0}}'
```

Put the printed `freeflow-v3-discounts@sha256:…` into `configuration.environment.image` in `../groups/v3-shared-fixture.json` and commit it before a canonical run. A build's digest differs from machine to machine, so a Mac and a cloud session each pin their own.

Rebuild and re-pin after any change to `fixtures/discounts/` or `image/`: the image's HEAD must hold the fixture exactly, because the graders find changed test files with `git diff HEAD` and rebuild the corrected suite from HEAD.
