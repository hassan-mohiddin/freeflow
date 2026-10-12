# Report

Done: `skill-eval review` now takes a repeatable `--extension <path>` option.

- `skills/evaluate-skill/scripts/skill-eval.mjs` accepts `--extension` for `review` only, any number of times, and lists it in the usage text.
- `skills/evaluate-skill/scripts/lib/review.mjs` resolves each path before starting the reviewer and refuses a missing one with `Extension not found: <path>`. The reviewer still starts with `--no-extensions`, followed by one `--extension` per named path. Each extension is recorded in `semantic-grade.json`: a package directory by its name and version, a single file by its SHA-256.
- Two new tests in `.skill-eval/evaluate-skill/tests/review.test.mjs` cover loading and recording, and the refusal of a missing path. The review tests pass, 7 of 7 (`evidence/review-test.txt`).
- `npm run check` passes (`evidence/check.txt`).

Nothing is committed. The change is in `evidence/change.diff`.
