# Write Docs

> **Covers:** `skills/write-docs/`
> **Tests:** `.skill-eval/write-docs/`
> **Verified at:** `70afe225` (2026-10-30)

For anyone changing Write Docs: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The method itself is in [the skill](../../skills/write-docs/SKILL.md); this record holds the reasons it does not.

## Purpose

Write Docs is read when a document someone will act on is written or revised: a Spec, Plan, decision record or research document, or documentation of software that exists. It exists because an agent writing a document tends to make it more certain than its sources, settle choices the user owns in normative prose, and leave documentation to drift from the code.

## Behavioral Claim

- **Behavior it produces:**
  - documents true to their sources and no more certain than they are;
  - accepted decisions kept apart from proposals and open choices;
  - one honest status with its source;
  - documentation that states checked present facts, the reasons behind them and the behavior that looks wrong but is intended, kept current by the docs check;
  - research documents that carry the shared header and source trail, written with Research Work, which owns their shape.
- **Failure it prevents:** invented requirements, owners or approvals; a plan or spec made "ready" by settling an unresolved choice; documentation copied from a plan instead of the code; stale docs; history kept as a hand-written list beside git.
- **Earliest decision:** before the document's first sentence. `runtime/prompts/core.md` names it at that step ("Write Docs when a change makes docs wrong or a document is asked for").
- **Cues before the body is read:** its description, which names each document type it shapes (research documents are Research Work's), and core's step.
- **Guaranteed context:** the description on every host; core where Freeflow's runtime prompts are on.
- **Nearby cases it leaves alone:** a question about a document with no request to edit it; judging whether a document is fit to use (Review Work); instruction text an agent acts on (Write Skill).
- **When it stops steering:** once the document is fit for its use or its blocking decision is explicit, and its checks have run.

## Design

- **Two lives, kept apart.**
  - Task artifacts decide or inform work: Specs, Plans, decision records and research documents. They share one header, status vocabulary and source trail, checked by `artifact-check.mjs`. Specs, Plans and decision records live in the task folder unless the repository keeps them elsewhere; a research document lives where Research Work says (task record P69): the task folder when the research serves a task, the research folder when the task is research.
  - Documentation describes software that exists. Its `Covers` and `Verified at` header lets `docs-check.mjs` flag a document whose code changed.
  
  The two have different readers and different ways of going wrong, so each has its own header.
- **Research documents are Research Work's.** The Research shape moved to Research Work's `references/reporting.md` (Research Report), with its strength stated as the evidence level (task record D-006), so one skill owns the terms it uses: finding strength, how a source was checked, limits. Write Docs keeps the header, status and source trail every research document still uses, routes research documents to Research Work, and treats a comparison of options from facts already in hand as a decision record or a section of its Spec. Its description no longer names literature reviews or research documents (D-013, D-006). The shape's rules came from the agent-success research (Beyond the Weights, `research/agent-success/`): answer before evidence and strength stated once, from comparing review-loop drafts with a paper written plainly; marking how each source was checked, from the evidence review.
- **History lives in git.** A decision cites the commit where it was made. No document keeps a Changes list (`de8c1e0`).
- **Skill design records** are a documentation shape here because Write Skill asks for one per skill and Write Docs owns document forms (`7997bf5`).
- **Scripts over prose for mechanics.**
  - `artifact-check.mjs` checks headers and statuses.
  - `docs-check.mjs` checks named paths and staleness, and with `--stamp` moves a stale document's `Verified at` to HEAD, so the document goes into the same commit as its code: 29 of Freeflow's 200 commits before it only moved a stamp, each a full CI run. A feature file is not stamped, since only driving it moves its stamp.
  - `plan-lint.mjs` checks that every Plan step names a check.

## Evidence

| What | Result | Where | Limits |
| --- | --- | --- | --- |
| Script behavior | `docs-check`, `plan-lint` and `artifact-check` tests pass | `.skill-eval/write-docs/tests/`; `npm run test:write-docs`, `npm run test:docs` | Structure, not behavior |
| Skill behavior | No behavioral evidence for the current text | `.skill-eval/coverage-matrix.json`, entry `write-docs`, status `unverified` | The entry's case concept (a stale subsystem doc corrected in the same change; a spec that keeps unresolved billing semantics blocked) has no run |

## Rejected

- **The old Research Brief format** from the deprecated `research-brief` skill (Question, Evidence, Conflict, Unknowns, Decision needed, Recommendation). It had no place for how sources were checked, how strong each finding is, or where the limits go.
- **A Changes section in documents.** Git holds history, and a hand-written list goes stale (`de8c1e0`).
- **A postmortem shape.** Not needed often enough here to earn a place.

## Dropped

None recorded before this record was started.

## Open Questions

- Whether the research rules change how agents write research. No case measures it.
