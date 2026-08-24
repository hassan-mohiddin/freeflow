# Evaluation Definition Schema

Read this when authoring or checking schema-version-1 group and suite JSON.

This file owns user-authored definition shapes. Read [execution and evidence](execution-and-evidence.md) for commands, path resolution, run states, persistence, views, isolation, and safeguards.

## Definition Root

Run `skill-eval` from the repository or fixture root that owns the evaluation inputs.

| Input | Resolves from |
| --- | --- |
| `run <suite-or-group-path>` | current working directory |
| suite `groups` entries | directory containing the suite file |
| group `fixture` | definition root/current working directory |
| environment `skills` and `context` | definition root/current working directory, then the selected working tree or Git commit |

Definition files and declared paths are checked for lexical and canonical containment. Paths are slash-separated relative paths, not absolute paths.

## Common Group Shape

Every group contains exactly these fields, plus optional `model`:

```json
{
  "schema_version": 1,
  "kind": "group",
  "id": "one-behavioral-question",
  "type": "description",
  "input": { "prompt": "Natural task prompt." },
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
      "skills": ["skills/target"],
      "target": 0,
      "context": []
    }
  },
  "expectations": [],
  "review_questions": [],
  "model": {
    "model": "openai-codex/gpt-5.6-sol",
    "thinking": "low"
  }
}
```

Rules:

- `schema_version` is `1`.
- `kind` is `group`.
- `id` starts with a lowercase letter, contains lowercase letters, numbers, or single hyphens, and is at most 64 characters.
- `type` is `description`, `body`, or reserved `end-to-end`. The current runner rejects `end-to-end` before subject execution.
- `input` contains exactly one of:
  - `prompt`: one non-empty string;
  - `turns`: a non-empty ordered array of non-empty strings. Repeated natural turns are allowed.
- `fixture` is `null` or one contained relative directory/file path.
- `tools` is an ordered array with no duplicates.
- `variants` contains exactly `baseline` and `candidate`.
- `expectations` is an ordered array with unique expectation IDs.
- `review_questions` is an ordered string array. Questions are rendered for the reviewer and never sent to the subject.
- `model` is optional. `model.model` names the provider/model; optional `model.thinking` selects its thinking level. The CLI has no model override.
- `runtime` is optional. When omitted, the group runs under a plain `pi` host with no declared extensions. When present, it declares the host, ordered extension bundles, and string environment overrides.

## Description Group Example

A description group uses natural prompts and asks whether the exact target was read and when:

```json
{
  "schema_version": 1,
  "kind": "group",
  "id": "natural-activation",
  "type": "description",
  "input": {
    "turns": [
      "Help me inspect this ordinary change.",
      "Now prepare a deployment rollback."
    ]
  },
  "fixture": null,
  "tools": ["read"],
  "variants": {
    "baseline": {
      "source": { "kind": "git", "ref": "before-description-change" },
      "skills": ["skills/target"],
      "target": 0,
      "context": []
    },
    "candidate": {
      "source": { "kind": "working-tree" },
      "skills": ["skills/target"],
      "target": 0,
      "context": []
    }
  },
  "expectations": [
    {
      "id": "baseline-read-by-two",
      "kind": "skill-read",
      "variant": "baseline",
      "expect": "by-turn",
      "turn": 2,
      "comparison": "target-read-by-two"
    },
    {
      "id": "candidate-read-by-two",
      "kind": "skill-read",
      "variant": "candidate",
      "expect": "by-turn",
      "turn": 2,
      "comparison": "target-read-by-two"
    }
  ],
  "review_questions": []
}
```

For a description-only revision, the two target snapshots must keep body and resources byte-identical while changing only frontmatter description text.

Description groups allow no tools or only `read`. `skill-read` is their target-activation check.

## Body Group Example

A body group explicitly delivers each target on turn one and observes first-read or later-turn behavior:

