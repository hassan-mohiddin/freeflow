# Diagnose

Read this when a failure has no known cause, or two fixes did not hold: an unexplained bug, failed check, regression, slowdown, flaky or environmental behavior, or contradictory observations.

This reference is judgment, with the Rules below and one more under Flaky And Performance Failures. It adds the loop and its routing to Execute Work's [Diagnose Before Fixing](../SKILL.md#diagnose-before-fixing), which already holds the essentials: a plausible line is a hypothesis, the explanation must cover the whole symptom, and two failed fixes mean the diagnosis is wrong.

Establish what fails and why before selecting a correction. A supported cause distinguishes the meaningful alternatives well enough to bound the next action; it does not require impossible certainty. A requested patch, a reviewer's theory or a favorable rerun is not a supported cause.

## Rules

- Never invent the expected behavior. When accepted behavior or source truth is unsettled, settle it through [Discuss Work](../../discuss-work/SKILL.md) before diagnosing against it.
- Before active evidence generation, confirm the work agreement covers its path, environment, repetition, instrumentation, cost, sensitive data, and cleanup. Covered bug investigation needs no extra permission; otherwise propose the observation and its stop condition to the user and wait.
- Preserve unfavorable evidence. Never rerun until a failure disappears, and never drop a contradicting observation.
- Minimize and sanitize logs, traces, payloads, dumps, screenshots, and browser state; never expose credentials or unnecessary private data.
- Report a mitigation as containment, not resolution; never claim fixed when only a mitigation succeeded or the reported boundary is unverified.
- When a remedy makes a user-owned choice, as Discuss Work defines it, take its concrete consequence and alternatives there before adopting it.

## Enter Only For An Unsettled Cause

When fresh evidence already shows a clear local defect and the remedy, correct it under [Execute Work](../SKILL.md) instead. Several bugs in one area do not establish a shared structural cause. Keep diagnosis inside the current Slice; when continuity needs it, record the hypothesis, the evidence that decides it, rejected approaches and the next action through [Track Work](../../track-work/SKILL.md), not every trial.

## Establish The Failure, Not The Proposed Fix

Identify only what the investigation needs: the expected behavior and its source; the observed symptom and any counterevidence; the relevant input, state, environment, timing and path; and the strongest boundary actually observed, with any gap between it and the reported failure. A nearby symptom suggests a hypothesis but does not reproduce the reported defect; state reduced fidelity.

Allowed behavior is not a bug: a cache hit is not a stale-read failure when caching is permitted. A possible race in source is not the cause without evidence connecting its timing and state to the symptom.

## Choose A Distinguishing Observation

State a falsifiable leading explanation and only the alternatives the next observation must tell apart:

```text
Hypothesis:
Predicted observation:
What would contradict it:
Meaningful alternative:
```

Choose a repeatable loop whose possible results differ between those explanations. Do not build a hypothesis around the requested patch and then treat consistency with it as proof. When timing, randomness, environmental variance, concurrency, or resource behavior shapes the failure, read Flaky And Performance Failures below before selecting or running an observation.

Common loops, smallest first that reaches the reported boundary:

- **Failing test:** an existing stable interface or test boundary reaches the reported behavior.
- **Reproduction command:** one CLI, package task, or script with representative fixture input.
- **HTTP or protocol script:** the smallest real request sequence that crosses the affected boundary.
- **Browser path:** the user flow with relevant DOM, console, network, and visual observations.
- **Captured trace:** a sanitized log window, HAR, event payload, seed, timestamped screenshot, dump, or production sample replayed safely.
- **Throwaway harness:** a minimal script around the real module when no test framework reaches it.
- **Differential loop:** the same input through old and new code, configuration, dataset, dependency, or environment.
- **Instrumented run:** targeted probes at boundaries that distinguish competing hypotheses.

Before running, write down only the outcomes that tell the hypotheses apart:

```text
Observation outcome | Effect on leading hypothesis | Effect on alternative
```

If every likely outcome leaves the same hypotheses plausible, sharpen the observer or choose another loop before generating evidence. Prefer a loop that is sharper (observes the symptom, not generic failure), more representative (keeps the relevant input, state, environment and boundary), more distinguishing, more deterministic (pins time, randomness, dependencies, filesystem or network only when that preserves the failure), faster without narrowing the claim, and safer (isolated mutation, sanitized evidence, bounded cleanup).

An observer must sit on the real path and cover the complete operation; a manual counter beside the path, a helper call, or a nearby mocked flow does not prove the reported boundary ran. A UI save that stays pending needs the browser path with its request, console and rendered state, not a reducer unit test. A callback said never to run needs its registered entrypoint invoked or observed, not its helper called directly. A failure only in CI needs the same input compared across local and CI configuration before any timing change or retry.

## Flaky And Performance Failures

Rule: never stabilize a flaky failure with sleeps, retries, wider timeouts, swallowed errors, or disabled checks unless evidence shows that mechanism addresses the causal timing or availability contract. Suppressing observation is not correction.

Diagnostic measurement explains why variance or resource behavior occurs; after correction, Verify Work establishes whether the representative behavior or performance claim holds.

**Flaky failures.** The goal is not one lucky rerun: raise the reproduction rate or capture the distinguishing event until the failure can be explained. Use, when safe and representative, bounded repetition of the exact failing path; captured seeds, time, timezone, locale, viewport, browser, runtime and dependency versions; controlled scheduling, fake clocks, CPU pressure, network delay or concurrency; console, network, event-order, scheduler, screenshot or video traces; and old-versus-new, local-versus-CI or headed-versus-headless differential runs. Choose the repetition count from runtime, cost, side effects and the estimated failure rate, and state the stop condition before running. One green rerun does not contradict an intermittent-failure hypothesis; one red rerun may establish the symptom but not its cause. Classify from the aggregate pattern or the captured event. Do not loop mutating production behavior to improve reproduction. Twenty green reruns after widening a timeout mean the failure was suppressed or became rarer; its cause is still unresolved.

