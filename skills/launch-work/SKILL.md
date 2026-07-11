---
name: launch-work
description: Use when preparing, approving, executing, monitoring, or rolling back a production deployment or user rollout; defining launch readiness, staged exposure, migration ordering, operational signals, advance/hold/abort criteria, or post-launch verification.
---

# Launch Work

> Status: Unverified candidate

Change production deliberately, observably, and with an explicit recovery path.

A build, merge, release, or staging pass is not production proof. Deployment changes what runs; rollout changes who experiences it.

## Decision Boundary

Production deployment, exposure, rollback, destructive migration, launch window, acceptable degradation, and user communication are user-owned unless an accepted operational policy already decides them.

Use `../decision-gate/SKILL.md` when any of those choices are unresolved. Recommend strict-workflow for security, privacy, billing, permissions, data-loss, public API, compatibility, infrastructure, or hard-to-reverse launches.

Read [launch readiness](references/launch-readiness.md) when selecting risk lenses, operational evidence, rollout stages, or recovery checks.

Use `../release-work/SKILL.md` when a versioned artifact must be produced first. Use `../migration-work/SKILL.md` when the launch moves data, traffic, consumers, or compatibility contracts.

## Launch Contract

Before changing production, establish:

```text
Outcome and affected users/systems:
Artifact / commit / configuration identity:
Target environment and owner:
Deployment versus exposure steps:
Dependencies and migration ordering:
Expected operational and business signals:
Advance / hold / abort criteria:
Rollback or forward-recovery path:
Observation and post-launch verification:
Communication and escalation:
```

Use thresholds and observation periods supported by SLOs, baselines, policy, or explicit owner decisions. Do not import universal canary percentages, fixed windows, or “every feature needs a flag” rules.

## Readiness

Select checks based on the actual change. Relevant categories may include:

- accepted behavior and regression evidence;
- security, privacy, permissions, billing, and data safety;
- compatibility and migration readiness;
- capacity, performance, dependency, and failure behavior;
- configuration, secrets, infrastructure, and environment drift;
- accessibility and critical user paths;
- logs, metrics, traces, dashboards, alerts, and runbooks;
- support, communication, ownership, and rollback authority.

A checklist item is required only when its risk applies. Missing required evidence is not green.

Do not deploy merely to obtain evidence that should exist safely before production. When only production can answer a question, define a bounded learning rollout and stop/rollback conditions first.

## Deploy And Expose

Separate operations when the system allows it:

- deploy inert code or infrastructure;
- verify health and compatibility;
- expose to a bounded cohort or traffic segment;
- compare required signals with baseline;
- advance, hold, roll back, or recover forward based on the contract.

Feature flags, canaries, blue/green, shadow traffic, or phased regions are options, not defaults. Choose the mechanism supported by the platform and accepted failure contract.

For each stage:

1. confirm artifact/config identity and target;
2. execute the approved bounded action;
3. verify technical and user-visible behavior;
4. inspect telemetry and data integrity;
5. record anomalies and decide the route before expanding exposure.

Do not continue rollout because elapsed time passed while required signals are missing.

## Failure And Recovery

Stop or abort when accepted safety, data, security, compatibility, or service criteria are violated.

Before rollback, determine whether code, schema, data, messages, caches, clients, or external side effects make rollback unsafe or incomplete. Forward recovery may be safer, but choosing it is not automatic permission to broaden scope.

If deployment state is ambiguous, inspect the target before retrying. Do not issue duplicate migrations, jobs, publishes, or configuration changes blindly.

Use `../diagnose-failure/SKILL.md` for unexpected behavior and preserve incident evidence. Do not weaken alerts, tests, or thresholds merely to declare the launch healthy.

## Post-Launch

Verify from production-observable paths:

- intended artifact/configuration is active;
- critical user and failure paths behave as accepted;
- data and compatibility invariants hold;
- telemetry is present, queryable, bounded, and free of unexpected sensitive data;
- alerts and escalation routes work when required;
- rollback/recovery remains available during the accepted window;
- temporary flags, adapters, dashboards, elevated logging, or support procedures have owners and cleanup checkpoints.

A quiet dashboard is not evidence when telemetry is absent or broken.

## Completion

Report:

- deployed artifact/config and exposure state;
- readiness evidence and owner approvals;
- rollout stages and decisions;
- operational, user, business, and data observations;
- rollback/recovery status;
- incidents, holds, or deviations;
- temporary machinery and cleanup owner;
- residual risk and next observation, advance, cleanup, or stop route.

Launch completion means the accepted exposure and observation contract is satisfied—not merely that a deployment command succeeded.