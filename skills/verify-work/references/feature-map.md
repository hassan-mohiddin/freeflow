# Feature Map

Give a project a tested way to check its software live, and keep it honest as the software changes. The result lives in the project's developer docs, written for an agent that has never seen the software and reads it cold, mid-task:

- a **feature map**: an index and one feature file per user-facing feature, saying what the user sees and the exact steps and observable results that show it working;
- a **live-verification guide** shared by every feature file: launch, health check, drive, evidence, clean-up, and which inputs make paid calls;
- the **helper** script the guide documents, kept in the repository.

[Write Docs](../../write-docs/SKILL.md) owns the shapes of the feature file and the guide; read its [Documentation Shapes](../../write-docs/references/documentation-shapes.md) before writing either. Verify Work's [Project Recipe](runtime-evidence.md#project-recipe) uses the map to check a claim; this reference builds and maintains it.

There are two modes:

- **Set up:** the project has no feature map, or none for the features the work needs.
- **Recheck:** a map exists. Walk it feature by feature, drive each one live, and correct what no longer holds.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- A step is verified only when it was driven. Until one full live run of a feature file has passed, and its evidence still exists after clean-up, mark the file or step unverified, and call a set-up that never ran a draft.
- Never make a step pass by weakening it. When one fails, decide what failed: the steps drifted from deliberate changes (correct them and drive again), the helper cannot drive working behavior (fix it and drive again), or the product is wrong (report it to the user and keep the step as it is).
- Start, drive, stop and clean up only what this run started. Never stop processes by name, and never drive an instance the run did not launch.
- A step that calls a model or another paid service runs only with the user's yes, a pinned cheap model, and its cost stated first. The helper refuses such input unless the run allows it, and starts the software without credentials when it does not.
- Write the map, guide and helper where the project keeps developer docs and tooling. Never put them in an instruction file such as `AGENTS.md` or in one host's skill folder. A project with no developer docs gets a proposal to create them, through Write Docs, and nothing is written until the user agrees.
- Report an entry point you did not drive as not driven, never as verified through another one.

## Interview The Repository

Goal: know what to drive and how before writing a line. Answer from the codebase, its docs and its scripts; ask the user only what you cannot observe.

- **Surface:** what does a user touch? A web UI, a command-line or terminal UI, a desktop or mobile app, an API or service, or a plugin running inside another program, such as an editor or a coding agent. Pick the primary surface and note the rest. A library with nothing to run gets no map: its tests are its live check, so say so and stop.
- **Run:** the project's own documented start command, its ports, environment, seed data and sign-in.
- **Drive:** existing harnesses first (end-to-end specs, terminal helpers, endpoints a script can call); a generic recipe only when none exists.
- **Observe:** screens or terminal text, response bodies, logs, exit codes, files written, stored state.
- **Isolate:** whether two runs can work side by side with their own data, ports, home folder and credentials. If they cannot, the guide says so, and a run refuses to drive an instance it did not start.
- **Paid calls:** which inputs reach a model or a paid API.

If the checkout does not build or start as it is, fix that first when the agreement covers it, or report exactly what fails; steps written against a broken base teach the wrong thing.

