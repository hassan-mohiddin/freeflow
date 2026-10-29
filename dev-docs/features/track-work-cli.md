# Track Work CLI

> **Covers:** `skills/track-work/scripts/`
> **Verified at:** `826bfb8f` (2026-10-29)

On Claude Code, Codex and other hosts, Working Records are created and read through the Track Work CLI, `skills/track-work/scripts/working-record.mjs`. A user, or their agent under the Track Work skill, creates a record with a Goal and a next action, reads its resume view (or, after context loss, its recover view: the resume view plus each source's state and live Git mismatches), and validates it (structure, plus a warning for each Material updates pointer that does not resolve). The same CLI sets up the Freeflow store, one private Git repository that holds every task's memory: `store init` clones the user's remote into the store's folder and, when it is empty, lays the store out and pushes its first commit; `store status` says where it stands; `store sync` commits, takes the remote's commits and pushes. The record format and the registry: [Task memory](../subsystems/task-memory.md) and Track Work's `skills/track-work/references/working-record-format.md`.

## Sub-features

- `tw-init`: creates `.freeflow/tasks/task-NNN-<short-name>/record.md` from Markdown fragments, in a repository where no `.freeflow/tasks/` exists yet.
- `tw-view`: prints the resume view of a record.
- `tw-validate`: reports `valid` for a well-formed record.
- `tw-refuse`: refuses a record with no Goal, and a record path Git does not ignore.
- `tw-store-init`: `store init` against an empty remote writes `store.json`, `.gitignore`, `.gitattributes`, `rules/` and `projects/`, and pushes one commit authored as the user.
- `tw-store-sync`: `store status` counts what is not committed; `store sync` commits it and pushes.
- `tw-store-join`: `store init` from the same remote into another folder joins the store with no commit of its own.
- `tw-store-record`: a record inside the store passes the Git check, though Git tracks it.
- `tw-store-task-memory`: `store init` stops on a folder that holds Pi's Task Memory (`registry.json`).

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
- **Not ignored.** Run `scripts/verify-live.sh observe tw-not-ignored -- bash -c 'git init -q unignored && cd unignored && printf "### Goal\n\n- g\n\n### Next useful action\n\n- n\n" | node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" init --root . --name "Probe" --input -; echo "exit $?"; ls -A'`. Output `Error: Record path is not ignored by Git: .freeflow/tasks`, `exit 1`, and only `.git`: nothing was written.
- **Store, created.** Run `scripts/verify-live.sh observe tw-store-init -- bash -c 'git init -q --bare remote.git && node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" store init --remote "$PWD/remote.git" --home "$PWD/store" --git-name "Probe User" --git-email probe@example.com && ls -A store && git -C store log --format="%an <%ae> %s" && git --git-dir remote.git log --oneline main'`. Exit code `0`; output `Created the Freeflow store at …/store from …/remote.git, first commit pushed; commits are authored as Probe User <probe@example.com>.`, then `.git`, `.gitattributes`, `.gitignore`, `local`, `projects`, `rules` and `store.json`, then `Probe User <probe@example.com> Create the Freeflow store`, and the remote's `main` holds that one commit.
- **Status and sync.** Run `scripts/verify-live.sh observe tw-store-sync -- bash -c 'W="$FFV_REPO/skills/track-work/scripts/working-record.mjs"; echo "Plain words." > store/rules/style.md && node "$W" store status --home "$PWD/store" && node "$W" store sync --home "$PWD/store" && git --git-dir remote.git rev-list --count main'`. Exit code `0`; status shows `Not committed: 1 path(s)`, sync prints `committed 1 path(s), pushed.`, and the remote's `main` has `2` commits.
- **Joined.** Run `scripts/verify-live.sh observe tw-store-join -- bash -c 'node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" store init --remote "$PWD/remote.git" --home "$PWD/second" --git-name "Probe User" --git-email probe@example.com && cat second/rules/style.md && git -C second rev-list --count HEAD'`. Exit code `0`; output `Joined the Freeflow store at …/second …`, `Plain words.` and `2`.
- **A record in the store.** Run `scripts/verify-live.sh observe tw-store-record -- bash -c 'mkdir -p store/projects/demo && printf "{\"version\": 1, \"project\": \"demo\"}\n" > store/projects/demo/store.json && printf "### Goal\n\n- g\n\n### Next useful action\n\n- n\n" | node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" init --root store/projects/demo --name "Demo" --input - && git -C store status --porcelain'`. Exit code `0`; stdout ends `store/projects/demo/tasks/task-001-demo/record.md`, and `git status` lists `?? projects/demo/`: the record is there to be tracked, not ignored.
- **Pi's Task Memory left alone.** Run `scripts/verify-live.sh observe tw-store-task-memory -- bash -c 'mkdir pi-home && echo "{}" > pi-home/registry.json && node "$FFV_REPO/skills/track-work/scripts/working-record.mjs" store init --remote "$PWD/remote.git" --home "$PWD/pi-home"; echo "exit $?"; ls -A pi-home'`. Output `Error: …/pi-home holds Pi's Task Memory (registry.json), which stays as it is …`, `exit 1`, and only `registry.json`. Then clean up.

## Gotchas

- Exit code `2` means the write may have happened; read `view full` before retrying (Track Work's format reference; not driven, since it needs a failed publication).
- Pi sits idle in the background during these steps; nothing here touches it.
- Not driven yet: projects, child records, fan-out, search, `task remove`, `project remove`, `view recover` (its suite covers it), and a sync that fails or meets a conflict.
- The project folder in **A record in the store** uses the project-store marker Track Work already reads; the store's own project commands come later.
