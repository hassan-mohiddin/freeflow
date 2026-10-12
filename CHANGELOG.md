# Changelog

## Unreleased

### Breaking Changes

- Review Artifact is merged into Review Work, and `/review-artifact` is removed: use `/review-work`, which now reviews code and other finished work as well as documents that guide later work (specs, plans, designs, decision records, handoffs and skills). Its rules, review budget and judgments are unchanged; each kind keeps its own sources, job checks and lenses, and one reviewer contract and one adjudication reference cover both.
- Evaluate Skill definitions are schema 2, and schema 1 files no longer load: rewrite them in the new shape. A group is now a task (prompt, fixture, tools, expectations) plus a `configuration` (host, model, the skill under test, and optionally Freeflow and a runtime); `arms.baseline` and `arms.candidate` each overlay it, and `component` names the only paths where the two may differ, such as `subject.source` or `model.thinking`. A group whose arms differ anywhere else, or that declares a difference that is not there, is refused before anything runs, and `component: []` runs the same configuration twice to measure run-to-run variation. `extends` shares one configuration file across groups. The evaluation definition schema reference shows the full shape.
- `skill-eval run` refuses, before anything starts, a run whose inputs are not committed: the definition files, the fixture, runtime bundles, and working-tree skills and context must match the repository's commit, which the result then records. Add `--dry-run` to run anyway; the result is marked as a dry run and supports no claim. A configuration's `host.version`, when declared, must match the installed `pi --version`.

### Added

- Adds Task Memory on native Pi as a preview, off by default (the Task Memory switch in `/freeflow settings`, or `taskMemory.enabled`). A session attaches the Working Records it works on; Freeflow delivers the focused record's resume view when it becomes the focus and after a compaction, reload, resume, fork or `/tree` navigation, and refuses record writes to records the session has not attached. Projects group tasks, with records under `~/.freeflow` (or `FREEFLOW_HOME`), IDs such as `my-app/task-003` and one owning session each; each task's resume view lists the project's other tasks, which the agent reads and searches when they bear on its work. Fan-out creates a child record with its own Git worktree and branch for a parallel session and gives a command to paste into a new terminal, where Pi offers to attach the child. Everything can be asked for in plain language ("list my projects", "open the retry task", "split the parser off"): the agent proposes, and anything that creates something or lets the session write opens a dialog for the user to confirm. `/freeflow task` and `/freeflow project` commands do the same directly. Task-memory steps and delivered resume views show as one line in the transcript and expand to the full text.
- Track Work gains projects, child records, task IDs, worktree fan-out (with a start command for the host's agent) and record search as `working-record.mjs` commands on every host, and `view entry <ID>` to read closed History entries by ID.
- On Codex, Claude Code, Gemini CLI, Cursor, and GitHub Copilot, a `prompts` setting in `.freeflow/config.json` or `.freeflow/local.json` turns each of Freeflow's session-start prompts on or off: `core`, `interactionContract`, and `workingMethod`, each on by default. Pi always delivers all of them.
- Task Memory works under automatic Cognitive Routing: the Coordinator handles task memory with you, Helper and Executor workers only read it and put any action they need in their report, and every profile receives the focused record's resume view, also after a worker compacts.
- Task Memory's `taskMemory.autoApprove` switches let the agent take some actions without the confirmation dialog: `attach`, `create`, `env`, `fanout` and `projects`, each off by default and set in `/freeflow settings` (Personal or Repository) or a config file. An action taken this way says so in the transcript.
- On Pi, the agent can put a choice that is yours to make into a dialog (`ask_user`) and continue on your answer in the same turn, instead of asking in its reply and stopping: one to four questions, each with two to four options and their trade-offs, the agent's recommendation first, a row for your own answer and a note per question. `Esc` closes it without answering, and the agent then does not act on that choice. Without a UI the agent asks in its reply as before. Task Memory's confirmations use the same dialog.
- With Tool Execution on, `monitor` watches a command's output and tells the agent each line it prints as it happens, so it can react to a log or watcher while it runs, including after it went idle. Lines within 200 ms arrive together; a monitor ends when its command exits, after its time limit (5 minutes by default, at most 30) or with `stop_background`, and one that sends more than 20 messages a minute is stopped.
- On Pi, Messaging (a preview, off by default: the Messaging switch in `/freeflow settings`, or `messaging.enabled`) lets the agents in your Pi sessions on this machine send each other plain-text messages: ask one session to tell, ask or answer another, and the reply comes back on its own. A message reaches the other agent after its current tool calls, or starts a turn when it is idle; a session that has had no prompt yet shows it and reads it with your first prompt. A message is information from another agent, never your instruction. Ask before delivering (`messaging.inbound`) can hold messages for you to accept: never (the default), from outside the repository's Task Memory project, every message, or refuse all. Sessions are addressed by session ID and shown by name, and each step is one line in the transcript.
- Task Memory links each repository in a project, and each child's worktree, to the project's store at `.freeflow/project`, so you can open and edit its records in your editor while the agent works. The link is kept out of Git through the clone's `.git/info/exclude`, and made again at session start when missing.
- Task Memory can remove tasks and projects: ask the agent ("remove the trial project") or run `/freeflow task remove <ID>` or `/freeflow project remove <name>`. A dialog always asks first, names what goes and which Git worktrees stay. Removed records move to `~/.freeflow/trash/`, and only you delete them for good, with `/freeflow trash empty`; the agent cannot. Track Work's CLI has `task remove` and `project remove` for other hosts, and task numbers are never reused.
- Review Work reviews two more kinds of thing: a report or record of work done (a final report, a results note, a Working Record), checked claim by claim against the outputs and files it describes; and an eval definition (a case, suite, fixture or grader), checked before its runs are paid for, for whether a correct answer can pass, a wrong one cannot, and its defects are real. It also adds a judge contract for any model whose verdict on another agent's output is used as evidence: what to record about the judge, what it must be shown, and how to combine verdicts. Before a model reviews anything, the deterministic checks that apply run first, and an adjudicated review is recorded in the task's Working Record.
- Evaluate Skill can run a subject with Freeflow loaded, built from an exact commit, with repository and personal settings declared in the configuration and checked by that build's own validator before anything runs; comparing two settings, such as Task Memory off and on, is one `component`. `run` prints its plan (subjects, models, Freeflow builds) before starting, and asks on an interactive terminal unless `--yes` is given. Aggregates now count grade errors and run states, report pass^k per check (whether it passed in every trial) and the per-trial pairs per comparison, and name the strongest claim the counts support. A `file-text` expectation can check one `line`, such as a review's first-line judgment.
- `skill-eval review` checks its reviewer against Review Work's judge contract: it shows the reviewer the task's fixture and each run's written files in full, hides run paths and arm names, records the reviewer's model family against the subject's, and with `--swap` reviews again with the runs in the other order to show whether position decided the answers.
- Evaluate Skill body groups may give the subject Pi's `ls`, `find` and `grep`, confined like `read`: without a path they work in the run's workspace, and a path outside the evaluation environment is refused. A reviewer can then list the files it was given instead of guessing their paths. `bash` and `powershell` stay unsupported.
- An eval configuration declares the host's Pi extensions and settings: `host.extensions` names installed Pi packages by exact name and version (such as an Anthropic subscription's auth extension), and `host.settings` becomes each subject's Pi `settings.json`. Both are recorded with every run and may be the compared component, so a definition can evaluate any Pi setup, not only Pi's defaults. `skill-eval review --configuration <file>` gives the advisory reviewer its model, extensions and settings the same way.
- Evaluate Skill accepts an optional group field `"revision": "description-only"`: before any subject runs, the evaluator checks that the two target skills differ only in their frontmatter description, and refuses the group otherwise.
- A Working Record can hold a Work agreement: an optional `### Work agreement` heading directly after Goal, for what done looks like, what the agent does without asking, what needs your yes first, where it comes back and how long that holds, with your reply quoted. `init` writes it only when its input has one, and `validate` rejects it when empty or anywhere else. Records without it stay valid, and nothing is migrated. In a record that has one, return conditions and actions that need your yes move there from Boundaries.

