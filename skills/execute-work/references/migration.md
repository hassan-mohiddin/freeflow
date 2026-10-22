# Migration

Read this when moving users, data or traffic to a replacement, or removing an old path: a new implementation, schema, service, configuration form, dependency or platform that consumers in use must move to safely.

This reference is judgment about moving consumers, state or traffic without losing compatibility, evidence or recovery options; its "do not" lines and the authority Rule below are binding.

A replacement existing does not prove that consumers moved. A migration unit may be complete while the old path remains under an accepted support contract. Removal is a separate claim with separate evidence and authority.

## Establish Authority And Scope

Rule: loading this reference, discussing a migration, or approving a general implementation Plan does not authorize migration, deprecation, cutover, destructive cleanup, or removal. Carry out only the stages and units explicitly requested or separately approved.

Take to [Discuss Work](../../discuss-work/SKILL.md) whatever remains unresolved among: maintaining, deprecating or removing the old behavior; advisory versus compulsory migration, deadlines or support windows; compatibility, public API, data conversion, downtime, permissions, billing, security, privacy or data-loss behavior; irreversible cutover, destructive cleanup or rollback limits.

Do not manufacture a migration because code looks old: inspect ownership, supported consumers, runtime use, source truth, incidents, maintenance cost, and current value. When replacement behavior, interfaces, ownership or failure semantics remain unsettled, settle them first: Discuss Work for a user-owned choice, [design](design.md) for a design-bearing boundary, [Write Docs](../../write-docs/SKILL.md) when the accepted migration behavior needs a durable contract.

## Define The Migration Contract

Before moving anything, establish:

```text
Old contract and current value:
Replacement contract and known differences:
Consumers / callers / data / traffic:
Compatibility promise and support window:
Migration unit and ordering:
State written during transition:
Verification for each unit:
Rollback or forward-recovery path:
Removal proof:
Owner decisions and stop conditions:
Approved stages and scope:
```

Treat undocumented observable behavior as a possible consumer dependency until evidence says otherwise. Do not preserve every quirk automatically; surface consequential differences for decision.

Choose the smallest shape that preserves accepted compatibility, safety, and evidence; do not force every migration through one sequence:

- **Code or API:** add the new contract, migrate callers in bounded groups, remove the old contract.
- **Configuration:** support old and new forms temporarily, migrate stored and generated config, reject the old form only after compatibility obligations end.
- **Traffic:** route bounded cohorts to the new path, compare behavior and operational signals, expand only when the advance criteria hold.
- **Data:** expand the schema, backfill or transform, move reads and writes, reconcile, then contract the old representation.
- **Dependency:** introduce the replacement, verify compatibility at owning seams, migrate packages or consumers, remove the old dependency and its transitive assumptions.
- **Feature:** define replacement or removal behavior, migrate users and documentation, observe usage, then remove code and operational surfaces.

Inventory consumers from static references and dependency graphs; runtime traffic, logs, metrics, traces or audit records; generated clients, plugins, scripts, jobs and configuration; external teams, independently deployed services, offline clients and dormant accounts; package download or version-support data; and owner attestations where observation is impossible. Classify unknowns: missing telemetry is unavailable evidence, not zero use.

## Prepare The Replacement

When an additive or replacement stage is approved:

- prove the replacement through the real caller path or interface;
- keep old and new ownership explicit;
- add adapters, flags, aliases, translation, or dual reads and writes only when the migration contract requires them;
- do not add features to the old path unless safety or an explicit support decision requires it.

Adapters, aliases, dual writes, translation, flags, and shims are migration tools, not permanent architecture. For each, record:

```text
Purpose:
Consumers protected:
Observable differences:
Owner:
Exit condition:
Removal evidence:
Failure behavior:
```

If a shim grows harder to remove with each consumer, or starts spreading caller knowledge, public states or exceptions, take the structural evidence to [design](design.md#pressure-signals) rather than building a second permanent system.

Before moving data, settle the authoritative source in each phase; idempotency and restart; duplicate, partial, invalid and late records; read and write ordering and reconciliation; privacy, retention, permissions and audit; rollback versus forward-only recovery; and backup, restore and destructive-cleanup proof. A reversible schema change does not imply reversible data semantics.

An emergency migration without a viable replacement may be necessary for security or data safety, but it needs explicit owner direction, bounded impact, and a documented failure and recovery contract.

## Move Bounded Units

Move one accepted consumer, cohort, traffic segment, configuration set, or data partition at a time:

1. capture the relevant pre-migration state or baseline;
2. apply the migration through the intended path;
3. verify behavior, data, errors, permissions, and operational signals at the required boundary;
4. confirm rollback or forward recovery remains possible;
5. preserve evidence and account for remaining units.

Decide each next step by criteria set before the unit began, using the advance, hold and abort vocabulary in Deliver Work's [launch](../../deliver-work/references/launch.md); the owner decides consequential thresholds and acceptable degradation.

Code search alone cannot prove completion when runtime, external, dormant, generated, offline, or independently deployed consumers may exist. Stop and report the evidence, taking any choice it leaves to the user through Discuss Work, when replacement behavior diverges, unknown consumers appear, a new owner decision is needed, data cannot be reconciled, recovery assumptions fail, compatibility machinery spreads, or the next safe unit is unclear. Keep completed units; do not restart the whole migration.

## Remove The Old Path

Remove or disable the old path only when that stage is explicitly authorized and the removal proof holds, combining the strongest available evidence:

1. no supported consumer, active or dormant, still requires the old contract;
2. runtime, telemetry or owner evidence covers consumers static analysis cannot see;
3. data and configuration are reconciled;
4. compatibility, support-window, observation and rollback obligations have ended;
5. the replacement stays verified with the old path disabled or absent;
6. old code, adapters, flags, tests, docs, alerts, dashboards, secrets, jobs and configuration are classified for removal or retention, and removal erases no required history, audit evidence or recovery material.

If a consumer class cannot be observed, state the uncertainty and obtain the owning decision before destructive removal. Do not delete source truth or historical migration evidence to make searches clean. When current docs or contracts would become false, report them, and update them when the approved scope includes them.

## Verify, Deliver And Report

Use [Verify Work](../../verify-work/SKILL.md) for each unit, compatibility, reconciliation and absence claim: "the new path passes" does not prove "the old path is unused". Propose an independent review through Review Work when the migration changes public contracts, moves consequential data, crosses security or privacy boundaries, affects many consumers, or performs an irreversible cutover or cleanup.

Publishing the replacement as a versioned artifact, and any stage that changes production traffic, data, configuration or exposure, including the rollout and the old path's removal from production, go through [Deliver Work](../../deliver-work/SKILL.md), each within its own yes.

Report the approved scope and completed units; replacement and compatibility status; remaining consumers, state, traffic or observation windows; verification and operational evidence; rollback or forward-recovery status; legacy parts removed and deliberately kept; unresolved decisions and residual risk; and the next approved unit, removal boundary, deferral or stop. Removal is complete only when its separate authorization and proof are satisfied.