**Performance problems.** Measure the reported path before optimizing it. Useful causal evidence includes a baseline for the representative workload; the slow input, dataset, concurrency, cache and dependency state; a profiler, flamegraph, query plan, allocation profile or browser trace; an old-versus-new comparison under matched conditions; and a benchmark of the dominant work the evidence identified.

Reduce a large profile, trace, or heap snapshot to a form you can query before reading it, such as one row per sample, frame, or node in SQLite. Then query for the frames holding the most time, or follow the retainer chain from the leaked object to a root. A hot frame without a source mapping is not yet a diagnosis: resolve its symbols, or say the artifact lacks them. One capture supports the strongest remaining hypothesis; a matched before-and-after capture or another distinguishing observation is needed to support the cause.

A microbenchmark can test a hypothesis but does not explain the reported slowdown unless the isolated operation determines the real path: a parser benchmark that improves while the trace is dominated by database waiting explains nothing. Repeated calls with one object justify memoization only when the reported workload repeats that object and measurement shows the repeated work dominates. Median latency improving while tail latency or memory crosses the accepted boundary leaves the claim contradicted or incomplete.

When choosing the correction for the dominant work, try the cheapest kind first and stop at the first that meets the target: drop work whose result nothing uses, stop repeating it, do less of it, defer it, move it off the path someone waits on, run it concurrently, and only then make it faster. Sanitize production traces and payloads; when safe production evidence is unavailable, use representative non-production evidence and downgrade the claim. After an authorized correction, verify that the representative baseline improves and required behavior stays correct, and report variance and resource trade-offs rather than one favorable run.

Stop when the loop has produced a distinguishing pattern or event, the planned repetition or cost boundary is reached, or the required representative evidence is unavailable.

Stop reading once the context supports the experiment. If no safe, useful observer exists, report the smallest missing input, trace, environment, permission, or instrumentation rather than patching a guess.

## Interpret One Iteration

Run one covered observation, changing one distinguishing variable at a time. [Verify Work](../../verify-work/SKILL.md) owns what a check result means; diagnosis owns the causal inference. Keep three results apart:

- **Check result:** Passed, Failed, Error, or Unavailable, as Verify Work defines them. Observing an expected target failure can be a Passed check.
- **Hypothesis result:** Supported, Contradicted, Inconclusive, or Unavailable at the stated boundary.
- **Cause status:** Supported or Unresolved.

A supported cause connects trigger and state through a mechanism to the symptom, predicts the observations, weakens the viable alternatives, and bounds a correction without guessing. A supported hypothesis need not establish the cause: if only the strongest remaining hypothesis is supported, say so and name its missing link.

- Check Error -> repair or replace the observer, not production.
- Check Unavailable -> return the missing evidence or authority.
- Hypothesis Contradicted -> keep the result and revise the explanation.
- Hypothesis Inconclusive -> choose a sharper observer if one is useful and covered.
- Hypothesis Supported, cause Unresolved -> test the remaining link or alternative.
- Cause Supported -> return the correction boundary.

Stop when the cause is sufficiently supported or no covered observation can improve the decision; do not keep investigating because stronger certainty is imaginable.

## Keep The Correction Inside The Task

A failed reproduction method is not proof that production needs new infrastructure, a stronger guarantee, or a host change. Choose the smallest correction that preserves accepted behavior, and classify only the owning cause the evidence supports: a local defect; an invalid, stale or inadequate check; an environment, dependency, data, timing or configuration issue; a missing observer; unsettled behavior or a source conflict; the wrong result, scope, order or strategy; or structural ownership, interface, state or failure-unit pressure.

Before adding a guard that lets the failing state pass, such as a check, default, retry or caught error, ask whether accepted behavior allows that state. If it should never exist, the guard hides the defect; correct what produced it. Once the cause is supported, look for the same fault wherever the same mechanism recurs; correct instances inside the agreed boundary and report the rest.

When the evidence establishes structural pressure, read [design](design.md); it shapes the boundary without re-proving the cause. If design reveals an unsupported causal premise, come back here with that exact uncertainty.

## Contain Harm And Keep Instrumentation Honest

Bound repetitions by time, cost, effects, and environment safety. Temporary instrumentation must distinguish hypotheses; keep it isolated and state its observer, its mutation or performance impact, its removal condition, and whether it remains. When immediate harm needs containment before the cause is settled, propose one narrow, reversible mitigation to the user that preserves evidence, defines its check and recovery, and settles no undefined behavior. An experimental patch can generate evidence when authorized as learning; it does not select production behavior.

## Return A Supported Correction Boundary

Return proportionately: the failure and expectation at the required boundary; the loop, check result and hypothesis result; the causal chain, alternatives weakened and remaining uncertainty; the owning cause and smallest correction; a minimized regression signal; when the deciding fact took deep digging, a cheap always-on signal (a log line, assertion or metric) that would have shown it at first look; and instrumentation, containment, residual effects and authority limits.

A covered correction continues under Execute Work. Use [simplify](simplify.md) only for an accepted removal of obsolete or workaround machinery, not as a substitute for the fix. After correction, verify the minimized signal and the original reported path or the strongest available observer; a nearby passing test is not enough. If the fix fails or reveals related shared-state consequences, return to the causal question before another patch.