### Changed

- Track Work recovers a Working Record after context loss from its `resume` view, which now ends with a one-line index of closed History, and opens only the History entries the next action needs, instead of reading the whole record. On a long task this loads a fraction of the record.
- Codex, Claude Code, Gemini CLI, Cursor, and GitHub Copilot now receive Freeflow's Working Method (how to read a request, check evidence, and report a finished change) at session start, as Pi already did. It adds about 1,500 words to the session-start context.
- On Pi, Freeflow's tools drop the `freeflow_` prefix, which models confused with `/freeflow` commands: Cognitive Routing's `freeflow_delegate`, `freeflow_return`, `freeflow_unit` and `freeflow_project` are now `delegate_work`, `return_work`, `routing_unit` and `select_evidence`, and `freeflow_compact` is `compact_context`. Sessions saved earlier keep working: their history keeps the old names, and routing and compaction still read it.
- On Pi, a background command's exit and `/freeflow compact` now reach the agent as Freeflow's own messages, shown as one-line rows, instead of as messages from you. Freeflow's part of the system prompt now stays the same on the turns they start; working around the Pi issue that dropped it was why these were sent as your messages.
- `/freeflow settings` on Pi reads at a glance: each capability's switch is its section's row (no more "Enabled" rows under every section), values read `on` in green and `off` in red, marked `(inherited)` when the tab you are in does not set them (the help line says from where), and a setting whose section is off is greyed with a line saying it takes effect once that switch is on, while it can still be set up. Sections run Freeflow, Compaction, Tool Execution, Task Memory, Messaging, Cognitive Routing. Pi's footer reads `freeflow: on`, or `freeflow: on (all capabilities off)`, instead of `freeflow: active`; with Cognitive Routing on it shows routing's profile, control and mode. [Settings](plugin-docs/settings.md) lists every setting, its key, values and default, what Freeflow turns on by default, and how to read the footer.
- Tool Execution is on by default on Pi whenever Freeflow is enabled: its working guidance, file tracking, clearer edit errors, `apply_patch`, background commands and monitors. Turn it off with `"toolExecution": { "enabled": false }` or in `/freeflow settings`. Task Memory and Messaging stay off by default.
- On Pi, Freeflow's notices to the agent (compaction, background exits, monitors, changed files, `/freeflow compact`) are marked with a `<freeflow-notice>` tag instead of the `[Freeflow notice, not from the user]` prefix; Pi gives the model every such message as the user's, so the tag is what tells it otherwise. Your own messages that compaction carries over stay yours: they are quoted inside the notice in `<user-message>` tags, which nothing else in it can open or close. Compaction's warnings and recovery message, and the changed-file notice, now show as one-line rows that expand, instead of the full text.
- Evaluate Skill runs every subject and reviewer in its own home, temporary directory and Pi agent directory, with only the declared model's provider login copied in and removed when it exits. Your own Pi settings, such as the default thinking level, retries and compaction, no longer affect eval runs; Pi's defaults and the definition apply instead, so results from before this change may differ for that reason. A login close to expiry is refreshed once, by Pi itself in your own agent directory, before the batch and again whenever one has under 30 minutes left, so no run refreshes and rotates its copy and you are not asked to log in again unless the refresh itself fails.
- Review Work's independence rule now says what the research supports: an independent review needs a separately selected reviewer in a separate context, repeating a review with the same model adds no independent vote, and a reviewer from a different model family changes what gets flagged without a measured gain in real defects found. Reviews record the reviewer's model and family.
- Evaluate Skill rejects, before any subject runs, an expectation field its kind does not define (a misspelled field was silently ignored before) and a group with no expectations and no review questions. A run whose selected checks are all unavailable now exits nonzero, because it observed nothing.

