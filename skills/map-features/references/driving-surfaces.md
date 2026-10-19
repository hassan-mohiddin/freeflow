# Driving Surfaces

Read this when choosing how to launch, drive and observe the software, and before writing the helper.

This reference is judgment: recipes to adapt, not commands to copy. Prefer the project's own harness when one exists.

## Every Surface

- **Ready means usable.** Wait for a signal that the software accepts input, such as a prompt, a rendered label, a health endpoint that checks its dependencies, or a line in a status bar, not just a live process. Seed data and migrations finish before ready.
- **Stable handles.** Drive by what a user reads: labels, accessible names, prompt text, routes, command names. Avoid coordinates, pixel positions and tab order.
- **Isolate each run.** Give it its own data folder, ports, home folder, temp folder and config, under a folder the version control ignores, so runs can work side by side and never touch the user's own state. Record the run's identity (its process IDs, the build or commit, the settings it started with) where the health check can read it.
- **No credentials by default.** Start the software with an environment built from nothing but what it needs, and its own home folder, so no API key, cloud profile or saved login can reach a paid service by accident. Pass the user's environment only to a run they agreed may make paid calls.
- **Evidence beside the run, kept apart from it.** Save each step's command, output, exit code and resulting state as numbered files, plus a log of every action with its time. Clean-up deletes the run's scratch folder, never the evidence folder.
- **Check side effects from a second view.** After an action, read the file it wrote, query the stored row, or ask the software for its state again; a success message alone proves nothing. When a safe mode such as a dry run is the path, observe what it actually skips rather than trust its name.

## Web Interfaces

Drive a browser through the host's browser tools or an automation library, with a fresh profile per run. Locate elements by role and accessible name. Capture an accessibility snapshot and a screenshot with the app's identity visible, plus the network calls or console errors the claim depends on. A local server binds a port the run chose; the health check confirms that port belongs to this run's process.

## Command-Line And Terminal Interfaces

- Run each session in a private terminal multiplexer server (for example, `tmux -L <run-id>`), so its sessions are separate from the user's and the whole server can be stopped without touching anything else.
- Type literal text with the multiplexer's literal mode, send named keys separately, and read the screen back as text after each action.
- Detect idle from the screen: the input line is empty and the program's own status line is drawn. Wait on that, not on a fixed sleep.
- Check what the helper's own keys do. A retry that presses Enter after an autocomplete can land on a screen that just opened and change a setting. Press a key again only while the typed text is still in the input line.
- Know how input is cleared: in many terminal UIs Escape closes a menu but leaves the typed text, and a clear-line key empties it.
- Keep the pane open after the program exits so its exit status can be read, and note that long lines wrap at the pane's width: assert paths and long values from files, not from the screen.
- For a short one-shot command, run it directly and save its output and exit code; use the multiplexer only for programs that need a terminal, such as confirmation prompts.

## Services And APIs

Call the documented endpoints with a plain HTTP client and save each request, status code and body. A health endpoint that only reports the process is up is not ready; call one that touches the real dependencies, or the first real endpoint. Check stored effects through a second read, not the response alone.

## Plugins Inside Another Program

When the user meets the software inside a host, such as an editor extension or a coding-agent plugin, drive the host:

- Launch the host's own pinned version (the project's dependency where there is one) with only this plugin loaded, and with the host's config, session and data folders pointed at the run's folders.
- Ready means the plugin's own marker is visible (its status line, panel or command), which proves it loaded, not only that the host started.
- List which host inputs call a model or a paid API: free text in an agent host, and any command that starts an agent turn. The helper accepts only commands known to run locally, unless the run allows paid calls.
- Commands that change settings may reload the host; wait for the reload before the next step.

## Desktop And Mobile Apps

Use the platform's automation or accessibility tools, or a simulator or emulator. When the needed tool, device or permission is unavailable, mark the feature unreachable with the exact prerequisite, rather than drive a different entry point and call it covered.

## Writing The Helper

- One script with subcommands such as launch, health check, drive, snapshot, observe, clean up and list, each shown in the guide with its invocation.
- The health check is read-only and ends in one plain pass or fail line. It checks that the process is the one the run recorded, that it runs the expected build, that it has the run's isolated folders and environment, and that it is idle.
- Clean-up stops the run's own server or processes by the IDs it recorded, waits for them to exit, removes their sockets and scratch, and leaves the evidence.
- Write for the shells the project's developers use. A shell script that must run on stock macOS works under bash 3.2 (no `mapfile`, no associative arrays) and cannot rely on `/proc`; read a process's details another way there, or record them at launch.
- Drive the helper itself through every subcommand during set-up. Bugs in the helper (idle detection, a stray key, a slow exit, leftover sockets) surface only in a real run.
