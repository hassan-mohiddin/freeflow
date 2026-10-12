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

## Layout

- `fixtures/<case>/<variant>/`: `requirements.md`, and `workspace/` (`change.diff`, `files/`, `verification.md`), which becomes the reviewer's workspace.
- `provenance/<case>.json`: the builder's record: base commit, class, location, locator, proof and anything the builder was unsure of.
- `proofs/<case>/`: proof tests and probes that are not committed tests in the repository.
- `cases.json`: one index over the provenance records (`tools/index-cases.mjs`, which also checks every locator against its fixture).
- `groups/`, `context/`, `suite.json`, `groups.json`: the eval definitions (`tools/write-groups.mjs`). Group IDs are neutral (`rvNN-a`/`rvNN-b`, ordered by hash) and `groups.json` maps them back to cases. Requirements are declared from `context/<group>/requirements.md`, because the subject sees a declared context path.
- `configuration.json`: the subject configuration every group extends.
- `tools/verify-case.mjs`: rebuilds a case's variants from the base commit and runs committed tests (`--test`), the fix's tests on a real variant (`--fix-test`), or proof tests, after an optional `--build`.

## Groups

Each group compares requirements withheld (`baseline`) with requirements given as declared context (`candidate`); the component is `subject.context` (the F5 comparison). Deterministic checks: only `review.md` written; a judgment on the first line; for a defective variant, no `Judgment: Pass` and the defective file named; for a clean variant, no `Judgment: Blocking`, and `Judgment: Pass`. Whether the review located the defect itself is the advisory reviewer's question, which names the location and expression.

## Measured with

Subject model `anthropic/claude-haiku-5-5` (the user's instruction, 2026-10-12), with the subscription's auth extension declared in each configuration. Results are Haiku's and do not compare directly with the earlier pilot, which ran on `xai/grok-4.7`.
