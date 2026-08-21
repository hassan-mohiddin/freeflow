# Launch Readiness

Use only the lenses relevant to the production change. This is not a universal checklist.

## Identity And Ownership

- Exact artifact, commit, image, configuration, migration, and target environment are known.
- Deployment, rollout, rollback, incident, and communication owners are known where risk requires them.
- Production permissions and credentials are available through approved channels without entering prompts, logs, or source.

## Behavior And Compatibility

- Accepted requirements and critical user paths have fresh evidence.
- Public APIs, clients, schemas, feature states, and supported versions remain compatible or have an approved migration.
- Failure, retry, idempotency, duplicate, ordering, and recovery behavior are settled for consequential operations.

## Data And Migration

- Authoritative source and migration ordering are explicit.
- Backups, reconciliation, partial failure, restart, rollback, and forward-recovery behavior are proved to the required level.
- Privacy, retention, deletion, audit, and permission obligations remain satisfied.

## Security And Access

- Threat-relevant changes received the required specialist or policy review.
- Authentication, authorization, secret handling, untrusted input, dependency, network, and privilege boundaries are verified where affected.
- Telemetry and support tooling do not expose secrets or unnecessary personal data.

When Workflow selects a security-focused review, read the [security risk lens](../../review-work/references/security-risk-lens.md).

## Performance And Capacity

- Representative baseline and expected load are known where capacity can change.
- Critical latency, throughput, saturation, queue, storage, and dependency limits have evidence.
- Advance and abort criteria are relative to accepted SLOs, historical baseline, or owner-approved thresholds.

Read [performance evidence](../../verify-work/references/performance-evidence.md) for readiness and improvement claims. Read [Flaky and Performance Diagnosis](../../diagnose-failure/references/flaky-and-performance-diagnosis.md) only when a regression lacks a supported cause.

## Accessibility And User Experience

When user interfaces change, verify the affected critical paths using the repo's design/accessibility authority and available domain tooling. Consider keyboard, focus, semantics, assistive technology, responsive behavior, loading, empty, error, and degraded states only where relevant.

## Observability

Start from questions operators must answer:

- Is the new path being used?
- Is it succeeding and within accepted latency/capacity bounds?
- Why is a specific request, job, or migration failing?
- Are data, queues, retries, and dependencies healthy?
- Can one affected operation be correlated across components?

Choose structured logs for event detail, metrics for aggregate rate/error/duration or resource saturation, and traces for cross-component paths. Keep metric dimensions bounded. Do not log secrets, tokens, full sensitive payloads, or unrestricted personal identifiers.

Verify telemetry itself by inducing or observing a safe known event, finding the signal, checking fields/labels, and confirming alert/runbook routing where required.

## CI/CD And Environment

- The pipeline and target environment execute the checks required by this change.
- Generated artifacts are promoted consistently rather than rebuilt differently without approval.
- Environment drift, secrets, migrations, and deployment ordering are inspected.
- A failed or ambiguous pipeline step has a known retry/reconciliation contract.

Provider-specific workflow syntax belongs to the repo or platform skill.

## Rollout And Recovery

Define:

```text
Stage / cohort:
Action:
Expected signals:
Advance if:
Hold if:
Abort or recover if:
Verification:
Owner:
```

Rollback must account for code, data, schema, messages, clients, caches, and external side effects. Test or rehearse the recovery path to the level warranted by risk.

## Temporary Machinery

Flags, adapters, dual writes, elevated logging, launch dashboards, temporary permissions, and support procedures need an owner and cleanup checkpoint. Route compatibility removal through [Migration Work](../../migration-work/SKILL.md).
