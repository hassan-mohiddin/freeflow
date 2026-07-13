# Artifact Reviewer Contract

Use this to prepare a portable artifact-review context. It defines the evidence, calibration, and output expected from a reviewer without depending on a particular agent, model, or harness.

## Required Context

Provide:

- artifact path and type;
- outcome or next work the artifact must support;
- live source truth and explicit owner decisions;
- relevant code, tests, policies, ADRs, and established behavior;
- review pass number.

For pass 2 or 3, also provide:

- prior findings;
- parent adjudication: accepted, rejected, question, or needs evidence;
- owner clarifications;
- changed sections;
- the narrow residual risk to inspect.

## Portable Prompt

```md
# Artifact Review

Review whether this artifact is fit to guide its intended next work. Do not edit files or resolve owner decisions.

## Artifact

Path: [ARTIFACT_PATH]
Type: [spec | plan | handoff | decision note | discovery note | other]
Intended next work: [OUTCOME_OR_DECISION_SUPPORTED]

## Source Truth

- [docs, tests, policies, ADRs, code, established behavior]
- Owner decisions: [decisions or none]

## Review Pass

Pass: [1 | 2 | 3]

For pass 2 or 3:
- Prior findings: [summary]
- Parent adjudication: [accepted | rejected | question | needs evidence]
- Owner clarifications: [decisions or none]
- Changed sections: [sections]
- Residual risk: [narrow question]

## Check

- Completeness: enough is present to take the intended next step.
- Evidence: load-bearing claims point to live evidence or explicit decisions.
- Evidence feasibility: each load-bearing acceptance or promotion condition in the immediate horizon has a direct supporting or falsifying mechanism, or an earlier acquisition slice. Qualifiers such as “where practical” do not soften an otherwise required condition; genuinely optional evidence does not become mandatory.
- Clarity: a fresh agent can act without transcript memory.
- Consistency: the artifact agrees with itself and source truth.
- Identity: ownership, status, sources, and history are proportionate to durability and risk.
- Implementation risk: omissions will not cause wrong work, hidden decisions, or an implementation dead end.
- Design depth: interfaces and seams hide complexity rather than spreading caller coordination.
- Failure-unit integrity when state transitions materially affect correctness: each immediate slice owns one coherent outcome and, where applicable, its accepted, rejected, post-commit, and recovery behavior; required authority or canonicalization is not deferred behind dependent callers or adapters.
- Scope and minimality: the artifact solves the accepted outcome without quietly generalizing the milestone.
- Planning horizon: immediate phases are executable, later phases remain directional where evidence is unresolved, and backward checkpoints identify what can reopen the route.
- Adversarial risk: stale assumptions or source-truth overrides cannot be smuggled into execution.

For follow-up review, inspect accepted fixes and named residual risk. Do not restart broad review, reopen settled intent, or re-raise rejected findings without contradictory live evidence. If pass 2 exposes another section, dependency, or downstream consequence of the same invariant, report the artifact's failure unit as unstable and recommend a backward route rather than another local revision batch.

## Finding Standard

Classify findings as:

- Blocking
- Non-blocking
- Question
- Needs evidence

A Blocking finding must include:

1. exact artifact location;
2. violated accepted requirement or source truth;
3. concrete consequence for future work;
4. why it cannot remain a local reversible implementation choice;
5. smallest safe revision or backward route.

Do not block on wording preference, uneven detail, hypothetical completeness, or omitted filenames, encodings, helper shapes, internal taxonomies, and other reversible implementation details. Missing identity blocks only when durability, ownership, risk, or readiness makes it consequential.

A useful artifact is sufficient, not exhaustive. Review can pass with non-blocking findings; do not invent findings or expand the public contract to manufacture completeness.

## Output

### Findings

#### Blocking
- [location] [finding, violated requirement, consequence, and smallest safe route]

#### Non-blocking
- ...

#### Questions
- ...

#### Needs evidence
- ...

### Assessment

Status: Pass | Non-blocking | Blocking | Question | Needs evidence
Reasoning: [concise evidence-backed assessment]
Residual assumptions: [assumptions or none]
Recommendation: Proceed | Revise later | Gather evidence | Ask owner | Move backward
```

## Calibration

Only flag issues that could cause wrong work, blocked work, hidden decisions, unsafe behavior, stale authority, or an implementation dead end.

Reviewer output is evidence for parent adjudication, not authority to rewrite source truth. Use `Non-blocking` status only when findings are deferrable and no blocker, unresolved owner question, or required evidence gap prevents the intended next step. A passing review returns to the workflow route check; it does not approve the next phase by itself. On pass 3, report remaining risk and stop; do not recommend another broad review.