```json
{
  "schema_version": 1,
  "kind": "group",
  "id": "retained-artifact-behavior",
  "type": "body",
  "input": {
    "turns": [
      "Inspect the task and prepare the work.",
      "Complete it and write result.json."
    ]
  },
  "fixture": "fixtures/task",
  "tools": ["read", "write", "edit"],
  "variants": {
    "baseline": {
      "source": { "kind": "git", "ref": "before-body-change" },
      "skills": ["skills/support", "skills/target"],
      "target": 1,
      "context": ["context/contract.md"]
    },
    "candidate": {
      "source": { "kind": "working-tree" },
      "skills": ["skills/support", "skills/target"],
      "target": 1,
      "context": ["context/contract.md"]
    }
  },
  "expectations": [
    {
      "id": "baseline-result",
      "kind": "path",
      "variant": "baseline",
      "path": "result.json",
      "turn": 2,
      "expect": "exists",
      "comparison": "result-exists"
    },
    {
      "id": "candidate-result",
      "kind": "path",
      "variant": "candidate",
      "path": "result.json",
      "turn": 2,
      "expect": "exists",
      "comparison": "result-exists"
    },
    {
      "id": "candidate-status",
      "kind": "json",
      "variant": "candidate",
      "path": "result.json",
      "turn": 2,
      "expect": "field-equals",
      "pointer": "/status",
      "value": "complete"
    },
    {
      "id": "candidate-changes",
      "kind": "changed-paths",
      "variant": "candidate",
      "turn": 2,
      "expect": "equals",
      "paths": ["result.json"]
    }
  ],
  "review_questions": [
    "Did the second turn apply the first-turn guidance without redelivery?"
  ]
}
```

Body groups allow built-in `read`, `write`, and `edit`, plus custom tools declared by a runtime extension bundle. A no-target baseline or runtime-only group may use `skills: []` and `target: null`; a candidate that declares skills must identify its target.

The examples are complete definition shapes. Replace fixture, resource, model, and Git-ref values with paths and identities that exist under your definition root.

## Runtime Profile

A runtime profile is shared by both baseline and candidate variants. It changes the host environment, not the skill target:

```json
{
  "runtime": {
    "host": "pi",
    "session": false,
    "extensions": [
      {
        "entry": "extensions/probe.mjs",
        "resources": ["extensions"]
      }
    ],
    "environment": {
      "literal": {
        "PROBE_MODE": "injection-test"
      },
      "inherit": []
    }
  }
}
```

`host` is `pi` or `piflow`; the evaluator maps it to the corresponding installed host command and records the selected host. `session` controls whether the variant receives an isolated persistent session directory; it defaults to `false` in omitted runtime profiles. A runtime may declare zero or more bundles. Each bundle has an entry file and one or more directory resources copied under their original relative paths, so sibling imports and multi-tree extensions remain intact. Bundle bytes are snapshotted once and copied identically to both variants.

`environment.literal` contains non-secret string configuration and is recorded in run evidence. `environment.inherit` names parent-process variables whose values are passed to the child but never persisted. Missing inherited variables invalidate the variant. Launch-control and secret-like literal keys are rejected.

Extensions are trusted executable inputs, not OS-sandboxed code. The evaluator proves declared identity and post-run immutability, but extension code retains its host permissions.

When a group declares `context-text` expectations, the evaluator loads its base isolation guard first, then declared bundles, then a non-mutating final observer. The observer records two per-turn surfaces: the chained `before_agent_start` system prompt and each provider-neutral `context` message projection. `context-text` expectations select `surface: "system-prompt"` or `surface: "provider-context"` and may select `request: "first"`, `"last"`, or a positive request number. Groups without context assertions do not create context-observation artifacts.

A custom tool name is allowed in `group.tools` only when the runtime declares an extension bundle. The evaluator remains extension-neutral: it does not interpret feature names or configuration schemas. Put feature configuration in the ordinary group fixture or runtime environment, and test combinations as separate suite groups.

## Variant Environment

Each environment has exactly:

```json
{
  "source": { "kind": "git", "ref": "v1.2.3" },
  "skills": ["skills/target", "skills/support"],
  "target": 0,
  "context": ["runtime/prompts/interaction-contract.md"]
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

A source applies only to declared skill and context paths in that variant. It never supplies the group fixture: `fixture` is snapshotted once from the definition-root working tree, then copied independently for selected variants. `skills` preserves registration order. `target` is `null` or a zero-based index into `skills`; the candidate target cannot be `null`. `context` preserves declaration order and may name UTF-8 files or directories.

## Expectations

Every expectation has:

- `id`: unique group-local ID using the group-ID syntax;
- `kind`: one supported deterministic kind;
- `variant`: `baseline` or `candidate`;
- optional `comparison`: shared by exactly one baseline and one candidate expectation describing the same expected check;
- optional body `turn`: one-based declared prompt/turn number.

Without `turn`, response checks use the final response and workspace checks use final state. Turn-scoped workspace checks cause an immutable workspace snapshot after each settled turn.

| `kind` | Kind-specific fields | `expect` |
| --- | --- | --- |
| `skill-read` | timing `turn` except for `never` | `never`, `on-turn`, `by-turn`, `not-before-turn` |
| `resource-read` | `resource`, optional `index`, `path`, optional body `turn` | `read`, `not-read` |
| `path` | workspace `path`, optional body `turn` | `exists`, `absent` |
| `changed-paths` | unique workspace `paths`, optional body `turn` | `equals`, `excludes` |
| `file-text` | workspace `path`, string `value`, optional body `turn` | `contains`, `not-contains`, `equals` |
| `json` | workspace `path`, optional body `turn`, conditional `pointer` and `value` | `available`, `missing`, `valid`, `malformed`, `field-present`, `field-absent`, `field-equals` |
| `response-text` | string `value`, optional body `turn` | `contains`, `not-contains`, `equals` |
| `tool-call` | string `tool`, optional body `turn`, optional `argumentContains`/`argumentNotContains` arrays | `called`, `succeeded`, `failed`, `not-called` |
| `context-text` | string `value`, optional `surface` (`system-prompt` or `provider-context`), optional body `turn` | `contains`, `not-contains`, `equals` |

### Resource paths

- `resource: "workspace"`: omit `index`; `path` is relative to the writable workspace.
- `resource: "skill"`: `index` selects the zero-based declared skill; `path` is relative to that skill directory.
- `resource: "context"`: `index` selects the zero-based declared context item; `path` is relative to that materialized item.

### Changed paths

- `equals`: the complete changed-file set must equal `paths`.
- `excludes`: none of `paths` may appear in the changed-file set.

Directory-only presence does not count as a changed file.

### JSON states

```json
[
  {
    "id": "file-missing",
    "kind": "json",
    "variant": "candidate",
    "path": "missing.json",
    "expect": "missing"
  },
  {
    "id": "file-malformed",
    "kind": "json",
    "variant": "candidate",
    "path": "broken.json",
    "expect": "malformed"
  },
  {
    "id": "field-absent",
    "kind": "json",
    "variant": "candidate",
    "path": "result.json",
    "expect": "field-absent",
    "pointer": "/optional"
  },
  {
    "id": "field-null",
    "kind": "json",
    "variant": "candidate",
    "path": "result.json",
    "expect": "field-equals",
    "pointer": "/value",
    "value": null
  }
]
```

A JSON Pointer is `""` for the complete value or begins with `/`; `~0` escapes `~` and `~1` escapes `/`.

### Comparison pair

Two expectations may share one comparison ID only when they have opposite variants and the same kind and expected predicate. The report records a factual transition such as `fail-to-pass`, never a quality verdict.

Definition loading validates common structure and unique IDs. Kind-specific expectation validation occurs during deterministic grading after run persistence. A malformed expectation therefore becomes separate `grade-error` evidence rather than changing the subject run. Use the documented shapes to avoid spending a subject run on an invalid check.

Definition-supplied commands and tests are unsupported.

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

A suite has only `schema_version`, `kind`, `id`, and ordered unique `groups`. Group references resolve from the suite directory; their resolved definition paths must remain inside the definition root. Referenced group IDs must also be unique.

## Selection

- With no selectors, every suite group and both variants are selected.
- `--group <id>` selects one stable group ID.
- `--group <position>` selects one one-based suite position.
- `--variant baseline|candidate` applies across selected groups.
- Excluded variants are `not-selected`, never failed.
- `--group` is invalid for a direct group definition.

Selection changes execution scope only. It does not modify the saved definitions.
