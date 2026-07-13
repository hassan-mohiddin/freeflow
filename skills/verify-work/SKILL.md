---
name: verify-work
description: "Use after any meaningful slice when richer guidance would improve self-verification, when a non-trivial integration/runtime/installed/browser/performance/failure proof path needs guidance, when direct checks fail or prove less than expected, or for a separately selected verifier. Reading it or calling `/verify-work` does not imply independence; independent verification requires the standing final boundary or explicit user authorization."
---

# Verify Work

Match every consequential claim to fresh evidence, then check whether the evidence preserves the current route.

Verification is not ceremony at the end. Direct checks are the feedback edge after each meaningful slice.

Routine planned checks may run from Workflow guidance alone. Read this skill after any meaningful slice when richer proof method, evidence-boundary, or failure-interpretation guidance would help; reuse it across related slices while context remains valid.

## Choose The Mode

**Enhanced self-verification:** the implementing agent applies this method in its current context, runs checks, interprets evidence, and corrects local reversible defects. Reading the skill or calling `/verify-work` selects this mode by default and never claims independence.

**Independent verification:** a distinct fresh verifier applies the same method without editing. This mode requires the standing final boundary or explicit scoped user authorization. It is separate from independent review.

Review and verification answer different questions: review supplies judgment; verification proves observable claims. Neither substitutes for the other.

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

Evidence proves only the boundary it directly observes. Calling a shared helper does not prove callback registration, host dispatch, or installed-package execution. A counter or trace proves execution only when it observes inside or wraps the actual invoked boundary.

Read [integration evidence](references/integration-evidence.md) when a claim depends on registered callbacks or executors, host lifecycle, producer invocation, fallback protocols, installed packages, absence counters, or verification checks that may mutate shared state. Read [browser runtime evidence](references/browser-runtime-evidence.md) when a claim depends on rendered UI, client networking, console state, accessibility, screenshots, or browser performance. Read [performance evidence](references/performance-evidence.md) when representative baselines, variance, profiler data, or resource tradeoffs determine the claim.

## Run And Read

1. Run the complete selected check.
2. Inventory the supplied evidence before selecting scope. A summary never defines the evidence boundary; read lower-level events, metadata, or artifacts that can contradict it.
3. Read the full relevant output and exit status.
4. Confirm it exercised the intended seam and failure or success path.
5. Compare the result with the source requirement and claim.
6. State what passed, failed, remained unavailable, or was reduced-fidelity.

Do not convert missing evidence into zero, pass, safe, or probably correct.

If the user asks to skip checks, skip them but downgrade the claim to changed, inspected, or unverified. Permission to skip evidence is not evidence.

When downgrading a boundary claim, name the exact fresh evidence required to restore it. “Not proved” without that observing boundary is a verdict, not a verification route.

## Failure Route

When verification fails or proves less than expected, stop before patching forward and classify:

- **Implementation defect:** the source-backed behavior is wrong.
- **Test or verifier defect:** the check conflicts with source truth or cannot prove its claim.
- **Environment or dependency:** the check cannot run as designed.
- **Source conflict or owner decision:** accepted behavior is no longer clear.
- **Plan or scope defect:** the slice or acceptance path is wrong.
- **Possible design pressure:** diagnosis or direct structural evidence may show a shallow interface, shared state, or growing coordination.
- **Unsupported claim:** the required host, failure path, integration, or evidence class is unavailable.

Do not edit tests, verifiers, specs, policies, or implementation randomly to make the signal green. Use `../diagnose-failure/SKILL.md` when root cause is unclear or failures repeat. Use `../design-for-depth/SKILL.md` only when diagnosis or direct structural evidence establishes design pressure, and `../decision-gate/SKILL.md` when direction depends on source truth or an owner decision.

## Route Check

After the check, ask:

- What exactly did this prove?
- Which behavior or failure path remains unverified?
- Did evidence invalidate an assumption, interface, spec, plan, or later slice?
- Is remaining work shrinking and the next bounded path still clear?
- Is this final implementation verification, or does an authorized exceptional boundary require formal review?

Choose a route:

- **Continue:** evidence supports the current slice and plan.
- **Broaden verification:** the claim is wider than the check.
- **Bounded fix:** one source-backed local defect is clear.
- **Diagnose:** root cause or repeated failure is unclear.
- **Formal review:** standing artifact/final boundary or another scoped authorization applies.
- **Revise design/spec/plan:** evidence invalidated the current path.
- **Decision gate:** owner or source conflict blocks progress.
- **Stop or unsupported:** no honest proof path is available.

A green command is not automatic permission to continue when the route check exposes scope drift or design pressure.

## Independent Final Verification

After the sequential final self-check, run one standing-authorized independent verification against the frozen integrated implementation in parallel with the final reviewer. The verifier must use a distinct fresh context from both implementer and reviewer and must not receive reviewer output. Read [the independent verifier prompt](references/verifier-prompt.md) when packaging this checkpoint.

The verifier runs the finalized evidence package and reports factual boundaries; it does not edit, redesign, or perform the independent review role. One package may contain several commands, environments, and claims but counts as one independent-verification checkpoint.

Collect its result with the independent review before adjudicating. Completion requires verifier Pass and resolved review for the same unchanged state. If either result causes implementation changes, both are stale; self-check the fix and ask before another independent verifier or reviewer dispatch. Do not collapse the roles.

## Report

Use a compact evidence report:

```text
Claim:
Evidence:
Result:
Proves:
Does not prove:
Route: continue | broaden | fix | diagnose | formal-review | revise | decide | stop
```

For final consequential implementation, complete the sequential self-check, then dispatch the distinct verifier and reviewer in parallel against one frozen state before claiming completion. State what changed, what was verified, and what remains unverified. Omit `Next:` for direct answers, mid-task status, clarification-only turns, and direct owner-decision questions.