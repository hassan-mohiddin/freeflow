# Execution And Evidence

Read this when operating `run|view|review`, resolving paths, interpreting states, or reasoning about Pi execution, isolation, persistence, cancellation, and safeguards.

This reference is a contract: it states how the evaluator behaves. Rely on that behavior as written; its binding requirements on you restate [Evaluate Skill](../SKILL.md) Rules.

## Command And Path Contract

Run commands from the repository or fixture root that owns the definitions:

```text
node <evaluate-skill-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant baseline|candidate] [--trials <n>] [--max-cost <total>]
node <evaluate-skill-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant baseline|candidate]
node <evaluate-skill-directory>/scripts/skill-eval.mjs review <result-id-or-directory> --model <provider/model> [--group <id-or-position>] [--thinking <level>]
```

- The current working directory is the definition root and result root.
- The `run` target resolves from that directory.
- Suite group references resolve relative to the suite file.
- Fixture, skill, and context declarations resolve from the definition root.
- Results are stored under `<cwd>/.skill-eval/runs/<result-id>`.
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

With no selectors, `run` or `view` selects every suite group and both variants. `--group` is invalid for a direct group definition/result.

Before anything starts, `run` prints its plan: `Plan: <subjects> subjects (<groups>, <arms>, <trials>); models: <model (thinking)>`, plus the Freeflow refs it will build. On an interactive terminal it then asks `Start? [y/N]` unless `--yes` is given; any answer but yes starts nothing and exits nonzero. When either stdin or stdout is not a terminal, as in scripts and agents, it prints the plan and continues.

## Current Execution Boundary

`run` executes description and body groups. Unsupported group types are rejected before subject execution. Description groups allow no tools or `read`; body groups allow no tools or path-guarded `read`, `write`, and `edit`, the evaluator's `run_command` tool for declared commands, plus non-native custom tools supplied by a declared runtime extension bundle. Native `bash`, `powershell`, `grep`, `find`, and `ls` tools are unsupported.

A runtime profile selects the installed native Pi host, the `isolated` or `host` prompt mode, whether the variant uses an isolated persistent session directory, zero or more ordered extension bundles, and declarative environment sources. Literal values are non-secret configuration; only explicitly inherited parent variables are passed to the child without being persisted, alongside a small host-runtime baseline. Missing inherited variables invalidate the variant. Launch-control and loader keys are rejected from inherited values, and literal and inherited names must not overlap. For body runs, delivery remains `unavailable` until target setup succeeds; `natural-prompt` or `explicit-skill-command` records a prompt attempt. The evaluator launches the base guard first, its command tool when the group declares commands, the arm's Freeflow build when its configuration declares one, declared extensions next, and, when a group declares context assertions, a final non-mutating observer last. The observer records both the effective `before_agent_start` system prompt and each provider-neutral `context` message projection; it does not replace or sanitize extension injections after the base guard has established evaluator-owned isolation.

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

A run is canonical only when every working-tree input it reads (the definition files and any `extends` file, the fixture, runtime bundle resources, and the skills and context of working-tree subjects) is committed and unchanged in the definition root's Git repository: modified, untracked or ignored files all count as uncommitted. The run then records that commit in `summary.json` under `inputs` and on each working-tree source. Otherwise it is refused before anything starts, naming the uncommitted paths, unless `--dry-run` is given. A dry run is marked `dryRun: true` with its uncommitted inputs listed, and its aggregate supports no claim. Inputs outside any Git repository need `--dry-run` too. When a configuration declares `host.version`, the evaluator compares it with `pi --version` before anything starts, refuses a mismatch, and records the installed version as `hostVersion`.

Each host process, subject or reviewer, runs in its own isolation root (`isolation/` beside its evidence): `HOME`, `TMPDIR`, `TMP`, `TEMP`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `PI_CODING_AGENT_DIR` point inside it, so the user's home, temp files and Pi settings are not visible and two processes share nothing. Only the declared model's provider login is copied into the agent directory, from `SKILL_EVAL_CREDENTIALS_DIR`, else `PI_CODING_AGENT_DIR`, else `~/.pi/agent`, together with that provider's custom model entry when one exists. `run.json` records under `isolation` which entries were copied, never their values. An OAuth login with under 60 minutes left is refused before the process starts, because a refresh inside the copy would rotate the user's own token away. A provider with no stored login runs with nothing copied. Pi uses its defaults for every setting the definition does not declare.

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

