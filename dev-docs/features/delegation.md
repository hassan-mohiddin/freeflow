# Delegation across sessions

> **Covers:** `skills/track-work/scripts/lib/delegations5.mjs`, `skills/track-work/scripts/lib/channel5.mjs`, `skills/track-work/scripts/lib/claims5.mjs`, `skills/track-work/scripts/working-record.mjs`
> **Verified at:** `a1eb3e88` (2026-11-14)
> **User docs:** `plugin-docs/capabilities/delegation-sessions.md`

A coordinator hands part of its task to a separate session as it does to a subagent. `delegate open --session` writes the brief, the worker's worktree and the claims on its scope, and prints the command that starts the worker session on Claude Code and on Pi. The worker session runs `delegate join` and reads its recovery; from then on it holds no task, and each command that writes the record is refused with "this session works for D-NNN". It keeps its `progress.md` with `checkpoint --delegation` and writes `return.md`. Every delegation event is a line in the task's delegation log, which `delegate log` prints. An accepted return's Left open choices join `decisions.md`, and a session's claims on paths warn another session before it writes them.

## Sub-features

- `deleg-open-session`: `delegate open --session` prints the start commands, marks the brief `Process: session` and claims `--writes`.
- `deleg-join`: `delegate join` records the Handle and the session, and prints the worker's recovery.
- `deleg-refusals`: a joined session's `task take`, `checkpoint --record`, `slice …` and `delegate open` without `--parent` are refused.
- `deleg-progress`: `checkpoint --delegation` rewrites `progress.md`; `view bundle --delegation` prints the worker's bundle.
- `deleg-log`: `delegate log` prints one line per event.
- `deleg-left-open`: `delegate close --outcome accepted` adds Left open choices to `decisions.md`, and `choices.mjs validate` passes.
- `deleg-claims`: `claim`, `claim --list` and `release`; another session's gate state carries the claim.
- The Waits on row and wake in a running Claude Code or Pi session need a model turn to end: covered by `hooks/claude/freeflow.test.ts` and `pi-extension/tests/store/waits.test.js`, not driven here.

## How to get to it (user POV)

