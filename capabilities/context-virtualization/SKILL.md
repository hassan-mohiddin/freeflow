# Context Virtualization

Keep one active working set of tool evidence. Context Virtualization changes future model projection, not canonical session history.

When enabled, each resolvable tool result receives a current-session `ctx:<entryId>` reference. Every eligible result begins **Full**.

## Classify Every Consumed Result

After consuming a result, classify it silently:

- **Full:** keep the raw result while the current or next bounded activity still needs its text, images, structure, or exact evidence for inspection, comparison, quotation, derivation, or verification.
- **Retained:** archive the raw result with transformed working memory when conclusions, identifiers, constraints, provenance, or unresolved failures still matter.
- **Reference-only:** archive without retained meaning when nothing from the result needs to remain active.

When the classification is Retained or Reference-only, perform the archive transition before moving on. Do not merely classify it internally.

Treat the tool call and result as one semantic decision unit, but target the result's `ctx:` reference when archiving. Keeping a result Full requires no tool call or management commentary.

## Revisit The Working Set

A Full result is leased context, not a permanent choice. Reconsider it when the activity that needed its raw output finishes.

At task entry, resume, or a meaningful activity or route change, review visible references from completed work once and batch stale transitions. Do not wait for explicit token pressure, and do not archive to satisfy a quota.

## Preserve Sufficient Meaning

Retained meaning should preserve what later work depends on, such as:

- the relevant command, query, source, or filters;
- conclusions, identifiers, paths, line numbers, URLs, and failure states;
- provenance, uncertainty, contradictions, and unresolved next steps.

Keep as much detail as the current and next bounded activity require, but do not reproduce raw output merely because retained meaning has no fixed cap. Treat retained meaning as model-authored working memory, not verbatim source evidence. If exact content or quotation may still matter, keep the result Full.

Prefer richer retained meaning for expensive or volatile external results. Cheap live state that can be safely observed again often needs little or no retained meaning.

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

Batch related transitions when practical. Archive only references that appeared in the request just consumed; never guess or fabricate a reference.

## Recover Exact Evidence

If transformed meaning later proves insufficient, use `restore` to reverse an archived projection while its marker remains visible in active context:

```text
freeflow_context({ operation: "restore", refs: ["ctx:<entryId>"] })
```

Restore does not retrieve content removed by compaction. When Conversation History is enabled, follow its search and retrieve guidance for hidden sources. Never reconstruct exact evidence from retained meaning.
