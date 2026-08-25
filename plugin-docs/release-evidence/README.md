# Release Evidence

This directory stores versioned evidence for Freeflow release candidates and releases. It is not a rolling current-state log.

## Evidence boundary

Each version record describes the source, checks, artifact boundaries, deferred evidence, and limits for one version or candidate. Evidence remains case-, host-, model-, and configuration-specific. Deterministic checks establish structure and delivery boundaries; they do not establish universal skill readiness or model behavior.

A version record should identify:

- the source revision and package version it covers;
- the checks and focused observations that ran;
- the artifact/package boundary they observed;
- deferred, unavailable, or host-specific evidence;
- claims the evidence does not support.

After a release is frozen, its version record is historical evidence. Do not rewrite it to describe later source or runtime behavior. Create a new record for a new candidate or release.

## Version records

- [Freeflow v0.5.0](v0.5.0.md): the evidence preserved for the released v0.5.0 source and artifact boundary.
- [Freeflow v0.6.0 candidate](v0.6.0.md): prepared local candidate evidence; commit, tag, publication, and consumer verification remain pending.

## Related documentation

- [Release process](../release.md)
- [Architecture](../architecture.md)
- [Workflow](../workflow.md)
- [Root changelog](../../CHANGELOG.md)
