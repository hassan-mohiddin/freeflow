# Running And Evidence

Two parts. Running the evaluator, and what it stores, is a contract: it states how the evaluator behaves; rely on that behavior as written, and its requirements on you restate [Evaluate Behavior](../SKILL.md) Rules. Reading the evidence and deciding what to revise is judgment: adapt it to the evidence in hand.

## Command And Path Contract

Run commands from the repository or fixture root that owns the definitions:

```text
node <evaluate-behavior-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant <arm>] [--trials <n>] [--max-cost <total>] [--jobs <n>] [--cpu-jobs <n>] [--reuse] [--pilot <n>] [--results <dir>] [--yes] [--uncommitted] [--skip-reference-check] [--source <arm>=<commit>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant <arm>] [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs view <result-id-or-directory> --html <file> [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs check-tasks <suite-or-group-path> [--group <id-or-position>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-id-or-directory> (--model <provider/model> | --configuration <file>) [--group <id-or-position>] [--thinking <level>] [--swap | --swap-sample <fraction>] [--limit <name>=<chars>] [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-or-aggregate-id> --rubric [--model <provider/model>] [--configuration <file>] [--group <id-or-position>] [--thinking <level>] [--limit <name>=<chars>] [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-or-aggregate-id> --calibrate <labels.json> [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs clear <result-id-or-directory> [--group <id>] [--variant <arm>] (--flag <id>... | --all) --reason <text> [--results <dir>]
```

- The current working directory is the definition root and result root.
- The `run` target resolves from that directory.
- Suite group references resolve relative to the suite file.
- Fixture, skill, and context declarations resolve from the definition root.
- Results are stored under `<cwd>/.skill-eval/runs/<result-id>`, or under `--results <dir>` (resolved from the working directory) when given; `invocation.json` records the directory. `view` and `review` take the same `--results` to find stored IDs there, and an aggregate's trials are found beside it.
- A bare `view` target is tried first as a stored result ID, then as a path from the working directory.
- An absolute or path-like `view` target resolves as a directory path.

Examples:

```text
skill-eval run .skill-eval/my-skill/suite.json
skill-eval run .skill-eval/my-skill/suite.json --variant candidate
skill-eval view 20260720173209-a3649b8b
skill-eval view 20260720173209-a3649b8b --group 2 --variant candidate
skill-eval view /absolute/path/to/result
```

With no selectors, `run` or `view` selects every suite group and every arm. `--group` is invalid for a direct group definition/result.

Before anything starts, `run` prints its plan: `Plan: <subjects> subjects (<groups>, <arms>, <trials>); models: <model (thinking)>`, plus the Freeflow refs it will build and how many subjects run at once. Then the preflight: for every container image a selected arm runs in, the `docker` command line, a running engine and the image present locally. Anything missing refuses the whole run before any subject, with what to install or pull, and nothing is pulled. On an interactive terminal it then asks `Start? [y/N]` unless `--yes` is given; any answer but yes starts nothing and exits nonzero. When either stdin or stdout is not a terminal, as in scripts and agents, it prints the plan and continues.

## Current Execution Boundary

`run` executes description and body groups. Unsupported group types are rejected before subject execution. Description groups allow no tools or `read`; body groups allow no tools or path-guarded `read`, `write`, `edit`, `ls`, `find` and `grep`, the evaluator's `run_command` tool for declared commands, plus non-native custom tools supplied by a declared runtime extension bundle. `ls`, `find` and `grep` without a path work in the workspace; an explicit path must stay inside the readable roots, like a read. Native `bash` runs only through a declared shell isolation that the evaluator verifies with confinement probes before any subject runs (see [coding tasks](coding-tasks.md#shell)); without one, `run` refuses it before any subject starts and the guard blocks it, because the guard cannot confine a shell to the workspace. A container environment provides such a shell: bash and the declared commands run in a per-subject container from a digest-pinned image, started for a group that declares either, and command graders run in the same image. Before any container starts, the evaluator checks that the engine shares the folder the workspaces live under with its containers, by reading a marker back through the image: a VM-based engine (Colima, Docker Desktop, OrbStack, Podman's machine) mounts only the host folders it shares, and a workspace elsewhere would arrive empty. A refusal names the folder; run from one the engine shares, or for `check-tasks`, which works under the system temp folder, set `TMPDIR` to one. `powershell` is unsupported.

