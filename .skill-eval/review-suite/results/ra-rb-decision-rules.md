# R-a and R-b: decision rules

Fixed on 2026-10-20, before any R-a or R-b run, for `suite-ra-rb.json` (`groups-ra-rb/`, `context-ra-rb/`, `fixtures-ra-rb/`, written by `tools/write-groups-ra-rb.mjs`). Subjects: `xai/grok-4.7` at medium thinking (`configuration-grok.json`); judge: `anthropic/claude-haiku-5-5` at high thinking with the auth extension (`configuration.json`). The rules are task-003's run plan for R-a and R-b, unchanged. The suite's `decision` can hold one sign test between two arms, so it holds R-b's detection test; everything else below is read from the same aggregate by hand, and nothing here may move once a run has started.

## Arms

Each arm's only declared context is its brief, `context-ra-rb/<group>/<file>.md`; the files are named neutrally because the subject sees the path. Every arm's workspace is `fixtures-ra-rb/<group>/`: the suite's workspace plus `requirements.md`.

- `pointer` (reference, `b.md`): the pointer brief, pointing to `requirements.md` in the workspace.
- `full` (`a.md`): today's Work reviewer prompt from `skills/review-work/references/reviewer-contract.md`, filled in with the requirements, the author's report and the changed files.
- `pointer-judge-first` (`c.md`): the pointer brief plus one line: form your own view from the diff and the requirements first, then check `verification.md`'s claims against it.

Note: the contract's Output section lists `Review type` first and the Judgment line sixth, while the task prompt requires the Judgment line first. So that every arm's first line means the same thing, the `full` brief adds one sentence right before its Output section, the rest of the contract's text unchanged: "Write review.md in the task's format: its first line is the Judgment line, as the task says; the fields below follow it."

## Measures, from the trial aggregate after `review --rubric`

- **Detection**, on the 30 defective groups: the combined `identified` answer in the aggregate's `judged` section. A case counts as detected when the answer is yes. No, unknown, or no judged answer (a run that did not complete or was not judged) counts as a miss, and the report lists each such case.
- **Clean rejection**, on the 15 clean groups: a review whose first line of `review.md` is `Judgment: Blocking` or `Judgment: Inconclusive`, that is, the arm's `not-blocked` or `not-inconclusive` check fails. A first line that is missing also fails both checks and counts as a rejection.
- **Cost**: the mean of the aggregate's `cost` metric per review, over every complete run of the arm in all 45 groups with a measured cost. Turns (`turns`) are reported beside it and decide nothing.

With more than one trial, a case's detection or rejection is its mean over trials, and counts are sums of those means.

## R-a: adopt the pointer brief

Adopt when all three hold, `pointer` against `full`:

1. `pointer` misses at most 2 more of the 30 defects than `full`: detected(`full`) − detected(`pointer`) ≤ 2.
2. `pointer` rejects at most 1 more of the 15 clean changes than `full`: rejected(`pointer`) − rejected(`full`) ≤ 1.
3. `pointer`'s mean cost per review is no higher than `full`'s.

A sign test cannot show "no worse", so this is a practical margin, not a significance test. Otherwise R-a is rejected.

## R-b: adopt "judge first"

Adopt only when both hold, `pointer-judge-first` against `pointer`:

1. The suite's decision returns `beats`: an exact two-sided sign test over the defective cases on `identified` (alpha 0.05, at least 10 decided cases, the split favouring `pointer-judge-first`). This is `suite-ra-rb.json`'s `decision`.
2. `pointer-judge-first` rejects no more of the 15 clean changes than `pointer`.

Otherwise the order stays as it is.

## Trials

One trial first. A second trial runs only if a rule lands within one case of its margin, and only after a new yes from Hassan.

## Readings the plan leaves open

The plan does not settle these. They were proposed by the builder and accepted on 2026-10-20, before any run:

- an unknown or missing `identified` answer counts as a miss;
- a missing first line counts as a clean rejection;
- cost is the mean over complete runs with a measured cost; if either arm has a run with no measured cost, the cost condition is reported as not shown and R-a is not adopted on that trial;
- "within one case of its margin" means one more or one fewer case would flip that rule's outcome.