Views can render a complete result, all baseline or candidate variants, one group, or one group/variant. Grade appears before selected run evidence. The displayed absolute result path anchors result-relative artifact and workspace paths.

Path cells escape literal backslashes before tab, carriage return, and newline. Variant views exclude expectation-owned errors from the other variant while retaining comparison, group, and system errors.

Use ordinary file tools for raw `run.json`, events, transcript, final response, stderr, workspace, definition, grade, context observations, and group artifacts. Views remove transport noise; they do not replace canonical evidence. Tool-call grades distinguish attempted, succeeded, failed, and not-called outcomes.

## Safeguards And Limits

Normal completion follows settlement. Path guards, no-progress detection, cancellation, process-tree cleanup, and very high emergency ceilings stop runaway or unsafe infrastructure. Subjects run until they settle, with no turn, token, output, or short time cap, because a guessed cap cuts off the behavior the evaluation is trying to observe.

`--max-cost <total>` is an explicit spend ceiling, not a subject cap. After each subject finishes, its host-reported `usage.cost.total` is added to the invocation's spend; once spend reaches the ceiling, no further subject starts and queued variants become `cancelled`. The subject already running completes, so spend can exceed the ceiling by one subject. The summary records `budget` with the ceiling, spend, and whether it was exhausted. A host that reports no cost never exhausts the ceiling.

## Trials

`--trials <n>` runs the selection as `n` independent complete invocations. Each trial is an ordinary result with its own ID. A separate aggregate under `.skill-eval/runs/<aggregate-id>/aggregate.json` lists the trials and, per group, counts pass, fail, and unavailable for every deterministic check and comparison, plus comparison transitions. A trial whose grade file cannot be read is counted in `unreadableGrades`; the other trials still aggregate. Grade errors are counted per group (`gradeErrors`), and run states per variant (`runStates`), so nothing that failed leaves the denominators silently. Each check also records `trials` and `passAll`, its pass^k: whether it passed in every one of the k trials that graded it. Each comparison records `pairs`, the per-trial outcomes: both pass, both fail, baseline only, candidate only, or incomplete. The aggregate's `claim` names the strongest claim the counts support, a rate on this suite at its k, and states that no "beats" claim is supported, because no suite declares a decision rule. `--max-cost` is shared across trials, and exhaustion stops starting further trials. `view <aggregate-id>` renders the counts, pass^k, pairs and claim; view an individual trial for its evidence.

## Advisory Review

`review` answers each group's `review_questions` with a separate reviewer model, a judge under Review Work's [Judge Contract](../../review-work/references/judge-contract.md):

- only groups with review questions and two complete runs are reviewed;
- the reviewer sees the task turns, the group's fixture files as shared task materials, and for each run its responses, tool calls, changed paths and the full text of every file it created or modified (each file up to 20,000 characters and the materials up to 60,000, with any cut stated), as Run A and Run B in random order;
- run workspaces, the group and run directories, the repository root and the user's home are replaced by neutral tokens, so absolute paths and the variant names inside them never reach it; it never sees deterministic grades;
- it runs without tools, skills, context files, or session, in its own isolation root, with extensions off except those named with `--extension`;
- `--swap` reviews again with Run A and Run B exchanged and records agreement per question; without it, the unchecked order is recorded as a contract gap;
- `groups/<id>/semantic-grade.json` records the judge's model, provider, family (approximated by provider), thinking, extensions and isolation; the subject's providers and the family relation (`same`, `different` or `unknown`); the label mapping, prompt hash, answers mapped back to variants, swap results, `contractGaps` (at least `calibration not checked`), and errors; `groups/<id>/review/` keeps the prompt, events, final response, and stderr;
- malformed or incomplete reviewer output becomes `review-error` with the raw response preserved.

A review is advisory. It never changes run or deterministic grade evidence, and rerunning it replaces only the previous advisory review.

When an unsupported operation changes the question, reject it or run a clearly separate direct comparison with explicit limits. Never invoke archived evaluators as a fallback.
