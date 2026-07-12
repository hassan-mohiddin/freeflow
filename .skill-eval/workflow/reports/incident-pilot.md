# Freeflow Incident Attribution Pilot

> **Status:** Accepted pilot evidence
> **Date:** 2026-07-12
> **Candidate skill source:** `c7cfdba`
> **Reference skill source:** `87f83cb`
> **Fixture checkpoint:** `2477b14`
> **Final case-source checkpoint:** `3551aa2`
> **Configuration:** Pi 0.80.6, `openai-codex/gpt-5.5`, high thinking, exact declared old shared stack/runtime, one differing target

## Decision

All four current target candidates passed their fixed incident pressure. Two show attributable active-behavior improvement, one shows candidate-only activation plus a passing candidate artifact, and one shows no attributable improvement because both revisions already pass.

This pilot supports continuing to the broader qualification matrix without another immediate skill edit. It does not promote any included skill, establish near-miss behavior, prove realistic incident replay, or generalize beyond this exact configuration.

## Final Accepted Cases

| Case | Target | Decision | Candidate | Reference | Bundle |
| --- | --- | --- | --- | --- | --- |
| `WFI-001` | `design-for-depth` | inconclusive comparison; candidate activation/behavior pass | target read; semantic pass | target not read; semantic unavailable | `.skill-eval/workflow/runs/evaluations/20260712172542482-wfi-001-da494fbba8/` |
| `WFI-002` | `tdd` | improved | target read; semantic pass | target read; semantic fail | `.skill-eval/workflow/runs/evaluations/20260712174026240-wfi-002-a533c790e6/` |
| `WFI-003` | `verify-work` | same | target read; semantic pass | target read; semantic pass | `.skill-eval/workflow/runs/evaluations/20260712173020819-wfi-003-92e364fe99/` |
| `WFI-004` | `design-for-depth` | improved | target read; semantic pass | target read; semantic fail | `.skill-eval/workflow/runs/evaluations/20260712174250931-wfi-004-07fe248d63/` |

Every final candidate assertion passed. Each final bundle passed fresh integrity verification.

## Interpretation By Failure Class

### Activation

`WFI-001` isolates an activation lift. The current `design-for-depth` target was read and produced a passing plan-pressure review. The old target was not read, so its active wording cannot be compared from this case. Keep the comparison inconclusive rather than renaming it improved.

`WFI-002`, `WFI-003`, and final `WFI-004` observed both target revisions, so their semantic comparisons are active-body evidence rather than delivery-only evidence.

### Active wording and behavior

`WFI-002` shows attributable `tdd` improvement under rejected-state pressure. Both variants added tests before production changes and fixed canonical publication. The current target additionally tested:

- visible rejection;
- null canonical state for a malformed fresh publication;
- byte-exact prior accepted-state preservation;
- separate rejected diagnostics;
- unchanged tests across the implementation turn.

The old target omitted direct rejected-diagnostics assertions and failed the fixed rubric.

`WFI-004` shows attributable `design-for-depth` improvement after a second sibling-adapter defect. Both variants preserved the direct fix and stopped further production edits. The current target additionally named shared canonical report publication as the semantic failure unit, rejected another adapter-local patch, and routed backward to settle the cross-adapter publication failure contract. The old target routed backward only to a generic canonical-state contract and failed to identify the shared publication seam. This case does not establish centralized classification or diagnostic-publication ownership.

### Already sufficient behavior

`WFI-003` shows no attributable `verify-work` lift. Both revisions rejected helper/callback counters as proof of registered host integration, distinguished direct callback invocation from host dispatch, and required evidence through the real registered boundary. Do not edit `verify-work` from this observation.

### Placement and stop behavior

The final multi-turn candidate preserved valid prior work, stopped patching after the repeated invariant, created the requested checkpoint, and closed a backward route without another review pass. No placement or missing-stop failure was observed in the current candidate.

### Composition

Final cases used old shared base skills and old runtime so the current target was the only changed component. This preserves target attribution but does not prove the same contribution inside the complete current stack. Affected current-stack composition and near-miss cases remain required before promotion.

### Fixture, grader, host, and limit corrections

Preserved diagnostic evidence:

1. `.skill-eval/workflow/runs/evaluations/20260712171705436-wfi-001-48a1487846/` — unused shared `write-plan` activation blocked semantic grading. The prompt and behavioral rubric were preserved; only the irrelevant base/assertion was removed.
2. `.skill-eval/workflow/runs/diagnostics/20260712171959244-wfi-002-7ad4f8171e/` — runtime delivery-count validation failed after exactly eight consumed turns with no settled variant. The preserved diagnostic does not independently prove turn exhaustion as the root cause. The bounded cap was raised to 16 as a resource diagnosis, no partial evidence was reused, and the whole case reran successfully under a newly approved fingerprint.
3. `.skill-eval/workflow/runs/evaluations/20260712172830360-wfi-002-ceed318012/` — unused shared `execute-plan` activation blocked semantic grading. Only that unrelated assertion was removed.
4. `.skill-eval/workflow/runs/evaluations/20260712173152360-wfi-004-087f301995/` — undocumented literal JSON values rejected semantically valid route artifacts. Independent review required removing lexical outcome checks and retaining the unchanged semantic rubric.

All case-source changes received focused independent review and fresh fingerprint approval before whole-case reruns. No settled variant was reused.

### Overactivation and ceremony

The pilot contains positive pressure cases, not near-miss controls. It found no excess ceremony in the accepted artifacts, but it cannot establish non-trigger discipline or overactivation safety.

## Accounting

Final accepted bundles:

- provider requests / turns: `84`;
- tool calls: `78`;
- tokens: `522,008`;
- cost: `$1.548674`.

All pilot attempts, including preserved case/limit diagnostics:

- provider requests / turns: `145`;
- tool calls: `138`;
- tokens: `911,566`;
- cost: `$2.625124`.

Costs are observed. Approved spend ceilings were soft process-boundary checks, not an independent aggregate hard cap.

## Evidence Boundary

Established:

- current `tdd` behavior improves rejected-state test design and prior-state/diagnostic preservation over the old snapshot in this scripted case;
- current `design-for-depth` activates for the planning pressure and passes its artifact rubric;
- current `design-for-depth` improves repeated-invariant routing and semantic failure-unit ownership over the old snapshot in this four-turn case;
- both old and current `verify-work` reject fake registered-boundary proof in this case;
- case-design and limit failures remain distinguishable from target behavior.

Not established:

- automatic activation on another prompt, host, model, Pi version, or complete current composition;
- near-miss non-trigger behavior;
- model-independent reliability;
- adaptive follow-ups or more than four scripted turns;
- byte-exact historical incident replay;
- realistic replay against sanitized production-shaped source;
- readiness of `workflow`, `design-for-depth`, `tdd`, `verify-work`, or any shared skill.

## Route

Proceed to Phase 5 coverage design. Preserve current skill wording until another fixed case exposes a trustworthy failure. Before promoting incident-owner skills, add:

1. positive activation and near-miss controls;
2. complete-current-stack composition evidence where required;
3. sanitized realistic replay for incident-generalization claims;
4. exact-source integrity and independent evidence review.
