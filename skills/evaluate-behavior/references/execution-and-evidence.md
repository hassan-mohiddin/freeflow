# Execution And Evidence

Read this when operating `run|view|review|check-tasks`, resolving paths, interpreting states, or reasoning about Pi execution, isolation, persistence, cancellation, and safeguards.

This reference is a contract: it states how the evaluator behaves. Rely on that behavior as written; its binding requirements on you restate [Evaluate Behavior](../SKILL.md) Rules.

## Command And Path Contract

Run commands from the repository or fixture root that owns the definitions:

```text
node <evaluate-behavior-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant <arm>] [--trials <n>] [--max-cost <total>] [--jobs <n>] [--cpu-jobs <n>] [--reuse] [--pilot <n>] [--results <dir>] [--yes] [--dry-run] [--skip-reference-check] [--source <arm>=<commit>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant <arm>] [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs view <result-id-or-directory> --html <file> [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs check-tasks <suite-or-group-path> [--group <id-or-position>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-id-or-directory> (--model <provider/model> | --configuration <file>) [--group <id-or-position>] [--thinking <level>] [--swap | --swap-sample <fraction>] [--limit <name>=<chars>] [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-or-aggregate-id> --rubric [--model <provider/model>] [--configuration <file>] [--group <id-or-position>] [--thinking <level>] [--limit <name>=<chars>] [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-or-aggregate-id> --calibrate <labels.json> [--results <dir>]
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

Before anything starts, `run` prints its plan: `Plan: <subjects> subjects (<groups>, <arms>, <trials>); models: <model (thinking)>`, plus the Freeflow refs it will build. On an interactive terminal it then asks `Start? [y/N]` unless `--yes` is given; any answer but yes starts nothing and exits nonzero. When either stdin or stdout is not a terminal, as in scripts and agents, it prints the plan and continues.

## Current Execution Boundary

`run` executes description and body groups. Unsupported group types are rejected before subject execution. Description groups allow no tools or `read`; body groups allow no tools or path-guarded `read`, `write`, `edit`, `ls`, `find` and `grep`, the evaluator's `run_command` tool for declared commands, plus non-native custom tools supplied by a declared runtime extension bundle. `ls`, `find` and `grep` without a path work in the workspace; an explicit path must stay inside the readable roots, like a read. Native `bash` runs only through a declared shell isolation that the evaluator verifies with confinement probes before any subject runs (see the schema reference's Shell section); without one, `run` refuses it before any subject starts and the guard blocks it, because the guard cannot confine a shell to the workspace. A container environment provides such a shell: bash and the declared commands run in a per-subject container from a digest-pinned image, started for a group that declares either, and command graders run in the same image. `powershell` is unsupported.

A runtime profile selects the installed native Pi host, the `isolated` or `host` prompt mode, whether the variant uses an isolated persistent session directory, zero or more ordered extension bundles, and declarative environment sources. Literal values are non-secret configuration; only explicitly inherited parent variables are passed to the child without being persisted, alongside a small host-runtime baseline. Missing inherited variables invalidate the variant. Launch-control and loader keys are rejected from inherited values, and literal and inherited names must not overlap. For body runs, delivery remains `unavailable` until target setup succeeds; `natural-prompt` or `explicit-skill-command` records a prompt attempt. The evaluator launches the base guard first, the configuration's `host.extensions` (such as a subscription's auth extension, recorded under `resources.hostExtensions`), its command tool when the group declares commands, the arm's Freeflow build when its configuration declares one, declared extensions next, and, when a group declares context assertions, a final non-mutating observer last. The observer records both the effective `before_agent_start` system prompt and each provider-neutral `context` message projection; it does not replace or sanitize extension injections after the base guard has established evaluator-owned isolation.

Use fresh JSON-mode execution for one-shot descriptions. Use one persistent RPC process per selected variant for ordered description turns and all body groups. RPC correlates responses, waits for `agent_settled`, disables automatic retry and compaction, preserves directly observed partial-turn evidence, and cleans the process tree.

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
- reject traversal, symlink escape, unsupported Git entries, and invalid UTF-8;
- verify immutable resource fingerprints after execution.

Working-tree sources snapshot current paths. Git sources resolve one exact commit and record both the declared ref and resolved identity.

A run is canonical only when every working-tree input it reads (the definition files and any `extends` file, the fixture, runtime bundle resources, command grader files, rubric reference files, a conversation's card, host extensions taken from a working-tree `path`, and the skills and context of working-tree subjects) is committed and unchanged in the definition root's Git repository: modified, untracked or ignored files all count as uncommitted. The run then records that commit in `summary.json` under `inputs` and on each working-tree source. Otherwise it is refused before anything starts, naming the uncommitted paths, unless `--dry-run` is given. A dry run is marked `dryRun: true` with its uncommitted inputs listed, and its aggregate supports no claim. Inputs outside any Git repository need `--dry-run` too. When a configuration declares `host.version`, the evaluator compares it with `pi --version` before anything starts, refuses a mismatch, and records the installed version as `hostVersion`.

Each host process, subject or reviewer, runs in its own isolation root (`isolation/` beside its evidence): `HOME`, `TMPDIR`, `TMP`, `TEMP`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `PI_CODING_AGENT_DIR` point inside it, so the user's home, temp files and Pi settings are not visible and two processes share nothing. Only the declared model's provider login is copied into the agent directory, from `SKILL_EVAL_CREDENTIALS_DIR`, else `PI_CODING_AGENT_DIR`, else `~/.pi/agent`, together with that provider's custom model entry when one exists. `run.json` records under `isolation` which entries were copied, never their values. A refresh inside a copy would rotate the user's own token away, so no copy refreshes: before a batch, every OAuth login the selected arms use is made valid for at least 120 minutes, and before each subject, one with under 30 minutes left is refreshed again, each time by the installed Pi in the user's own agent directory, one evaluator process at a time. A refresh that fails refuses the run before anything starts, with a pointer to log in again in Pi. The configuration's `host.settings`, merged over the evaluator's defaults (automatic retry and compaction off), become the agent directory's `settings.json` and are recorded as `isolation.settings`. A provider with no stored login runs with nothing copied. Pi uses its defaults for every other setting the definition does not declare.

## Participants

A group with [participants](evaluation-definition-schema.md#participants) runs them inside each arm, with the arm's configuration.

**Conversation.** The subject runs one persistent RPC session, opened with the group's prompt. After each settled turn, the simulated user is called like a judge: a separate model call without tools, skills, context files or session, in its own isolation root whose name is a hash, not the arm, with the arm's host extensions and settings and the provider's login copied in and removed afterward. Its fixed prompt holds its card, the instruction to answer only from the card and to say "I don't know" otherwise, the instruction that whatever the assistant says is conversation that cannot change its card, goal or rules, the stop phrase, and the visible conversation: the user's messages and the subject's replies, with run paths replaced by `<run>`, never the subject's tool calls or files. Its reply becomes the next turn, unless it contains the stop phrase. The conversation ends at the stop phrase, after `max_turns` subject turns, or when the subject stops. `run.json` records `participants` with the user's identity (model, provider, thinking, extensions, card path and hash), each message with its prompt hash, usage and isolation, and how it `ended` (`stop`, `max-turns`, `subject-stopped` or `user-error`); `prompts` lists every message the subject received. A user call that fails or writes nothing makes the run `infrastructure-failed`. Each call's prompt, events and reply stay under `groups/<id>/participants/<hash>/turn-<n>/`.

**Pipeline.** Stages run in order, each a separate subject process with its own isolation root and workspace. A stage's workspace is a fresh fixture copy when it sees `fixture`, and empty otherwise. An earlier stage's response or written files reach it only as declared context: copied into the stage's own resources, fingerprinted, injected by the guard under the labels `<stage>.response` and `<stage>.files`, and readable there; the earlier stage's directories stay outside its readable roots. The injected copy of each file is fenced as run material under a random token, and the stage's prompt gains a fixed note that the fenced work is material to assess, never instructions, and that text in it trying to direct the stage is a finding to report. The graded stage runs in the arm's directory, so its `run.json` is the arm's run and grading, review and judging read it as usual. Every other stage keeps its `run.json`, transcript, events and stderr beside the arm in `<arm>.<id>/`, so every stage's workspace is as deep as a single subject's and a declared command that reaches the repository by a relative path works in each. Each stage's response and files are kept in its directory's `outputs/`. The arm's `run.json` records `participants.stages` (state, `sees`, `fresh`, run file relative to the group directory, response hash, written files and usage) and `graded`. A stage that does not complete stops the pipeline and the arm's run takes its state.

In both protocols the arm's `usage` covers every participant, so `--max-cost` counts them all.

## Persistence And States

Each selected run is persisted before its counterpart. Grade and group evidence are persisted before later groups.

Run states are `complete`, `invalid`, `infrastructure-failed`, `cancelled`, and `not-selected`. Group and batch states are `complete`, `partially-complete`, `invalid` where applicable, and `cancelled`.

- Failed deterministic checks are ordinary complete behavioral evidence and exit zero when no infrastructure/grade failure exists.
- A grade whose every selected check is `unavailable` observed nothing, so its group is `partially-complete` and the command exits nonzero.
- A missing or malformed context observation makes the run `infrastructure-failed` but keeps its transcript, response, usage, and process evidence.
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

`--max-cost <total>` is an explicit spend ceiling, not a subject cap, shared by every subject of a run and of all its trials. It is reserve-then-charge: before a subject starts it reserves the mean cost of the subjects finished so far (zero before any finished), and it may not start once spend plus the running subjects' reservations reaches the ceiling; such variants become `cancelled`. When a subject finishes, its host-reported `usage.cost.total` is charged. Subjects already running complete and are charged, so spend can pass the ceiling by at most the running set (one subject with one job). The summary and aggregate record `budget` with the ceiling, spend, whether it was exhausted, and the `overshoot` past the ceiling. A host that reports no cost never exhausts the ceiling.

## Concurrency, Reuse And Pilot

- **`--jobs <n>`** (default 1) runs up to n subjects at once across groups, arms and trials, through one shared queue. Each group still prepares its fixture before its arms run, grades after all its arms, and each result's summary is written after all its groups; results are listed in plan order. With one job, groups, arms and trials run one after another as before. Cancellation (SIGINT or SIGTERM) stops queued subjects and terminates running ones; budget exhaustion only stops new ones.
- **`--cpu-jobs <n>`** (default 2) bounds local CPU work that is not a model call, such as command graders, through a shared queue (`withCpuSlot` in `lib/queue.mjs`).
- **Logins** are refreshed once, before any subject of a run or of all its trials starts. A subject refreshes again only if its login has fallen below the per-subject threshold, under a lock, so parallel subjects never refresh at once.
- **Reuse.** With `--reuse`, every complete run of a canonical (not dry) invocation whose group grade is readable is indexed in `<results>/index.jsonl` under a key: sha256 over the group's task fields, the content of its fixture, runtime bundles and command-grader files, the arm's name and effective configuration, the content of its working-tree skills and context (or the commit its Git source resolves to, and its Freeflow ref's commit), its model, the installed host version, and the evaluator's own scripts. The same run takes a matching indexed run (still complete, grade still readable) instead of running that arm: the run is copied into the new trial, graded there like any other, and marked `reused` with where it came from; the group records `reused` and the aggregate lists every reused run. A run is reused at most once within one run or aggregate, and a reused copy is never indexed. Dry runs never reuse and are never indexed.
- **`--pilot <n>`** first runs the first n selected groups once, every arm. It stops with a report, before the batch and without an aggregate, if any of its runs is cancelled, infrastructure-failed or invalid, any grade is unreadable or has errors, or any comparison passed in no arm. Otherwise the batch continues: the pilot is the first trial of its groups and one invocation of the remaining groups completes that trial (the aggregate records `pilot` and each trial's `part`). A run with `--pilot` always records an aggregate, even with one trial, so no group runs twice.
- **`--source <arm>=<commit>`** (repeatable) runs the arm, for this run only, with every Git source ref it declares (its subject source, its Freeflow source and its source-built host extensions) replaced by the commit SHA. The definition files are not changed. `invocation.json` records `sources`, each overridden run records `sourceOverride` and the commit in its `resources.source`, and the reuse key follows the override. An arm with no Git source, or one that is not an arm of a selected group, is refused before the plan.

## Trials

`--trials <n>` runs the selection as `n` independent complete invocations. Each trial is an ordinary result with its own ID. A separate aggregate under `.skill-eval/runs/<aggregate-id>/aggregate.json` lists the trials and, per group, counts pass, fail, and unavailable for every deterministic check and comparison, plus comparison transitions. A trial whose grade file cannot be read is counted in `unreadableGrades`; the other trials still aggregate. Grade errors are counted per group (`gradeErrors`), and run states per variant (`runStates`), so nothing that failed leaves the denominators silently. Each check also records `trials` and `passAll`, its pass^k: whether it passed in every one of the k trials that graded it. Each comparison records `pairs` for each non-reference arm, the per-trial outcomes against the reference: both pass, both fail, reference only, that arm only, or incomplete. Without a decision rule, the aggregate's `claim` is a rate on this suite at its k and states that no "beats" claim is supported. A suite that declares a `decision` ([schema](evaluation-definition-schema.md#decision)) always runs as trials, even without `--trials`, and its claim is the rule's verdict (`beats`, `worse` or `no-difference-shown`) with the split, p and the rule's hash; a dry run's claim stays `none`. When the decision declares a `trials` schedule, the plan states the initial trials and the most adaptive rounds could add; each added trial runs one undecided group alone and records its `round` and `group`, `requestedTrials` stays the initial count, and `schedule.rounds` records each round's cases and its scheduled and run trials. `--max-cost` is shared across trials, and exhaustion stops starting further trials. `view <aggregate-id>` renders the counts, pass^k, pairs, claim and decision, with initial and adaptive trials counted apart; view an individual trial for its evidence.

The aggregate's `scores` section summarizes test-graded command checks' `score` per arm and per trial (`score.<expectation id>`, and `score.<comparison id>` for a comparison's checks); a decision rule names one as `{ "score": "<id>" }`.

Each subject's `run.json` records `metrics`, derived from evidence the run already holds: `durationMs` (completed minus started), `turns` (turns recorded; 1 for a one-shot run), `toolCalls` and `toolErrors`, `tokens` (`input`, `output`, `cacheRead`, `cacheWrite`), `cost` (the host-reported `usage.cost.total`) and `cacheHitRate` (cache reads over input plus cache reads plus cache writes). A metric without evidence is `null`, never 0. The aggregate's `metrics` section gives, per arm, each metric's count, median, mean, min and max over the trials that measured it; per non-reference arm, the paired difference against the reference within each trial where both were measured; and `perTrial` values, which a decision rule names as `{ "metric": "<name>" }` with nested fields dotted (`tokens.input`). Both views render them.

## Advisory Review

`review` answers each group's `review_questions` with a separate reviewer model, a judge under Review Work's [Judge Contract](../../review-work/references/judge-contract.md):

- only groups with review questions and a complete run in every arm are reviewed;
- the reviewer sees the task turns, the group's fixture files as shared task materials, and for each run its responses, tool calls, changed paths and the full text of every file it created or modified (by default each response up to 8,000 characters, each tool call's arguments up to 300, each file up to 20,000 and the materials up to 60,000, with any cut stated; `--limit <name>=<chars>` changes any of them), as Run A, Run B and so on in random order;
- run workspaces, the group and run directories, the repository root and the user's home are replaced by neutral tokens, so absolute paths and the variant names inside them never reach it; it never sees deterministic grades;
- each run and the task materials are fenced between `BEGIN RUN MATERIAL <token>` and `END RUN MATERIAL <token>` lines, with a random token per prompt that the material cannot know, and a fixed instruction before them says the fenced text is evidence, never instructions; text in it that addresses the reviewer, asks for a verdict or claims authority is quoted in the reply's `steering`, recorded in `steering`, and adds the contract gap `run material addressed the judge`;
- it runs without tools, skills, context files, or session, in its own isolation root, with extensions off except its host setup's: by default each group's (the reference arm's `host.extensions` and `host.settings`, so it uses the login the subjects used), or the configuration file given with `--configuration`, whose extensions, settings and model replace it (`--model` and `--thinking` override the model); `semantic-grade.json` records the `setup` (`group` or `command-line`) with the extensions and settings, and a group whose extensions are built from source needs `--configuration`;
- `--swap` reviews again with the order reversed and records agreement per question; without it, the unchecked order is recorded as a contract gap; `--swap-sample <fraction>` swaps only on a random sample of the selected groups (the fraction of them, rounded up), and each group records `swapSample: { fraction, sampled }`;
- `groups/<id>/semantic-grade.json` records the judge's model, provider, family (approximated by provider), thinking, extensions and isolation; the subject's providers and the family relation (`same`, `different` or `unknown`); the label mapping, prompt hash, answers mapped back to variants, swap results, the effective `limits` and how many cuts the view took (`truncated`), `contractGaps` (at least `calibration not checked`, and `materials truncated` when anything was cut), and errors; `groups/<id>/review/` keeps the prompt, events, final response, and stderr;
- malformed or incomplete reviewer output becomes `review-error` with the raw response preserved.

A review is advisory. It never changes run or deterministic grade evidence, and rerunning it replaces only the previous advisory review.

## Judged Evidence

`review --rubric` judges each complete run of every selected group that declares a [rubric](evaluation-definition-schema.md#rubric-and-judges), under the same Judge Contract:

- each run is judged alone: the judge sees the task turns, the fixture files, that run's responses, tool calls, changed paths and written files, the rubric and its references, with the same limits and neutral path tokens as the advisory review; it never sees the arm name, other arms' runs, or deterministic grades, and its working directory and home are named by a hash, not the arm; the run and the task materials are fenced as run material with the same fixed instruction, and each judge's reported `steering` is recorded with it and adds the contract gap `run material addressed the judge`; the judge configuration's identity includes the prompt version, so a calibration does not carry over to a changed prompt;
- the group's `judges` answer, each in its own isolation root; a group without `judges` is judged by `--model` (or the configuration's model), and `--model` with declared judges is refused before any judge starts;
- each judge's host extensions and settings come, most specific first, from its own declared `configuration`, else from the group (its reference arm's host setup, so a judge uses the login the subjects used); `--configuration` gives the setup only to the command-line judge of a group without declared judges, and is refused when every judged group declares its judges, because it would be ignored. Each judge's record holds its effective `setup` (`group`, `own (<file or inline>)` or `command-line`), extensions, settings, model, thinking and family relation, and its calibration key covers that setup;
- `groups/<id>/<arm>/judged-grade.json` records each judge's identity (model, provider, family, thinking, extensions, settings, isolation, a configuration hash, prompt hash and date), the family relation to the subject, its answers with evidence, errors and usage; the combined answer per dimension with every vote, by the group's `combine`; what was shown and withheld; the run file's hash; and `contractGaps` (`calibration not checked` until every judge is calibrated, `materials truncated` when anything was cut). `groups/<id>/judging/<hash>/judge-<n>/` keeps each judge's prompt, events, final response and stderr;
- a judge that fails or replies malformed makes the grade `judge-error` with no combined answers, and the command exits nonzero;
- an aggregate target judges every trial, then rebuilds the aggregate: its sections, and its decision and claim when the suite declares a decision rule, so a `judged` measure is decided on the new answers.

`review <target> --calibrate <labels.json>` scores judges against hand labels. The file maps run paths (an arm's directory or its `run.json`, from the working directory) to `{ "<dimension id>": <answer> }`. Each judge configuration's agreement with the labels, per dimension (the share matched and Cohen's kappa), becomes its `calibration` in every judged grade it gave under the labelled runs and the target, and judging again with the same configuration keeps it. A configuration is its model, thinking, host extensions and rubric; a different one is uncalibrated.

An aggregate's `judged` section gives, per arm and dimension, counts of each combined answer (`notJudged` for a trial that was not judged or failed), pass^k for yes/no dimensions, the mean for `0-2` dimensions, agreement between judges per dimension (Cohen's kappa for two, Krippendorff's alpha for more), the judges with their calibration, and `perTrial` values for a decision rule: `true` for yes, `false` for no, `null` for unknown, or the number. `view` shows judged evidence apart from deterministic grades.

Judged evidence never changes run or deterministic grade files.

When an unsupported operation changes the question, reject it or run a clearly separate direct comparison with explicit limits. Never invoke archived evaluators as a fallback.