A [runtime profile](conversations-pipelines-judges.md#runtime-profile) selects the host's prompt mode, session, extension bundles and environment sources; missing inherited variables invalidate the variant. For body runs, delivery remains `unavailable` until target setup succeeds; `natural-prompt` or `explicit-skill-command` records a prompt attempt. After the evaluator's guard load the configuration's `host.extensions` (recorded under `resources.hostExtensions`), the command tool when the group declares commands, the arm's Freeflow build when declared, and declared extensions; when a group declares context assertions, a final non-mutating observer records the effective system prompt and each provider-neutral context message without replacing or sanitizing what extensions injected.

Use fresh JSON-mode execution for one-shot descriptions. Use one persistent RPC process per selected variant for ordered description turns and all body groups. RPC correlates responses, waits for `agent_settled`, disables automatic retry and compaction, preserves directly observed partial-turn evidence, and cleans the process tree. A run the host starts on its own between prompts, such as an extension's notice that a background command exited, is recorded in the turn before it (the turn's `unpromptedRuns` counts them), and the next prompt, a simulated user's reply and the end of the session wait for it to settle; each prompt is sent as a follow-up, so one that arrives during such a run waits its turn.

A body target is matched to the exact snapshotted `SKILL.md` and explicitly delivered on turn one. Later turns remain unchanged. Description groups use natural prompts and never explicit target delivery.

## Isolation And Resources

For each selected variant:

- snapshot exact declared skills, context, and the shared runtime bundle resources;
- copy the shared runtime bundles identically into the variant and verify their fingerprints before and after execution;
- snapshot the group fixture once from the definition-root working tree—never from a variant Git source—then create an independent writable copy;
- preserve skill order and target index;
- preserve runtime host, session mode, and extension order;
- preserve runtime bundle and provider-context observation evidence when requested;
- replace ambient instructions with evaluator-owned declared context;
- keep criteria and review questions outside the subject prompt;
- allow reads only from workspace and declared immutable resources;
- allow writes and edits only inside the workspace;
- reject traversal, symlink escape, unsupported Git entries, and invalid UTF-8 in declared resources and the fixture;
- record a link the subject makes in its workspace as a link with its `target`, never following it, so a link to the container's workdir or outside the workspace neither fails the run nor copies anything in;
- verify immutable resource fingerprints after execution.

Working-tree sources snapshot current paths. Git sources resolve one exact commit and record both the declared ref and resolved identity.