### Fixed

- Track Work works in a repository reached through a symlinked directory (such as macOS `/tmp` or `/var`). Before, it refused every command there because its Git ignore check compared a symlinked path with Git's resolved one.
- Claude Code now receives Freeflow's whole session-start context. Claude Code caps each hook's context at 10,000 characters and shows longer output only as a short preview, so Freeflow now delivers each prompt through its own hook, and also at the start of forked sessions.
- Codex now runs Freeflow's session-start hook. Since 0.7.1, Codex loaded Freeflow's skills but none of its hooks, because it ignores hooks in a plugin that carries the Agent Plugins manifest the other hosts need. Codex now installs Freeflow from its npm package, which leaves that manifest out, and the hook raises Codex's context limit so the whole context fits. After upgrading the `freeflow` marketplace, approve the Freeflow hook in Codex's `/hooks`; Codex skips it until you do.
- Freeflow no longer goes silently inactive on Codex, Claude Code, Gemini CLI, Cursor, and GitHub Copilot in a repository whose `.freeflow/config.json` or `.freeflow/local.json` has `toolExecution` or `compaction` settings, such as those written by `/freeflow settings` on Pi. The session-start hooks now check configuration with the same validator as Pi, and an existing invalid configuration file now produces a short configuration error naming the file instead of no Freeflow context.
- `/freeflow settings` showed Cognitive Routing's Context projection as `off (default)`; routing turns projection on by default, and the screen now says so.
- `/freeflow settings` offered every thinking level for a Cognitive Routing preset (`off` to `max`) on any reasoning model; it now offers only the levels Pi's model data gives that model, such as `low` to `xhigh` for grok-4.7.
- `/freeflow enable` and `/freeflow disable` reported success even when `.freeflow/local.json` or a session override still decided otherwise, since they write only the repository file. They now say which setting still wins.
- Under Cognitive Routing, a Coordinator in executor mode could run commands and edits itself because it never read the routing skill, and after a compaction neither profile read it again. Each profile's commands and edits (also from codemode) now wait until it has read the skill, and the refusal names the file to read.
- With Cognitive Routing on, starting Pi with `--model` or `--thinking` holds routing until `/freeflow profile auto`, as designed, but the footer gave the reason as `acknowledgment_unclassified`; it now reads `startup_selection`, and the Cognitive Routing page explains the hold.
- Under Cognitive Routing, a worker whose run ended without handing its work back left the session waiting: the Coordinator saw the assignment as still in progress. The Coordinator is now told the run ended and how to continue, and the worker is told to carry out its assignment and return it, which helps after a compaction when the routing skill is out of view. While assessing, the Coordinator is told that the worker's turns in its view are the worker's. The Coordinator says a decision is noted, not recorded, until the record update returns; a message to another session marks a choice the user has not made as open; and `send_message` says that a session nobody has prompted yet reads a message with its first prompt.
- Under Cognitive Routing on Anthropic models, a notice that arrived while a worker ran (a monitor line, for example) could break the session: the Coordinator's next request put the worker's evidence between its last tool calls and their results, and Anthropic rejected it (`400 unexpected tool_use_id found in tool_result blocks`). Evidence now comes after the call group. The routing skill also says a worker's background commands and monitors keep running after it returns, so a Coordinator no longer refuses to delegate a watcher.
- Under Cognitive Routing, a worker whose return was blocked by a selection problem was told the report would be delivered, so it could end its turn with the Coordinator never getting it. Its receipt now says nothing reaches the Coordinator until the problem is fixed, and how.
- On Pi, two background commands started together when 15 were running could both start, past the limit of 16, and one started as the session ended could keep running into the next session.
- `skill-eval review` shows the reviewer a reply shape with one entry per review question; with a one-entry example, a reviewer sometimes answered only the first question and the review failed.
- Evaluate Skill grades skill-file reads in one-shot description runs and keeps their tool activity for the advisory review; a run that loses its context observation keeps its transcript, response and usage; and one trial's unreadable grade no longer aborts the whole aggregate (it is counted as `unreadableGrades`).

## 0.8.0 - 2026-10-03

### Breaking Changes

- Replaces the Astra effort-history entry type with `freeflow-openai-effort-v1` and removes the old Astra provider-support import paths. Existing `freeflow-astra-effort-v1` entries are not replayed or migrated; the next supported request starts a fresh effort chain.
- Requires native Pi 0.99.1 or later for the Pi extension; Pi 1.0 and 1.0.1 are supported, and earlier Pi versions are no longer supported.
- Turns Cognitive Routing projection on by default. A configuration that omits `projection` now gives the Coordinator the worker evidence it selects instead of every worker turn; set `projection: false` to keep the previous behavior.
- Removes the Freeflow Context tool (`freeflow_context`, `/freeflow context`), Context Virtualization, and Conversation History; Context Control v2 remains unavailable as a replacement. Before updating, delete `contextVirtualization` and `conversationHistory` from `.freeflow/config.json` and `.freeflow/local.json` wherever present. Either key makes configuration invalid and blocks Freeflow activation until removed; no automatic migration occurs.
- Removes Freeflow-owned PiFlow host integration and Evaluate Skill's PiFlow runtime selection; use native Pi for Freeflow's Pi extension. Existing PiFlow installations and state are not changed or automatically uninstalled.
- Removes Cognitive Routing evidence refs to assistant messages (`ctx:<entry>` on an assistant message and `ctx:<entry>#text`); only tool results can be selected as evidence, and worker narration belongs in the report. Assistant selections saved in existing sessions are no longer delivered to the Coordinator.

