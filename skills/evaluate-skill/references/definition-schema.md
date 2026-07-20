# Evaluation Definition Schema

Use JSON definitions with `schema_version: 1`.

Paths are relative to the definition root. Suite group references are relative to the suite file. Definition files are checked lexically and canonically when loaded. Declared fixture, skill, and context paths must be contained relative paths and are checked canonically when materialized from their selected source.

## Group

```json
{
  "schema_version": 1,
  "kind": "group",
  "id": "natural-activation",
  "type": "description",
  "input": {
    "prompt": "Help choose the correct workflow for this change."
  },
  "fixture": null,
  "tools": ["read"],
  "variants": {
    "baseline": {
      "source": { "kind": "working-tree" },
      "skills": [],
      "target": null,
      "context": []
    },
    "candidate": {
      "source": { "kind": "working-tree" },
      "skills": ["skills/workflow"],
      "target": 0,
      "context": []
    }
  },
  "expectations": [
    {
      "id": "candidate-read",
      "kind": "skill-read",
      "variant": "candidate",
      "expect": "by-turn",
      "turn": 1
    }
  ],
  "review_questions": []
}
```

Rules:

- `id` starts with a lowercase letter and contains lowercase letters, numbers, or single hyphens. Maximum length is 64.
- `type` is `description`, `body`, or `end-to-end`.
- `input` contains exactly one of:
  - `prompt`: one non-empty string;
  - `turns`: a non-empty ordered string array; repeated natural turns are preserved.
- `fixture` is `null` or one contained relative path.
- `tools` is an ordered array of unique tool names.
- `variants` contains exactly `baseline` and `candidate`.
- `expectations` is an ordered array. Every expectation has a unique `id` and a `kind`; kind-specific fields are preserved for the deterministic grader.
- `review_questions` is an ordered string array. It creates no automatic semantic grader.
- `model` is optional and has `model` plus optional `thinking` strings.

## Environment

Each variant environment contains:

```json
{
  "source": { "kind": "git", "ref": "v1.2.3" },
  "skills": ["skills/target", "skills/support"],
  "target": 0,
  "context": ["runtime/interaction-contract.md"]
}
```

`source` is either:

```json
{ "kind": "working-tree" }
```

or:

```json
{ "kind": "git", "ref": "<exact-ref>" }
```

`skills` is the exact ordered skill list. `target` is `null` when the variant has no target skill, otherwise it is the zero-based index of the target in `skills`. The candidate must identify a target. `context` lists explicit non-skill context; ambient context is not composition.

## Suite

```json
{
  "schema_version": 1,
  "kind": "suite",
  "id": "workflow-core",
  "groups": [
    "groups/natural-activation.json",
    "groups/body-behavior.json"
  ]
}
```

A suite contains only an ID and ordered, unique group references. Referenced group IDs must also be unique. It contains no embedded group bodies or execution progress.

## Selection

- No selector selects every suite group and both variants.
- `--group <id>` selects one stable group ID.
- `--group <position>` uses a one-based suite position.
- `--variant baseline|candidate` applies across every selected group.
- A variant excluded by selection is `not-selected`, never failed.
- `--group` is invalid with a direct group definition.

Definition loading and selection are structural. They do not start Pi, create
fixtures, grade evidence, or render results.

## Current Execution Boundary

`skill-eval run` executes selected `description` and `body` groups with optional fixtures, working-tree or Git-backed resources, ordered multi-skill environments, and declared context.

Environment materialization:

- a group fixture is snapshotted once from the working tree, then copied into each selected variant's fresh writable workspace;
- `working-tree` sources snapshot each declared skill and context path from the definition root;
- `git` sources resolve `ref` to one commit and materialize each declared skill and context path from that commit without display-oriented path parsing;
- skill order is preserved through snapshot evidence and repeated Pi `--skill` registration;
- the target remains the declared zero-based index, so a body group can explicitly deliver one target while other declared skills remain available;
- declared context may be one UTF-8 text file or a directory of UTF-8 text files; declaration order and deterministic file order are preserved in an evaluator-owned system-prompt manifest;
- resource declarations, source identity, materialized paths and hashes, context delivery, successful reads, responses, tools, and workspace effects remain separate evidence.

Lexical and canonical containment apply to fixtures, skills, and context. Resource symlink escapes, dangling links, unsupported Git entries, missing `SKILL.md`, invalid UTF-8 context, ambiguous target command registration, and source changes during snapshotting fail closed before trustworthy prompting. Skill/context snapshots and the context-delivery manifest are fingerprinted again after subject execution; mutation becomes infrastructure evidence without erasing the run. Git evidence records both the declared ref and resolved commit. Writable fixture copies are never shared between variants.

