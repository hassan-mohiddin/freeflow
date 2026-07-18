# Security Risk Lens

Read this when work changes trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, dependencies, external integrations, execution, or failure behavior with security consequences.

This lens helps frame review. It does not replace repo security policy, threat modeling, specialist review, or stack-specific hardening guidance.

## Establish Authority

Identify:

- assets and data requiring protection;
- actors, roles, tenants, and privilege levels;
- trust boundaries and external systems;
- accepted security/privacy policy and threat model;
- compatibility and failure behavior that security controls must preserve.

Security-sensitive product behavior remains user-owned. Do not invent access, retention, logging, or fail-open/closed policy during review.

## Trace The Paths

Review the affected path from boundary to effect:

- authentication: who or what is this actor;
- authorization: may this actor perform this operation on this resource;
- input: validation, canonicalization, size, encoding, and injection surfaces;
- output: escaping, disclosure, error detail, and side channels;
- data: collection, transport, storage, isolation, retention, deletion, and audit;
- secrets: source, scope, rotation, exposure, and logging;
- execution: shell, file, URL, template, deserialization, plugin, or code-loading boundaries;
- dependencies: provenance, permissions, known risk, update impact, and transitive behavior;
- failure: partial state, retries, lockout, rate limits, rollback, and fail-open/closed behavior.

Look for confused-deputy and cross-tenant paths, not only malformed input.

## Evidence

Prefer evidence at the real boundary:

- tests proving allowed and denied roles/resources;
- negative input and injection cases;
- dependency or configuration inspection tied to the shipped artifact;
- logs or traces demonstrating no secret/sensitive leakage;
- failure-path tests for partial authorization, retry, and recovery;
- specialist analysis for cryptography, sandboxing, identity protocols, or high-impact threats.

A generic scanner pass cannot prove authorization logic or policy correctness. A unit test cannot prove deployed headers, identity configuration, or infrastructure permissions.

Do not copy secrets, credentials, unrestricted personal data, or sensitive payloads into review context. Use the smallest sanitized evidence that supports the review item.

## Review Item Calibration

Treat supported exploitable behavior, policy violation, unintended privilege or data exposure, unsafe failure semantics, secret leakage, or a missing required control as an Issue.

Classify the Issue against the accepted security policy and reviewed boundary:

- **Blocking:** crossing the boundary would remain unsafe, non-compliant, or contrary to a required control.
- **Non-blocking:** the security issue is real but can be deferred safely without violating the accepted boundary.

Use **Question** when security behavior or accepted risk remains undecided. Use **Needs evidence** when a control may exist but the available test or environment cannot establish it.

Treat materially useful defense-in-depth beyond the accepted boundary as an Improvement. Do not turn theoretical hardening, preference, or hypothetical completeness into an Issue.

Do not omit an observed security issue merely because the selected lenses were narrower. Name the asset, path, precondition, consequence, evidence, and source requirement.

## Route

When security evidence changes the path, use [Workflow](../../workflow/SKILL.md) to choose what follows. Use [Diagnose Failure](../../diagnose-failure/SKILL.md) for unknown exploitability or root cause, [Decision Gate](../../decision-gate/SKILL.md) for missing policy or accepted-risk decisions, [Design For Depth](../../design-for-depth/SKILL.md) when trust decisions spread across callers, and [Launch Work](../../launch-work/SKILL.md) when the concern affects production rollout.