### Added

- Extends cache-aware effort-history adaptation from GPT-6 Astra to GPT-6 Luna and Sol on qualified OpenAI Responses and OpenAI-Codex Responses routes; provider cache hits, billing savings, and model-quality improvements remain unguaranteed.
- Adds experimental native-Pi Tool Execution, off by default: a layer over Pi's own tools with guidance on working in the environment, platform and shell facts, file tracking that refuses to overwrite a file the model has not read and names files changed behind it, edit errors that show the closest lines, `apply_patch` in OpenAI Codex's format (grammar-constrained for GPT-5 and later on OpenAI endpoints), and `bash_background`/`stop_background`, which notify the model when a command exits. `bash` refuses a trailing `&` and a foreground `sleep` of 10 seconds or more.
- Adds Freeflow compaction on native Pi, on by default: Freeflow warns before Pi's own limit, the agent compacts at a safe point with `freeflow_compact` from its own summary, Working Record, and carried files and tool results (numbered by line), and the same run continues from a recovery message. `/freeflow compact` asks for a compaction now, and `/freeflow status` shows the cycle and the context against each threshold. Pi's own compaction stays on as the fallback, with Freeflow's instructions and state added. Under Cognitive Routing, workers compact mid-assignment and the Coordinator delegates compaction. Configure it with `compaction.enabled` and `compaction.carry`.
- Adds a Working Method section to Freeflow's prompt on Pi: how to approach, check, and report work.
- Warns once when back-to-back requests to the same model and effort repeatedly miss the prompt cache with no compaction, navigation, reload, or model change in between, and shows the warning in `/freeflow status`.
- Warns when a Cognitive Routing worker preset costs as much per input token as Coordinator or more, or shares Coordinator's model at a different effort on a route that does not keep the prompt cache across effort changes.
- Keeps a Cognitive Routing Coordinator's prompt cache reachable after a worker run: when the worker's turns push the Coordinator's previous cache entry past the provider's lookback window, Freeflow places a cache breakpoint on that entry on Anthropic Messages and GPT-5.6+ OpenAI Responses routes. The ChatGPT Codex backend needs no breakpoint and is not changed.
- Keeps a suspended Coordinator's prompt cache warm while its delegated worker runs, on models that declare a cache lifetime and prices, by replaying its last request with a one-token output cap. A hold stops when the worker returns, the run ends, a refresh stops reading the cache, or after 6 hours or $2; refreshes are recorded as `freeflow-cache-keepalive-v1` session entries. The ChatGPT Codex backend is excluded because it rejects output caps.
- Advises `PI_CACHE_RETENTION=long` once and in `/freeflow status` when the Cognitive Routing Coordinator's model has a longer prompt-cache tier than the host uses; Freeflow does not change retention.
- Adds a prompt caching guide covering provider cache behavior, what Freeflow adds to requests, how it keeps them cache-safe, and the rules for changing request assembly.
- Adds Track Work `slice record`, which records a Slice that finished before it could be recorded directly into History with `Occurred` and `Recorded: retroactively on <date>`, without closing a live Slice or supplying placeholder fields. Working Record commands also accept an absolute `--record` path from any directory.
- Adds the Write Docs skill (`/write-docs`) for documentation of how existing software works and why: which document serves which reader, adaptable shapes for overviews, subsystem docs, folder READMEs, and user guides, correcting documentation in the same change that makes it wrong, and a `docs-check.mjs` script that reports missing named paths and documents whose covered code changed since they were verified. Execute Work, Track Work, and Workflow point to it where documentation matters.
- Gives each Track Work task a `scratch/` directory for temporary work, created by `init`; with Tool Execution, the guidance puts scratch files there when a Working Record exists.
- Ships a `NOTICE` and the Apache-2.0 license text for the `apply_patch` code ported from OpenAI Codex.

### Changed

