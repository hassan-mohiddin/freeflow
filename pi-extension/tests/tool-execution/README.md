# Tool Execution tests

Tests for [`src/tool-execution/`](../../src/tool-execution/README.md).

| File | Covers |
|---|---|
| `prompt-native.test.js` | The system prompt sections: with Tool Execution on, Freeflow's rules, docs and environment sections; with it off, Pi's prompt untouched. |
| `file-state.test.js` | Observations: when a file counts as changed, and rebuilding state from session history. |
| `file-tracking-native.test.js` | `write` refuses to overwrite a file never read; an edit to a file changed since it was read applies and says so once. |
| `skill-reads.test.js` | Repeat reads of Freeflow instruction files: which paths count, the same, changed and partial text, a file that lost lines, truncated, failed, nested and image reads, rebuild from the branch, compactions, a selective view, and rebuild after resume. |
| `skill-reads-native.test.js` | Against Pi's real `read` of a shipped skill: a repeat read returns one line, the Runtime State names the skill from the next prompt on (not mid-run), Pi's own compaction lets the text through and names the skill in its summary, and a Coordinator gets the text again under projection and the line without it. |
| `changed-files-native.test.js` | A command that changes a file the model read says so once, on its own result. |
| `apply-patch.test.js` | The parser and matcher against Codex's grammar, lenient forms, and error messages. |
| `apply-patch-native.test.js` | `apply_patch` is declared only while Tool Execution is on, identically in every request; GPT-5+ models get the grammar form. |
| `background.test.js` | Background commands: the 16-command limit, exit codes, `stop_background`, and stopping everything at session end. |
| `monitor.test.js` | Monitors through a real inbound channel: batched stdout events, stderr kept in the file, the end notice last, timeout, rate limit, stop, restatement and the line cap. |
| `background-native.test.js` | Background tools declared only while Tool Execution is on; exit notices and monitor events reaching the model in a real session. |
| `bash-guard.test.js` | A trailing `&` or a long foreground `sleep` is refused; ordinary commands are not. |

Background-command tests start real short shell commands (`sleep`, `echo`) and wait for them, so they take a few seconds.
