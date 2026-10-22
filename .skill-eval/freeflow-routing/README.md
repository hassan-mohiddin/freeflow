# Freeflow routing

A standing suite that asks: given an ordinary request, does the agent open the skill that owns the work, and only that
one? It is the trigger eval of the plan to remove the Workflow skill (SPEC "Freeflow without the Workflow skill", section
6, item 1): routing moves from Workflow's body into the skill descriptions and a block in `runtime/prompts/core.md`, and
this suite measures the same requests before and after.

## When it runs

**Never automatically.** It costs real model runs (see [Cost](#cost)). Run it when an agent has proposed it, with its
estimated cost, and the user has said yes: as the baseline on `main` before the Workflow removal, then on the branch
that removes it, and after any later change to skill descriptions or the core prompt. Propose a pilot (`--pilot 5`)
first whenever the suite, its image or the evaluator changed since the last full run.

## Shape

One arm, `freeflow`: Freeflow's Pi extension built from a commit (`configuration.json`, `freeflow.source.ref`, `main`
at `1a21211c` by default), Cognitive Routing off and **Tool Execution on** (the default a Pi user has), on Claude Haiku
5.5 (`anthropic/claude-haiku-5-5`, thinking `medium`) through `@gotgenes/pi-anthropic-auth` 3.4.3, with Pi's host
prompt so Freeflow's own prompt and skill listing reach the model. Every group has the agent's whole tool set (`read`,
`write`, `edit`, `ls`, `find`, `grep`, `bash`, and Freeflow's `bash_background`, `monitor`, `stop_background` and
`apply_patch`), runs in one digest-pinned image with `network: none`, and is a conversation with a simulated user. A
one-arm group has no comparison: before and after are two runs of the same suite with different `--source`, read side
by side by the report.

**The project.** All requests are made in one small repository, `fixtures/shelf`: a reading-list command line tool with
a web view (Node, no dependencies). Its history is built into the image (`image/history`, `GIT_DIR=/opt/project.git`):
`main` at release 1.4.0, the branch `feature/tag-rename` checked out two commits ahead with a plan in `docs/PLAN-tags.md`,
and a TSV export left uncommitted. It also has the things requests point at: one failing test (`listBookmarks` compares
ISO strings with `-`), a search that lost its accent folding in a refactor, a slow list page, an unquoted CSV export,
messy `src/format.js`, duplicated URL normalizing, deployment notes, `AGENTS.md`, a changelog with an Unreleased
section and a 2,200-line server log.

**The cases** are in `scripts/cases.mjs`: 90 requests, each with the skill whose hit rate it counts toward (`hit`), the
skills whose opening counts as the right route (`expect`), and the skills that must not open (`not`). Each of the 25
skills has 3 requests that should open it, and at least one near miss: a request where a neighbour or no skill is right.
Near misses come from two places: 15 dedicated requests (a question, an exactly specified edit, a feature that is not a
refactor, an app setting that is not Freeflow's) and hit requests of a neighbour (a pull request must not open Commit
Work; a deployment must not open Release Work).

| Skill | Requests that should open it | Near misses that should not |
| --- | --- | --- |
| action-selection | `as-log-size`, `as-find-dates`, `as-env-var` | `nm-as-obvious` |
| agree-work | `aw-limit-flag`, `aw-no-duplicates`, `aw-archive` | `nm-aw-question`, `nm-aw-exact`, `nm-wf-question` |
| bypass | `by-skip-plan`, `by-just-bump`, `by-light-session` | `nm-by-urgent` |
| commit-work | `cw-commit-tsv`, `cw-commit-all`, `cw-commit-push` | `fb-pull-request` |
| design-for-depth | `dd-backends`, `dd-exporters`, `dd-errors` | `nm-dd-local` |
| diagnose-failure | `df-cafe`, `df-test-fails`, `df-slow-list` | `nm-df-known-cause` |
| discuss | `di-tags-or-folders`, `di-sync`, `di-revisit-plan` | `nm-di-decided` |
| evaluate-behavior | `eb-agents-rule`, `eb-compare-models`, `eb-wording` | `vw-tests` |
| execute-work | `ew-plan-step-2`, `ew-agreed-json`, `ew-lint-script` | `nm-ew-explain`, `nm-aw-question` |
| finish-branch | `fb-done`, `fb-pull-request`, `fb-abandon` | `cw-commit-tsv` |
| handoff | `ho-stop-today`, `ho-colleague`, `ho-new-session` | `nm-ho-summary` |
| launch-work | `lw-deploy`, `lw-rollback`, `lw-restore` | `rw-cut` |
| map-features | `mf-setup`, `mf-before-releases`, `mf-live-checks` | `vw-serve` |
| migration-work | `mg-sqlite`, `mg-tags-array`, `mg-hosting` | `nm-mg-notes`, `dd-backends` |
| release-work | `rw-cut`, `rw-prepare`, `rw-verify-published` | `lw-deploy`, `cw-commit-push` |
| review-work | `rv-branch`, `rv-plan`, `rv-tsv-change` | `vw-claim` |
| setup-freeflow | `sf-activate`, `sf-loaded`, `sf-repair` | `nm-sf-app-setting` |
| simplify-code | `sc-format`, `sc-duplicate`, `sc-cli-args` | `nm-sc-feature`, `aw-limit-flag` |
| track-work | `tw-start`, `tw-recover`, `tw-update` | `nm-tw-todo`, `nm-ho-summary` |
| verify-work | `vw-tests`, `vw-claim`, `vw-serve` | `rv-branch`, `rv-plan` |
| workflow | `wf-fix-and-test`, `wf-import`, `wf-rename-data` | `nm-wf-question` |
| write-docs | `wd-architecture`, `wd-stale-readme`, `wd-none` | `ws-sync` |
| write-plan | `wp-import`, `wp-revise`, `wp-remediation` | `ws-design`, `ew-plan-step-2`, `rv-plan` |
| write-skill | `wsk-agents`, `wsk-new-skill`, `wsk-claude-md` | `nm-wsk-readme` |
| write-spec | `ws-sync`, `ws-decision`, `ws-design` | `wp-import` |

**Workflow's requests** are changes to code. Their route counts as right when Workflow, Agree Work or Execute Work opens:
before the removal Workflow routes to the other two, after it they are reached directly, so both builds are measured on
the same route. The report's `self` column shows how often Workflow itself opened. After the removal, Workflow is not in
the build, and its row reads 0% `self` by construction.

**Merged skills (v0.9.0).** v0.9.0 ships 11 skills: it merged 15 of the base's into others and dropped Action
Selection. `MERGED` in `scripts/cases.mjs` names each removed skill's owner (Commit Work, Finish Branch, Launch Work and
Release Work into Deliver Work; Agree Work, Bypass and Discuss into Discuss Work; Design for Depth, Diagnose Failure,
Migration Work, Simplify Code and Workflow into Execute Work; Handoff into Track Work; Write Plan and Write Spec into
Write Docs). The cases stay as written, and each run is measured on its own build (`routeCase`), which the report reads
from the Freeflow package the evaluator built for the group. On the base nothing changes. On a build without a skill,
Workflow's rule applies to every merged skill:

- its requests count as routed when its owner opens (a commit request is a hit for Commit Work when Deliver Work
  opens), and its row's `self` reads 0% by construction; Workflow's route becomes Execute Work or Discuss Work;
- Action Selection has no owner (its job moved into the core prompt): its three requests count toward no hit rate on
  that build and are reported as requests with no owner;
- a near miss moves to the owner only while the owner is still a different skill from the request's own route. It is
  dropped on that build when the owner is the request's route (a pull request must not open Commit Work: both are
  Deliver Work now), when the case's `route` names the owner as also doing the request's job, or when it repeats
  another check. The report counts dropped checks; `--json` lists them per case.

Near misses dropped on the merged build (v0.9.0), so its false-trigger total is 17 checks, not 35:

| Case | Near miss | Why |
| --- | --- | --- |
| `cw-commit-tsv`, `cw-commit-push`, `fb-pull-request`, `lw-deploy`, `rw-cut` | Finish Branch, Release Work, Commit Work, Release Work, Launch Work | own route: Deliver Work |
| `dd-backends` | Migration Work | own route: Execute Work |
| `wp-import`, `ws-design`, `ws-sync` | Write Spec, Write Plan, Write Docs | own route: Write Docs |
| `aw-limit-flag`, `nm-sc-feature`, `nm-dd-local`, `nm-df-known-cause`, `nm-mg-notes` | Simplify Code, Simplify Code, Design for Depth, Diagnose Failure, Migration Work | the request is a code change, Execute Work's job (`route`) |
| `nm-by-urgent`, `nm-di-decided` | Bypass, Discuss | a change to agree before building, Discuss Work's job (`route`) |
| `nm-as-obvious` | Action Selection | no owner |
| `nm-ho-summary` | Handoff | repeats its Track Work check |

