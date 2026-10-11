# Freeflow Deterministic Checks and Release Gate

Status: Ready for implementation

## Problem

Freeflow has validation scripts and a manual npm publish workflow, but nothing runs those checks on pull requests or on pushes to `main`. Packaging, metadata, syntax, command-surface, and runtime-hook drift can reach `main` or npm unnoticed.

The fix must catch that drift before merge or publish. It must not add model access, governance steps, or automatic publishing.

## Intended Outcome

1. A developer can run the same checks locally that CI runs.
2. GitHub runs those checks on pull requests and on pushes to `main`.
3. The npm publish workflow refuses to publish unless the same checks pass.
4. Versioning and publishing stay explicit and human-triggered.

## Scope

In scope:

- A `scripts` section in `package.json` that defines the check commands.
- A CI workflow at `.github/workflows/ci.yml`.
- Changes to the manual publish workflow at `.github/workflows/release.yml`.

Out of scope: publishing on every merge to `main`, model-based checks in default CI, enforcement hooks or CLI enforcement, and generated package mirrors.

## Requirements

### 1. Local Check Interface

Add a `scripts` section to `package.json` so humans and CI run the same commands:

```json
{
  "scripts": {
    "check": "npm run check:json && npm run check:shell && npm run check:js && npm run check:commands && npm run check:activation && npm run check:runtime && npm run check:metadata && npm run pack:dry",
    "check:json": "find . -path ./node_modules -prune -o -name '*.json' -print0 | xargs -0 -n1 jq empty",
    "check:shell": "find scripts hooks -name '*.sh' -print0 | xargs -0 -n1 bash -n",
    "check:js": "find . -path ./node_modules -prune -o \\( -name '*.js' -o -name '*.mjs' \\) -print0 | xargs -0 -n1 node --check",
    "check:commands": "scripts/validation/audit-command-surface.sh",
    "check:activation": "scripts/validation/check-activation-contract.sh",
    "check:runtime": "hooks/tests/check-runtime-context-hook.sh",
    "check:metadata": "scripts/validation/validate-release-metadata.sh --mode prepublish --release-version \"$(node -p 'require(\"./package.json\").version')\"",
    "pack:dry": "npm pack --dry-run"
  }
}
```

`npm run check` must prove the package is internally consistent. It must not invoke a model or need API keys, host auth, or npm credentials.

The metadata check passes the release version read from `package.json`. It does not rely on the validation script's default version.

### 2. CI Workflow

Add `.github/workflows/ci.yml` with these triggers:

```yaml
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
```

The job runs on `ubuntu-latest`, checks out the repo, sets up the same Node major version as the release workflow, and runs `npm run check`. It installs no dependencies unless dependencies are added later.

CI uses least privilege:

```yaml
permissions:
  contents: read
```

### 3. Release Workflow Hardening

Update `.github/workflows/release.yml` so publishing runs the same checks before `npm publish`. Required release flow:

1. Checkout.
2. Set up Node and the npm registry.
3. Show the package version.
4. Run `npm run check:json` and `npm run check:shell`, since CI already runs the rest.
5. Confirm the package version is not already on npm.
6. Publish with the selected npm dist-tag.

Release stays manual through `workflow_dispatch`. The release job keeps the permissions that npm Trusted Publishing needs:

```yaml
permissions:
  contents: read
  id-token: write
```

Release must not use long-lived npm tokens, and npm credentials must not be exposed to pull requests.

### 4. Model-Based Checks

Default CI must not run model-based checks. They are slower, can be non-deterministic, and may need local host auth. Run them deliberately, by hand, for skill behavior changes, release acceptance, or debugging regressions.

### 5. Versioning

Versioning stays explicit. Choose a SemVer bump, update `package.json` and `CHANGELOG.md` for user-visible changes, run `npm run check`, merge through a pull request after CI passes, then run the manual publish workflow. Do not add semantic-release.

## Acceptance Criteria

The work is acceptable when:

- `npm run check` exists and passes locally.
- `.github/workflows/ci.yml` runs `npm run check` on pull requests, pushes to `main`, and manual dispatch.
- `.github/workflows/release.yml` runs `npm run check` before publishing.
- The release workflow still requires manual dispatch and refuses already-published package versions.
- Default CI runs no model-based checks and needs no secrets.
- No enforcement hooks, CLI enforcement, generated package mirrors, or auto-publishing are introduced.
