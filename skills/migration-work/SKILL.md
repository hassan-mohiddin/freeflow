---
name: migration-work
description: Use when replacing, sunsetting, or removing an API, feature, dependency, schema, configuration, service, or implementation; migrating callers, users, traffic, or data; defining compatibility and rollback; or proving that legacy behavior can be removed safely.
---

# Migration Work

Move consumers safely, then remove the old path with evidence.

A deprecation notice is not a migration. A replacement existing is not proof that callers moved. Code becomes removable only when its behavior, consumers, state, and rollback obligations are understood.

## Route First

Use `../decision-gate/SKILL.md` before choosing:

- whether the old behavior should be maintained, deprecated, or removed;
- advisory versus compulsory migration, deadlines, and support windows;
- compatibility, public API, data conversion, downtime, permissions, billing, security, privacy, or data-loss behavior;
- irreversible cutover, destructive cleanup, or rollback limits.

Do not manufacture a migration merely because code looks old. Inspect ownership, usage, source truth, incidents, maintenance cost, and consumer value first.

If the replacement behavior or interface is unsettled, route to Discover, `../design-for-depth/SKILL.md`, or spec revision before planning migration mechanics.

## Establish The Contract

Before editing, identify:

```text
Old contract and current value:
Replacement contract and known differences:
Consumers / callers / data / traffic:
Compatibility promise:
Migration unit and ordering:
State written during transition:
Verification for each unit:
Rollback or forward-recovery path:
Removal proof:
Owner decisions and stop conditions:
```

Read [the migration lifecycle](references/migration-lifecycle.md) for API, code, configuration, traffic, or data migration shapes and removal evidence.

Treat undocumented observable behavior as possible consumer dependency until evidence says otherwise. Do not preserve every quirk automatically; surface consequential differences for decision.

## Expand

Introduce the replacement or additive contract without breaking the old path.

- Prove the replacement through the real caller seam.
- Keep old and new ownership explicit.
- Add compatibility adapters, flags, dual reads/writes, or translation only when the migration contract requires them.
- Give temporary compatibility machinery an owner, purpose, exit condition, and removal checkpoint.
- Do not add new features to the old path unless required for safety or an explicit support decision.

A migration without a viable replacement may still be necessary for an emergency security or data-safety reason, but that route requires explicit owner direction and a documented failure contract.

## Migrate

Move one bounded consumer, cohort, traffic segment, configuration set, or data partition at a time.

For each unit:

1. capture the pre-migration state or baseline;
2. apply the migration through the intended path;
3. verify behavior, data, errors, permissions, and relevant operational signals;
4. confirm rollback or forward recovery remains possible;
5. record remaining consumers and route-changing evidence.

Do not infer migration completion from code search alone when runtime, external, dormant, generated, or independently deployed consumers may exist.

Stop when:

- replacement behavior diverges from the accepted contract;
- unknown consumers or hidden dependencies appear;
- migration requires a new public or failure behavior decision;
- data cannot be reconciled or rollback assumptions fail;
- compatibility machinery spreads caller knowledge or becomes a second permanent system;
- remaining work grows or the next bounded migration unit is unclear.

Preserve completed evidence and route only the affected contract, plan, or cohort backward.

## Contract

Remove the old path only after the accepted removal proof is satisfied.

Check, as relevant:

- active and dormant consumers are accounted for;
- traffic, telemetry, dependency analysis, or explicit owner confirmation supports zero remaining use;
- data and configuration are reconciled;
- rollback obligations and observation windows are complete;
- old code, adapters, flags, tests, docs, alerts, dashboards, secrets, jobs, and configuration are classified for removal or retention;
- the replacement remains verified without the old path.

Do not delete source truth or historical migration evidence merely to make search results clean. Update current docs and contracts; preserve durable history where the repo expects it.

## Review And Verification

Select independent review under Workflow for public contracts, consequential data movement, destructive cleanup, security/privacy boundaries, large consumer sets, or irreversible cutover. Reversible migration learning does not require review by default.

Verification must prove the migration unit and the absence claim being made. “New path passes” does not prove “old path is unused.” “No source references” does not prove “no deployed consumers.”

Use `../verify-work/SKILL.md` for claim-to-evidence matching and `../launch-work/SKILL.md` when migration includes production rollout.

## Completion

Report:

- replacement and compatibility status;
- migrated and remaining consumers or data;
- verification and operational evidence;
- rollback or recovery status;
- legacy components removed and deliberately retained;
- unresolved decisions and residual risk;
- next migration, observation, removal, or stop route.

Do not call a deprecation complete while supported consumers remain, and do not call a migration complete while the legacy path still lacks an accepted removal decision.