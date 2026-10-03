# Tool Execution

> **Covers:** `pi-extension/src/tool-execution/`, `runtime/prompts/tool-execution.md`
> **Tests:** `pi-extension/tests/tool-execution/`
> **Verified at:** `5bc17417` (2026-10-03)
> **User docs:** `plugin-docs/capabilities/tool-execution.md`

For contributors changing Tool Execution on Pi: what Freeflow adds around Pi's own tools, how each part hooks into Pi, and which of its behaviors are deliberate.

## Purpose

Pi's tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, and codemode, in which the model writes a script that calls tools) are a good working surface. What a strong harness adds around such tools is mostly not more tools. It adds knowledge of what the model has already seen, errors that say what to do next, a way to run long commands without blocking, and guidance on how to work. Tool Execution is that layer for Pi.

With one switch it adds:

- a **system prompt section** on working in the environment, plus platform and shell facts, with three of Pi's generic rule lines removed;
- **file tracking** around Pi's `read`, `edit` and `write`: a refused blind overwrite, a note when an edited file changed since it was read, and a notice when files the model read change behind it;
- **edit error rewrites** that show the closest lines and one next step;
- **`apply_patch`**, the patch tool OpenAI's Codex trains GPT models on;
- **background commands** (`bash_background`, `stop_background`) that notify the model when they exit;
- a **bash guard** that refuses a trailing `&` and long foreground `sleep`.

It deliberately does not:

- replace, rename or wrap any Pi tool: every Freeflow tool runs through Pi's own tool path, permissions and file-mutation queue;
- touch Pi's preamble, project context, skills, working directory, the user's prompt additions, or other extensions' tool guidelines;
- persist anything: file state is memory only and is rebuilt from the session;
- expose sub-switches: one capability, on or off.

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Effective | Tool Execution is configured on and Freeflow is enabled. | `ToolExecutionState.effective`, `toolExecutionEffective()` in `index.ts` |
| Observation | What the model last saw of a file: a content fingerprint, how it saw it, and the file's size and mtime. | `FileState` in `file-state.ts` |
| Fingerprint | SHA-256 of the content, or size and mtime above 8 MiB (`HASH_LIMIT_BYTES`), or `"absent"`. | `fingerprint()` |
| File key | A path resolved as Pi's tools resolve it, then through `realpath`, so `./a`, `a`, `@a` and a symlink are one file. | `resolveToolPath()`, `fileKey()` |
| Changed behind the model | An observed file whose content differs from the last observation and from the last notice. | `changedSinceNoticed()` |
| Nested call | A tool call a codemode script made; Pi reports it with a `parentToolCallId`. | `FileTracking.toolResult()` |
| Notice prefix | `[Freeflow notice, not from the user]`, marking harness messages so the model never reads them as the user's words. | `NOTICE_PREFIX` in `background.ts` |
| Steer | Pi's delivery mode that adds a message to a running agent loop after the current turn's tool results. | `deliverAs: "steer"` |
| Request path | Work done for every model request, in Pi's `context_with_system` hook. Tool Execution does none. | `index.ts` |
| Until-loop | The waiting pattern the guidance teaches: `until <check>; do sleep 1; done`, run with `bash_background`, so the model is notified once when the condition holds. | `bash-guard.ts`, `background.ts` descriptions |

## How It Works

### Configuration and declaration

`resolveToolExecutionConfig()` layers `toolExecution.enabled` from `.freeflow/config.json`, then `.freeflow/local.json`, then session scope. The default is off. On every `status()` call `applyToolExecutionTools()` declares `apply_patch`, `bash_background` and `stop_background` when effective and withdraws them when not. All three are registered once at load with `defaultActive: false`, so their definitions never change; only whether they are declared does.

### Prompt

In `before_agent_start` (`index.ts`), when effective:

