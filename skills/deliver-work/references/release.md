# Release

This reference is judgment about preparing and publishing a versioned artifact whose source, version, contents and destination agree; its "do not" lines are binding. A commit is not a release, a tag does not prove which artifact was built, a local build does not prove registry contents, and a published artifact is not deployed.

## Establish The Stage And Source

Carry out only the release stages explicitly requested or approved: preparing, tagging, publishing, deprecating, yanking or replacing are separate. Before editing, read the repository's release policy, versioning scheme, package metadata, changelog convention, release automation, supported branches, signing or provenance requirements, and the latest published versions.

Take these to [Agree Work](../../agree-work/SKILL.md) when policy and evidence do not settle them:

- whether to release, and which channel or audience receives it;
- compatibility or breaking-change classification;
- the version;
- credentials, registry, signing, provenance or remote-tag behavior;
- yanking, deprecating, replacing or republishing an artifact;
- release branches, history rewriting, or recovery from partial publication.

## Define The Release Contract

Before changing release state, establish:

```text
Release target and audience:
Source commit / branch:
Version and compatibility basis:
Artifacts and supported platforms:
Release notes / migration guidance:
Required checks and selected reviews:
Signing / provenance / checksums:
Publication destination and channel:
Failure and recovery behavior:
Post-publication verification:
Approved preparation and publication stages:
```

Use the repository's declared versioning scheme; do not impose semantic versioning on a project that uses dates, trains, build numbers or another scheme. Classify by what consumers can observe, not by diff size: a small change can be breaking, and a large internal refactor may be compatible. When compatibility is uncertain, inspect the supported consumers and ask rather than choosing the smallest bump.

When consumers must move before a contract can be removed, use [Migration Work](../../migration-work/SKILL.md). An additive replacement release may come before the migration; a release that removes a contract waits for the accepted migration and its removal proof.

## Prepare The Release

For approved preparation:

- confirm the source is a coherent, freshly verified commit and any selected review is resolved;
- reconcile version declarations, lockfiles, generated metadata and release notes through the repository's tooling, without hand-editing generated artifacts or duplicating version truth that a generator owns;
- write release notes for consumers, not a commit dump: added or changed behavior, fixed user-visible defects, deprecated and removed contracts, security impact without unsafe disclosure, migration and compatibility requirements, known limitations and unsupported targets;
- run the canonical build or package process from the intended source;
- inspect the exact artifacts that would be published;
- keep credentials and signing material out of prompts, logs, diffs and artifacts.

Propose branch, commit, public-documentation or migration work the release needs through Agree Work unless the approved release scope includes it.

## Preflight The Exact Release

Before any irreversible remote action, verify:

- source commit, branch and working-tree expectations;
- the version is valid, unused and consistent with policy;
- required tests, builds, package or install checks and compatibility checks;
- artifact contents: included and excluded files, entry points and permissions, generated code and source maps, dependency and lockfile state, licenses and notices, platform variants, and no debug, test, local configuration, credential or private files; use the package manager's dry-run or list command when available;
- names, sizes, checksums, signatures and provenance;
- release notes and migration guidance match the consumer impact;
- tag, registry, channel and destination identity;
- credentials and permissions work without exposing secrets.

Know the publication failure contract before publishing: which step first creates irreversible remote state, whether a version or tag can be retried safely, how to detect a publish that committed without acknowledgement, whether repair, deprecation, yank or replacement is supported, and who tells consumers. A dry run proves only the boundaries it exercises; name signing, registry, propagation or publication behavior that remains unverified.

## Publish Only The Approved Stage

Follow the repository's canonical order, and stop when source, version, tag, artifact, signing mode, channel or destination diverges. Do not publish from a dirty or different source state, or substitute a registry, channel, artifact or signing mode. When publication partly fails, identify which external effects committed before choosing to retry, repair, deprecate, replace or stop.

A trustworthy release connects each link: source commit, freshly verified state, version metadata, build invocation and environment, artifact digest, signature or provenance, immutable tag or release record, registry entry, and consumer-side install evidence. Name the links you could not establish instead of implying reproducibility.

## Verify From The Consumer Boundary

When publication is in scope, verify the actual public artifact by version or digest, from a clean environment that does not reuse the local checkout or cache:

- the tag resolves to the intended commit;
- version, channel and destinations are correct;
- checksums, signatures, provenance and contents match the inspected artifact;
- a clean install, download or launch works on supported targets;
- release notes and migration links resolve;
- no unexpected artifact, credential, local configuration or private file was published.

Do not call the release complete because the publish command exited successfully; unavailable propagation or consumer evidence leaves that claim unverified. Production deployment is the separate [launch](launch.md) route.
