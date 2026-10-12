# Requirements: Freeflow's Tool Execution prompt sections

With Tool Execution effective, Freeflow replaces two of Pi's prompt sections and adds an environment section. Pi's preamble and every other part of the system prompt stay as Pi renders them.

1. With Tool Execution effective, Pi's `rules` section is Pi's own rendering with exactly three lines removed: "- Use read to examine files instead of cat or sed.", "- Be concise in your responses", and "- Show file paths clearly when working with files". Every other rule line stays as Pi renders it, including each tool's and extension's guidelines and edit's guidelines.
2. Pi's `docs` section is replaced by one line that points to Pi's README, docs and examples, and says they are read only when the user asks about pi itself.
3. An `environment` section gives the platform, the OS release and the shell Pi's bash uses, in the form `Platform: <platform> <release>. Shell for bash: <shell>.`. It is placed before Freeflow's guidance.
4. If Pi's shell cannot be resolved, the environment line reports the shell as `unavailable` and the request still goes out.
5. Pi's preamble is unchanged: Freeflow writes no preamble text, and the native test asserts the rendered system prompt starts with Pi's preamble.
6. Every value in these sections is fixed for the configuration and the machine. The system text and tool definitions stay identical across requests in a session, and each later request starts with everything the earlier one sent.
7. With Tool Execution off, Pi's rules, docs and sections are untouched, and no environment section is added.
