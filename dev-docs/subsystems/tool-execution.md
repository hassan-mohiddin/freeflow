# Tool Execution

> **Covers:** `pi-extension/src/tool-execution/`, `runtime/prompts/tool-execution.md`
> **Tests:** `pi-extension/tests/tool-execution/`
> **Verified at:** `5728b9aa` (2026-10-12)
> **User docs:** `plugin-docs/capabilities/tool-execution.md`

For contributors changing Tool Execution on Pi: what Freeflow adds around Pi's own tools, how each part hooks into Pi, and which of its behaviors are deliberate.

## Purpose

Pi's tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, and codemode, in which the model writes a script that calls tools) are a good working surface. What a strong harness adds around such tools is mostly not more tools. It adds knowledge of what the model has already seen, errors that say what to do next, a way to run long commands without blocking, and guidance on how to work. Tool Execution is that layer for Pi.

With one switch it adds:

- a **system prompt section** on working in the environment, plus platform and shell facts, with three of Pi's generic rule lines removed;
- **file tracking** around Pi's `read`, `edit` and `write`: a refused blind overwrite, a note when an edited file changed since it was read, a notice when files the model read change behind it, and one line instead of a Freeflow skill or prompt the model already holds;
- **edit error rewrites** that show the closest lines and one next step;
- **`apply_patch`**, the patch tool OpenAI's Codex trains GPT models on;
- **background commands** (`bash_background`, `stop_background`) that notify the model when they exit, and **monitors** (`monitor`) that deliver each line a command prints as it happens;
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
| Instruction file | A file under the Freeflow package's `capabilities/`, `skills/` or `runtime/`, matched by path as written (after `@` and `~`) against the package root and its real path, with no file system access. | `instructionPath()`, `isFreeflowInstruction()` in `skill-reads.ts` |
| Skill read | The text of an instruction file the model holds in this context: its first line, its lines, and whether it ran to the end of the file. | `SkillReads` in `skill-reads.ts` |
| Notice tag | `<freeflow-notice type="…">…</freeflow-notice>`, marking Freeflow's notices so the model never reads them as the user's words: Pi gives the model every custom message in the user role. Freeflow's guidance says what the tag means. Notices in saved sessions may still start with the earlier `[Freeflow notice, not from the user]`, which rows still read. | `freeflowNotice()`, `LEGACY_NOTICE_PREFIX` in `host/inbound.ts` |
| Steer | Pi's delivery mode that adds a message to a running agent loop after the current turn's tool results. | `deliverAs: "steer"` |
| Request path | Work done for every model request, in Pi's `context_with_system` hook. Tool Execution does none. | `index.ts` |
| Until-loop | The waiting pattern the guidance teaches: `until <check>; do sleep 1; done`, run with `bash_background`, so the model is notified once when the condition holds. | `bash-guard.ts`, `background.ts` descriptions |

## How It Works

### Configuration and declaration

`resolveToolExecutionConfig()` layers `toolExecution.enabled` from `.freeflow/config.json`, then `.freeflow/local.json`, then session scope. The default is on (`DEFAULT_TOOL_EXECUTION_CONFIG`). On every `status()` call `applyToolExecutionTools()` declares `apply_patch`, `bash_background` and `stop_background` when effective and withdraws them when not. All three are registered once at load with `defaultActive: false`, so their definitions never change; only whether they are declared does.

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
  - for a successful top-level `read` of an instruction file: see Repeat reads of Freeflow instructions.
  - for a failed `edit`: rewrites Pi's not-found or not-unique error (`rewriteEditError()`).
  - for any other tool (not nested): appends `changedFilesNotice()` to that tool's own result when observed files changed behind the model, so a `bash` command that changed a file the model read reports it on its own result. Nested non-tracked calls are skipped; the script's own result carries the notice. Appended lines carry no notice tag: they are part of the tool's result.
- **`before_agent_start`**: `changedNotice(ctx, false)` returns a `freeflow-files` message for files that changed between prompts. The `false` means it never builds state here, because a branch not yet built has no baseline to compare against.
- **`turn_end`**: clears remembered changed targets.

State is built lazily from the branch by `rebuild()`, which replays successful `read`, `edit`, `write` and `apply_patch` calls and observes today's content. A Freeflow compaction (see [Compaction](compaction.md)) resets it to the files it carried into the next cycle, both live (`compacted()`) and on rebuild. Navigation (`session_tree`) invalidates it; Pi's own compaction keeps it, because the branch and the files are unchanged.