Description groups support:

- a natural `input.prompt` for one-shot JSON-mode execution or ordered natural `input.turns` through one persistent RPC process;
- no tools or only `read`;
- exact target-read attribution and `skill-read` expectations.

Body groups support:

- `input.prompt` or ordered `input.turns` through one persistent RPC process;
- no target or one target selected from an exact ordered skill list;
- no tools or path-guarded `read`, `write`, and `edit`;
- explicit target delivery on the first declared turn only;
- exact before/after workspace file identities and created, modified, and deleted paths;
- fixed review questions that are rendered but never sent to the subject.

For a body variant with a target, the evaluator asks Pi for its registered commands, matches the exact snapshotted target `SKILL.md` path, and sends `/skill:<name> <first prompt>`. This uses Pi's native skill expansion without duplicating frontmatter parsing. A no-target baseline receives the unchanged first prompt. Previous and updated variants each explicitly load their own snapshot. Later declared turns are unchanged, and direct body delivery never counts as activation evidence.

## Deterministic Expectations

Every expectation has `id`, `kind`, and `variant`. Body checks may add `turn`; it is one-based and must identify a declared prompt or turn. Without `turn`, a response check uses the final response and a workspace check uses final state. When a group declares turn-scoped workspace checks, the body run preserves an immutable workspace snapshot after every settled turn so intermediate state remains gradeable even when a later turn changes or reverts it.

The supported kinds are:

| `kind` | Required fields | Supported `expect` values |
| --- | --- | --- |
| `skill-read` | description `variant`; a valid declared `turn` for every timing predicate | `never`, `on-turn`, `by-turn`, `not-before-turn` |
| `resource-read` | `resource`: `workspace`, `skill`, or `context`; zero-based `index` for skill/context; contained `path`; optional `turn` | `read`, `not-read` |
| `path` | contained workspace `path`; optional `turn` | `exists`, `absent` |
| `changed-paths` | unique contained `paths`; optional `turn` | `equals`, `excludes` |
| `file-text` | contained workspace `path`; string `value`; optional `turn` | `contains`, `not-contains`, `equals` |
| `json` | contained workspace `path`; optional `turn`; JSON Pointer `pointer` for field checks; `value` for `field-equals` | `available`, `missing`, `valid`, `malformed`, `field-present`, `field-absent`, `field-equals` |
| `response-text` | string `value`; optional `turn` | `contains`, `not-contains`, `equals` |

`never` has no `turn`. `on-turn`, `by-turn`, and `not-before-turn` require a one-based turn inside the declared prompt/turn count; malformed timing scopes produce `grade-error`, never behavioral pass/fail.

A `path` check observes typed files, contained symlinks, and directories, including empty directories. Directory entries are preserved in final and requested turn snapshots without turning directory-only presence into a changed-file result.

A JSON Pointer is `""` for the complete value or begins with `/`; `~0` and `~1` escape `~` and `/`. JSON observations separately record file presence, parse success, field presence, and value. Therefore a missing file, malformed JSON, absent field, present `null`, and another value cannot collapse into the same result.

Definition-supplied commands and tests are not a supported deterministic expectation. `skill-eval` exposes no command-execution approval flag. Any future command-outcome mechanism requires a separate accepted design with an explicit trust anchor, isolation boundary, failure unit, portability contract, and evidence cost.

Two expectations may add the same `comparison` ID when they describe the same predicate once for baseline and once for candidate. The grade records each check ID/state and a factual transition such as `fail-to-pass`, `pass-to-fail`, or `unavailable`. It assigns no quality or readiness meaning.

A failed check leaves a completed subject run complete. When every valid check lacks required run evidence, the report is `unavailable`. A malformed kind-specific shape, invalid turn, mismatched comparison pair, or grading integrity failure produces a separate `grade-error` after run evidence is saved.

Every selected variant receives a fresh fixture-backed or empty workspace and Pi process with ambient resources disabled. RPC sessions disable automatic retry and compaction, correlate every request, and wait for `agent_settled` before the next declared turn. The root guard replaces host system, append, and context instructions with evaluator-owned context containing only declared tools, skills, and exact declared context. Any guard extension error fails closed as infrastructure evidence before further prompts. Reads may access the workspace and declared skill/context snapshots; writes and edits may access only the workspace.

`skill-eval view` renders stored results by complete result, suite group ID or original one-based position, and variant. Description views include declared-turn responses and activation timing. Body views include explicit-delivery state, review questions, responses, tools used, workspace changes, and direct paths for canonical artifacts. Use ordinary file tools for raw evidence.

Subject execution still rejects `bash` and end-to-end evaluation. Cancellation persists queued selected variants as `cancelled` without starting additional Pi subjects.