A run is canonical only when every working-tree input it reads (the definition files and any `extends` file, the fixture, runtime bundle resources, command grader files, rubric reference files, a conversation's card, host extensions taken from a working-tree `path`, and the skills and context of working-tree subjects) is committed and unchanged in the definition root's Git repository: modified, untracked or ignored files all count as uncommitted. The run then records that commit in `summary.json` under `inputs` and on each working-tree source. Otherwise it is refused before anything starts, naming the uncommitted paths, unless `--uncommitted` is given; its subjects still run and call models. Such a run is marked `dryRun: true` (the field's name in every result, older ones included) with its uncommitted inputs listed, and its aggregate supports no claim. Inputs outside any Git repository need `--uncommitted` too. When a configuration declares `host.version`, the evaluator compares it with `pi --version` before anything starts, refuses a mismatch, and records the installed version as `hostVersion`.

Each host process, subject or reviewer, runs in its own isolation root (`isolation/` beside its evidence), with its own home, temp, XDG and Pi agent directories, so the user's home, temp files and Pi settings are not visible and two processes share nothing. Only the declared model's provider login is copied in, from `SKILL_EVAL_CREDENTIALS_DIR`, else `PI_CODING_AGENT_DIR`, else `~/.pi/agent`, with that provider's custom model entry when one exists; `run.json` records which entries were copied under `isolation`, never their values. No copy refreshes a login, which would rotate the user's own token away: the installed Pi refreshes every OAuth login the selected arms use, in the user's own agent directory, valid for at least 120 minutes before a batch, and again before a subject whose login has under 30 minutes left, one at a time, and a refresh that fails refuses the run with a pointer to log in again in Pi. The configuration's `host.settings`, merged over the evaluator's defaults (automatic retry and compaction off), become the agent directory's `settings.json`, recorded as `isolation.settings`; Pi uses its defaults for every other setting. A provider with no stored login runs with nothing copied.

## Persistence And States

Each selected run is persisted before its counterpart. Grade and group evidence are persisted before later groups.

Run states are `complete`, `invalid`, `infrastructure-failed`, `cancelled`, and `not-selected`. Group and batch states are `complete`, `partially-complete`, `invalid` where applicable, and `cancelled`.

- Failed deterministic checks are ordinary complete behavioral evidence and exit zero when no infrastructure/grade failure exists.
- A grade whose every selected check is `unavailable` observed nothing, so its group is `partially-complete` and the command exits nonzero.
- A missing or malformed context observation makes the run `infrastructure-failed` but keeps its transcript, response, usage, and process evidence.
- **Transcript scan.** After each executed run, and over a pipeline's earlier stages, the evaluator records `postRun.scan.flags`: `outside-read` (a read, `ls`, `find` or `grep` of a path outside the workspace, the declared resources and the run's own arm directory, blocked or not, except the subject's scratch files under the temp directory; the arm's `isolation/`, which holds the login, is outside; also a bash command naming a host path under the user's home or the definition root that is none of these, or a credential location such as `~/.ssh` or `~/.pi`), `network` (a bash command whose target is external: an HTTP client, socket tool, remote shell or Git remote that is not this machine or the container's own network, or code that fetches an external URL; when the run's network was `none`, also an install that names a registry package; a URL in a payload or in tool output is not an attempt), `instruction-file` (`CLAUDE.md`, `AGENTS.md` or `.claude/` reached outside the workspace) and `answer-copy` (three consecutive distinctive lines of a hidden grader file, or a quarter of them, a hidden test's name, or most of the reference solution's distinctive lines in the subject's answer or written files; a distinctive line is long, has several words and is not an import). A file the subject wrote that the scan did not read, such as a link it made, is listed under `postRun.scan.skipped`. A flag is evidence for a person, not a verdict: the run is graded as usual, but until a person clears every flag it is held, counted as `unavailable` and named under `held` in the aggregate, its metrics, scores and judged answers count toward no claim or decision, and a pilot stops on it. `skill-eval clear` records the person's reason in `clearances.json` beside the run (the run's files never change) and rebuilds every aggregate that lists its result. Clear a flag only on the user's decision.
- **Validity gate.** A run the host reported complete is graded only when it shows a model at work: at least one assistant message, a nonzero token total, and an answer or something written in the workspace. Otherwise it becomes `invalid` before any grader runs, with `error.kind` `validity` and the failed conditions in `error.reasons`, and its group's `group.json` names the reason under `invalid`. An invalid run keeps everything it recorded, its checks are `unavailable` (never a fail), its metrics count toward no summary or decision, and a pilot stops on it. Tokens, not cost, are the signal: a model with no configured price reports zero cost for real work, while a provider that reports no token usage at all cannot be told apart from one that never answered. Tool use is not required: one answer without tools, such as a description run whose target did not activate, is behavior to grade.
- Variant-local invalidity or infrastructure failure preserves evidence and does not stop safe queued work.
- Shared fixture failure invalidates the group.
- Thrown grading or recoverable grade/group publication failure becomes explicit `grade-error` fallback evidence.
- If a run or required fallback cannot be preserved, queued work stops and no completed summary is published.
- Cancellation starts no queued subject and preserves observed diagnostics.

Invalidity, infrastructure failure, cancellation, or `grade-error` makes the final command exit nonzero after safe queued work finishes.

## Views And Raw Evidence

Views can render a complete result, one arm across groups, one group, or one group's arm. Grade appears before selected run evidence. The displayed absolute result path anchors result-relative artifact and workspace paths.

Path cells escape literal backslashes before tab, carriage return, and newline. Arm views exclude expectation-owned errors from other arms while retaining comparison, group, and system errors.

Use ordinary file tools for raw `run.json`, events, transcript, final response, stderr, workspace, definition, grade, context observations, and group artifacts. Views remove transport noise; they do not replace canonical evidence. Tool-call grades distinguish attempted, succeeded, failed, and not-called outcomes.

## Safeguards And Limits

Normal completion follows settlement. Path guards, no-progress detection, cancellation, process-tree cleanup, and very high emergency ceilings stop runaway or unsafe infrastructure. Subjects run until they settle, with no turn, token, output, or short time cap, because a guessed cap cuts off the behavior the evaluation is trying to observe.

`--max-cost <total>` is an explicit spend ceiling, not a subject cap, shared by every subject of a run and of all its trials. It is reserve-then-charge: before a subject starts it reserves the mean cost of the subjects finished so far (zero before any finished), and it may not start once spend plus the running subjects' reservations reaches the ceiling; such variants become `cancelled`. When a subject finishes, its host-reported `usage.cost.total` is charged. Subjects already running complete and are charged, so spend can pass the ceiling by at most the running set (one subject with one job). The aggregate records `budget` with the ceiling, the run's spend, whether it was exhausted, and the `overshoot` past the ceiling; a result's summary records the same `budget` with the run's total so far as `runTotal`, because the ceiling is shared by every trial. A host that reports no cost never exhausts the ceiling.

