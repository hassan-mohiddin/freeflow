# Freeflow CI/CD and Automation Spec

> **Doc ID:** SPEC-2026-06-16-freeflow-ci-cd-automation
> **Date:** 2026-06-16
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** User CI/CD discussion; live repo evidence in `package.json`, `.github/workflows/release.yml`, `docs/freeflow-current-state.md`, `docs/freeflow-packaging-and-publishing-design.md`, and `evals/scripts/`.

## Problem

Freeflow has release validation scripts and a manual npm publish workflow, but it does not yet have a normal CI workflow that runs deterministic checks on pushes and pull requests.

The project should add automation that catches packaging, metadata, syntax, command-surface, and runtime-context drift before merge or publish, without turning Freeflow into a heavy governance system or requiring model-based evals on every change.

## Intended Outcome

Freeflow should have a small, deterministic automation spine:

1. Developers can run the same checks locally that CI runs remotely.
2. GitHub runs those checks on PRs and pushes to `main`.
3. The npm publish workflow refuses to publish unless the same checks pass.
4. Branch protection can require CI before merging to `main`.
5. Versioning and publishing remain explicit and human-controlled for now.

## Current Repo Evidence

Current automation and validation already exist:

- `.github/workflows/release.yml` manually publishes the npm package with `workflow_dispatch`.
- The release workflow uses npm Trusted Publisher-style permissions: `id-token: write`, `contents: read`, and environment `npm`.
- The release workflow already checks that the package version is not published and runs `npm pack --dry-run`.
- `package.json` exposes Freeflow as `@hassangameryt/freeflow@0.1.0` and has no local `scripts` section yet.
- `evals/scripts/` includes deterministic validation scripts:
  - `audit-command-surface.sh`
  - `check-activation-contract.sh`
  - `check-runtime-context-hook.sh`
  - `validate-release-metadata.sh`
  - fixture/eval helpers for model-based evals
- `docs/freeflow-current-state.md` says enforcement hooks and CLI enforcement are not shipped in v0.1.
- `docs/freeflow-packaging-and-publishing-design.md` says the public repo uses one plugin runtime under the repo root and should not maintain a generated package copy.

## Scope

### In Scope

- GitHub Actions CI for deterministic checks.
- Local npm scripts that wrap existing repo checks.
- Hardening the manual npm publish workflow by running CI-equivalent checks before publish.
- Optional branch protection after CI is green.
- Clear release discipline for version bumps, changelog updates, package packing, and publishing.

### Out of Scope

- Auto-publishing on every merge to `main`.
- Fully automated semantic-release.
- Required model/AI fixture evals in every PR.
- Enforcement hooks or CLI enforcement.
- Generated package mirrors.
- Deployment environments beyond npm/GitHub release packaging.
- Codex/Claude native slash handlers.

## Requirements

### 1. Local Check Interface

Add a small `scripts` section to `package.json` so humans and CI use the same commands.

Recommended commands:

```json
{
  "scripts": {
    "check": "npm run check:json && npm run check:shell && npm run check:js && npm run check:commands && npm run check:activation && npm run check:runtime && npm run check:metadata && npm run pack:dry",
    "check:json": "find . -path './evals/runs' -prune -o -name '*.json' -print0 | xargs -0 -n1 jq empty",
    "check:shell": "find evals/scripts evals/fixtures -name '*.sh' -print0 | xargs -0 -n1 bash -n",
    "check:js": "find the repo root -name '*.js' -o -name '*.mjs' | xargs -n1 node --check",
    "check:commands": "evals/scripts/audit-command-surface.sh",
    "check:activation": "evals/scripts/check-activation-contract.sh",
    "check:runtime": "evals/scripts/check-runtime-context-hook.sh",
    "check:metadata": "evals/scripts/validate-release-metadata.sh --mode prepublish --release-version \"$(node -p 'require(\"./package.json\").version')\"",
    "pack:dry": "npm pack --dry-run"
  }
}
```

The exact command strings may be refined during implementation, but the principle should hold: one top-level `npm run check` should prove the package is internally consistent without invoking model-based evals. The metadata check should pass the release version from `package.json` instead of relying on `validate-release-metadata.sh`'s default version.

### 2. CI Workflow

Add `.github/workflows/ci.yml`.

Recommended triggers:

```yaml
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
```

Recommended job shape:

- run on `ubuntu-latest`
- checkout repo
- set up Node using the same major version as release workflow, or the oldest supported version if compatibility matters
- install no dependencies unless dependencies are later added
- run `npm run check`

