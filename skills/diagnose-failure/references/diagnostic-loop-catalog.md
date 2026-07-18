# Diagnostic Loop Catalog

Read this when the smallest useful diagnostic loop for a reported failure or current hypothesis is unclear.

## Common Loops

- **Failing test:** use when an existing stable interface or test boundary reaches the reported behavior.
- **Reproduction command:** one CLI, package task, or script with representative fixture input.
- **HTTP or protocol script:** the smallest real request sequence that crosses the affected boundary.
- **Browser path:** the user flow with relevant DOM, console, network, and visual observations.
- **Captured trace:** a sanitized log window, HAR, event payload, seed, timestamped screenshot, dump, or production sample replayed safely.
- **Throwaway harness:** a minimal script around the real module when no test framework reaches it.
- **Differential loop:** the same input through old and new code, configuration, dataset, dependency, or environment.
- **Instrumented run:** targeted probes at boundaries that distinguish competing hypotheses.

## Improve The Loop

Prefer a loop that is:

- **Sharper:** observes the reported symptom or hypothesis rather than generic failure.
- **More representative:** preserves the relevant input, state, environment, and observing boundary.
- **More distinguishing:** can support one plausible cause while contradicting another.
- **More deterministic:** pins time, randomness, dependencies, filesystem, or network only when doing so preserves the failure.
- **Faster:** removes unrelated setup without narrowing the claim.
- **Safer:** isolates mutation, sanitizes sensitive evidence, and has bounded cleanup or recovery.

An observer must sit on the real path and cover the complete operation. A manual counter beside the path, a helper call, or a nearby mocked flow does not prove the reported boundary ran.

## Boundary Examples

- A UI save remains pending → exercise the browser path and inspect the request, console, and rendered state; a reducer unit test does not prove the reported boundary.
- A registered callback allegedly never runs → invoke or observe the registered entrypoint; calling its helper directly proves only helper behavior.
- A failure appears only in CI → compare the same input across local and CI configuration before changing timing or adding retries.
- Two causes fit one symptom → choose an observation whose outcomes differ between them; another generic failure is not distinguishing evidence.

If no safe useful loop is possible, identify the smallest missing artifact or access: command, logs, trace, failing input, timestamped screenshot, environment boundary, or permission for isolated temporary instrumentation. Leave the cause unresolved rather than substituting a weaker claim.
