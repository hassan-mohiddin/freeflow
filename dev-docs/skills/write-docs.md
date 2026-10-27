# Write Docs

> **Covers:** `skills/write-docs/`
> **Tests:** `.skill-eval/write-docs/`
> **Verified at:** `52d6f7f` (2026-10-27)

For anyone changing Write Docs: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The method itself is in [the skill](../../skills/write-docs/SKILL.md); this record holds the reasons it does not.

## Purpose

Write Docs is read when a document someone will act on is written or revised: a Spec, Plan, decision record or research document, or documentation of software that exists. It exists because an agent writing a document tends to make it more certain than its sources, settle choices the user owns in normative prose, and leave documentation to drift from the code.

## Behavioral Claim

- **Behavior it produces:**
  - documents true to their sources and no more certain than they are;
  - accepted decisions kept apart from proposals and open choices;
  - one honest status with its source;
  - documentation that states checked present facts, the reasons behind them and the behavior that looks wrong but is intended, kept current by the docs check;
  - research that gives the answer first, states each finding's strength once, and says how each source was checked.
- **Failure it prevents:** invented requirements, owners or approvals; a plan or spec made "ready" by settling an unresolved choice; documentation copied from a plan instead of the code; stale docs; history kept as a hand-written list beside git; research whose qualifiers bury its claim, or that presents a summary as verified.
- **Earliest decision:** before the document's first sentence. `runtime/prompts/core.md` names it at that step ("Write Docs when a change makes docs wrong or a document is asked for").
- **Cues before the body is read:** its description, which names each document type including research documents, and core's step.
- **Guaranteed context:** the description on every host; core where Freeflow's runtime prompts are on.
- **Nearby cases it leaves alone:** a question about a document with no request to edit it; judging whether a document is fit to use (Review Work); instruction text an agent acts on (Write Skill).
- **When it stops steering:** once the document is fit for its use or its blocking decision is explicit, and its checks have run.

## Design

- **Two lives, kept apart.**
  - Task artifacts decide or inform work: Specs, Plans, decision records and research documents. They share one header, status vocabulary and source trail, checked by `artifact-check.mjs`, and live in the task folder unless the repository keeps them elsewhere.
  - Documentation describes software that exists. Its `Covers` and `Verified at` header lets `docs-check.mjs` flag a document whose code changed.
  
  The two have different readers and different ways of going wrong, so each has its own header.
- **Research that needs checked sources goes through Research Work.** An in-depth report, a survey or literature review, or a study is done with Research Work, which writes its report in this shape; Write Docs' description no longer names literature reviews, so the two descriptions do not both claim them (task record D-013). Moving the shape itself into Research Work waits for its paper route (D-006).
- **Research as one shape, beside the Specs.** A research document answers a question with evidence. A quick answer and a long synthesis differ only in length, so one shape scales by leaving out sections. It sits in `references/spec-and-plan-shapes.md` because it shares the Specs' header rules and life. A reference of its own would add a file for about 25 lines that are read together with them.
- **The research rules come from the agent-success research** (Beyond the Weights, `research/agent-success/`):
  - **Answer before evidence and strength stated once** come from comparing review-loop drafts with a paper written plainly. Repeated qualifiers buried the claim without making it more accurate.
  - **Marking how each source was checked** comes from the evidence review, which separates opened sources from search summaries.
- **History lives in git.** A decision cites the commit where it was made. No document keeps a Changes list (`de8c1e0`).
- **Skill design records** are a documentation shape here because Write Skill asks for one per skill and Write Docs owns document forms (`7997bf5`).
- **Scripts over prose for mechanics.**
  - `artifact-check.mjs` checks headers and statuses.
  - `docs-check.mjs` checks named paths and staleness.
  - `plan-lint.mjs` checks that every Plan step names a check.

## Evidence

| What | Result | Where | Limits |
| --- | --- | --- | --- |
| Script behavior | `docs-check`, `plan-lint` and `artifact-check` tests pass | `.skill-eval/write-docs/tests/`; `npm run test:write-docs`, `npm run test:docs` | Structure, not behavior |
| Skill behavior | No behavioral evidence for the current text | `.skill-eval/coverage-matrix.json`, entry `write-docs`, status `unverified` | The entry's case concept (a stale subsystem doc corrected in the same change; a spec that keeps unresolved billing semantics blocked) has no run |
| The research shape's rules | Derived from one case study and a literature review | Beyond the Weights `research/agent-success/case-study-paper-drafting.md` and `evidence-review.md` | One paper; not tested as guidance |

## Rejected

- **Two research shapes, a short brief and a long report.** They do one job at two lengths. One shape that leaves out sections serves both, and an agent has no choice to get wrong.
- **The old Research Brief format** from the deprecated `research-brief` skill (Question, Evidence, Conflict, Unknowns, Decision needed, Recommendation). It had no place for how sources were checked, how strong each finding is, or where the limits go.
- **A separate research reference.** The shape is small and shares the Specs' header rules.
- **A Changes section in documents.** Git holds history, and a hand-written list goes stale (`de8c1e0`).
- **A postmortem shape.** Not needed often enough here to earn a place.

## Dropped

None recorded before this record was started.

## Open Questions

- Whether the research rules change how agents write research. No case measures it.
- Whether research documents need their own folder in the task layout, or `sources/` serves.