- Turns Cognitive Routing off for the session, visibly in `/freeflow settings` and the footer, when you pick a model or effort in Pi itself (`/model`, Shift+Tab, or a virtual model) instead of leaving it in a hidden inactive state. `/freeflow profile auto` or a profile hold, `Ctrl+Shift+A`, `Ctrl+Shift+R`, or the Session switch turns it back on and returns control to the automatic Coordinator.
- Separates user and developer documentation. `plugin-docs/` keeps the user docs; the developer pages move to `dev-docs/`: architecture (now `dev-docs/README.md`), prompt architecture (`dev-docs/subsystems/prompt-assembly.md`), skill routing, performance, the release process, and decision records. Cognitive Routing, Pi integration, and prompt caching are split: their user pages stay, and their internals move to `dev-docs/subsystems/cognitive-routing.md`, `dev-docs/subsystems/pi-extension.md`, and `dev-docs/guides/prompt-cache.md`. Links to the old developer pages break.
- Keeps Freeflow's own work on each native Pi request, turn, and session start from growing with session length: routing history replays in one pass, the session branch is walked once per change instead of dozens of times per prompt, request history and routing attribution reuse Pi's session projection instead of re-hashing the conversation, each message in a routed view is rendered once and reused, history and GPT-6 effort records are written only when their state changes, compaction measures context from the turn's own usage, and session checks read only the entries appended since Pi loaded the file. On a 24 MB routed session Freeflow's added time per prompt fell from about 28 to 14 ms with routing and its startup from about 180 to 50 ms; with 8,000 messages in live context, routing's per-request work fell from about 73 to 25 ms. A disabled repository no longer adds routing provenance, and GPT-6 effort adaptation stays off when a configured repository disables Freeflow. Requests sent to the provider are unchanged.
- Replaces `/freeflow settings` with one screen: Session, Personal, and Repository scopes switched with Tab, switches that change in place (three-way switches cycle inherit, enabled, and disabled), and the source of each value. The Session scope can also override Cognitive Routing, projection, Tool Execution, Compaction, and Context reuse.
- Leaves OpenAI's Sign in with ChatGPT route (Pi 0.99 and later) untouched: no cache breakpoints, Coordinator keep-alive, or effort-history rewriting, which that route rejects. Cognitive Routing presets that switch effort on that route warn that it keeps a separate prompt cache per effort.
- Allows Cognitive Routing tools only as direct calls, not from codemode scripts; other tools a script calls are admitted under routing like direct calls.
- Tightens shipped guidance: Track Work recovery confirms that a pointed-to Working Record belongs to the current work before reading its sources, the Interaction Contract reports that something happened only from a source that would show it, and the routing, Workflow, Verify Work, and Evaluate Skill guidance carry refinements from agent-behavior research.
- Lets native Pi sessions override the Cognitive Routing delegation mode and stage any profile preset, while showing the effective mode in the footer without changing repository or personal configuration.
- Resumes a Cognitive Routing worker run automatically when a crash or reload interrupted it and no new user input has arrived; reopening an idle session only notes that an unchanged assignment can be resumed.
- Shows prompt-cache diagnostics (Coordinator keep-alive, context replay, and the GPT-6 effort baseline) on the `prompt cache` line of `/freeflow status` instead of the footer, which now shows only current Freeflow settings.
- Shows the Coordinator only the tool calls of worker turns it did not select, so another model's reasoning no longer arrives as text, and gives each completed worker run one provenance note.
- Shares a Cognitive Routing profile's private reasoning with another profile only where both would send the same request: a turn produced on the receiving profile's model and under the same view. Otherwise each profile sees only its own reasoning, the Coordinator never receives worker reasoning under projection, and OpenAI function-call items are unpaired where their reasoning is withheld.
- Applies Cognitive Routing profile changes made while Pi is idle (manual holds, releases, and session presets) to Pi's model when the next prompt is submitted; the footer shows the pending model until then, and a model picked in Pi's own picker cancels it.
- Writes no Freeflow session entries before a session's first prompt, and records routing control and session setting changes made between prompts as one net change at the next prompt instead of one entry per switch.
- Has Cognitive Routing workers select evidence and submit their return in the same response, correcting reported problems with a return retry, instead of spending a separate request waiting for the selection receipt.
- Refuses a new Cognitive Routing assignment while attached evidence recovery is open, and refuses cancelling recovery or closing a unit while a worker run for that work is unresolved.

### Fixed

- Stops trusting the session file as verified after `/reload`, which keeps Pi's session in memory without re-reading the file; an entry that a failed write left only in memory now blocks Cognitive Routing instead of being treated as persisted.
- Keeps Cognitive Routing correct on Pi 0.99 for runs that an extension's message starts: the run is handed to the Coordinator before its first request instead of waking an idle worker.
- Explains a Cognitive Routing recovery refusal when a context ref is passed as a captured result id: the ref belongs in the request, where the worker selects it as evidence.
- Preserves Pi's historical system-prompt and tool timeline by contributing Freeflow guidance as a structured section and composing the full request transcript rather than forcing a replacement system head.
- Keeps Cognitive Routing manual-hold and automatic-release shortcuts in step with the host model: requests run in order, the next manual hold is chosen from the latest state, and a profile is recorded only after its model is applied.
- Applies the same ordering to Cognitive Routing resume, session presets, rebinding, re-enabling, and navigation, so a failed model switch records nothing; a manual hold whose model was changed outside routing is reported once and shown in the footer instead of being overridden.
- Corrects the Cognitive Routing skill: profiles on the same model reuse the prompt cache only at matching effort or on routes that keep it across effort changes (currently the supported GPT-6 routes and Claude models that take per-message effort).
- Delivers evidence reused from an earlier assignment where it was selected, so a returning Coordinator request extends its cached prefix instead of rewriting it.
- Delivers evidence that an attention view left out where the assessment resumed, so the resumed Coordinator request extends its cached prefix instead of rewriting it.
- Keeps Freeflow runtime state and GPT-6 effort history at their original positions after `/tree` branch navigation with a summary, so the request after the branch point reuses the cached path instead of rewriting it; only compaction starts a new history.
- Counts cache writes in prompt-cache health checks and compares a Cognitive Routing profile that resumes on its own model with its previous request, so write-heavy and handoff misses are reported.
- Fixes the Cognitive Routing profile-cycle and automatic-release shortcuts, which read a stale model and took several presses to switch.
- Sends the Freeflow system section even when Cognitive Routing fails at a session's first prompt.
- Stops the Coordinator keep-alive from replaying Claude requests that use budget-based thinking, which a one-token replay cannot refresh.
- Keeps the Coordinator's cache anchor when a Claude request ends with a mid-conversation system update.
- No longer warns that a same-model Cognitive Routing preset at a different effort loses the prompt cache on Claude models that take per-message effort.

## 0.7.3 - 2026-09-16

### Added

