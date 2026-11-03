# Authoring Definitions

This reference is a contract: the shapes and constraints below are binding as written, for schema-version-2 group, suite, and configuration JSON. The loader checks them: it refuses a definition that breaks one when it loads, before any subject runs, by `run` and `check-tasks` alike, and the refusal names the group, its file and the field. Run `skill-eval check-tasks <path>`, which calls no model, after writing a definition and fix what it names; field rules it checks appear below as a pointer, and what stays is what its errors cannot teach: meanings, defaults and choices. Only an expectation of an unknown kind loads and surfaces afterward, as `grade-error` evidence.

Mode-specific fields are with their mode's guidance: [coding tasks](coding-tasks.md) (command graders, reference solutions, declared commands, shell, container, network, and the Claude Code host) and [conversations, pipelines and judges](conversations-pipelines-judges.md) (participants, rubric and judges, runtime profile). Commands, path resolution, run states, persistence, views, isolation, and safeguards are in [running and evidence](running-and-evidence.md).

## Definition Root

Run `skill-eval` from the repository or fixture root that owns the evaluation inputs.

| Input | Resolves from |
| --- | --- |
| `run <suite-or-group-path>` | current working directory |
| suite `groups` entries | directory containing the suite file |
| group `fixture` | definition root/current working directory |
| `configuration.extends` | directory containing the group file |
| subject `skills` and `context` | definition root/current working directory, then the selected working tree or Git commit |

Paths are relative and stay inside the root; the loader checks both.

## Common Group Shape

A group is a **task** (what the agent is asked to do and how it is graded) and a **configuration** (the agent environment that does it). Two or more named arms, usually `baseline` and `candidate`, each overlay the shared configuration, and `component` names the only places where an arm may differ from the reference arm; a group with one arm measures one setup and needs no `component`. Every group contains exactly these fields, plus optional `reference`, `commands` and `reference_solution` ([coding tasks](coding-tasks.md)), `revision`, `participants`, and the judged-evidence fields `rubric`, `judges` and `combine` ([conversations, pipelines and judges](conversations-pipelines-judges.md)):

```json
{
  "schema_version": 2,
  "kind": "group",
  "id": "one-behavioral-question",
  "type": "description",
  "input": { "prompt": "Natural task prompt." },
  "fixture": null,
  "tools": ["read"],
  "configuration": {
    "host": { "name": "pi" },
    "model": { "model": "xai/grok-4.7", "thinking": "low" },
    "subject": { "kind": "skill", "source": { "kind": "working-tree" }, "context": [] }
  },
  "arms": {
    "baseline": { "subject": { "skills": [], "target": null } },
    "candidate": { "subject": { "skills": ["skills/target"], "target": 0 } }
  },
  "component": ["subject.skills", "subject.target"],
  "expectations": [
    { "id": "baseline-read", "kind": "skill-read", "variant": "baseline", "expect": "by-turn", "turn": 1, "comparison": "target-read" },
    { "id": "candidate-read", "kind": "skill-read", "variant": "candidate", "expect": "by-turn", "turn": 1, "comparison": "target-read" }
  ],
  "review_questions": []
}
```

The loader checks every field above (`schema_version` 2, `kind`, the `id` pattern, `type`, exactly one of `input.prompt` and `input.turns`, a contained `fixture` directory, unique `tools` and expectation IDs, at least one expectation, review question or rubric dimension) and names the one it refuses. What it cannot teach:

- `input.turns` may repeat a natural turn. The `fixture` directory's contents become the workspace.
- `input.resume_before` lists turns (from 2) before which the subject's Pi session is closed and resumed from its own file (Pi's RPC `switch_session`, so extensions see `session_shutdown`, then `session_start` with reason `resume`), as a user resuming it would; it needs a body group on `pi` with `configuration.runtime.session: true` and no participants. Each resumed turn records `resumed.sessionFile` in `run.json`.
- `review_questions` are rendered for the reviewer and never sent to the subject. The reviewer sees every arm's run as Run A, Run B, Run C, ... in a random order, must answer every question for every label, and its answers are mapped back to arm names; `review --swap` repeats the review with the order reversed and records agreement per question, and per arm when the arms are not `baseline` and `candidate`.
- A group with only review questions has no deterministic checks; its evidence comes from the advisory review alone. A group with only a rubric is graded by its judges alone.
- `revision: "description-only"`, for a description group whose two arms both name a target: before any subject runs, the evaluator snapshots both targets and refuses the group as `invalid` unless every file other than `SKILL.md` is byte-identical and `SKILL.md` differs only in its frontmatter `description`.
- Tools: a description group takes none or `read` (`skill-read` is its activation check); a body group takes `read`, `write`, `edit`, `ls`, `find`, `grep`, `run_command` for [declared commands](coding-tasks.md#declared-commands), and custom tools from a runtime extension bundle; `bash` needs a [shell](coding-tasks.md#shell) or a [container](coding-tasks.md#container-environment).

## Configuration And Arms

A configuration has these fields; each arm's effective configuration is the shared `configuration` with that arm's overlay merged in:

| Field | Required in the effective configuration | Meaning |
| --- | --- | --- |
| `host` | yes | `pi` or `claude-code`, with optional `version`, `extensions` and `settings`; see [Host Extensions And Settings](#host-extensions-and-settings) and [the Claude Code host](coding-tasks.md#claude-code-host). |
| `subject` | yes | What is under test: a `skill` (see [Subject](#subject)), or `none` when the comparison is about the environment, not a skill. |
| `model` | no | `model` names the provider/model; optional `thinking` selects its thinking level. The CLI has no model override, and a subject run without a model gets Pi's default and no copied login. |
| `runtime` | no | Host session, prompt mode, extension bundles and environment; see [Runtime Profile](conversations-pipelines-judges.md#runtime-profile). |
| `shell` | no | A confined `bash` for the subject; see [Shell](coding-tasks.md#shell). |
| `environment` | no | A container the subject's shell and the command graders run in; see [Container Environment](coding-tasks.md#container-environment). |
| `network` | no | What code the subject could have written may reach: `"none"` (sealed) or `"host"`; see [Network](coding-tasks.md#network). |
| `participants` | no | More than one participant in each arm: a conversation with a simulated user, or a pipeline of stages; shared, or different per arm when `component` names it; see [Participants](conversations-pipelines-judges.md#participants). |
| `freeflow` | no | Contributor-only (needs a Freeflow repository as the definition root): Freeflow as part of the environment; see [Freeflow](#freeflow). |

The loader checks each field's shape (host names, the arm-name pattern, `reference`, `component`, `extends`) and names the one it refuses. What it cannot teach:

- `configuration.extends` names a configuration file, relative to the group file; its configuration is merged first, then the group's own fields.
- Each arm overlays the shared configuration: objects merge key by key; an array, scalar, or `null` replaces the shared value.
- `reference` names the arm the others are compared with; it defaults to `baseline`. Evidence, views and the aggregate list the reference first, then the other arms in declaration order.
- `component` lists dot paths into the configuration, such as `subject.source` or `model.thinking`: the only places an arm may differ from the reference, compared leaf by leaf (an array is one leaf). The loader refuses an arm that differs elsewhere, and a `component` path no arm differs in. `component: []` declares an A/A comparison (or A/A/A): every arm identical, which measures run-to-run variation.
- **One arm** measures one setup: it is its own reference, with no `component` and no `comparison`. Checks, pass^k, metrics, judged scores (`review --rubric`), reference solutions and command graders work as usual; the aggregate's claim is a rate on the suite, and a suite `decision` or a pairwise `review` refuses it. Two or more arms need `component`.
- `host.name`, `host.version` and `runtime` are the same in every arm, except `runtime.environment.literal` (see [Runtime Profile](conversations-pipelines-judges.md#runtime-profile)); `host.extensions`, `host.settings`, `shell`, `environment` and `freeflow` may differ, as the component under test.

A group with exactly `baseline` and `candidate`, and `baseline` as the reference, keeps the evidence shapes it always had. Any other group records comparisons, transitions and pairs keyed by arm name. An A/A/B group, where `same` repeats the reference and `changed` adds the skill:

```json
{
  "arms": {
    "baseline": {},
    "same": {},
    "changed": { "subject": { "skills": ["skills/target"], "target": 0 } }
  },
  "component": ["subject.skills", "subject.target"]
}
```

## Body Group Example

A body group explicitly delivers each target on turn one and observes first-read or later-turn behavior:

```json
{
  "schema_version": 2,
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
  "configuration": {
    "host": { "name": "pi" },
    "model": { "model": "xai/grok-4.7", "thinking": "medium" },
    "subject": {
      "kind": "skill",
      "skills": ["skills/support", "skills/target"],
      "target": 1,
      "context": ["context/contract.md"]
    }
  },
  "arms": {
    "baseline": { "subject": { "source": { "kind": "git", "ref": "before-body-change" } } },
    "candidate": { "subject": { "source": { "kind": "working-tree" } } }
  },
  "component": ["subject.source"],
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

The examples are complete definition shapes. Replace fixture, resource, model, and Git-ref values with paths and identities that exist under your definition root.

## Host Extensions And Settings

```json
{
  "host": {
    "name": "pi",
    "extensions": [{ "package": "@gotgenes/pi-anthropic-auth", "version": "3.4.2" }],
    "settings": { "retry": { "enabled": false }, "compaction": { "enabled": true } }
  }
}
```

- `extensions` lists Pi packages by exact name and version, found among the user's installed Pi packages (`<Pi agent directory>/npm/node_modules`). They load right after the evaluator's guard, in order, and are recorded under `resources.hostExtensions`. Extensions can change what the host sends (an auth extension may reshape the system prompt), so they belong to the configuration, and arms that differ in them must declare it in `component`.
- `settings` is any object of Pi settings. It becomes the subject's `settings.json` in its isolated agent directory, merged over the evaluator's two defaults: `retry.enabled` and `compaction.enabled` are `false` unless declared, so a provider error or a compaction never happens silently inside a measured run. Any other setting it does not name takes Pi's default; the user's own settings never apply. `run.json` records the effective settings under `isolation.settings`, and body runs send the same retry and compaction values to Pi over RPC. Extensions load only from `extensions`.
- An extension can also be built from source, so arms can compare versions of an extension under development:

  ```json
  {
    "extensions": [
      { "source": { "kind": "git", "ref": "3f2a9c1", "path": "packages/my-extension" }, "build": ["npm", "run", "build"], "entry": "dist/index.js" },
      { "path": "extensions/local-probe", "entry": "index.mjs" }
    ]
  }
  ```

  - `source` takes a directory (`path`, or `"."`) at an exact commit (a branch or tag is refused, because it moves) of the Git repository holding the definition root, extracted with `git archive`. `path` instead takes a directory under the definition root from the working tree, snapshotted, never used live.
  - Optional `build` runs once in the extracted copy, without a shell, in an isolated home, temp and Pi directory with no copied login, with a 10-minute timeout. A build that fails, times out or cannot start makes the group `invalid` before any subject runs.
  - `entry` is the file Pi loads, relative to the built directory.
  - Each distinct source and build is built once per group, under `resources/host-extensions/<n>/source` in the group directory. `resources.hostExtensions` records the source (with the resolved `commit` for a Git source), the entry, a `sha256` over the built directory's file list and contents, and the build's argv, exit code, duration and output tails.
- The advisory reviewer takes the same fields from a configuration file given with `review --configuration`.

## Subject

A `skill` subject:

```json
{
  "kind": "skill",
  "source": { "kind": "git", "ref": "v1.2.3" },
  "skills": ["skills/target", "skills/support"],
  "target": 0,
  "context": ["context/base-guidance.md"]
}
```

A `none` subject is `{ "kind": "none" }`. `source` is `{ "kind": "working-tree" }` or `{ "kind": "git", "ref": "<exact-ref>" }`.

A source applies only to declared skill and context paths in that arm. It never supplies the group fixture: `fixture` is snapshotted once from the definition-root working tree, then copied independently for selected variants. `skills` preserves registration order, and `target` is a zero-based index into it (a non-reference arm that declares skills names one). `context` preserves declaration order and may name files or directories.

## Expectations

Every expectation has an `id`, a `kind` from the table below, a `variant` (the arm it checks), an optional `comparison` (see [Comparison](#comparison)) and an optional one-based `turn`. The loader runs each kind's own grader check on the definition, so a field, value, arm or turn that grader would refuse is refused before any subject runs.

Without `turn`, response checks use the final response and workspace checks use final state. Turn-scoped workspace checks cause an immutable workspace snapshot after each settled turn.

| `kind` | Group type | Kind-specific fields | `expect` |
| --- | --- | --- | --- |
| `skill-read` | description | timing `turn` except for `never` | `never`, `on-turn`, `by-turn`, `not-before-turn` |
| `resource-read` | either | `resource`, optional `index`, `path`, optional `turn` | `read`, `not-read` |
| `path` | body | workspace `path`, optional `turn` | `exists`, `absent` |
| `changed-paths` | body | unique workspace `paths`, optional `turn` | `equals`, `excludes` |
| `file-text` | body | workspace `path`, string `value`, optional `turn`, optional `line` | `contains`, `not-contains`, `equals` |
| `json` | body | workspace `path`, optional `turn`, conditional `pointer` and `value` | `available`, `missing`, `valid`, `malformed`, `field-present`, `field-absent`, `field-equals` |
| `response-text` | body | string `value`, optional `turn` | `contains`, `not-contains`, `equals` |
| `tool-call` | body | string `tool`, optional `turn`, optional `argumentContains`/`argumentNotContains` arrays | `called`, `succeeded`, `failed`, `not-called` |
| `context-text` | body | string `value`, optional `surface` (`system-prompt`, the default, or `provider-context`), optional `request` (`first`, `last`, the default, or a positive request number within the turn), optional `turn` | `contains`, `not-contains`, `equals` |
| `command` | body | `argv`, optional `files`, optional `timeout_seconds`, `pass`; no `turn` | none; see [command graders](coding-tasks.md#command-graders) |

With `line` (1-based), a `file-text` expectation compares only that line, without its line ending. A line the file does not have fails every expectation, including `not-contains`, so an empty file cannot pass by having nothing to read. Use it to check one line, such as a review's first-line judgment, when the rest of the file may quote the same text.

For `tool-call` with `expect: "not-called"`, omitted argument filters require zero calls to the named tool. Supplied filters scope the absence check to calls matching those argument predicates.

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

### Comparison

A comparison ID joins one expectation per arm, all the same check. For each non-reference arm the report records a factual transition from the reference, such as `fail-to-pass`, never a quality verdict. A `baseline`/`candidate` group records it as `transition`; any other group records `reference`, each arm's check and state under `arms`, and each non-reference arm's transition under `transitions`.

## Suite

```json
{
  "schema_version": 2,
  "kind": "suite",
  "id": "workflow-core",
  "groups": [
    "groups/natural-activation.json",
    "groups/body-behavior.json"
  ]
}
```

A suite's `groups` run in order and resolve from the suite's directory; `decision` is optional. The loader checks the rest.

### Decision

A suite may declare the rule its trials are judged by, before any run. Without one, an aggregate supports only a rate on the suite. A direct group run is one case and never yields "beats".

```json
"decision": {
  "measure": { "comparison": "target-read" },
  "arms": ["baseline", "candidate"],
  "direction": "higher",
  "method": "sign-test",
  "alpha": 0.05,
  "min_cases": 10,
  "trials": { "initial": 3, "max": 9, "step": 3 }
}
```

- `measure` names exactly one of: `comparison`, a comparison ID from the groups' expectations (a pass counts 1, a fail 0); `metric`, a name in the aggregate's `metrics` section; `judged`, a dimension ID in its `judged` section; or `score`, the comparison ID of test-graded command expectations, read from the `scores` section (an expectation's own ID scores its one arm only). Section values are read from `perTrial` (`true` counts 1, `false` 0, numbers as given). Null and unavailable values are excluded and counted.
- `arms` names two arms, the reference first; every group needs both, and `--variant` is refused. The loader refuses a measure a group records in one decision arm only, or that no group records in both; a group that records it in neither arm, such as a control case, loads, and its case is excluded and counted.
- `direction`: whether `higher` or `lower` is better.
- `method` defaults to `sign-test`, `alpha` to 0.05, and `min_cases` to 10.
- The unit is the case. Each arm's values over a case's trials are averaged, and the second arm is better, worse or equal. An exact two-sided sign test over the better and worse cases (ties and excluded cases are counted, not tested) gives the verdict that [design and measurement](design-and-measurement.md#fix-the-decision-rule-first) defines, with `min_cases` as the minimum and `alpha` as the level.
- A suite with a decision always runs as trials and records an aggregate. `trials` is optional: without it, `--trials` sets the count (default 1). After `initial` trials, each case whose sign is not yet stable (the arms tie, or differ by less than one trial's worth: the observed range divided by the fewer values) runs up to `step` more trials of that group alone, until `max`. A case with an arm that has no usable value is not extended.

What the aggregate records for a decision is in [running and evidence](running-and-evidence.md#trials).

## Selection

`--group <id | position>` and `--variant <arm>` narrow what runs (`skill-eval --help`); with neither, every group and arm runs. Excluded arms are `not-selected`, never failed, and the saved definitions do not change.

## Freeflow

For Freeflow contributors only: this field builds Freeflow itself with `scripts/freeflow-snapshot.mjs`, so it works only when the definition root is a Freeflow repository; elsewhere the group is refused before any subject runs. To compare a host extension, declare it under `host.extensions`.

A configuration with `freeflow` runs the subject with Freeflow loaded, built from an exact commit:

```json
{
  "configuration": {
    "host": { "name": "pi" },
    "model": { "model": "xai/grok-4.7", "thinking": "medium" },
    "subject": { "kind": "none" },
    "runtime": { "prompt": "host" },
    "freeflow": {
      "source": { "kind": "git", "ref": "<commit>" },
      "repository": { "messaging": { "enabled": false } },
      "personal": {}
    }
  },
  "arms": {
    "baseline": {},
    "candidate": { "freeflow": { "repository": { "messaging": { "enabled": true } } } }
  },
  "component": ["freeflow.repository.messaging.enabled"]
}
```

- `source` is a Git commit; the package is built from that commit with the definition root's `scripts/freeflow-snapshot.mjs`, once per distinct ref per group, into the group's `resources/freeflow/`. The user's development snapshot is never used or changed.
- `repository` is written to the workspace's `.freeflow/config.json` and `personal`, when not empty, to `.freeflow/local.json`, before the workspace's starting state is taken, so neither counts as a subject change. Both default to `{}`, and that build's own validator checks them.
- `runtime.prompt` is `host`, because the isolated prompt replaces the host's system prompt, which would remove Freeflow's own instructions.
- Freeflow's extension loads right after the evaluator's guard, the package directory is readable by the subject, and Freeflow may register custom tools that `tools` then names.
- `run.json` records the ref, resolved commit, package name and version, tarball hash, and the settings under `resources.freeflow`.