Use [Driving Surfaces](#driving-surfaces), below, when choosing how to launch, drive and observe the surface, and before writing the helper.

## Set Up

Goal: a fresh agent with only the written steps can launch the software, drive a feature, capture evidence and clean up.

1. **Guide and helper.** Write the shared guide in Write Docs' live-verification guide shape, from what the interview found, with no placeholders. Write the helper it documents: executable, with its invocation shown in the guide, covering launch, a read-only health check, driving, saving evidence, and clean-up that keeps the evidence. A helper the reader has to reverse-engineer is not a helper.
2. **Feature files.** Start with the three to five features users rely on most, from commands, routes, menus and the user docs. Write the index and one file per feature in Write Docs' feature file shape. Each `Covers` header names the code behind what the user sees, so the docs check flags the file when that code changes.
3. **Drive everything you wrote.** Follow the guide and every feature file end to end, as written, with no paid calls unless the user agreed to them. When a step fails, decide what failed (Rules), fix the steps or the helper, clean up, and drive again. After the final clean-up, confirm the evidence is still at its named location. Set each file's `Verified at` to the commit you drove.
4. **Name what the run did not prove.** A step that needs a paid call or an unavailable prerequisite stays marked unverified, with the reason. If you drove a stand-in for the real target, such as a container in place of a fresh machine, list each setup step the stand-in did that the target will not; those stay unverified until a run on the target covers them.
5. Run Write Docs' docs check on what you wrote.

## Recheck

Goal: every feature file is checked against the code and driven live, and the map ends in one stated outcome.

1. **Index.** The index lists every feature file, with no missing, duplicate or dead entries.
2. **Source.** For each feature file, read the code its `Covers` names and the user docs for the feature, and note likely drift with the exact lines that show it. Where the host has subagents, cheap read-only readers can take one feature each; they never drive the software or edit files. Otherwise read features one at a time. Look through recent changes for user-facing features the map lacks, and name the source path before calling one missing.
3. **Live.** Drive every feature at least once, as the guide launches it. Run the health check before the first step and after any failed step; where it cannot see a stuck state, relaunch rather than hope. Evidence survives every clean-up, and nothing a step started outlives the run.
4. **Correct.** Decide what each failure was (Rules). Drive every corrected step and every helper fix again before saving it, and move `Verified at` only for files driven in full.
5. **Outcome.** State one: **clean** (every feature driven, nothing to change), **changed** (proven corrections, saved in one change), or **blocked** (what stopped the pass). List product bugs separately, for the user.

A recheck runs when the user asks or accepts a proposal, never on a schedule. Propose one, with what it costs and what it should catch, when the docs check flags a feature file as stale or the software changed in ways the map describes.

## Driving Surfaces

Use this section when choosing how to launch, drive and observe the software, before writing the helper, and when Verify Work drives a live check with no saved recipe. It is judgment: recipes to adapt, not commands to copy. Prefer the project's own harness when one exists.

### Every Surface

- **Ready means usable.** Wait for a signal that the software accepts input, such as a prompt, a rendered label, a health endpoint that checks its dependencies, or a line in a status bar, not just a live process. Seed data and migrations finish before ready.
- **Stable handles.** Drive by what a user reads: labels, accessible names, prompt text, routes, command names. Avoid coordinates, pixel positions and tab order.
- **Isolate each run.** Give it its own data folder, ports, home folder, temp folder and config, under a folder the version control ignores, so runs can work side by side and never touch the user's own state. Record the run's identity (its process IDs, the build or commit, the settings it started with) where the health check can read it.
- **No credentials by default.** Start the software with an environment built from nothing but what it needs, and its own home folder, so no API key, cloud profile or saved login can reach a paid service by accident. Pass the user's environment only to a run they agreed may make paid calls.
- **Evidence beside the run, kept apart from it.** Save each step's command, output, exit code and resulting state as numbered files, plus a log of every action with its time. Clean-up deletes the run's scratch folder, never the evidence folder.
- **Check side effects from a second view.** After an action, read the file it wrote, query the stored row, or ask the software for its state again; a success message alone proves nothing. When a safe mode such as a dry run is the path, observe what it actually skips rather than trust its name.

### Web Interfaces

Drive a browser through the host's browser tools or an automation library, with a fresh profile per run. Locate elements by role and accessible name. Capture an accessibility snapshot and a screenshot with the app's identity visible, plus the network calls or console errors the claim depends on. A local server binds a port the run chose; the health check confirms that port belongs to this run's process.

### Command-Line And Terminal Interfaces

- Run each session in a private terminal multiplexer server (for example, `tmux -L <run-id>`), so its sessions are separate from the user's and the whole server can be stopped without touching anything else.
- Type literal text with the multiplexer's literal mode, send named keys separately, and read the screen back as text after each action.
- Detect idle from the screen: the input line is empty and the program's own status line is drawn. Wait on that, not on a fixed sleep.
- Check what the helper's own keys do. A retry that presses Enter after an autocomplete can land on a screen that just opened and change a setting. Press a key again only while the typed text is still in the input line.
- Know how input is cleared: in many terminal UIs Escape closes a menu but leaves the typed text, and a clear-line key empties it.
- Keep the pane open after the program exits so its exit status can be read, and note that long lines wrap at the pane's width: assert paths and long values from files, not from the screen.
- For a short one-shot command, run it directly and save its output and exit code; use the multiplexer only for programs that need a terminal, such as confirmation prompts.

### Services And APIs

Call the documented endpoints with a plain HTTP client and save each request, status code and body. A health endpoint that only reports the process is up is not ready; call one that touches the real dependencies, or the first real endpoint. Check stored effects through a second read, not the response alone.

### Plugins Inside Another Program

When the user meets the software inside a host, such as an editor extension or a coding-agent plugin, drive the host:

- Launch the host's own pinned version (the project's dependency where there is one) with only this plugin loaded, and with the host's config, session and data folders pointed at the run's folders.
- Ready means the plugin's own marker is visible (its status line, panel or command), which proves it loaded, not only that the host started.
- List which host inputs call a model or a paid API: free text in an agent host, and any command that starts an agent turn. The helper accepts only commands known to run locally, unless the run allows paid calls.
- Commands that change settings may reload the host; wait for the reload before the next step.

### Desktop And Mobile Apps

Use the platform's automation or accessibility tools, or a simulator or emulator. When the needed tool, device or permission is unavailable, mark the feature unreachable with the exact prerequisite, rather than drive a different entry point and call it covered.

### Writing The Helper

- One script with subcommands such as launch, health check, drive, snapshot, observe, clean up and list, each shown in the guide with its invocation.
- The health check is read-only and ends in one plain pass or fail line. It checks that the process is the one the run recorded, that it runs the expected build, that it has the run's isolated folders and environment, and that it is idle.
- Clean-up stops the run's own server or processes by the IDs it recorded, waits for them to exit, removes their sockets and scratch, and leaves the evidence.
- Write for the shells the project's developers use. A shell script that must run on stock macOS works under bash 3.2 (no `mapfile`, no associative arrays) and cannot rely on `/proc`; read a process's details another way there, or record them at launch.
- Drive the helper itself through every subcommand during set-up. Bugs in the helper (idle detection, a stray key, a slow exit, leftover sockets) surface only in a real run.

## Report And Stop

Report the mode and outcome; features driven, unverified (with the reason) and unreachable (with the prerequisite and the route tried); product bugs; paid calls made and their cost; where the evidence is; and what the user must decide, such as committing the map or creating developer docs.

Stop once the report is given. Return to the claim that needed the map, if one did.