- Adds an optional Cognitive Routing Helper profile and `executor`, `helper`, and `both` delegation modes with mode-aware presets, manual holds, durable worker-specific continuation, and shared worker history.
- Adds cache-aware Pi request assembly and qualified Astra effort-history adaptation; provider cache hits, billing savings, and model-quality improvements remain unguaranteed.
- Adds attached Cognitive Routing evidence recovery with exact-path reads, preserved original reports and assessments, separate supplements, explicit cancellation, and direct selection of eligible occurrence-linked evidence refs.
- Adds session-only Cognitive Routing profile presets for Coordinator and enabled workers with complete model/effort pairs, inheritance, reset, and local/shared configuration isolation.
- Adds a practical Freeflow user guide for prompting, skill selection, Workflow and Track Work management, settings, Cognitive Routing presets, and evidence and cost boundaries.

### Changed

- Clarifies mode-aware Coordinator/Helper/Executor ownership, implementation boundaries, evidence projection, recovery, and Coordinator assessment responsibilities.
- Batches worker evidence selection during return preparation while preserving saved reports, unresolved evidence, and handoff limits.
- Repositions Freeflow around Memory, planned Context, and Compute, and expands Cognitive Routing and PiFlow documentation with qualified preset and cache-reuse boundaries.

### Fixed

- Clears session-local Cognitive Routing manual-hold state before validating a newly bound session.
- Clarifies evidence-selection operation shapes, remove-only withdrawal reasons, and the distinction between eligible result bodies and routing controls.
- Prevents pre-prompt `/reload` and Cognitive Routing preset changes from blocking on Pi's not-yet-materialized session file.
- Preserves Astra effort-history replay across temporary model round trips and reloads when the qualified request lineage remains compatible.

## 0.7.2 - 2026-09-11

### Breaking Changes

- Consolidates experimental routing reads into `freeflow_project inspect` with scoped candidates and `freeflow_unit inspect` with current/history/detail views; earlier `list`, `status`, and `history` operation names are no longer advertised or accepted.
- Replaces the experimental Cognitive Routing switch/boundary protocol with Coordinator/Executor assignments, separate delegate/return/unit/projection tools, and `projection`/`thinking` configuration. Old experimental configuration and tools are not migrated; redesigned PiFlow routing and composition with legacy context transforms remain unavailable pending qualification.

### Added

- Adds exact assistant-visible-text evidence refs, bounded saved-work detail/history recovery, snapshot-based inspection pagination, and explicit target limitations in expanded routing output.
- Adds saved-report retry, explicit same-unit assignment replacement, strict read-only session acknowledgment reconciliation, and assessment-preserving evidence projection with attention suspension and restoration.

### Changed

- Retires the old experimental routing source and tests into the historical archive, adds replacement-contract regression suites, and cleans generated extension output before building.
- Shows live routing tool arguments in a six-line trailing preview with full expansion, and replaces internal collapsed receipt labels with readable operation outcomes and evidence counts.
- Clarifies Cognitive Routing's Coordinator/Executor assignment boundary, design-decision transfer, selective evidence projection, and Coordinator assessment responsibilities in the shipped guidance.

### Fixed

- Limits normal evidence inspection to usable candidates and removes source-content previews, while preserving saved-selection diagnostics.
- Preserves delivered-user identity across native compaction and explicit resume, so stored-but-undelivered history does not interrupt an outstanding Executor assignment while genuinely new input still does.
- Keeps streamed routing contracts and reports visible in collapsed receipts; limitations and replacement reasons remain available in expanded views instead of obscuring current prose.
- Preserves source attribution throughout routing request views and complete report metadata during handoff/recovery; excludes routing controls from new evidence selections, clarifies inspection counts and historical discovery, and distinguishes invalid lookup refs from unavailable work.
- Preserves admitted routing communication and active evidence across closure, replacement and attention; removes duplicate runtime communication and selection no-op churn, preserves identical-call receipts, indexes native exchanges, and streams long-session reconciliation with explicit resource limits. Request planning no longer treats base64 as text or a model output maximum as an invariably reserved allocation.
- Reconciles native routing navigation and explicit assignment resume, guards stale session operations, preserves evidence withdrawal details and cross-model tool-result carriers, and reduces history replay and routine journal writes. Routing tools now show readable receipts and role-appropriate controls.

## 0.7.1 - 2026-09-04

### Added

- Adds Agent Plugins 1.0, Gemini CLI, Cursor, GitHub Copilot/VS Code, OpenCode v2, and Hermes distribution metadata or compatibility over the same canonical 25-skill tree, with Kiro compatibility through the portable Agent Plugins skill surface.

### Changed

- Separates shared runtime-context rendering from Codex, Claude, Gemini, Cursor, and Copilot/VS Code hook adapters while preserving existing Pi/PiFlow capability boundaries and lifecycle behavior.

### Fixed

- Aligns OpenCode v2 skill configuration, Gemini lifecycle matching, and Copilot session-start context output with their documented host contracts.

## 0.7.0 - 2026-09-03

### Breaking Changes

- Removes Freeflow's selectable modes, mode commands, session mode state, and `defaultMode` configuration; all work now uses one adaptive Workflow.
- Removes the `interactionContract` and `skills` configuration toggles. The separately editable Interaction Contract and 25 base skills are always present whenever Freeflow is enabled, while optional capabilities remain independently gated.
- Replaces the current Schema 3 Track Work package with compact Schema 4 Markdown task memory and lifecycle commands. Existing Schema 2/3 records remain untouched and require a later explicit migration.

### Added

- Adds Cognitive Routing support to normal Pi through its official model, thinking-level, model-registry, and session-entry APIs while preserving the existing PiFlow host path, transition recovery, native-override handling, and rollback evidence.

### Changed

