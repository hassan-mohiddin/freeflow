---
name: launch-work
description: Use when preparing or carrying out a production deployment, rollout, rollback, or recovery.
---

# Launch Work

Change production deliberately, observe the result, and preserve a safe recovery path.

Deployment changes what runs. Rollout changes who or what is exposed. A build, merge, release, or staging pass does not prove production behavior.

## Establish Authority And Boundary

Loading this skill, preparing launch options, or approving a general implementation Plan does not authorize deployment, exposure, rollback, destructive migration, or another production action. Execute only the stages explicitly requested or separately approved through an inspected launch contract or accepted operational policy.

Use [Decision Gate](../decision-gate/SKILL.md) when deployment, exposure, rollback, destructive migration, launch window, acceptable degradation, user communication, or recovery direction remains a user-owned choice.

Before selecting risk lenses, operational evidence, rollout stages, or recovery checks, read [launch readiness](references/launch-readiness.md). Use [Release Work](../release-work/SKILL.md) when a versioned artifact must be published first. Use [Migration Work](../migration-work/SKILL.md) when the launch transitions data, traffic, consumers, configuration, or compatibility contracts between old and replacement paths with migration or removal obligations.

## Define The Launch Contract

Before changing production, establish:

```text
Outcome and affected users / systems:
Artifact / commit / configuration identity:
Target environment and owner:
Deployment versus exposure stages:
Dependencies and migration ordering:
Expected technical, user, business, and data signals:
Advance / hold / abort criteria:
Rollback or forward-recovery path:
Observation and post-launch verification:
Communication and escalation:
Approved stages and scope:
```

Use thresholds and observation periods supported by SLOs, baselines, policy, or explicit owner decisions. Do not import universal canary percentages, fixed windows, or “every feature needs a flag” rules.

## Establish Readiness

Select evidence for the actual production boundary. Relevant concerns may include:

- accepted behavior and regression evidence;
- security, privacy, permissions, billing, and data safety;
- compatibility and migration readiness;
- capacity, performance, dependency, and failure behavior;
- configuration, secrets, infrastructure, and environment drift;
- accessibility and critical user paths;
- logs, metrics, traces, dashboards, alerts, and runbooks;
- support, communication, ownership, and recovery authority.

A concern is required only when its risk applies. Missing required evidence is not green. Confirm the intended artifact and configuration identity, required pre-production checks, recovery path, operational signals, and any selected review before starting an approved production stage.

Read [Verify Work](../verify-work/SKILL.md) to match readiness claims to fresh direct evidence. Do not deploy merely to obtain evidence that should exist safely before production. When only production can answer a question, define an approved bounded learning rollout with observation, hold, abort, and recovery conditions first.

Return unresolved owner decisions, material evidence gaps, or broader review needs to [Workflow](../workflow/SKILL.md). This skill defines the production boundary and evidence; Workflow owns routing and review selection.

## Deploy And Expose In Approved Stages

Separate operations when the platform permits it:

- deploy inert code, configuration, or infrastructure;
- verify health and compatibility;
- expose a bounded cohort, tenant, region, or traffic segment;
- compare required signals with the accepted baseline;
- advance, hold, abort, roll back, or recover forward according to the contract.

Feature flags, canaries, blue/green, shadow traffic, and phased regions are options, not defaults. Choose only mechanisms supported by the platform and accepted failure contract.

For each approved stage:

1. confirm artifact, configuration, target, and current production state;
2. execute the bounded action once;
3. verify technical and user-visible behavior;
4. inspect telemetry, data integrity, and unexpected side effects;
5. preserve anomalies and choose the next route before expanding exposure.

Do not continue because elapsed time passed while required signals are missing. Approval of one stage does not authorize the next unless the accepted launch contract already does so.

## Handle Failure And Recovery

Hold or abort when accepted safety, data, security, compatibility, or service criteria are violated.

Before rollback, determine whether code, schema, data, messages, caches, clients, or external effects make rollback unsafe or incomplete. Forward recovery may be safer, but it is not automatic permission to broaden scope.

If production state is ambiguous, inspect the target before retrying. Do not repeat migrations, jobs, publishes, configuration changes, or exposure operations blindly.

Use [Diagnose Failure](../diagnose-failure/SKILL.md) for unexpected behavior without a supported cause. Preserve incident evidence. Do not weaken alerts, checks, thresholds, or accepted behavior merely to declare the launch healthy.

## Verify The Production Outcome

Observe from the production boundary as applicable:

- intended artifact and configuration are active;
- critical user and failure paths behave as accepted;
- data, compatibility, privacy, and permission invariants hold;
- telemetry is present, queryable, bounded, and free of unexpected sensitive data;
- alerts, escalation, and recovery routes work where required;
- temporary flags, adapters, dashboards, elevated logging, permissions, or support procedures have owners and cleanup conditions.

A quiet dashboard is not evidence when telemetry is absent or broken. State production paths, cohorts, observation windows, or recovery behavior that remain unverified.

## Report Completion Precisely

Report:

- approved launch stage and exposure state;
- deployed artifact, configuration, and target identity;
- readiness evidence and owner decisions;
- stage results and technical, user, business, and data observations;
- holds, incidents, deviations, rollback, or forward recovery;
- temporary machinery, owner, and cleanup condition;
- residual risk and next approved observation, advance, cleanup, or stop route.

Launch completion means the accepted production exposure and observation contract is satisfied—not merely that a deployment command succeeded. A completed launch does not authorize later migration removal, release publication, or cleanup outside the approved scope.
