# Top-line suite: Freeflow against plain Claude Code

Freeflow's own claim, measured on the harness it targets (SPEC-011, Part 8): better results than the plain agent, at a
total cost that is not higher, with the same model. Suite v1 holds 20 real tasks from Freeflow's merged pull requests;
5 of them are the smoke subset that serves as the regression check.

Nothing here has run. Every run calls a model and is Hassan's yes, with its count and cost (Evaluate Behavior's Rules).

## What is in it

| File | What it is |
| --- | --- |
| `tasks.json` | The tasks: each pull request's merge, the request as Hassan would type it, what the pull request settled (the simulated user's hidden preferences), its size, whether it is in the smoke subset, and the held-back test files with their test names. The one place a task is written. |
| `scripts/groups.mjs` | Writes `groups/`, `groups-ablation/`, `graders/` and `cards/` from `tasks.json` and the repository's history. Run it after changing either file, then format and commit. |
| `configuration.json` | What both arms share: Claude Code, Haiku 5.5 at xhigh, Claude Code's own prompt with what each arm adds, the container image, no network, and the Freeflow build (`freeflow.source.ref`) with the repository settings main has. |
| `groups/<task>.json` | One task: its workspace is the merge's first parent's tree (a commit fixture, less `.deprecated`, the review suite's fixtures, this folder and `.freeflow`); arms `plain` (no Freeflow, the reference) and `freeflow`; a simulated user with the task's card; the held-back tests as a command check on each arm; the merge as the reference solution. |
| `groups-ablation/<task>.json` | The same task with the ablation ladder: `freeflow` against `freeflow-no-track` (Track Work off), `freeflow-no-gates` (the four gates off) and `freeflow-no-review` (Review Work off), each a settings change. |
| `suite-v1.json` | All 20 tasks, 3 trials, five decisions (below). |
| `suite-smoke.json` | The smoke subset: `migrate-recovery-list` and `review-packet-root` (fixes), `rules-at-session-start` and `resume-takes-back` (features), `settings-everywhere` (long), with the same decisions at `min_cases` 5. |
| `suite-ablation.json` | The ladder over all 20 tasks, with no decision: counts per arm against `freeflow`. Run only after the top line is known. |
| `predictions-v1.md` | What we expect, written before any run. |
| `plan/study-plan.md` | Research Work's study plan, locked with `study.mjs lock` (`plan/study-plan.md.lock.json`). |
| `image/` | The container: `build-offline.mjs` (how this machine built it, with no package network), `Dockerfile` (the same where packages can be fetched), `digest.txt` (this machine's build). |

## The arms

Both run `claude -p` headless with the same model and effort, tools (read, write, edit, find, grep, and bash in the
container), simulated user and turn cap, from a clean configuration (`--setting-sources ""`). The `freeflow` arm adds the
Freeflow package built from `freeflow.source.ref` as the session's plugin (its session-start hooks and mod) and a fresh
Freeflow store as `FREEFLOW_HOME`; its event log is read into each run, with Freeflow's overhead (`overhead`,
`overheadUncached`), and a Freeflow run whose log holds no line is invalid. Pass `--source freeflow=<commit>` to measure
another build, such as main after this branch merges.

The evaluator turns Claude Code's automatic compaction off for every subject, so no compaction happens in either arm: a
headless run claims Freeflow's compaction only on the next compaction, and there is none. The feature and long tasks
therefore measure long work, not work across a compaction.

## The decisions (suite-v1.json)

| # | Measure | Method | Better | Minimum |
| --- | --- | --- | --- | --- |
| 1, the claim | `hidden-tests` pass^3 per task | exact McNemar | higher | 6 discordant tasks |
| 2 | `listCost`, every request at API list price (Track Work's table) | paired bootstrap, 95% | lower | 10 tasks |
| 3 | `durationMs`, wall time | paired bootstrap, 95% | lower | 10 tasks |
| 4 | `score.hidden-tests`, the share of held-back tests passed | paired bootstrap, 95% | higher | 10 tasks |
| 5 | `interruptions`, the simulated user's messages before the end | paired bootstrap, 95% | lower | 10 tasks |

Three trials, run as one schedule. Freeflow's overhead is read from the metrics, not decided (plain has none).

## Check without a model

```bash
docker info >/dev/null                                   # the daemon must run; the image must be on this machine
node .skill-eval/top-line/image/build-offline.mjs        # once per machine; pin the digest it prints in configuration.json
node skills/evaluate-behavior/scripts/skill-eval.mjs check-tasks .skill-eval/top-line/suite-v1.json
```

`check-tasks` writes each task's starting tree and its merge's tree, runs the held-back tests on both in the image, and
passes a task only when they fail before and pass after. It lists, for every task, that the workspace has no Git
history: on purpose, so no later commit is reachable.

## Run (Hassan's yes first)

Each command needs a Claude Code login in the environment (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` or
`CLAUDE_SESSION_INGRESS_TOKEN_FILE`), Docker with the pinned image, and, the first time a Freeflow ref is built, npm's
registry for the build's runtime dependencies.

```bash
# The pilot: the smoke suite's first two tasks once per arm, after the harness check (4 subject runs).
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/top-line/suite-smoke.json --pilot 2 --jobs 2 --max-cost 3
# The smoke batch: 5 tasks x 2 arms x 3 trials = 30 subject runs, the pilot's reused; --max-cost from the pilot.
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/top-line/suite-smoke.json --reuse --jobs 2 --max-cost <pilot cost per run x 30 x 1.5>
# The full suite: 20 x 2 x 3 = 120 subject runs, the smoke runs reused.
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/top-line/suite-v1.json --reuse --jobs 2 --max-cost <...>
```

Each subject run also makes up to 8 simulated-user calls (Haiku 5.5 at low effort). `--max-cost` counts Claude Code's
reported cost at list price, not a subscription's usage, so a batch still waits for Hassan's yes.

## Regression mode and retirement

Run the smoke suite when a skill, a hook, a runtime prompt or a driver changes, and read it per task against the last
run; run the full suite before a release that changes the workflow. A task both arms always pass, or always fail, over
two versions is marked for retirement in the next version, and a bug that got past Verify and Review becomes a task.
