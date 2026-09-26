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

## Current Execution Boundary

`run` executes description and body groups. Unsupported group types are rejected before subject execution. Description groups allow no tools or `read`; body groups allow no tools or path-guarded `read`, `write`, and `edit`, the evaluator's `run_command` tool for declared commands, plus non-native custom tools supplied by a declared runtime extension bundle. Native `bash`, `powershell`, `grep`, `find`, and `ls` tools are unsupported.

A runtime profile selects the installed native Pi host, the `isolated` or `host` prompt mode, whether the variant uses an isolated persistent session directory, zero or more ordered extension bundles, and declarative environment sources. Literal values are non-secret configuration; only explicitly inherited parent variables are passed to the child without being persisted, alongside a small host-runtime baseline. Missing inherited variables invalidate the variant. Launch-control and loader keys are rejected from inherited values, and literal and inherited names must not overlap. For body runs, delivery remains `unavailable` until target setup succeeds; `natural-prompt` or `explicit-skill-command` records a prompt attempt. The evaluator launches the base guard first, its command tool when the group declares commands, declared extensions next, and, when a group declares context assertions, a final non-mutating observer last. The observer records both the effective `before_agent_start` system prompt and each provider-neutral `context` message projection; it does not replace or sanitize extension injections after the base guard has established evaluator-owned isolation.

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

## Persistence And States

Each selected run is persisted before its counterpart. Grade and group evidence are persisted before later groups.

Run states are `complete`, `invalid`, `infrastructure-failed`, `cancelled`, and `not-selected`. Group and batch states are `complete`, `partially-complete`, `invalid` where applicable, and `cancelled`.

- Failed deterministic checks are ordinary complete behavioral evidence and exit zero when no infrastructure/grade failure exists.
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

`--trials <n>` runs the selection as `n` independent complete invocations. Each trial is an ordinary result with its own ID. A separate aggregate under `.skill-eval/runs/<aggregate-id>/aggregate.json` lists the trials and, per group, counts pass, fail, and unavailable for every deterministic check and comparison, plus comparison transitions. `--max-cost` is shared across trials, and exhaustion stops starting further trials. `view <aggregate-id>` renders the counts; view an individual trial for its evidence.

## Advisory Review

`review` answers each group's `review_questions` with a separate reviewer model:

- only groups with review questions and two complete runs are reviewed;
- the reviewer sees the task turns, each run's responses, tool calls, and changed paths as Run A and Run B in random order, and never sees variant names or deterministic grades;
- it runs without tools, skills, extensions, context files, or session, with only the base process environment;
- `groups/<id>/semantic-grade.json` records the label mapping, prompt hash, answers mapped back to variants, and errors; `groups/<id>/review/` keeps the prompt, events, final response, and stderr;
- malformed or incomplete reviewer output becomes `review-error` with the raw response preserved.

A review is advisory. It never changes run or deterministic grade evidence, and rerunning it replaces only the previous advisory review.

When an unsupported operation changes the question, reject it or run a clearly separate direct comparison with explicit limits. Never invoke archived evaluators as a fallback.
