# ADR 0013: One Review Skill Owns Every Review And The Judge Contract

## Status

Accepted.

## Decision

Review Work is the only review skill. It absorbed Review Artifact in the first release after 0.8.0 (breaking: `review-artifact` and `/review-artifact` are gone). One core holds the review Rules, roles, classification, budget, and adjudication; each kind of thing reviewed has a reference with its own method and lenses:

- work: code, diffs, implementations, integrated state;
- artifact: Specs, Plans, designs, decision records, Handoffs, skills;
- report and record: final reports, results notes, Working Records;
- eval definition: cases, suites, fixtures, graders, before their runs are paid for;
- security risk: a lens any review can add.

Review Work also owns the judge contract: what must be recorded and done whenever a model's verdict on another agent's output is used as evidence, including an independent reviewer, an eval's advisory reviewer, and a grading judge. Other skills link to it instead of restating it.

Freeflow does not use reviewer panels, votes, or a mandatory different-family reviewer. Independence means a separately selected reviewer in a separate context; repeating the same model adds no independent vote; the reviewer's model and family are recorded.

## Rationale

The two review skills shared one skeleton and differed only in method and lenses, so every rule change had to be made twice and drifted. A pilot of 36 trials on six cases found no detectable change in review judgments from the merge (`.skill-eval/review-pilot/results/2026-10-12-review-work-merge.md`).

A judge is a reviewer, so its contract belongs with review rather than with the evaluator, which is one of several consumers.

The review research for this decision found that combining several reviewers' verdicts mostly trades false alarms for detection: an any-flag rule caught nearly every seeded defect but flagged most clean code, and no source showed a real-defect gain from panels in a setting like Freeflow's. Identical-model repeats returned identical verdicts. A different model family changed which items were flagged, in both directions, without a measured gain.

## Consequences

- New kinds of review are added as references under Review Work, not as new skills.
- Changing the judge contract is a Review Work change that affects every consumer, including the evaluator's advisory review.
- The canonical skill list comes from the Pi catalog, so checks follow additions and removals without hard-coded counts.
- Whether a different-family reviewer, a second review, or showing the reviewer the requirements improves detection is to be measured with the review pilot before any rule changes.
