---
name: verify-work
description: Use before claiming work is done, fixed, passing, implemented, reviewed, or ready; when verification fails; or when the user asks to skip checks but still wants a completion claim.
---

# Verify Work

Do not claim completion without fresh evidence.

## Evidence Rule

Before saying work is done, fixed, passing, implemented, reviewed, or ready, verify the claim.

Good evidence can be:

- Passing tests.
- Typecheck, lint, build, or formatter output.
- Reproducing a bug before and after a fix.
- Inspecting the changed file when no executable check exists.
- A targeted manual check.

Use the smallest verification that proves the claim.

## Claim Rule

Match the claim to the evidence.

- If tests passed, say which tests passed.
- If only a file was inspected, say that.
- If no runnable check exists, say the work is unverified by automation.
- If the user asks to skip checks, skip the checks but do not claim verified or passing.

Never convert "I changed the code" into "it works" without evidence.

## Failure Rule

If verification fails, stop and report the evidence.

Do not patch randomly. Decide whether the failure means:

- Implementation bug.
- Bad or stale test.
- Source-of-truth conflict.
- Missing environment/dependency.
- User-owned product/domain decision.

If the failure challenges the spec, plan, docs, policy, or tests, re-enter the interview gate before changing direction.

## Final Response

Use this shape:

```text
Changed: ...
Verified: ...
Not verified: ...
Next: ...
```

For completed consequential work, `Next:` is mandatory. Omit it only for direct question answers, mid-task status, or clarification-only turns.

Keep it short.