1. `toolExecutionSections()` replaces two of Pi's sections in place: `rules` (Pi's rendering minus `REMOVED_RULES`: "Use read to examine files instead of cat or sed", "Be concise in your responses", "Show file paths clearly when working with files") and `docs` (shortened to one line pointing at Pi's documentation).
2. After `freeflow_guidance` (Freeflow's own fixed system section; see [Prompt assembly](prompt-assembly.md)), `toolExecutionTail()` appends `environment` (platform, OS release, the shell Pi's `bash` uses) and `tool_execution`, the text of `runtime/prompts/tool-execution.md` ("Working In The Environment": search and read, command output, running the code, editing, background commands).

Every value comes from the configuration and the machine, so the system prompt is the same on every request.

### File tracking

`FileTracking` (`file-tracking.ts`) wraps one `FileState` and hooks four events:

- **`tool_call`** for `edit` and `write`: builds state if needed. It refuses a `write` over an existing file the model has not read (with the text of `writeRefusal()` in `edit-messages.ts`), and remembers, by tool call id, when the target changed since it was observed.
- **`tool_result`**:
  - for `read`, `edit` and `write` (direct or nested): records an observation of the path. After an `edit` it appends "No need to re-read …", and after an `edit` or `write` whose target had changed it appends a note that the change applied to the current text.
  - for a failed `edit`: rewrites Pi's not-found or not-unique error (`rewriteEditError()`).
  - for any other tool (not nested): appends `changedFilesNotice()` to that tool's own result when observed files changed behind the model, so a `bash` command that changed a file the model read reports it on its own result. Nested non-tracked calls are skipped; the script's own result carries the notice. Appended lines carry no notice prefix: they are part of the tool's result.
- **`before_agent_start`**: `changedNotice(ctx, false)` returns a `freeflow-files` message for files that changed between prompts. The `false` means it never builds state here, because a branch not yet built has no baseline to compare against.
- **`turn_end`**: clears remembered changed targets.

State is built lazily from the branch by `rebuild()`, which replays successful `read`, `edit`, `write` and `apply_patch` calls and observes today's content. A Freeflow compaction (see [Compaction](compaction.md)) resets it to the files it carried into the next cycle, both live (`compacted()`) and on rebuild. Navigation (`session_tree`) invalidates it; Pi's own compaction keeps it, because the branch and the files are unchanged.

### Edit error rewrites

`rewriteEditError()` recognizes exactly two of Pi's `edit` error wordings, by regular expression:

- **Not found:** shows the closest window of lines (bigram similarity at least 0.5, at most 20 lines of 300 characters) and says to retry with text copied from them, or to read the region first.
- **Not unique:** names every matching line, compared with Pi's own fuzzy normalization (`normalizeForMatch()`, a copy of Pi's unexported function), and says how to match one place or every place.

Any other error, or a wording Pi changes, passes through unchanged.

### `apply_patch`

`apply-patch/` ports Codex's grammar (byte-identical), lenient parser and four-pass hunk matcher. GPT-5 and later models on OpenAI endpoints receive the tool as Codex's grammar-constrained freeform tool (`constrainedSampling`); other models receive a function with one `input` string. `applyPatch()`:

1. Parses the whole patch.
2. Takes Pi's per-file mutation queue for every path, in sorted order so two patches never deadlock.
3. Plans every section against current files, with later sections seeing earlier ones.
4. Writes only if the plan succeeds.

Planning refuses an Add over an existing file the model has not read, a Move onto an existing file, a missing file for Update or Delete, and non-UTF-8 text. A write failure stops the patch and reports it as `partial`, naming each file as written, not written, or failed. Written paths are recorded as observations.

### Background commands

`BackgroundJobs` (`background.ts`) runs a command through Pi's own shell backend (`createLocalBashOperations()`), so it gets the same shell, environment and process-tree kill as `bash`. Output streams to `<tmpdir>/freeflow/<session>/background/<id>.output`; the folder has mode 0700, the file 0600, and it ends with an exit trailer. At most 16 run at once (`MAX_RUNNING`).

On exit, `notify()` sends a `freeflow-background` message:

- mid-run, it is steered in after the current turn's tool results;
- when idle, it starts a turn as a user message (see Decisions).

A command stopped through `stop_background` or at session end sends no notice. `stopAll()` runs at `session_shutdown`. After Pi's own compaction, `restate()` lists the running commands once; a Freeflow compaction names them in its summary instead.

### Bash guard

