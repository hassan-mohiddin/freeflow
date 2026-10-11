# Review pilot suite

A small suite that shows whether a change to the review skills changes how they review. It is a pilot: it can show large differences, not small ones.

## Cases

Six real changes from this repository, each in two variants:

- **clean**: the change as it was merged. A sound review passes it.
- **seeded**: the same change with one defect planted in it. A sound review does not pass it, and names where the defect is.

| Case | Groups | Skill | Source | Defect planted |
| --- | --- | --- | --- | --- |
| `rw-symlink-root` | `rp01-a`, `rp01-b` | review-work | 45cebc10 | One side of a Git-safety path comparison is no longer canonicalized (`assertGitSafePath`) |
| `rw-changelog-eof` | `rp02-a`, `rp02-b` | review-work | 3ddc9792 | Off-by-one at the end of the changelog: the last character is always dropped (`sectionsByTitle`) |
| `rw-release-immutability` | `rp03-a`, `rp03-b` | review-work | 73a14c09 | A regex no longer strips a section's final newline, so an unchanged section reads as edited (`sectionsByTitle`) |
| `rw-unavailable-exit` | `rp04-a`, `rp04-b` | review-work | 3c9240f7 (one hunk) | The all-unavailable grade counts as complete again, contradicting the comment above it (`selectedGroupState`) |
| `ra-plan-ordering` | `rp05-a`, `rp05-b` | review-artifact | a 2026-07-09 plan | Two steps swapped, so the first uses state that only the second defines |
| `ra-spec-contradiction` | `rp06-a`, `rp06-b` | review-artifact | the CI and CD automation spec | The release step no longer runs the full `npm run check`, contradicting the requirements and the spec's acceptance criteria |

Group IDs are neutral numbers because the subject can see its group ID in its working-directory path; a descriptive ID would hint at the defect. `-a` is the clean variant and `-b` the seeded one. Case file names stay descriptive, because the subject never sees them.

Each defect is shown to be real before use. For a code case, the source commit's own tests pass without it and fail with it. For an artifact case, the defect contradicts a named requirement or line. `provenance/<case>.json` records the source, the defect, and how it was checked.

## What is measured

Every group asks for `review.md`, with a first line of `Judgment: Pass`, `Non-blocking`, `Inconclusive` or `Blocking`. The deterministic checks are:

- `only-review`: nothing but `review.md` changed;
- clean `judged-pass`: the review passes the clean change (a miss here is a false alarm);
- seeded `not-passed`: the review does not pass the seeded change (detection);
- seeded `defect-located`: the review names the defect's location. This is a weak signal: a correct review may name the location differently, and a wrong finding may name it by chance. The advisory review questions judge whether the defect was found.

Clean and seeded results are reported separately, and each case says only what its own two variants show.

## Arms

Both arms pin the review skills at e09b99d3, so until a candidate is set the suite is an A/A comparison that measures run-to-run noise. To measure a change to the review skills, point `candidate.source.ref` at the commit that contains it.

## Limits

- Six cases, four of them code changes from two small areas of the repository.
- The reviewer can read but not run code, so code defects must be found by reading.
- The fixtures keep real repository paths such as `.skill-eval/...` and `evaluate-skill`, which a reviewer can see. Both arms see the same text.
- A clean change is assumed sound because it was merged. A review that finds a real problem in it is scored as a false alarm here, so read the transcript before trusting a clean-variant fail.
