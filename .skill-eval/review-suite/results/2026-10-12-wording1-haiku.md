# Review Work evidence wording on Haiku: sentence 1 alone

Follow-up to `2026-10-12-wording-haiku.md`. Run on 2026-10-12 with `suite-wording1.json`: baseline Review Work at `266a160d`, candidate at `e6470faf`, which adds only the first sentence of the earlier candidate to the Needs evidence rule:

> When you can recover it yourself, by running a check you are authorized to run or by reading the code, do so and judge from what you observed: a check the author skipped and you have since run is not Needs evidence.

Same subject, judge, tools and trial counts as the earlier comparison (3 trials for kept clean variants, 6 for seeded and real, 9 for the five excluded clean variants); 540 reviews, all judged in both label orders. Result IDs are in `wording1-runs.tsv`. "Identified" is the lenient judge reading.

## The baseline moves between runs

The baseline arm is the same skill commit in both comparisons, yet it accepted 31 of 45 kept clean changes in the first and 38 of 45 in this one (the F2 run also had 31). With 45 reviews per arm, a gap of about seven is within run-to-run variation, so each candidate is compared below with both baseline runs pooled.

## Result

| | Baseline, two runs pooled | Both sentences (`5e1511fa`) | Sentence 1 only (`e6470faf`) |
| --- | --- | --- | --- |
| Kept clean changes accepted | 69/90 (77%) | 41/45 (91%) | 41/45 (91%) |
| Seeded and real defects identified | 305/360 (85%) | 152/180 (84%) | 147/180 (82%) |
| Seeded and real defects passed | 0 | 0 | 0 |
| Known blocking-level issues identified | 23/90 (26%) | 8/45 (18%) | 15/45 (33%) |

In this run alone: kept clean accepted 38 and 41 of 45 (per change: 5 up, 2 down, 8 equal); defects identified 152 and 147 of 180 (per group 7 up, 8 down, 15 equal); known issues identified 11 and 15 of 45, with `rs-2c00f6e3` 4/9 and 6/9 and `rs-4ab18f5b` 2/9 and 1/9.

## Reading

- Both candidates that contain sentence 1 accept 41 of 45 correct changes, against 77% for the baseline pooled. That is the F2 problem, and sentence 1 addresses it.
- Seeded and real defect detection is within noise for both candidates (82 to 85%), with no defect ever passed. This run's candidate is lower on held-out cases (49 vs 55 of 60) and real defects (22 vs 26 of 30), but the earlier candidate, which also contains sentence 1, was higher on both (57 of 60, 27 of 30), so that dip is not attributed to sentence 1.
- The loss on known issues in otherwise good changes came with sentence 2: without it, sentence 1 identifies them as often as the baseline (33% vs 26%), including the guard bypass in `rs-2c00f6e3` (6/9, against 4/9 and 6/9 for the two baseline runs).

Recommendation: adopt sentence 1; do not adopt sentence 2.

## Limits

- Haiku only, as subject and judge. Per-arm samples of 45 reviews on clean and known-issue changes; the baseline's run-to-run swing shows how wide single comparisons are.
- The known-issue comparison rests on five changes.
