# Review pilot: the Review Work merge

Does merging Review Artifact into Review Work (62148587) change how the review skills review? Baseline e09b99d3, candidate 62148587. Subject model `xai/grok-4.7`, thinking medium, 3 trials per group, run 2026-10-12. Run directories are git-ignored; their IDs are listed so a local copy can be inspected.

## Result

No difference this pilot can detect. The two arms gave the same judgment in 34 of 36 trials. The two that differ are on one clean artifact case, where the clean plan has a real but arguable gap (below).

| Group | Kind | Baseline judgments | Candidate judgments | Reading |
| --- | --- | --- | --- | --- |
| rp01-a | work, clean | Pass ×3 | Pass ×3 | both pass |
| rp01-b | work, seeded | Blocking ×3 | Blocking ×3 | both detect and locate |
| rp02-a | work, clean | Pass ×3 | Pass ×3 | both pass |
| rp02-b | work, seeded | Blocking ×3 | Blocking ×3 | both detect; locator check misses (see Measurement) |
| rp03-a | work, "clean" | Blocking ×3 | Blocking ×3 | both find a real defect in the clean variant (see Fixtures) |
| rp03-b | work, seeded | Blocking ×3 | Blocking ×3 | both detect; locator check misses |
| rp04-a | work, clean | Pass ×3 | Pass ×3 | both pass |
| rp04-b | work, seeded | Blocking ×3 | Blocking ×3 | both detect and locate |
| rp05-a | artifact, clean | Blocking ×3 | Blocking, Pass, Pass | disagree (see below) |
| rp05-b | artifact, seeded | Blocking ×3 | Blocking ×3 | both detect; named the step 1 of 3 and 0 of 3 |
| rp06-a | artifact, clean | Pass ×3 | Pass ×3 | both pass |
| rp06-b | artifact, seeded | Blocking ×3 | Blocking ×3 | both detect and locate |

Detection on seeded variants: 18 of 18 in each arm. Passes on the clean variants that are sound (rp01, rp02, rp04, rp06): 12 of 12 in each arm.

## The disagreement: rp05-a

Requirement 3 says top-level `enabled: false` stops base runtime context. The clean plan never says so: it gates base runtime context on `skills.effective`, which it does not define, though its skill-exposure step implies "effective" includes Freeflow being enabled. All three baseline reviews and the first candidate review called this Blocking; the other two candidate reviews passed with no findings. The candidate read `references/artifact.md` and the reviewer contract in all three trials, so the passes are not from the merge hiding the artifact guidance. 3 of 3 against 1 of 3 is within what three trials can produce by chance. Whether the gap should block is a judgment the requirement's wording leaves open.

## Fixtures

- rp03-a is not clean. Its code (73a14c09) strips one trailing `\r?\n` from every released section, so an LF-to-CRLF change on a section's last line, before the next heading, compares equal. That breaks the case's requirement 2. Checked directly: `releasedSectionsEqual` returns true for that edit at 73a14c09 and false at the current code, which 3ddc9792 fixed the same day. Both arms found it in every trial. It counts as a real defect both arms caught, not a false alarm, and the case needs a new clean variant (from 3ddc9792) before reuse.

## Measurement

- `defect-located` for rp02-b and rp03-b looks for the function name `sectionsByTitle`. The reviews name the seeded line (`scripts/changelog-utils.mjs:52` and its `replace` expression) instead, so the check reports a miss where the defect was found. Replace it with a check on the line or the expression.
- The advisory review (`anthropic/claude-haiku-5-5`, one trial per group; trial 2 for rp05-a, where the arms disagree) first failed on every call: the reviewer starts Pi with `--no-extensions`, so the subscription's auth extension was not loaded and Anthropic refused the requests as extra usage. Rerun with `--extension` naming `@gotgenes/pi-anthropic-auth@3.4.2`, all 12 completed for about $0.08. Across 24 answers per arm, Haiku never answered "no"; baseline got 15 yes and 9 unclear, candidate 14 yes and 10 unclear. The unclear answers fall on the longer reviews, because the judge sees tool arguments cut to 300 characters and none of the fixture. The advisory review cannot tell a right review from a wrong one on these cases; the judge contract's inputs item has to fix that before it is used again.

## Cost and incidents

79 completed grok subjects (including a smoke run and a stopped serial run) cost about $15.20 by the host's count. The first parallel batch broke the xAI login: eight subjects refreshed the token at once, and the refresh failed for every later run (65 failed subjects, about $0.87). The rerun started only with more than 60 minutes of login left.

## Run IDs

Trial 1, 2, 3 per group (from `.skill-eval/runs/`):

- rp01-a: 20261012002252-f4c605ed, 20261012002252-935bf8e6, 20261012003625-cfb0c9e2
- rp01-b: 20261012000642-13d47846, 20261012002443-896ba628, 20261012003636-6baaf2d4
- rp02-a: 20261012002252-b94be4ac, 20261012002704-f50c3845, 20261012003651-941c38b3
- rp02-b: 20261012000642-6b458d6f, 20261012002821-cf794976, 20261012003658-a7df671a
- rp03-a: 20261012000642-7dc741fb, 20261012003004-bf168efb, 20261012003759-604de15c
- rp03-b: 20261012002252-b4437c1a, 20261012003018-7896ecc3, 20261012004003-411b81f4
- rp04-a: 20261012000642-05c0333f, 20261012003103-533e5ae0, 20261012004212-c07e69d1
- rp04-b: 20261012000642-4cb588b1, 20261012003108-c1d5a009, 20261012004225-b0612639
- rp05-a: 20261012002252-db892ceb, 20261012003108-f79c1aeb, 20261012004237-e6f05fa0
- rp05-b: 20261012002252-99c87603, 20261012003152-6a4d2420, 20261012004425-981fdae9
- rp06-a: 20261012002252-b059be3a, 20261012003430-8e7779a4, 20261012004526-42ba2d33
- rp06-b: 20261012002252-ef8595a4, 20261012003437-2c706f8c, 20261012004621-8ce6a5c4
