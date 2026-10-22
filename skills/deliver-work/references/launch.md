# Launch

This reference is judgment about changing production deliberately and keeping a safe recovery path; its "do not" lines are binding. Deployment changes what runs; rollout changes who or what is exposed. A build, merge, release or staging pass does not prove production behavior.

## Establish The Boundary

Carry out only the stages explicitly requested or approved through an inspected launch contract or accepted operational policy. Take deployment, exposure, rollback, destructive migration, the launch window, acceptable degradation, user communication and recovery direction to [Discuss Work](../../discuss-work/SKILL.md) while they remain the user's choice.

Publish a versioned artifact first through [release](release.md) when one is needed. Use Execute Work's [migration](../../execute-work/references/migration.md) as well when the launch moves data, traffic, consumers, configuration or compatibility contracts from an old path to a replacement.

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

After each stage the next step is one of three, by criteria agreed before it began:

- **Advance** when required behavior and signals stay within bounds. The next stage still needs its yes unless the approved launch contract covers it.
- **Hold** when evidence is incomplete or a difference unexplained. Elapsed time is no reason to advance while a required signal is missing.
- **Abort** when a safety, data, security, compatibility or agreed service criterion fails: roll back, or recover forward where rollback is unsafe, without widening scope.

Take thresholds and observation periods from SLOs, baselines, policy or the owner's decision, never from universal percentages or windows; the owner decides consequential thresholds and acceptable degradation.

Feature flags, canaries, blue/green, shadow traffic and phased regions are options, not defaults; choose only what the platform and the accepted failure contract support, and do not adopt "every feature needs a flag" as a rule.

## Establish Readiness

Use only the lenses whose risk applies to this change; this is not a universal checklist. A required lens with missing evidence is not green.

- **Identity and ownership:** exact artifact, commit, image, configuration, migration and target are known; deployment, rollout, rollback, incident and communication owners are known where risk requires; production credentials come through approved channels, never prompts, logs or source.
- **Behavior and compatibility:** accepted requirements and critical user paths have fresh evidence; public APIs, clients, schemas, feature states and supported versions stay compatible or have an approved migration; failure, retry, idempotency, duplicate, ordering and recovery behavior are settled for consequential operations.
- **Data:** the authoritative source and migration ordering are explicit; backups, reconciliation, partial failure, restart, rollback and forward recovery are proved to the required level; privacy, retention, deletion, audit and permission obligations still hold.
- **Security and access:** threat-relevant changes received the required specialist or policy review; authentication, authorization, secret handling, untrusted input, dependency, network and privilege boundaries are verified where affected; telemetry and support tooling expose no secrets or unnecessary personal data. When a security-focused review is selected, read the [security risk lens](../../review-work/references/security-risk-lens.md).
- **Performance and capacity:** representative baseline and expected load are known where capacity can change; latency, throughput, saturation, queue, storage and dependency limits have evidence. Read [performance evidence](../../verify-work/references/performance-evidence.md) for readiness and improvement claims, and Execute Work's [diagnose](../../execute-work/references/diagnose.md#flaky-and-performance-failures) only when a regression lacks a supported cause.
- **Accessibility and user experience:** when interfaces change, verify the affected critical paths with the repository's design and accessibility authority and tooling: keyboard, focus, semantics, assistive technology, responsive, loading, empty, error and degraded states, where relevant.
- **Observability:** start from what operators must answer: is the new path used, succeeding, within latency and capacity bounds; why is a given request, job or migration failing; are data, queues, retries and dependencies healthy; can one operation be traced across components. Use structured logs for event detail, metrics for aggregate rate, error, duration or saturation, and traces for cross-component paths; keep metric dimensions bounded, and do not log secrets, tokens, full sensitive payloads or unrestricted personal identifiers. Verify telemetry itself by inducing or observing a safe known event and finding its signal, fields and alert routing.
- **CI/CD and environment:** the pipeline and target run the checks this change needs; artifacts are promoted, not rebuilt differently without approval; environment drift, secrets, migrations and deployment ordering are inspected; a failed or ambiguous pipeline step has a known retry or reconciliation contract. Provider-specific workflow syntax belongs to the repository or platform skill.

Confirm the artifact and configuration identity, required pre-production checks, recovery path, operational signals and any selected review before starting an approved stage. Do not deploy to obtain evidence that should exist safely before production. When only production can answer a question, first define an approved bounded learning rollout with its observation, hold, abort and recovery conditions.

## Deploy And Expose In Approved Stages

Separate operations when the platform permits: deploy inert code, configuration or infrastructure; verify health and compatibility; expose a bounded cohort, tenant, region or traffic segment; compare required signals with the accepted baseline; then advance, hold or abort.

For each stage, define:

```text
Stage / cohort:
Action:
Expected signals:
Advance if:
Hold if:
Abort (roll back or recover forward) if:
Verification:
Owner:
```

Then:

1. confirm artifact, configuration, target and current production state;
2. execute the bounded action once;
3. verify technical and user-visible behavior;
4. inspect telemetry, data integrity and unexpected side effects;
5. preserve anomalies and choose the next step before expanding exposure.

## Handle Failure And Recovery

Before rolling back, determine whether code, schema, data, messages, caches, clients or external effects make rollback unsafe or incomplete, and test or rehearse the recovery path to the level the risk warrants. Do not repeat migrations, jobs, publishes, configuration changes or exposure operations blindly. Preserve incident evidence. Do not weaken alerts, checks, thresholds or accepted behavior to declare the launch healthy.

## Verify The Production Outcome

Observe from the production boundary, as applicable:

- the intended artifact and configuration are active;
- critical user and failure paths behave as accepted;
- data, compatibility, privacy and permission invariants hold;
- telemetry is present, queryable, bounded and free of unexpected sensitive data;
- alerts, escalation and recovery routes work where required;
- temporary flags, adapters, dual writes, dashboards, elevated logging, permissions or support procedures have owners and cleanup conditions; route compatibility removal through Execute Work's migration.

A quiet dashboard is not evidence when telemetry is absent or broken. A launch is complete when the accepted exposure and observation contract is satisfied, not when a deployment command succeeds, and it does not authorize later migration removal, release publication or cleanup outside the approved scope.
