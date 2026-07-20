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

`skill-eval run` currently executes selected `description` and `body` groups with working-tree skill sources and no fixture or declared context.

Description groups support:

- a natural `input.prompt` for one-shot JSON-mode execution or ordered natural `input.turns` through one persistent RPC process;
- no tools or only `read`;
- exact target-read attribution and `skill-read` expectations.

Body groups support:

- `input.prompt` or ordered `input.turns` through one persistent RPC process;
- either no declared skill and a null target, or exactly one declared target skill;
- no tools or path-guarded `read`, `write`, and `edit`;
- explicit target delivery on the first declared turn only;
- exact before/after workspace file identities and created, modified, and deleted paths;
- fixed review questions that are rendered but never sent to the subject.

For a body variant with a target, the evaluator asks Pi for its registered commands, matches the exact snapshotted target `SKILL.md` path, and sends `/skill:<name> <first prompt>`. This uses Pi's native skill expansion without duplicating frontmatter parsing. A no-target baseline receives the unchanged first prompt. Previous and updated variants each explicitly load their own snapshot. Later declared turns are unchanged, and direct body delivery never counts as activation evidence.

The supported body response expectation is:

```json
{
  "id": "candidate-mentions-rollback",
  "kind": "response-text",
  "variant": "candidate",
  "expect": "contains",
  "value": "rollback",
  "turn": 2
}
```

`turn` is optional. When present, it must identify one declared prompt or turn. Without it, the check inspects the final response and records its observed turn. A failed response check leaves a completed subject run complete. A non-body use, out-of-range turn, or other invalid expectation shape produces a separate `grade-error` after run evidence is saved.

Every selected variant receives a fresh empty workspace and Pi process with ambient resources disabled. RPC sessions disable automatic retry and compaction, correlate every request, and wait for `agent_settled` before the next declared turn. The root guard replaces host system, append, and context instructions with evaluator-owned context; any guard extension error fails closed as infrastructure evidence before further prompts. Reads may access the workspace and declared skill snapshots; writes and edits may access only the workspace. Skill snapshots are copied into variant-owned resources and hash-checked before registration.

`skill-eval view` renders stored results by complete result, suite group ID or original one-based position, and variant. Description views include declared-turn responses and activation timing. Body views include delivery state, review questions, responses, tools used, workspace changes, and direct paths for canonical artifacts. Use ordinary file tools for raw evidence.

The command rejects fixtures, declared context, Git sources, multi-skill body environments, `bash`, end-to-end groups, and broader deterministic assertions before starting subjects. Cancellation persists queued selected variants as `cancelled` without starting additional Pi subjects.
