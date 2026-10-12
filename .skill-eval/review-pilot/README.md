# Review pilot suite

A small suite that shows whether a change to the review skills changes how they review. It is a pilot: it can show large differences, not small ones.

## Cases

Six real changes from this repository, each in two variants:

- **clean**: the change as it was merged. A sound review passes it.
- **seeded**: the same change with one defect planted in it. A sound review does not pass it, and names where the defect is.
- **real**: `rp03-a` only. The change as merged turned out to hold a real defect, fixed in a later commit, so a sound review does not pass it. It is the suite's one real-defect group.

| Case | Groups | Skill | Source | Defect planted (located by) |
| --- | --- | --- | --- | --- |
| `rw-symlink-root` | `rp01-a`, `rp01-b` | review-work | 45cebc10 | One side of a Git-safety path comparison is no longer canonicalized (`assertGitSafePath`) |
| `rw-changelog-eof` | `rp02-a`, `rp02-b` | review-work | 3ddc9792 | Off-by-one at the end of the changelog: the last character is always dropped (`slice(0, -1)`) |
| `rw-release-immutability` | `rp03-a` (real), `rp03-b` | review-work | 73a14c09 | A regex no longer strips a section's final newline, so an unchanged section reads as edited (`\r?$`). Real defect in `rp03-a`: every section's final line ending is stripped, so an LF-to-CRLF change on a section's last line passes (`\r?\n$`); 3ddc9792 fixed it |
| `rw-unavailable-exit` | `rp04-a`, `rp04-b` | review-work | 3c9240f7 (one hunk) | The all-unavailable grade counts as complete again, contradicting the comment above it (`selectedGroupState`) |
| `ra-plan-ordering` | `rp05-a`, `rp05-b` | review-artifact | a 2026-07-09 plan | Two steps swapped, so the first uses state that only the second defines |
| `ra-spec-contradiction` | `rp06-a`, `rp06-b` | review-artifact | the CI and CD automation spec | The release step no longer runs the full `npm run check`, contradicting the requirements and the spec's acceptance criteria |
| `rr-check-claim` | `rp07-a`, `rp07-b` | review-work (report and record) | 967c2126, with two real `npm run check` logs | The report says `npm run check` passes; the seeded variant's log is the real failing run (`check.txt`) |
| `ed-fixture-path` | `rp08-a`, `rp08-b` | review-work (eval definition) | the `rw-unavailable-exit` pair rebuilt as a definition under review | The seeded group's fixture points at the clean variant, so a correct reviewer would be scored as a miss (`fixtures/clean`) |

Two description groups check that Review Work's description is read for the new kinds of review: `rp09` (checking a report before sending it) and `rp10` (checking an eval case before paying for its runs). Each first asks a near miss that should not read the skill, then the request that should. The `rr-` and `ed-` cases were written by the same author as the references they measure, so they are not held out.

Group IDs are neutral numbers because the subject can see its group ID in its working-directory path; a descriptive ID would hint at the defect. `-a` is the clean variant (real, for `rp03-a`) and `-b` the seeded one. Case file names stay descriptive, because the subject never sees them.

Each defect is shown to be real before use. For a code case, the source commit's own tests pass without it and fail with it. For an artifact case, the defect contradicts a named requirement or line. `provenance/<case>.json` records the source, the defect, and how it was checked.

## What is measured

Every group asks for `review.md`, with a first line of `Judgment: Pass`, `Non-blocking`, `Inconclusive` or `Blocking`. The deterministic checks are:

- `only-review`: nothing but `review.md` changed;
- clean `judged-pass`: the review passes the clean change (a miss here is a false alarm);
- seeded `not-passed`: the review does not pass the seeded change (detection);
- seeded and real `not-passed`: the review does not pass the change (detection);
- seeded and real `defect-located`: the review quotes the defective expression. This is a weak signal: a correct review may describe the defect without quoting it, and a wrong finding may quote it by chance. The advisory review questions judge whether the defect was found.

Clean, seeded and real results are reported separately, and each case says only what its own variants show.

## Arms

The baseline arm pins 62148587, the merge of Review Artifact into Review Work. The candidate arm pins 967c2126, which adds the judge contract and the report-and-record and eval-definition references. The first comparison, baseline e09b99d3 against the merge, is in its results note. To measure a later change, point `arms.candidate.subject.source.ref` at the commit that contains it. Pointing both arms at one commit gives an A/A comparison that measures run-to-run noise.

## Limits

- Six cases, four of them code changes from two small areas of the repository.
- The reviewer can read but not run code, so code defects must be found by reading.
- The fixtures keep real repository paths such as `.skill-eval/...` and `evaluate-skill`, which a reviewer can see. Both arms see the same text.
- A clean change is assumed sound because it was merged. A review that finds a real problem in it is scored as a false alarm here, so read the transcript before trusting a clean-variant fail.
- The judgment checks look for `Judgment: Pass` anywhere in `review.md`. A review that quotes that text, as every review of an eval definition does, is misgraded. `rp08` must be read from each review's first line until the evaluator can check one line; its "clean" variant also holds two real measurement flaws (see its results), so a Blocking judgment there is correct.
- The first run found two faults, now fixed: `rp03-a` was scored as clean though it holds a real defect, and `defect-located` for `rp02-b` and `rp03-b` looked for a function name the reviews do not use. Results before the fix count `rp03-a` as a false alarm in both arms.
- The advisory review sees each run's response and tool arguments cut to a few hundred characters, and none of the fixture. On these cases it never answered "no" and answered "unclear" for long reviews, so its answers do not show whether a review was right. Run it with `--extension` naming the provider's auth extension when the judge needs one (the Anthropic subscription does, through `@gotgenes/pi-anthropic-auth`).

## Results

- [2026-10-12: the Review Work merge](results/2026-10-12-review-work-merge.md): no detectable difference.
- [2026-10-12: judge contract and new review kinds](results/2026-10-12-review-work-specializations.md): no regression; the eval-definition reference finds real definition flaws the baseline passes.