Near misses that move: Agree Work's (`nm-aw-question`, `nm-aw-exact`, `nm-wf-question`) to Discuss Work, Workflow's
(`nm-wf-question`) to Execute Work, Write Plan's (`ew-plan-step-2`, `rv-plan`) to Write Docs.

**Why body groups and not description groups.** The evaluator's description groups measure a declared target skill
(`skill-read`) and `revision: description-only` compares two snapshots that differ only in a description. Neither fits:
here the skills are Freeflow's own package, listed by Freeflow, and the change under test also deletes a skill and
edits the core prompt. Description groups also allow only `read` and no simulated user.

## The simulated user and the turn cap

Each request opens a conversation with a simulated user on the subjects' model (thinking `low`), whose card
(`cards/<case>.md`, written by `scripts/groups.mjs`) holds the request and the same rules as `.skill-eval/freeflow-vs-plain`:
answer only what is asked, "your recommendation is fine" for any choice, "go" when asked to proceed or when the agent
pauses, and `THANKS, DONE` once it reports what it did or answers. `max_turns` is 2: the request and at most one reply.
Routing shows in the first turns, so the task need not be finished, and the cap keeps runs short. An agent that asks a
question first still gets its reply and a second turn to open the skill.

## Graders and the report

Each group's checks are transcript checks (`tool-call` on `read`): `read-<skill>` passes when the run read
`/skills/<skill>/SKILL.md` for each skill in `expect`, and `no-<skill>` passes when it never read it for each skill in
`not`, plus the same checks for the merged build's owners (`gradedSkills`; a skill already checked keeps its base
check). The groups are the same for both builds, so a check on a skill the build lacks passes or fails by construction
(`read-deliver-work` always fails on the base). The aggregate counts them per group; the report, which knows each
run's build, is the measure.

The measures come from `scripts/report.mjs`, which reads the stored runs and counts a skill as opened when its
`SKILL.md` was read with `read` or named in a successful `bash` command (`cat`, `sed`, `head`). Per skill:

- **hit**: share of its own requests on which an expected skill opened, within the turn cap; **1st**: on the first turn;
  **self**: on which the skill itself opened;
- **false**: share of its near misses on which it opened anyway on the first turn. A later open is not counted: the
  simulated user's "go" can ask for the very work the near miss left out, and reading the skill is then right;
- **instead**: what opened on a miss (`(none)` when nothing did).

The same measures follow per skill of the merged build (`owner (merged)`), over the requests and near misses of every
skill merged into it, on both builds: Deliver Work's row adds Commit Work, Finish Branch, Launch Work and Release Work,
so before and after of one v0.9.0 skill read side by side. Overall it gives the hit rate over the requests with an
owner (75 on the base, 72 on v0.9.0), the false-trigger rate over the near-miss checks the build keeps, and skills
opened per run. `--cases` lists every run's opened skills with the turn; `--json` writes everything, including the runs it
left out (not complete, or held for uncleared transcript flags).

## Build and pin the image

