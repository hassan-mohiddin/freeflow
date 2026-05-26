# Reviewer Prompt

Use this when preparing an outgoing reviewer prompt or subagent review context.

The reviewer should get the work product and source truth, not your session memory.

## Include

- What was implemented or changed.
- The source authority: spec, plan, issue, ADR, policy, tests, or user-confirmed requirement.
- Files or diff range to inspect. If no git range exists, list concrete files.
- Claimed verification and what still needs independent checking.
- Risk lenses relevant to the work.
- Required output shape and severity labels.
- Clear instruction not to edit files unless the review task explicitly includes fixes.

Do not forward only a previous-agent summary. Summaries are useful context, not authority.

## Risk Lenses

Pick the lenses that fit the work:

- Source-truth alignment: implementation matches spec, plan, docs, tests, and established behavior.
- Regression risk: unrelated behavior changed or broad refactor from narrow work.
- Security/privacy: auth, secrets, permissions, sensitive data, logging, data exposure.
- Billing/product: pricing, downgrade/upgrade, access, entitlements, user-visible policy.
- Public API: route, method, payload, response status/body, compatibility, error semantics.
- Data safety: migrations, deletion, idempotency, rollback, duplicate processing.
- Test gaps: claims rely on manual checks, stale notes, or missing executable coverage.
- Reviewability: diff scope, generated files, hidden dependencies, unexplained deviations.

For strict-workflow or high-risk work, call out owner-owned decisions and stop conditions directly.

## Output Shape

Ask the reviewer to lead with findings, ordered by severity:

```md
## Findings

### Blocking
- [file:line] Title
  - What is wrong:
  - Why it matters:
  - Minimal fix direction:

### Non-blocking
- ...

### Questions
- ...

## Assessment

Ready to proceed: Yes | No | With fixes
Reasoning: ...
```

If review passes, the reviewer should say that clearly and name any residual test gaps or assumptions.

Do not ask reviewers to invent issues. A clean pass is valid.

## Minimal Template

```md
# Reviewer Prompt

Review the completed work. Do not edit files.

## Work Summary

[What changed, from the implementer summary or observed files.]

## Source Truth

- [spec/plan/policy/test paths]

## Files Or Range

- [changed files or git range]

## Check

- [risk lenses and concrete requirements]

## Output

Lead with findings by severity. Include file:line, violated requirement, risk, and minimal fix direction. If there are no findings, say so and list residual risk/test gaps.
```
