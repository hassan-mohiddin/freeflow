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

`skill-eval run` currently executes selected `description` groups that use:

- a natural `input.prompt` for one-shot execution or ordered natural `input.turns` for persistent multi-turn execution;
- working-tree skill sources;
- no fixture or declared context;
- no tools or only the `read` tool.

The command rejects other structurally accepted group shapes before creating a
result or starting Pi. Each selected variant receives a fresh empty workspace and
a fresh Pi process with ambient resources disabled. One-shot groups use JSON
mode. Multi-turn groups use one RPC process per variant, disable automatic retry
and compaction, send each declared turn only after the previous turn emits
`agent_settled`, and preserve correlated responses plus per-turn evidence. The
root guard replaces host system, append, and context instructions with
evaluator-owned context built only from declared tools and skills. Each
working-tree skill is
copied into a variant-owned snapshot and its file hashes are checked before that
snapshot is registered with repeated `--skill`. The natural prompt is passed
unchanged and never uses `/skill:name`.

The supported deterministic activation expectation is:

```json
{
  "id": "candidate-read",
  "kind": "skill-read",
  "variant": "candidate",
  "expect": "by-turn",
  "turn": 1
}
```

`variant` is `baseline` or `candidate`. `expect` is `never`, `on-turn`,
`by-turn`, or `not-before-turn`; turn-based forms require a positive integer
`turn`. One-shot reads occur on turn 1. Multi-turn runs record the first and all
declared turns containing an exact successful target read. Other preserved
expectation kinds currently produce a separate `grade-error` after subject
evidence has been saved.

`skill-eval view` renders stored results by complete result, suite group ID or
original one-based position, and variant. Multi-turn views include the shared
ordered prompts and each selected variant's settled turn responses and target-read
markers. It lists direct canonical paths for the
run, events, transcript, final response, stderr, definition, and deterministic
grade; use ordinary file tools for raw evidence. Cancellation persists queued
selected variants as `cancelled` without starting additional Pi subjects.