### Repeat reads of Freeflow instructions

Agents re-read Freeflow's skills while the text is still in their context: in October 2026 sessions, 43% of skill reads were repeats in the same context, 91% of them right after a new user message. `SkillReads` (`skill-reads.ts`, held by `FileTracking`) answers such a read with one line instead of the text.

- **Recording.** A successful top-level `read` of an instruction file records the text the model saw: its first line (from `offset`, as Pi counts it), its lines, and whether it ran to the end of the file. Pi's trailing "[N more lines in file. Use offset=… to continue.]" note after a `limit` is stripped first. A read Pi truncated (`details.truncation.truncated` or `firstLineExceedsLimit`), an image, or an unusual `offset` or `limit` records nothing.
- **Answering.** A new read is answered when an earlier record's lines contain its lines at the same line numbers, compared by content. A read that runs to the end of the file is answered only by a record that ended on the same line and reached the end too, so a file that lost lines passes through. The result becomes `alreadyInContext()`: the whole file is "unchanged since you read it earlier in this conversation", or lines `a`-`b` are, then "Use that copy.", then Pi's continue note when the read had one. `details.freeflowSkillRead` marks the replacement. Changed text passes through, and is recorded too.
- **Not answered:** nested reads (the script consumes the text, and nothing is recorded), failed reads, and any read while the request's view is selective: `selectiveView` in `index.ts` is true for a Coordinator under projection, whose view leaves out the workers' reads. Its reads are still recorded, because they are in the history workers see.
- **Lifetime.** Records are rebuilt from the branch in `ensureBuilt()` (and by `loadedSkills()`): successful top-level reads after the latest `compaction` entry of any kind, skipping results marked `freeflowSkillRead`. A Freeflow compaction (`compacted()`) and Pi's own compaction (`piCompacted()` from `session_compact`) clear them; navigation invalidates them; `reset()` drops them.

`loadedSkills()` names the skills whose `SKILL.md` is recorded, sorted (live records follow the order parallel reads complete, a rebuild the branch order, so an unsorted list could change at a resume with nothing new read), for the Runtime State line `Freeflow skills read in this context: …` ([Prompt assembly](prompt-assembly.md)). `index.ts` takes it in `update()` only, the point where the state refreshes anyway (run start and end, settings changes, compaction, navigation), so a skill read mid-run adds no state message, and leaves it empty while routing projection is on, because every profile shares the state.

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

`BackgroundJobs` (`background.ts`) runs a command through Pi's own shell backend (`createLocalBashOperations()`), so it gets the same shell, environment and process-tree kill as `bash`. Output streams to `<tmpdir>/freeflow/<session>/background/<id>.output`; the folder has mode 0700, the file 0600, and it ends with an exit trailer. At most 16 run at once (`MAX_RUNNING`), counting starts still opening their output file, so starts racing for the last slot cannot pass the limit. A start still opening its file when the session ends does not run.

On exit, `notify()` sends a `freeflow-background` notice through the inbound channel (`host/inbound.ts`, see [Ask user and the inbound channel](ask-user.md)), drawn in the transcript as one line:

- mid-run, it is steered in after the current turn's tool results;
- when idle, it starts a turn as the same custom message (see Decisions).

A command stopped through `stop_background` or at session end sends no notice. `stopAll()` runs at `session_shutdown`. After Pi's own compaction, `restate()` lists the running commands once; a Freeflow compaction names them in its summary instead.

### Monitors

`monitor()` is Claude Code's Monitor on the same `BackgroundJobs`: same shell, output file, ID space (`mon…` beside `bg…`), the 16-job limit, `stop_background`, restatement and shutdown. It differs in three ways:

- **Events.** Each non-empty stdout line goes to the host's `event()`, which delivers it through the inbound channel under the key `monitor:<id>`: lines within 200 ms join one `freeflow-monitor` notice (`eventText()`: a header naming the monitor, at most 40 lines, then a pointer to the output file for the rest; a line over 1,000 characters is cut). A notice wakes an idle agent (spec O-6). Output is decoded per monitor, so a character split across two reads arrives whole. An unfinished line keeps only the text after its last carriage return, as a terminal shows it, capped at 4,000 characters: a progress bar redrawn with `\r` sends no events and holds no growing buffer, and the output file keeps everything. A partial last line is delivered at exit, and `endEvents()` flushes pending lines before the end notice, so the end notice always comes last; a monitor that has exited is not stopped for its rate limit while those last lines go out. At session end its pending lines are dropped (`discardEvents()`) instead. Output lines cannot open or close a `<freeflow-notice>` tag (`withoutNoticeTags()`), so a watched log cannot fake one of Freeflow's notices.
- **Stderr** goes to the output file only: the command runs as `{ command } 2>> <output>`, and both writers append.
- **Its own end.** `timeout_ms` (default 5 minutes, at most 30) and the rate limit (more than 20 notices in a minute, `MONITOR_PER_MINUTE`) stop it through `halt()`, with one `freeflow-background` notice saying why and how to continue. An exit sends one notice with the code and the event count; a stop through `stop_background` or at session end sends none.

### Bash guard

