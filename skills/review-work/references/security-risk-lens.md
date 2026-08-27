# Security Risk Lens

Read this before reviewing work that changes trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, security-relevant dependencies or external integrations, code-execution boundaries, or failure behavior with security consequences.

This lens helps frame review. It does not replace repository security policy, threat modeling, specialist review, or stack-specific hardening guidance.

## Establish Authority

Identify:

- assets and data requiring protection;
- actors, roles, tenants, and privilege levels;
- trust boundaries and external systems;
- accepted security and privacy policy and threat model;
- compatibility and failure behavior that security controls must preserve.

Security-sensitive product behavior remains user-owned. Do not invent access, retention, logging, or fail-open or fail-closed policy during review.

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
- failure: partial state, retries, lockout, rate limits, rollback, and fail-open or fail-closed behavior.

Look for confused-deputy and cross-tenant paths, not only malformed input.

## Require Boundary-Matched Evidence

Prefer evidence at the real boundary:

- tests proving allowed and denied roles and resources;
- negative input and injection cases;
- dependency or configuration inspection tied to the shipped artifact;
- logs or traces demonstrating no secret or sensitive leakage;
- failure-path tests for partial authorization, retry, and recovery;
- specialist analysis for cryptography, sandboxing, identity protocols, or high-impact threats.

A generic scanner pass cannot prove authorization logic or policy correctness. A unit test cannot prove deployed headers, identity configuration, or infrastructure permissions.

Do not copy secrets, credentials, unrestricted personal data, or sensitive payloads into review context. Use the smallest sanitized evidence that supports the item.

## Calibrate Items

Treat supported exploitable behavior, policy violation, unintended privilege or data exposure, unsafe failure semantics, secret leakage, or a missing required control as an Issue.

Classify it against accepted security policy and the reviewed boundary:

- **Blocking:** crossing the boundary would remain unsafe, non-compliant, or contrary to a required control.
- **Non-blocking:** the issue is real but can be deferred safely without violating the accepted boundary.

Use **Question** when security behavior or accepted risk remains undecided. Use **Needs evidence** when a control may exist but the available test or environment cannot establish it.

Treat materially useful defense in depth beyond the accepted boundary as an Improvement. Omit theoretical hardening, preference, or hypothetical completeness.

Do not omit an observed security issue because the selected lenses were narrower. Name the asset, path, precondition, consequence, evidence, and source requirement.

## Return Through The Selected Role

For self-review, return a route-changing security concern to [Workflow](../../../skills/workflow/SKILL.md). Use [Diagnose Failure](../../../skills/diagnose-failure/SKILL.md) for unknown exploitability or cause, [Decision Gate](../../../skills/decision-gate/SKILL.md) for missing policy or accepted-risk decisions, [Design For Depth](../../../skills/design-for-depth/SKILL.md) when trust decisions spread across callers, and [Launch Work](../../../skills/launch-work/SKILL.md) when the concern affects production rollout.

For independent review, classify the concern in the review report and stop. Do not route, correct, or dispatch follow-up. The receiving agent adjudicates the report and selects what follows.
