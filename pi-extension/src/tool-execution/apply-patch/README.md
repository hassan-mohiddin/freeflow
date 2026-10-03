# apply_patch

The patch-editing tool GPT models are trained on in OpenAI Codex, ported so their patches apply the same way in Pi. Pi's own `edit` and `write` stay available beside it.

| File | Owns |
|---|---|
| [`grammar.ts`](grammar.ts) | The tool's Lark grammar, byte-identical to Codex's. GPT-5+ models on OpenAI endpoints get the tool in this grammar-constrained form; other models get a one-string function. |
| [`parser.ts`](parser.ts) | Parses a patch into add, delete, update, and move operations, including Codex's lenient forms. |
| [`match.ts`](match.ts) | Finds a hunk's lines in a file with Codex's four passes: exact, ignoring trailing whitespace, ignoring surrounding whitespace, then normalized Unicode punctuation and spaces. |
| [`plan.ts`](plan.ts) | Plans all changes, refuses to add over an existing file the model has not read, then writes through Pi's file-mutation queue and reports each file's outcome (written, not written, failed). |
| [`tool.ts`](tool.ts) | Registers the tool and formats results as Codex does, so models read the summary they were trained on. |

## Provenance and license

`grammar.ts`, `parser.ts` and `match.ts` port code from [openai/codex](https://github.com/openai/codex) at commit `bcd6d9ab` (`codex-rs/apply-patch`, `codex-rs/core/assets/tools/apply_patch.lark`), Copyright 2025 OpenAI, under the Apache License 2.0. Keep the grammar byte-identical to upstream, and record the upstream commit when porting a change.

Tests: [`tests/tool-execution/apply-patch.test.js`](../../../tests/tool-execution/apply-patch.test.js) and `apply-patch-native.test.js`.
