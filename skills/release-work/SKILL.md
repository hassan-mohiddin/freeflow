---
name: release-work
description: Use when preparing, publishing, or verifying a versioned software release.
---

# Release Work

Prepare or publish a traceable versioned artifact whose source, version, contents, and destination identity agree.

A commit is not a release. A tag does not prove which artifact was built. A successful local build does not prove registry contents. A published artifact is not a production deployment.

## Establish Authority And Source

Loading this skill, preparing release options, or approving a general implementation Plan does not authorize a version change, remote tag, release record, registry publication, deprecation, yank, or replacement. Execute only release stages explicitly requested or separately approved. Before editing, read the repository's release policy, versioning scheme, package metadata, changelog convention, release automation, supported branches, signing or provenance requirements, and latest published versions.

Use [Decision Gate](../decision-gate/SKILL.md) when the route depends on an unresolved choice about:

- whether to release and which channel or audience receives it;
- compatibility or breaking-change classification;
- version when policy and evidence do not decide it;
- credentials, registry, signing, provenance, or remote-tag behavior;
- yanking, deprecating, replacing, or republishing an artifact;
- release branches, history rewriting, or recovery from partial publication.

Do not impose semantic versioning when the project uses another scheme. Before defining or changing version, source, artifact, tag, publication, or recovery identity, read [release evidence](references/release-evidence.md).

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

Classify consumer-observable impact rather than diff size. A small change can be breaking; a large internal refactor may preserve compatibility.

When consumers must move before a contract can be removed, read [Migration Work](../migration-work/SKILL.md). An additive replacement release may precede migration; a breaking removal release must wait for the accepted migration and removal proof.

## Prepare The Release

For approved preparation work:

- confirm the intended source is a coherent, freshly verified checkpoint and any selected review is resolved;
- reconcile version declarations, lockfiles, generated metadata, and release notes through repository-supported tooling;
- write release notes for consumers: behavior, compatibility, migration, security impact, and known limitations—not a raw commit dump;
- run the canonical build or package process from the intended source state;
- inspect the exact artifacts that would be published;
- keep credentials and signing material out of prompts, logs, diffs, and artifacts.

Do not hand-edit generated artifacts or duplicate version truth when the repository has a canonical generator. Return required branch, commit, public-documentation, or migration work to [Workflow](../workflow/SKILL.md) unless it is included in the approved release scope.

## Preflight The Exact Release

Before any irreversible remote action, verify:

- source commit, branch, and working-tree expectations;
- version is valid, unused, and consistent with repository policy;
- required tests, builds, package or install checks, and compatibility checks;
- artifact contents, entry points, names, sizes, checksums, licenses, and provenance;
- release notes and migration guidance match observable consumer impact;
- tag, registry, channel, and release destination identity;
- credentials and permissions work without exposing secrets;
- retry behavior cannot create conflicting tags or duplicate releases.

Use [Verify Work](../verify-work/SKILL.md) to state what each check proves. A dry run proves only the boundaries it exercises; name signing, registry, propagation, or publication behavior that remains unverified.

## Publish Only The Approved Stage

Create remote tags, release records, or registry publications only when explicitly requested or approved for the inspected release contract.

Use the repository's canonical order. Stop when source, version, tag, artifact, signing mode, channel, or destination identity diverges.

Do not silently:

- overwrite an existing version;
- force-move a release tag;
- publish from a dirty or different source state;
- substitute a registry, channel, artifact, or signing mode;
- retry an ambiguous publication without inspecting remote state.

If publication partially fails or acknowledgement is lost, identify which external effects committed before choosing retry, repair, deprecation, replacement, or stop. Do not assume a network error means nothing was published.

## Verify From The Consumer Boundary

When publication is in scope, verify the actual public artifact when possible:

- tag resolves to the intended commit;
- published version, channel, and destinations are correct;
- checksums, signatures, provenance, and contents match the inspected artifact;
- a clean install, download, or launch path works for supported targets;
- release notes and migration links resolve;
- no unexpected artifact, credential, local configuration, or private file was published.

Do not call the release complete because the publish command exited successfully. Unavailable propagation or consumer evidence leaves the corresponding claim unverified.

## Report Completion Precisely

Report:

- approved release stage and status;
- version, source commit, tag, channel, and destinations;
- compatibility basis and migration guidance;
- checks, artifact identity, and selected-review status;
- publication and consumer-side verification;
- partial failures, recovery actions, and residual risk;
- any deferred commit, migration, launch, or documentation work.

A prepared release is not published. A published release is not deployed. Use [Launch Work](../launch-work/SKILL.md) only when production deployment or rollout is separately requested or approved.
