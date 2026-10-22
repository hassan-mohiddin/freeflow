# Freeflow tool use

A standing suite that asks: on tasks where one of Freeflow's Tool Execution tools is the right choice, does the agent
use it, and does the work get done? It is the tool-use eval of the plan to remove the Workflow skill (SPEC "Freeflow
without the Workflow skill", section 6, item 2): tool guidance moves from the Tool Execution prompt into the tool
descriptions, and this suite measures the same tasks before and after.

## When it runs

**Never automatically.** It costs real model runs (see [Cost](#cost)). Run it when an agent has proposed it, with its
estimated cost, and the user has said yes: as the baseline on `main`, then on the branch that moves the guidance, and
after any later change to Tool Execution's prompt or tool texts. Propose a pilot (`--pilot 2`) first whenever the suite,
its image or the evaluator changed since the last full run.

## Shape

One arm, `freeflow`, with the same configuration as `.skill-eval/freeflow-routing`: Freeflow built from a commit
(`configuration.json`, `main` at `1a21211c` by default), Cognitive Routing off, **Tool Execution on**, Claude Haiku 5.5
(`anthropic/claude-haiku-5-5`, thinking `medium`) through `@gotgenes/pi-anthropic-auth` 3.4.3, Pi's host prompt, the
whole tool set including `bash_background`, `monitor`, `stop_background` and `apply_patch`, one digest-pinned image
(Node, Python, Git, tmux, procps, curl) with `network: none`, and a simulated user. Before and after are two runs with
different `--source`.

Freeflow's background commands and monitors run inside the subject's container, like `bash`, and stopping one on the
host stops it in the container (the evaluator's container route and lifetime wrapper, `guard-rules.mjs`); `apply_patch`
may name only paths inside the workspace. Their output files are readable from `read` and from the container's `bash`.

## Tasks

Five small tasks, each with a fixture (`fixtures/<task>`), a natural prompt that does not name the tool, hidden tests
(`graders/<task>.test.mjs`, one named test per requirement, every name starting `ftu: `), a reference solution
(`reference/<task>`) and the checks of the tool Tool Execution means for it. Prompts, cards and checks live in
`scripts/groups.mjs`.

| Task | What the user asks | Right tool (`right`) | Reported alternatives (`also`) | Hidden tests |
| --- | --- | --- | --- | --- |
| `dev-server-health` | start the dev server, save what `/health` returns to `health.json`, shut it down | `bash_background` called, `stop_background` succeeded | `monitor` not called (one signal: ready) | the saved JSON, with the build hash only the running server reports |
| `template-watch` | run the template watcher and fix what it reports until every template is ok, then stop it | `monitor` called, `stop_background` succeeded | `bash_background` called | both broken templates fixed; the watcher, compiler and data unchanged |
| `slow-suite` | run the full test suite (about three minutes) and fix what fails | `bash_background` called on the tests | `bash` never ran `npm test` in the foreground | the reservation bug fixed; the suite's tests unchanged |
| `move-helper` | move `formatPrice` to a new `src/money.js` as `formatMoney` and update its users | `apply_patch` succeeded | `edit` succeeded | the new module, no `formatPrice` left, every page prints the same |
| `one-line-fix` | fix a one-word typo in `src/greet.js` | `edit` succeeded, `apply_patch` not called | | the greeting and the rest of the screen |

The dev server waits three seconds before it listens, so a request right after starting it fails; the watcher polls,
so it sees edits made from the host; both stop on their own after ten idle minutes, which bounds a run whose agent ran
them in the foreground. The slow suite opens a warehouse for 24 seconds per test (seven tests, run one file at a time).

## The simulated user

As in `.skill-eval/freeflow-vs-plain`: each task's card (`cards/<task>.md`) holds the request, the shared rules (answer
only what is asked, "go" when asked to proceed or when the agent pauses, `THANKS, DONE` once it reports the work done)
and the user's preferences, revealed only when a question touches them (for example "fix the templates, not the
compiler"). It runs on the subjects' model at thinking `low`. `max_turns` is 4: the request, an agreement round and the
work.

## Measures

The aggregate counts each check per task. `scripts/report.mjs <result> [<result>]` prints, per task and per result:
**right tool** (runs where every `right` check passed), each check's pass count (`task` is the hidden tests), and the
mean calls per run of `bash`, `bash_background`, `monitor`, `stop_background`, `apply_patch`, `edit` and `write`. With
two results it prints them as before and after. Read the right-tool rate beside `task`: a right tool with failed work,
or the work done with the wrong tool, are different findings. Run metrics (cost, turns, duration) are in the aggregate.

## Build and pin the image

```bash
node .skill-eval/freeflow-tool-use/image/build.mjs          # builds freeflow-tool-use, records image/digests.json
node .skill-eval/freeflow-tool-use/scripts/groups.mjs       # writes groups, cards and suite.json with the digest
npx prettier --write .skill-eval/freeflow-tool-use
```

On Colima, which shares only `$HOME`, give the evaluator a temporary directory under it:
`export TMPDIR=$HOME/.cache/skill-eval-tmp`.

## Check without a model

```bash
node skills/evaluate-behavior/scripts/skill-eval.mjs check-tasks .skill-eval/freeflow-tool-use/suite.json
node --test .skill-eval/evaluate-behavior/tests/freeflow-tool-use.test.mjs
```

`check-tasks` must report every task `solvable`: the hidden tests pass on the reference and fail on the fixture, in the
image. The test checks each group's shape and tool checks, that the graders' copies of protected files
(`graders/originals/`) match the fixtures, and runs one task end to end with stand-ins for the model, Pi, Docker and
Freeflow's build. `.skill-eval/evaluate-behavior/tests/tool-execution-container.test.mjs` drives Freeflow's tools
through real Pi in a real container with a scripted model.

## Run

After the user's yes, from the repository root, with the definitions and the image committed:

```bash
# before: main (the definition's ref)
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/freeflow-tool-use/suite.json --trials 3 --jobs 4 --max-cost 1
# after: the branch that moves the guidance
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/freeflow-tool-use/suite.json --trials 3 --source freeflow=<commit> --jobs 4 --max-cost 1
node .skill-eval/freeflow-tool-use/scripts/report.mjs <before-aggregate> <after-aggregate>
```

## Cost

Not yet measured on this suite. Each task is a small coding task, close to `.skill-eval/freeflow-vs-plain`'s ($0.004
to $0.006 per Freeflow run on Pi's list-price figures, before a simulated user), with up to four turns and the user's
calls on top.

| Estimate, Haiku 5.5, medium | Per run | Full run (5 tasks × 3 trials) | Pilot (2) |
| --- | --- | --- | --- |
| one build | ~$0.005 to $0.02 | ~$0.08 to $0.3 | ~$0.02 |
| before and after | | ~$0.15 to $0.6 | |

Wall time is dominated by `slow-suite` (about three minutes per suite run, more if the agent reruns it): about 15 to
30 minutes for a full run with `--jobs 4`.

## Limits

- **Five tasks, one author, one model.** Each tool's rate rests on one task; the suite shows whether a tool is used at
  all and catches large shifts, not small ones.
- **The right tool is Tool Execution's own guidance.** Foreground `bash` can also finish `slow-suite`, and reading a
  background command's output file can stand in for `monitor`; the suite reports them as alternatives, not failures of
  the work.
- **Background notices between turns** start a run of their own; the evaluator records it in the turn before it, and
  the next reply waits for it. A notice that would arrive after the conversation ended is never seen.
- **The user is a model**, as in the routing suite; read conversations (`skill-eval view`) before trusting a change.
- **References are written in their own style.** The transcript scan holds a run whose files repeat most of the
  reference solution's new lines (an answer copy). A rename has one natural answer, so `reference/move-helper` imports
  `formatMoney as money`: it proves the task solvable without matching what a correct agent writes line for line. Keep
  that when editing a reference, or every correct run is held until cleared.
