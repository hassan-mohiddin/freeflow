# V0 image

Build and pin, from the repository root:

```bash
docker build -t freeflow-v0-notes .skill-eval/map-features/image
docker image inspect freeflow-v0-notes --format '{{index .RepoDigests 0}}'
```

Put the printed `freeflow-v0-notes@sha256:…` into `configuration.environment.image` in `../v0-setup-and-follow.json` and commit it before a canonical run. A build's digest differs from machine to machine, so a Mac and a cloud session each pin their own.
