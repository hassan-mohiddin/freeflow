# Context Virtualization

Keep one active working set of tool evidence. Context Virtualization changes future model projection, not canonical session history.

When enabled, each resolvable tool result receives a current-session `ctx:<entryId>` reference and begins **Full**.

## Classify And Revisit

After consuming a result, silently classify the tool call and result as one semantic unit:

- **Full:** keep the raw result while a bounded activity, its self-review, or an expected immediate follow-up needs its text, images, structure, or exact evidence.
- **Retained:** archive the raw result with transformed working memory when conclusions, identifiers, constraints, provenance, or unresolved failures still matter.
- **Reference-only:** archive without retained meaning when nothing from the result needs to remain active.

Consumption or summarization does not end a result's usefulness. Keep governing instructions, active skill bodies, current authority and task memory, and exact or uncertain evidence Full while work still depends on them. When uncertain, keep the result Full.

Archive Retained and Reference-only results before moving on. Target the result's `ctx:` reference; keeping a result Full requires no tool call or management commentary.

Reconsider Full results when their activity finishes. At task entry, resume, or a meaningful activity or route change, review visible references from completed work once and batch related transitions when practical. Do not wait for token pressure or archive to satisfy a quota.

## Preserve Sufficient Meaning

Retained meaning must preserve what later work depends on, such as:

- the relevant command, query, source, or filters;
- conclusions, identifiers, paths, line numbers, URLs, and failure states;
- provenance, uncertainty, contradictions, and unresolved next steps.

Treat retained meaning as transformed working memory, not verbatim evidence. If exact content or quotation may still matter, keep the result Full. Prefer richer meaning for expensive or volatile external results; cheap live state that can be safely observed again often needs little or none.

## Apply Transitions

Archive reference-only:

```text
freeflow_context({ operation: "archive", targets: [{ ref: "ctx:<entryId>" }] })
```

Archive with retained meaning:

```text
freeflow_context({
  operation: "archive",
  targets: [{ ref: "ctx:<entryId>", retained: "<sufficient transformed working memory>" }],
})
```

Archive only references present in the current model-visible request; never guess or fabricate one.

For every non-`ok` transition:

- Read its reported status, reason, message, and changed references. Treat only references reported as changed as applied; never assume partial success or repeat the same request blindly.
- When the failure is safely caller-correctable, rebuild the request from currently eligible references, correct or remove invalid items, recompute retained meaning that depended on them, and retry once.
- For unavailable, unstructured, persistence-uncertain, or repeated failures, do not loop. Re-observe state when the outcome may be uncertain; otherwise report the failure and stop.

## Recover Exact Evidence

Use `restore` while an archived result's marker remains visible:

```text
freeflow_context({ operation: "restore", refs: ["ctx:<entryId>"] })
```

Restore does not retrieve content removed by compaction. When Conversation History is enabled, follow its search and retrieve guidance for hidden sources. Never reconstruct exact evidence from retained meaning.
