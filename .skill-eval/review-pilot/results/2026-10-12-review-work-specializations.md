# Review pilot: judge contract and new review kinds

Does 967c2126 (the judge contract, the report-and-record and eval-definition references, and the reworded independence rule) change how Review Work reviews? Baseline 62148587 (the merge), candidate 967c2126. Subject model `xai/grok-4.7`, thinking medium, 3 trials per group, 54 trials run concurrently on 2026-10-12.

## Result

- **No regression on the existing cases.** The twelve rp01 to rp06 groups gave the same judgment in both arms in all 36 trials.
- **The eval-definition reference changes what is found.** On rp08, the candidate reported real measurement flaws in the definition under review in all six trials; the baseline reported none in six. Both arms found the planted defect in all three seeded trials.
- **The report-and-record reference made no difference on rp07.** Both arms passed the clean report and caught the false "npm run check passes" claim in all three trials each. The case is too easy to separate them.
- **The new description is read for the new kinds.** Both arms read Review Work for all six report and eval-case requests (rp09, rp10). The candidate also read it once in three on rp09's near miss, a question about a test count.

| Group | Kind | Baseline judgments | Candidate judgments | Reading |
| --- | --- | --- | --- | --- |
| rp01-a, rp02-a, rp04-a, rp06-a | clean | Pass ×12 | Pass ×12 | both pass |
| rp01-b, rp02-b, rp03-b, rp04-b, rp05-b, rp06-b | seeded | Blocking ×18 | Blocking ×18 | both detect; located 16/18 each (rp05-b 1/3) |
| rp03-a | real | Blocking ×3 | Blocking ×3 | both detect and locate |
| rp05-a | clean | Blocking ×3 | Blocking ×3 | both block on the arguable gap |
| rp07-a | report, clean | Pass ×3 | Pass ×3 | both pass |
| rp07-b | report, seeded | Blocking ×3 | Blocking ×3 | both detect and cite `check.txt` |
| rp08-a | eval definition, "clean" | Pass ×3 | Blocking ×3 | candidate finds real flaws (below) |
| rp08-b | eval definition, seeded | Blocking ×3 | Blocking ×3 | both find the planted path; candidate also the flaws |
| rp09, rp10 | description | read 6/6; near miss clean 6/6 | read 6/6; near miss clean 5/6 | |

## rp08: the flaws were real

The candidate's rp08-a reviews said the definition could not measure what it claims. Each point holds:

- `not-passed` and `judged-pass` look for `Judgment: Pass` anywhere in `review.md`. A review of an eval definition quotes that text, so a correct Blocking review can fail the check. This run proved it: in 7 of rp08's 12 judgment checks the grade disagreed with the review's first line (none of the other 156 judgment checks in either pilot run did). rp08's results above are read from first lines, and every rp08 review was read.
- `defect-located` looks for `grade-error`, which the subject-visible `requirements.md:3` already contains, so a review that only quotes the requirements passes it.
- `change.diff` adds a test file that `files/` does not hold.

So rp08-a was not clean, and the candidate was right where the baseline passed it. This is the effect the eval-definition reference was written for, but the case is not held out: the reference and the case share an author, who had just met these flaws in this pilot.

## What this changes in the suite

- rp08-a is a real-defect group, like rp03-a. A clean eval-definition case needs a judgment check that reads only the first line, which the evaluator does not offer yet.
- Every pilot group checks the judgment by substring. It worked for the code, artifact and report cases (156 of 156 agreed with the first line), but it is the flaw the candidate named, and it should be replaced by a first-line check when the evaluator has one.
- rp05-a's merge arm passed 2 of 3 in the first run and 0 of 3 here: its earlier disagreement was run-to-run noise.

## Advisory review

Not run. The advisory judge sees each run cut to a few hundred characters and none of the fixture, which fails the judge contract's inputs item; its answers in the first pilot could not tell a right review from a wrong one.

## Cost

108 subjects, about $23.48 by the host's count. All 54 trials ran at once and finished in about 20 minutes with no failures.

## Run IDs

Trial 1, 2, 3 per group:

- rp01-a: 20261012012325-174499bf, 20261012012433-9e9164cc, 20261012012433-dd56567a
- rp01-b: 20261012012325-4c199dc1, 20261012012433-22b67018, 20261012012434-f423d973
- rp02-a: 20261012012325-12047383, 20261012012433-3d8d31fa, 20261012012433-3c59964f
- rp02-b: 20261012012325-cf1973e8, 20261012012433-d3021a20, 20261012012433-ae400ebf
- rp03-a: 20261012012325-4e8c6049, 20261012012433-157badf9, 20261012012433-d134d1e6
- rp03-b: 20261012012325-4b3d24df, 20261012012433-d9b5ea44, 20261012012434-73c2a90c
- rp04-a: 20261012012325-645267b2, 20261012012433-07e885c7, 20261012012434-97b41ef9
- rp04-b: 20261012012325-ea1cb14a, 20261012012433-4bd2e2eb, 20261012012434-61eed57b
- rp05-a: 20261012012433-174fdcae, 20261012012433-0450eff7, 20261012012434-c535ffc1
- rp05-b: 20261012012433-8509ed42, 20261012012433-1e7946c9, 20261012012434-fa5afa21
- rp06-a: 20261012012433-4225568c, 20261012012433-61fc379a, 20261012012434-fe52003f
- rp06-b: 20261012012433-d3b66f9d, 20261012012433-20347a6c, 20261012012434-47571108
- rp07-a: 20261012012433-9e559d08, 20261012012433-644d6f75, 20261012012433-92efef4c
- rp07-b: 20261012012433-b5cd3cb3, 20261012012433-d97d989f, 20261012012434-09d6f8bf
- rp08-a: 20261012012433-95d38a8d, 20261012012433-40b76f54, 20261012012434-91ba6759
- rp08-b: 20261012012433-72a0ebc4, 20261012012433-db87f567, 20261012012434-40bea4c5
- rp09: 20261012012433-5c545829, 20261012012433-e1b76f63, 20261012012434-9bc3fb34
- rp10: 20261012012433-e6e3fe07, 20261012012433-6b9a0089, 20261012012434-148a472b
