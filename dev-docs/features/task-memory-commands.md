# Task Memory Commands

> **Covers:** `pi-extension/src/task-memory/`, `skills/track-work/scripts/lib/registry.mjs`
> **Verified at:** `88f1e98d` (2026-10-22)
> **User docs:** `plugin-docs/capabilities/task-memory.md`

With Task Memory on, a Pi user links the repository to a project, creates tasks whose Working Records live in the project's store under `FREEFLOW_HOME`, and attaches them to the session. All of this runs from `/freeflow project` and `/freeflow task` with no model call. How attachment, delivery and the write gate work: [Task memory](../subsystems/task-memory.md).

## Sub-features

- `tm-not-linked`: `/freeflow task new` before any project warns that the repository is not linked.
- `tm-project-new`: creates a project and links this repository to it.
- `tm-task-new`: creates a task in the linked project and attaches it as the focus.
- `tm-task-list`: lists the repository's records and what is attached.
- `tm-status`: `/freeflow status` names the attached record.

## How to get to it (user POV)

- Turn Task Memory on (see [Settings screen](settings.md)), or start with a config that has it on.
- Run `/freeflow project new <name>`, then `/freeflow task new <title>` and `/freeflow task list`.

## Driving it

Preconditions:

- `scripts/verify-live.sh launch --config '{"taskMemory":{"enabled":true}}'`, and `scripts/verify-live.sh doctor` passes.
- `FREEFLOW_HOME` is the run's `home/` folder, under the Git-ignored `.tmp/`.

- **Not linked yet.** Run `scripts/verify-live.sh cmd "/freeflow task new Too early"`. The pane shows `Warning: This repository is not linked to a project. The user creates one with /freeflow project new <name>.` Then `scripts/verify-live.sh snap tm-not-linked`.
- **Create project.** Run `scripts/verify-live.sh cmd "/freeflow project new verify-fixture"`. The pane shows `Project verify-fixture created and linked to this repository. Browse its records in` followed by the fixture's `.freeflow/project` path. Then `scripts/verify-live.sh snap tm-project-new`.
- **Project on disk.** Run `scripts/verify-live.sh observe tm-project-files -- bash -c 'find "$FREEFLOW_HOME" .freeflow -maxdepth 4 | sort'`. The output includes `.freeflow/project`, and `registry.json` and `projects/verify-fixture/store.json` under `FREEFLOW_HOME`.
- **Create task.** Run `scripts/verify-live.sh cmd "/freeflow task new Verify map task"`. The pane shows `Task memory: Verify map task [verify-fixture/task-001] is the focus. Attached: Verify map task [verify-fixture/task-001].`, and a line above the editor reads `Task memory Verify map task [verify-fixture/task-001] · active · next: Agree the first step with the user.` Then `scripts/verify-live.sh snap tm-task-new`.
- **Record on disk.** Run `scripts/verify-live.sh observe tm-record -- bash -c 'find "$FREEFLOW_HOME/projects/verify-fixture" -name record.md; readlink .freeflow/project'`. Exit code `0`; one path ending `projects/verify-fixture/tasks/task-001-verify-map-task/record.md`, and the link pointing at `projects/verify-fixture` under `FREEFLOW_HOME`.
- **List.** Run `scripts/verify-live.sh cmd "/freeflow task list"`. The list has the row `- Verify map task [verify-fixture/task-001] —`, then the record's path and `(active, focus, owned here)`. Then `scripts/verify-live.sh snap tm-task-list`.
- **Status.** Run `scripts/verify-live.sh cmd "/freeflow status"`. The status line ends `task memory: enabled (Attached: Verify map task [verify-fixture/task-001].)`, wrapped across two lines. Then `scripts/verify-live.sh snap tm-status`, and clean up.

## Gotchas

- Record stores must be Git-ignored. If `FREEFLOW_HOME` sits inside a Git work tree that does not ignore it, `/freeflow task new` fails with `Record path is not ignored by Git`. The helper keeps it under `.tmp/` for that reason; do not move it.
- `observe` sets `FREEFLOW_HOME` for its command, but your own shell expands `$FREEFLOW_HOME` first. Keep such commands in single-quoted `bash -c '…'`, as above.
- Long paths wrap at the pane width, so a path in a snap can be split across lines. Assert paths from `observe`, not from the pane.
- Not driven yet: `/freeflow task attach`, `detach`, `focus`, `child`, `fanout`, `import`, `confirm` and `remove`; `/freeflow project list`, `link` and `remove`; `/freeflow trash`; and the dialogs the model's own task-memory tool opens.
