# Tool Execution

Tool Execution is Freeflow's layer over Pi's own tools. It keeps Pi's `read`, `bash`, `edit`, `write`, `grep`, `find` and codemode as the working surface, and adds what Pi lacks: guidance on working in the environment, notices when files change behind the model, clearer edit errors, `apply_patch` for models trained on it, and background commands that notify the model when they exit.

It changes how a model works in the repository, not what it is allowed to do: every Freeflow tool runs through Pi's own tool path, permissions and file-mutation queue.

## Availability

- Native Pi 0.99.1 or later, including Pi 1.0.
- Disabled by default. Freeflow itself must be enabled for the repository.
- One switch turns on the whole layer: the guidance, the file tracking, the edit messages, `apply_patch` and the background commands. There are no sub-switches.

## Enabling it

Set `toolExecution.enabled` in `.freeflow/config.json` (shared) or `.freeflow/local.json` (personal), or use `/freeflow settings` and change Tool Execution in the Repository, Personal or Session scope:

```json
{
  "toolExecution": { "enabled": true }
}
```

A Session change applies to the current Pi session only and does not touch either file. Freeflow reloads its runtime after the change, or asks you to run `/reload` when the host cannot reload.

The settings of the retired v2 runtime (`capture`, `programs`, `workspace`, `discovery`, `adapters`, `accounting`) still load so existing files stay valid, and no longer do anything. Remove them when convenient.

## What the model sees

**Prompt.** With Tool Execution on, Freeflow adds a Tool Execution section after its own guidance: how to search and read narrowly, cap and save command output, run code to learn what it does, and choose an edit tool. It also states the platform, shell and OS, and removes three of Pi's generic rule lines that contradict that guidance ("Use read to examine files instead of cat or sed", "Be concise in your responses", "Show file paths clearly when working with files"). Pi's preamble, project context, skills, working directory, the user's additions and other extensions' tool guidelines stay as Pi renders them. The section is fixed for a configuration, so it does not break the prompt cache from one request to the next.

**Pi's tools stay.** Freeflow does not replace or rename any Pi tool. Calls that codemode scripts make to other tools are tracked like direct calls.

**`apply_patch`.** The patch tool OpenAI Codex trains GPT models on, ported so their patches apply the same way in Pi. GPT-5 and later models on OpenAI endpoints receive it in Codex's grammar-constrained form; other models receive a one-string function. It adds, deletes, updates and moves files, matches hunks leniently as Codex does (exact, then ignoring trailing whitespace, then surrounding whitespace, then normalized punctuation), plans every change before writing, refuses to update an existing file the model has not read, and reports each file as written, not written or failed. Pi's `edit` and `write` stay beside it.

**Background commands.** `bash_background` starts a command in the background and returns an ID and an output file at once; the model is notified once, when the command exits, and reads the output file for output so far. `stop_background` stops one. Up to 16 can run at a time. Output files are private to the session; running commands are stopped when Pi shuts down. A background command that exits while the model is idle starts a new turn so the model can react.

**File tracking.** Freeflow records what the model has read or written of each file (a content hash, or size and time for files over 8 MiB):

- `write` refuses to overwrite an existing file the model has not read in the session.
- An `edit` or `write` to a file that changed since the model read it still applies, and the result says the file had changed.
- After any other tool, and when a prompt starts, the model is told which files it read have changed or disappeared since.
- When Pi's `edit` cannot find or uniquely match the old text, the error shows the closest lines (or every matching place) and one next step.

**Shell habits.** `bash` refuses a command ending in `&` (it would keep running with no exit notice and no saved output) and a foreground `sleep` of 10 seconds or more, and points to `bash_background`.

Every Freeflow message to the model states the fact and one next step. Notices are appended to the conversation; nothing already sent is edited.

## Evidence limits

Local tests cover the tools, messages, file tracking and prompt assembly on native Pi, and live sessions on GPT-6 Luna and Sol 6.1 used `apply_patch` in its grammar form and the background commands. Whether the guidance and the two edit tools improve task results, turns, tokens or cost has not been measured; a comparison on a benchmark is planned.

## Retired

Tool Execution v2 (`freeflow_run`, `freeflow_tools`, `freeflow_search`, `freeflow_read`, the earlier `freeflow_patch`, output capture, `freeflow_result`, the Session Store, QuickJS programs, cooperating adapters and efficiency reports) has been removed. Pi 0.99 added codemode, tool exposure and saved truncated output, which cover most of it. Its source, tests and docs are kept in `.deprecated/tool-execution-v2/`.

## Related documentation

- [Pi integration](../integrations/pi.md)
- [Capabilities](README.md)
- [Compaction](compaction.md)
- [Cognitive Routing](cognitive-routing.md)
- [System prompt architecture](../../dev-docs/subsystems/prompt-assembly.md)
