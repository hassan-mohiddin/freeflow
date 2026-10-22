# Freeflow Feature Map

How a user meets Freeflow, one file per feature, with the exact steps that show each feature working in the running software. Subsystem docs explain how the code works and why; these files say what the user sees and how to check it live. Read this index first, then use the matching feature file. Launching, the health check, evidence, clean-up and model cost are in the shared guide, [Verify live](../guides/verify-live.md). The [Map Features](../../skills/map-features/SKILL.md) skill sets the map up and rechecks it.

Each feature file's `Covers` names the code behind what its user sees, so `npm run check:dev-docs` flags the file when that code changes, and its `Verified at` is the commit at which every step not marked unverified was last driven, not only read.

## Baseline Preconditions

- `npm ci` has run, so `node_modules/.bin/pi` is the pinned Pi (`run.env` records the version used).
- After any `pi-extension/src` edit, `npm run build` has run.
- A fresh run: `scripts/verify-live.sh launch` printed `FFV_RUN=<run>`, `ready: freeflow: on` and `model calls: blocked`.
- `scripts/verify-live.sh doctor` ends `doctor: PASS`.
- Never drive a Pi session this run did not launch.

## Driving Conventions

- Run every command from the repository root, exactly as written. With one live run the helper finds it; with several, prefix each command with `FFV_RUN=<run>`.
- Start every feature file from a fresh launch unless its preconditions say otherwise. A settings change reloads the session, so do not reuse a run across features that change settings.
- Type slash commands with `cmd`. Move through full-screen lists with `keys`, and confirm the `›` row in the printed pane before `Enter`.
- Read files and run CLI surfaces with `observe`; it runs in the fixture with the run's `FREEFLOW_HOME` and `FFV_REPO`.
- Never type free text or a workflow command (`/verify-work`, `/discuss-work` and the rest) without a pinned cheap model and the user's yes: each is a model call. The helper refuses them by default.
- Clean up after every run, failed ones included.

## Proof And Skip Reporting

- Snap the pane after each action that changes state (`snap <sub-feature-id>`), and observe the resulting file or status from a second view.
- `observe` and `tty` records hold the command, its combined output and its exit code.
- A step whose precondition is missing fails, with the command attempted and the missing precondition. Do not report a skipped entry point as verified through another one.
- A step marked unverified has not been driven at the file's `Verified at`; say so rather than infer its result.
- Triage a failing step before changing anything: drift in the steps (correct them and drive again), a gap in the helper (fix it and drive again), or a product bug (report it; never write it into the steps).

## Feature File Shape

An H1 title and one paragraph on what the user sees, then four sections in this order: `Sub-features` (short IDs used in evidence names), `How to get to it (user POV)`, `Driving it` (`Preconditions:` first, then labeled bullets pairing each user action with an exact command and an observable result), and `Gotchas`. The shape is Write Docs' [feature file](../../skills/write-docs/references/documentation-shapes.md#feature-file).

## Features

- [Activation and status](activation-status.md): the `.freeflow/config.json` boundary, the footer, and `/freeflow status`.
- [Settings screen](settings.md): `/freeflow settings` in its three scopes, and the files each one writes.
- [Tool Execution](tool-execution.md): its status and switch, and the guidance notices on tool results. The notices need a model call; only status and the switch are driven.
- [Task Memory commands](task-memory-commands.md): `/freeflow project` and `/freeflow task` creating a project, a Working Record, and attaching it.
- [Workflow commands](workflow-commands.md): `/verify-work`, `/discuss-work` and the other skill commands. Each run is a model call; only completion is driven.
- [Track Work CLI](track-work-cli.md): `working-record.mjs`, the record surface on Claude Code, Codex and other hosts.
- [Evaluator dry run](evaluator-dry-run.md): `skill-eval run`'s plan, the refusal of uncommitted inputs, and `--dry-run`.
