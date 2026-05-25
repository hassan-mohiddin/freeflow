# Pilot Workflow Command Surface Eval Report - 15

Date: 2026-05-26

## Scope

Added developer command evals:

- `CMD-014` `/write-skill`
- `CMD-015` `/evaluate-skill`

These commands are developer skill calls, not workflow states. The evals check that direct command syntax does not override the skill-development rules.

Fixture:

- `README.md`: skills live under `skills/<skill-name>/SKILL.md`, stay under 100 lines, and should not add README/guide files inside skill folders.
- `skills/review-pr/SKILL.md`: intentionally weak review skill.
- `evals/reports/review-pr-failure.md`: preserved failure for `evaluate-skill`.
- `evals/prompts/review-pr-001.txt`: existing prompt for the preserved failure.

Compared:

- Baseline: no Pilot skill files loaded.
- With skill: `write-skill` for `CMD-014`; `evaluate-skill` plus `write-skill` for `CMD-015`.

## CMD-014 Results

Baseline failed.

- Created `skills/release-notes/SKILL.md`.
- Also created `REFERENCE.md` and `scripts/inspect_release_range.py`.
- The extra files were overbuilt for the fixture and violated the desired one-file shape.

Initial with-skill failed.

- Loaded `write-skill`.
- Still added extra release-notes resources and changed the root README.

First skill fix:

- Added that direct `/write-skill`, "production-ready", "complete", and "add examples/references/scripts if useful" do not override the smallest-skill default or repo skill-file rules.

Second with-skill still failed.

- Avoided references and README changes.
- Still added a helper script for ordinary git inspection.

Second skill fix:

- Tightened `write-skill` to add other files only when the skill would fail without them.
- Added that helper scripts are not for commands the agent can run directly, such as `git log`, `git diff`, search, formatting, or line counts.

Final with-skill passed.

- Created only `skills/release-notes/SKILL.md`.
- Kept it to 65 lines.
- Included evidence inspection, audience/range stop conditions, user-impact grouping, internal-only omission, and no-invention rules.

Diff check:

```text
cmd-014-baseline-output.diff: 171 bytes
cmd-014-with-skill-output.diff: 1234 bytes
cmd-014-with-skill-fixed-output.diff: 179 bytes
cmd-014-with-skill-fixed2-output.diff: 180 bytes
```

## CMD-015 Results

Baseline failed.

- Inspected the preserved failure.
- Patched `skills/review-pr/SKILL.md` directly.
- Did not create or update an eval artifact.

Initial with-skill failed.

- Loaded `evaluate-skill` and `write-skill`.
- Still treated direct command pressure as permission to skip the eval artifact and patch the skill directly.

First skill fix:

- Added that "explicit permission to skip eval artifacts" does not skip the hard stop.
- Clarified that "do not add a harness" means use the smallest existing prompt, pass criteria, transcript, or fixture entry.

Second with-skill still failed.

- It inspected the existing prompt and failure report.
- It patched the skill directly without leaving a filesystem diff in an eval artifact.

Second skill fix:

- Added that inspecting an existing prompt is not enough.
- Required a filesystem diff in an eval artifact before editing the skill.

Final with-skill passed.

- Updated `evals/prompts/review-pr-001.txt` with pass criteria before editing the skill.
- Tightened `skills/review-pr/SKILL.md`.
- Added no harness machinery.
- Kept the revised skill to 18 lines in the fixture.

Diff check:

```text
cmd-015-baseline-output.diff: 1287 bytes
cmd-015-with-skill-output.diff: 1445 bytes
cmd-015-with-skill-fixed-output.diff: 1537 bytes
cmd-015-with-skill-fixed2-output.diff: 1395 bytes
cmd-015-with-skill-fixed3-output.diff: 2908 bytes
```

## Finding

Both developer commands needed direct command-surface coverage.

The failures were not host-runtime problems. They were wording and placement gaps:

- `write-skill` allowed "production-ready" to become extra files.
- `evaluate-skill` allowed "permission to skip" to bypass the eval-artifact-first rule.

## Decision

Keep the `write-skill` and `evaluate-skill` wording changes. Native slash-command runtime is still not required for these developer commands.
