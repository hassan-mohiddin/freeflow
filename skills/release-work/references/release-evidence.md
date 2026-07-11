# Release Evidence

Read this when version, source, artifact, tag, publication, or recovery identity matters.

## Version Basis

Use the repository's declared scheme. For semantic versioning, classify consumer-observable impact:

- **Major:** supported consumers must change or accepted behavior is removed/incompatible.
- **Minor:** backward-compatible capability is added.
- **Patch:** backward-compatible defect correction.

Prerelease channels, date versions, train versions, and application builds may use different policy. Do not impose SemVer universally.

When compatibility is uncertain, inspect supported consumers and ask rather than selecting the smallest bump.

## Identity Chain

A trustworthy release can connect:

```text
source commit
-> reviewed / verified release state
-> version metadata
-> build invocation and environment
-> artifact digest / signature / provenance
-> immutable tag or release record
-> registry or distribution entry
-> consumer-side install evidence
```

Name missing links instead of implying reproducibility.

## Release Notes

Write for consumers:

- added or changed behavior;
- fixed user-visible defects;
- deprecated and removed contracts;
- security impact without unsafe disclosure;
- migration and compatibility requirements;
- known limitations and unsupported targets.

Commit history can support notes but does not replace curation.

## Artifact Inspection

Check as relevant:

- included and excluded files;
- executable entry points and permissions;
- generated code and source maps;
- dependency and lockfile state;
- licenses and notices;
- platform/architecture variants;
- debug, test, local config, credentials, and private files;
- deterministic digest or signed provenance.

Use the package manager or build system's dry-run/list command when available.

## Publication Failure Contract

Before publication, know:

- which step first creates irreversible remote state;
- whether a version/tag can be retried idempotently;
- how to detect a committed but unacknowledged publish;
- whether repair, deprecation, yank, or replacement is supported;
- who owns consumer communication.

Network failure after a remote commit is ambiguous. Inspect remote state before retrying.

## Consumer Verification

Prefer a clean environment that does not reuse the local checkout or cache unexpectedly.

Verify the actual public artifact by version or digest. A successful local build cannot prove registry contents, install metadata, signatures, or distribution propagation.
