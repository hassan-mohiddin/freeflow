# Context Virtualization

When enabled, each resolvable tool result receives a current-session `ctx:<entryId>` reference.

## Decide after consuming a result

- Keep it full while exact text, images, comparison, quotation, derivation, or verification may still be needed.
- Archive reference-only when no detail needs to remain:
  `freeflow_context({ operation: "archive", targets: [{ ref: "ctx:<entryId>" }] })`
- Archive with concise retained meaning when later work needs conclusions, constraints, identifiers, or unresolved failures:
  `targets: [{ ref: "ctx:<entryId>", retained: "..." }]`
- Treat retained meaning as working memory, not verbatim evidence; do not copy raw output or invent facts.
- Batch related decisions, and archive only references present in the request just consumed.
- Use `restore` to reverse projection. It does not retrieve content removed by compaction.
- Archiving changes future projections; canonical session history remains unchanged.
