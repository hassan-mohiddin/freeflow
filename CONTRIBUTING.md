# Contributing to Freeflow

Freeflow is a portable workflow layer for coding agents. Contributions should
keep it concise, evidence-backed, host-portable, and useful without turning it
into a governance system.

## Before changing the repository

Read:

- `AGENTS.md` for repository and agent instructions;
- `CONTEXT.md` for project language and boundaries;
- `plugin-docs/README.md` for the current documentation map;
- the relevant architecture, integration, workflow, routing, release, ADR, skill, runtime, test, or evidence page before editing;
- the active Working Record through Track Work when work is ongoing.

The repository root is the source of truth. Do not create generated package
mirrors or copy runtime files into a second maintained tree.

## Local checks

Use the same deterministic checks used by CI. The command-surface audit also requires the system tools `ripgrep` (`rg`) and `jq`; npm does not install them.

```bash
# macOS
brew install ripgrep jq

# Debian/Ubuntu
sudo apt-get update && sudo apt-get install --no-install-recommends -y ripgrep jq

npm ci --ignore-scripts
npm run check
npm run test:docs
npm run test:changelog
npm run test:release-workflow
```

Run focused tests for the area you change. Model-based skill evaluations are
not required for every pull request; run them deliberately when skill behavior,
readiness, or release evidence is in scope.

## Skills and documentation

Keep skill bodies concise and behavior-shaping. Put conditional depth in the
nearest reference file. Update `CHANGELOG.md` under `## Unreleased` for verified
consumer-visible changes when the task authorization covers that update. Use
only `Breaking Changes`, `Added`, `Changed`, `Fixed`, and `Removed`, with each
entry as a bullet under one category. Run `npm run check:changelog`; do not edit
released sections or guess categories during automation.

Use this ownership map:

- runtime or host behavior -> `plugin-docs/architecture.md` and the relevant integration page;
- skill ownership or routes -> `plugin-docs/skill-routing.md` and the owning skill;
- public installation or commands -> `README.md` and the relevant getting-started or integration page;
- release behavior or evidence -> `plugin-docs/release.md`, versioned `plugin-docs/release-evidence/` records, and `CHANGELOG.md`;
- durable, surprising decisions -> `plugin-docs/adr/`.

Historical `docs/` material is provenance, not a substitute for current public docs. Do not edit released changelog sections. Public contract, install guidance, ADR, release-evidence, deletion, package-boundary, versioning, and release changes require explicit authorization and human review at their selected checkpoints.

## Pull requests

Keep a pull request focused and explain:

- the user-visible outcome;
- the evidence run and what it proves;
- any deferred documentation, evaluation, or compatibility work.

Complete the changelog declaration in the pull request template. CI requires
consumer-visible changes to update `CHANGELOG.md` under `## Unreleased` and
allows internal-only changes to opt out explicitly.

Do not include credentials, local configuration, generated evaluation runs, or
host state. Do not change release tags or publish packages from a pull request.

## Releases

Releases are human-controlled. An authorized release preparation may update the
versioned package metadata and move verified `Unreleased` notes into a version
section, but it does not commit, tag, push, or publish by itself.

The normal release boundary is:

```text
verified source
-> release preparation and normalized release notes
-> human-approved commit and immutable tag push
-> CI verifies the exact tag, notes, generated output, tests, and tarball
-> npm publish with provenance
-> registry and GitHub Release verification
```

Use `release-work` for version classification, artifact checks, publication,
recovery, and consumer-side verification. Never reuse an npm version or force-
move a release tag. npm Trusted Publishing and the protected `npm` environment
must be configured outside the repository before publication can succeed.
