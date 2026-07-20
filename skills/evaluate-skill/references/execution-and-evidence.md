# Execution And Evidence

Read this when operating `run|view`, resolving paths, interpreting states, or reasoning about Pi execution, isolation, persistence, cancellation, and safeguards.

## Command And Path Contract

Run commands from the repository or fixture root that owns the definitions:

```text
node <evaluate-skill-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant baseline|candidate]
node <evaluate-skill-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant baseline|candidate]
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

`run` executes description and body groups. `end-to-end` is a reserved definition type and is rejected before subject execution. Description groups allow no tools or `read`; body groups allow no tools or path-guarded `read`, `write`, and `edit`. `bash` and definition-supplied commands are unsupported.

Use fresh JSON-mode execution for one-shot descriptions. Use one persistent RPC process per selected variant for ordered description turns and all body groups. RPC correlates responses, waits for `agent_settled`, disables automatic retry and compaction, preserves directly observed partial-turn evidence, and cleans the process tree.

A body target is matched to the exact snapshotted `SKILL.md` and explicitly delivered on turn one. Later turns remain unchanged. Description groups use natural prompts and never explicit target delivery.

## Isolation And Resources

For each selected variant:

- snapshot exact declared skills and context;
- snapshot the group fixture once from the definition-root working tree—never from a variant Git source—then create an independent writable copy;
- preserve skill order and target index;
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

Use ordinary file tools for raw `run.json`, events, transcript, final response, stderr, workspace, definition, grade, and group artifacts. Views remove transport noise; they do not replace canonical evidence.

## Safeguards And Limits

Normal completion follows settlement. Path guards, no-progress detection, cancellation, process-tree cleanup, and very high emergency ceilings stop runaway or unsafe infrastructure. Do not impose ordinary guessed turn, token, spend, output, or short time caps.

When an unsupported operation changes the question, reject it or run a clearly separate direct comparison with explicit limits. Never invoke archived evaluators as a fallback.