In `tool_call` for `bash`, after the routing gate (Cognitive Routing's check of which tools the current profile may call), `backgroundRefusal()` blocks a command ending in a single `&`, or a `sleep` of 10 seconds or more wherever a command starts: at the beginning or after `;`, `&`, `|`, `&&`, `||`, `(`, `{`, `then` or `do`. So `foo && sleep 30` is refused, and a long foreground `npm test` is not. The refusal points to `bash_background` and the until-loop.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| On by default whenever Freeflow is enabled. | The user's choice after using it in their own sessions (2026-10-12); its guidance and tools are fixed per configuration, so they are cached after the first request. Messaging and Task Memory stay off. | Off by default (0.8.0). | Task 005 D-003 |
| Keep Pi's tools and add a layer through hooks; build only what Pi lacks (`apply_patch`, background commands). | Pi's tools match Claude Code's where it matters. The advantage of a strong harness is the file-state layer and guidance around the tools. Replacing tools Pi maintains would break codemode and other extensions that rely on them. | Claude Code-style replacement tools; the earlier Execution Runtime v2 (its own read, search, patch and script tools, output capture, a session store), which Pi 0.99's codemode, tool exposure and saved truncated output overlapped. | `ca1cc90`, `48a9387`; v2 kept in `.deprecated/tool-execution-v2/` |
| One switch for the whole layer. | Users get complete workflows without internal seams as settings. | Sub-switches per part. | `ca1cc90` |
| Replace Pi's `rules` and `docs` sections in place, add `environment` and `tool_execution` after Freeflow's guidance; never touch Pi's preamble. | Three of Pi's generic lines contradict the taught working style (bash-first reading, full reports). The Claude subscription plugin shapes prompts only when Pi's preamble is present. Replacing the whole prompt would drop project context, skills and other extensions' guidelines. | Replacing Pi's whole prompt; removing the preamble. | `ccfe0be`, `f51aff6` |
| Guidance lives only in the system section, with no capability skill. | Nothing in it is needed only sometimes, and always-present, command-shaped text is the form that changes model behavior in Freeflow's research. | A Tool Execution skill or cue. | `f51aff6` |
| Both edit tools stay visible to every model. | Each model does best in the edit format it was trained on: GPT models in Codex's patch format, others in search-and-replace. | Per-family exposure, to be decided by a comparison run that has not happened. | `e4d1a62` |
| `apply_patch` plans the whole patch before writing. | A failed hunk then changes no file. A write failure after planning is reported as partial rather than hidden. | Applying section by section. | `e4d1a62` |
| File state: fingerprint per file in memory, rebuilt from the branch; nothing persisted. | The lowest-coordination way to know what the model saw. It is rebuilt after resume and navigation without a store. | A persisted session store (retired with v2). | `48a9387` |
| Notices for files changed behind the model are appended to the result of the next untracked tool (normally the command that changed them), or sent as a message at prompt start. | The model sees the fact when it next acts, and nothing earlier in the conversation is edited (prompt cache). | — | `3894a01` |
| Background exit notices start an idle turn as a Freeflow custom message. | A user message would read as the user's words; `keepSections()` keeps Freeflow's system sections on the run Pi starts (Pi issue #10267). | Starting the turn as a user message (the earlier workaround). | Task 002 D-008 |
| Freeflow does not set `TMPDIR`; background output goes to a per-session folder under the OS temp directory. | Pi's `bash` inherits the whole Pi process environment, so changing `TMPDIR` would change it for every tool, extension and MCP server. | Pointing `TMPDIR` at a session folder. | `fc32691` |
| A repeat read of a Freeflow instruction file the model already holds returns one line; any other file's read is Pi's. | Instruction files are large, read often, and their reads are excluded from compaction's carry and result index as how the agent works, not what it worked on. Comparing the text the model saw, not a file hash, holds across file changes and package rebuilds with no file reads. | Answering repeat reads of every file (a project file's earlier read may be what the model needs to see again after its own edits); a file hash per read. | Skill re-reads, October 2026 |
| Skill reads are forgotten at any compaction, including Pi's, whose kept tail may still hold some. | A read the model may not have costs a failed step; a repeat read costs only tokens. | Keeping reads in Pi's kept tail. | Skill re-reads, October 2026 |
| The Runtime State's skills line changes only where the state refreshes anyway, and is left out under routing projection. | Each state change appends a whole state copy (about 100 to 200 tokens) after earlier input; a skill read is about 2,600 tokens. The state is shared by every profile, and the Coordinator's projected view lacks workers' reads. | Updating the line on every read; a line per profile. | Skill re-reads, October 2026 |
| Messages state the fact and one next step, with no reassurance. | The wording was reviewed against Freeflow's Beyond the Weights research on model behavior. | — | `48a9387`, `3894a01` |
| Settings of the retired v2 runtime still load and do nothing. | Existing configuration files stay valid. | Rejecting them. | `ca1cc90` |
| The prompt section does not repeat habits the Working Method states, such as trying a new script on a case whose answer is known. | Pi sends the Working Method whenever Freeflow is on, so a repeated line is paid for twice on every request (Write Skill's Guidance Placement). The section keeps the mechanics of working in the environment. | Keeping both copies. | Context cut, October 2026 |
| A monitor's guidance (when to use it instead of `bash_background`, flushing each pipe stage, matching failures as well as success) lives in its tool description, not in the prompt section or Verify Work. | It is needed only when choosing or writing a watch, where the description is read; Working Method already states the general rule that a check proves only what it could have caught (Write Skill's Guidance Placement). | A line in the always-sent prompt section; a Verify Work rule. | Task 002 |
| Monitor notices wake an idle agent, bounded by 20 notices a minute and 40 lines a notice. | A watch that cannot wake the agent cannot report a failure while it waits (spec O-6); each wake is a model request, so the limit bounds the cost. | Holding idle events until the next turn. | Task 002 |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| `write` over an unread existing file is refused, but `edit` is not. | `edit` must match the current text, so it cannot clobber what the model never saw; a whole-file `write` can. | Refusing `edit` adds a read for no protection; allowing `write` loses work. |
| `apply_patch` refuses an Add over an unread file, but allows an Update or Delete of one. | An Update's context lines must match the current text, like `edit`. An Add replaces the whole file, like `write`. No reason is recorded for allowing Delete. | — |
| An edit to a file that changed since it was read still applies. | The edit matched the current text, and the result says the file had changed, so the model can re-read if the change matters. | — |
| A changed file is reported once per change, not on every tool. | `noticed` remembers the fingerprint last reported. | Notice spam. |
| Unrecognized edit errors pass through unchanged. | The rewrite depends on Pi's exact wording, and a wrong rewrite is worse than Pi's text. | — |
| With Tool Execution off, Pi's prompt and every tool result are exactly Pi's. | The layer is opt-in. | `prompt-native.test.js` fails. |
| A Coordinator under projection reads a skill it read earlier in full again. | Its view is selective; see Repeat reads of Freeflow instructions. | It is told to use a copy its view may not hold. |
| A codemode script's read of a skill gets the whole text even when the model holds it. | The script consumes the text, not the model. | A script receives one line where it expected a file. |
| The Runtime State lists no skill read during the current run. | The line changes only where the state refreshes anyway (see Decisions). | A state copy appended per skill read. |
| A trailing `&&` is not refused; a trailing `&` is. | Only a single `&` detaches a process. | — |
| A monitor's stderr lines are not events. | Error output is usually noise for a watch; a watch that needs it redirects it (`2>&1`) into the filter. | — |

## Surface

**Configuration:** `toolExecution.enabled` (default `true`) in `.freeflow/config.json`, `.freeflow/local.json`, or session scope through `/freeflow settings`. Retired keys accepted and ignored without a warning: `capture`, `programs`, `workspace`, `discovery`, `adapters`, `accounting`. Any other key fails validation.

**Pi settings read:** `shellPath` (environment facts and background shell).

**Tools:**

| Tool | Parameters | Notes |
| --- | --- | --- |
| `apply_patch` | `input` (patch text) | Grammar form for GPT-5+ on OpenAI endpoints; `executionMode: "sequential"`; structured result with per-file outcomes. |
| `bash_background` | `command`, `description?` | Returns `{ id, outputPath }` at once. |
| `monitor` | `command`, `description`, `timeout_ms?` | Returns `{ id, outputPath, timeoutMs }` at once; its description carries the guidance (see Decisions). |
| `stop_background` | `id` | Stops a background command or monitor; returns after the process exits. |

All four have `exposure: "direct"` (callable from codemode) and refuse to run when Tool Execution is not effective.

**Prompt sections:** `rules`, `docs` (replaced), `environment`, `tool_execution` (added after `freeflow_guidance`).

**Messages:** `freeflow-files` (changed files at prompt start), `freeflow-background` (exit, expiry and limit notices and restatements) and `freeflow-monitor` (monitor events), each wrapped in the notice tag; and lines appended to tool results, without it.

**Status:** `/freeflow status` shows the number of running background commands and monitors.

## State

- **Memory only:** `FileState` observations keyed by real path; `FileTracking.changed` (tool call id → path, cleared each turn) and `built`; `SkillReads` records keyed by the instruction file's path inside the package, and its `built`; `BackgroundJobs.jobs`.
- **On disk:** background output files under the OS temp directory, not cleaned up by Freeflow.
- **Session:** nothing of Tool Execution's own. File state is rebuilt from the branch's tool calls and Freeflow compaction records (`details.freeflow.carried`).
- **Reset:** `session_start` and `session_shutdown` reset file state; shutdown also stops all background commands, and nothing reports into the next session.

## Invariants

- No Pi tool is replaced or renamed, and every `apply_patch` write goes through Pi's file-mutation queue (`withLocks()` in `plan.ts`). Not tested directly.
- The system prompt and tool definitions are identical across requests within a configuration, and a later request extends the earlier one. Guarded by `prompt-native.test.js` and `apply-patch-native.test.js`.
- With Tool Execution off, Pi's prompt is untouched. Guarded by `prompt-native.test.js`.
- File state is never persisted and never read on the request path (`context_with_system`). No test; only the hooks above touch it.
- A repeat read is answered only for a top-level read whose exact text an earlier read since the latest compaction showed at the same line numbers, and never in a selective view. Guarded by `skill-reads.test.js` and `skill-reads-native.test.js`.
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
| A 17th background command or monitor | Refused with "stop one with stop_background". |
| A monitor prints more than 20 notices' worth in a minute | Stopped; one notice says to filter its output and start it again. |
| A monitor reaches `timeout_ms` | Stopped; one notice gives the event count and says to start it again to keep watching. |
| The shell config cannot be resolved | The environment section says the shell is `unavailable`. |

## Cost

- `tool_result` for a non-tracked tool stats every observed file and hashes only files whose size or mtime moved. This grows with the number of files read in the session, not with session length.
- `before_agent_start` does the same once per prompt, and only after state was built.
- An instruction-file read compares its lines with that file's earlier records, with no file system access; a rebuild walks the branch once per navigation, resume or invalidation. `loadedSkills()` returns the recorded skill names.
- Nothing runs in `context_with_system`. See [Performance](../guides/performance.md) for the request-path rules.
- The prompt section is about 460 words of fixed text, written once and then read from the provider's cache.

## Code Map

- `pi-extension/src/tool-execution/`: the subsystem; its [README](../../pi-extension/src/tool-execution/README.md) lists each file.
  - `config.ts`: `resolveToolExecutionConfig()`, `validateToolExecutionConfig()`, `RETIRED_KEYS`.
  - `prompt.ts`: `toolExecutionSections()`, `toolExecutionTail()`, `REMOVED_RULES`.
  - `tools.ts`: `TOOL_EXECUTION_TOOLS`, `applyToolExecutionTools()`.
  - `file-state.ts`: `FileState`, `resolveToolPath()`, `touchedPaths()`, `HASH_LIMIT_BYTES`.
  - `file-tracking.ts`: `FileTracking` (`toolCall`, `toolResult`, `changedNotice`, `compacted`, `piCompacted`, `loadedSkills`, `forPatch`, `written`).
  - `skill-reads.ts`: `SkillReads` (`result`, `rebuild`, `clear`, `skills`), `instructionPath()`, `isFreeflowInstruction()` (shared with compaction's result index), `skillName()`, `skillsRead()` (shared with the compaction summary).
  - `edit-messages.ts`: `rewriteEditError()`, `closestMatch()`, `matchingLines()`, `normalizeForMatch()`, and every message text (`writeRefusal()`, `changedAfterEdit()`, `noNeedToReread()`, `changedFilesNotice()`).
  - `background.ts`: `BackgroundJobs` (`start()`, `monitor()`, `stop()`, `restate()`), `registerBackgroundTools()`, `freeflowNotice` (re-exported), `MAX_RUNNING`, the `MONITOR_*` limits.
  - `bash-guard.ts`: `backgroundRefusal()`, `LONGEST_FOREGROUND_SLEEP_S`.
  - `apply-patch/`: `grammar.ts`, `parser.ts`, `match.ts` (Codex ports), `plan.ts` (`applyPatch()`), `tool.ts` (`registerApplyPatch()`). Its [README](../../pi-extension/src/tool-execution/apply-patch/README.md) records the upstream commit and license.
- `pi-extension/src/index.ts`: wiring. `before_agent_start` (prompt sections, prompt-time notice), `tool_call` (routing gate, bash guard, `FileTracking.toolCall()`), `tool_result`, `turn_end`, `session_tree`, `session_compact` (restatement), `session_shutdown`, and the background host's `send`, `event` and `endEvents`.
- `runtime/prompts/tool-execution.md`: the guidance text.
- `pi-extension/src/compaction/`: shares `resolveToolPath()` and `touchedPaths()` for carried files and file lists.

## Tests

See [the tests README](../../pi-extension/tests/tool-execution/README.md). In short: `prompt-native.test.js` (sections on and off), `file-state.test.js` and `file-tracking-native.test.js` (observations, write refusal, changed-since-read, edit error rewrites against Pi's real `edit`), `changed-files-native.test.js` (notices after other tools), `skill-reads.test.js` and `skill-reads-native.test.js` (repeat reads answered, changed or partial text, truncation, nested calls, compactions, a Coordinator under projection, rebuild after resume, the Runtime State line), `apply-patch.test.js` and `apply-patch-native.test.js` (parser, matcher, declaration, grammar form), `background.test.js`, `monitor.test.js` and `background-native.test.js` (limits, exit codes, stop, shutdown, monitor events, batching, expiry and rate limit, notices in a real session), `bash-guard.test.js`.

## Limits

- Whether the guidance or the two edit tools improve task results, turns, tokens or cost has not been measured.
- The edit error rewrite depends on Pi's error wording. A Pi upgrade that changes it fails `file-tracking-native.test.js` ("edit errors become one next action"), which runs Pi's real `edit`; without the test run, the rewrite would silently stop applying.
- When a command changes a file the model read, the model is told the file changed, not given its new content, even if the command printed it.
- Background output files are left in the OS temp directory.
- Harness gaps against Claude Code that are not built: a watch tool for long-running output, progress nudges, point-of-use lines on Pi's tools, git status facts, and a backstop for oversized results.

## Changes

- October 2026: repeat reads of Freeflow instruction files answered with one line; the skills line in the Runtime State.
- Task 002 (2026-10-11): monitors.
- `f51aff6` (2026-09-30): "Working In The Environment" as its own system section; the Tool Execution skill retired.
- `3894a01` (2026-09-30): notices for files changed behind the model; bash guard; notice prefix.
- `fc32691` (2026-09-30): background commands.
- `e4d1a62` (2026-09-30): `apply_patch`.
- `48a9387` (2026-09-30): file tracking and edit error rewrites.
- `ccfe0be` (2026-09-30): prompt sections.
- `ca1cc90` (2026-09-30): Execution Runtime v2 retired to `.deprecated/tool-execution-v2/`.
