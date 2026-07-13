# Independent Artifact Reviewer Contract

Use this for the standing consequential spec/plan review or another formally authorized independent artifact-review boundary. It is not the active agent's enhanced self-review mode.

## Required Context

Provide:

- artifact path, type, and boundary it must support;
- accepted outcome, non-goals, and explicit owner decisions;
- live source truth: relevant code, tests, policies, ADRs, and established behavior;
- linked upstream or downstream artifacts;
- known evidence gaps;
- only the review lenses material to this boundary;
- prior findings and adjudication for a confirmation review.

For a combined spec-and-plan package, identify the spec as upstream authority and the plan as provisional until the spec verdict is known.

## Portable Prompt

```md
# Independent Artifact Review

Review whether this artifact package is fit for its intended boundary. Do not edit files or resolve owner decisions. This is a strict second opinion, not a completeness contest.

## Boundary Under Review

[What future promotion, planning, implementation, or consequential decision this review protects.]

## Artifact Package

- [path]: [spec | plan | handoff | decision note | discovery note | other]
- Dependency order: [upstream -> downstream, or standalone]

For a combined spec and plan, review the spec first. Review the plan only if the spec is fit enough to plan from. If a spec blocker invalidates plan assumptions, mark those plan areas contingent rather than generating exhaustive downstream findings.

## Accepted Outcome And Non-Goals

- Outcome: [accepted outcome]
- Non-goals: [explicit exclusions]
- Owner decisions: [decisions or none]

## Source Truth

- [docs, tests, policies, ADRs, code, established behavior]

## Review Scope

- Material lenses: [source alignment | sufficiency | evidence | failure contract | planning horizon | design depth | scope | clarity]
- Pass: [1 | confirmation | exceptional-3]

For confirmation or exceptional pass:
- Prior findings: [summary]
- Parent adjudication: [accepted | rejected | question | needs evidence]
- Owner clarifications: [decisions or none]
- Changed sections and evidence: [bounded list]
- Residual risk: [one narrow question]

## Check

Apply only the selected lenses:

- Source alignment: requirements, owner decisions, and live facts agree.
- Sufficiency: enough is settled for the intended next action, not every future action.
- Evidence: boundary-critical claims and promotion conditions have direct supporting or falsifying mechanisms.
- Failure contract: consequential states, forbidden outcomes, recovery, and observers are explicit where required.
- Planning horizon: immediate work is executable and later work remains directional.
- Design depth: accepted interfaces hide rather than spread required coordination.
- Scope: bounded work has not become speculative platform design.
- Clarity: a future agent can act without transcript memory.

Do not turn intentionally deferred work, safe implementation learning, or reversible local choices into blockers. Evidence required only for a later promotion does not block earlier reversible work.

For confirmation, inspect only accepted revisions, their evidence, and the named residual risk. Do not restart broad review or reopen settled findings without contradictory evidence. If another consequence of the same unknown cause appears, recommend diagnosis before redesign.

## Finding Standard

Classify material findings as Blocking, Non-blocking, Question, or Needs evidence.

A Blocking finding must include:

1. exact location and violated source truth;
2. concrete consequence at the boundary under review;
3. why the issue cannot be learned safely during reversible work;
4. smallest safe revision or backward route.

Do not block on wording preference, uneven detail, hypothetical completeness, exact filenames, helper shapes, internal taxonomies, or other reversible implementation details. A useful artifact is sufficient, not exhaustive. A clean pass is valid.

## Output

### Findings

#### Blocking
- [location] [finding, violated source truth, boundary consequence, and smallest safe route]

#### Non-blocking
- ...

#### Questions
- ...

#### Needs evidence
- ...

### Assessment

Status: Pass | Non-blocking | Blocking | Question | Needs evidence
Boundary reviewed: [decision protected]
Package dependency: [upstream/downstream effect or standalone]
Reasoning: [concise evidence-backed assessment]
Residual assumptions: [assumptions or none]
Recommendation: Proceed | Revise locally | Gather evidence | Diagnose | Ask owner | Move backward
```

## Calibration

Strict means a high evidence bar for the selected consequential boundary, not exhaustive issue generation. Lead with the few findings that can change the boundary decision.

Reviewer output is evidence for responsible-agent adjudication, not authority over source truth. A passing review returns to the workflow route; it does not approve implementation or make later plan updates require another review.
