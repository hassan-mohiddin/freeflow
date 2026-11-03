# Ask user

The `ask_user` tool: the agent puts one to four questions to the user in a dialog, for a choice that is theirs to make, and gets their answer back as the tool result. Design: Task 002's spec; developer doc: [`dev-docs/subsystems/ask-user.md`](../../../dev-docs/subsystems/ask-user.md).

| File | Owns |
|---|---|
| [`questions.ts`](questions.ts) | The question shape (Claude Code's: header, 2-4 options with descriptions, multi-select), validation, and the text the model reads after the dialog. |
| [`form.ts`](form.ts) | The terminal dialog: tabs for several questions, options with descriptions, the user's own answer, notes, multi-select. Renders and reports; knows nothing about how answers are used. |
| [`ask.ts`](ask.ts) | Asking in whatever UI the session has: the form in the terminal, one `select` per question over RPC, unavailable without a UI; and `confirmWithUser`, the yes-or-no dialog messaging uses to ask before delivering a held message. |
| [`tool.ts`](tool.ts) | The tool: description, prompt guideline, schema, the refusal for a Cognitive Routing worker, and its one-line transcript rows. |

Tests: [`tests/ask-user/`](../../tests/ask-user/).