CI should be deterministic. It should not require API keys, host auth, model access, npm publish credentials, or GitHub release permissions.

### 3. Release Workflow Hardening

Update `.github/workflows/release.yml` so publishing runs the same checks before `npm publish`.

Required release flow:

1. Checkout.
2. Set up Node/npm registry.
3. Show package version.
4. Run `npm run check`.
5. Ensure package version is not already published.
6. Run or keep `npm pack --dry-run` if it is not already covered by `npm run check`.
7. Publish with the selected npm dist-tag.

Release should remain manual through `workflow_dispatch` for now.

### 4. Branch Protection

After CI is added and passes on `main`, configure GitHub branch protection for `main`:

- require the CI check before merge
- disallow direct force pushes
- optionally require PR review before merge

Branch protection is repository configuration, not repo code. Record it in a doc or release checklist if enabled.

### 5. Versioning And Release Discipline

Keep versioning explicit for now.

For each release:

1. Decide version bump using SemVer:
   - patch: fixes and wording clarifications
   - minor: new backward-compatible behavior or host support
   - major: breaking behavior or install/runtime contract changes
2. Update `package.json`.
3. Update plugin manifests if their version fields are part of the release identity.
4. Update `CHANGELOG.md` or release evidence when the change is user-visible.
5. Run `npm run check` locally.
6. Open/merge PR after CI passes.
7. Run the manual publish workflow.
8. Confirm npm package and, when relevant, GitHub release/tag.

Do not add `semantic-release` yet. If release frequency increases, prefer evaluating `release-please` or Changesets before adopting fully automatic publishing.

### 6. Evals In Automation

Default CI should not run model-based fixture evals.

Reasons:

- model evals are slower and can be non-deterministic
- they may require local Codex/Claude auth or special sandbox behavior
- generated eval runs are internal and ignored
- deterministic checks already catch package, metadata, syntax, command-surface, and runtime hook drift

Model evals should remain deliberate checks for meaningful skill behavior changes, release acceptance, or debugging regressions.

Optional future automation:

- manual `workflow_dispatch` eval workflow for selected fixture evals
- scheduled smoke evals only if cost, auth, and flake handling are solved
- artifact upload for eval outputs, without committing generated runs

### 7. Security And Permissions

CI should use least privilege.

Recommended permissions:

```yaml
permissions:
  contents: read
```

Release publish should keep the existing stronger permissions needed for npm Trusted Publisher:

```yaml
permissions:
  contents: read
  id-token: write
```

Do not expose npm tokens or other secrets to untrusted PRs. Prefer Trusted Publisher/OIDC over long-lived npm tokens.

### 8. Package Boundary Checks

Automation should preserve the current release boundary:

- one installable plugin runtime under the repo root
- no generated package copy
- generated eval runs excluded
- no enforcement hooks or CLI enforcement
- Codex/Claude native slash handlers remain disabled unless intentionally added later
- Pi package metadata stays in root `package.json`

`validate-release-metadata.sh` should remain the main guard for these boundaries.

## Acceptance Criteria

The CI/CD automation is acceptable when:

- `npm run check` exists and passes locally.
- `.github/workflows/ci.yml` runs `npm run check` on PRs, pushes to `main`, and manual dispatch.
- `.github/workflows/release.yml` runs `npm run check` before publishing.
- Release workflow still requires manual dispatch and refuses already-published package versions.
- No model-based evals are required for normal CI.
- No enforcement hooks, CLI enforcement, generated package mirrors, or auto-publishing are introduced.
- Documentation or final implementation notes say whether branch protection was configured outside the repo.

## Recommended Implementation Order

1. Add `package.json` scripts.
2. Run `npm run check` locally and fix command portability issues.
3. Add `.github/workflows/ci.yml`.
4. Update `.github/workflows/release.yml` to call `npm run check`.
5. Run local checks plus `npm pack --dry-run`.
6. Push and confirm GitHub CI passes.
7. Enable branch protection for `main` if desired.

## Open Questions

1. Which Node major should CI use: match release workflow Node 24, or test the oldest Node version Pi/GitHub/npm users are expected to support?
2. Should release automation create GitHub tags/releases now, or wait until install smoke tests and v0.1 tagging decisions are complete?
3. Should a manual eval workflow exist later for release candidates, or should evals remain purely local for now?

## Non-Goals Reminder

This spec is about deterministic repo automation. It should not become permission to add broad governance, mandatory process artifacts, enforcement hooks, or automatic production-style release behavior.