- Refines core runtime prompts and workflow guidance with explicit authority and evidence boundaries, current-owner routing, bounded environment interactions, peer execution methods, and expanded design and skill-authoring references.
- Changes Cognitive Routing automatic control to start and return in Reasoning, keeps all substantive user-facing interaction in Reasoning while Standard transfers execution state at return conditions, adds Yield/Delegate/Act Bounded routing with model-written execution boundaries, and refreshes Runtime State only after context reconstruction or displayed-state changes.
- Reconciles the shipped skill-routing map with current direct routes and resource dependencies.
- Documents the Pi 0.84.3+ support floor and Pi 0.84.4 integration test target.
- Rewrites Cognitive Routing guidance around shared context, Reasoning-governed boundary-first routing, a persistent Delegate loop, standalone Yield, Reasoning-owned self-review, and explicitly bounded Act Bounded execution while preserving execution-boundary lifecycle semantics.

### Fixed

- Keeps extension-generated Runtime State before the latest genuine user message so automatic profile refreshes cannot masquerade as user interruptions and prematurely return delegated work.
- Prevents stock-Pi model and thinking events emitted by Freeflow-owned profile transitions from being treated as native user overrides.
- Expands direct Pi skill commands through Pi’s `sendUserMessage` API before dispatching them to the model.
- Renders Schema 4 Current Work, Future Work, and History entities as compact field-list rows while preserving expanded reads, and expands Track Work operation help with fragment fields and stdin guidance.

## 0.6.0 - 2026-08-25

### Added

- Adds a deterministic v2 Track Work runtime with strict schema-driven updates, bounded views, decision and checkpoint lifecycles, historical reopening, stale-lock recovery, loss-resistant migration and compression, candidate round-trip validation, and atomic persistence.
- Rebuilds Track Work as one complete lifecycle method for task-memory creation and recovery, Current Slice continuity, proposals, decisions, checkpoints, evidence, Notes, closure, and reconciliation while keeping exact command mechanics schema-driven.
- Extends Evaluate Skill with explicit runtime profiles, PiFlow host variants, extension bundles, prompt/context evidence, tool-call predicates, and stronger isolation and evidence safeguards for behavioral evaluation.
- Adds the Pi-only Cognitive Routing capability with standard/reasoning profiles, manual unsplit control, Reasoning-led automatic execution boundaries with Standard delegation, state restoration, runtime Control/Profile delivery, transition history, and PiFlow host integration; keeps it experimental pending behavioral acceptance.
- Adds Action Selection as a cross-host skill for bounding uncertain or broad environment interactions before choosing tools or repeated actions.
- Adds opt-in Pi-only Context Virtualization for archiving classified tool results from future model context while preserving canonical session history, with archive/restore controls and working-set policy.
- Adds opt-in Pi-only Conversation History retrieval for bounded current-branch recovery, with passage ranking, cancellation handling, and explicit recovery-policy safeguards.
- Adds committed exact-revision Freeflow development snapshots for Pi/PiFlow with provenance, atomic refresh, package validation, and isolated targets while separating Freeflow policy from PiFlow host ownership.
- Adds human-controlled release automation, pull-request/main CI, deterministic version and changelog preparation, metadata validation, tag-verified npm/GitHub Release publishing, recovery support, release-note extraction, and PR changelog declaration validation.
- Adds a canonical public documentation hub, Pi/PiFlow Getting Started guidance, versioned release evidence, consolidated ADR ownership, tracked historical project-doc archiving, and deterministic documentation validation.

### Changed

- Simplifies the Interaction Contract into compact evidence-based interaction semantics: separates user goals from factual claims, answers mixed question/action turns before acting, and proceeds on clear requests without silently expanding them; adds focused baseline-versus-candidate behavioral evaluation cases.
- Scopes workflow authority by requested outcome, permitted effects, evidence boundary, and stop condition; distinguishes passive observation, active evidence generation, and mutation or delivery; and consolidates detailed policy in Workflow so mode, skill selection, usefulness, or new evidence cannot silently authorize the next action.
- Aligns discussion, diagnosis, execution, mode, TDD, verification, and review guidance with the shared authority model; separates review adjudication from remediation; moves Working Record selection to Discuss and Workflow while Track Work operates established memory; defines entry-required, activity-required, and conditional reference reads; makes child skills own their reference activation; and keeps reference filenames aligned with their visible titles.
- Moves the Interaction Contract into layered runtime prompt fragments and hides retained historical material under `.deprecated/`, updating live loaders, package checks, documentation, and links.
- Adds layered prompt-fragment, Runtime State, and discoverable-skill delivery with capability gating so hosts receive stable guidance and opt-in Pi capabilities through separate runtime surfaces.
- Requires silent self-review after every bounded activity—tasks, slices, subtasks, artifact revisions, and small local changes—before its result is accepted, reused, or claimed complete; keeps corrections inside the existing authority envelope and reinforces the boundary in execution, bypass, task completion, plan defaults, and pre-activation setup.
- Hardens changelog governance and tag-driven release CI with canonical category validation, released-history immutability, pre-publication release-note checks, exact artifact verification, and recovery safeguards.

### Removed

- Removes the deprecated Output Router from the Pi runtime, tools, settings command, capability guidance, and active evaluation surface; it is no longer available for use. Legacy router-shaped configuration remains inert for activation compatibility, while the implementation and evidence are archived under `.deprecated/output-router/`.
- Removes the legacy Pi-only `/discover` and `/execute-plan` compatibility aliases; use `/discuss` and `/execute-work` instead.

## 0.5.0 - 2026-08-13

