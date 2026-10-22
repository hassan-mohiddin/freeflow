# Track Work CLI

> **Covers:** `skills/track-work/scripts/`
> **Verified at:** `ae8cffdd` (2026-10-22)

On Claude Code, Codex and other hosts, Working Records are created and read through the Track Work CLI, `skills/track-work/scripts/working-record.mjs`. A user, or their agent under the Track Work skill, creates a record with a Goal and a next action, reads its resume view (or, after context loss, its recover view: the resume view plus each source's state and live Git mismatches), and validates it (structure, plus a warning for each Material updates pointer that does not resolve). The record format and the registry: [Task memory](../subsystems/task-memory.md) and Track Work's `skills/track-work/references/working-record-format.md`.

## Sub-features

- `tw-init`: creates `.freeflow/tasks/task-NNN-<short-name>/record.md` from Markdown fragments, in a repository where no `.freeflow/tasks/` exists yet.
- `tw-view`: prints the resume view of a record.
- `tw-validate`: reports `valid` for a well-formed record.
- `tw-refuse`: refuses a record with no Goal, and a record path Git does not ignore.

## How to get to it (user POV)

- Run `node skills/track-work/scripts/working-record.mjs --help` for the command list, and `<group> <operation> --help` before preparing input.
- On hosts other than Pi, the agent runs it for the user under the Track Work skill.

## Driving it

Preconditions:

- Any fresh run; Pi itself is not used. `observe` sets `FFV_REPO` to this repository, and the single quotes keep your shell from expanding it.
- The fixture's `.gitignore` holds `.freeflow/*/`, and `.freeflow/` holds only `config.json`.

- **Fresh fixture.** Run `scripts/verify-live.sh observe tw-pre -- bash -c 'ls -A .freeflow; cat .gitignore'`. Output `config.json`, then `.freeflow/*/` and `.freeflow/local.json`.
- **Create.** Run `scripts/verify-live.sh observe tw-init -- bash -c 'printf "### Goal\n\n- Prove the CLI creates a readable record.\n\n### Next useful action\n\n- Read the resume view.\n" | node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" init --root . --name "Probe task" --input -'`. Exit code `0`; stdout is the new record's absolute path, ending `.freeflow/tasks/task-001-probe-task/record.md`.
- **Resume view.** Run `scripts/verify-live.sh observe tw-view -- bash -c 'node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" view resume --record .freeflow/tasks/task-001-probe-task/record.md'`. Exit code `0`; the output starts `# Working Record: Probe task`, then `Schema: 4` and `State: active`, and shows the Goal under `### Goal`.
- **Validate.** Run `scripts/verify-live.sh observe tw-validate -- bash -c 'node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" validate --record .freeflow/tasks/task-001-probe-task/record.md'`. Exit code `0`; output `valid`, the record's path, and `0 evidence pointer(s) checked`.
- **Record ignored by Git.** Run `scripts/verify-live.sh observe tw-ignored -- git status --porcelain --ignored`. The output is `!! .freeflow/tasks/`.
- **No Goal.** Run `scripts/verify-live.sh observe tw-no-goal -- bash -c 'printf "" | node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" init --root . --name "Empty" --input -'`. Exit code `1`; output `Error: Current Context Goal must contain meaningful content`.
- **Not ignored.** Run `scripts/verify-live.sh observe tw-not-ignored -- bash -c 'git init -q unignored && cd unignored && printf "### Goal\n\n- g\n\n### Next useful action\n\n- n\n" | node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" init --root . --name "Probe" --input -; echo "exit $?"; ls -A'`. Output `Error: Record path is not ignored by Git: .freeflow/tasks`, `exit 1`, and only `.git`: nothing was written. Then clean up.

## Gotchas

- Exit code `2` means the write may have happened; read `view full` before retrying (Track Work's format reference; not driven, since it needs a failed publication).
- Pi sits idle in the background during these steps; nothing here touches it.
- Not driven yet: projects, child records, fan-out, search, `task remove`, `project remove`, and `view recover` (its suite covers it).
