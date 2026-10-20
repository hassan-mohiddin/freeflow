# Review suite

The research-sized review suite (task-003 slice S-009). It measures how well Review Work reviews real changes from this repository, separately for clean changes, planted defects and real past defects, and supports the comparisons the review research ranked first: requirements shown or hidden (F5), and one review against a review plus a focused follow-up (F3).

Cases follow the construction protocol in task-003's `specs/review-suite-protocol.md`: every planted or real defect is shown to be real before use, a clean change must not hold a later-fixed defect, and nothing the reviewer can see hints at the defect. Cases are built by agents other than the author of the review guidance they test.

## Selection

Fixed on 2026-10-12, before any case was built, from the candidates in task-003's `sources/review-suite-candidates.md`.

**Base changes** (each yields a `clean` and a `seeded` variant): 0b8e9c15, 12575cea, 24c53d4b, 25844ce3, 2c00f6e3, 355956c1, 4ab18f5b, 6949f0d0, 6cdbdfcf, 864df4cc, 92d1d78d, 97b149b0, 9849a16c, a0b9cc37, aaf5e7cb, c45f16f6, ccfe0bef, dcf82fce, e312562f, f0abfb11.

**Real defects** (each yields a `real` variant from the introducing commit and a `seeded` variant): introducing commit, then its fix:

| Introduced in | Fixed in |
| --- | --- |
| 60a766a0 | ea11f6af |
| d9beef6d | e060e7e9 |
| a276b963 | 7e6767e5 |
| 92a4709e | f01a8b9b |
| 7b5dfb09 | 3670442f |
| 23988200 | ceebecf8 |
| 9f311f68 | 706201e4 |

## Held-out split

Fixed before any case was built or any run: within each list sorted by commit hash, every third entry (positions 3, 6, 9, ...) is held out. Held-out cases are measured, never used to choose or tune Review Work's wording.

- **Held out (8):** 24c53d4b, 355956c1, 6cdbdfcf, 97b149b0, aaf5e7cb, dcf82fce (base changes); 7b5dfb09, a276b963 (real defects).
- **Tuning (19):** every other selected change.

## What was built

25 cases, 50 groups: 20 base changes (each `clean` and `seeded`) and 5 real defects (each `real` and `seeded`). Across the 30 defective variants: 20 logic, 5 convention, 5 security (3 seeded, 2 real).

Changed from the selection, with the reasons recorded in each provenance file:

- **aaf5e7cb, 4ab18f5b**: a security seed could not be proven on either change, so each carries a logic seed.
- **92a4709e** (real): dropped. The fix is a documented design change, not a correction against the introducing commit's intent.
- **23988200** (real): not built. The defect came in with a 103-file commit, far over the size limit.

