---
name: release-work
description: Use when preparing, cutting, publishing, or verifying a versioned software or package release; choosing version impact, updating consumer-facing release notes, producing and signing artifacts, creating tags, or reconciling version, tag, source, and published artifact identity.
---

# Release Work

> Status: Unverified candidate

Publish an immutable, reproducible consumer checkpoint with honest version and evidence.

A commit is not a release. A tag is not proof that the artifact was built from it. A package release is not a production deployment.

## Source Authority

Read the repository's release policy, package metadata, changelog convention, CI/release automation, supported branches, signing/provenance requirements, and latest published versions before editing.

Use `../decision-gate/SKILL.md` when the route depends on:

- whether to release and which channel or audience receives it;
- breaking-change classification or compatibility promise;
- version number when policy/evidence does not decide it;
- publishing credentials, registry, signing, provenance, or remote tag behavior;
- yanking, deprecating, replacing, or republishing an artifact;
- release-branch or history-rewrite decisions.

Do not infer SemVer when the project uses another versioning scheme.

Read [release evidence](references/release-evidence.md) when planning version identity, artifacts, changelog, publication, or recovery.

## Define The Release Contract

```text
Release target and audience:
Source commit / branch:
Version and compatibility basis:
Artifacts and platforms:
Changelog / migration notes:
Required checks and approvals:
Signing / provenance / checksums:
Publication destination and channel:
Failure and recovery behavior:
Post-publication verification:
```

Classify observable consumer impact, not diff size. A small change can be breaking; a large internal refactor can preserve compatibility.

When consumers must migrate, use `../migration-work/SKILL.md` to plan the complete sequence. An additive replacement release may need to ship before migration can begin; a later removal or breaking release must wait for the accepted migration and removal proof.

## Prepare

- confirm intended release changes form a coherent reviewed and verified checkpoint;
- reconcile version declarations, lockfiles, generated metadata, and release notes through repo-supported tooling;
- write release notes for consumers: behavior, compatibility, migration, security, and known limitations—not a raw commit dump;
- run the build/package process from the intended source state;
- inspect the exact artifacts that would be published;
- keep credentials and signing material out of logs, prompts, diffs, and artifacts.

Do not hand-edit generated release artifacts or duplicate version truth across files when the repo has a canonical generator.

## Preflight

Before irreversible remote actions, verify:

- source commit and working-tree expectations;
- version is valid, unused, and consistent with policy;
- required tests, builds, package/install checks, and compatibility checks pass;
- artifact contents, names, sizes, checksums, licenses, and provenance are expected;
- changelog and migration guidance match observable impact;
- tag, registry, and release destination are correct;
- credentials and permissions work without exposing secrets;
- retry behavior cannot create conflicting tags or duplicate releases.

A dry run proves only what it actually exercises. State registry, signing, or publication behavior still unverified.

## Publish

Perform remote tag, release, or registry publication only when explicitly requested or approved for the inspected release contract.

Publish in the repository's canonical order. Stop if source, tag, version, artifact, or destination identity diverges.

Do not silently:

- overwrite an existing version;
- force-move a release tag;
- publish from a dirty or different source state;
- substitute a registry, channel, artifact, or signing mode;
- retry an ambiguous publication without checking remote state.

When publication partially fails, inspect which external side effects committed before deciding retry, repair, deprecate, or stop.

## Verify The Published Release

Verify from the consumer side when possible:

- tag resolves to the intended commit;
- published version and channel are correct;
- checksums, signatures, provenance, and artifact contents match the inspected build;
- a clean install/download/launch path works for supported targets;
- release notes and migration links resolve;
- no unexpected artifact or secret was published.

Do not call the release complete because the publish command exited zero.

## Completion

Report:

- version, source commit, tag, channel, and destinations;
- compatibility rationale and migration notes;
- checks and artifact evidence;
- publication and consumer-side verification;
- credentials/signing steps performed without secret values;
- partial failures, recovery actions, and residual risk;
- whether production shipping remains separate.

Use `../launch-work/SKILL.md` only when a published artifact must now be deployed or rolled out.