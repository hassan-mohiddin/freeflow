# Phase 5 Routing Qualification Wave 1A

> **Status:** Accepted bounded evidence
> **Date:** 2026-07-12
> **Host/model:** Pi 0.80.6, `openai-codex/gpt-5.5`, high thinking
> **Control:** trigger-description-matched neutral body at `138f16f`
> **Candidate source:** `c7cfdba`, except revised `review-artifact` at `64fe205`

## Decision

Every final candidate passed its near-miss non-activation, positive activation, artifact boundary, and semantic behavior criteria.

This wave does not promote any skill. `workflow`, `decision-gate`, and `write-plan` did not outperform the neutral body under these prompts. `review-artifact` improved only after one measured wording revision. `execute-plan` passed while the neutral control violated objective state boundaries, but neutral semantic grading was unavailable after those objective failures.

## Final Evidence

| Case | Target | Decision | Candidate | Neutral | Bundle |
| --- | --- | --- | --- | --- | --- |
| `WFQ-001` | `workflow` | same | pass | pass | `.skill-eval/workflow/runs/evaluations/20260712182011536-wfq-001-659d45f6ac/` |
| `DGQ-001` | `decision-gate` | same | pass | pass | `.skill-eval/decision-gate/runs/evaluations/20260712182159111-dgq-001-809089883c/` |
| `WPQ-001` | `write-plan` | same | pass | pass | `.skill-eval/write-plan/runs/evaluations/20260712182504609-wpq-001-1445f120e5/` |
| `RAQ-001` | `review-artifact` | improved | pass | fail | `.skill-eval/review-artifact/runs/evaluations/20260712183758789-raq-001-b0d3c7260f/` |
| `XPQ-001` | `execute-plan` | inconclusive comparison | pass | objective fail; semantic unavailable | `.skill-eval/execute-plan/runs/evaluations/20260712184509901-xpq-001-ba48f6f825/` |

All final candidate assertions passed. All final bundles passed fresh integrity verification.

## Findings

### Activation and near-miss discipline

For all five targets:

- neither variant read the target body on the factual near-miss turn;
- both variants read the target body on the first positive pressure turn;
- the near-miss turn created no files.

The neutral and candidate frontmatter names and descriptions were identical. These observations therefore cover the current descriptions' positive/near-miss routing in this exact two- or three-turn shape while isolating active-body behavior.

### No attributable lift yet

`WFQ-001`, `DGQ-001`, and `WPQ-001` passed on both the current and neutral bodies. The current candidates behaved correctly, but these prompts do not establish body-level lift. Strengthen or vary pressure before any body-contribution claim; do not edit a passing skill merely to force differentiation.

### Measured `review-artifact` revision

The first corrected case exposed a trustworthy candidate failure: the plan's immediate adapter slice committed to canonical publication while deferring canonical-versus-diagnostic semantics, and the candidate approved it.

One general rule was added at `64fe205`: an immediate slice is unfit when it commits callers or adapters to a state transition while deferring whether that state is canonical, diagnostic, accepted, or rejected; an unresolved owner Question still blocks readiness.

On the fixed whole-case rerun:

- the neutral body approved the plan;
- the revised candidate identified the unresolved publication semantics as readiness-preventing;
- the revised candidate routed backward before implementation;
- the revised candidate did not block on the filename preference, while the neutral control incorrectly required resolving it before implementation;
- every revised candidate assertion passed.

This proves the measured change for this exact case. It does not by itself establish broad readiness.

### `execute-plan` contribution

Both variants implemented the accepted adapter A slice. On sibling-defect pressure:

- the neutral body patched adapter B immediately, violating the objective preserved-state boundary;
- the candidate preserved adapter A, left adapter B unchanged, and routed backward to adjudicate the shared invariant/scope before another patch.

Because neutral objective assertions failed, its semantic grader did not run. Keep the comparison formally inconclusive while recording that every candidate objective and semantic assertion passed.

## Preserved Diagnostics

- `.skill-eval/review-artifact/runs/evaluations/20260712182652873-raq-001-4bdc7fae2a/` — rubric overconstrained the correct `Question` classification and fixture exposed an unintended parser-contract issue.
- `.skill-eval/review-artifact/runs/evaluations/20260712183356538-raq-001-89ee8c82df/` — corrected case revealed the trustworthy pre-revision active-body failure.
- `.skill-eval/execute-plan/runs/evaluations/20260712183933206-xpq-001-cca24df065/` — redundant turn-3 reread assertion suppressed semantic grading after valid turn-2 activation.

Case corrections received read-only review during execution, but those transient review outputs are not retained as repo evidence. Fresh plan fingerprints and owner approval are recorded in the published plans. No settled variant was reused.

## Accounting

Final accepted bundles:

- provider requests / turns: `79`;
- tool calls: `51`;
- tokens: `159,905`;
- cost: `$0.883782`.

All wave attempts:

- provider requests / turns: `128`;
- tool calls: `84`;
- tokens: `272,772`;
- cost: `$1.515843`.

Observed cost is not an aggregate hard cap.

## Remaining Evidence

Before promotion:

- `workflow`, `decision-gate`, and `write-plan` need stronger or differently shaped pressure that can distinguish the active body from the neutral control;
- core routing skills need complete-current-stack composition evidence;
- `review-artifact` needs a non-trigger regression and affected current-stack composition rerun at exact revised source;
- `execute-plan` needs another pressure/near-miss shape or repeat to strengthen contribution confidence;
- every readiness decision needs exact-source integrity and independent evidence review.

## Route

Continue authoring the next priority-family cases. Preserve all five current skill bodies unless a new fixed pressure case exposes a trustworthy failure. Do not promote from this wave alone.
