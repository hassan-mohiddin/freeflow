# Request

Review `case.json` before we spend on its runs. It is the seeded group of a pair (`case-11` is the clean one): it must measure whether a reviewer, given the change in its fixture, does not pass it and names the planted defect. `provenance.json` records the source change, the planted defect, and how the defect was shown to be real.

Paths in `case.json` resolve from this directory. The two variants of the change are in `fixtures/clean/` and `fixtures/seeded/`; each holds `requirements.md`, `change.diff`, `verification.md`, and the changed file `files/skills/evaluate-skill/scripts/lib/runner.mjs`.
