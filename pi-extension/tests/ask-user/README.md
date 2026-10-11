# Ask-user tests

Tests for [`src/ask-user/`](../../src/ask-user/README.md).

| File | Covers |
|---|---|
| `ask-user.test.js` | Validation against Claude Code's shape; the text the model reads; the terminal form (one question, tabs, multi-select, own answer, notes, Submit, Esc); the RPC path; confirmations; the tool's worker refusal, schema errors and prompt guideline. |
| `session.test.js` | A real Pi session with a scripted model: the tool declared with Freeflow and not without it, its guideline in the request, the user's answer as the tool result, and the later request starting with the earlier one. |