In `tool_call` for `bash`, after the routing gate (Cognitive Routing's check of which tools the current profile may call), `backgroundRefusal()` blocks a command ending in a single `&`, or a `sleep` of 10 seconds or more wherever a command starts: at the beginning or after `;`, `&`, `|`, `&&`, `||`, `(`, `{`, `then` or `do`. So `foo && sleep 30` is refused, and a long foreground `npm test` is not. The refusal points to `bash_background` and the until-loop.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| Keep Pi's tools and add a layer through hooks; build only what Pi lacks (`apply_patch`, background commands). | Pi's tools match Claude Code's where it matters. The advantage of a strong harness is the file-state layer and guidance around the tools. Replacing tools Pi maintains would break codemode and other extensions that rely on them. | Claude Code-style replacement tools; the earlier Execution Runtime v2 (its own read, search, patch and script tools, output capture, a session store), which Pi 0.99's codemode, tool exposure and saved truncated output overlapped. | `ca1cc90`, `48a9387`; v2 kept in `.deprecated/tool-execution-v2/` |
| One switch for the whole layer. | Users get complete workflows without internal seams as settings. | Sub-switches per part. | `ca1cc90` |
| Replace Pi's `rules` and `docs` sections in place, add `environment` and `tool_execution` after Freeflow's guidance; never touch Pi's preamble. | Three of Pi's generic lines contradict the taught working style (bash-first reading, full reports). The Claude subscription plugin shapes prompts only when Pi's preamble is present. Replacing the whole prompt would drop project context, skills and other extensions' guidelines. | Replacing Pi's whole prompt; removing the preamble. | `ccfe0be`, `f51aff6` |
| Guidance lives only in the system section, with no capability skill. | Nothing in it is needed only sometimes, and always-present, command-shaped text is the form that changes model behavior in Freeflow's research. | A Tool Execution skill or cue. | `f51aff6` |
| Both edit tools stay visible to every model. | Each model does best in the edit format it was trained on: GPT models in Codex's patch format, others in search-and-replace. | Per-family exposure, to be decided by a comparison run that has not happened. | `e4d1a62` |
| `apply_patch` plans the whole patch before writing. | A failed hunk then changes no file. A write failure after planning is reported as partial rather than hidden. | Applying section by section. | `e4d1a62` |
| File state: fingerprint per file in memory, rebuilt from the branch; nothing persisted. | The lowest-coordination way to know what the model saw. It is rebuilt after resume and navigation without a store. | A persisted session store (retired with v2). | `48a9387` |
| Notices for files changed behind the model are appended to the result of the next untracked tool (normally the command that changed them), or sent as a message at prompt start. | The model sees the fact when it next acts, and nothing earlier in the conversation is edited (prompt cache). | — | `3894a01` |
| Background exit notices start an idle turn as a user message. | A run started by an extension message loses Freeflow's system sections from its second request (Pi issue #10267). | `sendMessage` with `triggerTurn`. | `f41f1e0` |
| Freeflow does not set `TMPDIR`; background output goes to a per-session folder under the OS temp directory. | Pi's `bash` inherits the whole Pi process environment, so changing `TMPDIR` would change it for every tool, extension and MCP server. | Pointing `TMPDIR` at a session folder. | `fc32691` |
| Messages state the fact and one next step, with no reassurance. | The wording was reviewed against Freeflow's Beyond the Weights research on model behavior. | — | `48a9387`, `3894a01` |
| Settings of the retired v2 runtime still load and do nothing. | Existing configuration files stay valid. | Rejecting them. | `ca1cc90` |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| `write` over an unread existing file is refused, but `edit` is not. | `edit` must match the current text, so it cannot clobber what the model never saw; a whole-file `write` can. | Refusing `edit` adds a read for no protection; allowing `write` loses work. |
| `apply_patch` refuses an Add over an unread file, but allows an Update or Delete of one. | An Update's context lines must match the current text, like `edit`. An Add replaces the whole file, like `write`. No reason is recorded for allowing Delete. | — |
| An edit to a file that changed since it was read still applies. | The edit matched the current text, and the result says the file had changed, so the model can re-read if the change matters. | — |
| A changed file is reported once per change, not on every tool. | `noticed` remembers the fingerprint last reported. | Notice spam. |
| Unrecognized edit errors pass through unchanged. | The rewrite depends on Pi's exact wording, and a wrong rewrite is worse than Pi's text. | — |
| With Tool Execution off, Pi's prompt and every tool result are exactly Pi's. | The layer is opt-in. | `prompt-native.test.js` fails. |
| A trailing `&&` is not refused; a trailing `&` is. | Only a single `&` detaches a process. | — |

## Surface

**Configuration:** `toolExecution.enabled` (default `false`) in `.freeflow/config.json`, `.freeflow/local.json`, or session scope through `/freeflow settings`. Retired keys accepted and ignored without a warning: `capture`, `programs`, `workspace`, `discovery`, `adapters`, `accounting`. Any other key fails validation.

**Pi settings read:** `shellPath` (environment facts and background shell).

**Tools:**

| Tool | Parameters | Notes |
| --- | --- | --- |
| `apply_patch` | `input` (patch text) | Grammar form for GPT-5+ on OpenAI endpoints; `executionMode: "sequential"`; structured result with per-file outcomes. |
| `bash_background` | `command`, `description?` | Returns `{ id, outputPath }` at once. |
| `stop_background` | `id` | Returns after the process exits. |

All three have `exposure: "direct"` (callable from codemode) and refuse to run when Tool Execution is not effective.

**Prompt sections:** `rules`, `docs` (replaced), `environment`, `tool_execution` (added after `freeflow_guidance`).

**Messages:** `freeflow-files` (changed files at prompt start) and `freeflow-background` (exit notices and restatements), both starting with the notice prefix; and lines appended to tool results, without the prefix.

**Status:** `/freeflow status` shows the number of running background commands.

## State

- **Memory only:** `FileState` observations keyed by real path; `FileTracking.changed` (tool call id → path, cleared each turn) and `built`; `BackgroundJobs.jobs`.
- **On disk:** background output files under the OS temp directory, not cleaned up by Freeflow.
- **Session:** nothing of Tool Execution's own. File state is rebuilt from the branch's tool calls and Freeflow compaction records (`details.freeflow.carried`).
- **Reset:** `session_start` and `session_shutdown` reset file state; shutdown also stops all background commands, and nothing reports into the next session.

## Invariants

- No Pi tool is replaced or renamed, and every `apply_patch` write goes through Pi's file-mutation queue (`withLocks()` in `plan.ts`). Not tested directly.
- The system prompt and tool definitions are identical across requests within a configuration, and a later request extends the earlier one. Guarded by `prompt-native.test.js` and `apply-patch-native.test.js`.
- With Tool Execution off, Pi's prompt is untouched. Guarded by `prompt-native.test.js`.
- File state is never persisted and never read on the request path (`context_with_system`). No test; only the hooks above touch it.
- A planning failure in `apply_patch` writes nothing. Guarded by `apply-patch.test.js`.
- A changed file is reported once per change, on the result the model sees. Guarded by `changed-files-native.test.js`.
- Background commands never outlive the session or report into the next one. Guarded by `background.test.js`.

## Failure Behavior

| Failure | Result |
| --- | --- |
| Mandatory Freeflow prompts unavailable | Tool Execution is marked unavailable and not effective (`loadSurface()`). |
| A file cannot be stat'ed or read during tracking | Treated as absent; a previously observed file then reports as no longer existing. |
| The file cannot be read while rewriting an edit error | Pi's error passes through. |
| `apply_patch` parse or plan error | `not_applied`, nothing written, `isError: true`, one next step. |
| `apply_patch` write error | `partial`; files before it written, the failing file named, later files not attempted. |
| A background command cannot start (for example, the directory is gone) | The output file records the error and a notice says it failed to run. |
| A 17th background command | Refused with "stop one with stop_background". |
| The shell config cannot be resolved | The environment section says the shell is `unavailable`. |

## Cost

- `tool_result` for a non-tracked tool stats every observed file and hashes only files whose size or mtime moved. This grows with the number of files read in the session, not with session length.
- `before_agent_start` does the same once per prompt, and only after state was built.
- Nothing runs in `context_with_system`. See [Performance](../guides/performance.md) for the request-path rules.
- The prompt section is about 480 words of fixed text, written once and then read from the provider's cache.

## Code Map

- `pi-extension/src/tool-execution/`: the subsystem; its [README](../../pi-extension/src/tool-execution/README.md) lists each file.
  - `config.ts`: `resolveToolExecutionConfig()`, `validateToolExecutionConfig()`, `RETIRED_KEYS`.
  - `prompt.ts`: `toolExecutionSections()`, `toolExecutionTail()`, `REMOVED_RULES`.
  - `tools.ts`: `TOOL_EXECUTION_TOOLS`, `applyToolExecutionTools()`.
  - `file-state.ts`: `FileState`, `resolveToolPath()`, `touchedPaths()`, `HASH_LIMIT_BYTES`.
  - `file-tracking.ts`: `FileTracking` (`toolCall`, `toolResult`, `changedNotice`, `compacted`, `forPatch`, `written`).
  - `edit-messages.ts`: `rewriteEditError()`, `closestMatch()`, `matchingLines()`, `normalizeForMatch()`, and every message text (`writeRefusal()`, `changedAfterEdit()`, `noNeedToReread()`, `changedFilesNotice()`).
  - `background.ts`: `BackgroundJobs`, `registerBackgroundTools()`, `NOTICE_PREFIX`, `MAX_RUNNING`.
  - `bash-guard.ts`: `backgroundRefusal()`, `LONGEST_FOREGROUND_SLEEP_S`.
  - `apply-patch/`: `grammar.ts`, `parser.ts`, `match.ts` (Codex ports), `plan.ts` (`applyPatch()`), `tool.ts` (`registerApplyPatch()`). Its [README](../../pi-extension/src/tool-execution/apply-patch/README.md) records the upstream commit and license.
- `pi-extension/src/index.ts`: wiring. `before_agent_start` (prompt sections, prompt-time notice), `tool_call` (routing gate, bash guard, `FileTracking.toolCall()`), `tool_result`, `turn_end`, `session_tree`, `session_compact` (restatement), `session_shutdown`, and the background host's `send`.
- `runtime/prompts/tool-execution.md`: the guidance text.
- `pi-extension/src/compaction/`: shares `resolveToolPath()` and `touchedPaths()` for carried files and file lists.

## Tests

See [the tests README](../../pi-extension/tests/tool-execution/README.md). In short: `prompt-native.test.js` (sections on and off), `file-state.test.js` and `file-tracking-native.test.js` (observations, write refusal, changed-since-read, edit error rewrites against Pi's real `edit`), `changed-files-native.test.js` (notices after other tools), `apply-patch.test.js` and `apply-patch-native.test.js` (parser, matcher, declaration, grammar form), `background.test.js` and `background-native.test.js` (limits, exit codes, stop, shutdown, notices in a real session), `bash-guard.test.js`.

## Limits

- Whether the guidance or the two edit tools improve task results, turns, tokens or cost has not been measured.
- The edit error rewrite depends on Pi's error wording. A Pi upgrade that changes it fails `file-tracking-native.test.js` ("edit errors become one next action"), which runs Pi's real `edit`; without the test run, the rewrite would silently stop applying.
- When a command changes a file the model read, the model is told the file changed, not given its new content, even if the command printed it.
- Background output files are left in the OS temp directory.
- Harness gaps against Claude Code that are not built: a watch tool for long-running output, progress nudges, point-of-use lines on Pi's tools, git status facts, and a backstop for oversized results.

## Changes

- `f51aff6` (2026-09-30): "Working In The Environment" as its own system section; the Tool Execution skill retired.
- `3894a01` (2026-09-30): notices for files changed behind the model; bash guard; notice prefix.
- `fc32691` (2026-09-30): background commands.
- `e4d1a62` (2026-09-30): `apply_patch`.
- `48a9387` (2026-09-30): file tracking and edit error rewrites.
- `ccfe0be` (2026-09-30): prompt sections.
- `ca1cc90` (2026-09-30): Execution Runtime v2 retired to `.deprecated/tool-execution-v2/`.
