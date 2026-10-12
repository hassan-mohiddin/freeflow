# Evaluation Definition Schema

Read this when authoring or checking schema-version-2 group, suite, and configuration JSON. Schema 1 definitions are not loaded; rewrite them in the shape below.

This reference is a contract: the shapes and constraints below are binding as written. Structural violations are rejected before any subject runs, including an expectation field its kind does not define and a group with no expectations and no review questions. An expectation of an unknown kind, or with invalid values for its fields, surfaces afterward as `grade-error` evidence.

This file owns user-authored definition shapes. Read [execution and evidence](execution-and-evidence.md) for commands, path resolution, run states, persistence, views, isolation, and safeguards.

## Definition Root

Run `skill-eval` from the repository or fixture root that owns the evaluation inputs.

| Input | Resolves from |
| --- | --- |
| `run <suite-or-group-path>` | current working directory |
| suite `groups` entries | directory containing the suite file |
| group `fixture` | definition root/current working directory |
| `configuration.extends` | directory containing the group file |
| subject `skills` and `context` | definition root/current working directory, then the selected working tree or Git commit |

Definition files and declared paths are checked for lexical and canonical containment. Paths are slash-separated relative paths, not absolute paths.

## Common Group Shape

A group is a **task** (what the agent is asked to do and how it is graded) and a **configuration** (the agent environment that does it). Two or more named arms, usually `baseline` and `candidate`, each overlay the shared configuration, and `component` names the only places where an arm may differ from the reference arm; a group with one arm measures one setup and needs no `component`. Every group contains exactly these fields, plus optional `reference`, `commands`, `revision`, `reference_solution`, `participants` ([Participants](#participants)), and the judged-evidence fields `rubric`, `judges` and `combine` ([Rubric And Judges](#rubric-and-judges)):

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
  "expectations": [],
  "review_questions": []
}
```

Rules:

- `schema_version` is `2`.
- `kind` is `group`.
- `id` starts with a lowercase letter, contains lowercase letters, numbers, or single hyphens, and is at most 64 characters.
- `type` is `description` or `body`.
- `input` contains exactly one of:
  - `prompt`: one non-empty string;
  - `turns`: a non-empty ordered array of non-empty strings. Repeated natural turns are allowed.
- `fixture` is `null` or one contained relative directory path. The directory's contents become the workspace.
- `tools` is an ordered array with no duplicates.
- `configuration`, `arms`, `reference` and `component` follow [Configuration And Arms](#configuration-and-arms).
- `expectations` is an ordered array with unique expectation IDs.
- `review_questions` is an ordered string array. Questions are rendered for the reviewer and never sent to the subject. The reviewer sees every arm's run as Run A, Run B, Run C, ... in a random order, must answer every question for every label, and its answers are mapped back to arm names; `review --swap` repeats the review with the order reversed and records agreement per question, and per arm when the arms are not `baseline` and `candidate`.
- A group declares at least one expectation, review question, or rubric dimension. A group with only review questions has no deterministic checks; its evidence comes from the advisory review alone. A group with only a rubric is graded by its judges alone.
- `revision` is optional and, when present, is `description-only`. It is valid only for a description group with exactly two arms that both name a target skill. Before any subject runs, the evaluator snapshots both targets and refuses the group as `invalid` unless every file other than `SKILL.md` is byte-identical and `SKILL.md` differs only in its frontmatter `description`.
- `commands` is optional and only for body groups that list the `run_command` tool. See [Declared Commands](#declared-commands).

## Rubric And Judges

A rubric asks what deterministic checks cannot. Each run is judged alone, blind to its arm, by `review --rubric` (see [Execution And Evidence](execution-and-evidence.md#judged-evidence)); the answers are judged evidence, stored beside the run and never in run or deterministic grade files.

```json
{
  "rubric": [
    {
      "id": "found-defect",
      "question": "Did the review name the off-by-one in the pagination loop?",
      "reference": { "path": "references/known-defect.md" }
    },
    { "id": "clarity", "question": "How actionable is the review?", "answers": "0-2" }
  ],
  "judges": [{ "model": "anthropic/claude-haiku-5-5", "thinking": "high" }],
  "combine": "majority"
}
```

- `rubric` is a non-empty array of dimensions with unique `id`s (the group ID pattern) and a non-empty `question`. Dimensions are rendered only for judges and never sent to the subject.
- `answers` is `["yes", "no", "unknown"]` (the default) or `"0-2"`. A judge may always answer `unknown`, and must cite the evidence for every answer.
- `reference` is optional: inline text, or `{ "path": "<relative path>" }` to a file inside the definition root. It is shown to judges only. A path inside the fixture is refused, because the subject sees the fixture; keep the file out of the subject's declared `context` too, which the evaluator does not check. A file's text and hash are read in when the definition loads, so judging never depends on the working tree, and the file is a run input that must be committed like the definition.
- Dimensions have no weights: each is counted and decided on its own, and a dimension that declares `weight` is refused.
- `judges` is optional: one or more `{ model, thinking?, configuration? }`, each configuration once, because repeated calls to one configuration are one vote. Without `judges`, `review --rubric --model` names the single judge.
- A judge runs on its group's host setup by default: the reference arm's `host.extensions` and `host.settings` (such as a subscription's auth extension), with its own model and thinking. `configuration` gives it its own setup instead, inline (`{ "host": { "name": "pi", "extensions": [...], "settings": {...} }, "model": {...} }`) or as `{ "extends": "<configuration file, relative to the group file>" }`; its extensions must be installed packages, a model it names is used when the judge entry names none, and an extended file is a run input. A group whose host extensions are built from source must give its judges their own configuration.
- `combine` names how several judges' answers become one, before any verdict is seen; it is required with more than one judge. Taking yes as 1 and no as 0: `majority` gives the answer more than half the judges gave (otherwise `unknown`); `unanimous` gives the lowest answer, so yes only when every judge says yes; `any` gives the highest, so yes when any judge does; `mean` averages the known answers and needs every dimension to be `"0-2"`. An `unknown` answer makes the result `unknown` whenever it could change it.
- `judges` and `combine` need a `rubric`.

## Participants

A group may run more than one participant in each arm. `participants` declares a `protocol`; every participant uses the arm's configuration. Declare it on the group, shared by every arm, or in the configuration: shared in `configuration`, or per arm in an overlay, where arms may differ in it like any other path (`"component": ["participants"]`), for example one review against an adjudicated pair. An arm whose `participants` is absent, or `null` to clear a shared one, runs one ordinary subject. Not both on the group and in the configuration. Expectations, comparisons and review questions apply to each arm's graded run: its pipeline's graded stage, its conversation, or its single subject.

A **conversation** pairs the subject with a simulated user:

```json
{
  "participants": {
    "protocol": "conversation",
    "user": {
      "model": "anthropic/claude-haiku-5-5",
      "thinking": "medium",
      "card": "cards/release-owner.md",
      "max_turns": 10,
      "stop": "THANKS, DONE"
    }
  }
}
```

- It needs a body group whose `input` is a `prompt`: the opening message.
- `card` is a text file inside the definition root and outside the fixture: everything the simulated user knows. It is read in when the definition loads and is a run input that must be committed.
- `max_turns` (1 to 50, default 10) caps the subject's turns, the opening included. `stop` is the phrase with which the user ends the conversation.
- `model` and optional `thinking` name the user's model.

A **pipeline** runs ordered stages, each a separate subject:

```json
{
  "participants": {
    "protocol": "pipeline",
    "stages": [
      { "id": "review1", "input": "Review the change.", "sees": ["fixture"] },
      { "id": "review2", "fresh": true, "sees": ["fixture"] },
      { "id": "adjudicator", "input": "Adjudicate the reviews.", "sees": ["review1.response", "review1.files", "review2.response"] }
    ],
    "graded": "adjudicator"
  }
}
```

- Stage `id`s follow the group ID pattern and are unique. `input` is a prompt or an array of turns, and defaults to the group's `input`.
- `sees` lists exactly what the stage gets: `fixture` (a fresh copy, only when the group declares one), `<stage>.response` (that earlier stage's final response) or `<stage>.files` (the files it created or modified; body groups only). Anything not listed never reaches the stage. It defaults to nothing.
- `fresh: true` declares the stage independent: it may see the fixture but no earlier stage.
- `graded` names the stage the group's expectations, comparisons and review questions apply to; it defaults to the last stage.

## Configuration And Arms

A configuration has these fields; each arm's effective configuration is the shared `configuration` with that arm's overlay merged in:

| Field | Required in the effective configuration | Meaning |
| --- | --- | --- |
| `host` | yes | `{ "name": "pi" }`, with optional `version` (must match `pi --version`), `extensions` and `settings`; see [Host Extensions And Settings](#host-extensions-and-settings). |
| `subject` | yes | What is under test: `{ "kind": "skill", "source", "skills", "target", "context" }` (see [Subject](#subject)) or `{ "kind": "none" }` when the comparison is about the environment, not a skill. |
| `model` | no | `model` names the provider/model; optional `thinking` selects its thinking level. The CLI has no model override, and a subject run without a model gets Pi's default and no copied login. |
| `runtime` | no | Host session, prompt mode, extension bundles and environment; see [Runtime Profile](#runtime-profile). |
| `shell` | no | A confined `bash` for the subject: `{ "isolation", "network": "none", "workspace", "requires" }`; see [Shell](#shell). |
| `environment` | no | A container the subject's shell and the command graders run in: `{ "kind": "container", "image": "<name>@sha256:<digest>", "workdir", "network": "none" }`; see [Container Environment](#container-environment). |
| `freeflow` | no | Contributor-only (needs a Freeflow repository as the definition root): Freeflow as part of the environment: `{ "source": { "kind": "git", "ref": "<commit>" }, "repository": { ... }, "personal": { ... } }`; see [Freeflow](#freeflow). |

Rules:

- `configuration` may also hold `extends`: a path, relative to the group file, to a configuration file (`{ "schema_version": 2, "kind": "configuration", "id": "...", "configuration": { ... } }`). Its configuration is merged first, then the group's own fields. A configuration file cannot itself extend another.
- `arms` holds one or more named arms. A name starts with a lowercase letter, followed by up to 31 lowercase letters, numbers or hyphens. Each arm is an overlay with any of the configuration fields. Merging is key by key for objects; an array, scalar, or `null` in the overlay replaces the shared value.
- `reference` is optional and names the arm the others are compared with; it defaults to `baseline`, and the named arm must exist. Evidence, views and the aggregate list the reference first, then the other arms in declaration order.
- `component` is an array of dot paths into the configuration, such as `subject.source` or `model.thinking`. The evaluator compares each arm's effective configuration with the reference's leaf by leaf (an array is one leaf) and refuses the group before any subject runs when any arm differs anywhere `component` does not cover, or when a `component` path differs in no arm. `component: []` declares an A/A comparison (or A/A/A with three arms): every arm must be identical, which measures run-to-run variation.
- **One arm** measures one setup with nothing to compare: the arm is its own reference (`reference`, if given, must name it), `component` is absent or `[]`, and no expectation declares a `comparison`. Checks, pass^k, metrics, judged scores (`review --rubric`), reference solutions and command graders work as usual; the aggregate's claim is a rate on the suite; a suite `decision` refuses a one-arm group, and a pairwise `review` refuses one (judge it with `--rubric`). With two or more arms, `component` is required.
- `host.name`, `host.version` and `runtime` must be the same in every arm, except `runtime.environment.literal` (see [Runtime Profile](#runtime-profile)). `host.extensions`, `host.settings`, `shell`, `environment` and `freeflow` may differ; any of them can be the component under test.
- A non-reference arm that declares skills must name its target.
- `--variant <arm>` selects any arm (see [Selection](#selection)).

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

## Description Group Example

A description group uses natural prompts and asks whether the exact target was read and when:

```json
{
  "schema_version": 2,
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
  "configuration": {
    "host": { "name": "pi" },
    "model": { "model": "xai/grok-4.7", "thinking": "medium" },
    "subject": { "kind": "skill", "skills": ["skills/target"], "target": 0, "context": [] }
  },
  "arms": {
    "baseline": { "subject": { "source": { "kind": "git", "ref": "before-description-change" } } },
    "candidate": { "subject": { "source": { "kind": "working-tree" } } }
  },
  "component": ["subject.source"],
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

For a description-only revision, declare `"revision": "description-only"`. The evaluator then checks that the two target snapshots keep body and resources byte-identical and change only the frontmatter description, and refuses the group otherwise.

Description groups allow no tools or only `read`. `skill-read` is their target-activation check.

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

Description groups allow no tools or only built-in `read`. Body groups allow built-in `read`, `write`, `edit`, `ls`, `find` and `grep` (each confined to the evaluation environment), the evaluator's `run_command` tool for declared commands, plus custom tools declared by a runtime extension bundle. Native `bash` is allowed only through a declared, verified [Shell](#shell); `powershell` is unsupported. A no-target baseline or runtime-only group may use `skills: []` and `target: null`; a non-reference arm that declares skills must identify its target.

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

- `extensions` lists Pi packages by exact name and version. Each is found among the user's installed Pi packages (`<Pi agent directory>/npm/node_modules`); a missing package or another version refuses the run before anything starts. They load right after the evaluator's guard, in order, and are recorded under `resources.hostExtensions`. Extensions can change what the host sends (an auth extension may reshape the system prompt), so they belong to the configuration, and arms that differ in them must declare it in `component`.
- `settings` is any object of Pi settings. It becomes the subject's `settings.json` in its isolated agent directory, merged over the evaluator's two defaults: `retry.enabled` and `compaction.enabled` are `false` unless declared, so a provider error or a compaction never happens silently inside a measured run. Any other setting it does not name takes Pi's default; the user's own settings never apply. `run.json` records the effective settings under `isolation.settings`, and body runs send the same retry and compaction values to Pi over RPC. `packages` is refused: extensions load only from `extensions`.
- An extension can also be built from source, so arms can compare versions of an extension under development:

  ```json
  {
    "extensions": [
      { "source": { "kind": "git", "ref": "3f2a9c1", "path": "packages/my-extension" }, "build": ["npm", "run", "build"], "entry": "dist/index.js" },
      { "path": "extensions/local-probe", "entry": "index.mjs" }
    ]
  }
  ```

  - `source` takes a directory (`path`, or `"."`) at an exact commit (`ref`: 7 to 64 hex characters; branches and tags are refused because they move) of the Git repository holding the definition root, extracted with `git archive`. `path` instead takes a directory under the definition root from the working tree; it is a run input, so it must be committed for a canonical run, and it is snapshotted, never used live.
  - Optional `build` runs once in the extracted copy, without a shell, in an isolated home, temp and Pi directory with no copied login, with a 10-minute timeout. A build that fails, times out or cannot start makes the group `invalid` before any subject runs.
  - `entry` is the file Pi loads, relative to the built directory.
  - Each distinct source and build is built once per group, under `resources/host-extensions/<n>/source` in the group directory. `resources.hostExtensions` records the source (with the resolved `commit` for a Git source), the entry, a `sha256` over the built directory's file list and contents, and the build's argv, exit code, duration and output tails.
  - These entries are for arms; a reviewer configuration may list only installed packages.
- The advisory reviewer takes the same fields from a configuration file given with `review --configuration`.

## Shell

A body group may give its subject `bash` only through a host extension that runs the shell in isolation, such as a micro-VM. The evaluator does not choose or ship a sandbox; it verifies the one the configuration names:

```json
{
  "tools": ["read", "write", "bash"],
  "configuration": {
    "host": { "name": "pi", "extensions": [{ "path": "isolation/vm-shell", "build": ["npm", "ci", "--ignore-scripts"], "entry": "index.ts" }] },
    "shell": { "isolation": "isolation/vm-shell", "network": "none", "workspace": "/workspace", "requires": ["gondolin"] }
  }
}
```

- `bash` in `tools` needs a body group whose every arm declares `shell`, and a declared `shell` needs `bash` in `tools`. A declared `shell` is checked when the definition loads; without one, `run` refuses `bash` before any subject starts, and the guard blocks it.
- `isolation` names one of the arm's `host.extensions` by its label: the package name, a working-tree `path`, or a Git source's `path`.
- `network` must be `"none"`: the shell may not reach the network.
- Optional `workspace` is where the isolation shows the workspace (a micro-VM often mounts it at `/workspace`). The guard checks a path under it as the same path in the host workspace, so `/workspace/src/a.js` is allowed and `/etc/hosts` is not.
- Optional `requires` lists what the isolation needs on this machine: a known name (`gondolin` for QEMU and Node.js 23.6+, or `qemu` or `node-23.6` alone), or `{ "name", "programs": [any one of them on PATH], "reason", "install": { "macos", "apt", "dnf" }, "download" }`.

Before an arm's first subject, the evaluator:

1. Checks `requires`. When something is missing, the group is `invalid` before any subject runs, and the refusal names each missing item, what was found, why the isolation needs it, the install command for this system (Homebrew on macOS, apt or dnf on Linux), and the expected download when known. Ask the user before installing anything.
2. Runs the probes: the subject's own Pi, with the guard and the arm's host extensions, `bash` as its only tool, and a local scripted model (an OpenAI-compatible endpoint the evaluator serves, so no model is called) that issues five bash calls. A control must succeed: writing a file inside the workspace. Four must fail: writing a host file outside the workspace, reading a marker beside the isolated home, reaching the network (a listener on the host's own network address, plus `https://example.com/` unless `SKILL_EVAL_PROBE_PUBLIC_URL` names another URL or is empty), and printing a variable the evaluator plants in Pi's environment. Each is judged by what the host observes: files, connections and output.

Any probe that does not hold makes the group `invalid` before any subject runs. Each run records the arm's result under `confinement` (every probe's command, whether it ran and held, and its output), also kept in `confinement/<arm>/` in the group directory with Pi's events and stderr.

## Container Environment

A body group can run its subject's `bash` and its [command graders](#command-graders) in a task image with its own toolchain, as benchmark-style coding tasks need:

```json
{
  "tools": ["read", "write", "edit", "bash"],
  "configuration": {
    "environment": { "kind": "container", "image": "example.org/task@sha256:<64 hex characters>", "workdir": "/testbed", "network": "none" }
  }
}
```

- The image must be pinned by digest; a tag can change under the run. `workdir` is where the workspace is mounted; `network` must be `"none"`. Arms may differ in `environment` when `component` declares it, such as `environment.image`. An arm declares either `shell` or a container environment, which provides the shell.
- The evaluator uses the standard `docker` command line (Docker Desktop, Colima, OrbStack or Podman's `docker` all provide it) and looks for it only for groups that declare a container. A missing CLI, a stopped engine, or an image that is not present locally makes the group `invalid` before any subject runs, with the same refusal as a shell prerequisite; for a missing image it gives the `docker pull` command and, when `docker manifest inspect` reports it, the compressed download size. The evaluator never pulls an image; ask the user first.
- With `bash` in `tools`, each subject gets its own container from the image (the workspace mounted at `workdir`, `--network none`, 4 GB of memory, 2 CPUs, 1024 processes), removed when the subject ends, cancelled or not. The guard rewrites each bash call to `docker exec` into it, so the command runs in the image and Pi runs only the docker client; paths under `workdir` are checked as workspace paths. The [Shell](#shell) probes run first, in a container of their own, and must all hold.
- Each `command` expectation runs in a fresh container from the same image on the graded copy of the workspace (`docker run --rm`, same mount, network and limits), removed afterwards even on a timeout. Its record names the image and container. `check-tasks` runs them in the image too, and reports the group `not-checkable`, with the same refusal, when docker or the image is missing.

## Freeflow

Contributor-only: this field builds Freeflow itself with `scripts/freeflow-snapshot.mjs`, so it works only when the definition root is a Freeflow repository; elsewhere the group is refused before any subject runs. To compare a host extension, declare it under `host.extensions`.

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
      "repository": { "taskMemory": { "enabled": false } },
      "personal": {}
    }
  },
  "arms": {
    "baseline": {},
    "candidate": { "freeflow": { "repository": { "taskMemory": { "enabled": true } } } }
  },
  "component": ["freeflow.repository.taskMemory.enabled"]
}
```

- `source` is a Git source only; the package is built from that commit with the definition root's `scripts/freeflow-snapshot.mjs`, once per distinct ref per group, into the group's `resources/freeflow/`. The user's development snapshot is never used or changed.
- `repository` is written to the workspace's `.freeflow/config.json` and `personal`, when not empty, to `.freeflow/local.json`, before the workspace's starting state is taken, so neither counts as a subject change. A fixture that already has either file is refused. Both default to `{}`.
- Both are checked with the validator from the same build before any subject starts; a setting that build rejects makes the group `invalid`.
- `runtime.prompt` must be `host`: the isolated prompt replaces the host's system prompt, which would remove Freeflow's own instructions.
- Freeflow's extension loads right after the evaluator's guard, the package directory is readable by the subject, and Freeflow may register custom tools that `tools` then names.
- `run.json` records the ref, resolved commit, package name and version, tarball hash, and the settings under `resources.freeflow`.

## Runtime Profile

A runtime profile, under `configuration.runtime`, is shared by every arm, except `environment.literal`. It changes the host environment, not the skill target:

```json
{
  "runtime": {
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

The host comes from `configuration.host.name` (`pi`); the evaluator maps it to the installed Pi command and records the selected host. Optional `prompt` is `isolated` (default) or `host`:

- `isolated` replaces the host's system prompt with a minimal evaluator-owned prompt. Use it to isolate the target skill.
- `host` keeps the host's own system prompt and whatever declared extensions compose onto it, appending declared context. Use it when evidence must reflect the production prompt, for example by declaring the Freeflow Pi extension bundle with a fixture containing `.freeflow/config.json`.

Both modes enforce the same tool and path guards. A declared runtime states only what it changes: an omitted `session` is `false`, `extensions` is `[]`, `environment` is `{ "literal": {}, "inherit": [] }`, and `prompt` is `isolated`. `session` controls whether the variant receives an isolated persistent session directory; it defaults to `false` in omitted runtime profiles. A runtime may declare zero or more bundles. Each bundle has an entry file and one or more directory resources copied under their original relative paths, so sibling imports and multi-tree extensions remain intact. Bundle bytes are snapshotted once and copied identically to every arm.

`environment.literal` contains non-secret string configuration and is recorded in run evidence. Arms may differ in it when `component` names `runtime.environment.literal` or one key under it, such as `runtime.environment.literal.FEATURE_MODE`; each arm's subject then receives its own literals, recorded under `resources.runtime.environment`. Declare `environment` in the shared runtime so an arm's overlay changes only the literal. `environment.inherit` names parent-process variables whose values are passed to the child but never persisted; other parent variables are not passed. Missing inherited variables invalidate the variant. The evaluator supplies only a small host-runtime baseline such as `PATH` and `HOME`. Launch-control and loader keys are rejected from inherited values, literal and inherited names must not overlap, and secret-like literal keys are rejected.

Extensions are trusted executable inputs, not OS-sandboxed code. The evaluator proves declared identity and post-run immutability, but extension code retains its host permissions.

When a group declares `context-text` expectations, the evaluator loads its base isolation guard first, then declared bundles, then a non-mutating final observer. The observer records two per-turn surfaces: the chained `before_agent_start` system prompt and each provider-neutral `context` message projection. `context-text` expectations select `surface: "system-prompt"` or `surface: "provider-context"` and may select `request: "first"`, `"last"`, or a positive request number. Groups without context assertions do not create context-observation artifacts.

A custom tool name is allowed in `group.tools` only when the runtime declares an extension bundle. The evaluator remains extension-neutral: it does not interpret feature names or configuration schemas. Put feature configuration in the ordinary group fixture or runtime environment, and test combinations as separate suite groups.

## Subject

A `skill` subject's effective configuration has exactly:

```json
{
  "kind": "skill",
  "source": { "kind": "git", "ref": "v1.2.3" },
  "skills": ["skills/target", "skills/support"],
  "target": 0,
  "context": ["context/base-guidance.md"]
}
```

A `none` subject has only `{ "kind": "none" }`: no skills, no target, and no declared context.

`source` is either:

```json
{ "kind": "working-tree" }
```

or:

```json
{ "kind": "git", "ref": "<exact-ref>" }
```

A source applies only to declared skill and context paths in that arm. It never supplies the group fixture: `fixture` is snapshotted once from the definition-root working tree, then copied independently for selected variants. `skills` preserves registration order. `target` is `null` or a zero-based index into `skills`. A non-reference arm that declares skills must name its target; an arm with `skills: []` uses `target: null`. `context` preserves declaration order and may name UTF-8 files or directories.

## Expectations

Every expectation has:

- `id`: unique group-local ID using the group-ID syntax;
- `kind`: one supported deterministic kind;
- `variant`: the name of one of the group's arms, such as `baseline` or `candidate`;
- optional `comparison`: shared by exactly one expectation for each arm, all describing the same expected check;
- optional body `turn`: one-based declared prompt/turn number.

An expectation may contain only these common fields and the kind-specific fields in the table below. Any other field is rejected before any subject runs, because its grader would ignore it.

Without `turn`, response checks use the final response and workspace checks use final state. Turn-scoped workspace checks cause an immutable workspace snapshot after each settled turn.

| `kind` | Kind-specific fields | `expect` |
| --- | --- | --- |
| `skill-read` | timing `turn` except for `never` | `never`, `on-turn`, `by-turn`, `not-before-turn` |
| `resource-read` | `resource`, optional `index`, `path`, optional body `turn` | `read`, `not-read` |
| `path` | workspace `path`, optional body `turn` | `exists`, `absent` |
| `changed-paths` | unique workspace `paths`, optional body `turn` | `equals`, `excludes` |
| `file-text` | workspace `path`, string `value`, optional body `turn`, optional `line` | `contains`, `not-contains`, `equals` |
| `json` | workspace `path`, optional body `turn`, conditional `pointer` and `value` | `available`, `missing`, `valid`, `malformed`, `field-present`, `field-absent`, `field-equals` |
| `response-text` | string `value`, optional body `turn` | `contains`, `not-contains`, `equals` |
| `tool-call` | string `tool`, optional body `turn`, optional `argumentContains`/`argumentNotContains` arrays | `called`, `succeeded`, `failed`, `not-called` |
| `context-text` | string `value`, optional `surface` (`system-prompt` or `provider-context`), optional `request`, optional body `turn` | `contains`, `not-contains`, `equals` |
| `command` | body only: `argv`, optional `files`, optional `timeout_seconds`, `pass`; no `turn` | none; see [Command graders](#command-graders) |

With `line` (a positive integer, 1-based), a `file-text` expectation compares only that line, without its line ending. A line the file does not have fails every expectation, including `not-contains`, so an empty file cannot pass by having nothing to read. Use it to check one line, such as a review's first-line judgment, when the rest of the file may quote the same text.

For `tool-call` with `expect: "not-called"`, omitted argument filters require zero calls to the named tool. Supplied filters scope the absence check to calls matching those argument predicates.

### Command graders

A `command` expectation grades a body run's final work by running a program on it, such as hidden tests or a linter:

```json
{
  "id": "candidate-hidden-tests",
  "kind": "command",
  "variant": "candidate",
  "comparison": "hidden-tests",
  "argv": ["node", "--test", "--test-reporter=tap", "test/hidden.test.mjs"],
  "files": { "test/hidden.test.mjs": "graders/calc/hidden.test.mjs" },
  "timeout_seconds": 600,
  "pass": { "tests": { "format": "node-test", "required": ["adds two numbers", "adds negatives"] } }
}
```

- After the run, the final workspace is copied to `<arm>/commands/<id>/workspace`, each `files` entry is copied in (key: path in the copy; value: path under the definition root), and `argv` runs there without a shell, with the subject's isolated home, temp, XDG and Pi directories. The workspace itself is never changed, so file graders still verify its hashes.
- `files` sources resolve from the definition root like `fixture`, may not lie inside the fixture (the subject sees the fixture), and are inputs of the run: an uncommitted grader file makes the run non-canonical. A destination may not pass through a symlink the subject left in the workspace.
- `timeout_seconds` (1 to 3600, default 600) stops the command's whole process tree.
- `pass` is exactly one rule. `{ "exit_code": 0 }` passes on that exit code. `{ "tests": { "format", "required", "report" } }` passes when every `required` test passed: `node-test` and `tap` read TAP from stdout (give Node `--test-reporter=tap`, since newer Node versions default to another reporter), and `junit` reads the JUnit XML file at `report` in the copy, or stdout without one. A required name matches a test's own name or its full name, parents joined by ` > ` (for JUnit, `<classname> > <name>`); skipped, missing and failed tests do not pass. The check records `score`, the passed share of `required`. The aggregate's `scores` section gives each such check's score per arm (`count`, `unavailable`, `mean`, `median`) and per trial as `score.<expectation id>`, and also as `score.<comparison id>` when the expectation belongs to a comparison, so a suite decision can measure it with `{ "score": "<comparison id>" }`.
- `run.json` records each command under `postRun.commands.<id>`: exit code, signal, timeout, duration, the last 20,000 characters of stdout and stderr, and parsed test results. A run that did not complete, or a command that could not start, grades `unavailable`; a timeout fails.

Commands are trusted author input with the evaluator's host permissions; whatever the subject wrote runs with them too when the command executes it.

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

### Comparison

Expectations may share one comparison ID only when there is exactly one for each arm and all have the same kind and expected predicate. For each non-reference arm the report records a factual transition from the reference, such as `fail-to-pass`, never a quality verdict. A `baseline`/`candidate` group records it as `transition`; any other group records `reference`, each arm's check and state under `arms`, and each non-reference arm's transition under `transitions`.

Definition loading validates common structure and unique IDs, and every field of a `command` expectation, because it runs a program. Other kind-specific expectation validation occurs during deterministic grading after run persistence. A malformed expectation therefore becomes separate `grade-error` evidence rather than changing the subject run. Use the documented shapes to avoid spending a subject run on an invalid check.

- `reference_solution` is optional and has exactly one key: `{ "patch": "<file>" }`, a unified diff applied to the fixture copy with `git apply`, or `{ "files": "<dir>" }`, whose regular files overlay the fixture copy. Both paths are relative, stay inside the definition root, may not lie inside the fixture, and are inputs of the run. The reference is one workspace shared by every arm, so `skill-eval check-tasks` grades each arm's workspace and command expectations with no model, reporting per arm: `solvable` only when every arm's applicable expectations pass on the reference and fail before it, `unsolvable` with the failing graders named per arm, `already-solved` when an arm's expectations all pass on the unchanged fixture (the task cannot show a change), or `not-checkable` when a check cannot run (interaction expectations need a transcript). The same graders run on the unchanged fixture: each arm records `before` with every check's state there and, for test graders, the required tests that fail before and pass on the reference (`failToPass`) and the ones that pass both times (`passToPass`). A pass-to-pass test is fine as long as some required test or the exit-code rule fails before. An optional `"arm": "<name>"` inside `reference_solution` restricts the check to one arm. `run` refuses an unsolvable or already-solved group before any subject starts unless `--skip-reference-check` is given; the result records the check in `groups/<id>/reference-check.json`.
Group `commands` run only through the subject's `run_command` tool. Grading runs only the `argv` of `command` expectations, after the subject has finished.

## Declared Commands

A body group that must let the subject run tests or other programs lists the `run_command` tool and declares each allowed command:

```json
{
  "tools": ["read", "edit", "run_command"],
  "commands": [
    { "id": "unit-tests", "argv": ["node", "--test"], "timeout_ms": 120000 },
    { "id": "lint", "argv": ["npm", "run", "lint"] }
  ]
}
```

- `run_command` and `commands` require each other and are valid only in body groups.
- Each command has a unique `id` (group-ID syntax), a non-empty `argv`, and optional integer `timeout_ms` from 1 to 600000 (default 120000).
- The subject chooses only a declared `id`; it cannot change `argv`. The argv runs without a shell, in the workspace, without evaluator control variables.
- Output is capped per stream and marked when truncated. A nonzero exit or timeout is an ordinary tool result, not a tool error.
- Grade calls with `tool-call` expectations, for example `tool: "run_command"` with `argumentContains: ["unit-tests"]`.

Commands are trusted author input with the evaluator's host permissions, like extension bundles; the subject only selects among them.

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

A suite has `schema_version`, `kind`, `id`, ordered unique `groups`, and an optional `decision`. Group references resolve from the suite directory; their resolved definition paths must remain inside the definition root. Referenced group IDs must also be unique.

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

- `measure` names exactly one of: `comparison`, a comparison ID from the groups' expectations (a pass counts 1, a fail 0); `metric`, a name in the aggregate's `metrics` section; `judged`, a dimension ID in its `judged` section; or `score`, a test-graded command expectation's ID or, to compare arms, its comparison ID, read from the `scores` section. Section values are read from `perTrial` (`true` counts 1, `false` 0, numbers as given). Null and unavailable values are excluded and counted.
- `arms` names two arms, the reference first; every selected group must have both, and `--variant` is refused.
- `direction` says whether `higher` or `lower` is better. `measure`, `arms` and `direction` are required.
- `method` is `sign-test` (default), `alpha` is between 0 and 1 (default 0.05), and `min_cases` is a positive integer (default 10).
- The unit is the case. Each arm's values over a case's trials are averaged, and the second arm is better, worse or equal. An exact two-sided sign test over the better and worse cases (ties and excluded cases are counted, not tested) gives `beats` only with at least `min_cases` decided cases, p below `alpha`, and the split in the declared direction; the same evidence the other way gives `worse`; anything else is `no-difference-shown`.
- A suite with a decision always runs as trials and records an aggregate. `trials` is optional: without it, `--trials` sets the count (default 1); with it, `--trials` may be omitted or must equal `initial`. After `initial` trials, each case whose sign is not yet stable (the arms tie, or differ by less than one trial's worth: the observed range divided by the fewer values) runs up to `step` more trials of that group alone, until `max`. A case with an arm that has no usable value is not extended.

The aggregate records `decision` (the rule with defaults applied, its `ruleSha256`, the split, ties, excluded cases and values, p, the verdict, and each case's per-arm mean and count), `schedule` (each adaptive round's cases and its `scheduled` and run `trials`) and, on each added trial, its `round` and `group`; `requestedTrials` stays the initial count. Its `claim` is the verdict reached, with the split, p and rule hash; a dry run's claim class stays `none`.

## Selection

- With no selectors, every suite group and every arm are selected.
- `--group <id>` selects one stable group ID.
- `--group <position>` selects one one-based suite position.
- `--variant <arm>` applies across selected groups, and each selected group must have that arm.
- Excluded arms are `not-selected`, never failed.
- `--group` is invalid for a direct group definition.

Selection changes execution scope only. It does not modify the saved definitions.
