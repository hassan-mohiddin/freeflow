# Requirements: deterministic checks and release gate

Freeflow is a plugin and skill pack for coding agents. Its package has validation scripts and a manual npm publish workflow, but no CI workflow runs those scripts on pull requests or on pushes to `main`. The work adds one local check command, a CI workflow that runs it, and a publish workflow that runs the same command before publishing. Publishing stays manual, and default CI does not call a model.

The spec must satisfy these acceptance points:

1. `package.json` defines one `check` script that runs the JSON, shell, JavaScript syntax, command-surface, activation, runtime-hook, release-metadata and dry-run pack checks.
2. `npm run check` does not invoke a model and needs no API keys, host auth or npm credentials.
3. The release-metadata check receives the release version read from `package.json` rather than the validation script's default version.
4. `.github/workflows/ci.yml` runs `npm run check` on pull requests, on pushes to `main` and on manual dispatch.
5. The CI workflow uses only `permissions: contents: read`.
6. Default CI runs no model-based checks.
7. `.github/workflows/release.yml` runs `npm run check` before `npm publish`.
8. The release workflow stays `workflow_dispatch` only and refuses a package version that is already published.
9. The release workflow keeps `id-token: write` so npm Trusted Publishing can authenticate.
10. Versioning stays explicit: no publish on merge and no semantic-release.
11. No enforcement hooks, CLI enforcement, generated package mirrors or auto-publishing are introduced.