Every defect was proven by its builder and then reproduced independently on fresh exports (`git archive <base>` plus the fixture's files): a test or probe that passes on the sound state and fails on the defective one, or for a convention defect the quoted requirement and the seeded line that contradicts it. Every `real` variant's files match the introducing commit byte for byte.

A later audit of the clean variants (`clean-audit.json`) traced every requirement to its commit: requirements that claimed more than the commit evidences were narrowed, two fixtures gained changed files their requirements depend on, and five clean variants with a genuine blocking-level issue are excluded from false-rejection measures (their seeded variants stay).

## Layout

- `fixtures/<case>/<variant>/`: `requirements.md`, and `workspace/` (`change.diff`, `files/`, `verification.md`), which becomes the reviewer's workspace.
- `provenance/<case>.json`: the builder's record: base commit, class, location, locator, proof and anything the builder was unsure of.
- `proofs/<case>/`: proof tests and probes that are not committed tests in the repository.
- `cases.json`: one index over the provenance records (`tools/index-cases.mjs`, which also checks every locator against its fixture).
- `groups/`, `context/`, `suite.json`, `groups.json`: the eval definitions (`tools/write-groups.mjs`). Group IDs are neutral (`rvNN-a`/`rvNN-b`, ordered by hash) and `groups.json` maps them back to cases. Requirements are declared from `context/<group>/requirements.md`, because the subject sees a declared context path.
- `configuration.json`: the subject configuration every group extends.
- `tests.json`: each base change's test files, all passing on its clean variant; `tools/run-tests.mjs` runs them for a reviewer through the `tests` command.
- `clean-audit.json`: the clean audit's exclusions and repairs.
- `groups-ra-rb/`, `context-ra-rb/`, `suite-ra-rb.json`: the R-a and R-b definitions (`tools/write-groups-ra-rb.mjs`); `context-ra-rb/<group>/<arm>.md` is each arm's reviewer brief.
- `tools/verify-case.mjs`: rebuilds a case's variants from the base commit and runs committed tests (`--test`), the fix's tests on a real variant (`--fix-test`), or proof tests, after an optional `--build`.

## Groups

Each group compares requirements withheld (`baseline`) with requirements given as declared context (`candidate`); the component is `subject.context` (the F5 comparison). Deterministic checks: only `review.md` written; a judgment on the first line; for a defective variant, no `Judgment: Pass` and the defective file named; for a clean variant, no `Judgment: Blocking`, and `Judgment: Pass`. Whether the review located the defect itself is the advisory reviewer's question, which names the location and expression.

Reviewers have `read`, `write`, `ls` and `find`, each confined to the run, and for a base change a `tests` command that runs its declared tests on the full tree. A clean variant counts as rejected when the review ends Inconclusive or Blocking; Pass and Non-blocking both let it proceed. The F5 run of 2026-10-12 used `read` and `write` only, so many of its reviewers could not list `files/`; results from runs before and after the change do not compare directly.

## F3: one review against Review 1, an independent Review 2 and an adjudicator

`suite-f3.json` and `groups-f3/` (`tools/write-groups-f3.mjs`, from `groups/`) compare one review with an adjudicated pair of reviews. Both arms get the requirements as declared context, the suite's tools and, for a base change, its `tests` command; they differ only in `participants`:

- `baseline`: one review, as the suite's subject.
- `candidate`: a pipeline. Review 1 is that same review. Review 2 is fresh: it sees the change and the requirements, never Review 1. The adjudicator sees the change, the requirements, and both reviews' responses and `review.md` files, adjudicates them per Review Work's adjudication, and writes the final `review.md`. The adjudicator is the graded stage.

It holds every defective variant (30) and the 15 clean variants the clean audit keeps, with the suite's group IDs, so `groups.json` gives each one's case, class and held-out flag.

Measures:

- **Detection** (the decision): each defective group has a rubric dimension `identified` (the suite's question: the defect's location, expression and effect, supported with file and line), judged by `anthropic/claude-haiku-5-5` at high thinking. The suite's decision is a sign test over the defective cases on that judged measure, candidate against baseline. Clean groups have no judged measure and are left out of the decision.
- **False rejection**, counted separately on the clean groups: the `not-blocked` and `not-inconclusive` comparisons on the first line of `review.md`. A clean trial is falsely rejected when either fails.
- The suite's other deterministic checks on `review.md` (only `review.md` written, a judgment line, no Pass and the defective file named on a defective variant, Pass on a clean one). `ran-tests` is left out, because the graded adjudicator need not run the tests itself.
- Cost and turns per arm (tracked metrics). The candidate arm's usage covers all three stages.

Expected cost per trial: 45 groups × (1 baseline + 3 candidate) = 180 subject runs, then `review --rubric` on the aggregate: 30 defective groups × 2 arms = 60 judge calls. Judging must run before the decision exists, so the suite declares no adaptive trials: no judged value exists while the trials run.

Results are measured by the coordinator in wave 4; nothing here has been run.

## R-a and R-b: the pointer brief, and judging before the evidence

`suite-ra-rb.json`, `groups-ra-rb/` and `context-ra-rb/` (`tools/write-groups-ra-rb.mjs`, from `groups/`) ask two questions in one run. R-a: does a short pointer brief find as many defects as today's full reviewer prompt, at no more cost? R-b: does telling the reviewer to form its own view before reading the author's report find more? Three arms share one reference and differ only in the reviewer's brief, given as declared context (`component: ["subject.context"]`); the task prompt, workspace, tools and, for a base change, the `tests` command are the same in all three:

- `full`: the Work reviewer prompt from `skills/review-work/references/reviewer-contract.md`, filled in from the fixture: the requirements and the author's report (`verification.md`) pasted in, the changed files listed from `change.diff`, Review 1, every lens, and the `tests` command as active evidence authority (none for a real variant, which has no tests command).
- `pointer` (reference): the pointer brief from task-003's task-path design, adapted to the workspace: Review Work as the method, pointers to the requirements, `change.diff`, `files/` and `verification.md` ("check it, don't trust it"), the `tests` command it may run, no edits; write `review.md` and stop.
- `pointer-judge-first`: the same brief plus one line: form your own view from the diff and the requirements first, then check `verification.md`'s claims against it.

The requirements sit outside the workspace, so the pointer arms declare `context/<group>/requirements.md` beside their brief and point to it by that path. The evaluator delivers every declared context file in the system prompt, so the pointer arms see the requirements text too: what differs between the arms is the brief's form, not what the reviewer can read. R-a is `full` against `pointer`; R-b is `pointer-judge-first` against `pointer`.

It holds the same 45 groups as F3 (every defective variant and the 15 clean variants the clean audit keeps), with the suite's group IDs, task prompt, fixtures, tools, commands and review questions.

Measures:

- **Detection**: each defective group's rubric dimension `identified` (the suite's question), judged by `anthropic/claude-haiku-5-5` at high thinking on the reference arm's host setup, which carries the subscription's auth extension.
- **False rejection** on the clean groups: the `not-blocked` and `not-inconclusive` comparisons on the first line of `review.md`.
- The suite's other deterministic checks on `review.md`. `ran-tests` is left out, as F3 left it out.
- Cost and turns per arm (tracked metrics).

Decisions, fixed before any run in `results/ra-rb-decision-rules.md`. The suite's `decision` is R-b's detection test: a sign test over the defective cases on `identified`, `pointer-judge-first` against `pointer`, higher better. A suite holds one decision, and the evaluator has no non-inferiority method, so R-a's margin (`pointer` misses at most 2 more of the 30 defects than `full`, rejects at most 1 more of the 15 clean changes, and costs no more per review on average) and R-b's second condition (no more clean rejections) are read from the same aggregate by those written rules.

Expected cost per trial: 45 groups × 3 arms = 135 subject runs, then `review --rubric` on the aggregate: 30 defective groups × 3 arms = 90 judge calls. With the suite's configured subject (`configuration.json`: Haiku 5.5 on the subscription), that is about $0.2 a run at API prices, billed as plan usage; the run plan's estimate for `xai/grok-4.7` subjects is $0.25 to $0.40 a review, $34 to $54 a trial, and needs its own configuration. Judging is under $1 on the auth extension. As with F3, judging must run before the decision exists, so the suite declares no adaptive trials; a second trial needs a new yes.

Nothing here has been run.

## Measured with

Subject model `anthropic/claude-haiku-5-5` (the user's instruction, 2026-10-12), with the subscription's auth extension declared in each configuration. Results are Haiku's and do not compare directly with the earlier pilot, which ran on `xai/grok-4.7`.
