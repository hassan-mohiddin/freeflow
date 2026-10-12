# Review Work evidence wording on Haiku: not adopted as written

Run on 2026-10-12 with `suite-wording.json`: every group gives the requirements as declared context and compares Review Work at `266a160d` (baseline, current wording) with `5e1511fa` (candidate). The candidate adds two sentences to the Needs evidence rule:

1. When you can recover evidence yourself, by running a check you are authorized to run or by reading the code, judge from what you observed: a check the author skipped and you have since run is not Needs evidence.
2. A required behavior that the code visibly meets but no test covers is a Non-blocking Issue for test coverage, not Needs evidence, unless reading cannot confirm it.

Subject and judge `anthropic/claude-haiku-5-5` (thinking medium) with `@gotgenes/pi-anthropic-auth@3.4.2`; each reviewer had the `tests` command. Trials: 3 for kept clean variants, 6 for seeded and real variants, 9 for the five clean variants the clean audit excluded. Result IDs are in `wording-runs.tsv`. The judge answered in both label orders; "identified" below is the lenient reading (yes in one order, no in neither).

## Result

| | Baseline | Candidate |
| --- | --- | --- |
| Kept clean changes accepted (Pass or Non-blocking), 45 reviews | 31 | 41 |
| Seeded and real defects identified, 180 reviews | 153 | 152 |
| Seeded and real defects passed | 0 | 0 |
| Known blocking-level issues identified (excluded clean variants), 45 reviews | 12 | 8 |
| Changes with a known blocking-level issue stopped (Inconclusive or Blocking), 45 reviews | 35 | 18 |

- **False rejections fall.** Across the 15 kept clean changes the candidate accepted more often in 10 and less often in 2 (3 equal), on tuning and held-out cases alike. Kept clean judgments: baseline Pass 8, Non-blocking 23, Inconclusive 12, missing 2; candidate Pass 6, Non-blocking 35, Inconclusive 3, missing 1.
- **Seeded and real defect detection holds.** Over six trials per group: identified 153 and 152 of 180 (strict reading 144 and 144); per group the candidate did better in 7, worse in 6, equal in 17; caught in all six trials 10/20 and 10/20 tuning, 5/10 and 7/10 held out. A three-trial look first suggested a drop (80 and 74 of 90); it did not hold.
- **Known issues in otherwise good changes are found less.** The loss sits in two cases of one kind, a requirement enforced on one path and broken on another: `rs-2c00f6e3` (a precise `replaceText` edit bypasses the guard that `set` and `clear` enforce) 6/9 to 2/9, and `rs-4ab18f5b` (a branch-only check then trusts every in-memory entry) 3/9 to 0/9. Candidate reviews of `rs-2c00f6e3` say the guard is "implemented as specified on the paths I read" and stop; baseline reviews go on to the third path. `rs-a0b9cc37` moved the other way (0/9 to 3/9).
- The baseline stopped most known-issue changes, but mostly for other reasons: it identified the issue in 12 of 45 reviews while stopping 35.

## Reading

Sentence 1 is the change F2 asked for: reviewers stop withholding Pass for checks they ran themselves. Sentence 2's "code visibly meets" appears to invite confirming a requirement at one place instead of checking every path that reaches it, which is how the two lost guard bypasses were found by the baseline. The evidence for that mechanism is two cases and nine trials each; it is consistent but small.

Recommendation: do not adopt the candidate as written. Measure sentence 1 alone against the baseline next, with the known-issue groups at nine trials, since a reviewer missing a guard bypass in an otherwise good change is the costlier error.

## Limits

- Haiku as subject and as judge; one judge error among the 270 judged results.
- Three trials for clean changes; the known-issue comparison rests on five changes.
- The baseline arm here is the same skill as the F2 run, and reproduces its acceptance (31 of 45).