From the repository root, with Docker (on Colima, `export TMPDIR=$HOME/.cache/skill-eval-tmp`):

```bash
node .skill-eval/freeflow-routing/image/build.mjs          # builds freeflow-routing-shelf, records image/digests.json
node .skill-eval/freeflow-routing/scripts/groups.mjs       # writes groups, cards and suite.json with the digest
npx prettier --write .skill-eval/freeflow-routing
```

Rebuild and re-pin after any change to the fixture or its history, including a formatting change: the image's history
must hold the fixture exactly, apart from the two uncommitted files. `node .skill-eval/freeflow-routing/image/make-history.mjs --check`
builds the history on the host and fails if the work tree differs from it in anything else.

## Check without a model

```bash
npm run check:eval-definitions
node --test .skill-eval/evaluate-behavior/tests/freeflow-routing.test.mjs
```

The test checks the case table (three requests and a near miss per skill, the skill list against Freeflow's), every
group's shape, the history, the report's counting, and runs one group end to end with stand-ins for the model, Pi,
Docker and Freeflow's build. `check-tasks` has nothing to check here: the groups have only transcript checks.

## Run

After the user's yes, from the repository root, with the definitions and the image committed:

```bash
# before: main (the definition's ref)
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/freeflow-routing/suite.json --jobs 4 --max-cost 1.5
# after: v0.9.0 (main at 51b9682f), or any later build
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/freeflow-routing/suite.json --source freeflow=51b9682fb44a9a68defd29e2ce3db64cae51581b --jobs 4 --max-cost 1.5
node .skill-eval/freeflow-routing/scripts/report.mjs <before-result> <after-result> --cases
```

`--source freeflow=<commit>` builds Freeflow from that commit for every group; the definitions are unchanged.
`--trials 3` gives each request three runs (three times the cost) when the one-trial rates are too close to call. To
try another model, change `model` in `configuration.json` and run both builds again; never pool models.

Reading: compare hit and false-trigger rates per skill and overall. The plan's rule is trigger recall no lower and
near-miss false triggers no higher. With three requests a skill, one run each, a single run moves a skill's hit rate by
a third, so read per-skill changes as signals to look at in `--cases`, and the overall rates (75 requests, 35 near-miss
checks) as the measure.

## Cost

Not yet measured on this suite. Estimated from `.skill-eval/freeflow-vs-plain`'s pilot on the same model (Freeflow
runs $0.004 to $0.006 each on Pi's list-price figures, for whole tasks): a routing run is shorter (many requests are
questions, and the cap is two turns) but carries Tool Execution's tool texts and one simulated-user call.

| Estimate, Haiku 5.5, medium | Per run | Full run (90 runs) | Pilot (5) |
| --- | --- | --- | --- |
| one build | ~$0.003 to $0.008 | ~$0.3 to $0.7 | ~$0.03 |
| before and after | | ~$0.6 to $1.4 | |

Billed to the Claude subscription, runs spend plan usage instead, which `--max-cost` does not see. Wall time is about
30 to 90 seconds a run; with `--jobs 4`, a full run takes 15 to 35 minutes. Each group also builds Freeflow (about a
second with npm's cache warm) and runs the six confinement probes in a container (a few seconds), at no model cost.

## Limits

- **One request, one trial, one model.** Each rate rests on three requests (or fewer near misses), and Haiku 5.5 is
  not every model in use. The suite detects large routing changes, not small ones; "no change seen" is not equivalence.
- **Reads, not use.** A skill counts as opened when its `SKILL.md` was read; whether the agent then followed it is not
  measured here (the phase B suite and the replay eval measure outcomes).
- **The cap hides late opens.** A skill opened on a third turn is not counted.
- **The user is a model.** A reply that names a skill or steers would bias a case; read `--cases` and the
  conversations (`skill-eval view`) before trusting a change.
- **Graded checks count `read` only.** A skill read through `bash` passes no `read-<skill>` check but counts in the
  report; trust the report's rates.
- **`ask_user` is refused**, as in the phase B suite: no one could answer its dialog in a run.
