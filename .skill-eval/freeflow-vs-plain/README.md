# Freeflow against plain Pi

A standing suite that asks one question: on small, realistic coding tasks, does current Freeflow do at least as well as
plain Pi, at no higher cost, or does it buy a named gain worth its extra cost? It is phase B of the evals spec: Hassan's
cost rule written as a test.

## When it runs

**Never automatically.** It costs real model runs (see [Cost](#cost)). Run it only when an agent has proposed it, with
its estimated cost and the decision it expects, and the user has said yes. It is meant for:

- a release candidate, before the tag;
- a change that claims a success or cost gain (for example "Freeflow now reads fewer skill files").

Before proposing a full run, propose a pilot (`--pilot 2`, four subjects) when anything in the suite, the image or the
evaluator changed since the last full run.

## The two arms

Every group runs the same task twice per trial, paired by task, on the same host (Pi), model and container:

| Arm        | Declared as                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plain`    | `freeflow: null`: plain Pi with its own system prompt and no Freeflow. The reference.                                                                                                                                                                                          |
| `freeflow` | Freeflow's Pi extension built from the commit in `configuration.json` (`freeflow.source.ref`), default settings except **Cognitive Routing off** (no delegation, no worker profiles) and **Tool Execution off** (see [Limits](#limits)). Task Memory and Messaging are off by default. |

Both arms share `configuration.json`: host `pi`, `runtime.prompt: host` (so Freeflow's own prompt reaches the model),
`subject.kind: none`, `network: none`, and the model (`xai/grok-4.7`, thinking `medium`). Each group adds only its task
and its container (`environment.image`, digest-pinned, `network: none`, with `bash` running inside it). `component` is
`["freeflow"]`, so the evaluator refuses a group whose arms differ anywhere else.

## Tasks

Ten small tasks a user would hand an agent, each a few minutes of work for a competent agent. Each has a fixture
(`fixtures/<task>`), a Git history built in its image (`image/history/<task>`), a natural prompt with no hints, hidden
tests (`graders/<task>.test.mjs`, one named test per requirement), a reference solution (`reference/<task>`) and at
least one hand-made wrong answer (`wrong/<task>/<answer>`). Prompts live in `scripts/groups.mjs`.

| Task                 | Kind                    | What the user asks                                         | Trap                                                                                                                                  |
| -------------------- | ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts-csv`       | bug fix                 | a company with a comma shifts CSV columns                  | quoting commas alone is not enough: quotes and line breaks need RFC 4180 escaping                                                     |
| `invoice-cents`      | bug fix, wrong layer    | the printed invoice shows £4.34 for a £4.35 item           | the symptom is on the printout; the cause is the shared `toPence` (floor of a float), which the till receipt also uses                |
| `slug-max-length`    | feature, spec in README | implement the README's `maxLength` and `--max-length`      | the README does not say what to do when the first word alone is too long (a choice for the user)                                      |
| `report-dates`       | refactor                | one helper for a date format built in three places         | the original prints `NaN-NaN-NaN` for a bad date; `toISOString()` would throw                                                         |
| `duration-test`      | test for a reported bug | add a test for a bug already fixed in the last commit      | the test must fail on the code before the fix (`HEAD~1`); a single-unit test passes both                                              |
| `page-size-config`   | config tweak            | default page size 50, `PAGE_SIZE` override, invalid ignored | an existing test asserts the old default; `parseInt` accepts `2.5` and `10abc`; no cap is specified (a choice for the user)          |
| `dedupe-contacts-py` | bug fix, Python         | keep the first contact per email, case-insensitive         | contacts without an email all collapse into one today (unspecified, a choice for the user)                                            |
| `paginate-last-page` | bug fix                 | an empty page 3 for exactly 20 results                     | `Math.ceil` alone gives 0 pages for no results, breaking an existing test a shortcut would edit                                       |
| `config-deep-merge`  | bug fix                 | `listening on undefined:9000` when only the port is set    | a merge into the defaults object changes the next load; arrays and nulls are unspecified (a choice for the user)                      |
| `check-json-exit`    | bug fix, CLI            | the JSON check exits 0 after printing FAIL                 | the last commit's `process.exit(0)` overrides the exit code; exiting at the first failure loses later reports and the summary        |

## Measures

Per arm, the aggregate reports pass counts with pass^k for every check, and these metrics with median, mean and the
paired difference (`freeflow` minus `plain`, within each trial):

- `cost`, `tokens.*`, `durationMs`, `turns`, `toolCalls`, `toolErrors`, `cacheHitRate`;
- `peakContext`: the largest single request in a run, the input plus cache reads plus cache writes of one assistant
  message, from the Pi transcript. It counts what the subject's model calls carried; a model call made outside the
  subject's transcript (none here, with routing off) is not counted.
- `skillReads` and `skillReadTokens`: every successful read of a file under the Freeflow package's `skills/`,
  `capabilities/` or `runtime/` (or a declared skill), re-reads included: a `read` call inside them, or a `bash` call
  whose command names a path inside them. Tokens are **estimated** at 4 UTF-8 bytes per token from the text each read
  returned (no tokenizer ships with the evaluator), so compare them between arms and runs, not against a provider's
  count. A skill delivered in the prompt rather than read is not counted. Plain Pi reads none: a measured 0.

## Behaviour markers

Markers show which of Freeflow's intended behaviours appeared. They are **reported, never required**: no marker is in
either decision. Deterministic markers are checks in the aggregate (comparison IDs below); judged markers are rubric
dimensions, answered only when `review --rubric` is run.

| Marker                        | How it is observed                                                                                                  | Skill it shows                         | Tasks                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `marker-new-test`             | an added or changed test fails on HEAD (only the new tests copied in) and passes on the final work                  | Verify Work: regression check          | all but `report-dates`, `duration-test` (where it is a required test)       |
| `marker-tests-kept`           | every test file HEAD had is unchanged                                                                               | Verify Work: test integrity            | all but `page-size-config` (where the request changes a tested default)     |
| `marker-fix-at-root`          | the printer and invoice files are unchanged (`changed-paths` excludes)                                              | Diagnose Failure: fix the cause        | `invoice-cents`                                                             |
| `marker-ask-user`             | a call to Freeflow's `ask_user` tool (the evaluator refuses it; see [Limits](#limits))                             | Agree Work: ask, by the tool           | the five tasks with a choice for the user                                   |
| `choice-put-to-user` (judged) | the reply asks about the unspecified choice, or names the choice made and invites a change                          | Agree Work: ask, in the reply          | the five tasks with a choice for the user                                   |
| `root-cause-named` (judged)   | the reply names the shared conversion as the cause                                                                  | Diagnose Failure                       | `invoice-cents`                                                             |
| `changed-test-explained` (judged) | each changed existing test is named with its reason                                                             | Verify Work: test integrity            | `page-size-config`, `paginate-last-page`                                    |
| `verification-reported` (judged) | the reply names a concrete check, its result and what it shows                                                   | Verify Work: evidence in the report    | all                                                                         |

Read markers together: a test edited to match a wrong behaviour passes `marker-new-test` and fails `marker-tests-kept`
(see `wrong/paginate-last-page`). Count the user-choice channel from both `marker-ask-user` (tool) and
`choice-put-to-user` (reply).

## The pass rule and how to read it

Hassan's rule: **success no worse and cost no higher, or a named gain that pays for the extra cost.** The evaluator's
decision takes one measure, so the rule is declared as two suites over the same groups, both fixed before any run:

- `suite.json` decides on success: the `hidden-tests` comparison (all required hidden tests pass), `plain` against
  `freeflow`, higher is better.
- `suite-cost.json` decides on cost: the `cost` metric, lower is better. Run it after `suite.json` with `--reuse`: it
  takes every run from the success suite, so it costs nothing.

Both use the sign test over cases (tasks) with `alpha` 0.05, a fixed three trials per task, and `min_cases` 6, the
fewest decided cases at which the test can reach p < 0.05 (six of six; five of five gives p = 0.0625).

Reading, in order:

1. Success verdict `worse`: the rule fails.
2. Cost verdict `worse`: cost is higher. The rule passes only for a gain named before the run (for example a success
   `beats`, or more cases solved on every trial, or a marker such as `marker-tests-kept` holding where plain Pi breaks
   tests) that the user judges worth the cost. Report the median paired cost difference and the cost ratio beside it.
3. Otherwise the rule passes, with this caveat in the report: ten cases detect only large effects. A sign test says
   `worse` only when about nine of ten cases agree, so also report the per-case counts and the paired medians of
   `cost`, `peakContext`, `skillReadTokens`, `turns` and `durationMs`, and name any task that got worse.

Never call "no difference shown" equivalence.

## Build and pin the images

Each task has its own image (`freeflow-vs-plain-<task>`), built from `image/Dockerfile` with the suite folder as the
context: Node 22, Python 3, Git, and the task's history at `/opt/project.git` (`GIT_DIR` and `GIT_WORK_TREE` point Git
at it, so `git log` and `git diff` work in `/testbed`; HEAD is the fixture exactly). From the repository root:

```bash
node .skill-eval/freeflow-vs-plain/image/build.mjs            # every task; or name tasks to build only those
node .skill-eval/freeflow-vs-plain/scripts/groups.mjs         # writes the digests into groups/*.json
npx prettier --write .skill-eval/freeflow-vs-plain/groups .skill-eval/freeflow-vs-plain/image/digests.json
```

`build.mjs` records each local digest in `image/digests.json`; commit it with the groups before a canonical run. A
build's digest differs from machine to machine, so a Mac and a cloud session each pin their own. Rebuild and re-pin
after any change to a fixture or its history: the graders read HEAD to find what the subject changed. The evaluator
never pulls images.

On Colima, which shares only `$HOME`, give the evaluator a temporary directory under it:
`export TMPDIR=$HOME/.cache/skill-eval-tmp`.

## Check without a model

```bash
node skills/evaluate-behavior/scripts/skill-eval.mjs check-tasks .skill-eval/freeflow-vs-plain/suite.json
node .skill-eval/freeflow-vs-plain/scripts/check-wrong.mjs
```

`check-tasks` must report every task `solvable` in both arms (hidden tests and deterministic markers pass on the
reference and fail on the fixture). `check-wrong.mjs` grades each hand-made wrong answer as if it were the reference:
its hidden tests must fail with exactly the tests `wrong/manifest.json` lists, and listed markers must grade as listed.
`check-tasks` also notes "copy lacks: git history": the workspace itself is not a repository, but the image provides
the history to the subject's `bash` and to the graders.

## Run

After the user's yes, from the repository root, with the definition and images committed:

```bash
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/freeflow-vs-plain/suite.json --pilot 2 --jobs 4 --max-cost 25
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/freeflow-vs-plain/suite-cost.json --reuse
node skills/evaluate-behavior/scripts/skill-eval.mjs view <aggregate-id>
```

- **A release candidate or another Freeflow commit:** add `--source freeflow=<commit>`; the definition keeps its ref.
  The `plain` arm has no Git source, so no override applies to it. Pass the same `--source` to the cost suite so
  `--reuse` matches.
- **Another model:** change `model` in `configuration.json` (one file; every group extends it), commit, and run both
  suites again. Compare models by their own verdicts and paired differences; never pool runs of different models.
- **Judged markers:** `review <aggregate-id> --rubric --model <judge>` answers the rubric for each run, blind to its
  arm. It is optional and costs one judge call per run.

## Cost

Estimated, not measured on this suite. A full run is 10 tasks × 2 arms × 3 trials = 60 subject runs; the cost suite
reuses them. Measured Grok 4.7 (thinking medium) costs on 21 Oct 2026: simple Verify Work runs $0.15 to $0.45, the
bookmarks tasks $0.26 to $0.60. These tasks are smaller than both, and plain Pi carries no Freeflow prompt or skill
reads:

| Model                     | Per run (plain / freeflow) | Full run (60)        | Pilot (4) | Judged markers (optional, 60 calls) |
| ------------------------- | -------------------------- | -------------------- | --------- | ----------------------------------- |
| `xai/grok-4.7`, medium    | ~$0.10–0.35 / ~$0.15–0.50  | ~$8–26, likely ~$15  | ~$1–2     | ~$1–3                               |
| a small model (later)     | measure with a pilot first | pilot cost × 15      | —         | —                                   |

For a second, smaller model, run the pilot first and scale: a full run costs about fifteen pilots. Small models often
take more turns, so do not scale by price per token alone. `--max-cost` bounds the host's list-price estimate, not a
subscription's plan limit. Wall time is about 1 to 4 minutes per run; with `--jobs 4`, a full run takes 30 to 60
minutes.

## Limits

- **No follow-up rounds yet.** The suite measures first-try success and cost only. Cost to a correct result (a
  simulated user giving one or two follow-ups when the first try fails) needs evaluator changes: command graders that
  run after each turn, and a simulated user who sees the symptom a user would see. Until then, a cheaper first try is
  not shown to be cheaper overall.
- **Freeflow's host-side tools are off or refused.** Tool Execution's `bash_background` would run on the host, outside
  the sealed container, and its `apply_patch` writes outside the guard's path checks, so Tool Execution is off. Freeflow
  adds `ask_user` to the tools, but no one could answer its dialog in a run (Pi's RPC mode would wait for an answer the
  evaluator never sends), so it is not declared and the guard refuses the call; the agent then asks in its reply.
  `compact_context` is not declared either; these tasks stay far below compaction.
- **Git lives in the container.** The subject's `read`, `ls` and `find` see no `.git`; `git` works from `bash`.
  Freeflow's host-side code sees a workspace that is not a repository.
- **Ten cases detect only large effects**, and tasks share one author: a `no-difference-shown` verdict is not
  equivalence.
- **The transcript scan may hold runs.** A subject whose reply or files repeat most of a reference solution's distinctive
  lines is flagged as an answer copy; a natural refactor of `report-dates` can match the reference closely. Clear a flag
  only on the user's decision (`skill-eval clear`).
