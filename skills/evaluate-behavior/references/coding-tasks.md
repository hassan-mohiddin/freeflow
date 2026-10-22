# Coding Tasks

This reference holds a coding task's guidance and the definition fields it uses, and the Claude Code host's. The guidance is judgment; the field shapes and constraints are a contract, binding as written, like the rest of [authoring](authoring.md).

## Choose And Declare A Coding Task

- **Answers:** does the agent's change work, judged by running it rather than reading it?
- **Declare:** a body group with the repository as its fixture and tools to edit it; `command` expectations whose `argv` runs hidden tests, a linter or a build on a copy of the final workspace, with grader `files` kept outside the fixture and a `pass` rule (an exit code, or named required tests); declared `commands` and `run_command` when the subject should run tests itself; a `reference_solution` proving the task solvable; and a `shell` or a container `environment` only when the task needs `bash`, or a toolchain the host lacks.
- **Grade both directions:** tests of the new behavior, which fail on the unchanged fixture and must pass after the change, and the existing tests the change must not break, which pass before and must still pass. Passing only the first rewards a change that breaks something else.
- **Yields:** each command's exit code, output tails and per-test results, with the share of required tests passed as a score; a reference check per group.
- **Pitfalls:**
  - Run `check-tasks` first: it applies the reference solution and runs the graders with no model (Reference Solution, below). A task the reference fails measures the grader, not the agent; a task already solved measures nothing. For every group it also lists what the copy lacks against the setting the task came from: Git history (a workspace is never a repository), ignored files the fixture holds (a clone lacks them) or the task names (such as `.env`), and tools or network the task refers to but the subject lacks. Judge each gap before running: give the subject what the task needs, or reword the task.
  - A required test name that matches nothing fails every arm; the reference check catches it.
  - Grader files inside the fixture, or named in the prompt, leak the answer.
  - A subject can make tests pass by editing them. List every test you rely on, existing ones included, in the grader `files`: a grader file replaces whatever the subject left at that path. A `changed-paths` expectation with `excludes` also shows whether the subject touched them.
  - A container image is pinned by digest and never pulled by the evaluator; when it is missing, relay the refusal and ask the user before pulling. Declare `network: "none"` when the subject's code must not reach the network, the host's files or the login (Network, below).
  - Grader commands run with the evaluator's host permissions, and run whatever the subject wrote. Run only tasks whose fixture and graders you trust.
  - A subject without a shell runs only the declared commands, which is often enough. A shell needs a confining isolation that the evaluator probes (Shell, below); when it needs software this machine lacks, relay the refusal to the user and ask before installing anything.

## Command Graders

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

## Reference Solution