- The user or the coordinator agent asks for a part of the task to run in its own session. The agent runs `delegate open --session`, and the user (or the agent, by the harness's own means) starts the printed command.
- In the worker session, the prompt runs `delegate join`; the agent there reads its brief and works from it.
- Back in the coordinator's session, `delegate status` and `delegate log` show where the worker stands, and `delegate close` accepts its return.

## Driving it

Preconditions:

- A scratch folder `$S` holding a bare Git repository `$S/store.git`, a repository `$S/widget` with one commit and the remote `origin` set to `git@github.com:acme/widget.git`, and an empty `$S/gitconfig`. Every command below runs with `GIT_CONFIG_GLOBAL=$S/gitconfig GIT_CONFIG_NOSYSTEM=1 FREEFLOW_HOME=$S/home FREEFLOW_HARNESS="Claude Code" CLAUDE_CODE_SESSION_ID= CLAUDECODE=`, and `W` is the absolute path of `skills/track-work/scripts/working-record.mjs` in this checkout, so it still resolves after a `cd`. `C` is the coordinator's session (`FREEFLOW_SESSION=aaaaaaaa-1111`); `K` is the worker's (`FREEFLOW_SESSION=bbbbbbbb-2222`). No step calls a model.
- `C node $W store init --remote $S/store.git --git-name T --git-email t@example.com`, `C node $W project new --name widget`, then `C node $W task create --title Widget --goal "Build it" --cue "read when widget" --project widget --cwd $S/widget`; then `agreement open` and `slice start-direct --repo $S/widget` on `widget/task-001`, each with a minimal input of `- Field: value` bullets.

- **Open for a session.** Run `printf '## Result wanted\nX.\n## Scope\ns\n## Done when\nd\n' | C node $W delegate open --record widget/task-001 --title "Build the gates" --kind build --agent "Opus, high" --session --repo $S/widget --base main --writes "src/**" --input -`. Exit code `0`. The output starts `Opened D-001 — Build the gates (a separate session)`, has `Claimed: src/** for widget/task-001 D-001`, and has two start lines, `  Claude Code: cd $S/widget-d-001-build-the-gates && claude --name D-001 "You are the worker for D-001 of widget/task-001. Run: node …/working-record.mjs delegate join --record widget/task-001 --id D-001"` and `  Pi: … pi --session-name D-001 "…"`. The brief's third line ends `· Process: session · Handle: not started`.
- **Join.** Run `K node $W delegate join --record widget/task-001 --id D-001`. Exit code `0`. The output starts `This session is the worker for D-001 of widget/task-001 (Handle: session bbbbbbbb-2222)`, then the recovery with `You are D-001's worker: the brief is your scope.` The brief's Handle reads `session bbbbbbbb-2222`, and `$S/home/sessions/bbbbbbbb-2222/delegation.json` names `D-001`.
- **The refusals.** Run `K node $W task take --id widget/task-001`, `K node $W checkpoint --record widget/task-001 --input - </dev/null` and `printf -- '- Result wanted: r.\n' | K node $W slice propose --record widget/task-001 --title X --input -`. Each exits `1` with `Error: This session works for D-001 of widget/task-001; it writes its progress.md (checkpoint --delegation D-001) and return.md, and only the coordinator writes the record.`
- **Progress.** Run `printf '## Done\n- a\n## Next\n- b\n' | K node $W checkpoint --delegation D-001 --record widget/task-001 --input -`. Exit code `0`; output `Wrote delegations/D-001-build-the-gates/progress.md as of <time>.`; the file starts `# D-001 progress` and `As of:`. Then `K node $W view bundle --record widget/task-001 --delegation D-001` ends with `A new cycle starts here, for the worker of this delegation.` and the rest of that line.
- **Claims.** Run `cd $S/widget && K node $W claim --paths README.md`. The output reads `Claimed github.com/acme/widget: README.md for widget/task-001 D-001 until <time> UTC (<id>).` `C node $W claim --list` lists both claims, `src/**` for this session and `README.md` for session `bbbbbbbb`. After `C node $W claim --list` has refreshed it, `$S/home/sessions/aaaaaaaa-1111/gates.json` holds the README claim under `claims`, with `$S/widget/README.md` among its `writes`.
- **The log.** Run `C node $W delegate log --record widget/task-001`. One line each, oldest first: `D-001 brief · from aaaaaaaa-1111`, `D-001 inform · from bbbbbbbb-2222 · session bbbbbbbb-2222 joined`, and `D-001 progress · from bbbbbbbb-2222 · Next: b`.
- **Unverified: Left open into decisions.md.** Commit once on the worker's branch, write `return.md` with `State: done`, the commit under Identities and, under `## Left open`, `- Which queue order -> oldest first` and `- Array or list -> array, technical`. Run `K node $W delegate check-return --record widget/task-001 --id D-001`: it says `2 Left open choice(s)` and `Now tell your coordinator`, and the record's line still says `running`. Merge the branch into `$S/widget`, then run `C node $W delegate close --record widget/task-001 --id D-001 --outcome accepted --merge <merge> --input -` with Cue, Result and Task effect. The output has `Added to decisions.md from D-001's Left open: P1, T1 (T1 serves P1 until you relink it).` and `Released 2 claim(s) of D-001.`; `decisions.md` ends with those two items, and `node skills/discuss-work/scripts/choices.mjs validate --record <record>` prints `Decision list valid: 2 item(s).`
- **Unverified: The worker's end.** Run `K node $W release --ended`: `Released 0 claim(s). Logged that this session, D-001's worker, ended.` (closing the delegation already released both of its claims).

## Gotchas

- `delegate join` needs `--record`: the task's ID in a store, as the printed prompt has it.
- A claim belongs to a task: a session that holds none and joined none is refused.
- A worker's `check-return` logs its return line but leaves the record's line as `running`; only the coordinator's marks it `returned`.
