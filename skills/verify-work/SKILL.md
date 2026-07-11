---
name: verify-work
description: Use after a meaningful work slice and before claiming work is done, fixed, passing, implemented, reviewed, or ready; when choosing evidence for a claim; when verification fails or proves less than expected; or when verification evidence may change the current route.
---

# Verify Work

Match every consequential claim to fresh evidence, then check whether the evidence preserves the current route.

Verification is not ceremony at the end. It is the feedback edge after each meaningful slice.

Review and verification are different: review supplies independent judgment; verification proves observable claims. Neither substitutes for the other.

## Name The Claim

Before running a check, state what must be proved:

- behavior or bug symptom;
- build, type, lint, format, or structural validity;
- public interface or integration behavior;
- failure, retry, recovery, degradation, or fail-closed behavior;
- performance or resource bound;
- artifact completeness or repository state.

Choose the smallest check that can disagree with the claim. Do not run broad commands by habit when a focused check proves the slice, and do not use a narrow check to imply broader readiness.

## Evidence

Useful evidence includes:

- a behavior test, repro, benchmark, or real user path;
- typecheck, build, lint, formatter, schema, or structural validation;
- before/after files, diff, status, logs, traces, or command output;
- targeted integration or manual checks when no executable automation exists;
- independent review only for judgment claims, not as proof that code ran correctly.

Evidence must be fresh for the code and configuration being claimed. A prior pass becomes stale when behavior-relevant inputs change.

A happy path does not prove graceful failure, retry safety, recovery, fail-closed behavior, or readiness under failure. Those claims need failure-path evidence.

Passing tests do not prove the accepted outcome when the tests cover only introduced machinery or a narrower behavior.

Read [browser runtime evidence](references/browser-runtime-evidence.md) when a claim depends on rendered UI, client networking, console state, accessibility, screenshots, or browser performance. Read [performance evidence](references/performance-evidence.md) when representative baselines, variance, profiler data, or resource tradeoffs determine the claim.

## Run And Read

1. Run the complete selected check.
2. Read the full relevant output and exit status.
3. Confirm it exercised the intended seam and failure or success path.
4. Compare the result with the source requirement and claim.
5. State what passed, failed, remained unavailable, or was reduced-fidelity.

Do not convert missing evidence into zero, pass, safe, or probably correct.

If the user asks to skip checks, skip them but downgrade the claim to changed, inspected, or unverified. Permission to skip evidence is not evidence.

## Failure Route

When verification fails or proves less than expected, stop before patching forward and classify:

- **Implementation defect:** the source-backed behavior is wrong.
- **Test or verifier defect:** the check conflicts with source truth or cannot prove its claim.
- **Environment or dependency:** the check cannot run as designed.
- **Source conflict or owner decision:** accepted behavior is no longer clear.
- **Plan or scope defect:** the slice or acceptance path is wrong.
- **Design pressure:** repeated local failures expose a shallow interface, shared state, or growing coordination.
- **Unsupported claim:** the required host, failure path, integration, or evidence class is unavailable.

Do not edit tests, verifiers, specs, policies, or implementation randomly to make the signal green. Use `../diagnose-failure/SKILL.md` when root cause is unclear, `../design-for-depth/SKILL.md` when failures accumulate at a seam, and `../decision-gate/SKILL.md` when direction depends on source truth or an owner decision.

## Route Check

After the check, ask:

- What exactly did this prove?
- Which behavior or failure path remains unverified?
- Did evidence invalidate an assumption, interface, spec, plan, or later slice?
- Is remaining work shrinking and the next bounded path still clear?
- Does accumulated risk now justify review, a commit checkpoint, or handoff?

Choose a route:

- **Continue:** evidence supports the current slice and plan.
- **Broaden verification:** the claim is wider than the check.
- **Bounded fix:** one source-backed local defect is clear.
- **Diagnose:** root cause or repeated failure is unclear.
- **Review:** independent judgment could change confidence or route.
- **Revise design/spec/plan:** evidence invalidated the current path.
- **Decision gate:** owner or source conflict blocks progress.
- **Stop or unsupported:** no honest proof path is available.

A green command is not automatic permission to continue when the route check exposes scope drift or design pressure.

## Report

Use a compact evidence report:

```text
Claim:
Evidence:
Result:
Proves:
Does not prove:
Route: continue | broaden | fix | diagnose | review | revise | decide | stop
```

For final consequential completion, state what changed, what was verified, what remains unverified, and the recommended next route. Omit `Next:` for direct answers, mid-task status, clarification-only turns, and direct owner-decision questions.