Each result's summary also records its own `cost`, with or without a ceiling: `spent`, the host-reported cost of the subjects this result ran (a reused run costs nothing again), `subjects`, how many ran, and `unmeasured`, how many have no measured cost: no cost reported, or a cost of 0 for a run that used tokens, as Pi reports for a model it has no price for. Such a run's `cost` metric is null too, so it is never read as free. An aggregate lists each trial's `cost`, so one trial's cost never has to be read off the run's running total.

## Concurrency, Reuse And Pilot

- **`--jobs <n>`** (default 4; when a selected arm runs in containers, one per two CPUs on this machine, since each container gets two, at most 4 and at least 1) runs up to n subjects at once across groups, arms and trials, through one shared queue. Each group still prepares its fixture before its arms run, grades after all its arms, and each result's summary is written after all its groups; results are listed in plan order. With one job, groups, arms and trials run one after another as before. Cancellation (SIGINT or SIGTERM) stops queued subjects and terminates running ones; budget exhaustion only stops new ones.
- **`--cpu-jobs <n>`** (default 2) bounds local CPU work that is not a model call, such as command graders, through a shared queue (`withCpuSlot` in `lib/queue.mjs`).
- **Reuse.** Every complete run of a canonical (committed) invocation whose group grade is readable is indexed, with or without `--reuse`, in `<results>/index.jsonl` under a key: sha256 over the group's task fields, the content of its fixture, runtime bundles and command-grader files, the arm's name and effective configuration, the content of its working-tree skills and context (or the commit its Git source resolves to, and its Freeflow ref's commit), its model, the installed host version, and the evaluator's own scripts. A run with `--reuse` takes a matching indexed run (still complete, grade still readable) instead of running that arm: the run is copied into the new trial, graded there like any other, and marked `reused` with where it came from; the group records `reused` and the aggregate lists every reused run. A run is reused at most once within one run or aggregate, and a reused copy is never indexed. Runs with `--uncommitted` never reuse and are never indexed.
- **`--pilot <n>`** first runs the first n selected groups once, every arm. Before a pilot group's first subject, after its confinement probes, each selected arm with a shell runs the harness check (`lib/harness.mjs`) through its own host and extensions with the local scripted model, so no model is called: `pwd` in the workspace, `cd /tmp && pwd`, `pwd` again, a scratch write under `/tmp`, and which of `node`, `python3` and `git` the shell has, each counted as run only when it prints its marker. Its records are in `harness/<arm>/harness.json` and the group summary's `harness`. A shell that ran the first command and not the third, a workspace command that did not run, or arms of one group that found different things make that group invalid before any subject; otherwise the pilot prints one `Harness:` line per arm. It stops with a report, before the batch and without an aggregate, if any of its runs is cancelled, infrastructure-failed or invalid, any grade is unreadable or has errors, or any comparison passed in no arm. Otherwise the batch continues: the pilot is the first trial of its groups and one invocation of the remaining groups completes that trial (the aggregate records `pilot` and each trial's `part`). A run with `--pilot` always records an aggregate, even with one trial, so no group runs twice.
- **`--source <arm>=<commit>`** (repeatable) runs the arm, for this run only, with every Git source ref it declares (its subject source, its Freeflow source and its source-built host extensions) replaced by the commit SHA. The definition files are not changed. `invocation.json` records `sources`, each overridden run records `sourceOverride` and the commit in its `resources.source`, and the reuse key follows the override. An arm with no Git source, or one that is not an arm of a selected group, is refused before the plan.

## Trials

`--trials <n>` runs the selection as `n` independent complete invocations. Each trial is an ordinary result with its own ID. A separate aggregate under `.skill-eval/runs/<aggregate-id>/aggregate.json` lists the trials and, per group, counts pass, fail, and unavailable for every deterministic check and comparison, plus comparison transitions. A trial whose grade file cannot be read is counted in `unreadableGrades`; the other trials still aggregate. Grade errors are counted per group (`gradeErrors`), and run states per variant (`runStates`), so nothing that failed leaves the denominators silently. Each check also records `trials` and `passAll`, its pass^k: whether it passed in every one of the k trials that graded it. Each comparison records `pairs` for each non-reference arm, the per-trial outcomes against the reference: both pass, both fail, reference only, that arm only, or incomplete. Without a decision rule, the aggregate's `claim` is a rate on this suite at its k and states that no "beats" claim is supported. A suite that declares a [decision](authoring.md#decision) always runs as trials, even without `--trials`; the aggregate records `decision` (the rule with defaults applied, its `ruleSha256`, the split, ties, excluded cases and values, p, the verdict, and each case's per-arm mean and count), and its claim is the rule's verdict (`beats`, `worse` or `no-difference-shown`) with the split, p and the rule's hash; an uncommitted run's claim stays `none`. When the decision declares a `trials` schedule, the plan states the initial trials and the most adaptive rounds could add; each added trial runs one undecided group alone and records its `round` and `group`, `requestedTrials` stays the initial count, and `schedule.rounds` records each round's cases and its scheduled and run trials. `--max-cost` is shared across trials, and exhaustion stops starting further trials. `view <aggregate-id>` renders the counts, pass^k, pairs, claim and decision, with initial and adaptive trials counted apart; view an individual trial for its evidence.

The aggregate's `scores` section summarizes test-graded command checks' `score` per arm and per trial (`score.<expectation id>`, and `score.<comparison id>` for a comparison's checks); a decision rule names one as `{ "score": "<id>" }`.

Each subject's `run.json` records `metrics` derived from evidence the run already holds: `durationMs`, `turns`, `toolCalls`, `toolErrors`, `tokens` (`input`, `output`, `cacheRead`, `cacheWrite`), `cost` (the host-reported cost), `cacheHitRate`, and, from a Pi transcript only, `peakContext` (the largest single request), `skillReads` and `skillReadTokens` (reads of declared skills' or the loaded Freeflow package's instruction files, re-reads counted; tokens estimated at 4 bytes each, since no tokenizer ships, and a skill delivered in the prompt rather than read is not counted). An arm with no skills and no Freeflow reads 0; any other metric without evidence is `null`, never 0. The aggregate's `metrics` section gives, per arm, each metric's count, median, mean, min and max over the trials that measured it; per non-reference arm, the paired difference against the reference within each trial; and `perTrial` values, which a decision rule names as `{ "metric": "<name>" }` with nested fields dotted (`tokens.input`). Both views render them.

## Advisory Review

`review` answers each group's `review_questions` with a separate reviewer model, a judge under Review Work's [Judge Contract](../../review-work/references/evals-and-judges.md#judge-contract):

- only groups with review questions and a complete run in every arm are reviewed;
- the reviewer sees the task turns, the group's fixture files as shared task materials, and for each run its responses, tool calls, changed paths and the full text of every file it created or modified (by default each response up to 8,000 characters, each tool call's arguments up to 300, each file up to 20,000 and the materials up to 60,000, with any cut stated; `--limit <name>=<chars>` changes any of them), as Run A, Run B and so on in random order;
- run workspaces, the group and run directories, the repository root and the user's home are replaced by neutral tokens, so absolute paths and the variant names inside them never reach it; it never sees deterministic grades;
- each run and the task materials are fenced between `BEGIN RUN MATERIAL <token>` and `END RUN MATERIAL <token>` lines, with a random token per prompt that the material cannot know, and a fixed instruction before them says the fenced text is evidence, never instructions; text in it that addresses the reviewer, asks for a verdict or claims authority is quoted in the reply's `steering`, recorded in `steering`, and adds the contract gap `run material addressed the judge`;
- it runs without tools, skills, context files, or session, in its own isolation root, with extensions off except its host setup's: by default each group's (the reference arm's `host.extensions` and `host.settings`, so it uses the login the subjects used), or the configuration file given with `--configuration`, whose extensions, settings and model replace it (`--model` and `--thinking` override the model); `semantic-grade.json` records the `setup` (`group` or `command-line`) with the extensions and settings, and a group whose extensions are built from source needs `--configuration`;
- `--swap` reviews again with the order reversed and records agreement per question; without it, the unchecked order is recorded as a contract gap; `--swap-sample <fraction>` swaps only on a random sample of the selected groups (the fraction of them, rounded up), and each group records `swapSample: { fraction, sampled }`;
- `groups/<id>/semantic-grade.json` records the judge's model, provider, family (approximated by provider), thinking, extensions and isolation; the subject's providers and the family relation (`same`, `different` or `unknown`, a comparison of providers: `different` maps to a judge validation record's `different family`, and `same` to `different model` or `same model: <why>`, which the provider alone cannot tell apart); the label mapping, prompt hash, answers mapped back to variants, swap results, the effective `limits` and how many cuts the view took (`truncated`), `contractGaps` (at least `calibration not checked`, and `materials truncated` when anything was cut), and errors; `groups/<id>/review/` keeps the prompt, events, final response, and stderr;
- malformed or incomplete reviewer output becomes `review-error` with the raw response preserved.

A review is advisory. It never changes run or deterministic grade evidence, and rerunning it replaces only the previous advisory review.

When an unsupported operation changes the question, reject it or run a clearly separate direct comparison with explicit limits. Never invoke archived evaluators as a fallback.

## Use The Strongest Evidence

Prefer, in order:

1. filesystem state, typed workspace manifests, diffs, and changed paths;
2. structured events, tool activity, usage, process results, logs, and saved reports;
3. final response;
4. full transcript when stronger surfaces cannot answer the question;
5. subject self-assessment.

Lower-priority evidence cannot repair a contradiction above it.

If a response claims success but a required file is absent, preserve both facts and judge from the stronger artifact evidence.

## Keep Deterministic Facts Separate

Deterministic grades are appended only after canonical run evidence exists. Built-in checks establish exact observable facts, such as:

- skill or resource reads;
- file and path state;
- changed paths;
- file or response text;
- JSON validity or values;
- tool-call outcomes and argument predicates;
- context text at a selected surface, request, and turn;
- a grader command's exit code and which required tests passed;
- factual transitions from the reference arm to each other arm.

Missing evidence remains unavailable. A failed check remains behavioral evidence and does not relabel a complete run as infrastructure failure; an expectation of an unknown kind or a grading failure produces separate `grade-error` evidence and does not rewrite run evidence. A transition such as `fail-to-pass` is a factual comparison. It does not mean bad-to-good, not-ready-to-ready, or rejected-to-promotable.

The active agent or user may judge:

- reasoning quality;
- authority preservation;
- architectural fitness;
- recommendation quality;
- semantic completeness.

Keep semantic judgment, cited evidence, uncertainty, and limits outside canonical run and deterministic grade state. Judged evidence from `review` and `review --rubric` is already stored apart; read it with each judge's identity and calibration, and when it disagrees with deterministic facts, the facts stand and the disagreement is reported.

Do not turn semantic or judged evidence into evaluator-owned readiness or promotion status.

## Diagnose The Failed Boundary

Classify before revising:

- activation timing;
- description language unavailable before body read;
- first-read body comprehension;
- undeclared, undelivered, unread, or ambient-only dependency;
- normal guidance hidden behind the wrong resource boundary;
- nearby behavior that hijacks the task;
- retained-use or multi-turn failure;
- wording, placement, example, repetition, or stop-condition pressure;
- a component that never reached the model;
- a stage, simulated user or judge rather than the subject: an earlier pipeline stage, a user that left its card, or a judge that misread the run;
- fixture, environment, isolation, host, runner, grader-command, or deterministic-check failure.

Do not add broad prose before identifying which boundary failed.

## Return Revision To The Owner

When evidence supports changing the component:

1. name the exact failed boundary;
2. cite the canonical evidence;
3. identify one measured pressure point;
4. preserve unrelated instructions and fixed criteria;
5. return the revision target to the component's owner.

[Write Skill](../../write-skill/SKILL.md) owns revision of a skill or other instruction text, such as an instruction file. Extension code goes to its owner; a choice of model, setting or extension goes to the user.

Evaluate Behavior does not change the component or replace its baseline while evaluating it.

When evidence proves the group, fixture, or criterion is wrong, revise the evaluation instead. Preserve the old result and state that it no longer answers the revised question.

## Rerun The Complete Group

After a measured revision or resolved infrastructure cause:

- rerun the complete fixed group;
- run every arm;
- keep every result visible;
- do not hand-pick an earlier reference run as a fresh counterpart; `--reuse` stands one in only when its inputs match exactly, and lists it as reused;
- do not rerun only the preferred arm;
- do not use partial evidence as a comparable full result;
- do not rerun merely to erase failure.

For variance, use `--trials` to run independent complete invocations rather than repeated preferred arms.

## Report A Revision

Report:

- failed boundary and evidence;
- exact revision or evaluation correction;
- criteria that remained fixed;
- old and new result paths;
- deterministic transitions, and the decision's verdict when the suite declares one;
- remaining unsupported claims.

The user decides whether to revise further, adopt, or reject the change.
