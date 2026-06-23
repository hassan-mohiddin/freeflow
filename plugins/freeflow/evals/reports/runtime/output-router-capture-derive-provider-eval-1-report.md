# Output Router Capture/Derive/Provider Eval - Iteration 1

Date: 2026-06-23

## Scope

Targeted deterministic eval for Slice 9 of the universal output capture/derive work. It compares direct/raw evidence shapes against explicit Freeflow routing for read-only provider capture, web-shaped capture, deterministic derive, and provider-summary tool choice.

This eval does not claim broad superiority. It verifies bounded evidence, exact recovery where promised, lineage, category-scoped provider summaries, and non-injection of invalid custom manifest text for these fixtures.

## Command

```sh
npm run build && node plugins/freeflow/evals/scripts/run-output-router-capture-derive-eval.js
```

## Summary

- Fixtures: 4
- Objective gates passed: 14/14
- Direct host-tool capture: not evaluated and remains off by default.
- Mutating provider tools: not mediated by `freeflow_capture`.

## Results

| fixture | direct/raw baseline | Freeflow routed behavior | status | gates |
| --- | --- | --- | --- | --- |
| direct-readonly-provider-vs-freeflow-capture | 1268 raw bytes would enter context from direct provider output | 233 evidence bytes entered context; raw recovery=exact | pass | readOnlyCaptured ✓; boundedEvidence ✓; exactRecovery ✓ |
| web-shaped-capture-and-recovery | 1682 raw bytes from web-shaped output | 301 evidence bytes plus exact recovery | pass | webProducerCaptured ✓; boundedEvidence ✓; exactRecovery ✓ |
| long-log-manual-inspection-vs-freeflow-derive | 7729 raw log bytes for manual inspection | 176 filtered evidence bytes; countMatches=2; exact derived recovery | pass | manualBaselineWouldReadWholeLog ✓; filteredTargetFacts ✓; countMatches ✓; lineage ✓ |
| provider-summary-tool-choice-accuracy | Raw provider docs/manuals are not injected | 458 summary bytes; diagnostics category only; invalid custom guidance omitted | pass | compactSummary ✓; categoryScoped ✓; invalidCustomNotInjected ✓; mutationBoundaryPresent ✓ |

## Result

All targeted Slice 9 capture/derive/provider-summary gates passed for these deterministic fixtures.