- Adds deterministic session-only Freeflow mode switching for Codex and Claude Code without restarting the conversation.
- Restores session mode across startup, resume, clear, and compact lifecycle boundaries using isolated plugin-owned state, including a bounded host-process-scoped, one-shot Claude `/clear` handoff; session controls never edit repository or personal configuration.
- Supports explicit natural-language mode controls plus Claude namespaced skill invocation and Codex `$mode-contract` mentions while leaving ordinary prompts, questions, and hypotheticals inert.
- Clarifies configured-default scope: explicit personal/local requests target `.freeflow/local.json`, explicit shared/repository requests target `.freeflow/config.json`, and unqualified requests ask before editing.
- Keeps host-native skill dispatch and the 25-skill Codex/Claude surface while preserving Output Router as Pi-only.

## 0.4.0 - 2026-07-21

- Reframes Freeflow as a feedback-based control system for coding agents, with a directed Interaction Lifecycle, internal Feedback Loop, and evidence-supported exits instead of a fixed phase pipeline.
- Uses the compact Interaction Contract plus one Workflow bootstrap as runtime guidance, while keeping mode and capability state independently gated.
- Adds required repository activation, optional per-checkout personal core overrides, Pi session-mode precedence, fail-closed invalid-local behavior, and explicit delivery evidence.
- Replaces the canonical `discover` and `execute-plan` model skills with `discuss`, `track-work`, and `execute-work`; Pi retains `/discover` and `/execute-plan` only as compatibility aliases.
- Keeps factual verification with the active agent, distinguishes silent self-review from selected independent review, and makes Pass, Non-blocking, Inconclusive, and Blocking valid review exits.
- Gives Specs and Plans separate independent Review Artifact boundaries, keeps findings non-authorizing, and requires explicit correction and focused follow-up authority.
- Adds the composite Track Work method for context-first Working Records, coherent write-ahead slice extensions, state-transition history, inert Notes, and restoration after context loss or session navigation.
- Aligns Mode Contract, Setup Freeflow, Bypass, Commit Work, migration, release, launch, handoff, branch finish, diagnosis, TDD, simplification, and design-depth methods with the feedback-based model.
- Keeps skill readiness outside subject `SKILL.md` files and repairs Skill Author validation for readable project-contained sibling and runtime dependencies.
- Refreshes package and marketplace identity, root and plugin documentation, release/current-state contracts, activation validation, and the typed 25-skill routing/dependency map.
- Replaces the retired Skill Author and Skill Eval machinery with fresh `init`, `validate`, `inspect`, `run`, and `view` surfaces, exact canonical evidence, deterministic baseline/candidate grading, isolated one-shot and multi-turn Pi subjects, serial batch continuation, and compact generated views.
- Reorganizes the Pi extension source, tests, and generated distribution by feature while preserving its stable package entrypoint, and adds Workflow and Feedback Loop diagrams to the root documentation.
- Preserves Output Router as an explicit optional capability and keeps its existing runtime behavior and evidence boundaries unchanged in this migration.
- Leaves the adaptive candidate Unverified pending current baseline-vs-with-skill behavioral evaluation; deterministic structure and delivery checks do not establish behavioral readiness.

## 0.3.0 - 2026-06-28

- Adds plugin-bundled runtime context loading for mode-contract, workflow, interview-gate, discovery-light, and output-router, including Pi every-turn context injection.
- Enforces the conversation-mode boundary so mutating or consequential work requires workflow or strict-workflow mode.
- Adds the direct `/output-router` route and exposes the Freeflow search/run/batch/status evidence surface in Pi.
- Expands Output Router with observed routing, vault-wide indexing, deterministic transform/reducer routing, storage-policy dedupe, and exact recovery guidance.
- Adds proof-gated sandboxed script producers/transforms for JavaScript, Python, and jq behind explicit `scriptTransform` opt-in, with no unsandboxed fallback.
- Adds processing reducers for access logs, tests, diagnostics, build output, tables, MCP tools, browser snapshots, git logs, and query-aware JSON facts.
- Records Context Mode comparison evidence, storage-policy evidence, script-sandbox proof evidence, observed-routing evidence, and updated output-router release evidence.
- Simplifies runtime skill context, tightens output-router safety-policy docs, and refreshes public README/plugin docs with the workflow map and current positioning.
- Fixes Pi runtime context loading on every turn and makes the discover skill description YAML-safe.

## 0.2.0 - 2026-06-19

- Adds Freeflow output-router tooling for routed repo/vault evidence, noisy command routing, and exact raw-output recovery.
- Adds deterministic retrieval, command-output, optional local-index, and Codex Structured Q&A router benchmarks.
- Keeps scanner retrieval as the default backend; the no-dependency local index remains experimental.
- Keeps native post-tool safety-net routing off unless explicitly configured.
- Adds opt-in `outputRouter` setup/config guidance while preserving minimal setup as only `defaultMode`.
- Replaces `research-brief`, `grill-context`, and `capture-decisions` with the deeper `research` discovery skill.
- Moves deprecated discovery skills to root `deprecated/skills/` outside the runtime skill surface.
- Updates the direct command surface to use `/research`.
- Clarifies `write-skill` line budgets as best practice, not a hard cap for deep skills.
- Adds parent adjudication and a three-pass hard cap for artifact/work review loops.
- Deepens `execute-plan` for multi-slice execution, TDD slice contracts, review-failure routing, and scope-change backward edges.
- Tightens workflow/review skills so non-passing reviews route to adjudication before more implementation.

## 0.1.0 - 2026-05-26

- Initial Freeflow package.
- Ships the accepted v0.1 workflow skill set.
- Supports Codex and Claude plugin metadata.
- Adds public workflow, skills, architecture, release evidence, and ADR docs.
- Keeps native slash handlers, hooks, and CLI enforcement out of scope.
