# Contributing to Freeflow

Freeflow is a portable workflow layer for coding agents. Contributions should
keep it concise, evidence-backed, host-portable, and useful without turning it
into a governance system.

## Before changing the repository

Read:

- `AGENTS.md` for repository and agent instructions;
- `CONTEXT.md` for project language and boundaries;
- `docs/README.md` for the documentation map;
- the relevant skill, runtime contract, test, or release evidence before editing.

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
```

Run focused tests for the area you change. Model-based skill evaluations are
not required for every pull request; run them deliberately when skill behavior,
readiness, or release evidence is in scope.

## Skills and documentation

Keep skill bodies concise and behavior-shaping. Put conditional depth in the
nearest reference file. Update `CHANGELOG.md` under `## Unreleased` for verified
consumer-visible changes when the task authorization covers that update.

Do not edit released changelog sections. Changes to `plugin-docs/`, public
contract/install guidance, durable project docs, ADRs, or release evidence
require explicit authorization and should be deferred to the final documentation
slice.

## Pull requests

Keep a pull request focused and explain:

- the user-visible outcome;
- the evidence run and what it proves;
- any deferred documentation, evaluation, or compatibility work.

Do not include credentials, local configuration, generated evaluation runs, or
host state. Do not change release tags or publish packages from a pull request.

## Releases

Releases are human-controlled. An authorized release preparation may update the
versioned package metadata and move verified `Unreleased` notes into a version
section, but it does not commit, tag, push, or publish by itself.

The normal release boundary is:

```text
verified source -> release preparation -> human-approved tag push -> CI publish
```

Use `release-work` for version classification, artifact checks, publication,
recovery, and consumer-side verification. Never reuse an npm version or force-
move a release tag.
