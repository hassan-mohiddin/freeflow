# Migration Lifecycle

Read this before choosing migration shape or units, compatibility, cutover evidence, rollback or forward recovery, or removal proof.

## Migration Shapes

- **Code or API:** add the new contract, migrate callers in bounded groups, remove the old contract.
- **Configuration:** support old and new forms temporarily, migrate stored and generated config, reject the old form only after compatibility obligations end.
- **Traffic:** route bounded cohorts to the new path, compare behavior and operational signals, expand only when advance criteria hold.
- **Data:** expand schema, backfill or transform, move reads/writes, reconcile, then contract the old representation.
- **Dependency:** introduce the replacement, verify compatibility at owning seams, migrate packages or consumers, remove the old dependency and transitive assumptions.
- **Feature:** define replacement or removal behavior, migrate users and documentation, observe usage, then remove code and operational surfaces.

Do not force every migration into the same sequence. Choose the smallest shape that preserves accepted compatibility, safety, and evidence. A scoped migration may stop after its accepted units move while the old contract remains under a support window; removal remains a separate stage and claim.

## Consumer Inventory

Possible evidence includes:

- static references and dependency graphs;
- runtime traffic, logs, metrics, traces, or audit records;
- generated clients, plugins, scripts, jobs, and configuration;
- external teams, independently deployed services, offline clients, and dormant accounts;
- package download or version-support data;
- explicit owner attestations where observation is impossible.

Classify unknowns. Missing telemetry is unavailable evidence, not zero usage.

## Compatibility Machinery

Adapters, aliases, dual reads/writes, translation, flags, and shims are migration tools, not automatically permanent architecture.

For each temporary mechanism, record:

```text
Purpose:
Consumers protected:
Observable differences:
Owner:
Exit condition:
Removal evidence:
Failure behavior:
```

If the shim becomes harder to remove with each consumer, reconsider the compatibility boundary and ownership before adding another exception.

## Data Movement

Before moving data, settle:

- authoritative source during each phase;
- idempotency and restart behavior;
- duplicate, partial, invalid, and late-arriving records;
- read/write ordering and reconciliation;
- privacy, retention, permissions, and audit requirements;
- rollback versus forward-only recovery;
- backup, restore, and destructive-cleanup proof.

A reversible schema change does not imply reversible data semantics.

## Advance, Hold, Roll Back

Define evidence-relative criteria rather than universal percentages or time windows:

- **Advance:** required behavior and operational signals remain within accepted bounds.
- **Hold:** evidence is incomplete, variance is unresolved, or a bounded investigation is needed.
- **Roll back or recover forward:** data safety, security, compatibility, or accepted service behavior is violated.

The owner decides consequential thresholds and acceptable degradation.

## Removal Proof

A removal claim should combine the strongest available evidence:

1. no supported consumer still requires the old contract;
2. runtime or owner evidence covers consumers static analysis cannot see;
3. state and configuration have been reconciled;
4. compatibility and rollback obligations have ended;
5. the replacement remains verified with the old path disabled or absent;
6. removal does not erase required history, audit evidence, or recovery material.

If a consumer class cannot be observed, state the uncertainty and obtain the owning decision before destructive removal.
