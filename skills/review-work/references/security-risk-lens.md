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

## Finding Calibration

Block when evidence shows exploitable behavior, policy violation, unintended privilege/data exposure, unsafe failure semantics, secret leakage, or a required control missing from the accepted contract.

Use `Question` for unresolved security behavior owned by the user or policy. Use `Needs evidence` when the control may exist but the available test or environment cannot prove it.

Do not turn every theoretical hardening idea into a blocker. Name the asset, path, precondition, consequence, and source requirement.

## Route

- Implementation defect -> bounded fix with regression evidence.
- Unknown exploitability/root cause -> diagnosis or specialist review.
- Missing policy or accepted risk decision -> Decision Gate.
- Architecture spreads trust decisions across callers -> design-for-depth.
- Production rollout risk -> launch-work readiness.