`reference_solution` is optional and has exactly one key: `{ "patch": "<file>" }`, a unified diff applied to the fixture copy with `git apply`, or `{ "files": "<dir>" }`, whose regular files overlay the fixture copy. Both paths are relative, stay inside the definition root, may not lie inside the fixture, and are inputs of the run. The reference is one workspace shared by every arm, so `skill-eval check-tasks` grades each arm's workspace and command expectations with no model, reporting per arm: `solvable` only when every arm's applicable expectations pass on the reference and fail before it, `unsolvable` with the failing graders named per arm, `already-solved` when an arm's expectations all pass on the unchanged fixture (the task cannot show a change), or `not-checkable` when a check cannot run (interaction expectations need a transcript). The same graders run on the unchanged fixture: each arm records `before` with every check's state there and, for test graders, the required tests that fail before and pass on the reference (`failToPass`) and the ones that pass both times (`passToPass`). A pass-to-pass test is fine as long as some required test or the exit-code rule fails before. An optional `"arm": "<name>"` inside `reference_solution` restricts the check to one arm. `run` refuses an unsolvable or already-solved group before any subject starts unless `--skip-reference-check` is given; the result records the check in `groups/<id>/reference-check.json`.

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
- The subject chooses only a declared `id`; it cannot change `argv`. The argv runs without a shell, in the workspace (in the arm's container when it has a container environment), without evaluator control variables or a pointer to the login.
- Output is capped per stream and marked when truncated. A nonzero exit or timeout is an ordinary tool result, not a tool error.
- Grade calls with `tool-call` expectations, for example `tool: "run_command"` with `argumentContains: ["unit-tests"]`.

A command's argv is trusted author input, like an extension bundle, and the subject only selects among them; but what it runs, such as the workspace's tests, may be the subject's own code. Without a container it runs on the host with the user's permissions and network; declare `network: "none"` and a container environment to seal it (Network, below).

Group `commands` run only through the subject's `run_command` tool. Grading runs only the `argv` of `command` expectations, after the subject has finished.

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

- `bash` in `tools` needs a body group whose every arm declares `shell` or a [container environment](#container-environment), and a declared `shell` needs `bash` in `tools`. A declared `shell` is checked when the definition loads; without one, `run` refuses `bash` before any subject starts, and the guard blocks it.
- `isolation` names one of the arm's `host.extensions` by its label: the package name, a working-tree `path`, or a Git source's `path`.
- `network` must be `"none"`: the shell may not reach the network.
- Optional `workspace` is where the isolation shows the workspace (a micro-VM often mounts it at `/workspace`). The guard checks a path under it as the same path in the host workspace, so `/workspace/src/a.js` is allowed and `/etc/hosts` is not.
- Optional `requires` lists what the isolation needs on this machine: a known name (`gondolin` for QEMU and Node.js 23.6+, or `qemu` or `node-23.6` alone), or `{ "name", "programs": [any one of them on PATH], "reason", "install": { "macos", "apt", "dnf" }, "download" }`.

Before an arm's first subject, the evaluator:

1. Checks `requires`. When something is missing, the group is `invalid` before any subject runs, and the refusal names each missing item, what was found, why the isolation needs it, the install command for this system (Homebrew on macOS, apt or dnf on Linux), and the expected download when known. Ask the user before installing anything.
2. Runs the probes: the subject's own Pi, with the guard and the arm's host extensions, `bash` as its only tool, and a local scripted model (an OpenAI-compatible endpoint the evaluator serves, so no model is called) that issues six bash calls. A control must succeed: writing a file inside the workspace. Five must fail: writing a host file outside the workspace, reading a marker beside the isolated home, reading a marker in the directory where the host keeps its login (Pi's agent directory), reaching the network (a listener on the host's own network address, plus `https://example.com/` unless `SKILL_EVAL_PROBE_PUBLIC_URL` names another URL or is empty), and printing a variable the evaluator plants in Pi's environment. Each is judged by what the host observes: files, connections and output.

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

- The image must be pinned by digest; a tag can change under the run. `workdir` names the workspace in the container, such as `/testbed`, and must be empty or absent in the image; `network` must be `"none"`. Arms may differ in `environment` when `component` declares it, such as `environment.image`. An arm declares either `shell` or a container environment, which provides the shell.
- The evaluator uses the standard `docker` command line (Docker Desktop, Colima, OrbStack or Podman's `docker` all provide it) and looks for it only for groups that declare a container. A missing CLI, a stopped engine, or an image that is not present locally makes the group `invalid` before any subject runs, with the same refusal as a shell prerequisite; for a missing image it gives the `docker pull` command and, when `docker manifest inspect` reports it, the compressed download size. The evaluator never pulls an image; ask the user first.
- With `bash` in `tools`, each subject gets its own container from the image (`--network none`, 4 GB of memory, 2 CPUs, 1024 processes), removed when the subject ends, cancelled or not. The workspace is mounted at its own host path, where `bash` and declared commands start, and `workdir` is a link to it, so `pwd`, the working directory the host reports and the paths its file tools take all agree, and the image's own references to `workdir` (such as `GIT_WORK_TREE=/testbed`) reach the workspace. Graders see their copy at `workdir`. Each declared resource the subject may read (its skills, context, runtime extension resources and Freeflow's package) is mounted read-only at the same path it has on the host, so a path the subject was given, such as `node <skill>/scripts/check.mjs`, works from bash as it does for `read`; the workspace is the only writable mount. The guard rewrites each bash call to `docker exec` into it, so the command runs in the image and Pi runs only the docker client; paths under `workdir` are checked as workspace paths. The [Shell](#shell) probes run first, in a container of their own, and must all hold.
- Each `command` expectation runs in a fresh container from the same image on the graded copy of the workspace (`docker run --rm`, same mount, network and limits), removed afterwards even on a timeout. Its record names the image and container. `check-tasks` runs them in the image too, and reports the group `not-checkable`, with the same refusal, when docker or the image is missing.

## Network

Three paths run code the subject could have written: its `bash`, its [declared commands](#declared-commands) (which run the workspace's own tests and scripts), and [command graders](#command-graders) (hidden tests that import its code). `network` declares one policy for all three:

- `"none"`: sealed. `bash` runs behind a probed [Shell](#shell) or in the arm's container, and declared commands and command graders run in the arm's [container](#container-environment), each with no network and none of the host's files, so the provider login on disk is out of reach. An arm that declares `"none"` but would run declared commands or command graders on the host, for want of a container environment, is refused at load.
- `"host"`: unsealed, on purpose. Declared commands and command graders run on the host as the user, with the network and the user's files, including the provider login on disk. A declared command gets no pointer to the login (no `PI_CODING_AGENT_DIR` or login variable), which keeps it out of easy reach, not out of reach.

Without `network`, an arm gets what its paths allow: sealed when every path it has is confined, unsealed when it runs declared commands or command graders without a container. The plan line names the unsealed arms before anything starts, and each run records `sealing`: the `network` its code had, the `declared` policy (or null), where `bash`, `commands` and `graders` ran (`container`, `shell`, `host`, or null when it has none), and whether the `login` was out of reach: with `bash`, only when the arm's login-directory probe held, and otherwise `not shown out of reach`. The subject's host process (Pi or Claude Code) always keeps the network, which it needs to reach its model, and reads only its own copied login. A named allowlist of hosts is not supported.

## Claude Code Host

`"host": { "name": "claude-code" }` runs subjects, judges and simulated users in headless Claude Code (`claude -p` with stream-json input and output). A group runs on one host; compare hosts with one group per host.

```json
{
  "host": { "name": "claude-code", "version": "2.1.296" },
  "model": { "model": "anthropic/claude-haiku-5-5", "thinking": "low" },
  "subject": { "kind": "none" },
  "environment": { "kind": "container", "image": "python@sha256:<64 hex characters>", "workdir": "/testbed", "network": "none" }
}
```

- **Login.** Claude Code's login reaches a subject only from the evaluator's environment: `CLAUDE_CODE_OAUTH_TOKEN` (on a Mac whose login is in the keychain, `claude setup-token` prints one), `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_SESSION_INGRESS_TOKEN_FILE`, with `ANTHROPIC_BASE_URL` and proxy variables when set. No credential file is copied. `run.json` records the variable names under `isolation.credentials`, never their values. Without one, the arm is invalid before it starts.
- **Model.** Every arm declares one: `anthropic/<model>` or a bare Claude model name. `thinking` is Claude Code's `--effort`: `low`, `medium`, `high`, `xhigh` or `max`.
- **Tools.** `read`, `write`, `edit` and `grep` run as Claude Code's Read, Write, Edit and Grep; `ls` and `find` as Glob. Nothing else is enabled: no Agent, web or MCP tools. A Glob or Grep pattern must be relative to its path. `bash` runs as Bash only in a [container environment](#container-environment): Claude Code has no isolation extension, so `shell` is refused.
- **Isolation.** Each process has its own home, temp and `CLAUDE_CONFIG_DIR`, and starts with `--setting-sources ""`, `--strict-mcp-config`, `--disable-slash-commands`, `--permission-mode dontAsk` and the evaluator's guard as a PreToolUse hook. CLAUDE.md files, auto memory, automatic compaction, the updater and nonessential traffic are off. Client retries stay at Claude Code's default.
- **Prompt.** `isolated` (the default) replaces Claude Code's system prompt with the evaluator's, which lists the declared tools, skills and context; `host` keeps Claude Code's and appends the skills listing and context. Claude Code still adds its own identity line and an environment note to every request; the note says whether a Git repository encloses the workspace, so keep results outside a repository (`--results`) when that matters. A local relay records each request in `<arm>/host-context.json`, with what Claude Code reported loading (`init`), and serves `context-text` expectations.
- **Skills.** Claude Code's own skill loader is off. Declared skills are listed in the system prompt; a body run's target arrives as the text Pi's `/skill:<name>` command expands to, recorded as an `explicit-skill-command` delivery.
- **Settings.** `settings` is a Claude Code settings object, passed with `--settings`. Settings that would replace the guard, permissions, login or environment, or load plugins, MCP servers or a status line, are refused (`hooks`, `permissions`, `env`, `apiKeyHelper`, `enabledPlugins` and the like).
- **Not supported yet:** `host.extensions`, runtime extension bundles, `freeflow`, `commands`, and `shell`.
